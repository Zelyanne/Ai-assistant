import type { EscalationResult, EscalationTrigger, Json } from '@ai-assistant/shared';
import { config as appConfig } from '../config/index.js';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export function resolveConfidenceThreshold(rawThreshold: number): number {
  if (!Number.isFinite(rawThreshold)) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }

  if (rawThreshold < 0) {
    return 0;
  }

  if (rawThreshold > 1) {
    return 1;
  }

  return rawThreshold;
}

// Deterministic source-of-truth: env baseline CONFIDENCE_THRESHOLD, clamped to [0..1].
export const CONFIDENCE_THRESHOLD = resolveConfidenceThreshold(appConfig.CONFIDENCE_THRESHOLD);

function sanitizeConfidenceScore(confidenceScore?: number): number | undefined {
  if (typeof confidenceScore !== 'number' || Number.isNaN(confidenceScore)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, confidenceScore));
}

interface EscalationPayloadOptions {
  reason: string;
  prompt: string;
  confidenceScore?: number;
  trigger?: EscalationTrigger;
  extra?: Record<string, Json | undefined>;
}

export function buildEscalationPayload(
  options: EscalationPayloadOptions,
): EscalationResult & Record<string, Json | undefined> {
  const confidenceScore = sanitizeConfidenceScore(options.confidenceScore);

  return {
    escalation: true,
    reason: options.reason,
    prompt: options.prompt,
    confidence_threshold: CONFIDENCE_THRESHOLD,
    ...(confidenceScore !== undefined ? { confidence_score: confidenceScore } : {}),
    ...(options.trigger ? { escalation_trigger: options.trigger } : {}),
    ...(options.extra ?? {}),
  };
}
