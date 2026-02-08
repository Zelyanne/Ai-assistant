import { BaseProcessor } from './BaseProcessor.js';
import { EmailDraftProcessor } from './EmailDraftProcessor.js';
import { EmailTriageProcessor } from './EmailTriageProcessor.js';
import { ThreadSummarizer } from './ThreadSummarizer.js';
import { CalendarCreateProcessor } from './CalendarCreateProcessor.js';
import { ProtocolGenerateProcessor } from './ProtocolGenerateProcessor.js';
import { MorningBriefProcessor } from './MorningBriefProcessor.js';

export class ProcessorRegistry {
  private static processors: Map<string, BaseProcessor> = new Map();

  static {
    this.processors.set('email.draft', new EmailDraftProcessor());
    this.processors.set('email.triage', new EmailTriageProcessor());
    this.processors.set('email.summarize', new ThreadSummarizer());
    this.processors.set('calendar.create', new CalendarCreateProcessor());
    this.processors.set('protocol.generate', new ProtocolGenerateProcessor());
    this.processors.set('morning.brief', new MorningBriefProcessor());
  }


  static getProcessor(domainAction: string): BaseProcessor | undefined {
    return this.processors.get(domainAction);
  }

  static getAllSupportedDomains(): string[] {
    return Array.from(this.processors.keys());
  }
}
