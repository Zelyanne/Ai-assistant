import { BaseProcessor } from './BaseProcessor.js';
import { EmailDraftProcessor } from './EmailDraftProcessor.js';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';
import { SystemAnalyzeProcessor } from './SystemAnalyzeProcessor.js';

export class ProcessorRegistry {
  private static processors: Map<string, BaseProcessor> = new Map();

  static {
    this.processors.set('email.draft', new EmailDraftProcessor());
    this.processors.set('calendar.create', new CalendarCreateProcessor());
    this.processors.set('system.analyze', new SystemAnalyzeProcessor());
  }

  static getProcessor(domainAction: string): BaseProcessor | undefined {
    return this.processors.get(domainAction);
  }

  static getAllSupportedDomains(): string[] {
    return Array.from(this.processors.keys());
  }
}
