import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolService } from './ProtocolService.js';
import { supabase } from './supabase.js';
import { LLMProviderFactory } from './llm/factory.js';
import { Task } from '@ai-assistant/shared';

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

  describe('extractRules', () => {
    it('should extract rules from protocol markdown based on task', async () => {
      const mockTask: Partial<Task> = {
        domain_action: 'email.draft',
        payload: { subject: 'Hello' }
      };
      const mockLLMResponse = {
        data: '1. Use professional tone.\n2. Be concise.',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, latencyMs: 100 },
        model: 'mistral'
      };

      const provider = LLMProviderFactory.getProvider();
      (provider.generateText as any).mockResolvedValue(mockLLMResponse);

      const result = await ProtocolService.extractRules('# Protocol Content', mockTask as Task);
      expect(result).toBe('1. Use professional tone.\n2. Be concise.');
      expect(provider.generateText).toHaveBeenCalled();
    });
  });
});
