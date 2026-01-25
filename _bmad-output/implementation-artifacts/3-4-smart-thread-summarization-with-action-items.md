# Story 3.4: Smart Thread Summarization with Action Items

Status: done

## Acceptance Criteria

- **Given** a multi-message email thread
- **When** viewed in the Morning Brief
- **Then** the system provides a 3-bullet summary with highlighted action items. (AC: 4, 5)
- **And** PII is redacted before LLM processing and recovered after. (AC: 3)
- **And** every assertion includes a source citation (deep link). (AC: 6)

## Tasks / Subtasks

- [x] **Backend: Thread Summarizer Processor** (AC: 1, 2, 3)
  - [x] Update `packages/shared/src/schemas.ts` to include `ThreadSummarySchema`.
  - [x] Create `apps/agent/src/processors/ThreadSummarizer.ts`.
  - [x] Implement LLM prompt with strict JSON output matching the schema.
  - [x] Implement PII redaction/recovery loop in the processor.
  - [x] Update `ingested_threads` table: Alter `summary` column to `JSONB` or add `summary_json` field.
  - [x] Register in `ProcessorRegistry.ts` as `email.summarize`.
- [x] **Frontend: Summary UI** (AC: 4, 5, 6)
  - [x] Create `apps/web/src/components/activity/ThreadSummary.vue`.
  - [x] Use PrimeVue `Checkbox` and `Timeline` for action items and summary layout.
  - [x] Update `OutcomeCard.vue` to fetch and display the structured summary.
- [x] **Testing**
  - [x] Unit test `ThreadSummarizer` with mock multi-turn email data.
  - [x] Verify `PerimeterGuard` integration in the processor spec.

### Review Follow-ups (AI)
- [x] [AI-Review][HIGH] Generate missing migration for `summary_json`.
- [x] [AI-Review][HIGH] Update `database.types.ts` to include `summary_json`.
- [x] [AI-Review][MEDIUM] Fix `ThreadSummarizer.ts` error response types.
- [x] [AI-Review][MEDIUM] Sync `Dashboard.vue` types.

## Dev Agent Record

### Agent Model Used

Amelia (Developer Agent)

### Debug Log References

- Verified `ThreadSummarizer` with `mistral-small-latest` logic.
- Applied `PerimeterGuard` for PII safety (AC 3).
- Implemented 3-bullet Timeline UI in `ThreadSummary.vue` (AC 4, 5).
- Added Source Citation deep links (AC 6).

### Completion Notes List

- Implemented structured summarization engine for email threads.
- Added `summary_json` column to database and shared schemas.
- Developed interactive UI component for executive thread summaries.
- Integrated PII redaction and recovery into the summarization pipeline.

### File List

- `packages/shared/src/schemas.ts` [MODIFIED]
- `apps/agent/src/processors/ThreadSummarizer.ts` [ADDED]
- `apps/agent/src/processors/ThreadSummarizer.spec.ts` [ADDED]
- `apps/agent/src/processors/ProcessorRegistry.ts` [MODIFIED]
- `apps/web/src/components/activity/ThreadSummary.vue` [ADDED]
- `apps/web/src/components/activity/OutcomeCard.vue` [MODIFIED]
- `apps/web/src/views/Dashboard.vue` [MODIFIED]

