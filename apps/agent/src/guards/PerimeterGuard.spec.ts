import { describe, it, expect, beforeEach } from 'vitest';
import { PerimeterGuard } from './PerimeterGuard.js';

describe('PerimeterGuard', () => {
  let guard: PerimeterGuard;

  beforeEach(() => {
    guard = new PerimeterGuard();
  });

  describe('redactPII', () => {
    it('should redact names and use deterministic placeholders', () => {
      const text = 'Meeting with John Doe and Jane Smith. John Doe will arrive first.';
      const redacted = guard.redactPII(text);
      
      expect(redacted).toContain('[NAME_1]');
      expect(redacted).toContain('[NAME_2]');
      // John Doe should be replaced by the same placeholder both times
      const occurrencesOfName1 = (redacted.match(/\[NAME_1\]/g) || []).length;
      expect(occurrencesOfName1).toBe(2);
    });

    it('should redact email addresses', () => {
      const text = 'Contact alexis@example.com for more info.';
      const redacted = guard.redactPII(text);
      expect(redacted).toContain('[EMAIL_1]');
      expect(redacted).not.toContain('alexis@example.com');
    });

    it('should redact phone numbers', () => {
      const text = 'Call me at +1-555-0199 or 555-1234.';
      const redacted = guard.redactPII(text);
      expect(redacted).toContain('[PHONE_1]');
      expect(redacted).toContain('[PHONE_2]');
    });

    it('should redact physical addresses', () => {
      const text = 'I live at 123 Main St, Springfield, IL 62704.';
      const redacted = guard.redactPII(text);
      expect(redacted).toContain('[ADDRESS_1]');
    });

    it('should redact sensitive IDs (SSN, Credit Card)', () => {
      const ssnText = 'My SSN is 123-45-6789.';
      const ccText = 'My card is 4111-1111-1111-1111.';
      
      expect(guard.redactPII(ssnText)).toContain('[ID_1]');
      expect(guard.redactPII(ccText)).toContain('[ID_2]');
    });

    it('should redact single names with context', () => {
      const text = 'Tell John to buy milk.';
      const redacted = guard.redactPII(text);
      expect(redacted).toBe('Tell [NAME_1] to buy milk.');
    });

    it('should preserve logical coherence', () => {
      const text = 'Meeting with John at 5pm.';
      const redacted = guard.redactPII(text);
      expect(redacted).toBe('Meeting with [NAME_1] at 5pm.');
    });

    it('should allow recovering original PII', () => {
      const original = 'Send email to alexis@example.com regarding John Doe.';
      const redacted = guard.redactPII(original);
      const recovered = guard.recoverPII(redacted);
      
      expect(redacted).toContain('[EMAIL_1]');
      expect(redacted).toContain('[NAME_1]');
      expect(recovered).toBe(original);
    });
  });
});
