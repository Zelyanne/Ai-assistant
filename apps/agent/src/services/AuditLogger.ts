import { supabase } from "./supabase.js";
import { ReasoningStep, Citation, Database } from "@ai-assistant/shared";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";

type AgentActivityLogInsert =
  Database["public"]["Tables"]["agent_activity_log"]["Insert"];

export class AuditLogger {
  /**
   * Helper to create a reasoning step with consistent structure and timestamp.
   */
  static createStep(
    step_name: string,
    message: string,
    options: Partial<
      Omit<ReasoningStep, "step_name" | "message" | "timestamp">
    > = {},
  ): ReasoningStep {
    return {
      timestamp: new Date().toISOString(),
      step_name,
      message,
      ...options,
    };
  }

  /**
   * Helper to create a citation with consistent structure.
   */
  static createCitation(
    source_type: string,
    source_id: string,
    description: string,
    link: string = "",
  ): Citation {
    return {
      source_type,
      source_id,
      description,
      link,
    };
  }

  /**
   * Persists the complete reasoning trace and citations to the agent_activity_log.
   */
  static async flush(
    organizationId: string,
    taskId: string | null,
    agentId: string,
    actionTaken: string,
    trace: ReasoningStep[],
    citations: Citation[],
  ): Promise<void> {
    const guard = new PerimeterGuard();

    // 1. Ensure stable task citation if taskId exists
    const finalCitations = [...citations];
    if (
      taskId &&
      !finalCitations.some(
        (c) => c.source_type === "task" && c.source_id === taskId,
      )
    ) {
      finalCitations.unshift(
        this.createCitation("task", taskId, "Originating task"),
      );
    }

    // 2. Redact PII from all free-form strings in trace and citations
    const redactedTrace = trace.map((step) => ({
      ...step,
      message: guard.redactPII(step.message),
      input_summary: step.input_summary
        ? guard.redactPII(step.input_summary)
        : undefined,
      output_summary: step.output_summary
        ? guard.redactPII(step.output_summary)
        : undefined,
    }));

    const redactedCitations = finalCitations.map((citation) => ({
      ...citation,
      description: guard.redactPII(citation.description),
    }));

    // Explicitly type the payload to match Supabase generated types
    const logData: AgentActivityLogInsert = {
      organization_id: organizationId,
      task_id: taskId,
      agent_id: agentId,
      action_taken: actionTaken,
      reasoning_trace:
        redactedTrace as unknown as Database["public"]["Tables"]["agent_activity_log"]["Row"]["reasoning_trace"],
      citations:
        redactedCitations as unknown as Database["public"]["Tables"]["agent_activity_log"]["Row"]["citations"],
    };

    const { error } = await supabase.from("agent_activity_log").insert(logData);

    if (error) {
      console.error(
        `[AuditLogger][${taskId}] Failed to flush log:`,
        error.message,
      );
      throw new Error(`Audit logging failed: ${error.message}`);
    }
  }
}
