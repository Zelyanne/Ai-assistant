import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolGenerateProcessor } from './ProtocolGenerateProcessor.js';
import type { Task } from '@ai-assistant/shared';

vi.mock('../services/AuditLogger.js', () => ({
  AuditLogger: {
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock dependencies
vi.mock('../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../guards/PerimeterGuard.js', () => {
  const MockPerimeterGuard = class {
    redactPII(text: string) {
      return text;
    }
    recoverPII(text: string) {
      return text;
    }
    static wrapToolWithSecurity(tool: any) {
      return tool;
    }
  };
  return { PerimeterGuard: MockPerimeterGuard };
});

describe('ProtocolGenerateProcessor', () => {
  let processor: ProtocolGenerateProcessor;
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{
          role: 'assistant',
          content: '# Protocol Output'
        }]
      })
    };
    processor = new ProtocolGenerateProcessor();
    vi.spyOn(processor as any, 'createAgentInstance').mockReturnValue(mockAgent);
  });

  it('should throw error for invalid payload', async () => {
    const task = {
      id: '550e8400-e29b-41d4-a716-446655440100',
      domain_action: 'protocol.generate',
      organization_id: '550e8400-e29b-41d4-a716-446655440101',
      status: 'queued',
      payload: {} // Missing philosophy
    } as unknown as Task;

    await expect(processor.process(task)).rejects.toThrow(/Invalid payload/);
  });

  it('should generate protocol and return success result', async () => {
    const task = {
      id: '550e8400-e29b-41d4-a716-446655440102',
      domain_action: 'protocol.generate',
      organization_id: '550e8400-e29b-41d4-a716-446655440103',
      status: 'queued',
      payload: { philosophy: 'Be kind.' }
    } as unknown as Task;

    const result = await processor.process(task);

    expect(mockAgent.invoke).toHaveBeenCalled();
    expect(result.status).toBe('review_pending');
    expect(result.protocol_markdown).toBe('# Protocol Output');
    expect(result.agent_trace).toBeDefined();
  });
});
