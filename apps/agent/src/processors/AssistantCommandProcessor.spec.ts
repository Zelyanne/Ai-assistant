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
  it('maps explicit target_domain_action to delegated action', async () => {
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

    expect(result.delegated_domain_action).toBe('email.draft');
    expect(result.delegated_payload).toMatchObject({
      recipient: 'alexis@example.com',
      subject: 'Status',
      body: 'Draft body',
    });
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

  it('requires confirmation for delegated channel.send even when high_risk flag is absent', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(
      processor.process({
        ...baseTask,
        payload: {
          command: 'send message to channel',
          channel: 'telegram',
          message_text: 'hello',
        },
      }),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('infers thread.action when command references thread context', async () => {
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

  it('returns conversation linkage citations when provided', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'send message to channel',
        confirmed: true,
        channel: 'telegram',
        message_text: 'hello',
        conversation_id: 'conv-1',
        source_message_id: 'msg-1',
        correlation_id: 'corr-1',
      },
    });

    const citations = (result.citations ?? []) as Array<{ source_type: string; source_id: string }>;
    expect(citations.some((citation) => citation.source_type === 'command_conversation' && citation.source_id === 'conv-1')).toBe(true);
    expect(citations.some((citation) => citation.source_type === 'command_message' && citation.source_id === 'msg-1')).toBe(true);
    expect(citations.some((citation) => citation.source_type === 'correlation' && citation.source_id === 'corr-1')).toBe(true);
  });
});
