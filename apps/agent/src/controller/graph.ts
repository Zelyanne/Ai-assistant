import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { supabase } from "../services/supabase.js";
import {
  Task,
  type AssistantCommandIntent,
  AgencyTier,
  ReasoningStep,
  Citation,
  EscalationTrigger,
  type ExecutionRun,
  Json,
  ThreadActionDecisionSchema,
  WorkspaceContextItem,
  type ThreadActionDecision,
} from "@ai-assistant/shared";
import { ProcessorRegistry } from "../processors/ProcessorRegistry.js";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";
import { AgencyService } from "../services/agency.js";
import { SafetyControlsService } from "../services/SafetyControlsService.js";
import { reasoningNode } from "./nodes/reasoning.js";
import { loadProtocol } from "./nodes/protocol.js";
import { loadMemoryNode, loadShortTermMemoryNode } from "./nodes/memory.js";
import { loadWorkspaceContext } from "./nodes/workspaceContext.js";
import { escalateNode } from "./nodes/escalate.js";
import { calendarConflictNode } from "./nodes/calendarConflict.js";
import { plannerNode, workspaceWorkerNode } from "./nodes/planner.js";
import { AuditLogger } from "../services/AuditLogger.js";
import { tracingService } from "../services/llm/tracing.js";
import { LLMProviderFactory } from "../services/llm/factory.js";
import { executionRunService } from "../services/ExecutionRunService.js";
import { memoryService } from "../services/MemoryService.js";
import { buildEscalationPayload, CONFIDENCE_THRESHOLD } from "./escalation.js";

const PROXY_EXECUTION_ACTIONS = new Set<string>([
  "thread.action",
  "email.send",
  "email.draft",
  "calendar.create",
  "channel.send",
  "relancing.nudge",
  "relancing.update",
  "status.report",
  "eod.memory.rotate",
  "assistant.command",
  "system.optimize_protocol",
  "protocol.update",
]);

function coerceJson(value: unknown): Json {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (typeof value === "undefined") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceJson(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, Json | undefined> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = coerceJson(v);
    }
    return out;
  }

  return String(value);
}

function mergeJson(base: Json, patch: Json): Json {
  if (
    typeof base === "object" &&
    base !== null &&
    !Array.isArray(base) &&
    typeof patch === "object" &&
    patch !== null &&
    !Array.isArray(patch)
  ) {
    return {
      ...(base as Record<string, Json | undefined>),
      ...(patch as Record<string, Json | undefined>),
    };
  }

  return patch;
}

export const AgentStateAnnotation = Annotation.Root({
  task: Annotation<Task>({
    reducer: (x, y) => y ?? x,
  }),
  error: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  result: Annotation<unknown>({
    reducer: (x, y) => y ?? x,
  }),
  trace: Annotation<ReasoningStep[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
  citations: Annotation<Citation[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
  active_protocol_rules: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  persona_memory: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  short_term_memory: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  weekly_memory: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  long_term_memory: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
  memory_task_state: Annotation<Json>({
    reducer: (x, y) => y ?? x,
  }),
  workspace_context_items: Annotation<WorkspaceContextItem[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
  planner_intent: Annotation<AssistantCommandIntent | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
  execution_run: Annotation<ExecutionRun | null>({
    reducer: (_x, y) => y ?? null,
    default: () => null,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

interface ChannelContext {
  channel?: string;
  externalMessageId?: string;
  threadId?: string;
  correlationId?: string;
}

type UserInitiatedChannel = "web" | "telegram" | "whatsapp";

function extractChannelContext(payload: unknown): ChannelContext {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const input = payload as Record<string, unknown>;

  return {
    channel: typeof input.channel === "string" ? input.channel : undefined,
    externalMessageId:
      typeof input.external_message_id === "string"
        ? input.external_message_id
        : undefined,
    threadId: typeof input.thread_id === "string" ? input.thread_id : undefined,
    correlationId:
      typeof input.correlation_id === "string"
        ? input.correlation_id
        : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getUserInitiatedCommandChannel(task: Task): UserInitiatedChannel | null {
  const payload = asRecord(task.payload);
  const channel = payload.channel;
  const source = payload.source;
  const isCommandCenterTask = task.topic === "Command Center";

  if (task.domain_action !== "assistant.command") {
    return null;
  }

  if (
    (channel === "web" || (typeof channel !== "string" && isCommandCenterTask)) &&
    (source === "dashboard-command-center" || isCommandCenterTask)
  ) {
    return "web";
  }

  if (payload.user_initiated !== true) {
    return null;
  }

  if (channel === "telegram") {
    return source === "telegram-webhook" ? "telegram" : null;
  }

  if (channel === "whatsapp") {
    return source === "whatsapp-webhook" ? "whatsapp" : null;
  }

  return null;
}

function isHighRiskPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return (payload as { high_risk?: unknown }).high_risk === true;
}

function redactErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return new PerimeterGuard().redactPII(message);
}

async function checkEmergencyBrake(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const task = state.task;
  if (!PROXY_EXECUTION_ACTIONS.has(task.domain_action)) return {};

  try {
    const enabled = await SafetyControlsService.isEmergencyBrakeEnabled(
      task.organization_id,
    );
    if (!enabled) return {};

    const summary = "Emergency Brake engaged. Task paused.";
    const step = AuditLogger.createStep(
      "Emergency Brake",
      "Paused: Emergency Brake engaged",
      {
        confidence_score: 1,
        output_summary: summary,
      },
    );

    return {
      task: {
        ...task,
        status: "paused",
        result: {
          summary,
          emergency_brake_enabled: true,
        },
      },
      trace: [step],
    };
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    const summary = "Emergency Brake check failed. Task paused as precaution.";

    console.error(
      `[Graph][${task.id}] Emergency brake check failed: ${safeMessage}`,
    );
    const step = AuditLogger.createStep(
      "Emergency Brake",
      `Paused: brake check failed (${safeMessage})`,
      {
        confidence_score: 0,
        ambiguity_detected: true,
        output_summary: summary,
      },
    );

    return {
      task: {
        ...task,
        status: "paused",
        result: {
          summary,
          emergency_brake_check_error: safeMessage,
        },
      },
      trace: [step],
    };
  }
}

/**
 * Initialize node: Updates task status to 'processing' in Supabase.
 */
async function initializeTask(
  state: AgentState,
  _config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  console.log(
    `[Graph][${state.task.id}] Initializing task ${state.task.domain_action}...`,
  );
  const step = AuditLogger.createStep(
    "Initialize",
    `Starting task: ${state.task.domain_action}`,
  );

  try {
    if (!state.task.id) throw new Error("Task ID is missing");

    const { error } = await supabase
      .from("tasks")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", state.task.id);

    if (error) throw new Error(error.message);

    if (state.task.user_id) {
      await memoryService.updateTaskState(
        state.task.organization_id,
        state.task.user_id,
        state.task.id,
        {
          status: "processing",
          current_node: "initialize",
          domain_action: state.task.domain_action,
        },
      );
    }

    return {
      task: { ...state.task, status: "processing" },
      trace: [step],
    };
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    console.error(
      `[Graph][${state.task.id}] Initialization failed: ${safeMessage}`,
    );
    return {
      error: "Task initialization failed",
      trace: [AuditLogger.createStep("Initialize", "Initialization failed")],
    };
  }
}

async function persistTaskStateProgress(
  state: AgentState,
  nodeName: string,
): Promise<void> {
  if (!state.task.id || !state.task.user_id) {
    return;
  }

  await memoryService.updateTaskState(
    state.task.organization_id,
    state.task.user_id,
    state.task.id,
    {
      status: state.task.status,
      current_node: nodeName,
      domain_action: state.task.domain_action,
    },
  );
}

function withTaskStateTracking(
  nodeName: string,
  handler: (
    state: AgentState,
    config?: RunnableConfig,
  ) => Promise<Partial<AgentState>>,
): (state: AgentState, config?: RunnableConfig) => Promise<Partial<AgentState>> {
  return async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    if (!state.error) {
      try {
        await persistTaskStateProgress(state, nodeName);
      } catch (err: unknown) {
        const safeMessage = redactErrorMessage(err);
        return {
          error: `Task-state tracking failed: ${safeMessage}`,
          trace: [
            AuditLogger.createStep(
              "Task State",
              `Failed to persist ${nodeName}: ${safeMessage}`,
            ),
          ],
        };
      }
    }

    return handler(state, config);
  };
}

/**
 * Perimeter Check node: Enforces agency tiers and redacts PII for telemetry.
 */
async function checkPerimeter(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const task = state.task;
  const topic = task.topic || "General";
  const userInitiatedChannel = getUserInitiatedCommandChannel(task);

  console.log(`[Graph][${task.id}] Checking perimeter for topic: ${topic}...`);

  try {
    // 1. Get Authorized Tier
    const authorizedTier = await AgencyService.getTierForTopic(
      task.organization_id,
      topic,
    );

    // 2. Determine Required Tier
    // Routine actions might be Public, sensitive ones Controlled.
    // Respect protocol override if present (AC 5)
    const payloadWithOverride = task.payload as {
      protocol_overridden_tier?: AgencyTier;
    } | null;
    const assistantCommandRequiredTier: AgencyTier =
      task.domain_action === "assistant.command" &&
      isHighRiskPayload(task.payload)
        ? "Controlled"
        : "Public";
    const requiredTier: AgencyTier =
      payloadWithOverride?.protocol_overridden_tier ||
      (task.domain_action === "system.analyze"
        ? "Controlled"
        : task.domain_action === "thread.action" ||
            task.domain_action === "email.send" ||
            task.domain_action === "channel.send"
          ? "Controlled"
          : task.domain_action === "assistant.command"
            ? assistantCommandRequiredTier
            : "Public");

    const guard = new PerimeterGuard();
    const rawData = JSON.stringify(task.payload);

    // 3. Determine Context Mode (AC 1.4)
    // Background analysis tasks bypass tier enforcement (but keep redaction)
    const analysisActions = [
      "morning.brief",
      "email.triage",
      "email.summarize",
      "system.analyze",
    ];
    const mode = analysisActions.includes(task.domain_action)
      ? "analysis"
      : "execution";

    // 4. Run Guard
    const result = guard.filter(rawData, authorizedTier, requiredTier, mode);

    // AC 7: Restricted topics always trigger escalation
    // EXCEPTION: Background analysis actions are allowed to synthesize cross-tier data without manual approval
    const isExemptAction = [
      "morning.brief",
      "email.triage",
      "email.summarize",
      "system.analyze",
    ].includes(task.domain_action);
    const isRestrictedTopic = authorizedTier === "Restricted";
    const escalationReason = isRestrictedTopic
      ? "Restricted topic requires human intervention"
      : (result.reason ?? "Perimeter guard escalation");
    const escalationTrigger: EscalationTrigger = isRestrictedTopic
      ? "restricted_topic"
      : "approval_guardrail";
    const shouldEscalate =
      !userInitiatedChannel && !isExemptAction && (result.isEscalated || isRestrictedTopic);

    const channelContext = extractChannelContext(task.payload);
    const channelSummary = channelContext.channel
      ? `, Channel: ${channelContext.channel}, ExternalMessageId: ${channelContext.externalMessageId ?? "n/a"}`
      : "";

    const step = AuditLogger.createStep(
      "Perimeter Check",
      shouldEscalate
        ? `Escalated: ${escalationReason}`
        : userInitiatedChannel
          ? `Perimeter escalation bypassed for user-initiated ${userInitiatedChannel} command`
        : isExemptAction
          ? `Perimeter check bypassed for ${task.domain_action}`
          : "Perimeter check passed",
      {
        confidence_score: shouldEscalate ? 0 : 1,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        escalation_trigger: shouldEscalate ? escalationTrigger : undefined,
        input_summary: `Topic: ${topic}, AuthTier: ${authorizedTier}, ReqTier: ${requiredTier}${channelSummary}`,
      },
    );

    if (shouldEscalate) {
      console.log(
        `[Graph][${task.id}] Perimeter escalation: ${escalationReason}`,
      );

      const escalationResult = buildEscalationPayload({
        reason: escalationReason,
        prompt: isRestrictedTopic
          ? "Restricted topic requires authorized human review before execution."
          : "This action needs human approval before execution.",
        confidenceScore: 0,
        trigger: escalationTrigger,
      });

      return {
        task: { ...task, status: "escalation", result: escalationResult },
        error: escalationReason,
        trace: [step],
      };
    }

    // Keep execution payload untouched. Redacted data is for telemetry only.
    const nextTask: Task = {
      ...task,
      payload: {
        ...(task.payload as Record<string, unknown>),
        agency_tier: authorizedTier,
      },
    };

    return {
      task: nextTask,
      trace: [step],
    };
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    console.error(`[Graph][${task.id}] Perimeter check failed: ${safeMessage}`);
    const errorStep = AuditLogger.createStep(
      "Perimeter Check",
      `Check failed: ${safeMessage}`,
    );
    return {
      error: "Perimeter check error",
      trace: [errorStep],
    };
  }
}

/**
 * Generic processor execution logic.
 */
async function executeProcessor(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const domainAction = state.task.domain_action;
  const processor = ProcessorRegistry.getProcessor(domainAction);

  // Unified confidence gate (payload-driven where applicable):
  // If upstream logic provides confidence/ambiguity in payload, enforce escalation BEFORE any processor/tool execution.
  const payload = (state.task.payload ?? {}) as Record<string, unknown>;
  const payloadConfidenceRaw = payload.confidence_score ?? payload.confidence;
  const payloadConfidence =
    typeof payloadConfidenceRaw === "number" &&
    Number.isFinite(payloadConfidenceRaw)
      ? payloadConfidenceRaw
      : undefined;
  const payloadAmbiguity = payload.ambiguity_detected === true;

  if (
    (typeof payloadConfidence === "number" &&
      payloadConfidence < CONFIDENCE_THRESHOLD) ||
    payloadAmbiguity
  ) {
    const reason = payloadAmbiguity ? "Ambiguity detected" : "Low confidence";
    const trigger: EscalationTrigger = payloadAmbiguity
      ? "ambiguity_detected"
      : "low_confidence";

    const step = AuditLogger.createStep(
      "Confidence Gate",
      `Escalated: ${reason}`,
      {
        confidence_score: payloadConfidence,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: payloadAmbiguity,
        escalation_trigger: trigger,
      },
    );

    const escalationResult = buildEscalationPayload({
      reason,
      prompt: "Please review this request and confirm the next action.",
      confidenceScore: payloadConfidence,
      trigger,
    });

    return {
      task: {
        ...state.task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [step],
    };
  }

  if (!processor) {
    const step = AuditLogger.createStep(
      "Processor Discovery",
      `Unsupported domain.action: ${domainAction}`,
    );
    return {
      error: `Unsupported domain.action: ${domainAction}`,
      trace: [step],
    };
  }

  try {
    const result = await processor.process(state.task);
    const resultWithMeta = result as {
      trace?: ReasoningStep[];
      citations?: Citation[];
    };

    // Support processors returning trace/citations
    const processorTrace = resultWithMeta.trace ?? [];
    const processorCitations = resultWithMeta.citations ?? [];

    if (typeof result === "object" && result !== null) {
      const outcome = (result as { outcome?: unknown }).outcome;
      const prompt =
        typeof (result as { prompt?: unknown }).prompt === "string"
          ? (result as { prompt: string }).prompt
          : null;

      const escalation = (result as { escalation?: boolean }).escalation === true;

      if (outcome === "setup_required" || outcome === "conflict_detected" || escalation) {
        const effectivePrompt =
          prompt ??
          (outcome === "conflict_detected"
            ? "Calendar conflict detected. Please confirm how to proceed."
            : escalation
              ? (result as { reason?: string }).reason ?? "Manual review required"
              : "setup_required: additional setup is required before this action can be completed.");

        const effectiveReason =
          (result as { reason?: string }).reason ?? effectivePrompt;

        const extra: Record<string, Json | undefined> = {};
        const asAny = result as Record<string, unknown>;
        if (
          outcome === "conflict_detected" &&
          typeof asAny.conflict !== "undefined"
        ) {
          extra.conflict = coerceJson(asAny.conflict);
        }
        if (typeof asAny.details === "string") {
          extra.details = asAny.details;
        }
        // Preserve suggestion for protocol optimization
        if (typeof asAny.suggestion !== "undefined") {
          extra.suggestion = coerceJson(asAny.suggestion);
        }

        const escalationResult = buildEscalationPayload({
          reason: effectiveReason,
          prompt: effectivePrompt,
          confidenceScore: (result as { confidence_score?: number }).confidence_score ?? 0,
          trigger: (result as { escalation_trigger?: EscalationTrigger }).escalation_trigger ?? "approval_guardrail",
          extra,
        });

        const step = AuditLogger.createStep(
          "Tool Execution",
          `Escalated: ${effectivePrompt}`,
          {
            confidence_score: (result as { confidence_score?: number }).confidence_score ?? 0,
            confidence_threshold: CONFIDENCE_THRESHOLD,
            ambiguity_detected: true,
            escalation_trigger: (result as { escalation_trigger?: EscalationTrigger }).escalation_trigger ?? "approval_guardrail",
            output_summary: effectivePrompt,
          },
        );

        return {
          task: {
            ...state.task,
            status: "escalation",
            result: escalationResult,
          },
          result,
          error: effectivePrompt,
          trace: [...processorTrace, step],
          citations: processorCitations,
        };
      }
    }

    const step = AuditLogger.createStep(
      "Tool Execution",
      `Executed ${domainAction} successfully`,
      {
        output_summary: JSON.stringify(result).substring(0, 100) + "...",
      },
    );

    return {
      result,
      trace: [...processorTrace, step],
      citations: processorCitations,
    };
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    console.error(`[Graph][${state.task.id}] Processor failed: ${safeMessage}`);

    if (
      state.task.domain_action === "email.send" &&
      safeMessage.startsWith("APPROVAL_")
    ) {
      let reason = "Approval is required before sending.";
      let prompt = "Review, edit if needed, then Approve.";

      if (safeMessage.startsWith("APPROVER_MISMATCH")) {
        reason = "Only the Gmail integration owner can approve/send.";
        prompt = "Ask the Gmail account owner to approve and send this draft.";
      } else if (safeMessage.startsWith("APPROVER_NOT_CONFIGURED")) {
        reason = "Google Workspace owner is not configured for this org.";
        prompt =
          "Connect Google Workspace and set an integration owner before sending.";
      } else if (safeMessage.startsWith("APPROVAL_DRAFT_INVALID")) {
        reason = "Approved draft is missing required fields.";
        prompt =
          "Fill required draft fields (To, Subject, Body), then approve again.";
      }

      const step = AuditLogger.createStep(
        "Tool Execution",
        `Escalated: ${reason}`,
        {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "approval_guardrail",
        },
      );

      const escalationResult = buildEscalationPayload({
        reason,
        prompt,
        confidenceScore: 0,
        trigger: "approval_guardrail",
      });

      return {
        task: {
          ...state.task,
          status: "escalation",
          result: escalationResult,
        },
        error: reason,
        trace: [step],
      };
    }

    const step = AuditLogger.createStep(
      "Tool Execution",
      `Execution failed: ${safeMessage}`,
    );
    return { error: "Processor execution failed", trace: [step] };
  }
}

/**
 * Processor-specific nodes (wrapping executeProcessor)
 */
async function processEmailDraft(state: AgentState) {
  return executeProcessor(state);
}
async function processEmailSend(state: AgentState) {
  return executeProcessor(state);
}
async function processEmailTriage(state: AgentState) {
  return executeProcessor(state);
}
async function processEmailSummarize(state: AgentState) {
  return executeProcessor(state);
}
async function processCalendarCreate(state: AgentState) {
  return executeProcessor(state);
}
async function processMorningBrief(state: AgentState) {
  return executeProcessor(state);
}
async function processProtocolGenerate(state: AgentState) {
  return executeProcessor(state);
}
async function processChannelSend(state: AgentState) {
  return executeProcessor(state);
}
async function processRelancingNudge(state: AgentState) {
  return executeProcessor(state);
}
async function processStatusReport(state: AgentState) {
  return executeProcessor(state);
}
async function processAssistantCommand(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const processor = ProcessorRegistry.getProcessor("assistant.command");
  if (!processor) {
    const step = AuditLogger.createStep(
      "Assistant Command",
      "Unsupported domain.action: assistant.command",
    );
    return {
      error: "Unsupported domain.action: assistant.command",
      trace: [step],
    };
  }

  try {
    const result = await processor.process(state.task);
    const resultWithMeta = result as {
      planner_intent?: unknown;
      delegated_domain_action?: unknown;
      delegated_payload?: unknown;
      summary?: unknown;
      trace?: ReasoningStep[];
      citations?: Citation[];
    };

    const plannerIntent =
      resultWithMeta.planner_intent &&
      typeof resultWithMeta.planner_intent === "object" &&
      !Array.isArray(resultWithMeta.planner_intent)
        ? (resultWithMeta.planner_intent as AssistantCommandIntent)
        : null;

    if (plannerIntent) {
      const plannedTask: Task = {
        ...state.task,
        result: {
          command_center: {
            original_domain_action: "assistant.command",
            delegated_domain_action: "planner",
            summary:
              typeof resultWithMeta.summary === "string"
                ? resultWithMeta.summary
                : "Planned workspace capability execution",
          },
        },
      };

      return {
        task: plannedTask,
        planner_intent: plannerIntent,
        result,
        trace: resultWithMeta.trace ?? [],
        citations: resultWithMeta.citations ?? [],
      };
    }

    const delegatedDomainAction =
      typeof resultWithMeta.delegated_domain_action === "string"
        ? resultWithMeta.delegated_domain_action
        : null;

    if (!delegatedDomainAction) {
      const userInitiatedChannel = getUserInitiatedCommandChannel(state.task);
      const step = AuditLogger.createStep(
        "Assistant Command",
        userInitiatedChannel
          ? `Paused: command delegation failed for user-initiated ${userInitiatedChannel} command`
          : "Escalated: command delegation failed",
        {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "ambiguity_detected",
        },
      );

      const escalationResult = buildEscalationPayload({
        reason: "Command delegation failed",
        prompt: "Please rephrase your request with explicit action details.",
        confidenceScore: 0,
        trigger: "ambiguity_detected",
      });

      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? "paused" : "escalation",
          result: escalationResult,
        },
        error: "Command delegation failed",
        trace: [step],
      };
    }

    const delegatedPayload =
      resultWithMeta.delegated_payload &&
      typeof resultWithMeta.delegated_payload === "object" &&
      !Array.isArray(resultWithMeta.delegated_payload)
        ? (resultWithMeta.delegated_payload as Record<string, unknown>)
        : {};
    const delegatedTask: Task = {
      ...state.task,
      domain_action: delegatedDomainAction,
      payload: delegatedPayload,
      result: {
        command_center: {
          original_domain_action: "assistant.command",
          delegated_domain_action: delegatedDomainAction,
          summary:
            typeof resultWithMeta.summary === "string"
              ? resultWithMeta.summary
              : `Delegated to ${delegatedDomainAction}`,
        },
      },
    };

    return {
      task: delegatedTask,
      result,
      trace: resultWithMeta.trace ?? [],
      citations: resultWithMeta.citations ?? [],
    };
  } catch (err: unknown) {
    const userInitiatedChannel = getUserInitiatedCommandChannel(state.task);
    const safeMessage = redactErrorMessage(err);
    const reason = safeMessage.startsWith("CONFIRMATION_REQUIRED")
      ? "High-risk command requires confirmation"
      : safeMessage.startsWith("COMMAND_AMBIGUOUS")
        ? "Command is ambiguous"
        : safeMessage.startsWith("COMMAND_INVALID")
          ? "Command is invalid"
          : "Command processing failed";

    const step = AuditLogger.createStep(
      "Assistant Command",
      userInitiatedChannel
        ? `Paused: ${reason}`
        : `Escalated: ${reason}`,
      {
        confidence_score: 0,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: true,
        escalation_trigger: "ambiguity_detected",
        output_summary: safeMessage,
      },
    );

    const escalationResult = buildEscalationPayload({
      reason,
      prompt:
        reason === "High-risk command requires confirmation"
          ? "Confirm this high-risk command before queueing execution."
          : "Please provide explicit command details and retry.",
      confidenceScore: 0,
      trigger: "ambiguity_detected",
    });

    return {
      task: {
        ...state.task,
        status: userInitiatedChannel ? "paused" : "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [step],
    };
  }
}
async function processRelancingUpdate(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const processor = ProcessorRegistry.getProcessor("relancing.update");
  if (!processor) {
    const step = AuditLogger.createStep(
      "Relancing Update",
      "Unsupported domain.action: relancing.update",
    );
    return {
      error: "Unsupported domain.action: relancing.update",
      trace: [step],
    };
  }

  try {
    const result = await processor.process(state.task);
    const resultWithMeta = result as {
      trace?: ReasoningStep[];
      citations?: Citation[];
    };
    const processorTrace = resultWithMeta.trace ?? [];
    const processorCitations = resultWithMeta.citations ?? [];
    const outcome = (result as { outcome?: unknown } | null)?.outcome;

    if (outcome === "setup_required") {
      const prompt = String(
        (result as { prompt?: unknown } | null)?.prompt ??
          "setup_required: relancing setup is required.",
      );
      const escalationResult = buildEscalationPayload({
        reason: prompt,
        prompt,
        confidenceScore: 0,
        trigger: "ambiguity_detected",
      });

      const step = AuditLogger.createStep(
        "Relancing Update",
        "Escalated: setup required",
        {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "ambiguity_detected",
          output_summary: prompt,
        },
      );

      return {
        task: {
          ...state.task,
          status: "escalation",
          result: escalationResult,
        },
        error: "setup_required",
        trace: [...processorTrace, step],
        citations: processorCitations,
      };
    }

    if (outcome === "ambiguity_escalated") {
      const prompt = String(
        (result as { prompt?: unknown } | null)?.prompt ??
          "ambiguity_escalated: relancing update needs clarification.",
      );
      const escalationResult = buildEscalationPayload({
        reason: prompt,
        prompt,
        confidenceScore: 0,
        trigger: "ambiguity_detected",
      });

      const step = AuditLogger.createStep(
        "Relancing Update",
        "Escalated: ambiguity detected",
        {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "ambiguity_detected",
          output_summary: prompt,
        },
      );

      return {
        task: {
          ...state.task,
          status: "escalation",
          result: escalationResult,
        },
        error: "ambiguity_escalated",
        trace: [...processorTrace, step],
        citations: processorCitations,
      };
    }

    const step = AuditLogger.createStep(
      "Relancing Update",
      "Processed relancing.update",
      {
        output_summary: JSON.stringify(result).substring(0, 2000),
      },
    );

    return {
      result,
      trace: [...processorTrace, step],
      citations: processorCitations,
    };
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    const step = AuditLogger.createStep(
      "Relancing Update",
      `Execution failed: ${safeMessage}`,
    );
    return { error: "relancing.update failed", trace: [step] };
  }
}

function extractEmailAddress(raw: string): string | null {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();

  const directMatch = raw.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (directMatch?.[0]) return directMatch[0].trim();

  return null;
}

function findFromHeader(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as { thread_raw?: unknown };
  const threadRaw = meta.thread_raw;
  if (!threadRaw || typeof threadRaw !== "object") return null;
  const raw = threadRaw as { messages?: unknown };
  const messages = raw.messages;
  if (!Array.isArray(messages)) return null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") continue;
    const payload = (message as { payload?: unknown }).payload;
    if (!payload || typeof payload !== "object") continue;
    const headers = (payload as { headers?: unknown }).headers;
    if (!Array.isArray(headers)) continue;

    for (const header of headers) {
      if (!header || typeof header !== "object") continue;
      const name = (header as { name?: unknown }).name;
      const value = (header as { value?: unknown }).value;
      if (
        typeof name === "string" &&
        name.toLowerCase() === "from" &&
        typeof value === "string"
      ) {
        return value;
      }
    }
  }

  return null;
}

async function processThreadAction(
  state: AgentState,
): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const task = state.task;
  const payload = (task.payload ?? {}) as Record<string, unknown>;

  const threadIdFromPayload =
    typeof payload.thread_id === "string" ? payload.thread_id : null;
  const sourceType =
    typeof payload.source_type === "string" ? payload.source_type : null;
  const sourceId =
    typeof payload.source_id === "string" ? payload.source_id : null;
  const threadId =
    sourceType === "thread" && sourceId ? sourceId : threadIdFromPayload;

  const guard = new PerimeterGuard();
  const topic = task.topic || "General";

  const payloadAgencyTier =
    typeof payload.agency_tier === "string" ? payload.agency_tier : null;
  const authorizedTier =
    payloadAgencyTier === "Public" ||
    payloadAgencyTier === "Controlled" ||
    payloadAgencyTier === "Restricted"
      ? payloadAgencyTier
      : "Public";

  if (!threadId) {
    const reason =
      "Missing thread identifier (payload.thread_id or payload.source_id when source_type=thread)";
    const escalationResult = buildEscalationPayload({
      reason,
      prompt: "Select a thread to automate, then retry.",
      confidenceScore: 0,
      trigger: "ambiguity_detected",
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [
        AuditLogger.createStep(
          "Thread Action",
          "Escalated: missing thread id",
          {
            confidence_score: 0,
            confidence_threshold: CONFIDENCE_THRESHOLD,
            ambiguity_detected: true,
            escalation_trigger: "ambiguity_detected",
          },
        ),
      ],
    };
  }

  // Load source thread (AC 1)
  const { data: thread, error: threadError } = await supabase
    .from("ingested_threads")
    .select("id, subject, summary_json, external_id, metadata")
    .eq("organization_id", task.organization_id)
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    const reason = `Thread ${threadId} not found`;
    const escalationResult = buildEscalationPayload({
      reason,
      prompt: "Please refresh the Dashboard and retry this automation.",
      confidenceScore: 0,
      trigger: "ambiguity_detected",
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [
        AuditLogger.createStep("Thread Load", `Escalated: ${reason}`, {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "ambiguity_detected",
        }),
      ],
    };
  }

  const citationLink = `https://mail.google.com/mail/u/0/#all/${thread.external_id}`;
  const citations = [
    AuditLogger.createCitation(
      "email",
      String(thread.external_id),
      "Original Gmail thread",
      citationLink,
    ),
  ];

  const rawSubject = typeof thread.subject === "string" ? thread.subject : "";
  const summaryJson = thread.summary_json as unknown;

  const redactedSubject = guard.redactPII(rawSubject);
  const redactedSummaryJson = guard.redactPII(
    JSON.stringify(summaryJson ?? {}),
  );

  const prompt = [
    "You are the CEO's proxy assistant.",
    "",
    "Tone: Executive Calm (concise, factual, non-alarmist).",
    "Task: Decide whether to take a routine autonomous action for this Gmail thread.",
    "",
    `TOPIC: ${topic}`,
    `THREAD SUBJECT: ${redactedSubject}`,
    "THREAD SUMMARY_JSON (context, decisions, action_items):",
    redactedSummaryJson,
    "",
    "Return ONLY valid JSON matching this schema:",
    "{",
    '  action: "email.reply" | "email.draft" | "calendar.create" | "escalate",',
    "  confidence: number (0..1),",
    "  ambiguity_detected: boolean,",
    "  email?: { subject: string, body: string },",
    "  calendar?: { summary: string, startTime: string, endTime: string, description?: string, location?: string },",
    "  escalation?: { reason: string, prompt: string }",
    "}",
    "",
    "Rules:",
    '- If needed details are missing (time/date/location/recipient), choose action="escalate".',
    '- If scheduling is requested, choose action="calendar.create".',
    '- If a response is requested and sending is unavailable, choose action="email.draft".',
  ].join("\n");

  const llm = LLMProviderFactory.getProvider();
  let decision: ThreadActionDecision;
  try {
    const decisionResponse = await llm.generateStructured(
      prompt,
      ThreadActionDecisionSchema,
    );
    decision = ThreadActionDecisionSchema.parse(decisionResponse.data);
  } catch (err: unknown) {
    const message = guard.redactPII(
      err instanceof Error ? err.message : String(err),
    );
    const reason = "Failed to generate a safe action plan";
    const escalationResult = buildEscalationPayload({
      reason,
      prompt: "Please review this thread and provide explicit instructions.",
      confidenceScore: 0,
      trigger: "ambiguity_detected",
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [
        AuditLogger.createStep(
          "Thread Action Decision",
          `Escalated: ${reason}`,
          {
            confidence_score: 0,
            confidence_threshold: CONFIDENCE_THRESHOLD,
            ambiguity_detected: true,
            escalation_trigger: "ambiguity_detected",
            output_summary: message,
          },
        ),
      ],
      citations,
    };
  }

  const decisionStep = AuditLogger.createStep(
    "Thread Action Decision",
    `Planned action: ${decision.action}`,
    {
      confidence_score: decision.confidence,
      confidence_threshold: CONFIDENCE_THRESHOLD,
      ambiguity_detected: decision.ambiguity_detected,
      input_summary: `Topic: ${topic}, Subject: ${redactedSubject}`,
      output_summary: `action=${decision.action}`,
    },
  );

  if (authorizedTier === "Controlled") {
    const fromHeader = findFromHeader(thread.metadata);
    const recipient = fromHeader ? extractEmailAddress(fromHeader) : null;
    const emailDraft = decision.email;

    const draftBody =
      emailDraft?.body ?? "Draft unavailable. Please write a response.";
    const draftSubject = emailDraft?.subject ?? `Re: ${rawSubject}`;

    const controlledReason = "Controlled topic requires human approval";
    const controlledPrompt = recipient
      ? "Review, edit if needed, then Approve & Send."
      : "Review, add recipient, edit if needed, then Approve & Send.";

    const escalationResult = buildEscalationPayload({
      reason: controlledReason,
      prompt: controlledPrompt,
      confidenceScore: decision.confidence,
      trigger: "approval_guardrail",
      extra: {
        summary: "Draft prepared for approval on a Controlled topic.",
        draft: {
          to: recipient ?? "",
          subject: draftSubject,
          body: draftBody,
          body_format: "plain",
          thread_external_id: String(thread.external_id),
          thread_id: String(thread.id),
        },
        citations,
      },
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: controlledReason,
      trace: [
        decisionStep,
        AuditLogger.createStep(
          "Thread Action",
          "Escalated with approval-ready draft for Controlled topic",
          {
            confidence_score: decision.confidence,
            confidence_threshold: CONFIDENCE_THRESHOLD,
            ambiguity_detected: decision.ambiguity_detected,
            escalation_trigger: "approval_guardrail",
          },
        ),
      ],
      citations,
    };
  }

  if (
    decision.action === "escalate" ||
    decision.confidence < CONFIDENCE_THRESHOLD ||
    decision.ambiguity_detected
  ) {
    const reason =
      decision.action === "escalate"
        ? decision.escalation?.reason || "Escalation requested by planner"
        : decision.ambiguity_detected
          ? "Ambiguity detected"
          : "Low confidence";

    const promptText =
      decision.escalation?.prompt ||
      "Please review this thread and confirm next action.";
    const escalationTrigger: EscalationTrigger =
      decision.ambiguity_detected || decision.action === "escalate"
        ? "ambiguity_detected"
        : "low_confidence";

    const escalationResult = buildEscalationPayload({
      reason,
      prompt: promptText,
      confidenceScore: decision.confidence,
      trigger: escalationTrigger,
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [
        decisionStep,
        AuditLogger.createStep(
          "Thread Action",
          "Escalated: planner confidence/ambiguity",
          {
            confidence_score: decision.confidence,
            confidence_threshold: CONFIDENCE_THRESHOLD,
            ambiguity_detected: decision.ambiguity_detected,
            escalation_trigger: escalationTrigger,
          },
        ),
      ],
      citations,
    };
  }

  // Execute routine action plan (AC 1)
  try {
    if (decision.action === "calendar.create") {
      const calendarProcessor =
        ProcessorRegistry.getProcessor("calendar.create");
      if (!calendarProcessor)
        throw new Error("calendar.create processor unavailable");

      const calendar = decision.calendar!;
      const calendarTask: Task = {
        ...task,
        domain_action: "calendar.create",
        payload: {
          summary: guard.recoverPII(calendar.summary),
          startTime: calendar.startTime,
          endTime: calendar.endTime,
          description: calendar.description
            ? guard.recoverPII(calendar.description)
            : undefined,
          location: calendar.location
            ? guard.recoverPII(calendar.location)
            : undefined,
        },
      } as Task;

      await calendarProcessor.process(calendarTask);

      const step = AuditLogger.createStep(
        "Tool Execution",
        "Executed calendar.create",
        {
          output_summary: "calendar.create",
        },
      );

      return {
        result: {
          summary: "Silent Win: Calendar event created.",
          action: "calendar.create",
          citations,
        },
        trace: [decisionStep, step],
        citations,
      };
    }

    // email.reply currently degrades to email.draft when send is unavailable
    const emailProcessor = ProcessorRegistry.getProcessor("email.draft");
    if (!emailProcessor) throw new Error("email.draft processor unavailable");

    const fromHeader = findFromHeader(thread.metadata);
    const recipient = fromHeader ? extractEmailAddress(fromHeader) : null;
    if (!recipient) {
      const reason =
        "Could not determine recipient address from thread metadata";
      const escalationResult = buildEscalationPayload({
        reason,
        prompt: "Open the thread and confirm who should receive the reply.",
        confidenceScore: 0,
        trigger: "ambiguity_detected",
      });

      return {
        task: {
          ...task,
          status: "escalation",
          result: escalationResult,
        },
        error: reason,
        trace: [
          decisionStep,
          AuditLogger.createStep(
            "Thread Action",
            "Escalated: missing recipient",
            {
              confidence_score: 0,
              confidence_threshold: CONFIDENCE_THRESHOLD,
              ambiguity_detected: true,
              escalation_trigger: "ambiguity_detected",
            },
          ),
        ],
        citations,
      };
    }

    const email = decision.email!;
    const emailTask: Task = {
      ...task,
      domain_action: "email.draft",
      payload: {
        recipient,
        subject: guard.recoverPII(email.subject),
        body: guard.recoverPII(email.body),
      },
    } as Task;

    await emailProcessor.process(emailTask);

    const toolStep = AuditLogger.createStep(
      "Tool Execution",
      "Executed email.draft",
      {
        output_summary: "email.draft",
      },
    );

    return {
      result: {
        summary: `Silent Win: Drafted reply (review before sending).`,
        action: "email.draft",
        citations,
      },
      trace: [decisionStep, toolStep],
      citations,
    };
  } catch (err: unknown) {
    const message = guard.redactPII(
      err instanceof Error ? err.message : String(err),
    );
    const reason = "Routine execution failed";
    const escalationResult = buildEscalationPayload({
      reason,
      prompt: "Please review this thread and take action manually.",
      confidenceScore: 0,
      trigger: "approval_guardrail",
    });

    return {
      task: {
        ...task,
        status: "escalation",
        result: escalationResult,
      },
      error: reason,
      trace: [
        decisionStep,
        AuditLogger.createStep("Tool Execution", `Escalated: ${reason}`, {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          escalation_trigger: "approval_guardrail",
          output_summary: message,
        }),
      ],
      citations,
    };
  }
}

/**
 * Finalize node: Updates task status to 'done' or 'error' in Supabase.
 */
async function finalizeTask(
  state: AgentState,
  _config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  let status: Task["status"] = "done";

  if (state.execution_run?.status === "escalated" || state.execution_run?.status === "blocked") {
    status = "escalation";
  } else if (state.execution_run?.status === "failed") {
    status = "error";
  }

  if (
    state.task.status === "escalation" ||
    state.task.status === "error" ||
    state.task.status === "paused"
  ) {
    status = state.task.status;
  } else if (state.error) {
    status = "error";
  }

  console.log(
    `[Graph][${state.task.id}] Finalizing task with status: ${status}`,
  );

  const step = AuditLogger.createStep(
    "Finalize",
    `Task finalized with status: ${status}`,
  );
  const finalTrace = (state.trace || []).concat([step]);

  try {
    if (!state.task.id) throw new Error("Task ID is missing");

    // When channel delivery callbacks and task finalization happen concurrently,
    // avoid clobbering existing JSONB result fields by merging with the latest DB state.
    let dbResult: unknown = undefined;
    try {
      const { data: current, error: currentError } = await supabase
        .from("tasks")
        .select("result")
        .eq("id", state.task.id)
        .single();

      if (!currentError) {
        dbResult = (current as { result?: unknown } | null)?.result;
      }
    } catch {
      // Best-effort merge only; ignore read errors.
    }

    // 1. Update task status
    const executionRunResult = state.execution_run
      ? executionRunService.buildTaskResult(state.execution_run)
      : {};
    const taskResultJson = coerceJson({
      ...(state.task.result ?? {}),
      ...executionRunResult,
    });
    const latestDbResultJson = coerceJson(dbResult ?? {});

    const persistedResult: Json =
      status === "done"
        ? mergeJson(
            latestDbResultJson,
            mergeJson(
              taskResultJson,
              coerceJson(
                typeof state.result === "undefined" ? {} : state.result,
              ),
            ),
          )
        : mergeJson(
            latestDbResultJson,
            coerceJson(state.task.result ?? { error: state.error ?? null }),
          );

    const { error: taskError } = await supabase
      .from("tasks")
      .update({
        status,
        result: persistedResult,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.task.id);

    if (taskError) throw new Error(taskError.message);

    // 2. Flush Audit Log
    const channelContext = extractChannelContext(state.task.payload);
    const channelCitations = [...(state.citations || [])];
    if (channelContext.channel && channelContext.externalMessageId) {
      channelCitations.push(
        AuditLogger.createCitation(
          "channel_message",
          channelContext.externalMessageId,
          `Channel context (${channelContext.channel}) linked to task`,
        ),
      );
    }

    await AuditLogger.flush(
      state.task.organization_id,
      state.task.id,
      "agent-controller",
      status === "done" ? "task_completed" : `task_${status}`,
      finalTrace,
      channelCitations,
      {
        executionRunId: state.execution_run?.id,
      },
    );

    // 3. Flush Tracing
    await tracingService.flush();

    if (state.task.user_id) {
      await memoryService.updateTaskState(
        state.task.organization_id,
        state.task.user_id,
        state.task.id,
        {
          status,
          current_node: "finalize",
          domain_action: state.task.domain_action,
          result_summary:
            status === "done"
              ? "Task completed"
              : state.error ?? `Task ${status}`,
        },
      );
    }
  } catch (err: unknown) {
    const safeMessage = redactErrorMessage(err);
    console.error(
      `[Graph][${state.task.id}] Finalization failed: ${safeMessage}`,
    );
  }

  return { trace: [step] };
}

/**
 * Node for unsupported domains.
 */
async function handleUnsupportedDomain(
  state: AgentState,
): Promise<Partial<AgentState>> {
  return { error: `Unsupported domain.action: ${state.task.domain_action}` };
}

/**
 * Routing logic after initialization
 */
function routeAfterInit(state: AgentState) {
  if (state.error) return "finalize";
  return "load_memory";
}

function routeAfterMemoryLoad(state: AgentState) {
  if (state.error) return "finalize";
  return "load_protocol";
}

function routeAfterBrake(state: AgentState) {
  if (state.error) return "finalize";
  if (state.task.status === "paused") return "finalize";
  return "initialize";
}

/**
 * Routing logic after protocol loading
 */
function routeAfterProtocol(state: AgentState) {
  if (state.error) return "finalize";
  return "load_short_term_memory";
}

function routeAfterShortTermMemory(state: AgentState) {
  if (state.error) return "finalize";
  return "check_perimeter";
}

function routeAfterPerimeter(state: AgentState) {
  if (state.error || state.task.status === "escalation") {
    const existingResult = state.task.result as
      | { escalation?: boolean }
      | undefined;
    if (state.task.status === "escalation" && existingResult?.escalation) {
      return "finalize";
    }
    return state.task.status === "escalation" ? "escalate" : "finalize";
  }
  return "load_workspace_context";
}

function routeAfterWorkspaceContext(state: AgentState) {
  if (state.error || state.task.status === "escalation") return "finalize";

  const domainAction = state.task.domain_action;

  if (domainAction === "assistant.command" && state.execution_run) {
    return "planner";
  }

  if (domainAction === "system.analyze") {
    return "reasoning";
  }

  if (domainAction === "thread.action") {
    return "thread_action";
  }

  if (domainAction === "calendar.create") {
    return "calendar_conflict";
  }

  // Dynamic routing based on registry
  if (ProcessorRegistry.getProcessor(domainAction)) {
    return domainAction.replaceAll(".", "_");
  }

  return "unsupported_domain";
}

function routeAfterAssistantCommand(state: AgentState) {
  if (state.error || state.task.status === "escalation") {
    return "finalize";
  }

  if (state.planner_intent || state.execution_run) {
    return "planner";
  }

  return "check_perimeter";
}

function routeAfterPlanner(state: AgentState) {
  if (state.error || state.task.status === "escalation") {
    return "finalize";
  }

  return "workspace_worker";
}

function routeAfterWorkspaceWorker(state: AgentState) {
  if (state.error || state.task.status === "escalation") {
    return "finalize";
  }

  const runStatus = state.execution_run?.status;
  if (
    runStatus === "completed" ||
    runStatus === "failed" ||
    runStatus === "escalated" ||
    runStatus === "blocked"
  ) {
    return "finalize";
  }

  return "workspace_worker";
}

/**
 * Routing logic after reasoning
 */
function routeAfterReasoning(state: AgentState) {
  if (state.error) return "finalize";

  const lastStep = state.trace[state.trace.length - 1];
  const hasConfidence = typeof lastStep?.confidence_score === "number";
  const confidence = hasConfidence ? (lastStep!.confidence_score as number) : 0;
  const ambiguity =
    typeof lastStep?.ambiguity_detected === "boolean"
      ? lastStep.ambiguity_detected
      : !hasConfidence;

  if (!hasConfidence || confidence < CONFIDENCE_THRESHOLD || ambiguity) {
    return "escalate";
  }

  return "finalize";
}

function routeAfterCalendarConflict(state: AgentState) {
  if (state.error || state.task.status === "escalation") {
    return "finalize";
  }

  return "calendar_create";
}

// Define the graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("emergency_brake", checkEmergencyBrake)
  .addNode("initialize", initializeTask)
  .addNode("load_memory", loadMemoryNode)
  .addNode("load_protocol", withTaskStateTracking("load_protocol", loadProtocol))
  .addNode(
    "load_short_term_memory",
    withTaskStateTracking("load_short_term_memory", loadShortTermMemoryNode),
  )
  .addNode(
    "load_workspace_context",
    withTaskStateTracking("load_workspace_context", loadWorkspaceContext),
  )
  .addNode(
    "check_perimeter",
    withTaskStateTracking("check_perimeter", checkPerimeter),
  )
  .addNode(
    "calendar_conflict",
    withTaskStateTracking("calendar_conflict", calendarConflictNode),
  )
  .addNode("reasoning", withTaskStateTracking("reasoning", reasoningNode))
  .addNode("escalate", withTaskStateTracking("escalate", escalateNode))
  .addNode("email_draft", withTaskStateTracking("email_draft", processEmailDraft))
  .addNode("email_send", withTaskStateTracking("email_send", processEmailSend))
  .addNode(
    "email_triage",
    withTaskStateTracking("email_triage", processEmailTriage),
  )
  .addNode(
    "email_summarize",
    withTaskStateTracking("email_summarize", processEmailSummarize),
  )
  .addNode(
    "calendar_create",
    withTaskStateTracking("calendar_create", processCalendarCreate),
  )
  .addNode(
    "morning_brief",
    withTaskStateTracking("morning_brief", processMorningBrief),
  )
  .addNode(
    "protocol_generate",
    withTaskStateTracking("protocol_generate", processProtocolGenerate),
  )
  .addNode(
    "protocol_update",
    withTaskStateTracking("protocol_update", executeProcessor),
  )
  .addNode("channel_send", withTaskStateTracking("channel_send", processChannelSend))
  .addNode(
    "relancing_nudge",
    withTaskStateTracking("relancing_nudge", processRelancingNudge),
  )
  .addNode(
    "status_report",
    withTaskStateTracking("status_report", processStatusReport),
  )
  .addNode(
    "eod_memory_rotate",
    withTaskStateTracking("eod_memory_rotate", executeProcessor),
  )
  .addNode(
    "relancing_update",
    withTaskStateTracking("relancing_update", processRelancingUpdate),
  )
  .addNode(
    "assistant_command",
    withTaskStateTracking("assistant_command", processAssistantCommand),
  )
  .addNode("planner", withTaskStateTracking("planner", plannerNode))
  .addNode(
    "workspace_worker",
    withTaskStateTracking("workspace_worker", workspaceWorkerNode),
  )
  .addNode(
    "system_optimize_protocol",
    withTaskStateTracking("system_optimize_protocol", executeProcessor),
  )
  .addNode(
    "thread_action",
    withTaskStateTracking("thread_action", processThreadAction),
  )
  .addNode(
    "unsupported_domain",
    withTaskStateTracking("unsupported_domain", handleUnsupportedDomain),
  )
  .addNode("finalize", finalizeTask)
  .addEdge(START, "emergency_brake")
  .addConditionalEdges("emergency_brake", routeAfterBrake)
  .addConditionalEdges("initialize", routeAfterInit)
  .addConditionalEdges("load_memory", routeAfterMemoryLoad)
  .addConditionalEdges("load_protocol", routeAfterProtocol)
  .addConditionalEdges("load_short_term_memory", routeAfterShortTermMemory)
  .addConditionalEdges("check_perimeter", routeAfterPerimeter)
  .addConditionalEdges("load_workspace_context", routeAfterWorkspaceContext)
  .addConditionalEdges("calendar_conflict", routeAfterCalendarConflict)
  .addConditionalEdges("assistant_command", routeAfterAssistantCommand)
  .addConditionalEdges("planner", routeAfterPlanner)
  .addConditionalEdges("workspace_worker", routeAfterWorkspaceWorker)
  .addConditionalEdges("reasoning", routeAfterReasoning)

  .addEdge("escalate", "finalize")
  .addEdge("email_draft", "finalize")
  .addEdge("email_send", "finalize")
  .addEdge("email_triage", "finalize")
  .addEdge("email_summarize", "finalize")
  .addEdge("calendar_create", "finalize")
  .addEdge("morning_brief", "finalize")
  .addEdge("protocol_generate", "finalize")
  .addEdge("protocol_update", "finalize")
  .addEdge("channel_send", "finalize")
  .addEdge("relancing_nudge", "finalize")
  .addEdge("status_report", "finalize")
  .addEdge("eod_memory_rotate", "finalize")
  .addEdge("relancing_update", "finalize")
  .addEdge("system_optimize_protocol", "finalize")
  .addEdge("thread_action", "finalize")
  .addEdge("unsupported_domain", "finalize")
  .addEdge("finalize", END);

export const graph = workflow.compile();
