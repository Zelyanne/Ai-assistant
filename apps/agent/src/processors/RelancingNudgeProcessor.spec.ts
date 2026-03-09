import { describe, expect, it } from 'vitest';
import { RelancingNudgeProcessor } from './RelancingNudgeProcessor.js';

describe('RelancingNudgeProcessor', () => {
  it('returns deterministic summary for valid relancing nudge payload', async () => {
    const processor = new RelancingNudgeProcessor();

    const result = await processor.process({
      id: 'task-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      domain_action: 'relancing.nudge',
      status: 'queued',
      payload: {
        project_context_id: '22222222-2222-4222-8222-222222222222',
        member_assignment_id: '33333333-3333-4333-8333-333333333333',
        project_name: 'Q2 Launch',
        member_name: 'Jordan',
        member_user_id: '44444444-4444-4444-8444-444444444444',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        urgency_band: 'urgent_7d',
        cadence_hours: 19.2,
        nudge_window_start: new Date().toISOString(),
        nudge_window_end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason_code: 'deadline_urgency',
        escalation_priority: 'normal',
      },
      result: {},
      user_id: '44444444-4444-4444-8444-444444444444',
    } as any);

    expect(result.summary).toContain('Relancing nudge prepared for Jordan');
    expect(result.reason_code).toBe('deadline_urgency');
  });

  it('throws when payload is missing required fields', async () => {
    const processor = new RelancingNudgeProcessor();

    await expect(
      processor.process({
        id: 'task-2',
        organization_id: '11111111-1111-1111-1111-111111111111',
        domain_action: 'relancing.nudge',
        status: 'queued',
        payload: {
          project_name: 'Missing fields',
        },
        result: {},
      } as any),
    ).rejects.toThrow();
  });
});
