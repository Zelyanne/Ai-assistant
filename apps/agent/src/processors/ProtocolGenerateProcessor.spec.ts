import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolGenerateProcessor } from './ProtocolGenerateProcessor';
import { ProtocolService } from '../services/ProtocolService';
import { AuditLogger } from '../services/AuditLogger';
import { Task } from '@ai-assistant/shared';

// Mock dependencies
vi.mock('../services/ProtocolService');
vi.mock('../services/AuditLogger', () => ({
  AuditLogger: {
    createStep: vi.fn((name, msg, details) => ({
      step_name: name,
      message: msg,
      timestamp: new Date().toISOString(),
      ...details
    })),
    createCitation: vi.fn((id, type, desc, link) => ({
      source_id: id,
      source_type: type,
      description: desc,
      link: link
    }))
  }
}));

describe('ProtocolGenerateProcessor', () => {
  let processor: ProtocolGenerateProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new ProtocolGenerateProcessor();
  });

  it('should throw error for invalid payload', async () => {
    const task = {
      id: 'task-123',
      domain_action: 'protocol.generate',
      payload: {} // Missing philosophy
    } as Task;

    await expect(processor.process(task)).rejects.toThrow(/Invalid payload/);
  });

  it('should generate protocol and return success result', async () => {
    const task = {
      id: 'task-123',
      domain_action: 'protocol.generate',
      payload: { philosophy: 'Be kind.' }
    } as Task;

    const mockGenerationResult = {
      markdown: '# Protocol',
      metadata: {
        nudging_frequency_hours: 24,
        tone: 'supportive',
        escalation_threshold: 0.8,
        preferred_channels: ['email']
      }
    };

    (ProtocolService.generateProtocol as any).mockResolvedValue(mockGenerationResult);

    const result = await processor.process(task);

    expect(ProtocolService.generateProtocol).toHaveBeenCalledWith('Be kind.');
    expect(result.status).toBe('review_pending');
    expect(result.protocol_markdown).toBe('# Protocol');
    expect(result.metadata).toEqual(mockGenerationResult.metadata);
    expect(result.trace).toHaveLength(1);
    expect(result.citations).toHaveLength(1);
    expect(AuditLogger.createStep).toHaveBeenCalledWith(
      'Protocol Generation',
      expect.stringContaining('Transformed'),
      expect.any(Object)
    );
  });
});
