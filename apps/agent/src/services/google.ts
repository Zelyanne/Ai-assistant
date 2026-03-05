import { google } from 'googleapis';
import { supabase } from './supabase.js';
import { decrypt, encrypt } from '@ai-assistant/shared/utils/encryption.js';
import { config } from '../config/index.js';
import TurndownService from 'turndown';

const ENCRYPTION_SECRET = config.ENCRYPTION_SECRET;
const DEFAULT_MAX_RESULTS = parseInt(process.env.INGESTION_MAX_RESULTS || '20', 10);
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

export class GoogleIngestionService {
  private maxResults: number;
  private turndownService: TurndownService;

  constructor(maxResults: number = DEFAULT_MAX_RESULTS) {
    this.maxResults = maxResults;
    this.turndownService = new TurndownService();
  }

  async runAllIngestions() {
    const { data: integrations, error } = await supabase
      .from('workspace_integrations')
      .select('*')
      .eq('provider', 'google');

    if (error) {
      const errorCode = (error as { code?: string } | null)?.code;
      if (errorCode === 'PGRST205') {
        console.error(
          "Error fetching integrations: missing table 'public.workspace_integrations'. Apply migrations from supabase/migrations to your Supabase project."
        );
      } else {
        console.error('Error fetching integrations:', error);
      }
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
      
      const oauth2Client = this.getAuthClient(integration);

      // Fetch Gmail threads
      // AC 3.3: Respect label preferences
      // AC 3.5: If empty, ingest all (backward compatible)
      const labelPreferences = integration.label_preferences || [];
      await this.ingestGmail(integration.organization_id, integration.user_id, oauth2Client, labelPreferences);
      
      // Fetch Calendar events
      await this.ingestCalendar(integration.organization_id, integration.user_id, oauth2Client);

      // CRITICAL: Trigger email triage after ingestion
      await this.triggerEmailTriage(integration.organization_id, integration.user_id);

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

  private getAuthClient(integration: any) {
    const creds = integration.encrypted_creds as any;
    if (!creds.refresh_token) {
      throw new Error(`No refresh token for org ${integration.organization_id}`);
    }

    const refreshToken = decrypt(creds.refresh_token, ENCRYPTION_SECRET);
    
    // Create a fresh client for this execution context to avoid race conditions
    const oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_OAUTH_CLIENT_ID,
      config.GOOGLE_OAUTH_CLIENT_SECRET,
      config.GOOGLE_OAUTH_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    return oauth2Client;
  }

  /**
   * Fetches available Gmail labels for the integration.
   * Used by Settings UI to allow users to select which labels to ingest.
   */
  public async fetchGmailLabels(integration: any) {
    const auth = this.getAuthClient(integration);
    const gmail = google.gmail({ version: 'v1', auth });
    // Cache control is handled by the caller or UI (Vue Query)
    const res = await gmail.users.labels.list({ userId: 'me' });
    return res.data.labels?.map(l => ({
      id: l.id!,
      name: l.name!,
      type: l.type!
    })) || [];
  }

  /**
   * Triggers the email triage processor after ingestion completes.
   * This ensures all newly ingested emails are classified.
   */
  private async triggerEmailTriage(organizationId: string, userId: string | null) {
    try {
      const { error } = await supabase.from('tasks').insert({
        organization_id: organizationId,
        user_id: userId,
        domain_action: 'email.triage',
        status: 'queued',
        payload: {},
        created_at: new Date().toISOString()
      } as any);

      if (error) {
        console.error(`Failed to queue triage task for org ${organizationId}:`, error);
      } else {
        console.log(`Queued email.triage task for org ${organizationId}`);
      }
    } catch (err) {
      console.error(`Error triggering triage for org ${organizationId}:`, err);
    }
  }

  private async ingestGmail(organizationId: string, userId: string | null, auth: any, labelIds: string[] = []) {
    const gmail = google.gmail({ version: 'v1', auth });
    
    const params: any = { userId: 'me', maxResults: this.maxResults };
    if (labelIds.length > 0) {
      params.labelIds = labelIds;
    }

    try {
      const res = await this.retryOperation(() => gmail.users.threads.list(params));
      const threads = res.data.threads || [];
      
      for (const thread of threads) {
        try {
          const details = await this.retryOperation(() => gmail.users.threads.get({ userId: 'me', id: thread.id! }));
          const snippet = details.data.snippet;
          const messages = details.data.messages || [];
          
          // Use the last message in thread for subject and body (most recent)
          const lastMessage = messages[messages.length - 1];
          const headers = lastMessage?.payload?.headers;
          const subject = headers?.find(h => h.name === 'Subject')?.value;
          
          // Extract body
          let body = '';
          let isTruncated = false;
          
          if (lastMessage?.payload) {
             const extractedHtml = this.extractBodyFromPayload(lastMessage.payload);
             if (extractedHtml) {
               body = this.turndownService.turndown(extractedHtml);
             }
          }

          // Truncate if too large
          if (body.length > MAX_BODY_SIZE) {
            body = body.substring(0, MAX_BODY_SIZE);
            isTruncated = true;
          }

          // Encrypt body if present
          let encryptedBody = null;
          if (body) {
             // Encryption happens synchronously here, but in production with high volume 
             // we might want to offload this. For now, it's fast enough for text < 1MB.
             encryptedBody = encrypt(body, ENCRYPTION_SECRET);
          }

          await supabase.from('ingested_threads').upsert({
            organization_id: organizationId,
            user_id: userId,
            external_id: thread.id!,
            subject: subject || 'No Subject',
            summary: snippet,
            body: encryptedBody,
            metadata: { 
              thread_raw: details.data,
              is_truncated: isTruncated
            } as any,
            updated_at: new Date().toISOString()
          } as any, { onConflict: 'organization_id,external_id' });
        } catch (err) {
          console.error(`Failed to ingest Gmail thread ${thread.id} for org ${organizationId}:`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to list threads for org ${organizationId}:`, err);
    }
  }

  private extractBodyFromPayload(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          return Buffer.from(part.body?.data || '', 'base64url').toString('utf-8');
        }
        if (part.mimeType === 'text/plain') {
          // If we find plain text, we can use it, but keep looking for HTML as it might have more structure
          // For now, let's prefer HTML if available, or recurse
          return Buffer.from(part.body?.data || '', 'base64url').toString('utf-8');
        }
        if (part.parts) {
          const result = this.extractBodyFromPayload(part);
          if (result) return result;
        }
      }
    }
    return '';
  }

  private async retryOperation<T>(operation: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
    try {
      return await operation();
    } catch (err: any) {
      if (retries > 0 && (err.code === 429 || err.code >= 500)) {
        console.warn(`API rate limit or server error. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryOperation(operation, retries - 1, delay * 2);
      }
      throw err;
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
