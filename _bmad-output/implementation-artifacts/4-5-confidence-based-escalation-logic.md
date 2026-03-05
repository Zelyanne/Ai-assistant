# Story 4.5: Confidence-Based Escalation Logic

Status: done

Story ID: 4.5
Story Key: 4-5-confidence-based-escalation-logic

Dependencies:
- Builds on Story 2.8 (`reasoningNode` confidence + `escalateNode`) and Story 4.2/4.3 (`thread.action` escalation + approval flow).
- Must preserve Story 4.4 safety behavior (`paused` when Emergency Brake is engaged).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want the AI to escalate to a human when confidence is too low or ambiguity is detected,
so that we prevent hallucinated or incorrect proxy actions while preserving fast autonomous flow for clear, high-confidence work (FR10).

## Acceptance Criteria

1. **Unified confidence gate across agent execution paths:**
   **Given** a task that can trigger autonomous action (`thread.action`, `email.send`, `calendar.create`, `system.analyze` where applicable)
   **When** confidence is below threshold OR ambiguity is detected
   **Then** the task MUST end in `tasks.status = 'escalation'`
   **And** no side-effecting MCP/tool action is executed for that decision path.

2. **Escalation payload includes explicit confidence context for human review:**
   **Given** a confidence/ambiguity-triggered escalation
   **When** task result is persisted
   **Then** `tasks.result` includes:
   - `escalation: true`
   - `reason` (human-readable)
   - `prompt` (next action for user)
   - `confidence_score` (0..1 when available)
   - `confidence_threshold` (effective threshold used)
   - `escalation_trigger` (`low_confidence`, `ambiguity_detected`, `restricted_topic`, or `approval_guardrail`).

3. **Threshold source-of-truth is deterministic and documented in code:**
   **Given** confidence is evaluated
   **When** the graph computes escalation eligibility
   **Then** threshold resolution is deterministic (env `CONFIDENCE_THRESHOLD` baseline)
   **And** the resolved threshold is captured in traces/results
   **And** behavior remains backward-compatible for existing stories.

4. **Dashboard escalation UX surfaces confidence context without exposing PII:**
   **Given** an escalated item appears in Dashboard/Peek
   **When** escalation metadata is present
   **Then** UI shows confidence score, threshold, and trigger reason in concise form
   **And** text remains redacted/safe for logs and UI summaries.

5. **Reasoning trace and audit log coverage is complete:**
   **Given** confidence or ambiguity causes escalation
   **When** `agent_activity_log` is flushed
   **Then** trace includes decision step, confidence value, ambiguity flag, and escalation rationale
   **And** trace preserves existing append-only audit behavior.

6. **Regression contracts remain intact:**
   - `tasks.status='escalation'` continues to drive OutcomeCard and Dashboard counters.
   - Emergency Brake `paused` behavior still takes precedence over confidence flow.
   - Controlled/Restricted perimeter rules continue to escalate regardless of confidence.

## Tasks / Subtasks

- [x] **Agent: centralize confidence escalation contract** (AC: 1, 2, 3, 5, 6)
  - [x] Add helper/util path in `apps/agent/src/controller/graph.ts` to build a consistent escalation payload shape.
  - [x] Ensure `thread.action` low-confidence/ambiguity branches include `confidence_score`, `confidence_threshold`, and `escalation_trigger`.
  - [x] Ensure `routeAfterReasoning` + `escalateNode` preserve/propagate confidence metadata to final `tasks.result`.

- [x] **Agent: preserve safety ordering** (AC: 1, 6)
  - [x] Confirm no MCP/tool call occurs after confidence gate fails.
  - [x] Confirm `emergency_brake` branch still finalizes as `paused` before confidence routing.

- [x] **Web: expose confidence context in escalation UI** (AC: 4, 6)
  - [x] Update `apps/web/src/views/Dashboard.vue` peek panel to render escalation confidence metadata when present.
  - [x] Add compact display treatment in `apps/web/src/components/activity/OutcomeCard.vue` for escalation confidence hints (no noisy verbosity).
  - [x] Keep current `Approve & Send` owner-only behavior intact for Controlled draft flows.

- [x] **Shared typing and contracts** (AC: 2, 4, 5)
  - [x] Add/extend typed interfaces in `packages/shared/src/schemas.ts` for escalation result metadata (non-breaking additions).
  - [x] Ensure agent and web use the same shape to avoid drift.

- [x] **Tests: confidence escalation regression suite** (AC: 1-6)
  - [x] Agent tests in `apps/agent/src/controller/graph.spec.ts` for threshold boundary, ambiguity path, and payload fields.
  - [x] Agent tests to assert no side-effect tool call on escalated confidence path.
  - [x] Web tests in `apps/web/src/views/Dashboard.spec.ts` and/or `apps/web/src/components/activity/OutcomeCard.spec.ts` for confidence metadata rendering.

## Dev Notes

### Developer Context Section

- Story 2.8 implemented baseline confidence/ambiguity detection, but Story 4.5 must harden and standardize confidence escalation outputs for proxy UX and traceability.
- Story 4.2/4.3 introduced `thread.action` + approval flows; this story must improve escalation fidelity without changing perimeter/approval invariants.
- Do not re-implement perimeter logic: reuse existing `checkPerimeter`, `routeAfterReasoning`, and `escalateNode` control points.

### Technical Requirements

- Confidence gate rules:
  - escalate when `confidence < CONFIDENCE_THRESHOLD`
  - escalate when `ambiguity_detected === true`
  - escalate on restricted/perimeter guardrails independent of confidence.
- Escalation payload must be machine-readable and UI-ready in one write (avoid post-processing coupling).
- Keep escalation summaries concise and deterministic to reduce LLM ambiguity in downstream handling.

### Architecture Compliance

- Follow Database-as-Queue pattern (`tasks` row state machine owned by Agent graph).
- Keep `agent_activity_log` append-only; never mutate historical entries.
- Preserve existing finalization flow (`finalizeTask`) and status semantics.
- Maintain PII redaction discipline in logs/traces (`PerimeterGuard`) while allowing required execution payload fields where appropriate.

### Library / Framework Requirements

- Use existing stack and patterns already present in repo:
  - LangGraph `StateGraph` conditional edges for escalation routing.
  - Supabase JS update/insert flow for task state transitions.
  - PrimeVue components for escalation display in Dashboard/Outcome cards.
- Do **not** add a framework upgrade in this story; isolate version upgrades into dedicated maintenance stories.

### File Structure Requirements

- Agent graph and escalation logic:
  - `apps/agent/src/controller/graph.ts`
  - `apps/agent/src/controller/nodes/escalate.ts`
  - `apps/agent/src/controller/nodes/reasoning.ts` (only if needed for metadata propagation)
- Shared contracts:
  - `packages/shared/src/schemas.ts`
- Web escalation presentation:
  - `apps/web/src/views/Dashboard.vue`
  - `apps/web/src/components/activity/OutcomeCard.vue`

### Testing Requirements

- Agent (Vitest):
  - Threshold boundary tests (`0.79`, `0.80`, `0.81` equivalent against configured threshold).
  - Ambiguity-only escalation test (`confidence >= threshold` but ambiguity true).
  - Verify escalation payload contains trigger, score, threshold.
  - Verify no MCP execution when escalation path is selected.
- Web (Vitest + Vue Test Utils):
  - Escalation confidence metadata renders when present.
  - UI gracefully hides confidence section when metadata missing.
  - Existing approval flow and owner gating still pass.

### Previous Story Intelligence

- From Story 4.4:
  - Safety-first branching is already in place; preserve `paused` precedence for Emergency Brake.
  - Dashboard already communicates risk state; confidence details should augment, not replace, current escalation cues.
- From Story 4.3:
  - Escalation payloads are already used as UI contracts (`reason`, `prompt`, `draft`, `citations`); add confidence metadata as additive fields only.
- From Story 4.2 and 2.8:
  - Confidence and ambiguity exist today; key gap is consistency and observability across all escalation points.

### Git Intelligence Summary

- Recent implementation patterns show heavy reuse of:
  - `apps/agent/src/controller/graph.ts` as the orchestration center.
  - Dashboard escalation UI contracts in `apps/web/src/views/Dashboard.vue`.
  - Contract-first updates with matching test changes in `graph.spec.ts` and Dashboard specs.
- Commit history indicates high regression risk in graph routing and status finalization; prioritize preserving existing status transitions.

### Latest Technical Information

- npm registry snapshot (2026-02-21):
  - `@supabase/supabase-js` latest: `2.97.0` (project uses `^2.43.0`).
  - `@langchain/langgraph` latest: `1.1.5` (project uses `^0.2.0`).
  - `primevue` latest: `4.5.4` (project uses `^4.0.0`).
- Context7 guidance confirms:
  - Supabase Realtime channel lifecycle cleanup (`removeChannel`/`removeAllChannels`) should be explicit.
  - LangGraph conditional edge routing should keep deterministic terminal paths.
  - PrimeVue ConfirmDialog/Toast composition patterns should remain centralized and accessible.
- For this story, keep existing dependency lines stable; capture upgrade opportunities as separate technical debt work.

### Project Context Reference

- Enforce project rules from `_bmad-output/project-context.md`:
  - No `any` where avoidable; keep explicit types.
  - Maintain `domain.action` and task status flow contracts.
  - Keep RLS-respecting Supabase usage and no client-side bypass behavior.
  - Preserve test coverage for changed logic paths.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.5-Confidence-Based-Escalation-Logic]
- [Source: _bmad-output/planning-artifacts/prd.md#2-Autonomous-Proxy-Agency]
- [Source: _bmad-output/planning-artifacts/architecture.md#Process-Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-&-Communication-Patterns]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: _bmad-output/implementation-artifacts/2-8-confidence-evaluation-escalation-logic.md]
- [Source: _bmad-output/implementation-artifacts/4-2-autonomous-proxy-execution.md]
- [Source: _bmad-output/implementation-artifacts/4-3-controlled-topic-drafting-approval-flow.md]
- [Source: _bmad-output/implementation-artifacts/4-4-real-time-emergency-brake-global-toggle.md]
- [Source: apps/agent/src/controller/graph.ts]
- [Source: apps/agent/src/controller/nodes/escalate.ts]
- [Source: apps/web/src/views/Dashboard.vue]
- [Source: apps/web/src/components/activity/OutcomeCard.vue]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Debug Log References

- Context7: `/supabase/supabase-js` Realtime channel cleanup and subscription patterns.
- Context7: `/langchain-ai/langgraphjs` conditional routing and termination patterns.
- Context7: `/primefaces/primevue` ConfirmDialog/Toast and form UX patterns.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story scoped to avoid reinventing existing confidence logic while closing escalation observability gaps.
- Safety and perimeter precedence preserved as non-negotiable constraints.
- Implemented shared confidence escalation helper and reused it across `graph.ts` and `escalate.ts` for deterministic thresholds + payload shape.
- Extended agent regression tests to assert escalation payload fields (score/threshold/trigger) and verify no MCP execution on confidence/ambiguity escalation.
- Stabilized Dashboard peek confidence-context test by stubbing PrimeVue `Drawer`.
- Hardened `reasoningNode` tool-injection path to prevent side-effecting tools (read-only allowlist) and to emit confidence/ambiguity + threshold metadata into trace.
- Made confidence gating conservative when confidence metadata is missing (escalate instead of defaulting to 1.0).
- Aligned `thread.action` decision schema to `packages/shared/src/schemas.ts` to avoid contract drift.
- Redacted PII from reasoning trace summaries (`input_summary`/`output_summary`) while preserving execution payload behavior.
- Added a payload-driven confidence gate for processor nodes to ensure tasks can short-circuit to `escalation` without executing tools.
- Web: `paused` task status now renders cleanly in Dashboard/OutcomeCard typing.
- Web tests: silenced `v-tooltip` directive warnings by stubbing the directive in OutcomeCard tests.
- Tests run (re-run): `pnpm --filter @ai-assistant/shared build`, `pnpm --filter @ai-assistant/agent test`, `pnpm --filter @ai-assistant/web test`.
- Note: Repo contained unrelated uncommitted changes during review; fixes were confined to story-relevant files.

### Change Log

- 2026-03-03: Centralized escalation payload contract + expanded regression tests; UI test stabilized for Drawer.
- 2026-03-05: Enforced read-only tool usage in reasoning; conservative confidence gating; shared schema alignment; PII-safe trace summaries; added processor payload confidence gate; UI support for paused + test directive stubs.

### File List

- _bmad-output/implementation-artifacts/4-5-confidence-based-escalation-logic.md
- apps/agent/src/controller/escalation.ts
- apps/agent/src/controller/escalation.spec.ts
- apps/agent/src/controller/graph.ts
- apps/agent/src/controller/graph.spec.ts
- apps/agent/src/controller/nodes/escalate.ts
- apps/agent/src/controller/nodes/reasoning.ts
- apps/agent/src/controller/nodes/reasoning.spec.ts
- packages/shared/src/schemas.ts
- packages/shared/src/database.types.ts
- apps/web/src/views/Dashboard.vue
- apps/web/src/views/Dashboard.spec.ts
- apps/web/src/components/activity/OutcomeCard.vue
- apps/web/src/components/activity/OutcomeCard.spec.ts
- apps/web/src/components/activity/OutcomeCard.spec.js
