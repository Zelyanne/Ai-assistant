import { z } from "zod";
import { supabase } from "./supabase.js";
import { LLMProviderFactory } from "./llm/factory.js";
import {
  Task,
  ProtocolGenerationResultSchema,
  ProtocolGenerationResult,
  ProtocolOptimizationSuggestion,
  ProtocolOptimizationSuggestionSchema,
} from "@ai-assistant/shared";
import type { Json, Database } from "@ai-assistant/shared";

type JsonValue = Json;
type JsonRecord = Record<string, JsonValue | undefined>;

interface OptimizationContext {
  protocolMarkdown: string;
  activityLogs: Array<{
    id: string;
    task_id: string | null;
    action_taken: string;
    reasoning_trace: unknown;
    citations: unknown;
    created_at: string;
  }>;
  recentTasks: Array<{
    id: string;
    domain_action: string;
    status: string;
    payload: unknown;
    result: unknown;
    created_at: string;
  }>;
  lookbackDays: number;
  minFrictionEvents: number;
}

interface SuggestOptimizationsOptions {
  lookbackDays?: number;
  minFrictionEvents?: number;
  sourceTaskId?: string;
}

/**
 * ProtocolService
 * - Fetch / extract / generate / save leadership protocols
 * - Suggest protocol optimizations from operational evidence
 */
export class ProtocolService {
  /**
   * Fetches the protocol markdown for an organization.
   */
  static async fetchProtocol(organizationId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("user_protocols")
        .select("content_markdown")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) {
        console.error(
          `[ProtocolService] Error fetching protocol for org ${organizationId}:`,
          error.message,
        );
        return null;
      }

      return data?.content_markdown || null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ProtocolService] Unexpected error fetching protocol: ${message}`,
      );
      return null;
    }
  }

  /**
   * Extracts actionable rules from protocol markdown for a specific task using LLM.
   */
  static async extractRules(protocolMd: string, task: Task): Promise<string> {
    const provider = LLMProviderFactory.getProvider();

    const prompt = `
      You are an expert at extracting actionable rules from a natural language leadership protocol.

      Protocol:
      """
      ${protocolMd}
      """

      Current Task:
      Domain Action: ${task.domain_action}
      Payload: ${JSON.stringify(task.payload)}

      Instructions:
      1. Analyze the protocol above.
      2. Extract ONLY the rules, constraints, and guidelines that apply to the current task.
      3. Format the rules as a concise bulleted list.
      4. If the protocol explicitly mandates a specific agency tier for this context, you MUST include a line exactly like this: "Required Agency Tier: [Public/Controlled/Restricted]".
      5. If no specific rules apply, provide general professional guidelines consistent with the protocol.
      6. Include citations to the protocol sections if possible, e.g., [Source: Section Name].

      Actionable Rules:
    `;

    const response = await provider.generateText(prompt, { temperature: 0.1 });
    return response.data;
  }

  /**
   * Generates a structured protocol from a natural language philosophy description.
   */
  static async generateProtocol(
    philosophy: string,
  ): Promise<ProtocolGenerationResult> {
    const provider = LLMProviderFactory.getProvider();

    const prompt = `
      You are an expert at creating structured leadership protocols for AI agents.
      Convert the following natural language description of a leader's philosophy and leadership style into a comprehensive, structured Markdown protocol AND a machine-readable JSON metadata object.

      User Philosophy:
      """
      ${philosophy}
      """

      Instructions for Markdown:
      1. Create a well-structured Markdown document with clear headers.
      2. The protocol MUST include the following sections:
         - **Objectives**: Primary goals for the AI agent when acting on behalf of the user.
         - **Nudging Rules**: How and when the AI should nudge the user or team members.
         - **Agency Tier Overrides**: Explicit rules for when actions should be Public, Controlled, or Restricted.
         - **Escalation Logic**: Criteria for when the AI must stop and ask for human intervention.
      3. Use a professional, executive tone.

      Instructions for JSON Metadata:
      Extract the following parameters:
      - nudging_frequency_hours: An integer representing how often to nudge (e.g., 24).
      - tone: A string describing the agent's tone (e.g., "supportive").
      - escalation_threshold: A float between 0 and 1 representing confidence required.
      - preferred_channels: An array of strings (e.g., ["email", "slack"]).

      Your output must strictly follow the ProtocolGenerationResult schema.
    `;

    const response = await provider.generateStructured(
      prompt,
      ProtocolGenerationResultSchema,
    );
    return response.data as ProtocolGenerationResult;
  }

  /**
   * Saves a protocol to the user_protocols table.
   */
  static async saveProtocol(
    organizationId: string,
    userId: string,
    title: string,
    contentMd: string,
    metadata: Json,
  ): Promise<void> {
    const row: Database["public"]["Tables"]["user_protocols"]["Insert"] = {
      organization_id: organizationId,
      user_id: userId,
      title,
      content_markdown: contentMd,
      metadata,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("user_protocols").upsert(row, {
      onConflict: "organization_id",
    });

    if (error) {
      throw new Error(`Failed to save protocol: ${error.message}`);
    }
  }

  /**
   * Suggests a conservative protocol optimization based on recent operational evidence.
   * Returns null when no clear, evidence-backed optimization is found.
   */
  static async suggestOptimizations(
    organizationId: string,
    options: SuggestOptimizationsOptions = {},
  ): Promise<ProtocolOptimizationSuggestion | null> {
    const lookbackDays = options.lookbackDays ?? 14;
    const minFrictionEvents = options.minFrictionEvents ?? 3;

    const protocolMarkdown = await this.fetchProtocol(organizationId);
    if (!protocolMarkdown) {
      return null;
    }

    const context = await this.loadOptimizationContext(organizationId, {
      protocolMarkdown,
      lookbackDays,
      minFrictionEvents,
    });

    const suggestion = await this.generateOptimizationSuggestion(
      context,
      organizationId,
      options.sourceTaskId,
    );
    return suggestion;
  }

  private static async loadOptimizationContext(
    organizationId: string,
    input: {
      protocolMarkdown: string;
      lookbackDays: number;
      minFrictionEvents: number;
    },
  ): Promise<OptimizationContext> {
    const sinceIso = new Date(
      Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [logsRes, tasksRes] = await Promise.all([
      supabase
        .from("agent_activity_log")
        .select(
          "id, task_id, action_taken, reasoning_trace, citations, created_at",
        )
        .eq("organization_id", organizationId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("tasks")
        .select("id, domain_action, status, payload, result, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (logsRes.error) {
      throw new Error(
        `Failed to load agent_activity_log: ${logsRes.error.message}`,
      );
    }
    if (tasksRes.error) {
      throw new Error(`Failed to load tasks: ${tasksRes.error.message}`);
    }

    return {
      protocolMarkdown: input.protocolMarkdown,
      activityLogs: (logsRes.data ?? []).map((row) => ({
        id: row.id,
        task_id: row.task_id,
        action_taken: row.action_taken,
        reasoning_trace: row.reasoning_trace,
        citations: row.citations,
        created_at: row.created_at,
      })),
      recentTasks: (tasksRes.data ?? []).map((row) => ({
        id: row.id,
        domain_action: row.domain_action,
        status: row.status,
        payload: row.payload,
        result: row.result,
        created_at: row.created_at,
      })),
      lookbackDays: input.lookbackDays,
      minFrictionEvents: input.minFrictionEvents,
    };
  }

  private static async generateOptimizationSuggestion(
    context: OptimizationContext,
    organizationId: string,
    sourceTaskId?: string,
  ): Promise<ProtocolOptimizationSuggestion | null> {
    const provider = LLMProviderFactory.getProvider();

    const frictionHints = this.deriveFrictionHints(
      context.recentTasks,
      context.activityLogs,
    );

    const prompt = `
You are a conservative protocol optimization analyst.

Goal:
- Suggest at most ONE protocol optimization if there is clear evidence of recurring friction.
- If evidence is weak, return {"should_suggest": false, "reason": "..."}.

Evidence policy:
- Only suggest if there are at least ${context.minFrictionEvents} meaningful friction signals.
- CRITICAL: Prioritize "User Manual Overrides" and "Setup Required" loops as the strongest signals.
- Repeated escalations due to low confidence are also valid but secondary to direct user corrections.
- Do not invent evidence. Use only provided task IDs and log IDs.

You are given:
1) Current protocol markdown
2) Recent tasks
3) Recent agent activity logs
4) Heuristic friction hints

Output JSON schema:
{
  "should_suggest": boolean,
  "reason": string,
  "suggestion": {
    "nl_diff_summary": string,
    "rationale": string,
    "evidence_task_ids": string[],
    "evidence_log_ids": string[],
    "markdown_section": string,
    "old_content": string,
    "new_content": string,
    "metadata_changes": object
  }
}

Current protocol markdown:
"""
${context.protocolMarkdown}
"""

Heuristic friction hints:
${JSON.stringify(frictionHints, null, 2)}

Recent tasks (most recent first):
${JSON.stringify(context.recentTasks, null, 2)}

Recent activity logs (most recent first):
${JSON.stringify(context.activityLogs, null, 2)}
`;

    const response = await provider.generateStructured(
      prompt,
      this.optimizationLLMResultSchema(),
      { temperature: 0.1, maxTokens: 1800 },
    );

    const result = response.data;
    if (!result.should_suggest || !result.suggestion) {
      return null;
    }

    return ProtocolOptimizationSuggestionSchema.parse({
      organization_id: organizationId,
      source_task_id: sourceTaskId,
      nl_diff_summary: result.suggestion.nl_diff_summary,
      rationale: result.suggestion.rationale,
      evidence_task_ids: result.suggestion.evidence_task_ids,
      evidence_log_ids: result.suggestion.evidence_log_ids,
      markdown_section: result.suggestion.markdown_section,
      old_content: result.suggestion.old_content,
      new_content: result.suggestion.new_content,
      metadata_changes: result.suggestion.metadata_changes,
      status: "review",
    });
  }

  private static optimizationLLMResultSchema() {
    return z.object({
      should_suggest: z.boolean(),
      reason: z.string(),
      suggestion: z
        .object({
          nl_diff_summary: z.string().min(1),
          rationale: z.string().min(1),
          evidence_task_ids: z.array(z.string()).default([]),
          evidence_log_ids: z.array(z.string()).default([]),
          markdown_section: z.string().min(1),
          old_content: z.string().min(1),
          new_content: z.string().min(1),
          metadata_changes: z.record(z.unknown()).default({}),
        })
        .optional(),
    });
  }

  private static deriveFrictionHints(
    tasks: OptimizationContext["recentTasks"],
    logs: OptimizationContext["activityLogs"],
  ): {
    escalationCount: number;
    setupRequiredCount: number;
    pausedCount: number;
    repeatedDomainEscalations: Array<{ domain_action: string; count: number }>;
    candidateTaskIds: string[];
    candidateLogIds: string[];
  } {
    const escalations = tasks.filter((t) => t.status === "escalation");
    const paused = tasks.filter((t) => t.status === "paused");

    const setupRequired = tasks.filter((t) => {
      const result = this.asRecord(t.result);
      const reason =
        typeof result.reason === "string" ? result.reason.toLowerCase() : "";
      const prompt =
        typeof result.prompt === "string" ? result.prompt.toLowerCase() : "";
      const summary =
        typeof result.summary === "string" ? result.summary.toLowerCase() : "";
      return (
        reason.includes("setup_required") ||
        prompt.includes("setup_required") ||
        summary.includes("setup_required")
      );
    });

    const escalationByDomain = new Map<string, number>();
    for (const row of escalations) {
      escalationByDomain.set(
        row.domain_action,
        (escalationByDomain.get(row.domain_action) ?? 0) + 1,
      );
    }

    const repeatedDomainEscalations = Array.from(escalationByDomain.entries())
      .filter(([, count]) => count >= 2)
      .map(([domain_action, count]) => ({ domain_action, count }))
      .sort((a, b) => b.count - a.count);

    const candidateTaskIds = [
      ...new Set(
        [...escalations, ...setupRequired, ...paused]
          .map((t) => t.id)
          .slice(0, 20),
      ),
    ];

    const candidateLogIds = logs
      .filter((l) => {
        const action = l.action_taken.toLowerCase();
        return (
          action.includes("escalation") ||
          action.includes("error") ||
          action.includes("setup")
        );
      })
      .map((l) => l.id)
      .slice(0, 20);

    return {
      escalationCount: escalations.length,
      setupRequiredCount: setupRequired.length,
      pausedCount: paused.length,
      repeatedDomainEscalations,
      candidateTaskIds,
      candidateLogIds,
    };
  }

  private static toJsonValue(value: unknown): JsonValue {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonValue(item));
    }

    if (value && typeof value === "object") {
      const out: JsonRecord = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        out[key] = this.toJsonValue(item);
      }
      return out;
    }

    return String(value);
  }

  private static toJsonRecord(value: unknown): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: JsonRecord = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = this.toJsonValue(item);
    }
    return out;
  }

  private static asRecord(value: unknown): Record<string, JsonValue> {
    return this.toJsonRecord(value) as Record<string, JsonValue>;
  }
}
