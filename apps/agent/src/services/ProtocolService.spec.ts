import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolService } from './ProtocolService.js';
import { supabase } from './supabase.js';
import { LLMProviderFactory } from './llm/factory.js';

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn()
        }))
      }))
    }))
  }
}));

const mockProvider = {
  generateText: vi.fn(),
  generateStructured: vi.fn()
};

vi.mock('./llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => mockProvider)
  }
}));

describe('ProtocolService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchProtocol', () => {
    it('should fetch the protocol for an organization', async () => {
      const mockProtocol = { content_markdown: '# My Protocol' };
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockProtocol, error: null })
      });

      const result = await ProtocolService.fetchProtocol('org-123');
      expect(result).toBe('# My Protocol');
      expect(supabase.from).toHaveBeenCalledWith('user_protocols');
    });

    it('should return null if no protocol is found', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await ProtocolService.fetchProtocol('org-123');
      expect(result).toBeNull();
    });
  });

  describe('generateProtocol', () => {
    it('should generate structured protocol using LLM', async () => {
      const mockPhilosophy = 'My leadership style is direct.';
      const mockResponse = {
        data: {
          markdown: '# Leadership Protocol\n...',
          metadata: {
            nudging_frequency_hours: 48,
            tone: 'direct',
            escalation_threshold: 0.9,
            preferred_channels: ['slack']
          }
        }
      };

      const provider = LLMProviderFactory.getProvider();
      (provider.generateStructured as any).mockResolvedValue(mockResponse);

      const result = await ProtocolService.generateProtocol(mockPhilosophy);

      expect(provider.generateStructured).toHaveBeenCalledWith(
        expect.stringContaining(mockPhilosophy),
        expect.anything()
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('keeps generateStructured happy-path compatibility without resilience options', async () => {
      const mockResponse = {
        data: {
          markdown: '# Leadership Protocol\n...',
          metadata: {
            nudging_frequency_hours: 24,
            tone: 'direct',
            escalation_threshold: 0.8,
            preferred_channels: ['email']
          }
        }
      };

      const provider = LLMProviderFactory.getProvider();
      (provider.generateStructured as any).mockResolvedValue(mockResponse);

      await ProtocolService.generateProtocol('Keep it concise');

      expect((provider.generateStructured as any).mock.calls[0]).toHaveLength(2);
    });
  });

  describe('saveProtocol', () => {
    it('should upsert protocol to supabase', async () => {
      (supabase.from as any).mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          error: null
        })
      });

      await ProtocolService.saveProtocol(
        'org-1',
        'user-1',
        'Title',
        '# Content',
        { tone: 'direct' }
      );

      expect(supabase.from).toHaveBeenCalledWith('user_protocols');
      expect((supabase.from('user_protocols') as any).upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: 'org-1',
          user_id: 'user-1',
          content_markdown: '# Content'
        }),
        expect.any(Object)
      );
    });

    it('should throw error on upsert failure', async () => {
      (supabase.from as any).mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          error: { message: 'DB Error' }
        })
      });

      await expect(ProtocolService.saveProtocol(
        'org-1',
        'user-1',
        'Title',
        '# Content',
        {}
      )).rejects.toThrow('Failed to save protocol: DB Error');
    });
  });

  describe('suggestOptimizations', () => {
    it('should return null if no protocol is found', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      });

      const result = await ProtocolService.suggestOptimizations('org-1');
      expect(result).toBeNull();
    });

    it('should return a suggestion when friction evidence exists', async () => {
      const orgId = '123e4567-e89b-12d3-a456-426614174001';
      // 1. Mock protocol
      const mockProtocol = { content_markdown: '# My Protocol\n\n## Nudging Rules\nNudge every 2 days.' };
      
      // 2. Mock logs and tasks
      const mockLogs = [
        { id: '123e4567-e89b-12d3-a456-426614174101', task_id: '123e4567-e89b-12d3-a456-426614174201', action_taken: 'Escalation', created_at: new Date().toISOString() },
        { id: '123e4567-e89b-12d3-a456-426614174102', task_id: '123e4567-e89b-12d3-a456-426614174202', action_taken: 'Escalation', created_at: new Date().toISOString() },
        { id: '123e4567-e89b-12d3-a456-426614174103', task_id: '123e4567-e89b-12d3-a456-426614174203', action_taken: 'Escalation', created_at: new Date().toISOString() },
      ];
      const mockTasks = [
        { id: '123e4567-e89b-12d3-a456-426614174201', status: 'escalation', domain_action: 'email.draft', created_at: new Date().toISOString() },
        { id: '123e4567-e89b-12d3-a456-426614174202', status: 'escalation', domain_action: 'email.draft', created_at: new Date().toISOString() },
        { id: '123e4567-e89b-12d3-a456-426614174203', status: 'escalation', domain_action: 'email.draft', created_at: new Date().toISOString() },
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'user_protocols') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProtocol, error: null })
          };
        }
        if (table === 'agent_activity_log') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockLogs, error: null })
          };
        }
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockTasks, error: null })
          };
        }
      });

      // 3. Mock LLM suggestion
      const mockSuggestion = {
        should_suggest: true,
        reason: 'Repeated escalations on email.draft',
        suggestion: {
          nl_diff_summary: 'Increase nudging frequency',
          rationale: 'Users are repeatedly escalating email drafts.',
          evidence_task_ids: ['123e4567-e89b-12d3-a456-426614174201', '123e4567-e89b-12d3-a456-426614174202', '123e4567-e89b-12d3-a456-426614174203'],
          evidence_log_ids: ['123e4567-e89b-12d3-a456-426614174101', '123e4567-e89b-12d3-a456-426614174102', '123e4567-e89b-12d3-a456-426614174103'],
          markdown_section: 'Nudging Rules',
          old_content: 'Nudge every 2 days.',
          new_content: 'Nudge every 1 day.',
          metadata_changes: { nudging_frequency_hours: 24 }
        }
      };

      const provider = LLMProviderFactory.getProvider();
      (provider.generateStructured as any).mockResolvedValue({ data: mockSuggestion });

      const result = await ProtocolService.suggestOptimizations(orgId);
      
      expect(result).not.toBeNull();
      expect(result?.nl_diff_summary).toBe('Increase nudging frequency');
      expect(result?.evidence_task_ids).toHaveLength(3);
      expect(provider.generateStructured).toHaveBeenCalled();
    });
  });
});
