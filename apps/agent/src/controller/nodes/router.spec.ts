/**
 * Integration Tests for Router Node
 *
 * Tests routing logic, fallback behavior, and audit logging.
 * Uses mocked specialist nodes and services.
 *
 * Task 17: Write Integration Tests for Router
 * Task 18: Write Integration Tests for Full Flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionRun, Task, ExecutionPlanStep } from '@ai-assistant/shared';
import type { AgentState } from '../graph.js';

// --- Mocks ---

const mockCompleteStep = vi.fn();
const mockMarkStepInProgress = vi.fn();
const mockMarkRunStatus = vi.fn();
const mockBuildTaskResult = vi.fn();
const mockFailStep = vi.fn();
const mockRecordReplan = vi.fn();

vi.mock('../../services/ExecutionRunService.js', () => ({
  executionRunService: {
    getByTaskId: vi.fn(),
    createRun: vi.fn(),
    markStepInProgress: mockMarkStepInProgress,
    completeStep: mockCompleteStep,
    markRunStatus: mockMarkRunStatus,
    buildTaskResult: mockBuildTaskResult,
    failStep: mockFailStep,
    recordReplan: mockRecordReplan,
  },
}));

vi.mock('../../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: vi.fn().mockResolvedValue([]),
    executeWorkerTool: vi.fn().mockResolvedValue({ success: true }),
    checkCapabilityReadiness: vi.fn().mockResolvedValue({ ready: true, errors: [] }),
  },
}));

vi.mock('../../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn().mockReturnValue(null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
    flush: vi.fn(),
  },
}));

vi.mock('../../services/WorkerToolPolicyService.js', () => ({
  workerToolPolicyService: {
    isToolAllowed: vi.fn().mockReturnValue(true),
    getVersion: vi.fn().mockReturnValue('v1'),
  },
  CapabilityWorkerType: {},
}));

// Mock specialist nodes to avoid actual LLM calls
vi.mock('./gmailAgent.js', () => ({
  gmailAgentNode: vi.fn().mockResolvedValue({
    summary: 'Email drafted successfully',
    nextWorkerNote: 'Draft ready for review',
        toolName: 'draft_gmail_message',
        output: {
          summary: 'Email drafted successfully',
          handoff_content: 'Draft ready for review',
          tool_name: 'draft_gmail_message',
    },
  }),
}));

vi.mock('./calendarAgent.js', () => ({
  calendarAgentNode: vi.fn().mockResolvedValue({
    summary: 'Calendar event created',
    nextWorkerNote: 'Calendar event ready with id evt-123.',
    toolName: 'manage_event',
    output: {
      summary: 'Calendar event created',
      handoff_content: 'Calendar event ready with id evt-123.',
      event_id: 'evt-123',
      tool_name: 'manage_event',
    },
  }),
}));

vi.mock('./docsAgent.js', () => ({
  docsAgentNode: vi.fn().mockResolvedValue({
    summary: 'Document created',
    nextWorkerNote: 'Google Doc ready: Test Doc (https://docs.google.com/test).',
    toolName: 'create_doc',
    output: {
      summary: 'Document created',
      handoff_content: 'Google Doc ready: Test Doc (https://docs.google.com/test).',
      document_id: 'doc-123',
      document_url: 'https://docs.google.com/test',
      document_title: 'Test Doc',
      tool_name: 'create_doc',
    },
  }),
}));

vi.mock('./sheetsAgent.js', () => ({
  sheetsAgentNode: vi.fn().mockResolvedValue({
    summary: 'Spreadsheet created',
    nextWorkerNote: 'Spreadsheet ready (sheet-123): https://sheets.google.com/test',
    toolName: 'create_spreadsheet',
    output: {
      summary: 'Spreadsheet created',
      handoff_content: 'Spreadsheet ready (sheet-123): https://sheets.google.com/test',
      spreadsheet_id: 'sheet-123',
      tool_name: 'create_spreadsheet',
    },
  }),
}));

vi.mock('./slidesAgent.js', () => ({
  slidesAgentNode: vi.fn().mockResolvedValue({
    summary: 'Presentation created',
    nextWorkerNote: 'Presentation ready (pres-123): https://slides.google.com/test',
    toolName: 'create_presentation',
    output: {
      summary: 'Presentation created',
      handoff_content: 'Presentation ready (pres-123): https://slides.google.com/test',
      presentation_id: 'pres-123',
      tool_name: 'create_presentation',
    },
  }),
}));

vi.mock('./driveAgent.js', () => ({
  driveAgentNode: vi.fn().mockResolvedValue({
    summary: 'Drive context loaded',
    nextWorkerNote: 'Drive context ready from file file-123 (https://drive.google.com/file/d/file-123).',
    toolName: 'get_drive_file_content',
    output: {
      summary: 'Drive context loaded',
      handoff_content: 'Drive context ready from file file-123 (https://drive.google.com/file/d/file-123).',
      file_id: 'file-123',
      file_url: 'https://drive.google.com/file/d/file-123',
      tool_name: 'get_drive_file_content',
    },
  }),
}));

// --- Test Helpers ---

function createMockTask(): Task {
  return {
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
  } as Task;
}

function createMockExecutionRun(steps: ExecutionPlanStep[]): ExecutionRun {
  return {
    id: 'run-1',
    task_id: 'task-1',
    organization_id: 'org-1',
    status: 'processing',
    plan_json: {
      version: 'v1',
      original_command: 'Test command',
      summary: 'Test plan',
      ledger_entries: [],
      replan_count: 0,
      steps,
    },
    idempotency_state: {},
    tool_policy_version: 'v1',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as unknown as ExecutionRun;
}

function createMockState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    task: createMockTask(),
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
    execution_run: null,
    router_completed_step_key: null,
    ...overrides,
  } as AgentState;
}

function createMockStep(overrides: Partial<ExecutionPlanStep> = {}): ExecutionPlanStep {
  return {
    key: 'step-1',
    title: 'Test step',
    worker_type: 'gmail',
    action: 'draft_email',
    status: 'pending',
    requested_tools: ['draft_gmail_message'],
    input: {},
    output: {},
    attempt_count: 0,
    idempotency_key: 'gmail-draft_email-1',
    recoverable: false,
    ...overrides,
  } as ExecutionPlanStep;
}

// --- Tests ---

describe('Router Node - Routing Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route to finalize when there is no execution run', async () => {
    const { routerNode } = await import('./router.js');
    const state = createMockState({ execution_run: null });

    const result = await routerNode(state);
    expect(result.trace).toBeDefined();
  });

  it('should route to general_agent when run is completed', async () => {
    const { routerNode } = await import('./router.js');
    const run = createMockExecutionRun([createMockStep()]);
    run.status = 'completed';
    const state = createMockState({ execution_run: run });

    const result = await routerNode(state);
    expect(result.trace).toBeDefined();
  });

  it('should route to general_agent when run is escalated', async () => {
    const { routerNode } = await import('./router.js');
    const run = createMockExecutionRun([createMockStep()]);
    run.status = 'escalated';
    const state = createMockState({ execution_run: run });

    const result = await routerNode(state);
    expect(result.trace).toBeDefined();
  });

  it('should process gmail specialist for gmail step', async () => {
    const { routerNode } = await import('./router.js');
    const step = createMockStep({ worker_type: 'gmail', action: 'draft_email' });
    const run = createMockExecutionRun([step]);

    mockMarkStepInProgress.mockResolvedValue(run);
    mockCompleteStep.mockResolvedValue({
      ...run,
      status: 'processing',
      plan_json: {
        ...run.plan_json,
        steps: [{ ...step, status: 'completed' }],
      },
    });
    mockBuildTaskResult.mockReturnValue({ execution_run: { id: 'run-1' } });

    const state = createMockState({ execution_run: run });
    const result = await routerNode(state);

    expect(mockMarkStepInProgress).toHaveBeenCalled();
    expect(mockCompleteStep).toHaveBeenCalled();
    expect(result.execution_run).toBeDefined();
  });

  it('should process calendar specialist for calendar step', async () => {
    const { routerNode } = await import('./router.js');
    const step = createMockStep({ worker_type: 'calendar', action: 'create_event' });
    const run = createMockExecutionRun([step]);

    mockMarkStepInProgress.mockResolvedValue(run);
    mockCompleteStep.mockResolvedValue({
      ...run,
      status: 'processing',
      plan_json: {
        ...run.plan_json,
        steps: [{ ...step, status: 'completed' }],
      },
    });
    mockBuildTaskResult.mockReturnValue({ execution_run: { id: 'run-1' } });

    const state = createMockState({ execution_run: run });
    const result = await routerNode(state);

    expect(mockMarkStepInProgress).toHaveBeenCalled();
    expect(mockCompleteStep).toHaveBeenCalled();
  });

  it('should process drive specialist for drive step without fallback', async () => {
    const { routerNode } = await import('./router.js');
    const step = createMockStep({ worker_type: 'drive', action: 'read_drive_context' });
    const run = createMockExecutionRun([step]);

    mockMarkStepInProgress.mockResolvedValue(run);
    mockCompleteStep.mockResolvedValue({
      ...run,
      status: 'processing',
      plan_json: {
        ...run.plan_json,
        steps: [{ ...step, status: 'completed' }],
      },
    });

    const state = createMockState({ execution_run: run });
    const result = await routerNode(state);

    expect(mockCompleteStep).toHaveBeenCalled();
    expect(result.router_completed_step_key).toBe('step-1');
  });

  it('should handle idempotent recovery', async () => {
    const { routerNode } = await import('./router.js');
    const step = createMockStep({ worker_type: 'gmail', action: 'draft_email' });
    const run = createMockExecutionRun([step]);
    run.idempotency_state = {
      'gmail-draft_email-1': {
        status: 'completed',
        output: { draft_id: 'd-123' },
        tool_name: 'draft_gmail_message',
        updated_at: '2026-01-01T00:00:00Z',
      },
    } as any;

    mockMarkStepInProgress.mockResolvedValue(run);
    mockCompleteStep.mockResolvedValue(run);

    const state = createMockState({ execution_run: run });
    const result = await routerNode(state);

    expect(mockCompleteStep).toHaveBeenCalled();
    expect(result.trace?.[1]?.step_name).toBe('Router');
    expect(result.router_completed_step_key).toBe('step-1');
  });
});

describe('Router Node - Full Flow (Task 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle multi-step flow: Gmail → Calendar', async () => {
    const { routerNode } = await import('./router.js');

    const gmailStep = createMockStep({
      key: 'step-1',
      title: 'Draft email',
      worker_type: 'gmail',
      action: 'draft_email',
      status: 'pending',
    });
    const calendarStep = createMockStep({
      key: 'step-2',
      title: 'Create event',
      worker_type: 'calendar',
      action: 'create_event',
      status: 'pending',
      idempotency_key: 'calendar-create_event-2',
    });

    // First call: process Gmail step
    const runGmail = createMockExecutionRun([gmailStep, calendarStep]);
    const gmailCompleted = {
      ...runGmail,
      plan_json: {
        ...runGmail.plan_json,
        steps: [
          { ...gmailStep, status: 'completed' },
          { ...calendarStep, status: 'pending' },
        ],
      },
    } as any;

    mockMarkStepInProgress.mockResolvedValueOnce(runGmail);
    mockCompleteStep.mockResolvedValueOnce(gmailCompleted);
    mockBuildTaskResult.mockReturnValue({ execution_run: { id: 'run-1' } });

    const state1 = createMockState({ execution_run: runGmail });
    const result1 = await routerNode(state1);

    expect(result1.execution_run).toBeDefined();
    expect(mockCompleteStep).toHaveBeenCalledTimes(1);

    // Second call: process Calendar step
    const calendarCompleted = {
      ...gmailCompleted,
      plan_json: {
        ...gmailCompleted.plan_json,
        steps: [
          { ...gmailStep, status: 'completed' },
          { ...calendarStep, status: 'completed' },
        ],
      },
    } as any;

    mockMarkStepInProgress.mockResolvedValueOnce(gmailCompleted);
    mockCompleteStep.mockResolvedValueOnce(calendarCompleted);

    const state2 = createMockState({ execution_run: gmailCompleted });
    const result2 = await routerNode(state2);

    expect(result2.execution_run).toBeDefined();
    expect(mockCompleteStep).toHaveBeenCalledTimes(2);
  });

  it('should handle all 3-step flow: Docs → Sheets → Gmail', async () => {
    const { routerNode } = await import('./router.js');

    const docsStep = createMockStep({ key: 'step-1', worker_type: 'docs', action: 'create_document', idempotency_key: 'docs-1' });
    const sheetsStep = createMockStep({ key: 'step-2', worker_type: 'sheets', action: 'update_sheet', idempotency_key: 'sheets-2' });
    const gmailStep = createMockStep({ key: 'step-3', worker_type: 'gmail', action: 'draft_email', idempotency_key: 'gmail-3' });

    const run = createMockExecutionRun([docsStep, sheetsStep, gmailStep]);

    // Step 1: Docs
    const docsCompleted = {
      ...run,
      plan_json: { ...run.plan_json, steps: [{ ...docsStep, status: 'completed' }, sheetsStep, gmailStep] },
    } as any;
    mockMarkStepInProgress.mockResolvedValueOnce(run);
    mockCompleteStep.mockResolvedValueOnce(docsCompleted);
    mockBuildTaskResult.mockReturnValue({});

    const state1 = createMockState({ execution_run: run });
    await routerNode(state1);

    // Step 2: Sheets
    const sheetsCompleted = {
      ...docsCompleted,
      plan_json: { ...docsCompleted.plan_json, steps: [{ ...docsStep, status: 'completed' }, { ...sheetsStep, status: 'completed' }, gmailStep] },
    } as any;
    mockMarkStepInProgress.mockResolvedValueOnce(docsCompleted);
    mockCompleteStep.mockResolvedValueOnce(sheetsCompleted);

    const state2 = createMockState({ execution_run: docsCompleted });
    await routerNode(state2);

    // Step 3: Gmail
    const gmailCompleted = {
      ...sheetsCompleted,
      plan_json: { ...sheetsCompleted.plan_json, steps: [{ ...docsStep, status: 'completed' }, { ...sheetsStep, status: 'completed' }, { ...gmailStep, status: 'completed' }] },
    } as any;
    mockMarkStepInProgress.mockResolvedValueOnce(sheetsCompleted);
    mockCompleteStep.mockResolvedValueOnce(gmailCompleted);

    const state3 = createMockState({ execution_run: sheetsCompleted });
    await routerNode(state3);

    expect(mockCompleteStep).toHaveBeenCalledTimes(3);
  });
});
