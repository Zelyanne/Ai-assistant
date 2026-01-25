import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { supabase } from './services/supabase.js';
import { graph } from './controller/graph.js';
import { Task } from '@ai-assistant/shared';
import { storeWorkspaceTokens } from './services/tokenService.js';
import { GoogleIngestionService } from './services/google.js';

const app = express();
const port = config.PORT;

app.use(cors());
app.use(express.json());

// Health check endpoint for Hetzner
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Token encryption and storage endpoint
app.post('/api/tokens', async (req, res) => {
  const { organizationId, userId, provider, tokens } = req.body;

  if (!organizationId || !userId || !provider || !tokens) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = await storeWorkspaceTokens(organizationId, userId, provider, tokens);

  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

const server = app.listen(port, () => {
  console.log(`Agent Controller listening at http://localhost:${port}`);
});

// --- Task Subscriber Integration ---

const taskChannel = supabase
  .channel('public:tasks')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'tasks',
      filter: 'status=eq.queued'
    },
    async (payload) => {
      const task = payload.new as Task;
      console.log(`[Realtime] New task detected: ${task.id} (${task.domain_action})`);
      
      try {
        await graph.invoke({ task });
      } catch (error) {
        console.error(`[Realtime] Graph execution failed for task ${task.id}:`, error);
      }
    }
  )
  .subscribe((status) => {
    console.log(`[Realtime] Subscription status: ${status}`);
  });

// --- Ingestion Service ---
const googleIngestion = new GoogleIngestionService();

// Run ingestion every 15 minutes
const INGESTION_INTERVAL = 15 * 60 * 1000;
const ingestionIntervalId = setInterval(() => {
  console.log('Periodic ingestion started...');
  googleIngestion.runAllIngestions().catch(err => {
    console.error('Scheduled ingestion failed:', err);
  });
}, INGESTION_INTERVAL);

// Initial run on start
googleIngestion.runAllIngestions().catch(err => {
  console.error('Initial ingestion failed:', err);
});

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  console.log(`\n[Shutdown] Received ${signal}. Cleaning up...`);
  
  clearInterval(ingestionIntervalId);
  
  await taskChannel.unsubscribe();
  console.log('[Shutdown] Unsubscribed from Realtime');
  
  server.close(() => {
    console.log('[Shutdown] HTTP server closed');
    process.exit(0);
  });

  // Force exit if not closed in 10s
  setTimeout(() => {
    console.error('[Shutdown] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('AI Assistant Agent initialized and monitoring tasks...');
