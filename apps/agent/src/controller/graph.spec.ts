import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graph } from './graph.js';

// Mock Config
vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    MISTRAL_API_KEY: 'mock-mistral-key'
  }
}));

// Mock Supabase
const mockChain: any = {
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve({ data: { tier: 'Public' }, error: null })),
  then: vi.fn((resolve) => resolve({ data: null, error: null }))
};

// Ensure eq always returns mockChain to allow chaining
mockChain.eq.mockReturnValue(mockChain);

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => mockChain)
  }
}));

// Mock Mistral
vi.mock('mistralai', () => ({
  Mistral: class {
    chat = {
      complete: vi.fn(() => Promise.resolve({
        choices: [{ message: { content: 'Mocked response' } }]
      }))
    };
  }
}));

// Mock MCPService to avoid subprocess spawning during graph tests
vi.mock('../services/mcp.js', () => ({
  MCPService: class {
    executeTool = vi.fn().mockResolvedValue({ message: 'Success' });
  }
}));

describe('Agent Controller Graph Routing', () => {
  const baseTask = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'queued',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default chain behavior
    mockChain.update.mockReturnThis();
    mockChain.insert.mockReturnThis();
    mockChain.select.mockReturnThis();
    mockChain.eq.mockReturnThis();
    mockChain.single.mockResolvedValue({ data: { tier: 'Public' }, error: null });
    
    // Mock then for promise-like behavior in updates/inserts
    mockChain.then.mockImplementation((resolve: any) => resolve({ data: null, error: null }));
  });

  it('should route email.draft to EmailDraftProcessor', async () => {
    const mockTask = { 
      ...baseTask, 
      domain_action: 'email.draft', 
      payload: { recipient: 'test@example.com', subject: 'Test', body: 'Hello' } 
    };
    
    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Email draft created');
  });

  it('should route calendar.create to CalendarCreateProcessor', async () => {
    const mockTask = { 
      ...baseTask, 
      domain_action: 'calendar.create', 
      payload: { summary: 'Meeting', startTime: '2026-01-18T10:00:00Z', endTime: '2026-01-18T11:00:00Z' } 
    };

    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Calendar event created');
  });

  it('should route system.analyze to SystemAnalyzeProcessor', async () => {
    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };

    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    expect(result.result.choices).toBeDefined();
  });

  it('should handle unsupported domain.action', async () => {
    const mockTask = { ...baseTask, domain_action: 'unknown.action', payload: {} };

    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBe('Unsupported domain.action: unknown.action');
  });

  it('should escalate to user when agency tier is Restricted', async () => {
    const mockTask = { ...baseTask, domain_action: 'email.draft', payload: { sensitive: 'data' } };
    
    // Mock Restricted tier
    mockChain.single.mockResolvedValueOnce({ data: { tier: 'Restricted' }, error: null });

    const result = await graph.invoke({ task: mockTask as any });

    expect(result.task.status).toBe('escalation');
    expect(result.error).toContain('Action requires Public tier, but topic is Restricted');
  });
});
