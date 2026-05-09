import { AuditLogger } from '../../services/AuditLogger.js';
import { memoryService } from '../../services/MemoryService.js';
import { buildEscalationPayload } from '../escalation.js';
import type { AgentState } from '../graph.js';
import type { AgentToolResult, ExecutionVerifierResult, SpecialistWorkerType } from './types.js';

const MAX_AUTOMATIC_REVIEW_RETRIES = 1;
const REVIEW_MEMORY_SNIPPET_LIMIT = 1200;

const DOMAIN_EVIDENCE_TOOLS: Record<SpecialistWorkerType, Set<string>> = {
  gmail: new Set(['draft_gmail_message', 'send_gmail_message', 'get_gmail_thread_content', 'manage_watch_topic', 'list_watch_topics']),
  calendar: new Set(['manage_event', 'query_freebusy']),
  docs: new Set(['create_doc', 'modify_doc_text', 'get_doc_content']),
  sheets: new Set(['create_spreadsheet', 'modify_sheet_values', 'read_sheet_values']),
  slides: new Set(['create_presentation', 'modify_presentation', 'batch_update_presentation']),
  drive: new Set(['search_drive_files', 'get_drive_file_content', 'create_drive_file', 'import_to_google_doc']),
};

const DOMAIN_REQUEST_PATTERNS: Record<SpecialistWorkerType, RegExp> = {
  gmail: /\b(gmail|e-?mail|mail|inbox|thread|reply|respond|send|draft|forward)\b/i,
  calendar: /\b(calendar|event|meeting|availability|freebusy|free busy)\b/i,
  docs: /\b(doc|docs|document|google docs)\b/i,
  sheets: /\b(sheet|sheets|spreadsheet|google sheets)\b/i,
  slides: /\b(slide|slides|presentation|deck|google slides)\b/i,
  drive: /\b(google drive|drive)\b/i,
};

const PREPARED_SEND_INTENT_PATTERN = /\b(send|sent|sending|forward|reply|respond|envoie|envoyer|exp[eé]die|transmets?|r[eé]ponds?|reponds?)\b/i;
const PREPARED_ARTIFACT_PATTERN = /\b(previously|already|existing|prepared|created|draft|message|brouillon|pr[eé]par[ée]?|cr[eé][ée]|d[eé]j[aà]|encore en brouillon|still in draft)\b/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isAgentToolResult(value: unknown): value is AgentToolResult {
  const record = asRecord(value);
  const agent = asNonEmptyString(record.agent);
  const status = asNonEmptyString(record.status);
  return Boolean(agent && status && asNonEmptyString(record.summary) !== null);
}

function getAgentToolResults(state: AgentState): AgentToolResult[] {
  const result = asRecord(state.task.result);
  const raw = result.agent_tool_results;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isAgentToolResult);
}

function getOriginalCommand(state: AgentState): string | undefined {
  const result = asRecord(state.task.result);
  const payload = asRecord(state.task.payload);
  return asNonEmptyString(result.agent_tool_original_request)
    ?? asNonEmptyString(payload.command)
    ?? asNonEmptyString(payload.command_text)
    ?? asNonEmptyString(payload.message_text)
    ?? undefined;
}

function truncateForReview(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= REVIEW_MEMORY_SNIPPET_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(-REVIEW_MEMORY_SNIPPET_LIMIT)}`;
}

function buildRepairPrompt(verification: ExecutionVerifierResult, originalCommand?: string): string {
  return [
    'The execution review did not pass. Retry the user request without repeating the same mistake.',
    originalCommand ? `Initial request: ${originalCommand}` : null,
    `Review finding: ${verification.summary}`,
    verification.repair_prompt ? `Required correction: ${verification.repair_prompt}` : null,
    'Before calling any specialist again, decide whether the correction is actionable or whether the user must clarify/confirm something.',
    'If clarification or confirmation is required, ask the user directly instead of calling tools.',
  ].filter((part): part is string => Boolean(part)).join('\n');
}

function isUserInitiatedAssistantTask(state: AgentState): boolean {
  if (state.task.domain_action !== 'assistant.command') {
    return false;
  }

  const payload = asRecord(state.task.payload);
  const channel = asNonEmptyString(payload.channel);
  const source = asNonEmptyString(payload.source);
  const isCommandCenter = state.task.topic === 'Command Center';

  if ((channel === 'web' || (!channel && isCommandCenter)) && (source === 'dashboard-command-center' || isCommandCenter)) {
    return true;
  }

  return payload.user_initiated === true && (channel === 'telegram' || channel === 'whatsapp');
}

function getInvocationRecords(result: AgentToolResult): Array<Record<string, unknown>> {
  return Array.isArray(result.tool_invocations)
    ? result.tool_invocations.map(asRecord).filter((record) => Object.keys(record).length > 0)
    : [];
}

function getInvocationToolName(record: Record<string, unknown>): string | null {
  return asNonEmptyString(record.tool_name) ?? asNonEmptyString(record.toolName) ?? asNonEmptyString(record.requested_tool);
}

function hasExecutionEvidence(result: AgentToolResult): boolean {
  const artifactCount = Object.keys(asRecord(result.artifacts)).length;
  if (artifactCount > 0) {
    return true;
  }

  const domainTools = DOMAIN_EVIDENCE_TOOLS[result.agent];
  return getInvocationRecords(result).some((record) => {
    const toolName = getInvocationToolName(record);
    return toolName ? domainTools.has(toolName) : false;
  });
}

function inferExpectedAgents(originalCommand?: string): SpecialistWorkerType[] {
  if (!originalCommand) {
    return [];
  }

  const expectedAgents = (Object.keys(DOMAIN_REQUEST_PATTERNS) as SpecialistWorkerType[])
    .filter((agent) => DOMAIN_REQUEST_PATTERNS[agent].test(originalCommand));

  if (
    expectedAgents.includes('gmail')
    && PREPARED_SEND_INTENT_PATTERN.test(originalCommand)
    && PREPARED_ARTIFACT_PATTERN.test(originalCommand)
  ) {
    return ['gmail'];
  }

  return expectedAgents;
}

export function verifyAgentToolResults(
  results: AgentToolResult[],
  options: { originalCommand?: string } = {},
): ExecutionVerifierResult {
  if (results.length === 0) {
    return {
      status: 'failed',
      summary: 'No specialist-agent tool results were returned.',
      repair_prompt: 'I could not verify specialist execution. Please rephrase the request or tell me which action to retry.',
    };
  }

  const failed = results.find((result) => result.status !== 'completed');
  if (failed) {
    return {
      status: 'failed',
      summary: `${failed.agent} specialist returned status ${failed.status}.`,
      repair_prompt: failed.next_prompt ?? failed.error ?? failed.summary,
    };
  }

  const missingHandoff = results.find((result) => !asNonEmptyString(result.handoff_content));
  if (missingHandoff) {
    return {
      status: 'failed',
      summary: `${missingHandoff.agent} specialist did not return handoff_content.`,
      repair_prompt: `Retry the ${missingHandoff.agent} specialist and require a concise handoff_content field before continuing.`,
    };
  }

  const missingEvidence = results.find((result) => !hasExecutionEvidence(result));
  if (missingEvidence) {
    return {
      status: 'failed',
      summary: `${missingEvidence.agent} specialist did not return artifact or tool invocation metadata.`,
      repair_prompt: `Retry the ${missingEvidence.agent} specialist and return artifact IDs/URLs or tool invocation metadata.`,
    };
  }

  const completedAgents = new Set(results.map((result) => result.agent));
  const missingExpectedAgent = inferExpectedAgents(options.originalCommand)
    .find((agent) => !completedAgents.has(agent));
  if (missingExpectedAgent) {
    return {
      status: 'failed',
      summary: `Expected ${missingExpectedAgent} specialist evidence was not returned.`,
      repair_prompt: `Retry with the ${missingExpectedAgent} specialist before finalizing this request.`,
    };
  }

  return {
    status: 'passed',
    summary: `Verified ${results.length} specialist-agent result${results.length === 1 ? '' : 's'}.`,
  };
}

export async function executionVerifierNode(state: AgentState): Promise<Partial<AgentState>> {
  const results = getAgentToolResults(state);
  const originalCommand = getOriginalCommand(state);
  const shortTermMemory = state.task.user_id
    ? await memoryService.loadShortTermMemory(state.task.organization_id, state.task.user_id)
    : '';
  const verification = verifyAgentToolResults(results, { originalCommand });
  const memoryTrace = shortTermMemory
    ? AuditLogger.createStep('Execution Verifier', 'Read short-term memory execution report', {
      input_summary: truncateForReview(shortTermMemory),
    })
    : AuditLogger.createStep('Execution Verifier', 'Skipped short-term memory review because task.user_id is missing');

  if (verification.status === 'failed') {
    const prompt = verification.repair_prompt ?? 'Please provide guidance so I can safely continue.';
    const nextReviewAttempt = (state.review_attempts ?? 0) + 1;

    if (nextReviewAttempt <= MAX_AUTOMATIC_REVIEW_RETRIES) {
      const repairPrompt = buildRepairPrompt(verification, originalCommand);

      if (state.task.user_id) {
        await memoryService.appendShortTermMemoryEntry(
          state.task.organization_id,
          state.task.user_id,
          [
            `### ${new Date().toISOString()} - Execution review failed`,
            `- Task: ${state.task.id ?? 'unknown'}`,
            `- Finding: ${verification.summary}`,
            `- Repair prompt: ${prompt}`,
            `- Next route: general_agent retry`,
          ].join('\n'),
        );
      }

      return {
        review_feedback: repairPrompt,
        review_attempts: nextReviewAttempt,
        task: {
          ...state.task,
          result: {
            ...(state.task.result ?? {}),
            agent_tool_review: {
              status: 'failed',
              summary: verification.summary,
              repair_prompt: prompt,
              attempt: nextReviewAttempt,
              checked_at: new Date().toISOString(),
            },
          },
        },
        trace: [
          memoryTrace,
          AuditLogger.createStep('Execution Verifier', `Failed: ${verification.summary}`, { output_summary: repairPrompt }),
        ],
      };
    }

    const status = isUserInitiatedAssistantTask(state) ? 'paused' : 'escalation';

    return {
      task: {
        ...state.task,
        status,
        result: buildEscalationPayload({
          reason: verification.summary,
          prompt,
          confidenceScore: 0,
          trigger: 'approval_guardrail',
          extra: {
            summary: prompt,
            agent_tool_results: results,
          },
        }),
      },
      review_feedback: null,
      review_attempts: nextReviewAttempt,
      trace: [
        memoryTrace,
        AuditLogger.createStep('Execution Verifier', `Failed: ${verification.summary}`, { output_summary: prompt }),
      ],
    };
  }

  if (state.task.user_id) {
    await memoryService.appendShortTermMemoryEntry(
      state.task.organization_id,
      state.task.user_id,
      [
        `### ${new Date().toISOString()} - Execution review passed`,
        `- Task: ${state.task.id ?? 'unknown'}`,
        `- Summary: ${verification.summary}`,
        `- Specialist results reviewed: ${results.length}`,
      ].join('\n'),
    );
  }

  return {
    review_feedback: null,
    task: {
      ...state.task,
      result: {
        ...(state.task.result ?? {}),
        agent_tool_verification: {
          status: 'passed',
          summary: verification.summary,
          checked_at: new Date().toISOString(),
        },
      },
    },
    trace: [memoryTrace, AuditLogger.createStep('Execution Verifier', verification.summary)],
  };
}
