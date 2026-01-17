import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graph } from './graph.js';
import { supabase } from '../services/supabase.js';

// Mock Config
vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    MISTRAL_API_KEY: 'mock-mistral-key'
  }
}));

// Mock Supabase
const mockChain = {
  update: vi.fn(() => mockChain),
  insert: vi.fn(() => mockChain),
  eq: vi.fn(() => Promise.resolve({ error: null }))
};

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

describe('Agent Controller Graph Routing', () => {
  const baseTask = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'queued',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route email.draft to EmailDraftProcessor', async () => {
    const mockTask = { ...baseTask, domain_action: 'email.draft', payload: {} };
    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Email draft created');
  });

  it('should route calendar.create to CalendarCreateProcessor', async () => {
    const mockTask = { ...baseTask, domain_action: 'calendar.create', payload: {} };
    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Calendar event created');
  });

  it('should route system.analyze to SystemAnalyzeProcessor', async () => {
    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };
    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBeUndefined();
    // SystemAnalyzeProcessor returns Mistral response
    expect(result.result.choices).toBeDefined();
  });

  it('should handle unsupported domain.action', async () => {
    const mockTask = { ...baseTask, domain_action: 'unknown.action', payload: {} };
    const result = await graph.invoke({ task: mockTask as any });

    expect(result.error).toBe('Unsupported domain.action: unknown.action');
  });
});
