import { describe, it, expect } from 'vitest';
import { BaseProcessor } from './BaseProcessor';
import { Task } from '@ai-assistant/shared';

class TestProcessor extends BaseProcessor {
  async process(task: Task): Promise<any> {
    this.addTraceStep('Test Step', 'Testing trace collection', 0.9);
    return { success: true, taskId: task.id };
  }
}

describe('BaseProcessor', () => {
  it('should process a task and collect trace steps', async () => {
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
    expect(processor.getTrace()).toHaveLength(1);
    expect(processor.getTrace()[0]).toMatchObject({
      step_name: 'Test Step',
      message: 'Testing trace collection',
      confidence_score: 0.9
    });
  });

  it('should clear trace between tasks', async () => {
    const processor = new TestProcessor();
    const task: Task = {
      id: 'task-1',
      organization_id: 'org-1',
      domain_action: 'test.action',
      status: 'queued',
      payload: {}
    };
    await processor.process(task);
    expect(processor.getTrace()).toHaveLength(1);
    
    processor.clearTrace();
    expect(processor.getTrace()).toHaveLength(0);
  });
});
