import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { supabase } from './services/supabase.js';
import { Task } from '@ai-assistant/shared';
import { storeWorkspaceTokens } from './services/tokenService.js';
import { GoogleIngestionService } from './services/google.js';
import { googleAuthService } from './services/googleAuth.js';
import { briefingScheduler } from './services/BriefingScheduler.js';
import { relancingScheduler } from './services/RelancingScheduler.js';
import { initOTel, shutdownOTel } from './services/llm/otel-setup.js';
import { telegramWebhookRouter } from './routes/webhooks/telegram.js';
import { whatsAppWebhookRouter } from './routes/webhooks/whatsapp.js';
import { processQueuedTask } from './services/taskSubscriber.js';

// Initialize OpenTelemetry
if (config.ENABLE_LANGFUSE_TRACING) {
  initOTel();
}

const app = express();

// Ensure req.protocol/req.ip reflect proxy headers when deployed behind load balancers.
app.set('trust proxy', true);

const port = config.PORT;

app.use(cors());

const captureRawBody = (req: express.Request & { rawBody?: string }, _res: unknown, buf: Buffer): void => {
  req.rawBody = buf.toString('utf-8');
};

app.use(express.json({
  verify: (req, res, buf) => captureRawBody(req as express.Request & { rawBody?: string }, res, buf),
}));
app.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => captureRawBody(req as express.Request & { rawBody?: string }, res, buf),
}));

// Health check endpoint for Hetzner
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/webhooks/telegram', telegramWebhookRouter);
app.use('/webhooks/whatsapp', whatsAppWebhookRouter);

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

// Google OAuth Routes
app.get('/api/auth/google/url', (req, res) => {
  const { organizationId, userId } = req.query;
  
  if (!organizationId || !userId) {
    return res.status(400).json({ error: 'Missing organizationId or userId' });
  }

  const state = Buffer.from(JSON.stringify({ organizationId, userId })).toString('base64');
  const url = googleAuthService.getAuthUrl(state);
  res.json({ url });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  try {
    const { organizationId, userId } = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { tokens } = await googleAuthService.exchangeCodeForTokens(code as string);

    if (!tokens.refresh_token) {
      return res.status(400).send('No refresh token received. Please disconnect and reconnect the app in Google Security settings.');
    }

    const result = await storeWorkspaceTokens(organizationId, userId, 'google', {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    });

    if (result.success) {
      res.send('Successfully connected to Google Workspace! You can close this window.');
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/labels', async (req, res) => {
  const organizationId = req.query.organizationId as string;
  
  if (!organizationId) {
    return res.status(400).json({ error: 'Missing organizationId' });
  }

  try {
    const { data: integration, error } = await supabase
      .from('workspace_integrations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'google')
      .single();

    if (error || !integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const labels = await googleIngestion.fetchGmailLabels(integration);
    res.json({ labels });
  } catch (err: any) {
    console.error('Error fetching Gmail labels:', err);
    res.status(500).json({ error: err.message });
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
      await processQueuedTask(task);
    }
  )
  .subscribe((status, err) => {
    if (err) {
      console.error('[Realtime] Subscription error object:', JSON.stringify(err, null, 2));
    }
    console.log(`[Realtime] Subscription status: ${status}${err ? ` - Error: ${err.message}` : ''}`);
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

// --- Briefing Scheduler ---
briefingScheduler.start();

// --- Relancing Scheduler ---
relancingScheduler.start();

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  console.log(`\n[Shutdown] Received ${signal}. Cleaning up...`);
  
  clearInterval(ingestionIntervalId);
  briefingScheduler.stop();
  relancingScheduler.stop();
  
  if (config.ENABLE_LANGFUSE_TRACING) {
    await shutdownOTel();
  }
  
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
