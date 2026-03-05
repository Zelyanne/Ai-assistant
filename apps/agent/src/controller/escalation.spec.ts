import { describe, it, expect, vi } from 'vitest';

describe('controller/escalation', () => {
  it('clamps CONFIDENCE_THRESHOLD from config', async () => {
    vi.resetModules();
    vi.doMock('../config/index.js', () => ({
      config: {
        CONFIDENCE_THRESHOLD: 2,
      },
    }));

    const mod = await import('./escalation.js');
    expect(mod.CONFIDENCE_THRESHOLD).toBe(1);
  });

  it('buildEscalationPayload returns stable, UI-ready shape', async () => {
    vi.resetModules();
    vi.doMock('../config/index.js', () => ({
      config: {
        CONFIDENCE_THRESHOLD: 0.8,
      },
    }));

    const mod = await import('./escalation.js');
    const payload = mod.buildEscalationPayload({
      reason: 'Low confidence',
      prompt: 'Please review',
      confidenceScore: 0.79,
      trigger: 'low_confidence',
      extra: {
        summary: 'Needs review',
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        escalation: true,
        reason: 'Low confidence',
        prompt: 'Please review',
        confidence_score: 0.79,
        confidence_threshold: 0.8,
        escalation_trigger: 'low_confidence',
        summary: 'Needs review',
      }),
    );
  });
});
