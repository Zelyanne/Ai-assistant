import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemAnalyzeProcessor } from './SystemAnalyzeProcessor.js';
import { Task } from '@ai-assistant/shared';

// Mock dependencies
vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}));

vi.mock('../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'mock-key'
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
    mockChatComplete.mockResolvedValue({ choices: [{ message: { content: 'Response' } }] });
  });

  it('should process a valid task successfully', async () => {
    const result = await processor.process(baseTask);
    
    expect(mockChatComplete).toHaveBeenCalled();
    expect(result.choices[0].message.content).toBe('Response');
  });

  it('should handle missing prompt in payload', async () => {
    const emptyTask = { ...baseTask, payload: {} };
    const result = await processor.process(emptyTask);

    expect(result).toEqual({ message: "No prompt found in task payload." });
    expect(mockChatComplete).not.toHaveBeenCalled();
  });

  it('should handle prompt as raw string', async () => {
    const stringTask = { ...baseTask, payload: "Raw String" } as any;
    
    await processor.process(stringTask);
    
    expect(mockChatComplete).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: 'Raw String' })
      ])
    }));
  });
});
