import { describe, it, expect } from 'vitest';
import {
  TaskSchema,
  IngestedThreadSchema,
  AgentActivityLogSchema,
  BatchedEmailTriageResultSchema,
  RelancingUpdateSchema,
  StatusReportSchema,
  CommandConversationSchema,
  CommandMessageSchema,
} from '../src/schemas';

describe('Zod Schemas', () => {
  describe('TaskSchema', () => {
    it('validates a valid task', () => {
      const validTask = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        domain_action: 'email.ingest',
        status: 'queued',
        payload: { threadId: '123' }
      };
      const result = TaskSchema.safeParse(validTask);
      expect(result.success).toBe(true);
    });

    it('fails on invalid domain_action format', () => {
      const invalidTask = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        domain_action: 'invalidAction',
        payload: {}
      };
      const result = TaskSchema.safeParse(invalidTask);
      expect(result.success).toBe(false);
    });
  });

  describe('IngestedThreadSchema', () => {
    it('includes the subject field', () => {
      const thread = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        external_id: 'gmail-123',
        subject: 'Meeting Today',
        metadata: {}
      };
      const result = IngestedThreadSchema.safeParse(thread);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subject).toBe('Meeting Today');
      }
    });
  });

  describe('AgentActivityLogSchema', () => {
    it('validates valid log entry', () => {
      const log = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        agent_id: '550e8400-e29b-41d4-a716-446655440001',
        action_taken: 'Analyzed email',
        reasoning_trace: [
          {
            timestamp: new Date().toISOString(),
            step_name: 'Perimeter Check',
            message: 'Checking access to email topic',
            confidence_score: 1.0
          }
        ],
        citations: [
          {
            source_type: 'email',
            source_id: 'gmail-123',
            link: 'https://mail.google.com',
            description: 'Original email thread'
          }
        ]
      };
      const result = AgentActivityLogSchema.safeParse(log);
      expect(result.success).toBe(true);
    });

    it('fails on invalid reasoning_trace', () => {
      const log = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        agent_id: '550e8400-e29b-41d4-a716-446655440001',
        action_taken: 'Analyzed email',
        reasoning_trace: { invalid: 'format' },
        citations: []
      };
      const result = AgentActivityLogSchema.safeParse(log);
      expect(result.success).toBe(false);
    });
  });

  describe('BatchedEmailTriageResultSchema', () => {
    it('validates a batched triage response keyed by thread_id', () => {
      const response = [
        {
          thread_id: 'thread-1',
          classification: {
            matches: [
              {
                topic: 'Urgent',
                reason: 'Contains immediate customer deadline',
                priority_score: 92,
              },
            ],
            overall_priority_score: 92,
            is_highlighted: true,
          },
        },
      ];

      const result = BatchedEmailTriageResultSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('fails when a result item is missing thread_id', () => {
      const invalidResponse = [
        {
          classification: {
            matches: [],
            overall_priority_score: 10,
            is_highlighted: false,
          },
        },
      ];

      const result = BatchedEmailTriageResultSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('RelancingUpdateSchema', () => {
    it('validates a valid relancing update', () => {
      const update = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        project_context_id: '550e8400-e29b-41d4-a716-446655440010',
        member_assignment_id: '550e8400-e29b-41d4-a716-446655440011',
        channel: 'telegram',
        external_message_id: 'tg:123',
        thread_id: 'tg:thread:1',
        correlation_id: 'corr-1',
        idempotency_key: 'telegram:tg:123',
        message_text: 'Blocked waiting on API access',
        intents: ['blocker_report'],
        blocker_summary: 'Waiting on API access',
        requested_help: 'Can someone grant me access?',
      };

      const result = RelancingUpdateSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it('fails when intents is empty', () => {
      const update = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        project_context_id: '550e8400-e29b-41d4-a716-446655440010',
        member_assignment_id: '550e8400-e29b-41d4-a716-446655440011',
        channel: 'web',
        correlation_id: 'corr-1',
        idempotency_key: 'web:corr-1',
        message_text: 'No blockers, progressing',
        intents: [],
      };

      const result = RelancingUpdateSchema.safeParse(update);
      expect(result.success).toBe(false);
    });

    it('fails when neither external_message_id nor correlation_id is provided', () => {
      const update = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        project_context_id: '550e8400-e29b-41d4-a716-446655440010',
        member_assignment_id: '550e8400-e29b-41d4-a716-446655440011',
        channel: 'whatsapp',
        idempotency_key: 'whatsapp:missing',
        message_text: 'Update',
        intents: ['status_update'],
      };

      const result = RelancingUpdateSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  describe('StatusReportSchema', () => {
    it('validates a complete status report payload', () => {
      const report = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        source_task_id: '550e8400-e29b-41d4-a716-446655440001',
        report_period_start: new Date('2026-03-01T00:00:00.000Z').toISOString(),
        report_period_end: new Date('2026-03-08T00:00:00.000Z').toISOString(),
        idempotency_key: 'status-report:org-1:2026-03-01:2026-03-08',
        narrative: 'Weekly draft: strong momentum with one blocker requiring PM support.',
        wins: [
          {
            title: 'Release prep moved forward',
            detail: 'Team completed testing checklist.',
            source_type: 'task',
            source_id: 'task-1',
          },
        ],
        blockers_risks: [],
        commitments: [],
        next_actions: [],
        critical_actions: [
          {
            title: 'Resolve launch blocker',
            action_required: 'Coordinate API access approval.',
            priority: 'high',
            rationale: 'Blocker report detected in relancing update.',
            source_type: 'relancing_update',
            source_id: 'rel-1',
          },
        ],
        metadata: {
          source_ids: ['task-1', 'rel-1'],
          source_links: [],
          generated_by: 'status-report-processor',
        },
      };

      const result = StatusReportSchema.safeParse(report);
      expect(result.success).toBe(true);
    });

    it('fails when idempotency_key is empty', () => {
      const report = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        report_period_start: new Date('2026-03-01T00:00:00.000Z').toISOString(),
        report_period_end: new Date('2026-03-08T00:00:00.000Z').toISOString(),
        idempotency_key: '',
        narrative: 'Weekly draft',
      };

      const result = StatusReportSchema.safeParse(report);
      expect(result.success).toBe(false);
    });
  });

  describe('CommandCenter schemas', () => {
    it('validates command conversation payload', () => {
      const conversation = {
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        created_by: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Daily command thread',
        channel: 'web',
      };

      const result = CommandConversationSchema.safeParse(conversation);
      expect(result.success).toBe(true);
    });

    it('validates command message linkage fields', () => {
      const message = {
        conversation_id: '550e8400-e29b-41d4-a716-446655440010',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'assistant',
        content: 'Queued for asynchronous execution.',
        state: 'queued',
        source_task_id: '550e8400-e29b-41d4-a716-446655440020',
        channel: 'web',
        correlation_id: 'corr-123',
        thread_id: 'thread-123',
      };

      const result = CommandMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('fails command message when content is empty', () => {
      const invalidMessage = {
        conversation_id: '550e8400-e29b-41d4-a716-446655440010',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'assistant',
        content: '   ',
        channel: 'web',
      };

      const result = CommandMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

});
