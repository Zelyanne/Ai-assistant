# Story 6.5: Protocol Optimization "Diff" Summaries

Status: ready-for-dev

Story ID: 6.5
Story Key: 6-5-protocol-optimization-diff-summaries

Dependencies:
- Story 2.7: Protocol execution engine for protocol-aware runtime behavior.
- Story 3.1: Natural language protocol generation and `user_protocols` persistence.
- Story 5.1: Adaptive relancing scheduler consuming protocol metadata.
- Story 5.3: Automatic protocol adjustment domain rules and blocker-aware cadence behavior.
- Story 6.1: Command Center task submission and approval interaction patterns.
- Story 6.4: Audit log and reasoning trace patterns for explainable suggestions.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want to see suggested improvements to my protocols with clear "Diff" summaries,
so that I can evolve my assistant's behavior based on real-world performance.

## Acceptance Criteria

1. **Optimization suggestions are generated from observed protocol behavior, not ad-hoc guesses:**
   **Given** the system detects a recurring pattern in relancing, escalation, or proxy behavior that indicates the current protocol could be improved
   **When** a protocol optimization is created
   **Then** the suggestion includes the triggering evidence and rationale
   **And** the recommendation references the currently active protocol and the specific rule or behavior being adjusted.

2. **A natural-language diff summary is produced for every suggestion:**
   **Given** an optimization suggestion exists
   **When** the user reviews it in the Hub
   **Then** the UI presents a concise human-readable diff summary describing the current behavior, the proposed change, and the expected outcome
   **And** the summary is understandable without reading raw markdown diffs or internal metadata.

3. **Proposed protocol changes require explicit approval before they affect runtime behavior:**
   **Given** a protocol optimization suggestion is shown to the user
   **When** the suggestion has not been approved
   **Then** the active `user_protocols` record used by runtime execution remains unchanged
   **And** no task execution path may load the proposed behavior as active protocol guidance.

4. **Approved suggestions are applied through the canonical protocol persistence flow:**
   **Given** a user explicitly approves a protocol optimization suggestion
   **When** the change is applied
   **Then** the persisted `user_protocols` content and machine-readable metadata are updated together
   **And** the update preserves organization isolation and existing protocol fetch semantics for downstream agent execution.

5. **Suggestion review includes rationale and traceability:**
   **Given** a protocol optimization suggestion is displayed
   **When** the user expands supporting detail
   **Then** they can see the reasoning summary, relevant evidence, and citations or source identifiers tied to the triggering behavior
   **And** the explanation follows the same trust-building transparency model used elsewhere in the product.

6. **Tests cover generation, approval gating, and apply behavior:**
   **Given** this story is implemented
   **When** automated tests run
   **Then** there are tests proving that unapproved suggestions do not alter active protocol behavior
   **And** approved suggestions persist the updated protocol correctly
   **And** the review UI renders natural-language diff summaries and approval actions.

## Tasks / Subtasks

- [ ] 1) Add a protocol optimization suggestion model and shared payload schema (AC: 1, 2, 3, 4)
  - [ ] Define shared Zod schemas in `packages/shared/src/schemas.ts` for a reviewable protocol optimization payload, including current summary, proposed summary, rationale, evidence/citations, and approval metadata.
  - [ ] Decide and implement persistence for pending suggestions so they are not confused with the active `user_protocols` row; prefer a dedicated table or explicit versioned suggestion record instead of overloading the single active protocol row.
  - [ ] Regenerate `packages/shared/src/database.types.ts` if a new schema migration changes database types.

- [ ] 2) Implement agent-side generation and apply flows using existing protocol infrastructure (AC: 1, 3, 4, 5)
  - [ ] Extend `apps/agent/src/services/ProtocolService.ts` with helpers to compare active protocol content/metadata against a proposed optimized version and generate a concise natural-language diff summary.
  - [ ] Add or register a canonical protocol optimization action in `apps/agent/src/processors/ProcessorRegistry.ts` that creates suggestions without mutating the active protocol.
  - [ ] Reuse the existing escalation/approval contract in `apps/agent/src/controller/escalation.ts` for review-required suggestions rather than inventing a parallel review status model.
  - [ ] Ensure approved apply flow updates `content_markdown` and metadata together through the canonical persistence path, preserving the current `organization_id`-scoped fetch behavior in `ProtocolService.fetchProtocol(...)`.
  - [ ] Ensure `apps/agent/src/controller/nodes/protocol.ts` and runtime reasoning paths only load the active approved protocol, never pending suggestions.

- [ ] 3) Build a protocol optimization review surface in the web app (AC: 2, 3, 5)
  - [ ] Extend `apps/web/src/views/BrainSetup.vue` or add a dedicated protocol review surface to render pending optimization suggestions near the protocol management experience.
  - [ ] Present the suggestion as a natural-language diff summary with clear sections for current behavior, proposed behavior, rationale, and expected impact.
  - [ ] Reuse PrimeVue review patterns already present in the app (`Card`, `Message`, `Panel`/accordion-style disclosure, approval buttons) to support quick executive review on desktop and mobile.
  - [ ] Add explicit `Approve` and `Dismiss`/`Keep current protocol` actions so the user makes a deliberate decision before any change is applied.

- [ ] 4) Add auditability and reasoning support for trust (AC: 1, 5)
  - [ ] Record suggestion generation and approval/application outcomes through the canonical audit logging flow so the user can inspect why the optimization was proposed.
  - [ ] Include stable citations/source identifiers from relancing updates, scheduling context, command interactions, or task history when available.
  - [ ] Keep free-form rationale and evidence strings compatible with the repo's existing reasoning trace and PII-guard expectations.

- [ ] 5) Add tests for regression-proof approval gating (AC: 6)
  - [ ] Agent tests: verify suggestion generation does not overwrite the active `user_protocols` row before approval.
  - [ ] Agent tests: verify approved application updates protocol markdown and metadata together and preserves organization scoping.
  - [ ] Web tests: verify diff summary rendering, rationale disclosure, and approve/dismiss actions.
  - [ ] Web tests: verify pending review UI remains stable when there are no suggestions and that realtime/subscription cleanup follows existing composable patterns if subscriptions are used.

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
