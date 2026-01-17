import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for variables used in vi.mock factories
const mocks = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  update: vi.fn().mockResolvedValue({ error: null }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  threadsList: vi.fn().mockResolvedValue({ data: { threads: [{ id: 't1' }] } }),
  threadsGet: vi.fn().mockResolvedValue({ 
    data: { 
      id: 't1',
      snippet: 'test snippet', 
      messages: [{ payload: { headers: [{ name: 'Subject', value: 'Test Subject' }] } }] 
    } 
  }),
  eventsList: vi.fn().mockResolvedValue({ data: { items: [{ id: 'e1', summary: 'Test Event' }] } }),
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mocks.select,
      eq: mocks.eq,
      update: vi.fn().mockReturnThis(),
      upsert: mocks.upsert,
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

vi.mock('@ai-assistant/shared', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted-token'),
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

  it('should process integrations and perform ingestion', async () => {
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
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ 
        external_id: 't1', 
        subject: 'Test Subject',
        user_id: 'user-1'
      }),
      expect.any(Object)
    );

    // Verify Calendar ingestion
    expect(mocks.eventsList).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 5 }));
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ 
        external_id: 'e1', 
        title: 'Test Event',
        user_id: 'user-1'
      }),
      expect.any(Object)
    );
  });
});
