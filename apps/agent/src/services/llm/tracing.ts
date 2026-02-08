import { CallbackHandler } from '@langfuse/langchain';
import { config } from '../../config/index.js';
import { flushOTel } from './otel-setup.js';

/**
 * TracingService provides a centralized, resilient Langfuse CallbackHandler.
 * Implements a circuit breaker to ensure Langfuse connectivity issues don't
 * impact core agent functionality.
 */
export class TracingService {
  private static instance: TracingService;
  private handler: CallbackHandler | null = null;
  private failureCount: number = 0;
  private readonly failureThreshold: number = 3;
  private tracingEnabled: boolean = config.ENABLE_LANGFUSE_TRACING;
  private lastFailureTime: number = 0;
  private readonly cooldownPeriod: number = 60000; // 1 minute cooldown

  private constructor() {
    this.initHandler();
  }

  public static getInstance(): TracingService {
    if (!TracingService.instance) {
      TracingService.instance = new TracingService();
    }
    return TracingService.instance;
  }

  /**
   * Initializes the Langfuse CallbackHandler if enabled in config.
   */
  private initHandler(): void {
    if (!this.tracingEnabled) {
      console.log('[Tracing] Langfuse tracing is disabled via config.');
      return;
    }

    try {
      // In v4+, it expects standard Langfuse client params if provided
      this.handler = new CallbackHandler();
      console.log(`[Tracing] Langfuse CallbackHandler initialized.`);
    } catch (error) {
      console.error('[Tracing] Failed to initialize Langfuse handler:', error);
      this.tracingEnabled = false;
    }
  }

  /**
   * Flushes any pending traces to Langfuse.
   */
  public async flush(): Promise<void> {
    if (this.tracingEnabled) {
      await flushOTel();
    }
  }

  /**
   * Returns the CallbackHandler if tracing is enabled and circuit is not open.
   * Returns null otherwise.
   */
  public getHandler(): CallbackHandler | null {
    if (!this.tracingEnabled || !this.handler) {
      return null;
    }

    // Check circuit breaker status
    if (this.failureCount >= this.failureThreshold) {
      const now = Date.now();
      if (now - this.lastFailureTime < this.cooldownPeriod) {
        // Circuit is OPEN
        return null;
      } else {
        // Circuit is HALF-OPEN: try again
        console.log('[Tracing] Circuit breaker half-open, attempting trace retry...');
      }
    }

    return this.handler;
  }

  /**
   * Call this if a tracing-related operation fails to trip the circuit breaker.
   */
  public handleFailure(error: any): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Tracing] Trace operation failure detected: ${message}`);
    
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      console.error('[Tracing] Circuit breaker TRIPPED (OPEN). Tracing temporarily disabled.');
    }
  }

  /**
   * Call this on successful LLM operations to reset failure count.
   */
  public handleSuccess(): void {
    if (this.failureCount > 0) {
      console.log('[Tracing] Successful operation. Resetting tracing failure count.');
      this.failureCount = 0;
    }
  }

  /**
   * Re-checks and potentially re-enables tracing if it was disabled due to init failure.
   */
  public refresh(): void {
    this.tracingEnabled = config.ENABLE_LANGFUSE_TRACING;
    this.failureCount = 0;
    if (!this.handler) {
      this.initHandler();
    }
  }
}

export const tracingService = TracingService.getInstance();
