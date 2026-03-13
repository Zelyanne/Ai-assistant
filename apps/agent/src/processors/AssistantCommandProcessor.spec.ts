import { describe, expect, it } from 'vitest';
import { AssistantCommandProcessor } from './AssistantCommandProcessor.js';
import type { Task } from '@ai-assistant/shared';

const baseTask: Task = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '123e4567-e89b-12d3-a456-426614174001',
  user_id: '123e4567-e89b-12d3-a456-426614174002',
  domain_action: 'assistant.command',
  status: 'queued',
  payload: {},
};

describe('AssistantCommandProcessor', () => {
  it('builds a planner intent for explicit email draft commands', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'draft this email',
        target_domain_action: 'email.draft',
        target_payload: {
          recipient: 'alexis@example.com',
          subject: 'Status',
          body: 'Draft body',
        },
      },
    });

    expect(result.planner_intent).toBeDefined();
    expect(result.planner_intent.requested_steps).toHaveLength(1);
    expect(result.planner_intent.requested_steps[0]).toMatchObject({
      worker_type: 'gmail',
      action: 'draft_email',
      requested_tools: ['draft_gmail_message'],
    });
  });

  it('supports explicit multi-step plan overrides', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'read the source file, create a doc, then draft the email',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'drive-step',
              title: 'Read Drive file',
              worker_type: 'drive',
              action: 'read_drive_context',
              requested_tools: ['get_drive_file_content'],
              input: { context_references: [{ url: 'https://docs.google.com/document/d/file-123/edit', file_id: 'file-123' }] },
            },
            {
              key: 'doc-step',
              title: 'Create doc',
              worker_type: 'docs',
              action: 'create_document',
              input: { source_step_key: 'drive-step' },
            },
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              input: { recipient: 'alexis@example.com', subject: 'Status', source_step_key: 'doc-step' },
            },
          ],
        },
      },
    });

    expect(result.planner_intent).toBeDefined();
    expect(result.planner_intent.mode).toBe('multi_step');
    expect(result.planner_intent.requested_steps.map((step: { key: string }) => step.key)).toEqual([
      'drive-step',
      'doc-step',
      'gmail-step',
    ]);
  });

  it('requires explicit confirmation for high-risk commands', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(
      processor.process({
        ...baseTask,
        payload: {
          command: 'send an email now',
          high_risk: true,
          confirmed: false,
          recipient: 'alexis@example.com',
          subject: 'Status',
          body: 'Ship it',
        },
      }),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('derives approval metadata for confirmed email send plans', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'send an email to Alexis',
        confirmed: true,
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'Ship it',
      },
    });

    expect(result.planner_intent).toBeDefined();
    expect(result.planner_intent.requested_steps[0]).toMatchObject({
      worker_type: 'gmail',
      action: 'send_email',
      input: expect.objectContaining({
        approved_by: baseTask.user_id,
        source_task_id: baseTask.id,
      }),
    });
    expect(result.planner_intent.requested_steps[0].input.approved_at).toEqual(expect.any(String));
  });

  it('keeps legacy thread.action delegation for thread-context commands', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'reply to this thread with a concise update',
        source_type: 'thread',
        source_id: 'thread-123',
        correlation_id: 'corr-123',
      },
    });

    expect(result.delegated_domain_action).toBe('thread.action');
    expect(result.delegated_payload).toMatchObject({
      source_type: 'thread',
      source_id: 'thread-123',
      correlation_id: 'corr-123',
    });
  });
});
