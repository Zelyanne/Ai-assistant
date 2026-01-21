# Story 2.7: Protocol Execution Engine

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want to implement a Protocol Execution Engine,
so that the AI Agent can autonomously execute tasks and nudges according to the user's natural language leadership philosophy (FR1, FR2).

## Acceptance Criteria

1. [x] **Protocol Service Implementation:** Create a `ProtocolService.ts` that handles fetching the `.md` protocol from the `user_protocols` table and performs an initial LLM-based extraction of "Actionable Rules" for the current task.
2. [x] **State Enrichment:** Update `AgentState` in `apps/agent/src/controller/graph.ts` to include an `active_protocol_rules` field.
3. [x] **Protocol Loading Node:** Add a `loadProtocol` node to the LangGraph that executes after `initializeTask` and before `checkPerimeter`.
4. [x] **Contextual Reasoning:** Update the `reasoningNode` (in `apps/agent/src/controller/nodes/reasoning.ts`) to incorporate `active_protocol_rules` into its system prompt, ensuring the LLM follows the user's specific nudging philosophy.
5. [x] **Dynamic Agency Tiers:** The `loadProtocol` node should be able to override the `topic`'s agency tier if the protocol contains specific instructions for the current context.
6. [x] **Blocker & Pause Logic:** Implement a check in the protocol engine that can set the task status to `paused` if the recipient has reported a blocker (FR5).
7. [x] **Traceability:** Every protocol-driven decision must be logged in the `agent_activity_log` with a citation in the format `[Source: protocol.md#Section-Name]`.

## Tasks / Subtasks

- [x] **Protocol Service & DB Integration** (AC: 1)
  - [x] Implement `ProtocolService.fetchProtocol(orgId)` in `apps/agent/src/services/`.
  - [x] Implement `ProtocolService.extractRules(protocolMd, task)` using LLM factory.
- [x] **LangGraph State & Routing** (AC: 2, 3)
  - [x] Update `AgentStateAnnotation` in `graph.ts` to include `active_protocol_rules`.
  - [x] Add `loadProtocol` node to the graph and update conditional edges.
- [x] **Reasoning Engine Update** (AC: 4)
  - [x] Modify `reasoning.ts` to use `state.active_protocol_rules` in the LLM prompt.
- [x] **Blocker & Escalation Logic** (AC: 5, 6)
  - [x] Add logic to `loadProtocol` to detect blockers in previous interactions (via payload context) and pause tasks if needed.
- [x] **Audit & Traceability** (AC: 7)
  - [x] Ensure `AuditLogger` is used within the protocol node to log citations.
- [x] **Testing**
  - [x] Create `ProtocolService.spec.ts`.
  - [x] Update `graph.spec.ts` to verify protocol rules are passed to nodes.

## Dev Notes

- **Primary Source:** `_bmad-output/planning-artifacts/prd.md#Adaptive-Protocol-Management`
- **Architecture Reference:** `_bmad-output/planning-artifacts/architecture.md#Data-Architecture` (user_protocols table).
- **Previous Work:** Use the `AuditLogger` from Story 2.6 to log the "Reasoning Trace".
- **Naming:** Follow `domain.action` for task types. The protocol engine should be triggered for all `agent.*` and `system.*` tasks.
- **Pattern:** Use the "Database-as-Queue" pattern. The engine reads from `user_protocols` and writes results to `tasks`.

### Project Structure Notes

- New Processor: `apps/agent/src/processors/ProtocolProcessor.ts` (Note: Functionality merged into `loadProtocol` node for better graph integration)
- Registry Update: `apps/agent/src/processors/ProcessorRegistry.ts` (Note: Protocol handling is now a core graph node)
- Node Addition: `apps/agent/src/controller/nodes/protocol.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Patterns]

## Dev Agent Record

### Agent Model Used

Amelia (Dev Agent)

### Implementation Plan
- Step 1: Create `ProtocolService.ts` and `ProtocolService.spec.ts`.
- Step 2: Implement protocol fetching from Supabase.
- Step 3: Implement LLM extraction logic for rules.
- Step 4: Update LangGraph state and add `loadProtocol` node.
- Step 5: Integrate with `reasoningNode`.
- Step 6: Implement blocker detection and audit logging.

### Debug Log References

### Completion Notes List
- Implemented `ProtocolService` to fetch `.md` protocols from Supabase and extract task-specific rules using LLM.
- Added `loadProtocol` node to the LangGraph as a mandatory step after initialization.
- Integrated `active_protocol_rules` into the reasoning prompt to guide LLM behavior.
- Added blocker detection logic that pauses (errors) the task if recipient blockers are found in context.
- Implemented dynamic agency tier overrides based on protocol content.
- Ensured full traceability with audit logging and protocol citations.
- All tests passed.

### File List
- `apps/agent/src/services/ProtocolService.ts`
- `apps/agent/src/services/ProtocolService.spec.ts`
- `apps/agent/src/controller/nodes/protocol.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/nodes/reasoning.ts`
- `apps/agent/src/controller/graph.spec.ts`
