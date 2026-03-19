# Story 2.11: EOD Memory Aggregator & Rotation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want to implement the EOD (End of Day) summary and rotation logic,
So that short-term tasks are distilled into weekly memories and the daily log is reset automatically.

## Acceptance Criteria

1. [ ] Implement `EODMemoryAggregator` service in `apps/agent/src/services/EODMemoryAggregator.ts` that:
   - Reads `short-term.md` content for the current day
   - Generates a concise summary using LLM reasoning
   - Appends summary to `weekly-memory.md`
   - Clears/resets `short-term.md` for the next day
2. [ ] Implement `EODScheduler` in `apps/agent/src/services/EODScheduler.ts` following the existing scheduler pattern:
   - Uses `setInterval` pattern (like `BriefingScheduler`, `StatusReportScheduler`)
   - Configurable trigger time (default: 23:00 UTC or organization-specific)
   - Idempotency check to prevent duplicate EOD processing
   - Per-organization execution
3. [ ] Create `EO DMemoryProcessor` in `apps/agent/src/processors/EODMemoryProcessor.ts`:
   - Extends `BaseProcessor`
   - Handles `eod.memory.rotate` domain_action
   - Integrates with LLM for intelligent summarization
   - Logs rotation activity to audit trail
4. [ ] Register processor in `ProcessorRegistry.ts`
5. [ ] Add scheduler startup to agent controller initialization (`apps/agent/src/controller/index.ts` or equivalent)
6. [ ] Ensure strict data isolation by `organization_id` (storage path: `apps/agent/data/memory/{{org_id}}/`)
7. [ ] Add comprehensive tests:
   - Unit tests for `EODMemoryAggregator` summarization logic
   - Unit tests for `EODScheduler` timing logic
   - Integration tests for full EOD rotation flow
   - Test for multi-tenant isolation
8. [ ] Add configuration for EOD trigger time in organization settings or `.env`

## Tasks / Subtasks

- [x] Define EOD scheduler configuration and constants (AC: 2, 8)
  - [x] Add `EOD_TRIGGER_TIME_UTC` constant (default: '23:00')
  - [x] Add environment variable support for custom trigger time
- [x] Implement `EODMemoryAggregator` core service (AC: 1, 6)
  - [x] Create `apps/agent/src/services/EODMemoryAggregator.ts`
  - [x] Implement `summarizeDailyMemory(orgId: string, date: Date)` method
  - [x] Implement `appendToWeeklyMemory(orgId: string, summary: string)` method
  - [x] Implement `resetShortTermMemory(orgId: string)` method
  - [x] Integrate with LLM for intelligent summarization (use existing LLM service)
- [x] Implement `EODScheduler` (AC: 2, 6)
  - [x] Create `apps/agent/src/services/EODScheduler.ts`
  - [x] Follow pattern from `BriefingScheduler` and `StatusReportScheduler`
  - [x] Implement `checkAndTriggerEOD()` method with idempotency
  - [x] Add per-organization last-run tracking to prevent duplicates
- [x] Implement `EODMemoryProcessor` (AC: 3, 7)
  - [x] Create `apps/agent/src/processors/EODMemoryProcessor.ts`
  - [x] Extend `BaseProcessor`
  - [x] Implement `process()` method for `eod.memory.rotate` domain_action
  - [x] Add comprehensive error handling and logging
- [x] Register processor and start scheduler (AC: 4, 5)
  - [x] Add `EODMemoryProcessor` to `ProcessorRegistry.ts`
  - [x] Import and start `eodScheduler` in agent controller initialization
- [x] Add tests (AC: 7)
  - [x] Unit tests for `EODMemoryAggregator`
  - [x] Unit tests for `EODScheduler` with mocked time
  - [x] Integration test for full EOD flow
- [x] Add configuration documentation (AC: 8)
  - [x] Document `EOD_TRIGGER_TIME_UTC` environment variable
  - [x] Add example to `.env.example`

## Dev Notes

### Story Context and Scope

- This story implements the EOD rotation logic mentioned in Story 2.10 but not implemented.
- Story 2.10 created the `MemoryService` foundation; this story adds the automated rotation.
- EOD = End of Day, typically triggered at 23:00 UTC or organization-specific time.
- The rotation process is critical for maintaining clean, manageable memory files.

### Epic Context

- Epic 2: Agent Controller Foundation & Task Orchestration.
- Epic 3: The "Brain" & Memory Layer (FR1-FR5 from PRD).
- This story completes the memory lifecycle: create → use → rotate → archive.

### Relevant Existing Implementation (Do Not Reinvent)

- **BriefingScheduler** (`apps/agent/src/services/BriefingScheduler.ts`): Follow this exact pattern for the scheduler.
- **StatusReportScheduler** (`apps/agent/src/services/StatusReportScheduler.ts`): Another scheduler pattern reference with idempotency.
- **MemoryService** (from Story 2.10): Should already exist at `apps/agent/src/services/MemoryService.ts` - use its read/write methods.
- **MorningBriefProcessor** (`apps/agent/src/processors/MorningBriefProcessor.ts`): Similar processor pattern for LLM-based content generation.
- **ProtocolService** (`apps/agent/src/services/ProtocolService.ts`): Handles `.md` file operations, may share patterns.

### Technical Requirements

- **Scheduler Pattern**: Use `setInterval` with minute-level checks (like existing schedulers), NOT node-cron (no new dependencies).
- **LLM Integration**: Use existing LLM service/reasoning integration for summarization (see Story 2.5 for LLM reasoning pattern).
- **Idempotency**: Track last EOD run per organization to prevent duplicate processing.
- **File Operations**: Use `fs/promises` for async I/O, atomic writes to prevent corruption.
- **Time Handling**: All times in UTC, use `Date.toISOString()` for timestamps.
- **Memory Layers**:
  - `short-term.md`: Daily task history, resets EOD
  - `weekly-memory.md`: Accumulates EOD summaries, resets EOM (future story)
  - `persona.md`: Never modified by EOD process

### Architecture Compliance

- Architecture mandates: "Memory Storage: File-based Markdown storage on the Hetzner node."
- Follow the "Database-centric Event Loop" pattern: EOD triggers via scheduler, results persisted to file system.
- Maintain multi-tenant isolation: all operations scoped to `organization_id`.
- EOD rotation should be logged to `agent_activity_log` table for audit trail.

### Library / Framework Requirements

- NO new dependencies - use existing `setInterval` pattern from other schedulers.
- Use Node.js `fs/promises` for file I/O.
- Use existing LLM service for summarization (do not create new LLM integration).
- Use `path` module for cross-platform path resolution.

### File Structure Requirements

```
apps/agent/src/services/
  ├── EODMemoryAggregator.ts      # NEW - Core aggregation logic
  └── EODScheduler.ts              # NEW - Scheduler following existing pattern

apps/agent/src/processors/
  ├── EODMemoryProcessor.ts        # NEW - Processor for eod.memory.rotate
  └── BaseProcessor.ts             # EXISTING - Extend this

apps/agent/src/
  └── processors/ProcessorRegistry.ts  # EXISTING - Register new processor

apps/agent/data/memory/{org_id}/
  ├── short-term.md                # EXISTING - Reset by EOD
  ├── weekly-memory.md             # EXISTING - Appended by EOD
  └── persona.md                   # EXISTING - Not modified
```

### Testing Requirements

- Use Vitest (existing test framework).
- Mock `fs` for unit tests to avoid actual disk writes.
- Mock time for scheduler tests (use `vi.useFakeTimers()`).
- Test idempotency: ensure same-day duplicate triggers are skipped.
- Test multi-tenant: verify org A's EOD doesn't affect org B's memory.

### Previous Story Intelligence (2.10 - Layered Memory Manager)

- MemoryService should provide: `readMemory()`, `writeMemory()`, `updateTaskState()` methods.
- Memory files are stored at: `apps/agent/data/memory/{organization_id}/{artifact_name}.md`
- Story 2.10 defined the structure but EOD rotation was explicitly deferred to this story.
- The `task-state.json` should track EOD rotation status.

### Git Intelligence Summary

- Recent commits show scheduler pattern standardization across BriefingScheduler and StatusReportScheduler.
- LLM reasoning integration established in Story 2.5 (mistral integration).
- Audit logging pattern established in Story 2.6.

### Project Structure Notes

- Keep all EOD logic within `apps/agent` - it's node-specific.
- Shared types for EOD configuration should go in `packages/shared` if needed elsewhere.
- Follow existing naming: `EODMemoryAggregator`, `EODScheduler`, `EODMemoryProcessor`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 3.2: EOD Memory Aggregator`]
- [Source: `_bmad-output/implementation-artifacts/2-10-layered-memory-manager-md-system.md`]
- [Source: `apps/agent/src/services/BriefingScheduler.ts`]
- [Source: `apps/agent/src/services/StatusReportScheduler.ts`]
- [Source: `apps/agent/src/processors/MorningBriefProcessor.ts`]
- [Source: `_bmad-output/planning-artifacts/prd.md#FR1-FR5: Adaptive Protocol & Memory Management`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Implementation Plan

- Build an org-scoped memory aggregation service with atomic filesystem writes.
- Add a scheduler mirroring existing minute-check patterns with UTC trigger + idempotency.
- Introduce an `eod.memory.rotate` processor that uses existing LLM provider + audit logging.
- Register domain action in processor registry and graph routing; start scheduler at controller boot.
- Add unit/integration tests, then run lint + full test suite + build.

### Completion Notes List

- Ran GitNexus impact analysis before editing existing symbols:
  - `ProcessorRegistry` upstream risk: LOW, impacted direct callers: 0.
  - `shutdown` in `apps/agent/src/index.ts` upstream risk: LOW, direct impact limited to file scope.
  - `routeAfterWorkspaceContext` in `apps/agent/src/controller/graph.ts` upstream risk: LOW, impacted direct callers: 0.
- Implemented user-scoped EOD memory rotation within each organization in `apps/agent/src/services/EODMemoryAggregator.ts`, aligned with Story 2.10 memory storage semantics.
- Implemented EOD scheduler with configurable UTC trigger, per-org override support via `EOD_TRIGGER_TIME_BY_ORG_JSON`, and queued `eod.memory.rotate` task creation in `apps/agent/src/services/EODScheduler.ts`.
- Implemented `EODMemoryProcessor` extending `BaseProcessor`, integrated LLM summarization through existing provider factory, rotated every profile-scoped memory set for scheduled org runs, and flushed audit entries to `agent_activity_log`.
- Registered `eod.memory.rotate` in `ProcessorRegistry`, added graph routing/node support for multi-segment domain actions, and started/stopped `eodScheduler` from the agent entrypoint.
- Added/updated configuration and documentation for `EOD_TRIGGER_TIME_UTC` and `EOD_TRIGGER_TIME_BY_ORG_JSON` in config schema, `.env.example`, and README.
- Review remediation: hardened EOD idempotency via `task-state.json`, skipped empty short-term memories to avoid weekly log noise, and updated processor coverage to exercise the real summarization path plus fake-timer scheduler polling.
- Review remediation: GitNexus `detect_changes(scope:"all")` still reports CRITICAL workspace risk because of unrelated dirty files, but the story-scoped changes remain limited to the expected EOD/config/test artifacts.
- Validation executed:
  - `pnpm test` (46 passed / 209 passed)
  - `pnpm exec eslint .`
  - `pnpm build`

### File List

- `_bmad-output/implementation-artifacts/2-11-eod-memory-aggregator-rotation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/agent/.env.example`
- `apps/agent/README.md`
- `apps/agent/src/config/index.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/processors/EODMemoryProcessor.spec.ts`
- `apps/agent/src/processors/EODMemoryProcessor.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/services/EODMemoryAggregator.spec.ts`
- `apps/agent/src/services/EODMemoryAggregator.ts`
- `apps/agent/src/services/EODScheduler.spec.ts`
- `apps/agent/src/services/EODScheduler.ts`
- `apps/agent/src/services/MemoryService.spec.ts`
- `apps/agent/src/services/MemoryService.ts`

## Change Log

- 2026-03-19: Implemented EOD memory aggregation, scheduler automation, processor integration, tests, and configuration/docs updates.
