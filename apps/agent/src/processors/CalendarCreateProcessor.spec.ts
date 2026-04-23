import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';

const { mockResolveToolName, mockExecuteWorkerTool } = vi.hoisted(() => ({
  mockResolveToolName: vi.fn(),
  mockExecuteWorkerTool: vi.fn(),
}));

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    resolveToolName: mockResolveToolName,
    executeWorkerTool: mockExecuteWorkerTool,
  },
}));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
  },
}));

describe('CalendarCreateProcessor', () => {
  let processor: CalendarCreateProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new CalendarCreateProcessor();

    mockResolveToolName.mockImplementation(async (_orgId: string, requestedTool: string) => {
      const mapping: Record<string, string | null> = {
        query_freebusy: 'query_freebusy',
        manage_event: 'manage_event',
      };

      return {
        requestedTool,
        resolvedTool: mapping[requestedTool] ?? null,
        availableTools: Object.values(mapping).filter(Boolean),
      };
    });

    mockExecuteWorkerTool.mockImplementation(async (_orgId: string, _workerType: string, requestedTool: string) => {
      if (requestedTool === 'query_freebusy') {
        return {
          toolName: 'query_freebusy',
          result: { calendars: { primary: { busy: [] } } },
        };
      }

      return {
        toolName: 'manage_event',
        result: { structuredContent: { id: 'evt-123' } },
      };
    });
  });

  it('creates a calendar event via the normalized manage_event tool', async () => {
    const result = await processor.process({
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        description: 'Discuss project',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T11:00:00Z',
        location: 'Virtual',
      },
    } as any);

    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      'org-1',
      'calendar',
      'manage_event',
      expect.objectContaining({
        action: 'create',
        summary: 'Meeting',
        start_time: '2026-01-01T10:00:00Z',
      }),
    );
    expect(result.tool_name).toBe('manage_event');
  });

  it('throws when required payload fields are missing', async () => {
    await expect(
      processor.process({
        id: 'task-123',
        organization_id: 'org-1',
        domain_action: 'calendar.create',
        payload: { summary: 'Meeting' },
      } as any),
    ).rejects.toThrow(/Missing required calendar fields/);
  });

  it('returns setup_required when create calendar tool is unavailable', async () => {
    mockResolveToolName.mockImplementation(async (_orgId: string, requestedTool: string) => ({
      requestedTool,
      resolvedTool: requestedTool === 'manage_event' ? null : 'query_freebusy',
      availableTools: ['query_freebusy'],
    }));

    const result = await processor.process({
      id: 'task-124',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T11:00:00Z',
      },
    } as any);

    expect(result.outcome).toBe('setup_required');
  });

  it('returns conflict_detected when freebusy reports overlaps', async () => {
    mockExecuteWorkerTool.mockImplementation(async (_orgId: string, _workerType: string, requestedTool: string) => {
      if (requestedTool === 'query_freebusy') {
        return {
          toolName: 'query_freebusy',
          result: {
            calendars: {
              primary: {
                busy: [{ start: '2026-01-01T10:15:00Z', end: '2026-01-01T10:45:00Z' }],
              },
            },
          },
        };
      }

      return {
        toolName: 'manage_event',
        result: { structuredContent: { id: 'evt-123' } },
      };
    });

    const result = await processor.process({
      id: 'task-124',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T11:00:00Z',
      },
    } as any);

    expect(result.outcome).toBe('conflict_detected');
  });

  it('uses update semantics for rescheduling existing events', async () => {
    const result = await processor.process({
      id: 'task-126',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2026-01-01T10:00:00Z',
        endTime: '2026-01-01T11:00:00Z',
        conflict_resolution: {
          action: 'reschedule_existing',
          event_external_id: 'evt-123',
          newStartTime: '2026-01-01T12:00:00Z',
          newEndTime: '2026-01-01T12:30:00Z',
        },
      },
    } as any);

    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      'org-1',
      'calendar',
      'manage_event',
      expect.objectContaining({
        action: 'update',
        event_id: 'evt-123',
      }),
    );
    expect(result.tool_name).toBe('manage_event');
  });
});
