import { DeliveryRetryDecision, DeliveryRetryDecisionSchema } from '@ai-assistant/shared';

export interface RetryPolicyInput {
  attempt_count: number;
  max_attempts: number;
  base_delay_ms?: number;
  max_delay_ms?: number;
  error_message?: string;
}

export function evaluateBoundedRetryPolicy(input: RetryPolicyInput): DeliveryRetryDecision {
  const attemptCount = Math.max(0, Math.trunc(input.attempt_count));
  const maxAttempts = Math.max(1, Math.trunc(input.max_attempts));
  const baseDelayMs = input.base_delay_ms ?? 500;
  const maxDelayMs = input.max_delay_ms ?? 30_000;

  if (attemptCount >= maxAttempts) {
    return DeliveryRetryDecisionSchema.parse({
      should_retry: false,
      next_delay_ms: null,
      attempt_count: attemptCount,
      terminal: true,
      reason: input.error_message ?? 'retry_budget_exhausted',
    });
  }

  const exponentialDelay = baseDelayMs * 2 ** Math.max(0, attemptCount - 1);
  const boundedDelay = Math.min(maxDelayMs, Math.max(baseDelayMs, Math.round(exponentialDelay)));

  return DeliveryRetryDecisionSchema.parse({
    should_retry: true,
    next_delay_ms: boundedDelay,
    attempt_count: attemptCount,
    terminal: false,
    reason: input.error_message,
  });
}
