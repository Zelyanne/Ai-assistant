import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';
import { mcpService } from '../services/mcp.js';

// Mock dependencies
const { mockExecuteTool } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn()
}));

vi.mock('../services/mcp.js', () => ({
  MCPService: class {
    executeTool = mockExecuteTool;
  },
  mcpService: {
    executeTool: mockExecuteTool
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
});
