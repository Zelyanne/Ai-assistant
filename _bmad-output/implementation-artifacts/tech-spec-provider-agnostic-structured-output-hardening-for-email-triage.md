---
title: 'Provider-Agnostic Structured Output Hardening for Email Triage'
slug: 'provider-agnostic-structured-output-hardening-for-email-triage'
created: '2026-03-20T00:00:00Z'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js'
  - 'TypeScript'
  - 'Zod'
  - 'Mistral AI SDK'
  - 'Vitest'
  - 'Supabase'
files_to_modify:
  - 'apps/agent/src/processors/EmailTriageProcessor.ts'
  - 'apps/agent/src/services/emailBatching.ts'
  - 'apps/agent/src/services/llm/types.ts'
  - 'apps/agent/src/services/llm/structuredOutput.ts'
  - 'apps/agent/src/services/llm/mistral.ts'
  - 'apps/agent/src/processors/EmailTriageProcessor.spec.ts'
  - 'apps/agent/src/services/llm/mistral.spec.ts'
  - 'apps/agent/src/services/ProtocolService.spec.ts'
code_patterns:
  - 'Database-as-Queue processor flow with fail-soft task execution'
  - 'Shared LLM provider factory returning a provider-level generateStructured API'
  - 'Zod-validated structured output with provider-specific parsing before validation'
  - 'Token-aware batching with bounded concurrency and per-thread fallback'
  - 'PerimeterGuard redact-before-LLM and recover-after pattern'
test_patterns:
  - 'Vitest unit tests with hoisted mocks and provider factory stubbing'
  - 'Prompt-content assertions for batched LLM calls'
  - 'Mocked provider.generateStructured success and failure sequencing'
  - 'Retry queue assertions against mocked Supabase insert/update chains'
---

# Tech-Spec: Provider-Agnostic Structured Output Hardening for Email Triage

**Created:** 2026-03-20T00:00:00Z

## Overview

### Problem Statement

`email.triage` currently fails batch-wide when the LLM returns malformed structured output, especially invalid JSON from batched classification calls. This causes dropped classifications, noisy retry churn, and operational instability in the email triage path even when only part of a batch is problematic.

### Solution

Introduce a provider-agnostic structured-output resilience layer for `email.triage` that retries malformed structured responses once with stricter JSON constraints, then degrades failed batches into smaller batches or single-thread calls. The flow should keep salvage attempts bounded, preserve partial successes, and classify exhausted parse failures as non-retryable defects rather than endlessly retryable upstream errors.

### Scope

**In Scope:**
- Harden `email.triage` structured-output handling for malformed LLM responses.
- Define a provider-agnostic structured-output resilience pattern at the LLM service boundary.
- Retry malformed JSON once with stricter structured-output instructions.
- Split failed batches into smaller batches and single-thread fallbacks.
- Bound salvage attempts and classify exhausted parse failures as non-retryable.
- Preserve existing triage persistence, retry queueing, audit logging, and downstream `email.summarize` behavior.
- Add automated coverage for malformed JSON, salvage flow, and partial-success handling.

**Out of Scope:**
- General MCP startup timeout hardening.
- Replacing Mistral as the provider.
- Redesigning classification semantics or watch-topic logic.
- Reworking the broader Gmail ingestion pipeline.

## Context for Development

### Codebase Patterns

- The agent runtime is Node.js + TypeScript with shared schemas imported from `@ai-assistant/shared`, and structured outputs are validated with Zod after provider parsing.
- `EmailTriageProcessor` already uses token-aware batching from `apps/agent/src/services/emailBatching.ts`, bounded concurrency execution, fail-soft persistence, and scoped retry queueing through Supabase `tasks`.
- Batched triage currently flows `process()` -> `processBatch()` -> `generateBatchClassifications()` -> `llmProvider.generateStructured(...)`, so parser hardening can be introduced either at the provider boundary or in triage-specific orchestration.
- `generateStructured(...)` is exposed via the shared `ILLMProvider` contract in `apps/agent/src/services/llm/types.ts` and instantiated through `LLMProviderFactory`, which currently supports only `mistral` but already centralizes provider behavior.
- `MistralProvider.generateStructured()` in `apps/agent/src/services/llm/mistral.ts` cleans markdown fences, then directly runs `JSON.parse(...)`, then `schema.parse(...)`; malformed JSON fails before schema validation and currently surfaces as a hard exception.
- `EmailTriageProcessor` already distinguishes retryable external failures (`429`, `>=500`) from `json_parse_failure` and `schema_validation_failure`, but only the external failures are retried inside `retryExternalOperation()`.
- Existing single-thread fallback only activates when a batch returns valid structured output that omits a thread result; it does not salvage malformed JSON responses that fail before `results` can be read.
- `PerimeterGuard` redaction/recovery and audit logging are mandatory cross-cutting constraints and any resilience layer must preserve them unchanged.
- Shared-call impact matters: `ProtocolService`, `ThreadSummarizer`, and controller reasoning code also call `generateStructured(...)`, so provider-boundary changes need compatibility discipline even though this spec targets `email.triage` first.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/processors/EmailTriageProcessor.ts` | Main triage processor, batch prompt construction, retry classification, retry queueing, and current single-thread fallback behavior |
| `apps/agent/src/services/llm/mistral.ts` | Current provider-specific structured parsing path with markdown cleanup, direct `JSON.parse(...)`, and Zod validation |
| `apps/agent/src/services/llm/types.ts` | Shared `ILLMProvider` contract and `LLMOptions` surface for provider-agnostic structured-output behavior |
| `apps/agent/src/services/llm/factory.ts` | Central provider factory and current provider registration boundary |
| `apps/agent/src/services/emailBatching.ts` | Token-aware batching and bounded concurrency utilities that a split-and-salvage strategy can reuse |
| `apps/agent/src/processors/EmailTriageProcessor.spec.ts` | Existing triage tests for partial failure, single-thread fallback, retry exhaustion, and provider-factory usage |
| `apps/agent/src/services/llm/mistral.spec.ts` | Existing provider tests for JSON mode, markdown fence cleanup, array schemas, and schema validation failure |
| `apps/agent/src/services/ProtocolService.ts` | Shared non-triage `generateStructured(...)` consumer that constrains provider-boundary API changes |
| `apps/agent/src/services/ProtocolService.spec.ts` | Existing shared-caller test surface that should catch breaking contract changes |
| `apps/agent/src/processors/ThreadSummarizer.ts` | Another structured-output consumer showing the common redact -> generateStructured -> persist pattern |
| `apps/agent/src/controller/graph.ts` | Controller reasoning path that escalates on `generateStructured(...)` failure rather than retrying, useful for provider-boundary compatibility checks |
| `_bmad-output/implementation-artifacts/tech-spec-dynamic-batched-email-processing.md` | Prior batching spec this hardening work builds on |

### Technical Decisions

- Primary target is `email.triage`; MCP timeout investigation is explicitly excluded from this spec.
- Recovery order should be: stricter structured retry once, then smaller-batch degradation, then single-thread fallback.
- Invalid structured output should become non-retryable after bounded salvage attempts are exhausted.
- The hardening design should be provider-agnostic, even if the first implementation lands in the current Mistral-backed path.
- The provider contract likely needs additive structured-output resilience options rather than breaking changes to existing `generateStructured(...)` callers.
- The safest split point is to keep triage orchestration in `EmailTriageProcessor` while moving generic parse/retry helpers into the LLM service layer, so triage can opt into salvage without forcing all other structured callers into retry loops.
- `emailBatching.ts` should be reused for smaller-batch degradation instead of inventing a second batching algorithm inside triage.
- Shared callers like `ProtocolService` and `ThreadSummarizer` suggest the provider boundary should expose richer failure semantics or helper behavior, but default behavior must stay compatible for existing consumers.
- GitNexus investigation found `generateBatchClassifications` has `CRITICAL` upstream impact within the processor path (`processBatch`, `classifySingleThreadFromBatchItem`, `process`), while `generateStructured` appears shared across multiple modules, reinforcing a careful split between provider-level primitives and triage-specific salvage orchestration.

## Implementation Plan

### Tasks

- [x] Task 1: Define provider-agnostic structured-output resilience types and helper primitives
  - File: `apps/agent/src/services/llm/types.ts`
  - Action: Extend the shared LLM contract with additive structured-output resilience options and normalized failure metadata that callers can opt into without breaking existing `generateStructured(...)` consumers.
  - File: `apps/agent/src/services/llm/structuredOutput.ts`
  - Action: Create a shared helper module for markdown-fence cleanup, malformed-output classification, stricter JSON retry prompt composition, and reusable parse-attempt bookkeeping.
  - Notes: Keep the default path backward compatible so current callers like `ProtocolService` and `ThreadSummarizer` still get the same throw-on-failure behavior unless they explicitly enable recovery.

- [x] Task 2: Implement bounded malformed-JSON recovery in the Mistral provider
  - File: `apps/agent/src/services/llm/mistral.ts`
  - Action: Refactor `generateStructured(...)` to use the shared helper, retry once on malformed JSON with stricter JSON-only instructions, and preserve the existing Zod validation path after successful parsing.
  - Notes: Only malformed-output parsing issues should use this recovery path; schema validation failures and transport failures should keep their current distinct handling. Do not silently coerce invalid payloads into schema-shaped data.

- [x] Task 3: Teach email triage to opt into provider recovery and degrade failed batches safely
  - File: `apps/agent/src/processors/EmailTriageProcessor.ts`
  - Action: Update `generateBatchClassifications()` to request structured-output recovery for batched triage, detect exhausted malformed-output failures distinctly, and route failed batches into a salvage sequence instead of immediately treating the whole batch as unresolved.
  - File: `apps/agent/src/services/emailBatching.ts`
  - Action: Add or expose a reusable way to rebuild smaller sub-batches from a failed batch payload while preserving token-aware limits and original item identity.
  - Notes: Recovery order must be exactly: provider-level stricter retry once, then smaller sub-batches, then existing single-thread fallback.

- [x] Task 4: Preserve partial successes and tighten triage failure semantics
  - File: `apps/agent/src/processors/EmailTriageProcessor.ts`
  - Action: Ensure successful classifications from salvaged batches still persist by `thread_id`, downstream `email.summarize` tasks are still enqueued, and exhausted malformed-output failures are logged with a dedicated non-retryable hint instead of being treated like retryable upstream outages.
  - Notes: Keep `PerimeterGuard` redaction/recovery, audit logging, and current Supabase retry queue behavior for unresolved threads, but prevent infinite retry churn for parse-exhausted cases.

- [x] Task 5: Expand automated coverage for provider recovery, triage salvage, and shared-caller compatibility
  - File: `apps/agent/src/services/llm/mistral.spec.ts`
  - Action: Add tests for malformed JSON recovery, stricter retry prompt behavior, and exhaustion after the configured repair limit.
  - File: `apps/agent/src/processors/EmailTriageProcessor.spec.ts`
  - Action: Add tests for batch-level malformed JSON that recovers on retry, batch degradation into smaller groups, single-thread salvage, partial persistence, and non-retryable parse exhaustion behavior.
  - File: `apps/agent/src/services/ProtocolService.spec.ts`
  - Action: Add a compatibility assertion proving existing shared callers still work unchanged when they do not opt into resilience features.
  - Notes: Reuse the current Vitest mocking pattern with sequenced `generateStructured` responses so failure order is explicit and deterministic.

### Acceptance Criteria

- [ ] AC 1: Given `email.triage` receives a malformed JSON batch response, when provider-level structured-output recovery is enabled, then the provider retries that request once with stricter JSON-only instructions before triage marks the batch unresolved.
- [ ] AC 2: Given the stricter provider retry still returns malformed structured output for a multi-thread triage batch, when the processor continues, then it rebuilds the failed work into smaller token-aware sub-batches before falling back to single-thread calls.
- [ ] AC 3: Given a degraded batch or single-thread fallback returns a valid result, when triage persists the response, then the classification is matched by `thread_id`, stored on the correct `ingested_threads` row, and any qualifying `email.summarize` task is still queued.
- [ ] AC 4: Given malformed structured output remains invalid after all bounded salvage attempts, when triage finishes processing, then the failure is logged with a dedicated non-retryable parse-exhausted classification and the system does not loop indefinitely on that same failure mode.
- [ ] AC 5: Given the provider returns `429` or `>=500`, when triage calls `generateStructured(...)`, then the existing retryable external failure behavior remains intact and distinct from malformed-output recovery.
- [ ] AC 6: Given `ProtocolService` or another existing shared caller invokes `generateStructured(...)` without the new resilience options, when it receives valid structured output, then its behavior remains backward compatible and no caller changes are required for the happy path.
- [ ] AC 7: Given a triage run contains both salvageable and unsalvageable threads, when processing completes, then successful thread updates are committed, only unresolved thread IDs remain skipped or re-queued, and unaffected batch items are not lost due to one malformed response.
- [ ] AC 8: Given redacted subject or snippet text is retried through stricter provider recovery, smaller-batch salvage, or single-thread fallback, when the LLM is called, then `PerimeterGuard` redaction still occurs before every request and recovered output is restored before persistence.

## Additional Context

### Dependencies

- Existing batched triage processor flow.
- Existing LLM provider contract and Zod schema validation.
- Existing retry queueing and downstream summarize task behavior.
- Existing shared provider consumers that rely on `generateStructured(...)` returning parsed data or throwing on failure.
- Existing token-aware batching utilities in `apps/agent/src/services/emailBatching.ts` so split-and-salvage logic does not duplicate batching rules.
- Shared schemas in `@ai-assistant/shared` for batched triage output and existing email classification contracts.

### Testing Strategy

- Extend provider tests to cover malformed JSON, salvageable markdown/formatting noise, and bounded structured-output retry behavior without weakening schema validation expectations.
- Extend triage tests to cover a malformed batch response that succeeds after one stricter retry, a malformed batch response that degrades into smaller batches, and final single-thread salvage behavior.
- Verify exhausted parse failures are classified distinctly from retryable upstream transport errors and do not loop indefinitely.
- Verify partial-success persistence still updates successful thread classifications and only re-queues unresolved thread IDs.
- Add compatibility coverage for at least one non-triage `generateStructured(...)` caller so provider-boundary changes do not silently break protocol generation expectations.
- Manual verification: run a seeded `email.triage` scenario where the first batched response is malformed, confirm one stricter provider retry occurs, then confirm smaller-batch or single-thread salvage processes the remaining threads without dropping successful results.
- Manual verification: force a true parse-exhausted path and confirm logs, skipped thread IDs, and queued follow-up behavior match the new non-retryable parse policy rather than the transport-retry policy.

### Notes

- GitNexus quick context: `generateBatchClassifications` shows `CRITICAL` upstream risk because it directly affects `processBatch`, `classifySingleThreadFromBatchItem`, and the main `process` flow in `apps/agent/src/processors/EmailTriageProcessor.ts`.
- GitNexus also shows `generateStructured` is shared beyond triage, which supports the provider-agnostic requirement at the service boundary rather than a triage-only parser hack.
- Highest-risk implementation trap: making provider recovery global by default could silently change escalation behavior in other `generateStructured(...)` callers. The resilience API should therefore be opt-in for triage-specific salvage behavior.
- A second high-risk area is retry amplification: provider retry plus sub-batch degradation plus single-thread fallback can multiply LLM calls quickly, so salvage limits must be explicit and test-covered.
- Keep the malformed-output policy narrowly scoped to parse failures. Schema validation failures still signal structurally wrong but parseable data and should not be auto-salvaged unless a later story explicitly requires that behavior.
- Future follow-up, out of scope here: if the provider-agnostic helper proves stable, the same resilience mode could later be adopted by `ThreadSummarizer` or controller reasoning paths where partial salvage is valuable.

## Review Notes

- Adversarial review completed
- Findings: 2 total, 2 fixed, 0 skipped
- Resolution approach: auto-fix
