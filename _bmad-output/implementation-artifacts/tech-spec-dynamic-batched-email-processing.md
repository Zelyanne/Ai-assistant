---
title: 'Dynamic Batched Email Processing for Gmail Ingestion and LLM Triage'
slug: 'dynamic-batched-email-processing'
created: '2026-03-13T09:47:22Z'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Node.js'
  - 'TypeScript'
  - 'Google Gmail API'
  - 'Supabase'
  - 'Mistral AI'
  - 'LangChain'
  - 'Zod'
  - 'Vitest'
files_to_modify:
  - 'apps/agent/src/services/google.ts'
  - 'apps/agent/src/processors/EmailTriageProcessor.ts'
  - 'apps/agent/src/services/emailBatching.ts'
  - 'packages/shared/src/schemas.ts'
  - 'apps/agent/src/services/google.spec.ts'
  - 'apps/agent/src/processors/EmailTriageProcessor.spec.ts'
  - 'apps/agent/src/services/emailBatching.spec.ts'
  - 'packages/shared/tests/schemas.spec.ts'
code_patterns:
  - 'Supabase task queue with domain_action-based processors'
  - 'Zod-validated structured LLM output'
  - 'PerimeterGuard redact-before-LLM and recover-after pattern'
  - 'AuditLogger flush for processor-level traceability'
  - 'Fail-soft batch item handling without crashing whole runs'
  - 'Retry/backoff wrappers around external API calls'
test_patterns:
  - 'Vitest unit tests with vi.mock-based dependency isolation'
  - 'Table-specific supabase.from mock chains'
  - 'Prompt-content assertions for LLM processors'
  - 'Retry and ingestion behavior assertions in service specs'
---

# Tech-Spec: Dynamic Batched Email Processing for Gmail Ingestion and LLM Triage

**Created:** 2026-03-13T09:47:22Z

## Overview

### Problem Statement

Email processing currently fans out into one request per item in two critical paths. Gmail ingestion lists threads and then fetches thread details one-by-one, while email triage sends one LLM request per thread using unbounded parallel execution. This creates unnecessary rate-limit exposure, uneven throughput, and poor scaling as mailbox volume grows.

### Solution

Introduce a shared batching strategy for both Gmail ingestion and LLM triage that groups emails dynamically by estimated token size, processes multiple emails per batch, and enforces bounded concurrency. For triage, a single LLM request should return an array of structured per-email JSON results instead of one request per email.

### Scope

**In Scope:**
- Batch Gmail thread-detail retrieval with bounded concurrency.
- Batch LLM triage so one request can classify multiple emails and return multiple JSON results.
- Dynamic batch sizing based on estimated tokens per email.
- Shared token estimation and batch-building rules.
- Concurrency caps and rate-limit-aware retry behavior.
- Initial token bands:
  - `0-800 tokens/email` -> max batch `16`
  - `800-1500 tokens/email` -> batch `8-12`
  - `1500-3000 tokens/email` -> batch `4-6`
  - `3000-6000 tokens/email` -> batch `2-3`
  - `>6000 tokens/email` -> batch `1`
- Initial request safety targets:
  - batched LLM input target `<= 12k-14k` tokens
  - reserve `1k-2k` output tokens for structured JSON
  - run `2-4` batches concurrently

**Out of Scope:**
- Reworking classification semantics, watch-topic behavior, or summary UX.
- Replacing the LLM provider.
- Perfect token counting in v1; estimated token sizing is sufficient.
- Broad Morning Brief presentation changes.

## Context for Development

### Codebase Patterns

- Gmail ingestion is anchored in `apps/agent/src/services/google.ts`, where `runAllIngestions()` is sequential across integrations and `ingestGmail()` currently performs `threads.list` followed by per-thread `threads.get` calls inside a loop.
- Gmail API retry behavior already exists in `apps/agent/src/services/google.ts`: 5 retries, 1-second initial delay, exponential backoff, and retry only for `429` and `>=500`. Any batching path should preserve and reuse this behavior.
- Email triage is anchored in `apps/agent/src/processors/EmailTriageProcessor.ts`, where one LangChain agent instance is reused for the run, but processing still fans out as one `agent.invoke()` per thread through `Promise.all`.
- Triage is already token-sensitive: the fallback body path truncates content to 1000 chars before prompt construction to reduce token pressure. Dynamic token-aware batching should build on that pattern instead of replacing it with raw item counts.
- The processor architecture is consistent: fetch from Supabase, redact with `PerimeterGuard`, call the model with structured JSON expectations, validate with Zod, persist back to `ingested_threads`, enqueue downstream work in `tasks`, and log with `AuditLogger.flush(...)`.
- Structured generation already exists in `apps/agent/src/services/llm/mistral.ts`, which supports `maxTokens` and usage accounting but does not currently enforce concurrency throttling, token estimation, or provider-level retry behavior.
- Shared schemas live in `packages/shared/src/schemas.ts`; `ThreadSummarySchema` is shared, while triage classification remains local to `EmailTriageProcessor.ts`, which is a likely contract-hardening point if batched triage results become first-class.
- There is an implementation constraint to resolve explicitly: ingestion stores `body` encrypted, while triage currently falls back to reading `body` directly if `metadata.snippet` is absent.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/services/google.ts` | Gmail ingestion flow, sequential integration processing, per-thread detail fetch loop, and retry/backoff implementation |
| `apps/agent/src/services/google.spec.ts` | Existing ingestion tests for thread fetch, label filtering, truncation, and queued triage side effects |
| `apps/agent/src/services/emailBatching.ts` | New shared batching utility for token estimation, batch packing, and bounded concurrency execution |
| `apps/agent/src/processors/EmailTriageProcessor.ts` | Current triage batching hotspot, prompt construction, classification persistence, and summarize task fan-out |
| `apps/agent/src/processors/EmailTriageProcessor.spec.ts` | Existing triage tests and assumptions about snippet fallbacks and invoke behavior |
| `apps/agent/src/services/emailBatching.spec.ts` | Unit coverage for token bands, request-budget splitting, and bounded concurrency execution |
| `apps/agent/src/services/llm/mistral.ts` | Structured JSON provider behavior, maxTokens support, and usage accounting |
| `packages/shared/src/schemas.ts` | Shared Zod schemas and likely home for any batched triage result contracts |
| `packages/shared/tests/schemas.spec.ts` | Shared schema regression coverage if new batch result schemas are introduced |
| `_bmad-output/implementation-artifacts/3-2-semantic-email-triage-keyword-classification.md` | Original triage story and prior guidance that batching is preferred |

### Technical Decisions

- Use dynamic estimated-token batching instead of fixed item-count batches.
- Keep one shared batching approach for both Gmail ingestion and LLM triage where practical.
- For triage, return an array of per-email JSON results in one structured response.
- Cap the smallest-email band at 16 items per batch.
- Do not introduce a separate fallback mode for large emails; the batching rules should naturally reduce batch size as token estimates grow.
- Preserve existing domain actions (`email.triage`, `email.summarize`) and the current task-queue workflow rather than introducing a new processor topology.
- Preserve the existing Gmail retry/backoff behavior and extend it to bounded concurrent detail retrieval instead of replacing it with unrestricted fan-out.
- Prefer a shared batching utility or provider-facing abstraction over duplicating token-band logic separately inside ingestion and triage.
- For batched triage, prefer direct structured-provider calls over LangChain agent invocations because this processor does not require tools and benefits more from deterministic JSON arrays than agent orchestration.
- Keep PII redaction/recovery and audit logging unchanged as mandatory perimeter behavior around any batch LLM call.
- Treat the encrypted-body versus plaintext fallback mismatch in triage as an implementation constraint that must be resolved in the plan.

## Implementation Plan

### Tasks

- [x] Task 1: Create a shared batching utility for token-aware packing and bounded concurrency
  - File: `apps/agent/src/services/emailBatching.ts`
  - Action: Add utilities to estimate tokens from email subject/content, map each email into the approved token bands, pack items into batches under both per-email band caps and the overall `12k-14k` input-token budget, and execute batches with a configurable concurrency limit.
  - Notes: Encode the approved bands exactly (`0-800 -> 16`, `800-1500 -> 8-12`, `1500-3000 -> 4-6`, `3000-6000 -> 2-3`, `>6000 -> 1`). Expose batch metadata such as `estimatedTokens`, `batchIndex`, `batchSize`, and `concurrencyLimit` for logging and tests.

- [x] Task 2: Define shared schemas for batched triage inputs and outputs
  - File: `packages/shared/src/schemas.ts`
  - Action: Add Zod schemas for batched triage result items and the top-level response array, keyed by `thread_id` and containing the existing classification shape (`matches`, `overall_priority_score`, `is_highlighted`).
  - Notes: Make `thread_id` mandatory so persistence does not depend on array order. Keep the classification payload backward compatible with the existing `ingested_threads.classification` JSON shape.

- [x] Task 3: Refactor Gmail ingestion from serial detail fetches to bounded concurrent request pools
  - File: `apps/agent/src/services/google.ts`
  - Action: Replace the serial `for...of` `threads.get` loop with a bounded concurrent worker pool over listed thread IDs while preserving label filtering, HTML/plaintext extraction, body truncation, encryption, upsert shape, and post-ingestion triage task enqueue.
  - Notes: Reuse the existing `retryOperation()` wrapper for every `threads.get` call. Keep `runAllIngestions()` sequential across integrations for v1. This task optimizes Gmail request fan-out via bounded concurrency, not a new Gmail multi-get API contract.

- [x] Task 4: Refactor email triage to submit one structured LLM request per token-aware batch
  - File: `apps/agent/src/processors/EmailTriageProcessor.ts`
  - File: `apps/agent/src/services/emailBatching.ts`
  - Action: Replace per-thread `Promise.all(agent.invoke)` behavior with token-aware batch assembly and one `generateStructured(...)` call per batch that returns an array of `{ thread_id, classification }`-style results.
  - Notes: Query plaintext fallback fields explicitly by selecting `summary` and using `metadata.snippet -> summary` as the LLM input path; do not send encrypted `body` content to the model. Preserve `PerimeterGuard` redaction/recovery, `AuditLogger`, per-thread persistence updates, and downstream `email.summarize` task creation.

- [x] Task 5: Add batch-safe failure handling, observability, and deterministic persistence behavior
  - File: `apps/agent/src/processors/EmailTriageProcessor.ts`
  - File: `apps/agent/src/services/google.ts`
  - Action: Log batch-level metrics and failures without exposing raw sensitive text, keep partial successes committing even if one item or one batch fails, and ensure result application always matches by `thread_id` rather than array position.
  - Notes: Preserve fail-soft behavior already present in triage. Distinguish retryable external failures (`429`, `>=500`) from parse/schema failures and record concise operational hints for both.

- [x] Task 6: Extend automated coverage for token bands, batching boundaries, and partial failures
  - File: `apps/agent/src/services/emailBatching.spec.ts`
  - Action: Add unit tests for token estimation heuristics, band assignment, request-budget splitting, max-batch enforcement, and bounded-concurrency execution.
  - File: `apps/agent/src/processors/EmailTriageProcessor.spec.ts`
  - Action: Update tests to cover grouped prompt generation, multi-result structured parsing, plaintext fallback order, partial batch failure handling, and summarize-task fan-out from batched results.
  - File: `apps/agent/src/services/google.spec.ts`
  - Action: Update ingestion tests to verify bounded concurrent `threads.get` behavior preserves retry, truncation, label filtering, and upsert semantics.
  - File: `packages/shared/tests/schemas.spec.ts`
  - Action: Add regression tests for the new batched triage schemas.

### Acceptance Criteria

- [x] AC 1: Given a Google workspace integration with multiple Gmail threads to ingest, when ingestion runs, then thread details are fetched through a bounded concurrent worker pool instead of a one-by-one loop, and each successful thread is still upserted exactly once into `ingested_threads`.
- [x] AC 2: Given emails with varying estimated sizes, when the batching utility builds triage work, then each batch obeys the approved token bands (`0-800 -> 16`, `800-1500 -> 8-12`, `1500-3000 -> 4-6`, `3000-6000 -> 2-3`, `>6000 -> 1`) and also respects the overall request safety target of approximately `12k-14k` input tokens.
- [x] AC 3: Given a triage batch is submitted to the LLM, when the model responds, then the response is a schema-validated array keyed by `thread_id`, and each result is persisted to the correct `ingested_threads` row without relying on result ordering.
- [x] AC 4: Given a triaged thread has topic matches or an overall priority score of at least 50, when its batch result is persisted, then the processor queues the same downstream `email.summarize` task behavior that exists today.
- [x] AC 5: Given `metadata.snippet` is missing for a thread, when triage prepares LLM input, then it uses plaintext fallback fields such as `summary` and does not send encrypted `body` ciphertext to the model.
- [x] AC 6: Given Gmail returns `429` or `>=500` during thread detail retrieval, when ingestion retries the request, then it preserves the existing exponential backoff behavior and limits failure impact to the affected thread or batch instead of aborting the entire ingestion run.
- [x] AC 7: Given one item fails validation or one batch fails during triage, when processing continues, then unaffected batches and unaffected thread results still complete successfully, and the failure is logged in a PII-safe way for operators.
- [x] AC 8: Given email subjects or snippets contain sensitive data, when batched triage runs, then `PerimeterGuard` redaction still happens before the LLM call, recovered output is written back after parsing, and audit logging remains intact.

## Additional Context

### Dependencies

- Existing Gmail ingestion contract in `apps/agent/src/services/google.ts`, especially `threads.list`, `threads.get`, and `retryOperation()`.
- Existing Supabase tables and queue flow: `workspace_integrations`, `ingested_threads`, `watch_topics`, and `tasks`.
- Existing triage and summary workflow from Story `3.2` and Story `3.4`.
- Existing shared encryption utilities and `PerimeterGuard` for safe content handling.
- Existing Mistral structured JSON generation path in `apps/agent/src/services/llm/mistral.ts`.

### Testing Strategy

- Unit test token-estimation and batch-packing behavior at token-band boundaries, including exact boundary values (`800`, `1500`, `3000`, `6000`) and request-budget overflow splits.
- Unit test bounded-concurrency execution so no more than the configured number of Gmail detail fetches or LLM triage batches run simultaneously.
- Update triage processor tests to verify one structured request can carry multiple emails, results are matched back by `thread_id`, plaintext fallback order is safe, and summarize-task fan-out is unchanged.
- Update Gmail ingestion tests to verify concurrent detail retrieval still preserves label filtering, truncation, encryption, retry behavior, and `email.triage` task enqueue semantics.
- Add schema tests for the batched triage response contract to prevent drift between processor logic and shared types.
- Manual verification: ingest a mailbox sample with short, medium, and long threads; confirm Gmail request concurrency stays bounded, LLM call count drops materially versus per-thread execution, and classification/summarization outcomes remain unchanged for equivalent inputs.

### Notes

- User-approved token bands are first-class design inputs and should be stored as explicit constants rather than scattered magic numbers.
- Gmail ingestion and LLM triage do not share the same transport constraints: triage batching is token-driven, while Gmail optimization is bounded request concurrency because thread details are still fetched via per-thread `threads.get` calls in the current API usage.
- The largest implementation risk is heuristic token estimation drift. Keep the estimator simple, deterministic, and test-covered; tune constants later using observed usage metrics rather than overfitting v1.
- Batched triage responses must include `thread_id` in every item. Relying on array order is too fragile once retries, partial failures, or future provider changes enter the path.
- Keep summarization out of this change set. The downstream `email.summarize` contract should remain one task per qualifying thread for v1.

## Review Notes

- Adversarial review completed
- Findings: 4 total, 4 fixed, 0 skipped
- Resolution approach: auto-fix
