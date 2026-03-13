import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolUpdateProcessor } from './ProtocolUpdateProcessor.js';
import { ProtocolService } from '../services/ProtocolService.js';
import { Task } from '@ai-assistant/shared';

vi.mock('../services/ProtocolService.js', () => ({
  ProtocolService: {
    saveProtocol: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('ProtocolUpdateProcessor', () => {
  let processor: ProtocolUpdateProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new ProtocolUpdateProcessor();
  });

  it('should call ProtocolService.saveProtocol and return success', async () => {
    const mockTask: Partial<Task> = {
      id: 'task-123',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'protocol.update',
      payload: {
        content_markdown: '# Updated Protocol',
        metadata: { tone: 'executive' },
        title: 'Primary Leadership Protocol'
      }
    };

    const result = await processor.process(mockTask as Task);

    expect(ProtocolService.saveProtocol).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'Primary Leadership Protocol',
      '# Updated Protocol',
      expect.objectContaining({ tone: 'executive' })
    );

    expect(result.summary).toContain('Leadership protocol updated successfully');
    expect(result.status).toBe('done');
  });

  it('should throw error if payload is invalid', async () => {
    const mockTask: Partial<Task> = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'protocol.update',
      payload: {
        // missing content_markdown
      }
    };

    await expect(processor.process(mockTask as Task)).rejects.toThrow();
  });
});
