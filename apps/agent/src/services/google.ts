import { google } from 'googleapis';
import { supabase } from './supabase.js';
import { decrypt } from '@ai-assistant/shared';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '';
const DEFAULT_MAX_RESULTS = parseInt(process.env.INGESTION_MAX_RESULTS || '20', 10);

export class GoogleIngestionService {
  private maxResults: number;

  constructor(maxResults: number = DEFAULT_MAX_RESULTS) {
    this.maxResults = maxResults;
  }

  async runAllIngestions() {
    const { data: integrations, error } = await supabase
      .from('workspace_integrations')
      .select('*')
      .eq('provider', 'google');

    if (error) {
      console.error('Error fetching integrations:', error);
      return;
    }

    // Process sequentially to manage resource usage, but could be parallelized now
    for (const integration of integrations) {
      await this.ingestForOrganization(integration);
    }
  }

  private async ingestForOrganization(integration: any) {
    try {
      console.log(`Starting ingestion for organization: ${integration.organization_id}`);
      
      const creds = integration.encrypted_creds as any;
      if (!creds.refresh_token) {
        console.warn(`No refresh token for org ${integration.organization_id}`);
        return;
      }

      const refreshToken = decrypt(creds.refresh_token, ENCRYPTION_SECRET);
      
      // Create a fresh client for this execution context to avoid race conditions
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Fetch Gmail threads
      await this.ingestGmail(integration.organization_id, integration.user_id, oauth2Client);
      
      // Fetch Calendar events
      await this.ingestCalendar(integration.organization_id, integration.user_id, oauth2Client);

      // Update sync status
      await supabase
        .from('workspace_integrations')
        .update({ 
          sync_status: 'idle', 
          last_sync_at: new Date().toISOString() 
        })
        .eq('id', integration.id);

    } catch (err) {
      console.error(`Ingestion failed for org ${integration.organization_id}:`, err);
      await supabase
        .from('workspace_integrations')
        .update({ sync_status: 'error' })
        .eq('id', integration.id);
    }
  }

  private async ingestGmail(organizationId: string, userId: string | null, auth: any) {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.threads.list({ userId: 'me', maxResults: this.maxResults });
    
    const threads = res.data.threads || [];
    for (const thread of threads) {
      try {
        const details = await gmail.users.threads.get({ userId: 'me', id: thread.id! });
        const snippet = details.data.snippet;
        const subject = details.data.messages?.[0].payload?.headers?.find(h => h.name === 'Subject')?.value;

        await supabase.from('ingested_threads').upsert({
          organization_id: organizationId,
          user_id: userId,
          external_id: thread.id!,
          subject: subject || 'No Subject',
          summary: snippet,
          metadata: { thread_raw: details.data } as any,
          updated_at: new Date().toISOString()
        } as any, { onConflict: 'organization_id,external_id' });
      } catch (err) {
        console.error(`Failed to ingest Gmail thread ${thread.id} for org ${organizationId}:`, err);
      }
    }
  }

  private async ingestCalendar(organizationId: string, userId: string | null, auth: any) {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: this.maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];
    for (const event of events) {
      try {
        await supabase.from('calendar_events').upsert({
          organization_id: organizationId,
          user_id: userId,
          external_id: event.id!,
          title: event.summary,
          description: event.description,
          start_time: event.start?.dateTime || event.start?.date,
          end_time: event.end?.dateTime || event.end?.date,
          location: event.location,
          metadata: { event_raw: event } as any,
          updated_at: new Date().toISOString()
        } as any, { onConflict: 'organization_id,external_id' });
      } catch (err) {
        console.error(`Failed to ingest Calendar event ${event.id} for org ${organizationId}:`, err);
      }
    }
  }
}
