import { BaseProcessor } from "./BaseProcessor.js";
import { EmailDraftProcessor } from "./EmailDraftProcessor.js";
import { EmailTriageProcessor } from "./EmailTriageProcessor.js";
import { ThreadSummarizer } from "./ThreadSummarizer.js";
import { CalendarCreateProcessor } from "./CalendarCreateProcessor.js";
import { ProtocolGenerateProcessor } from "./ProtocolGenerateProcessor.js";
import { MorningBriefProcessor } from "./MorningBriefProcessor.js";
import { EmailSendProcessor } from "./EmailSendProcessor.js";
import { RelancingNudgeProcessor } from "./RelancingNudgeProcessor.js";
import { ChannelSendProcessor } from "./ChannelSendProcessor.js";
import { RelancingUpdateProcessor } from "./RelancingUpdateProcessor.js";
import { StatusReportProcessor } from "./StatusReportProcessor.js";
import { AssistantCommandProcessor } from "./AssistantCommandProcessor.js";
import { ProtocolUpdateProcessor } from "./ProtocolUpdateProcessor.js";
import { ProtocolOptimizationProcessor } from "./ProtocolOptimizationProcessor.js";
import { EODMemoryProcessor } from "./EODMemoryProcessor.js";

export class ProcessorRegistry {
  private static processors: Map<string, BaseProcessor> = new Map();

  static {
    this.processors.set("email.draft", new EmailDraftProcessor());
    this.processors.set("email.send", new EmailSendProcessor());
    this.processors.set("email.triage", new EmailTriageProcessor());
    this.processors.set("email.summarize", new ThreadSummarizer());
    this.processors.set("calendar.create", new CalendarCreateProcessor());
    this.processors.set("protocol.generate", new ProtocolGenerateProcessor());
    this.processors.set("protocol.update", new ProtocolUpdateProcessor());
    this.processors.set("morning.brief", new MorningBriefProcessor());
    this.processors.set("relancing.nudge", new RelancingNudgeProcessor());
    this.processors.set("relancing.update", new RelancingUpdateProcessor());
    this.processors.set("status.report", new StatusReportProcessor());
    this.processors.set("channel.send", new ChannelSendProcessor());
    this.processors.set("assistant.command", new AssistantCommandProcessor());
    this.processors.set(
      "system.optimize_protocol",
      new ProtocolOptimizationProcessor(),
    );
    this.processors.set("eod.memory.rotate", new EODMemoryProcessor());
  }

  static getProcessor(domainAction: string): BaseProcessor | undefined {
    return this.processors.get(domainAction);
  }

  static getAllSupportedDomains(): string[] {
    return Array.from(this.processors.keys());
  }
}
