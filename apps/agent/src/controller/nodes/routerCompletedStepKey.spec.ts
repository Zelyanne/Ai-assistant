import { describe, expect, it } from 'vitest';
import type { AgentState } from '../graph.js';
import { shouldRouteToGeneralAgentCheckpoint } from '../graph.js';

function createBaseState(): AgentState {
  return {
    task: {
      id: 'task-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'assistant.command',
      topic: 'Command Center',
      status: 'processing',
      payload: {},
      result: undefined,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    error: undefined,
    result: undefined,
    trace: [],
    citations: [],
    active_protocol_rules: undefined,
    persona_memory: undefined,
    short_term_memory: undefined,
    weekly_memory: undefined,
    long_term_memory: undefined,
    memory_task_state: undefined,
    workspace_context_items: [],
    planner_intent: null,
    execution_run: {
      id: 'run-1',
      task_id: 'task-1',
      organization_id: 'org-1',
      status: 'processing',
      plan_json: {
        version: 'v1',
        original_command: 'Do a multi-step thing',
        summary: 'test',
        ledger_entries: [],
        replan_count: 0,
        steps: [
          {
            key: 's1',
            title: 'step 1',
            worker_type: 'gmail',
            action: 'draft_email',
            status: 'completed',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 1,
            idempotency_key: 'k1',
            recoverable: false,
          },
          {
            key: 's2',
            title: 'step 2',
            worker_type: 'docs',
            action: 'create_document',
            status: 'completed',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 1,
            idempotency_key: 'k2',
            recoverable: false,
          },
          {
            key: 's3',
            title: 'step 3',
            worker_type: 'calendar',
            action: 'create_event',
            status: 'completed',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 1,
            idempotency_key: 'k3',
            recoverable: false,
          },
          {
            key: 's4',
            title: 'step 4',
            worker_type: 'drive',
            action: 'read_drive_context',
            status: 'pending',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 0,
            idempotency_key: 'k4',
            recoverable: false,
          },
        ],
      },
      ledger_markdown: '',
      current_step_key: 's4',
      current_worker_type: 'drive',
      tool_policy_version: 'v1',
      idempotency_state: {},
      version: 1,
      last_error: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    router_completed_step_key: 's3',
  } as unknown as AgentState;
}

describe('routeAfterRouter checkpoint key gating', () => {
  it('routes to general agent on every third completed step when key is present', () => {
    const state = createBaseState();
    expect(shouldRouteToGeneralAgentCheckpoint(state)).toBe(true);
  });

  it('does not checkpoint when router_completed_step_key is null (e.g. replan path)', () => {
    const state = createBaseState();
    state.router_completed_step_key = null;
    expect(shouldRouteToGeneralAgentCheckpoint(state)).toBe(false);
  });

  it('does not checkpoint when no pending steps remain', () => {
    const state = createBaseState();
    state.execution_run!.plan_json.steps[3]!.status = 'completed';
    expect(shouldRouteToGeneralAgentCheckpoint(state)).toBe(false);
  });
});
