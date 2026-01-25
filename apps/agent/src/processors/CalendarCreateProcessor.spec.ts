import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';
import { MCPService } from '../services/mcp.js';

// Mock dependencies
vi.mock('../services/mcp.js');

// Mock Supabase to prevent config validation error
vi.mock('../services/supabase.js', () => ({
  supabase: {}
}));

describe('CalendarCreateProcessor', () => {
  let processor: CalendarCreateProcessor;
  let mockExecuteTool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteTool = vi.fn().mockResolvedValue({ 
      content: [{ type: 'text', text: 'Event created' }] 
    });
    
    // Mock the MCPService class method
    MCPService.prototype.executeTool = mockExecuteTool;
    
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
