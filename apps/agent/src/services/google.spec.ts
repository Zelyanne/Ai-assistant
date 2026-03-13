import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for variables used in vi.mock factories
const mocks = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  update: vi.fn().mockResolvedValue({ error: null }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  insert: vi.fn().mockResolvedValue({ error: null }),
  threadsList: vi.fn().mockResolvedValue({ data: { threads: [{ id: 't1' }] } }),
  threadsGet: vi.fn().mockResolvedValue({ 
    data: { 
      id: 't1',
      snippet: 'test snippet', 
      messages: [{ 
        payload: { 
          headers: [{ name: 'Subject', value: 'Test Subject' }],
          body: { data: Buffer.from('<h1>Hello World</h1>').toString('base64url') }
        } 
      }] 
    } 
  }),
  labelsList: vi.fn().mockResolvedValue({ data: { labels: [{ id: 'l1', name: 'Inbox', type: 'system' }] } }),
  eventsList: vi.fn().mockResolvedValue({ data: { items: [{ id: 'e1', summary: 'Test Event' }] } }),
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mocks.select,
      eq: mocks.eq,
      update: vi.fn().mockReturnThis(),
      upsert: mocks.upsert,
      insert: mocks.insert,
    })),
  },
}));

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: function() {
          return {
            setCredentials: vi.fn(),
          };
        },
      },
      gmail: vi.fn().mockReturnValue({
        users: {
          labels: {
            list: mocks.labelsList,
          },
          threads: {
            list: mocks.threadsList,
            get: mocks.threadsGet,
          },
        },
      }),
      calendar: vi.fn().mockReturnValue({
        events: {
          list: mocks.eventsList,
        },
      }),
    },
  };
});

vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted-token'),
  encrypt: vi.fn().mockReturnValue('encrypted-body'),
}));

import { GoogleIngestionService } from './google.js';
import { supabase } from './supabase.js';

describe('GoogleIngestionService', () => {

  let service: GoogleIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleIngestionService(5);
    
    // Default mock implementation for supabase chain
    mocks.select.mockReturnThis();
    mocks.eq.mockResolvedValue({ data: [], error: null });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('should initialize correctly', () => {
    expect(service).toBeDefined();
  });

  it('should attempt to fetch integrations from supabase', async () => {
    mocks.eq.mockResolvedValueOnce({ data: [], error: null });

    await service.runAllIngestions();
    expect(supabase.from).toHaveBeenCalledWith('workspace_integrations');
  });

  it('should process integrations and perform ingestion with body extraction', async () => {
    const mockIntegration = {
      id: 'int-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      encrypted_creds: { refresh_token: 'enc-refresh' }
    };
    
    mocks.eq.mockResolvedValueOnce({ data: [mockIntegration], error: null });
    
    // Mock the update call for sync status
    const mockUpdateObj = {
      eq: vi.fn().mockResolvedValue({ error: null })
    };
    (supabase.from('workspace_integrations').update as any).mockReturnValue(mockUpdateObj);

    await service.runAllIngestions();

    // Verify Gmail ingestion
    expect(mocks.threadsList).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 5 }));
    expect(mocks.threadsGet).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    
    // Check if upsert was called with encrypted body
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ 
        external_id: 't1', 
        subject: 'Test Subject',
        user_id: 'user-1',
        body: 'encrypted-body', // AC 2.1
        metadata: expect.objectContaining({ is_truncated: false })
      }),
      expect.any(Object)
    );
  });

  it('should filter gmail ingestion by label preferences', async () => {
    const mockIntegration = {
      id: 'int-2',
      organization_id: 'org-2',
      user_id: 'user-2',
      encrypted_creds: { refresh_token: 'enc-refresh' },
      label_preferences: ['INBOX', 'IMPORTANT']
    };
    
    mocks.eq.mockResolvedValueOnce({ data: [mockIntegration], error: null });
    
    const mockUpdateObj = {
      eq: vi.fn().mockResolvedValue({ error: null })
    };
    (supabase.from('workspace_integrations').update as any).mockReturnValue(mockUpdateObj);

    await service.runAllIngestions();

    expect(mocks.threadsList).toHaveBeenCalledWith(expect.objectContaining({ 
      labelIds: ['INBOX', 'IMPORTANT'],
      maxResults: 5 
    }));
  });

  it('should fetch gmail labels', async () => {
    const mockIntegration = {
      encrypted_creds: { refresh_token: 'enc-refresh' }
    };

    const labels = await service.fetchGmailLabels(mockIntegration);
    
    expect(mocks.labelsList).toHaveBeenCalled();
    expect(labels).toEqual([{ id: 'l1', name: 'Inbox', type: 'system' }]);
  });
  
  it('should truncate large bodies', async () => {
    // Override threadsList to return t2
    mocks.threadsList.mockResolvedValueOnce({ data: { threads: [{ id: 't2' }] } });

    // Override threadsGet for this test to return huge body
    const hugeBody = 'a'.repeat(1024 * 1024 + 100); // > 1MB
    mocks.threadsGet.mockResolvedValueOnce({
        data: {
            id: 't2',
            snippet: 'large thread',
            messages: [{
                payload: {
                    headers: [{ name: 'Subject', value: 'Large Thread' }],
                    body: { data: Buffer.from(hugeBody).toString('base64url') }
                }
            }]
        }
    });

    const mockIntegration = {
        id: 'int-3',
        organization_id: 'org-3',
        user_id: 'user-3',
        encrypted_creds: { refresh_token: 'enc-refresh' }
      };
      
    mocks.eq.mockResolvedValueOnce({ data: [mockIntegration], error: null });
    (supabase.from('workspace_integrations').update as any).mockReturnValue({ eq: vi.fn() });
  
    await service.runAllIngestions();
    
    expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
            external_id: 't2',
            metadata: expect.objectContaining({ is_truncated: true }) // AC 2.2
        }),
        expect.any(Object)
    );
  });

  it('should fetch thread details with bounded concurrency', async () => {
    const threadIds = ['c1', 'c2', 'c3', 'c4'];
    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    mocks.threadsList.mockResolvedValueOnce({
      data: {
        threads: threadIds.map((id) => ({ id })),
      },
    });

    mocks.threadsGet.mockImplementation(async ({ id }: { id: string }) => {
      activeRequests += 1;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);

      await new Promise((resolve) => setTimeout(resolve, 5));

      activeRequests -= 1;
      return {
        data: {
          id,
          snippet: `snippet-${id}`,
          messages: [
            {
              payload: {
                headers: [{ name: 'Subject', value: `Subject ${id}` }],
                body: {
                  data: Buffer.from('<p>Hello</p>').toString('base64url'),
                },
              },
            },
          ],
        },
      };
    });

    const mockIntegration = {
      id: 'int-concurrency',
      organization_id: 'org-concurrency',
      user_id: 'user-concurrency',
      encrypted_creds: { refresh_token: 'enc-refresh' },
    };

    mocks.eq.mockResolvedValueOnce({ data: [mockIntegration], error: null });

    const concurrentService = new GoogleIngestionService(10, 2);
    await concurrentService.runAllIngestions();

    expect(maxConcurrentRequests).toBeLessThanOrEqual(2);
    expect(mocks.threadsGet).toHaveBeenCalledTimes(threadIds.length);
  });

  it('should preserve retry behavior for retryable errors', async () => {
    const retryableOperation = vi
      .fn()
      .mockRejectedValueOnce({ code: 429 })
      .mockResolvedValueOnce('ok');

    await expect(
      // @ts-expect-error - testing private helper behavior intentionally
      service.retryOperation(retryableOperation, 1, 1),
    ).resolves.toBe('ok');

    expect(retryableOperation).toHaveBeenCalledTimes(2);
  });

  it('should include thread id in per-thread ingestion error logs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mocks.threadsList.mockResolvedValueOnce({
      data: { threads: [{ id: 'bad-thread' }] },
    });
    mocks.threadsGet.mockRejectedValueOnce({ code: 400, message: 'bad request' });

    const mockIntegration = {
      id: 'int-log',
      organization_id: 'org-log',
      user_id: 'user-log',
      encrypted_creds: { refresh_token: 'enc-refresh' },
    };

    mocks.eq.mockResolvedValueOnce({ data: [mockIntegration], error: null });

    await service.runAllIngestions();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to ingest Gmail thread bad-thread for org org-log:'),
      expect.anything(),
    );

    consoleErrorSpy.mockRestore();
  });
});
