export class PerimeterGuard {
  private placeholderMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private counters: Record<string, number> = {
    NAME: 0,
    EMAIL: 0,
    PHONE: 0,
    ADDRESS: 0,
    ID: 0,
  };

  /**
   * Redacts Personally Identifiable Information (PII) from the given text.
   * Replaces sensitive data with semantic placeholders like [NAME_1], [EMAIL_1], etc.
   * 
   * @param text The text to redact
   * @returns An object containing the redacted text and the count of entities replaced
   */
  public redactPII(text: string): string {
    return this.redactPIIWithMetadata(text).redactedText;
  }

  public redactPIIWithMetadata(text: string): { redactedText: string; replacementCount: number } {
    let redacted = text;
    let initialCount = 0;
    for (const count of Object.values(this.counters)) {
        initialCount += count;
    }

    // 1. Email Addresses
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    redacted = redacted.replace(emailRegex, (match) => this.getPlaceholder(match, 'EMAIL'));

    // 2. Sensitive IDs (SSN, Credit Cards) - DO THESE BEFORE PHONE to avoid overlap
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
    redacted = redacted.replace(ssnRegex, (match) => this.getPlaceholder(match, 'ID'));
    
    const ccRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
    redacted = redacted.replace(ccRegex, (match) => this.getPlaceholder(match, 'ID'));

    // 3. Phone Numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
    redacted = redacted.replace(phoneRegex, (match) => this.getPlaceholder(match, 'PHONE'));

    const simplePhoneRegex = /\b\d{3}[-.\s]?\d{4}\b/g;
    redacted = redacted.replace(simplePhoneRegex, (match) => this.getPlaceholder(match, 'PHONE'));

    // 4. Physical Addresses
    const addressWithZipRegex = /\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+[A-Z][a-z]+,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?/g;
    redacted = redacted.replace(addressWithZipRegex, (match) => this.getPlaceholder(match, 'ADDRESS'));
    
    const zipRegex = /\b\d{5}(?:-\d{4})?\b/g;
    redacted = redacted.replace(zipRegex, (match) => this.getPlaceholder(match, 'ADDRESS'));

    // 5. Names (Capitalized sequences)
    // Matches "John Doe", "Jane Smith", "John von Neumann"
    // Fix: Ensure space is required between names even if particle is missing
    const nameRegex = /\b([A-Z][a-z]+(?:\s+(?:van|de|von|der))?\s+(?:[A-Z][a-z]+)+)\b/g;
    redacted = redacted.replace(nameRegex, (match) => {
      const commonWords = [
        'Meeting', 'Project', 'Department', 'Company', 
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 
        'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'My', 'Your', 'His', 'Her', 'Their', 'Our',
        'Tell', 'Ask', 'Call', 'Contact', 'Email', 'Message'
      ];
      if (commonWords.includes(match.split(' ')[0])) return match; // Check first word
      return this.getPlaceholder(match, 'NAME');
    });

    // Handle single names with context (e.g. "Meeting with John", "Email Alice")
    // Expanded context words to capture more natural language patterns
    const contextNameRegex = /\b(?:with|to|from|about|contact|call|email|msg|message|user|client|Tell|Ask)\s+([A-Z][a-z]+)\b/g;
    redacted = redacted.replace(contextNameRegex, (whole, name) => {
        const commonWords = ['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'My', 'Your', 'His', 'Her', 'Their', 'Our', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        if (commonWords.includes(name)) return whole;
        return whole.replace(name, this.getPlaceholder(name, 'NAME'));
    });

    // Catch remaining occurrences
    for (const [key, placeholder] of this.placeholderMap.entries()) {
      if (key.startsWith('NAME:')) {
        const fullName = key.split(':')[1];
        const parts = fullName.split(/\s+/);
        parts.forEach(part => {
          if (part.length > 2) {
            const partRegex = new RegExp(`\\b${part}\\b`, 'gi');
            redacted = redacted.replace(partRegex, (match) => {
                if (['with', 'the', 'and'].includes(match.toLowerCase())) return match;
                return placeholder;
            });
          }
        });
      }
    }

    let finalCount = 0;
    for (const count of Object.values(this.counters)) {
        finalCount += count;
    }

    return { 
        redactedText: redacted, 
        replacementCount: finalCount - initialCount 
    };
  }

  private getPlaceholder(value: string, type: string): string {
    const key = `${type}:${value.toLowerCase().trim()}`;
    if (this.placeholderMap.has(key)) {
      return this.placeholderMap.get(key)!;
    }
    this.counters[type]++;
    const placeholder = `[${type}_${this.counters[type]}]`;
    this.placeholderMap.set(key, placeholder);
    this.reverseMap.set(placeholder, value); // Store the original value for recovery
    return placeholder;
  }

  /**
   * Reverses the redaction by replacing placeholders with original values.
   * Useful for outgoing tool calls (e.g., sending an email).
   * 
   * @param text The redacted text
   * @returns The text with PII restored
   */
  public recoverPII(text: string): string {
    let recovered = text;
    // Sort keys by length descending to avoid partial replacements if placeholders were similar
    const placeholders = Array.from(this.reverseMap.keys()).sort((a, b) => b.length - a.length);
    
    for (const placeholder of placeholders) {
      const value = this.reverseMap.get(placeholder)!;
      // Escape bracketed placeholder for regex
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedPlaceholder, 'g');
      recovered = recovered.replace(regex, value);
    }
    return recovered;
  }
}
