import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';

// Mock dependencies
const { mockExecuteTool, mockGetLangChainTools } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn(),
  mockGetLangChainTools: vi.fn(),
}));

vi.mock('../services/mcp.js', () => ({
  MCPService: class {
    executeTool = mockExecuteTool;
    getLangChainTools = mockGetLangChainTools;
  },
  mcpService: {
    executeTool: mockExecuteTool,
    getLangChainTools: mockGetLangChainTools,
  }
}));


// Mock Supabase to prevent config validation error
vi.mock('../services/supabase.js', () => ({
  supabase: {}
}));

describe('CalendarCreateProcessor', () => {
  let processor: CalendarCreateProcessor;

  beforeEach(() => {

    vi.clearAllMocks();
    mockGetLangChainTools.mockResolvedValue([
      { name: 'create_calendar_event' },
      { name: 'patch_calendar_event' },
    ]);
    mockExecuteTool.mockResolvedValue({ 
      content: [{ type: 'text', text: 'Event created' }] 
    });
    
    processor = new CalendarCreateProcessor();
  });


  it('should successfully create a calendar event via MCP', async () => {
    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        description: 'Discuss project',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
        location: 'Virtual'
      }
    };

    const result = await processor.process(task as any);

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'org-1',
      'create_calendar_event',
      expect.objectContaining({
        calendarId: 'primary',
        event: expect.objectContaining({
          summary: 'Meeting',
          description: 'Discuss project',
          start: { dateTime: '2023-01-01T10:00:00Z' },
          end: { dateTime: '2023-01-01T11:00:00Z' },
          location: 'Virtual'
        })
      })
    );

    expect(result.message).toContain('successfully');
  });

  it('should throw error when required payload fields are missing', async () => {
    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting'
        // Missing times
      }
    };

    await expect(processor.process(task as any)).rejects.toThrow(/Missing required calendar fields/);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should return setup_required when create calendar tool is unavailable', async () => {
    mockGetLangChainTools.mockResolvedValueOnce([{ name: 'query_calendar_freebusy' }]);

    const task = {
      id: 'task-124',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
      }
    };

    const result = await processor.process(task as any);

    expect(result.outcome).toBe('setup_required');
    expect(String(result.prompt)).toContain('setup_required');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should return setup_required when create tool lacks permissions', async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error('403 insufficient permissions for calendar scope'));

    const task = {
      id: 'task-125',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
      }
    };

    const result = await processor.process(task as any);

    expect(result.outcome).toBe('setup_required');
    expect(String(result.prompt)).toContain('permissions');
  });

  it('should use patch/update semantics for rescheduling existing events', async () => {
    const task = {
      id: 'task-126',
      organization_id: 'org-1',
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2023-01-01T10:00:00Z',
        endTime: '2023-01-01T11:00:00Z',
        conflict_resolution: {
          action: 'reschedule_existing',
          event_external_id: 'evt-123',
          newStartTime: '2023-01-01T12:00:00Z',
          newEndTime: '2023-01-01T12:30:00Z',
        }
      }
    };

    const result = await processor.process(task as any);

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'org-1',
      'patch_calendar_event',
      expect.objectContaining({
        eventId: 'evt-123',
        event: {
          start: { dateTime: '2023-01-01T12:00:00Z' },
          end: { dateTime: '2023-01-01T12:30:00Z' },
        },
      }),
    );
    expect(result.resolution_action).toBe('reschedule_existing');
  });
});
