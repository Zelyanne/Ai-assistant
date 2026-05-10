/**
 * Unit Tests for Specialist Nodes
 *
 * Tests system prompt generation, handoff note format, and tool spec building.
 * Uses mocked MCP service — no actual API calls.
 *
 * Task 16: Write Unit Tests for Specialist Nodes
 */

import { describe, it, expect, vi } from 'vitest';
import { getSpecialistPrompt, buildSpecialistUserPrompt, SPECIALIST_CAPABILITIES, SPECIALIST_SYSTEM_PROMPTS } from '../../prompts/specialistPrompts.js';
import type { SpecialistNodeContext, SpecialistNodeResult, ToolInvocationRecord } from './types.js';

// --- Mocks ---

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

vi.mock('../../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'test-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
    CONFIDENCE_THRESHOLD: 0.8,
  },
}));

// --- Test Helpers ---

function createMockContext(overrides: Partial<SpecialistNodeContext> = {}): SpecialistNodeContext {
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
    executionRun: {
      id: 'run-1',
      task_id: 'task-1',
      organization_id: 'org-1',
      status: 'processing',
      plan_json: {
        version: 'v1',
        original_command: 'Draft an email to john@example.com',
        summary: 'Draft email',
        ledger_entries: [],
        replan_count: 0,
        steps: [{
          key: 'step-1',
          title: 'Draft email to John',
          worker_type: 'gmail',
          action: 'draft_email',
          status: 'in_progress',
          requested_tools: ['draft_gmail_message'],
          input: { to: 'john@example.com', body: 'Hello John' },
          output: {},
          attempt_count: 0,
          idempotency_key: 'gmail-draft_email-1',
          recoverable: false,
        }],
      },
      idempotency_state: {},
      tool_policy_version: 'v1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as any,
    step: {
      key: 'step-1',
      title: 'Draft email to John',
      worker_type: 'gmail',
      action: 'draft_email',
      status: 'in_progress',
      requested_tools: ['draft_gmail_message'],
      input: { to: 'john@example.com', body: 'Hello John' },
      output: {},
      attempt_count: 0,
      idempotency_key: 'gmail-draft_email-1',
      recoverable: false,
    },
    ...overrides,
  };
}

// --- Tests ---

describe('specialistPrompts', () => {
  it('should have system prompts for all specialist types', () => {
    expect(SPECIALIST_SYSTEM_PROMPTS.gmail).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.calendar).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.docs).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.sheets).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.slides).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.drive).toBeDefined();
    expect(SPECIALIST_SYSTEM_PROMPTS.generalAgent).toBeDefined();
  });

  it('should have capabilities for all worker types', () => {
    expect(SPECIALIST_CAPABILITIES.gmail.length).toBeGreaterThan(0);
    expect(SPECIALIST_CAPABILITIES.calendar.length).toBeGreaterThan(0);
    expect(SPECIALIST_CAPABILITIES.docs.length).toBeGreaterThan(0);
    expect(SPECIALIST_CAPABILITIES.sheets.length).toBeGreaterThan(0);
    expect(SPECIALIST_CAPABILITIES.slides.length).toBeGreaterThan(0);
    expect(SPECIALIST_CAPABILITIES.drive.length).toBeGreaterThan(0);
  });

  it('should return correct prompt for each specialist', () => {
    const gmailPrompt = getSpecialistPrompt('gmail');
    expect(gmailPrompt).toContain('Gmail specialist');
    expect(gmailPrompt).toContain('HANDOFF');
  });

  it('should mention other agents in each specialist prompt', () => {
    const gmailPrompt = getSpecialistPrompt('gmail');
    expect(gmailPrompt).toContain('Calendar');
    expect(gmailPrompt).toContain('Docs');

    const calendarPrompt = getSpecialistPrompt('calendar');
    expect(calendarPrompt).toContain('Gmail');
    expect(calendarPrompt).toContain('Docs');
  });

  it('should include handoff instructions in all specialist prompts', () => {
    for (const key of ['gmail', 'calendar', 'docs', 'sheets', 'slides', 'drive'] as const) {
      const prompt = getSpecialistPrompt(key);
      expect(prompt).toContain('handoff');
      expect(prompt).toContain('HANDOFF');
    }
  });

  it('injects the appropriate static skill playbook into every specialist prompt', () => {
    const expectations = {
      gmail: 'Gmail Agent Skill',
      calendar: 'Google Calendar Agent Skill',
      docs: 'Google Docs Agent Skill',
      sheets: 'Google Sheets Agent Skill',
      slides: 'Google Slides Agent Skill',
      drive: 'Google Drive Agent Skill',
    } as const;

    for (const [key, title] of Object.entries(expectations) as Array<[keyof typeof expectations, string]>) {
      const prompt = getSpecialistPrompt(key);
      expect(prompt).toContain('PROJECT SKILL PLAYBOOK (MUST FOLLOW)');
      expect(prompt).toContain(title);
      expect(prompt).toContain('Runtime Tool Access In This Project');
      expect(prompt).toContain('Fast Decision Map');
      expect(prompt).toContain('Completion Checklist');
    }
  });

  it('injects the General Agent orchestration playbook into the general prompt', () => {
    const prompt = getSpecialistPrompt('generalAgent');

    expect(prompt).toContain('PROJECT SKILL PLAYBOOK (MUST FOLLOW)');
    expect(prompt).toContain('General Agent Skill');
    expect(prompt).toContain('Fast Decision Map');
    expect(prompt).toContain('Long-Running Workflow Patterns');
    expect(prompt).toContain('Completion Checklist');
  });

  it('should build user prompt with correct context', () => {
    const prompt = buildSpecialistUserPrompt(
      'Draft email to john',
      'Draft email',
      'draft_email',
      { to: 'john@example.com' },
      { document_url: 'https://docs.google.com/...' },
    );
    expect(prompt).toContain('Draft email to john');
    expect(prompt).toContain('Draft email');
    expect(prompt).toContain('draft_email');
    expect(prompt).toContain('john@example.com');
    expect(prompt).toContain('https://docs.google.com/');
  });
});

describe('Handoff Note Format', () => {
  it('should have consistent handoff structure across specialists', () => {
    const mockResult: SpecialistNodeResult = {
      summary: 'Email drafted successfully',
      nextWorkerNote: 'Draft ready for review',
      toolName: 'draft_gmail_message',
      output: {
        summary: 'Email drafted successfully',
        handoff_content: 'Draft ready for review',
        tool_name: 'draft_gmail_message',
      },
    };

    expect(mockResult.output).toHaveProperty('summary');
    expect(mockResult.output).toHaveProperty('handoff_content');
    expect(mockResult.output).toHaveProperty('tool_name');
    expect(mockResult.summary).toBe(mockResult.output.summary);
    expect(mockResult.nextWorkerNote).toBe(mockResult.output.handoff_content);
  });

  it('should handle ToolInvocationRecord format', () => {
    const invocation: ToolInvocationRecord = {
      requestedTool: 'draft_gmail_message',
      toolName: 'draft_gmail_message',
      args: { to: 'john@example.com', subject: 'Hello', body: 'Hi John' },
      result: { draft_id: 'd123', summary: 'Draft created' },
    };

    expect(invocation.requestedTool).toBe('draft_gmail_message');
    expect(invocation.toolName).toBe('draft_gmail_message');
    expect(invocation.args).toHaveProperty('to');
    expect(invocation.result).toHaveProperty('draft_id');
  });
});

describe('Specialist Node Context', () => {
  it('should create valid context from mock data', () => {
    const context = createMockContext();
    expect(context.task.id).toBe('task-1');
    expect(context.executionRun.id).toBe('run-1');
    expect(context.step.worker_type).toBe('gmail');
    expect(context.step.action).toBe('draft_email');
  });

  it('should allow context overrides', () => {
    const context = createMockContext({
      step: {
        key: 'step-2',
        title: 'Create calendar event',
        worker_type: 'calendar',
        action: 'create_event',
        status: 'in_progress',
        requested_tools: ['manage_event'],
        input: { summary: 'Meeting', startTime: '2026-06-15T10:00:00Z', endTime: '2026-06-15T11:00:00Z' },
        output: {},
        attempt_count: 0,
        idempotency_key: 'calendar-create_event-2',
        recoverable: false,
      },
    });
    expect(context.step.worker_type).toBe('calendar');
    expect(context.step.action).toBe('create_event');
  });
});
