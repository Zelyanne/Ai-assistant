import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processQueuedTask } from './taskSubscriber.js';

const { mockInvoke, mockGetHandler, mockFlush } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetHandler: vi.fn(),
  mockFlush: vi.fn(),
}));

const { mockGetByTaskId } = vi.hoisted(() => ({
  mockGetByTaskId: vi.fn(),
}));

vi.mock('../controller/graph.js', () => ({
  graph: {
    invoke: mockInvoke,
  },
}));

vi.mock('./llm/tracing.js', () => ({
  tracingService: {
    getHandler: mockGetHandler,
    flush: mockFlush,
  },
}));

vi.mock('./ExecutionRunService.js', () => ({
  executionRunService: {
    getByTaskId: mockGetByTaskId,
  },
}));

describe('processQueuedTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockGetHandler.mockReturnValue(null);
    mockFlush.mockResolvedValue(undefined);
    mockGetByTaskId.mockResolvedValue(null);
  });

  it('invokes graph with metadata/tags for queued channel tasks', async () => {
    await processQueuedTask({
      id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'thread.action',
      status: 'queued',
      payload: {
        channel: 'telegram',
        external_message_id: 'TG123',
        thread_id: 'chat-999',
      },
      result: {},
      topic: undefined,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({ domain_action: 'thread.action' }),
        execution_run: null,
      }),
      expect.objectContaining({
        runName: 'Graph: thread.action',
        metadata: expect.objectContaining({
          domain_action: 'thread.action',
          taskId: '44444444-4444-4444-8444-444444444444',
        }),
        tags: ['thread.action', 'langgraph'],
      }),
    );
    expect(mockFlush).toHaveBeenCalledOnce();
  });

  it('passes an existing execution run into graph state', async () => {
    mockGetByTaskId.mockResolvedValue({
      id: 'run-1',
      status: 'processing',
    });

    await processQueuedTask({
      id: '55555555-5555-4555-8555-555555555555',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {
        command: 'resume planner run',
      },
      result: {},
      topic: undefined,
    });

    expect(mockGetByTaskId).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_run: expect.objectContaining({
          id: 'run-1',
          status: 'processing',
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          executionRunId: 'run-1',
          executionRunStatus: 'processing',
        }),
      }),
    );
  });
});
