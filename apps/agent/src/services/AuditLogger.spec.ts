import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from './AuditLogger.js';
import { supabase } from './supabase.js';

// Mock Supabase
const mockInsert = vi.fn();
vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}));

describe('AuditLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('should create a valid reasoning step', () => {
    const step = AuditLogger.createStep('Test Step', 'Test Message', { confidence_score: 0.95 });
    
    expect(step).toHaveProperty('timestamp');
    expect(step.step_name).toBe('Test Step');
    expect(step.message).toBe('Test Message');
    expect(step.confidence_score).toBe(0.95);
  });

  it('should create a valid citation', () => {
    const citation = AuditLogger.createCitation('email', '123', 'Referenced email', 'https://mail.google.com/123');
    
    expect(citation.source_type).toBe('email');
    expect(citation.source_id).toBe('123');
    expect(citation.description).toBe('Referenced email');
    expect(citation.link).toBe('https://mail.google.com/123');
  });

  it('should flush logs to Supabase correctly', async () => {
    const trace = [AuditLogger.createStep('Step 1', 'Message 1')];
    const citations = [AuditLogger.createCitation('doc', 'd1', 'desc')];
    
    await AuditLogger.flush(
      'org-123',
      'task-456',
      'agent-789',
      'task_completed',
      trace,
      citations
    );

    expect(supabase.from).toHaveBeenCalledWith('agent_activity_log');
    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: 'org-123',
      task_id: 'task-456',
      agent_id: 'agent-789',
      action_taken: 'task_completed',
      reasoning_trace: trace,
      citations: citations
    });
  });

  it('should throw error if Supabase insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'DB Error' } });

    await expect(
      AuditLogger.flush('org', 'task', 'agent', 'action', [], [])
    ).rejects.toThrow('Audit logging failed: DB Error');
  });
});
