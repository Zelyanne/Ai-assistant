import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemAnalyzeProcessor } from './SystemAnalyzeProcessor.js';
import { Task } from '@ai-assistant/shared';

// Mock dependencies
const mockSupabaseInsert = vi.fn();
const mockSupabase = {
  from: vi.fn(() => ({
    insert: mockSupabaseInsert.mockResolvedValue({ error: null })
  }))
};

vi.mock('../services/supabase.js', () => ({
  supabase: mockSupabase
}));

vi.mock('../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'mock-key'
  }
}));

// Mock PerimeterGuard
const mockRedact = vi.fn();
vi.mock('../guards/PerimeterGuard.js', () => ({
  PerimeterGuard: class {
    redactPIIWithMetadata = mockRedact;
  }
}));

// Mock Mistral
const mockChatComplete = vi.fn();
vi.mock('mistralai', () => ({
  Mistral: class {
    chat = {
      complete: mockChatComplete
    }
  }
}));

describe('SystemAnalyzeProcessor', () => {
  let processor: SystemAnalyzeProcessor;
  const baseTask: Task = {
    id: '123',
    organization_id: 'org1',
    domain_action: 'system.analyze',
    status: 'processing',
    payload: { prompt: 'Hello world' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SystemAnalyzeProcessor();
    // Default mocks
    mockRedact.mockReturnValue({ redactedText: 'Hello world', replacementCount: 0 });
    mockChatComplete.mockResolvedValue({ choices: [{ message: { content: 'Response' } }] });
  });

  it('should process a valid task successfully', async () => {
    const result = await processor.process(baseTask);
    
    expect(mockRedact).toHaveBeenCalledWith('Hello world');
    expect(mockChatComplete).toHaveBeenCalled();
    expect(result.choices[0].message.content).toBe('Response');
    
    // Check basic logging
    expect(mockSupabase.from).toHaveBeenCalledWith('agent_activity_log');
    expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.objectContaining({
      action_taken: 'system_analyze_execution'
    }));
  });

  it('should handle PII redaction and log telemetry', async () => {
    mockRedact.mockReturnValue({ 
      redactedText: 'Hello [REDACTED]', 
      replacementCount: 1 
    });

    await processor.process(baseTask);

    // Verify PII logging
    expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.objectContaining({
      action_taken: 'pii_redaction',
      reasoning_trace: expect.objectContaining({
        replacement_count: 1
      })
    }));

    // Verify Mistral received redacted text
    expect(mockChatComplete).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: 'Hello [REDACTED]' })
      ])
    }));
  });

  it('should handle missing prompt in payload', async () => {
    const emptyTask = { ...baseTask, payload: {} };
    const result = await processor.process(emptyTask);

    expect(result).toEqual({ message: "No prompt found in task payload." });
    expect(mockChatComplete).not.toHaveBeenCalled();
  });

  it('should handle prompt as raw string', async () => {
    const stringTask = { ...baseTask, payload: "Raw String" };
    // The code does: JSON.stringify("Raw String") -> "\"Raw String\""
    
    await processor.process(stringTask);
    
    expect(mockRedact).toHaveBeenCalledWith('"Raw String"');
    expect(mockChatComplete).toHaveBeenCalled();
  });
});
