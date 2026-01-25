import { describe, it, expect } from 'vitest';
import { TaskSchema, IngestedThreadSchema, AgentActivityLogSchema } from '../src/schemas';

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

});
