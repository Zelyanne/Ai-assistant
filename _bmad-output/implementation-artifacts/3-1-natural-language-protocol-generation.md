# Story 3.1: Natural Language Protocol Generation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want to describe my leadership style in natural language,
so that the AI can generate a personalized `.md` protocol that governs its behavior.

## Acceptance Criteria

1. **Brain Setup Interface:** A dedicated UI section (e.g., within `/settings` or a new `/brain-setup`) where the user can input their "nudging philosophy" in natural language.
2. **Protocol Generation Task:** When the user submits their description, a task of type `protocol.generate` is queued in the `tasks` table.
3. **Agent Processing:** The Agent Controller processes the `protocol.generate` task, using an LLM to convert the natural language input into a structured Markdown protocol.
4. **Structured Format:** The generated protocol must follow a consistent structure (e.g., Objectives, Nudging Rules, Agency Tier Overrides, Escalation Logic).
5. **Review & Approval Flow:** The generated Markdown is presented to the user in the UI for review.
6. **Persistence:** Upon user approval, the protocol is saved to the `user_protocols` table in Supabase.
7. **Traceability:** The generation process is logged in `agent_activity_log` with a full reasoning trace.

## Tasks / Subtasks

- [x] **Shared Schema & Task Definition** (AC: 2)
  - [x] Add `protocol.generate` to the authorized domain actions if not already present.
  - [x] Define Zod schema for the `protocol.generate` payload (e.g., `{ philosophy: string }`).
- [x] **Frontend: Brain Setup UI** (AC: 1, 5)
  - [x] Create `BrainSetup.vue` component.
  - [x] Implement a text area for natural language input.
  - [x] Implement task submission and loading state (monitoring the `tasks` table via `useAgent`).
  - [x] Implement a Markdown preview for the generated protocol.
  - [x] Implement "Approve" and "Regenerate" actions.
- [x] **Agent: Protocol Generation Processor** (AC: 3, 4, 7)
  - [x] Create `ProtocolGenerateProcessor.ts` in `apps/agent/src/processors/`.
  - [x] Implement LLM prompt logic to transform philosophy into structured Markdown.
  - [x] Register the processor in `ProcessorRegistry.ts`.
  - [x] Ensure the processor logs its reasoning and citations to `agent_activity_log`.
- [x] **Supabase Integration** (AC: 6)
  - [x] Create a service method or use existing `ProtocolService` to save the approved protocol to `user_protocols`.

## Dev Notes

- **Protocol Template:** Use a system prompt that enforces a clean, headers-based Markdown structure for the protocol.
- **Agency Tiers:** Ensure the generation logic understands the "Public/Controlled/Restricted" tier concepts defined in the PRD/Architecture.
- **Existing Service:** Leverage `apps/agent/src/services/ProtocolService.ts` but expand it to handle generation, not just extraction.
- **UI Styling:** Use PrimeVue `Textarea`, `Button`, and `Card` components, following the "Executive Calm" palette.

### Project Structure Notes

- `apps/web/src/views/Settings.vue` (or a sub-route/component for Brain Setup).
- `apps/agent/src/processors/ProtocolGenerateProcessor.ts`.
- `packages/shared/src/schemas.ts` for task payload validation.

### References

- [Source: _bmad-output/planning-artifacts/prd.md#1.-Adaptive-Protocol-Management]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-Priority-Analysis]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1]
- [Source: apps/agent/src/services/ProtocolService.ts]

## Dev Agent Record

### Agent Model Used

Antigravity (SM Persona)

### Completion Notes List

- Implemented `protocol.generate` task type in shared schemas.
- Added structured JSON metadata generation to the protocol generation process to capture behavior parameters (frequency, tone, etc.).
- Created `ProtocolGenerateProcessor` to handle conversion of natural language philosophy to structured Markdown and JSON using LLM.
- Expanded `ProtocolService` with `generateProtocol` and `saveProtocol` methods, supporting JSON metadata.
- Updated Agent Controller graph and processor registry to support the new domain action.
- Implemented `BrainSetup.vue` in the web app, allowing users to input philosophy, preview generated protocols, see extracted behavior parameters, and save them.
- Created `useAgent` composable to facilitate real-time task monitoring on the frontend.
- Applied Supabase migration to add `metadata` column to `user_protocols` table for project `eoaoiazhsmjbsjazffmx`.
- Verified that reasoning traces and citations are correctly logged to `agent_activity_log`.
- Added unit tests for `ProtocolGenerateProcessor` and `ProtocolService`.
- Fixed missing files in File List.

### File List

- `packages/shared/src/schemas.ts`
- `apps/agent/src/services/ProtocolService.ts`
- `apps/agent/src/services/ProtocolService.spec.ts`
- `apps/agent/src/processors/ProtocolGenerateProcessor.ts`
- `apps/agent/src/processors/ProtocolGenerateProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/web/src/composables/useAgent.ts`
- `apps/web/src/views/BrainSetup.vue`
- `apps/web/src/router/index.ts`
- `apps/web/src/components/layout/AppSidebar.vue`
- `supabase/migrations/20260120000000_add_metadata_to_user_protocols.sql`
