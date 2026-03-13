# Story 6.5: Protocol Optimization "Diff" Summaries

Status: done

Story ID: 6.5
Story Key: 6-5-protocol-optimization-diff-summaries

## Change Log

- **2026-03-10**: Completed implementation of Protocol Optimization "Diff" Summaries.
  - Added `suggestOptimizations` to `ProtocolService`.
  - Implemented `ProtocolOptimizationProcessor` and `ProtocolUpdateProcessor`.
  - Updated Agent Controller `graph.ts` for generic escalation and routing.
  - Added "Optimization Suggestions" UI to `BrainSetup.vue` with `OutcomeCard` support.
  - Resolved regression in `MorningBriefProcessor.spec.ts`.

## Story

As an SME Leader,
I want to see suggested improvements to my protocols with clear "Diff" summaries,
so that I can evolve my assistant's behavior based on real-world performance (FR27).

## Acceptance Criteria

1. **Agent identifies optimization patterns from real-world data:**
   - **Given** the Agent Controller has processed multiple tasks for an organization
   - **When** the `system.optimize_protocol` task is triggered (manual or scheduled)
   - **Then** the Agent analyzes recent `agent_activity_log` entries (from Story 6.4) and the current `user_protocols` (from Story 3.1)
   - **And** identifies specific rules that are causing friction (e.g., repeated manual overrides by user) or high-latency escalations.
   - **And** the suggestion includes the triggering evidence (Task IDs or Log entries) and rationale.

2. **Natural Language "Diff" generation:**
   - **Given** an identified optimization
   - **When** the suggestion is prepared
   - **Then** the system generates a concise natural language "Diff" summary (e.g., "Suggesting we change follow-up from 2 to 3 days for Leo based on his focus patterns")
   - **And** it identifies the specific section of the Markdown to be modified.
   - **And** the summary is understandable without reading raw markdown diffs.

3. **Optimization Approval Flow in UI:**
   - **Given** a pending optimization suggestion (stored in `tasks` with status `review`)
   - **When** the user views the "Brain Setup" or Dashboard "Insights"
   - **Then** the suggestion is presented as an `OutcomeCard` with the NL Diff summary and a "View Reasoning" button.
   - **And** the user can "Approve" or "Decline" the change.

4. **Protocol Update on Approval:**
   - **Given** an approved optimization
   - **When** the user clicks "Approve"
   - **Then** the system updates the `user_protocols` table with the new markdown content
   - **And** it updates the `metadata` JSONB with any corresponding parameter changes (e.g., `nudging_frequency_hours`)
   - **And** it logs the protocol update in the `agent_activity_log` as a "Silent Win".

5. **Transparency and Rollback:**
   - **Given** a protocol update
   - **When** the user reviews the history in the Audit Log
   - **Then** the reasoning trace for the optimization is visible and linked to the evidence.

## Tasks / Subtasks

- [x] 1) Extend `ProtocolService` with Optimization Logic (AC: 1, 2)
  - [x] Implement `suggestOptimizations(organizationId: string)` in `apps/agent/src/services/ProtocolService.ts`.
  - [x] Use LLM to analyze `agent_activity_log` (recent terminal states) vs current protocol.
  - [x] Generate `ProtocolOptimizationSuggestion` shape (NL Diff, Old Content, New Content, Metadata Changes).
  - [x] Create a new processor `ProtocolOptimizationProcessor.ts` in `apps/agent/src/processors/` to handle `system.optimize_protocol` tasks. [Source: `apps/agent/src/processors/BaseProcessor.ts`]

- [x] 2) Implement Optimization Management flow (AC: 3)
  - [x] Register `system.optimize_protocol` in `apps/agent/src/processors/ProcessorRegistry.ts`.
  - [x] When generating a suggestion, set the task status to `review` (via graph escalation) and store the suggestion in `result.suggestion`.
  - [x] Ensure the escalation logic in `apps/agent/src/controller/escalation.ts` (and graph) can handle protocol approval requests.

- [x] 3) Build Optimization UI in the Hub (AC: 3, 4)
  - [x] Add an "Optimization Suggestions" section to `apps/web/src/views/BrainSetup.vue`.
  - [x] Create/Update `apps/web/src/components/activity/OutcomeCard.vue` to support "Optimization Suggestion" type with "Approve/Decline" buttons (via actions slot).
  - [x] Implement `approveOptimization` and `declineOptimization` actions in a new composable `useProtocolOptimization.ts`.

- [x] 4) Protocol Update Implementation (AC: 4)
  - [x] Upon approval, the web app should update the task status to `done` and create a new `protocol.update` task.
  - [x] Create `ProtocolUpdateProcessor.ts` to apply the change using `ProtocolService.saveProtocol`.
  - [x] Ensure `metadata` JSONB is updated correctly from the suggested changes. [Source: `supabase/migrations/20260120000000_add_metadata_to_user_protocols.sql`]

- [x] 5) Testing & Validation (AC: 1-5)
  - [x] Add unit tests for the optimization prompt logic in `ProtocolService.spec.ts`.
  - [x] Test the full approval loop from UI to DB update (via `ProtocolUpdateProcessor.spec.ts`).
  - [x] Ensure organization isolation is maintained.

## Dev Notes

- **Leverage Story 6.4**: Use the `agent_activity_log` which now stores standardized `ReasoningStep[]` and `Citation[]`. This is the perfect data source for pattern recognition. [Source: `_bmad-output/implementation-artifacts/6-4-comprehensive-reasoning-trace-audit-logs.md`]
- **LLM Guardrails**: The optimization prompt should be conservative. Do not suggest changes unless there is clear evidence of friction (e.g., user manually corrected an AI draft 3+ times).
- **Executive Calm UX**: Use the established Indigo (#334155) and Deep Teal (#059669) palette for the optimization cards. [Source: `_bmad-output/planning-artifacts/prd.md#Innovation & Novel Patterns`]
- **No Reinvention**: Reuse the `ReasoningTracePane` for showing the rationale behind a suggestion. [Source: `apps/web/src/components/activity/ReasoningTracePane.vue`]

### Project Structure Notes

- **Backend**: `apps/agent/src/services/ProtocolService.ts`, `apps/agent/src/processors/ProtocolOptimizationProcessor.ts`, `apps/agent/src/processors/ProtocolUpdateProcessor.ts`.
- **Frontend**: `apps/web/src/views/BrainSetup.vue`, `apps/web/src/components/activity/OutcomeCard.vue`, `apps/web/src/composables/useProtocolOptimization.ts`.
- **Types**: Add optimization schemas to `packages/shared/src/schemas.ts`.

### References

- PRD FR27: [Source: `_bmad-output/planning-artifacts/prd.md#Functional Requirements`]
- Architecture Data Architecture: [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture`]
- Epic 6 / Story 6.5: [Source: `_bmad-output/planning-artifacts/epics.md#Story 6.5`]

## Dev Agent Record

### Agent Model Used

antigravity-gemini-3-flash

### Debug Log References

### Completion Notes List

- Implemented `ProtocolService.suggestOptimizations` with LLM pattern recognition.
- Created `ProtocolOptimizationProcessor` for `system.optimize_protocol`.
- Updated `graph.ts` to support generic escalation and `protocol.update` routing.
- Created `ProtocolUpdateProcessor` to apply approved optimizations.
- Built optimization UI in `BrainSetup.vue` with `useProtocolOptimization` composable.
- Enhanced `OutcomeCard.vue` with `optimization` status styling.
- Fixed regression in `MorningBriefProcessor.spec.ts` caused by `AuditLogger` changes.

### File List

- `apps/agent/src/services/ProtocolService.ts`
- `apps/agent/src/services/ProtocolService.spec.ts`
- `apps/agent/src/processors/ProtocolOptimizationProcessor.ts`
- `apps/agent/src/processors/ProtocolUpdateProcessor.ts`
- `apps/agent/src/processors/ProtocolUpdateProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/web/src/composables/useProtocolOptimization.ts`
- `apps/web/src/views/BrainSetup.vue`
- `apps/web/src/components/activity/OutcomeCard.vue`
- `apps/agent/src/processors/MorningBriefProcessor.spec.ts`
- `packages/shared/src/schemas.ts`
- `apps/agent/src/processors/BaseProcessor.ts`
- `apps/agent/src/processors/EmailTriageProcessor.ts`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- `apps/agent/src/processors/ThreadSummarizer.ts`
- `apps/agent/src/services/RelancingScheduler.ts`
- `apps/agent/src/services/mcp.ts`
- `_bmad-output/implementation-artifacts/6-5-protocol-optimization-diff-summaries.md`
