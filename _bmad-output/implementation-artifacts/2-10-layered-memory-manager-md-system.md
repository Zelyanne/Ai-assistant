# Story 2.10: layered-memory-manager-md-system

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Developer,
I want to implement the logic for loading, updating, and rotating the `.md` memory files,
so that the agent has persistent, layered context for all interactions (Persona, Short-Term, Weekly, Long-Term).

## Acceptance Criteria

1. [x] Implement a `MemoryService` in `apps/agent/src/services/MemoryService.ts` that handles file-based storage for memory artifacts.
2. [x] Support four memory layers:
   - **Persona (`persona.md`):** Permanent identity and role definition.
   - **Short-Term Memory (`short-term.md`):** Daily task history, resets EOD.
   - **Weekly Memory (`weekly-memory.md`):** EOD summaries, resets EOM.
   - **Long-Term Memory (`long-term.md`):** Monthly distilled insights.
3. [x] Implement `task-state.json` management to track real-time steps and status for the current active task.
4. [x] Ensure strict data isolation by `organization_id` and `user_id` (e.g., storage path: `apps/agent/data/memory/{{org_id}}/{{user_id}}/`) and persist the resulting memory file map in Supabase.
5. [x] Integrate memory loading into the agent execution graph (`apps/agent/src/controller/graph.ts`):
   - Load `persona.md` and `weekly-memory.md` at start.
   - Load `short-term.md` after task initiation.
6. [x] Provide atomic write operations to prevent file corruption during concurrent task updates.
7. [x] Ensure the service is compatible with the "Database-as-Queue" pattern, persisting state changes as tasks progress.

## Tasks / Subtasks

- [x] Define memory directory structure and base `MemoryService` (AC: 1, 4)
  - [x] Create `apps/agent/data/memory` directory.
  - [x] Implement path resolution and directory creation logic per organization/user.
- [x] Implement `MemoryService` core operations (AC: 1, 2, 6)
  - [x] Implement `readMemory(orgId, userId, type)` and `writeMemory(orgId, userId, type, content)`.
  - [x] Add support for `.md` and `.json` file types.
  - [x] Implement basic file locking or atomic write pattern.
- [x] Implement `task-state.json` real-time updates (AC: 3, 7)
  - [x] Add `updateTaskState(orgId, userId, taskId, state)` to `MemoryService`.
  - [x] Integrate state updates into the graph execution nodes.
- [x] Integrate memory into LangGraph orchestration (AC: 5)
  - [x] Create `apps/agent/src/controller/nodes/memory.ts`.
  - [x] Add `loadMemoryNode` to `StateGraph` in `apps/agent/src/controller/graph.ts`.
  - [x] Update `AgentState` in `graph.ts` to include memory context strings.
- [x] Implement initialization logic for new organizations/users (AC: 2)
  - [x] Provide default `persona.md` template if one does not exist.
- [x] Add comprehensive tests (AC: 1-7)
  - [x] Unit tests for `MemoryService` file operations.
  - [x] Integration tests for memory loading within the agent graph.
  - [x] Test for multi-tenant isolation.

## Dev Notes

### Story Context and Scope

- This story implements FR1-FR5 from the PRD: Adaptive Protocol & Memory Management.
- Scope is focused on the *management* and *storage* of memory artifacts. The *rotation* logic (EOD processing) is outlined here but full automation is covered in Story 2.11.
- Memory files should be optimized for LLM context window injection (clean Markdown).

### Epic Context

- Epic 2: Agent Controller Foundation & Task Orchestration.
- This memory layer is the "Brain" foundation that allows the agent to maintain context across disparate tasks and messaging sessions.

### Relevant Existing Implementation (Do Not Reinvent)

- **AuditLogger:** (`apps/agent/src/services/AuditLogger.ts`) uses a similar step-based tracking. Memory updates should complement or integrate with audit traces.
- **ProtocolService:** (`apps/agent/src/services/ProtocolService.ts`) handles `.md` protocols from Supabase. `MemoryService` should be distinct as it handles file-system artifacts on the node.
- **AgentState:** (`apps/agent/src/controller/graph.ts`) already has `workspace_context_items`. Add `memory_context` fields here.

### Technical Requirements

- Use Node.js `fs/promises` for asynchronous file I/O.
- Ensure `MemoryService` handles missing files gracefully (initializing defaults).
- Maintain existing naming conventions: `snake_case` for file names and DB fields, `camelCase` for code.
- Storage path: `apps/agent/data/memory/{organization_id}/{user_id}/{artifact_name}.md`.

### Architecture Compliance

- Architecture mandates: "Memory Storage: File-based Markdown storage on the Hetzner node."
- All memory loads must occur BEFORE the primary reasoning node in the graph.
- Follow the "Database-centric Event Loop" pattern: task results and memory summaries should eventually be mirrored/backed up to Supabase.

### Library / Framework Requirements

- Use `path` for cross-platform path resolution.
- Ensure all I/O is non-blocking.

### File Structure Requirements

- `apps/agent/src/services/MemoryService.ts`
- `apps/agent/src/controller/nodes/memory.ts`
- `apps/agent/data/memory/` (Created at runtime or in build)

### Testing Requirements

- Use Vitest.
- Mock `fs` for unit tests to avoid actual disk writes during CI.
- Verify that `task-state.json` updates correctly reflect the current graph node.

### Previous Story Intelligence (2.9)

- Multi-channel envelopes now arrive normalized. Memory loading must handle `organization_id` and `user_id` correctly from these envelopes to provide personalized context.
- Audit artifacts now include channel metadata; memory summaries should preserve this context.

### Git Intelligence Summary

- Recent work standardized `reasoning_trace` and `citations`. `MemoryService` should ensure memory files can provide `Citation` metadata back to the graph.

### Project Structure Notes

- Keep all memory storage logic within `apps/agent` as it is node-specific.
- Shared types should be updated in `packages/shared` if memory structures are used across apps.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 3`]
- [Source: `_bmad-output/planning-artifacts/prd.md#1. Adaptive Protocol & Memory Management`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture`]
- [Source: `apps/agent/src/controller/graph.ts`]

## Dev Agent Record

### Agent Model Used

antigravity-gemini-3-flash (google/antigravity-gemini-3-flash)

### Implementation Plan

- Establish a dedicated `MemoryService` root under `apps/agent/data/memory` using module-relative path resolution so runtime and test paths remain stable.
- Enforce strict `organization_id` + `user_id` scoping before any file access to prevent cross-tenant path traversal.
- Build a `memory_file_paths` JSON map keyed by memory name so the profile record can persist filesystem locations.
- Land the base directory/path API first with isolated Vitest coverage, then sync the generated path map into Supabase `profiles.memory_file_paths`.

### Completion Notes List

- Targeted story 2-10 from `sprint-status.yaml`.
- Reviewed the story dev notes, `project-context.md`, and adjacent protocol/audit implementations before starting code changes.
- Rebuilt the GitNexus index with `npx gitnexus analyze --force` after the MCP graph reported a missing LadybugDB, then used GitNexus to inspect adjacent protocol/audit patterns.
- Updated the memory model per clarification: memory artifacts are user-scoped within each organization (`apps/agent/data/memory/{organization_id}/{user_id}`), not organization-scoped only.
- Used Supabase MCP on project `eoaoiazhsmjbsjazffmx` to add `public.profiles.memory_file_paths jsonb not null default '{}'::jsonb`, then mirrored the change in the repo migration and shared database types.
- Implemented the full `MemoryService` lifecycle: atomic reads/writes for Markdown and JSON artifacts, default persona/bootstrap handling, per-user task-state updates, and Supabase profile path syncing.
- Added `loadMemoryNode` and wired memory context into `AgentState` and `reasoningNode` so layered memory is loaded before downstream reasoning/worker execution.
- Added Vitest coverage for user-scoped file operations, task-state updates, reasoning prompt injection, and graph-level memory loading.
- Cleared the pre-existing validation blockers by fixing the failing MCP alias-policy test path and unrelated lint issues in the agent workspace; `pnpm lint` and `pnpm test` now pass with 43 files / 193 tests green.
- Addressed code-review findings by splitting startup memory bootstrap from short-term memory loading, then loading `short-term.md` after task initiation while keeping persona/weekly context available first.
- Hardened `task-state.json` persistence with per-artifact lock files, profile existence validation for `memory_file_paths`, and graph-wide node transition tracking.
- Added review remediation coverage for tenant isolation, concurrent task-state updates, startup-vs-short-term load order, and intermediate graph node tracking.
- Review note: unrelated pre-existing dirty files remain elsewhere in the repository worktree; the File List below stays scoped to Story 2.10-owned files and its review remediations.

### Change Log

- Marked Story 2.10 as actively in progress with the first implementation task completed after validation passed.
- Remediated code-review findings covering memory load order, task-state progression, atomic task-state updates, Supabase profile sync validation, and story transparency.

### File List

- `_bmad-output/implementation-artifacts/2-10-layered-memory-manager-md-system.md`
- `apps/agent/data/memory/.gitkeep`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/nodes/memory.ts`
- `apps/agent/src/controller/nodes/reasoning.spec.ts`
- `apps/agent/src/controller/nodes/reasoning.ts`
- `apps/agent/src/services/MemoryService.spec.ts`
- `apps/agent/src/services/MemoryService.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/database.types.ts`
- `supabase/migrations/20260319110000_add_profile_memory_file_paths.sql`
