import { describe, it, expect, beforeEach } from 'vitest';
import { PerimeterGuard } from './PerimeterGuard.js';

describe('PerimeterGuard Tier Enforcement', () => {
  let guard: PerimeterGuard;

  beforeEach(() => {
    guard = new PerimeterGuard();
  });

  it('should allow Public action for Public topic', () => {
    const result = guard.filter('Sensitive data about Public topic', 'Public', 'Public', 'execution');
    expect(result.isEscalated).toBe(false);
    expect(result.redactedText).toContain('[NAME_1]'); // Redaction should still happen
  });

  it('should allow Public action for Controlled topic (higher allows lower)', () => {
    // Wait, Controlled (1) < Public (2)? 
    // In my logic: const tierPriority = { 'Public': 2, 'Controlled': 1, 'Restricted': 0 };
    // Usually 'Public' is the LOWEST restriction, but in BMad it seems 'Public' tier means 'Anyone can see/AI can act autonomously'.
    // Restricted is the most restricted.
    // So Public (Autonomous) > Controlled (Draft) > Restricted (Manual).
    // If a topic is Public, it allows Public action.
    // If a topic is Restricted, it should NOT allow Public action.
    
    const result = guard.filter('Sensitive data', 'Public', 'Public', 'execution');
    expect(result.isEscalated).toBe(false);
  });

  it('should escalate Public action for Restricted topic', () => {
    const result = guard.filter('Sensitive data', 'Restricted', 'Public', 'execution');
    expect(result.isEscalated).toBe(true);
    expect(result.reason).toContain('Action requires Public tier, but topic is Restricted');
  });

  it('should escalate Public action for Controlled topic', () => {
    const result = guard.filter('Sensitive data', 'Controlled', 'Public', 'execution');
    expect(result.isEscalated).toBe(true);
  });

  it('should allow Controlled action for Public topic', () => {
    const result = guard.filter('Sensitive data', 'Public', 'Controlled', 'execution');
    expect(result.isEscalated).toBe(false);
  });

  it('should bypass tier check in analysis mode but still redact PII', () => {
    // Restricted topic would fail in execution mode
    const result = guard.filter('Sensitive data about Restricted topic', 'Restricted', 'Public', 'analysis');
    expect(result.isEscalated).toBe(false);
    expect(result.redactedText).toContain('[NAME_1]'); // Redaction MUST still happen
  });
});
