import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolGenerateProcessor } from './ProtocolGenerateProcessor';
import { Task } from '@ai-assistant/shared';

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
    // @ts-ignore - access protected method for mocking
    vi.spyOn(processor, 'createAgentInstance' as any).mockReturnValue(mockAgent);
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
      organization_id: 'org-1',
      payload: { philosophy: 'Be kind.' }
    } as Task;

    const result = await processor.process(task);

    expect(mockAgent.invoke).toHaveBeenCalled();
    expect(result.status).toBe('review_pending');
    expect(result.protocol_markdown).toBe('# Protocol Output');
    expect(result.agent_trace).toBeDefined();
  });
});
