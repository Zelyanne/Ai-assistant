# Story 2.8: confidence-evaluation-escalation-logic

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want to implement confidence evaluation and escalation logic in the Agent Controller,
so that the AI can safely escalate to a human when it is uncertain, preventing incorrect autonomous actions (FR10).

## Acceptance Criteria

1. [ ] **Confidence Score Implementation:** Update the `reasoningNode` to return a `confidence_score` (0.0 to 1.0) along with its reasoning.
2. [ ] **Ambiguity Detection:** The reasoning engine must identify ambiguous requests or missing information that requires human clarification.
3. [ ] **Escalation Threshold:** Implement a configurable `CONFIDENCE_THRESHOLD` (default 0.8) in the Agent Controller.
4. [ ] **Escalation Node:** Add an `escalateNode` to the LangGraph that is triggered when confidence is below the threshold or ambiguity is detected.
5. [ ] **Status Update:** The `escalateNode` must update the task status in Supabase to `error` (which the UI renders as Escalation) and set the result to include a prompt for the "human touch."
6. [ ] **Reasoning Trace:** Log the low-confidence score and the reason for escalation in the `agent_activity_log`.
7. [ ] **Agency Tier Integration:** Ensure that "Restricted" topics (from Story 4.1 context) always trigger escalation regardless of confidence score.

## Tasks / Subtasks

- [x] **Confidence Scoring in Reasoning Node** (AC: 1, 2)
  - [x] Update `reasoning.ts` prompt to require a `confidence` field in the JSON response.
  - [x] Add `ambiguity_detected` boolean to the reasoning output.
- [x] **Escalation Node Implementation** (AC: 4, 5)
  - [x] Create `apps/agent/src/controller/nodes/escalate.ts`.
  - [x] Implement logic to update Supabase task status to `error` with an `escalation` flag in result.
- [x] **Graph Routing Logic** (AC: 3, 4, 7)
  - [x] Update `graph.ts` to route to `escalateNode` if confidence < threshold or `topic_tier === 'Restricted'`.
- [x] **Audit & Traceability** (AC: 6)
  - [x] Update `AuditLogger` calls to include confidence metrics in the `agent_activity_log`.
- [x] **Testing**
  - [x] Create unit tests for confidence threshold logic in `apps/agent/src/controller/nodes/reasoning.spec.ts`.
  - [x] Verify escalation routing in `apps/agent/src/controller/graph.spec.ts`.

## Dev Notes

- **Primary Source:** `_bmad-output/planning-artifacts/prd.md#Autonomous-Proxy-Agency` (FR10)
- **Architecture Reference:** `_bmad-output/planning-artifacts/architecture.md#Process-Patterns` (Error Handling & Escalation).
- **Escalation Pattern:** In the "Database-as-Queue" pattern, an `error` status with a specific payload (e.g., `result.escalation = true`) is used to signal the UI to show an Escalation Card.
- **Source Tree:**
  - `apps/agent/src/controller/nodes/reasoning.ts`
  - `apps/agent/src/controller/nodes/escalate.ts` (New)
  - `apps/agent/src/controller/graph.ts`

### Project Structure Notes

- Follow `domain.action` for task types.
- Ensure types are shared via `packages/shared/src/schemas.ts`.
- The `escalateNode` should be a terminal node in the LangGraph for the current task.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns]
- [Source: _bmad-output/implementation-artifacts/2-7-protocol-execution-engine.md]

## Dev Agent Record

### Agent Model Used

Antigravity (Developer Agent)

### Debug Log References

- [Reasoning Node Update]: Updated `reasoning.ts` to support structured confidence scores and ambiguity detection.
- [Escalation Node]: Created `escalate.ts` to handle terminal escalation state.
- [Graph Routing]: Implemented conditional routing based on confidence threshold (0.8) and topic tiering.
- [Finalization Logic]: Fixed `finalizeTask` to preserve escalation results and prevent status overwrite.

### Completion Notes List

- Implemented confidence scoring and ambiguity detection in reasoning node.
- Created escalation node for safe human-in-the-loop transitions.
- Integrated topic-tier based escalation (Restricted topics always escalate).
- Verified implementation with comprehensive unit and integration tests.

### File List

- `packages/shared/src/schemas.ts`
- `apps/agent/src/controller/nodes/reasoning.ts`
- `apps/agent/src/controller/nodes/reasoning.spec.ts`
- `apps/agent/src/controller/nodes/escalate.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`

