import { describe, it, expect } from 'vitest';
import { BaseProcessor } from './BaseProcessor';
import { Task } from '@ai-assistant/shared';

class TestProcessor extends BaseProcessor {
  async process(task: Task): Promise<any> {
    return { success: true, taskId: task.id };
  }
}

describe('BaseProcessor', () => {
  it('should process a task correctly', async () => {
    const processor = new TestProcessor();
    const task: Task = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      organization_id: '550e8400-e29b-41d4-a716-446655440001',
      domain_action: 'test.action',
      status: 'queued',
      payload: { data: 'test' }
    };
    const result = await processor.process(task);
    expect(result).toEqual({ success: true, taskId: task.id });
  });
});
