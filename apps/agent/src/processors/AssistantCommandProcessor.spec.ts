import { afterEach, describe, expect, it } from 'vitest';
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
  afterEach(() => {
    AssistantCommandProcessor.setPlannerForTests(null);
  });

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
    expect(result.planner_intent.requested_steps).toHaveLength(3);
    expect(result.planner_intent.requested_steps.map((step: { key: string }) => step.key)).toEqual([
      'drive-step',
      'doc-step',
      'gmail-step',
    ]);
    expect(
      result.planner_intent.requested_steps.map((step: { worker_type: string; action: string }) => `${step.worker_type}:${step.action}`),
    ).toEqual([
      'drive:read_drive_context',
      'docs:create_document',
      'gmail:draft_email',
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

  it('requires confirmation for trusted Command Center web send commands', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      topic: 'Command Center',
      payload: {
        command: 'send an email now',
        high_risk: true,
        source: 'dashboard-command-center',
        channel: 'web',
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'Ship it',
      },
    })).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('requires recap confirmation for trusted WhatsApp send commands', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      payload: {
        command: 'message the client on whatsapp',
        source: 'whatsapp-webhook',
        channel: 'whatsapp',
        user_initiated: true,
        message_text: 'Hello from the assistant',
      },
    })).rejects.toThrow('Quick recap: you want me to send a whatsapp message. Message: "Hello from the assistant". Reply YES to confirm or reply with changes.');
  });

  it('requires confirmation for French send-email commands from Command Center', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      topic: 'Command Center',
      payload: {
        command: 'S il te plait envoie un mail a othily.g@gmail.com ou tu lui dis bonjour pti gars',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    })).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('requires confirmation for trusted multi-step doc plus email commands that include send_email', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      topic: 'Command Center',
      payload: {
        command: 'Bonjour s il te plait envoie crée moi un doc qui s appelle "danse avec les star" puis envoie le par mail à othily.g@gmail.com en lui disant que c est pour qu il aie des idées',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        high_risk: true,
      },
    })).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('does not trust spoofed web channel commands outside Command Center context', async () => {
    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      topic: 'General',
      payload: {
        command: 'send this message now',
        channel: 'web',
        source: 'dashboard-command-center',
        user_initiated: true,
        high_risk: true,
        message_text: 'Hello team',
      },
    })).rejects.toThrow('CONFIRMATION_REQUIRED');
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

  it('maps schedule commands to schedule.manage delegation', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'Remind me every Monday at 9am to check my emails',
        source: 'telegram-webhook',
        channel: 'telegram',
        external_message_id: 'telegram-msg-1',
        thread_id: 'telegram-chat-1',
        channel_metadata: {
          timezone: 'Europe/Paris',
        },
        user_initiated: true,
      },
    });

    expect(result.delegated_domain_action).toBe('schedule.manage');
    expect(result.delegated_payload).toMatchObject({
      command_text: 'Remind me every Monday at 9am to check my emails',
      message_text: 'Remind me every Monday at 9am to check my emails',
      channel: 'telegram',
      external_message_id: 'telegram-msg-1',
      thread_id: 'telegram-chat-1',
      timezone: 'Europe/Paris',
      user_initiated: true,
    });
  });

  it('supports explicit schedule.manage target action', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'pause schedule 11111111-1111-4111-8111-111111111111',
        target_domain_action: 'schedule.manage',
      },
    });

    expect(result.delegated_domain_action).toBe('schedule.manage');
  });

  it('maps skill-save commands to skills.manage delegation', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'save this as a skill: cover-letter-style',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    });

    expect(result.delegated_domain_action).toBe('skills.manage');
    expect(result.delegated_payload).toMatchObject({
      operation: 'upsert',
      skill_name: 'cover-letter-style',
      user_initiated: true,
    });
  });

  it('supports explicit skills.manage target action', async () => {
    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command: 'list my skills',
        target_domain_action: 'skills.manage',
        target_payload: {
          operation: 'list',
        },
      },
    });

    expect(result.delegated_domain_action).toBe('skills.manage');
    expect(result.delegated_payload).toMatchObject({
      operation: 'list',
    });
  });

  it('asks for clarification when the agentic planner needs missing calendar details', async () => {
    AssistantCommandProcessor.setPlannerForTests(async () => ({
      decision: 'clarify',
      summary: 'Need calendar timing details',
      clarification_prompt: 'What title, start time, and end time should I use for this calendar event?',
      steps: [],
    }));

    const processor = new AssistantCommandProcessor();

    await expect(processor.process({
      ...baseTask,
      topic: 'Command Center',
      payload: {
        command: 'Put dinner with Sam on my calendar',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    })).rejects.toThrow('COMMAND_CLARIFICATION_REQUIRED: What title, start time, and end time should I use for this calendar event?');
  });

  it('accepts agentic multi-step workspace plans', async () => {
    AssistantCommandProcessor.setPlannerForTests(async () => ({
      decision: 'plan',
      summary: 'Plan a document plus email follow-up',
      steps: [
        {
          title: 'Create Google Doc artifact',
          worker_type: 'docs',
          action: 'create_document',
          input: {
            title: 'Launch notes',
            content: 'Initial launch notes',
          },
          requested_tools: ['create_doc', 'modify_doc_text'],
          recoverable: true,
        },
        {
          title: 'Send Gmail message',
          worker_type: 'gmail',
          action: 'send_email',
          input: {
            recipient: 'alexis@example.com',
            subject: 'Launch notes ready',
            body: 'I drafted the launch notes for review.',
          },
          requested_tools: ['send_gmail_message'],
          recoverable: true,
        },
      ],
    }));

    const processor = new AssistantCommandProcessor();

    const result = await processor.process({
      ...baseTask,
      topic: 'Command Center',
      payload: {
        command: 'Create launch notes in a doc and send them to Alexis',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        confirmed: true,
      },
    });

    expect(result.planner_intent).toBeDefined();
    expect(result.planner_intent.requested_steps.map((step: { worker_type: string; action: string }) => `${step.worker_type}:${step.action}`)).toEqual([
      'docs:create_document',
      'gmail:send_email',
    ]);
    expect(result.planner_intent.requested_steps[1].input).toMatchObject({
      recipient: 'alexis@example.com',
      to: 'alexis@example.com',
      approved_by: baseTask.user_id,
      source_task_id: baseTask.id,
    });
  });
});
