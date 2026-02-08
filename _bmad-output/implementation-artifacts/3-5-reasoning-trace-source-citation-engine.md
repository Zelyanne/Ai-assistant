# Story 3.5: Reasoning Trace & Source Citation Engine

Status: done

## Story

As an SME Leader,
I want to see the evidence and logic behind every AI assertion,
so that I can trust the summaries and automated decisions (FR20, FR26).

## Acceptance Criteria

1. [x] **Given** any AI-generated summary in the Morning Brief
2. [x] **When** I click "View Trace" on the Outcome Card
3. [x] **Then** a slide-out "Reasoning Trace" pane (Drawer) appears from the right
4. [x] **And** it displays a chronological timeline of the agent's step-by-step logic
5. [x] **And** each step shows a timestamp, step name, message, and confidence indicator if available
6. [x] **And** the pane includes a "Citations" section with clickable deep links to original source messages (e.g., Gmail)
7. [x] **And** PII remains redacted in the trace if the original source was redacted (Consistency with PerimeterGuard)

## Tasks / Subtasks

- [x] **Backend: Reasoning Trace Infrastructure**
  - [x] Enhance `BaseProcessor.ts` to include a `trace` collection mechanism.
  - [x] Update `ThreadSummarizer.ts` to log detailed steps:
    - Step 1: Ingesting thread messages (Input Summary)
    - Step 2: Applying PII Redaction & Perimeter Check
    - Step 3: Generating structured summary (LLM Reasoning)
    - Step 4: Recovering PII & Finalizing
  - [x] Implement Gmail deep-link generation logic in citations (format: `https://mail.google.com/mail/u/0/#all/{{thread_id}}` or message ID search).
- [x] **Frontend: Reasoning Trace UI**
  - [x] Create `apps/web/src/components/activity/ReasoningTracePane.vue` using PrimeVue `Drawer` (Sidebar).
  - [x] Use PrimeVue `Timeline` component for the reasoning steps.
  - [x] Implement color coding for confidence levels (Green > 0.8, Amber 0.5-0.8, Red < 0.5).
  - [x] Create `apps/web/src/composables/useReasoningTrace.ts` to fetch log data for a given `task_id` from `agent_activity_log`.
- [x] **Frontend: Integration**
  - [x] Update `OutcomeCard.vue` to handle the "View Trace" button click and emit `open-trace` with the `taskId`.
  - [x] Integrate `ReasoningTracePane` into `apps/web/src/views/Dashboard.vue`.
  - [x] Ensure "Executive Calm" styling (Indigo/Teal/Amber) is applied to the timeline and links.

## Dev Notes

- **Architecture Compliance:** Use the existing `agent_activity_log` table. Do not create new tables.
- **Security:** Ensure the Supabase query for the trace includes `organization_id` filter (RLS should handle this, but be explicit in service calls).
- **Redaction:** Reasoning steps stored in the DB should be PII-safe if they contain content from the `PerimeterGuard`.
- **UI Framework:** Use PrimeVue `Drawer`, `Timeline`, and `Button` components.

### Project Structure Notes

- Components: `apps/web/src/components/activity/`
- Composables: `apps/web/src/composables/`
- Shared Types: `packages/shared/src/schemas.ts` (ReasoningTraceSchema is already defined).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: packages/shared/src/schemas.ts#ReasoningTraceSchema]

## Dev Agent Record

### Agent Model Used

antigravity-gemini-3-flash

### Debug Log References

- Verified `BaseProcessor` trace collection with `BaseProcessor.spec.ts`.
- Verified `ThreadSummarizer` trace logging and citation links with `ThreadSummarizer.spec.ts`.

### Completion Notes List

- Implemented `BaseProcessor.addTraceStep` and `getTrace` for standardized reasoning capture.
- Updated `ThreadSummarizer` to record 4 distinct reasoning steps and generate Gmail deep links.
- Created `ReasoningTracePane.vue` using PrimeVue `Drawer` and `Timeline` for an "Executive Calm" presentation.
- Integrated the pane into `Dashboard.vue`, enabling the "View Trace" button on all task-based outcome cards.
- Added `supabase/migrations/20260125000000_add_summary_json_to_threads.sql` to support structured summary storage.


### File List

- `apps/agent/src/processors/BaseProcessor.ts`
- `apps/agent/src/processors/BaseProcessor.spec.ts`
- `apps/agent/src/processors/ThreadSummarizer.ts`
- `apps/agent/src/processors/ThreadSummarizer.spec.ts`
- `apps/web/src/composables/useReasoningTrace.ts`
- `apps/web/src/components/activity/ReasoningTracePane.vue`
- `apps/web/src/components/activity/OutcomeCard.vue`
- `apps/web/src/views/Dashboard.vue`
- `supabase/migrations/20260125000000_add_summary_json_to_threads.sql`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
