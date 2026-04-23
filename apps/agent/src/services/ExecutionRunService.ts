import {
  type Database,
  type ExecutionLedgerEntry,
  type ExecutionPlan,
  type ExecutionPlanStep,
  type ExecutionRun,
  type ExecutionRunStatus,
  type Json,
  ExecutionPlanSchema,
  ExecutionRunSchema,
} from "@ai-assistant/shared";
import { supabase } from "./supabase.js";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";

type ExecutionRunInsert =
  Database["public"]["Tables"]["execution_runs"]["Insert"];
type ExecutionRunUpdate =
  Database["public"]["Tables"]["execution_runs"]["Update"];
type ExecutionRunRow = Database["public"]["Tables"]["execution_runs"]["Row"];

const ledgerGuard = new PerimeterGuard();
const LEDGER_SUMMARY_LIMIT = 280;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJson(value: unknown): Json {
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
    return value.map((item) => toJson(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, Json | undefined> = {};
    for (const [key, entry] of Object.entries(record)) {
      output[key] = toJson(entry);
    }
    return output;
  }

  return String(value);
}

function summarizeOutput(output: Record<string, Json | undefined>): string {
  if (typeof output.summary === "string" && output.summary.length > 0) {
    return redactLedgerText(output.summary);
  }

  const raw = JSON.stringify(output);
  return redactLedgerText(raw.length > LEDGER_SUMMARY_LIMIT ? `${raw.slice(0, LEDGER_SUMMARY_LIMIT - 3)}...` : raw);
}

function summarizeInput(input: Record<string, unknown>): string {
  const raw = JSON.stringify(input);
  return redactLedgerText(raw.length > LEDGER_SUMMARY_LIMIT ? `${raw.slice(0, LEDGER_SUMMARY_LIMIT - 3)}...` : raw);
}

function redactLedgerText(value: string): string {
  return ledgerGuard.redactPII(value);
}

function renderPlanChecklist(plan: ExecutionPlan): string[] {
  return plan.steps.map((step) => {
    const marker =
      step.status === "completed"
        ? "[x]"
        : step.status === "failed" || step.status === "blocked"
          ? "[!]"
          : step.status === "skipped"
            ? "[-]"
            : "[ ]";

    return `${marker} ${step.title} (${step.worker_type}/${step.action})`;
  });
}

function renderLedgerMarkdown(plan: ExecutionPlan): string {
  const lines = [
    "# Execution Run Ledger",
    "",
    `- Summary: ${redactLedgerText(plan.summary)}`,
    `- Re-plans: ${plan.replan_count}`,
    "",
    "## Plan",
    ...renderPlanChecklist(plan),
    "",
    "## Handoffs",
  ];

  if (plan.ledger_entries.length === 0) {
    lines.push("- Planner initialized the run. Worker handoffs will appear here.");
    return lines.join("\n");
  }

  for (const entry of plan.ledger_entries) {
    lines.push(`### ${entry.step_key}`);
    lines.push(`- Worker: ${entry.worker_type}`);
    lines.push(`- Action: ${entry.action}`);
    lines.push(`- Attempt: ${entry.attempt_number}`);
    lines.push(`- Input: ${redactLedgerText(entry.input_summary)}`);
    lines.push(`- Output: ${redactLedgerText(entry.outputs_summary)}`);
    lines.push(`- Next: ${redactLedgerText(entry.next_worker_note)}`);
    lines.push(`- Timestamp: ${entry.timestamp}`);
    lines.push("");
  }

  return lines.join("\n");
}

function parseExecutionRun(row: ExecutionRunRow | null): ExecutionRun | null {
  if (!row) {
    return null;
  }

  return ExecutionRunSchema.parse({
    ...row,
    plan_json: ExecutionPlanSchema.parse(row.plan_json),
    idempotency_state: row.idempotency_state,
  });
}

function nextPendingStep(plan: ExecutionPlan): ExecutionPlanStep | null {
  return (
    plan.steps.find(
      (step) => step.status === "pending" || step.status === "in_progress",
    ) ?? null
  );
}

async function fetchSingleRow<T>(query: unknown): Promise<{
  data: T | null;
  error: { message: string } | null;
}> {
  const typedQuery = query as {
    maybeSingle?: () => Promise<{ data: T | null; error: { message: string } | null }>;
    single?: () => Promise<{ data: T | null; error: { message: string } | null }>;
  };

  if (typedQuery.maybeSingle) {
    return typedQuery.maybeSingle();
  }

  if (typedQuery.single) {
    return typedQuery.single();
  }

  return {
    data: null,
    error: { message: "Supabase query does not support single-row fetch." },
  };
}

function isExecutionRunsUnavailableMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("public.execution_runs") && (
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("relation")
  );
}

function buildExecutionRunsUnavailableMessage(action: string): string {
  return `EXECUTION_RUNS_UNAVAILABLE: Cannot ${action} because public.execution_runs is missing. Apply supabase/migrations/20260312113000_create_execution_runs.sql to the database and retry.`;
}

export class ExecutionRunService {
  async getById(runId: string): Promise<ExecutionRun | null> {
    const { data, error } = await fetchSingleRow<ExecutionRunRow>(
      supabase
      .from("execution_runs")
      .select("*")
      .eq("id", runId),
    );

    if (error) {
      if (isExecutionRunsUnavailableMessage(error.message)) {
        return null;
      }
      throw new Error(`Failed to load execution run ${runId}: ${error.message}`);
    }

    return parseExecutionRun(data as ExecutionRunRow | null);
  }

  async getByTaskId(taskId: string): Promise<ExecutionRun | null> {
    const { data, error } = await fetchSingleRow<ExecutionRunRow>(
      supabase
      .from("execution_runs")
      .select("*")
      .eq("task_id", taskId),
    );

    if (error) {
      if (isExecutionRunsUnavailableMessage(error.message)) {
        return null;
      }
      throw new Error(
        `Failed to load execution run for task ${taskId}: ${error.message}`,
      );
    }

    return parseExecutionRun(data as ExecutionRunRow | null);
  }

  async createRun(input: {
    taskId: string;
    organizationId: string;
    plan: ExecutionPlan;
    toolPolicyVersion: string;
  }): Promise<ExecutionRun> {
    const firstStep = nextPendingStep(input.plan);
    const insertPayload: ExecutionRunInsert = {
      task_id: input.taskId,
      organization_id: input.organizationId,
      status: "planned",
      plan_json: toJson(input.plan),
      ledger_markdown: renderLedgerMarkdown(input.plan),
      current_step_key: firstStep?.key ?? null,
      current_worker_type: firstStep?.worker_type ?? null,
      tool_policy_version: input.toolPolicyVersion,
      idempotency_state: {},
      version: 1,
    };

    const { error } = await supabase.from("execution_runs").insert(insertPayload);

    if (error) {
      if (isExecutionRunsUnavailableMessage(error.message)) {
        throw new Error(
          buildExecutionRunsUnavailableMessage(`create execution run for task ${input.taskId}`),
        );
      }
      throw new Error(`Failed to create execution run: ${error.message}`);
    }

    const created = await this.getByTaskId(input.taskId);
    if (!created) {
      throw new Error("Execution run insert succeeded but could not be reloaded");
    }

    return created;
  }

  async getOrCreateRun(input: {
    taskId: string;
    organizationId: string;
    plan: ExecutionPlan;
    toolPolicyVersion: string;
  }): Promise<ExecutionRun> {
    const existing = await this.getByTaskId(input.taskId);
    if (existing) {
      return existing;
    }

    return this.createRun(input);
  }

  async mutateRun(
    run: ExecutionRun,
    mutator: (draft: ExecutionRun) => void,
  ): Promise<ExecutionRun> {
    if (!run.id) {
      throw new Error("Execution run is missing an id");
    }

    const draft = cloneJson(run);
    mutator(draft);

    draft.ledger_markdown = renderLedgerMarkdown(draft.plan_json);
    draft.updated_at = new Date().toISOString();
    draft.version = run.version + 1;

    const updatePayload: ExecutionRunUpdate = {
      status: draft.status,
      plan_json: toJson(draft.plan_json),
      ledger_markdown: draft.ledger_markdown,
      current_step_key: draft.current_step_key ?? null,
      current_worker_type: draft.current_worker_type ?? null,
      tool_policy_version: draft.tool_policy_version,
      idempotency_state: toJson(draft.idempotency_state),
      version: draft.version,
      last_error: draft.last_error ?? null,
      updated_at: draft.updated_at,
    };

    const { error } = await supabase
      .from("execution_runs")
      .update(updatePayload)
      .eq("id", run.id)
      .eq("version", run.version);

    if (error) {
      if (isExecutionRunsUnavailableMessage(error.message)) {
        throw new Error(
          buildExecutionRunsUnavailableMessage(`update execution run ${run.id}`),
        );
      }
      throw new Error(`Failed to update execution run ${run.id}: ${error.message}`);
    }

    const refreshed = await this.getById(run.id);
    if (!refreshed || refreshed.version !== draft.version) {
      throw new Error(`Execution run ${run.id} failed optimistic locking`);
    }

    return refreshed;
  }

  async markStepInProgress(
    run: ExecutionRun,
    stepKey: string,
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      const step = draft.plan_json.steps.find((entry) => entry.key === stepKey);
      if (!step) {
        throw new Error(`Execution step ${stepKey} not found`);
      }

      step.status = "in_progress";
      step.attempt_count += 1;
      draft.status = "processing";
      draft.current_step_key = step.key;
      draft.current_worker_type = step.worker_type;
      draft.last_error = null;
    });
  }

  async completeStep(
    run: ExecutionRun,
    input: {
      stepKey: string;
      output: Record<string, Json | undefined>;
      nextWorkerNote: string;
      toolName?: string;
    },
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      const step = draft.plan_json.steps.find((entry) => entry.key === input.stepKey);
      if (!step) {
        throw new Error(`Execution step ${input.stepKey} not found`);
      }

      step.status = "completed";
      step.output = input.output;
      step.handoff_note = input.nextWorkerNote;
      step.tool_name = input.toolName;
      step.error_message = undefined;

      draft.idempotency_state[step.idempotency_key] = {
        status: "completed",
        tool_name: input.toolName,
        output: input.output,
        updated_at: new Date().toISOString(),
      };

      const ledgerEntry: ExecutionLedgerEntry = {
        step_key: step.key,
        worker_type: step.worker_type,
        action: step.action,
        input_summary: summarizeInput(step.input),
        outputs_summary: summarizeOutput(input.output),
        next_worker_note: redactLedgerText(input.nextWorkerNote),
        attempt_number: step.attempt_count,
        timestamp: new Date().toISOString(),
      };
      draft.plan_json.ledger_entries.push(ledgerEntry);

      const pending = draft.plan_json.steps.find((entry) => entry.status === "pending");
      draft.current_step_key = pending?.key ?? null;
      draft.current_worker_type = pending?.worker_type ?? null;
      draft.status = pending ? "processing" : "completed";
      draft.last_error = null;
    });
  }

  async failStep(
    run: ExecutionRun,
    input: {
      stepKey: string;
      errorMessage: string;
      status: Extract<ExecutionRunStatus, "failed" | "blocked" | "escalated">;
    },
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      const step = draft.plan_json.steps.find((entry) => entry.key === input.stepKey);
      if (!step) {
        throw new Error(`Execution step ${input.stepKey} not found`);
      }

      step.status = input.status === "blocked" ? "blocked" : "failed";
      step.error_message = input.errorMessage;
      draft.status = input.status;
      draft.current_step_key = step.key;
      draft.current_worker_type = step.worker_type;
      draft.last_error = input.errorMessage;
    });
  }

  async recordReplan(
    run: ExecutionRun,
    input: {
      stepKey: string;
      nextStep?: Partial<ExecutionPlanStep>;
      note: string;
      markSkipped?: boolean;
    },
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      const step = draft.plan_json.steps.find((entry) => entry.key === input.stepKey);
      if (!step) {
        throw new Error(`Execution step ${input.stepKey} not found`);
      }

      if (input.markSkipped) {
        step.status = "skipped";
      } else {
        step.status = "pending";
      }

      if (input.nextStep) {
        Object.assign(step, input.nextStep);
      }

      step.error_message = undefined;
      draft.plan_json.replan_count += 1;
      const pending = nextPendingStep(draft.plan_json);
      draft.status = pending ? "processing" : "completed";
      draft.current_step_key = pending?.key ?? null;
      draft.current_worker_type = pending?.worker_type ?? null;
      draft.last_error = pending ? input.note : null;
      draft.plan_json.ledger_entries.push({
        step_key: step.key,
        worker_type: "planner",
        action: "replan",
        input_summary: redactLedgerText(input.stepKey),
        outputs_summary: redactLedgerText(input.note),
        next_worker_note: input.markSkipped
          ? "Planner skipped the failed step and advanced the run."
          : "Planner revised the current step and will retry once.",
        attempt_number: draft.plan_json.replan_count,
        timestamp: new Date().toISOString(),
      });
    });
  }

  async reviseRemainingSteps(
    run: ExecutionRun,
    input: {
      revisedSteps: Array<{
        key: string;
        title: string;
        worker_type: ExecutionPlanStep["worker_type"];
        action: string;
        input: Record<string, unknown>;
        recoverable?: boolean;
      }>;
      note: string;
    },
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      const doneStatuses = new Set(["completed", "skipped", "failed", "blocked"]);
      const completedSteps = draft.plan_json.steps.filter((step) => doneStatuses.has(step.status));

      const revisedPendingSteps: ExecutionPlanStep[] = input.revisedSteps.map((step, index) => ({
        key: step.key,
        title: step.title,
        worker_type: step.worker_type,
        action: step.action,
        status: "pending",
        requested_tools: [],
        input: toJson(step.input) as Record<string, Json | undefined>,
        output: {},
        attempt_count: 0,
        idempotency_key: `${step.worker_type}-${step.action}-${index + 1}`,
        recoverable: step.recoverable ?? false,
      }));

      draft.plan_json.steps = [...completedSteps, ...revisedPendingSteps];
      draft.plan_json.replan_count += 1;
      draft.plan_json.ledger_entries.push({
        step_key: revisedPendingSteps[0]?.key ?? "checkpoint",
        worker_type: "planner",
        action: "checkpoint_replan",
        input_summary: redactLedgerText("general_agent checkpoint review"),
        outputs_summary: redactLedgerText(input.note),
        next_worker_note: "Planner revised remaining steps at checkpoint.",
        attempt_number: draft.plan_json.replan_count,
        timestamp: new Date().toISOString(),
      });

      const pending = nextPendingStep(draft.plan_json);
      draft.current_step_key = pending?.key ?? null;
      draft.current_worker_type = pending?.worker_type ?? null;
      draft.status = pending ? "processing" : "completed";
      draft.last_error = null;
    });
  }

  async markRunStatus(
    run: ExecutionRun,
    status: ExecutionRunStatus,
    errorMessage?: string,
  ): Promise<ExecutionRun> {
    return this.mutateRun(run, (draft) => {
      draft.status = status;
      draft.last_error = errorMessage ?? null;
      if (status === "completed") {
        draft.current_step_key = null;
        draft.current_worker_type = null;
      }
    });
  }

  buildTaskResult(run: ExecutionRun): Record<string, Json | undefined> {
    const completedSteps = run.plan_json.steps
      .filter((step) => step.status === "completed")
      .map((step) => ({
        key: step.key,
        worker_type: step.worker_type,
        action: step.action,
        tool_name: step.tool_name,
        output: toJson(step.output),
      }));

    return {
      execution_run: toJson({
        id: run.id ?? null,
        status: run.status,
        current_step_key: run.current_step_key,
        current_worker_type: run.current_worker_type,
        tool_policy_version: run.tool_policy_version,
        ledger_markdown: run.ledger_markdown,
        replan_count: run.plan_json.replan_count,
        completed_steps: completedSteps,
      }),
      summary:
        run.status === "completed"
          ? `Execution run completed with ${completedSteps.length} worker steps.`
          : `Execution run ${run.status}.`,
    };
  }
}

export const executionRunService = new ExecutionRunService();
