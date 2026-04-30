---
title: 'User Skills + Research Agent + 3-Step Checkpointing (LangGraph)'
slug: 'user-skills-research-agent-checkpointing'
created: '2026-03-30T21:11:50Z'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js (Express)', 'TypeScript (ESM)', 'LangChain (createAgent)', 'LangGraph (@langchain/langgraph ^0.2.x)', 'MistralAI (ChatMistralAI)', 'MCP SDK (@modelcontextprotocol/sdk)', '@langchain/mcp-adapters (loadMcpTools)', 'Google Workspace MCP server (workspace-mcp, streamable-http)', 'Supabase (Postgres + RLS + Realtime)', 'Vitest', 'Playwright', 'Pnpm Workspaces']
files_to_modify: ['supabase/migrations/20260330220000_create_user_skills.sql', 'packages/shared/tests/user-skills-migration.spec.ts', 'packages/shared/src/database.types.ts', 'apps/agent/src/services/UserSkillsService.ts', 'apps/agent/src/tools/userSkillsTools.ts', 'apps/agent/src/agents/SkillCreatorAgent.ts', 'apps/agent/src/processors/SkillsManageProcessor.ts', 'apps/agent/src/processors/ProcessorRegistry.ts', 'apps/agent/src/processors/AssistantCommandProcessor.ts', 'apps/agent/src/controller/graph.ts', 'apps/agent/src/controller/nodes/generalAgent.ts', 'apps/agent/src/controller/nodes/router.ts', 'apps/agent/src/controller/nodes/specialistToolBuilder.ts', 'apps/agent/src/controller/nodes/types.ts', 'apps/agent/src/controller/nodes/driveAgent.ts', 'apps/agent/src/prompts/specialistPrompts.ts', 'apps/agent/.env.example', 'apps/agent/src/services/searxngMcp.ts', 'apps/agent/src/agents/ResearchAgent.ts', 'apps/agent/src/tools/researchTools.ts', 'infra/searxng-mcp/docker-compose.yml', 'infra/searxng-mcp/README.md', 'apps/agent/src/services/ExecutionRunService.ts', 'apps/agent/src/services/MemoryService.ts', 'apps/agent/src/controller/nodes/memory.ts', 'apps/agent/src/controller/nodes/reasoning.ts', 'apps/agent/src/controller/nodes/router.spec.ts', 'apps/agent/src/services/MemoryService.spec.ts', 'apps/agent/src/controller/nodes/routerCompletedStepKey.spec.ts']
code_patterns: ['Database-as-Queue (Supabase tasks + Realtime subscriber)', 'LangGraph StateGraph + conditional edge routing (router loop)', 'Router node pattern (step.worker_type → specialist)', 'Specialist nodes use LangChain createAgent + native MCP StructuredTools', 'ExecutionRun ledger + idempotency_state + optimistic locking versioning', 'Worker tool allowlist + required OAuth scopes (WorkerToolPolicyService)', 'MCP server managed as child process (uvx workspace-mcp) + tool caching', 'Layered memory artifacts (persona/short-term/weekly/long-term/task-state) stored on disk and referenced from profiles.memory_file_paths']
test_patterns: ['Vitest unit/integration tests (*.spec.ts)', 'vi.mock for service and specialist isolation', 'Graph/router flow tests use mocked ExecutionRunService + MCP service', 'Shared migration expectation tests in packages/shared/tests', 'Playwright E2E for critical web flows (separate suite)']
---

# Tech-Spec: User Skills + Research Agent + 3-Step Checkpointing (LangGraph)

**Created:** 2026-03-30T21:11:50Z

## Overview

### Problem Statement

We need to:

- Persist user-specific “skills”/preferences (e.g., a preferred cover-letter style) so the agent can reliably reuse them later.
- Add a dedicated research capability that can be delegated to (via SearXNG MCP), returning a clean, citationed report to whatever agent requested it.
- Improve long-running execution reliability by routing back to the General Agent every 3 plan steps to validate progress and optionally re-plan, then continue silently.

### Solution

Introduce:

1. A Supabase-backed user skills store + a Skill Creator agent/tool to CRUD skills and a retrieval tool the agents can call when they judge it’s necessary.
2. A Research agent/worker that uses a SearXNG MCP server (dev discovery + prod Docker) and returns structured research briefs with sources.
3. LangGraph orchestration changes to checkpoint back to the General Agent after every 3 completed plan steps (when a plan has >3 steps), then proceed without user confirmation.

### Scope

**In Scope:**
- Confirm existing Google Drive specialist exists and works end-to-end; implement/fix only if missing/broken.
- Verify the existing memory system is working (persona/weekly/long-term injection into reasoning prompts); add/adjust tests if needed.
- Add Supabase schema (table + RLS) for user-scoped skills.
- Implement Skill Creator agent/tool: create/update/delete/list skills, plus retrieval for “skills relevant to current task”.
- Implement Research agent/worker using SearXNG MCP; provide Docker for production and detect/consume existing dev instance.
- Implement LangGraph checkpointing: every 3 plan steps route to General Agent for progress + plan adjustment, then continue silently.
- Add tests + minimal docs for the new capabilities.

**Out of Scope:**
- Full UI for managing skills (unless explicitly requested).
- Embeddings/RAG upgrades beyond simple retrieval heuristics (unless explicitly requested).
- Major dependency upgrades (e.g., migrating LangGraph runtime versions) as part of this story.

## Context for Development

### Codebase Patterns

- LangGraph StateGraph orchestrates task execution (`apps/agent/src/controller/graph.ts`) and loops the Router until the ExecutionRun completes.
- “Database-as-Queue”: `public.tasks` rows drive execution; `apps/agent` subscribes via Supabase Realtime.
- Execution planning/execution is persisted in `public.execution_runs` (plan_json + ledger_markdown + idempotency_state; optimistic locking via `version`).
- Router pattern: `apps/agent/src/controller/nodes/router.ts` reads the current pending step and dispatches to a specialist.
- Specialist agents (Gmail/Calendar/Docs/Sheets/Slides) are dedicated node functions using LangChain `createAgent` + native MCP `StructuredTool` list (no manual tool wrappers).
- **Drive specialist exists** in legacy `WorkspaceWorkerAgent.ts`, but the Router’s primary specialist registry currently does **not** include `drive` (Drive steps fall back to the legacy worker).
- Layered memory artifacts (persona/short-term/weekly/long-term/task-state) are stored on disk and synced to `profiles.memory_file_paths`.
  - **Important gap:** the memory snapshot is injected into prompts in `reasoningNode` only. The `assistant.command` path (General Agent → Router → Specialists) does not currently include memory context in prompts, so long-term preferences may not influence outputs.
- Static “project skill playbook” injection exists for Sheets/Slides via `apps/agent/src/prompts/agentSkillInjector.ts` (repo-level, not user-scoped).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/controller/graph.ts` | LangGraph StateGraph node wiring + conditional routing (where 3-step checkpoint routing will live) |
| `apps/agent/src/controller/nodes/generalAgent.ts` | Plan creation; **currently no-ops when execution_run exists** (needs checkpoint support) |
| `apps/agent/src/controller/nodes/router.ts` | Executes current step, writes completion to ExecutionRun, loops router |
| `apps/agent/src/controller/nodes/specialistToolBuilder.ts` | Specialist tool assembly (native MCP tools + time tool) |
| `apps/agent/src/prompts/specialistPrompts.ts` | Central prompts + capability awareness (update to teach specialists to use skills/research) |
| `apps/agent/src/services/ExecutionRunService.ts` | ExecutionRun mutation (completeStep/recordReplan/ledger) |
| `apps/agent/src/services/mcp.ts` | MCP client cache + workspace-mcp shared server startup (pattern to replicate for searxng MCP) |
| `apps/agent/src/workers/WorkspaceWorkerAgent.ts` | Legacy workers (includes Drive specialist); still used as Router fallback |
| `apps/agent/src/services/MemoryService.ts` | File-based memory artifacts + sync to profiles.memory_file_paths |
| `apps/agent/src/controller/nodes/reasoning.ts` | Only place memory is currently injected into prompts (gap for assistant.command path) |
| `supabase/migrations/20260114000000_core_and_domain_schema.sql` | RLS/tenant pattern for new tables |
| `supabase/migrations/20260312113000_create_execution_runs.sql` | ExecutionRun table + RLS pattern |
| `docs/ARCHITECTURE.md` | Runtime layering + queue/subscriber flow |

### Technical Decisions

- Skills will be stored in a **Supabase table** (user-scoped) with RLS, not directly in `persona.md`.
- Skills will be applied via an agent-callable **tool** (the agent decides when to fetch/apply), rather than only manual triggers.
- Research will run through a **SearXNG MCP** integration:
  - Production: repo-managed Docker deployment.
  - Development: detect and use an already-running instance if present (confirm via investigation).
- Checkpointing will **silently continue** after General Agent review (no extra user confirmation step).

Additional constraints discovered in code:
- Adding new specialist “worker_type” values is non-trivial because `generalAgentNode` hard-limits allowed worker_type values and also runs a Workspace MCP readiness check for every step.
- Memory is loaded early in the graph but **not** provided to General Agent / Specialist prompts today (only to `reasoningNode`). If we want persistent preferences to actually affect output, we must either inject memory into those prompts or provide a skills retrieval tool that specialists reliably use.

## Implementation Plan

### Tasks

- [x] Task 1: Add Supabase `user_skills` table + RLS
  - File: `supabase/migrations/20260330220000_create_user_skills.sql`
  - Action: Create `public.user_skills` with columns `{ id uuid pk, organization_id uuid fk, user_id uuid fk, name text, description text, content_markdown text, tags text[], triggers text[], is_active bool, created_at, updated_at }`.
  - Notes:
    - Add `UNIQUE (organization_id, user_id, name)` so “cover-letter-style” is stable per user.
    - Enable RLS and use existing principal isolation helper: `USING (public.has_principal_access(organization_id, user_id))`.
    - Add indexes: `(organization_id, user_id)`, plus optional `GIN(tags)` and `GIN(triggers)` for quick filtering.
    - Add `set_updated_at` trigger (pattern used elsewhere) so edits update `updated_at`.

- [x] Task 2: Add shared migration test for skills table
  - File: `packages/shared/tests/user-skills-migration.spec.ts`
  - Action: Add a Vitest test that reads the new migration file and asserts it contains:
    - `CREATE TABLE IF NOT EXISTS public.user_skills`
    - `ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY`
    - A policy name like `"user_skills_principal_access"` (or equivalent) referencing `public.has_principal_access`
    - The uniqueness constraint and key indexes

- [x] Task 3: Regenerate Supabase TypeScript DB types
  - File: `packages/shared/src/database.types.ts`
  - Action: Regenerate the Supabase types so the new `public.user_skills` table is available to server code.
  - Notes: Use the existing repo’s Supabase type-generation workflow (Supabase CLI or dashboard export). Ensure `tasks.user_id` and the new `user_skills` table types compile in `apps/agent`.

- [x] Task 4: Implement a server-side UserSkills service (CRUD + relevance)
  - File: `apps/agent/src/services/UserSkillsService.ts` (new)
  - Action: Implement:
    - `listSkills(organizationId, userId)`
    - `upsertSkill(organizationId, userId, { name, description?, content_markdown, tags?, triggers?, is_active? })`
    - `deleteSkill(organizationId, userId, nameOrId)`
    - `findRelevantSkills(organizationId, userId, { query, maxResults })` using tags/triggers + simple text matching (no embeddings in this scope)
  - Notes: This runs with service-role Supabase; enforce org/user scoping in code to avoid cross-tenant leakage.

- [x] Task 5: Add “skills retrieval” LangChain tools (per-task scoped)
  - File: `apps/agent/src/tools/userSkillsTools.ts` (new)
  - Action: Export factory functions that bind `{ organizationId, userId }`:
    - `createSearchUserSkillsTool({ organizationId, userId })` → exposes `search_user_skills({ query, max_results? })`
    - `createListUserSkillsTool({ organizationId, userId })` → exposes `list_user_skills()`
    - `createGetUserSkillTool({ organizationId, userId })` → exposes `get_user_skill({ name })` (deterministic retrieval)
  - Notes:
    - Tools must throw a clear error if `userId` is missing (skills are user-scoped).
    - Keep these tools read-only for specialist nodes; use the UserSkillsService internally.

- [x] Task 6: Implement the Skill Creator agent (LLM → structured skill record)
  - File: `apps/agent/src/agents/SkillCreatorAgent.ts` (new)
  - Action: Build a LangChain `createAgent` wrapper with a Zod response schema that turns a user preference into:
    - `name` (slug-like)
    - `description`
    - `content_markdown` (the actual reusable instruction + example)
    - `tags` / `triggers`
  - Notes: This is the “skill creator agent” — keep it deterministic (temperature 0) and safe (no external tools required).

- [x] Task 7: Add a Skills Manage processor + register it
  - Files:
    - `apps/agent/src/processors/SkillsManageProcessor.ts` (new)
    - `apps/agent/src/processors/ProcessorRegistry.ts`
  - Action:
    - Implement domain_action `skills.manage` that can `create/update/delete/list` user skills.
    - Register it in `ProcessorRegistry`.
  - Notes:
    - For create/update: call SkillCreatorAgent → upsert via UserSkillsService.
    - Optionally append a brief, stable pointer into persona memory (e.g., “Skills: cover-letter-style (see user_skills)”) to align with “permanent memory should handle preferences”.

- [x] Task 8: Wire `skills.manage` into the LangGraph controller
  - File: `apps/agent/src/controller/graph.ts`
  - Action:
    - Add a node `skills_manage` using the existing `executeProcessor` pattern.
    - Add an edge from `skills_manage` → `finalize`.
  - Notes: Keep it out of high-risk confirmation flows; it’s a preference write, not an external side effect.

- [x] Task 9: Update AssistantCommandProcessor to route skill requests
  - File: `apps/agent/src/processors/AssistantCommandProcessor.ts`
  - Action:
    - Add `skills.manage` to supported delegation actions.
    - Add intent detection (examples):
      - “save this as a skill …”, “remember that when you write cover letters …”, “skill: cover-letter-style …”
    - Delegate to `skills.manage` with payload `{ command_text, user_initiated, conversation_id?, correlation_id? }`.

- [x] Task 10: Ensure specialists can *use* skills during content generation
  - Files:
    - `apps/agent/src/controller/nodes/specialistToolBuilder.ts`
    - `apps/agent/src/prompts/specialistPrompts.ts`
  - Action:
    - Extend specialist tool sets (at minimum `docs` + `gmail`) to include `search_user_skills` / `list_user_skills`.
    - Update specialist system prompts to instruct:
      - “When writing a cover letter / resume / employment email, call `search_user_skills` first and apply the returned style instructions.”

- [x] Task 11: Make Drive a first-class specialist (remove router fallback dependency)
  - Files:
    - `apps/agent/src/controller/nodes/driveAgent.ts` (new)
    - `apps/agent/src/controller/nodes/router.ts`
    - `apps/agent/src/controller/nodes/router.spec.ts`
  - Action:
    - Implement `driveAgentNode` using `getSpecialistMcpTools(orgId, 'drive')`.
    - Register `drive` in the Router’s specialist registry.
    - Add/extend router tests to cover a `drive` step (no fallback).

- [x] Task 12: Add SearXNG MCP (prod Docker + dev configuration)
  - Files:
    - `apps/agent/.env.example`
    - `infra/searxng-mcp/docker-compose.yml` (new)
    - `infra/searxng-mcp/README.md` (new)
  - Action:
    - Add env vars (example): `SEARXNG_MCP_URL`, `SEARXNG_URL`, optional basic auth, and port settings.
    - Provide a production-ready docker-compose that runs:
      - `searxng/searxng` (search backend)
      - `ghcr.io/jae-jae/searxng-mul-mcp` (HTTP MCP wrapper exposing `/mcp` + `/health`)
  - Notes: `searxng-mul-mcp` supports HTTP transport and Docker/Compose. (Validated via upstream README.)

- [x] Task 13: Implement SearXNG MCP client service in the agent runtime
  - File: `apps/agent/src/services/searxngMcp.ts` (new)
  - Action: Implement a lightweight MCP client using `StreamableHTTPClientTransport`:
    - `getClient()` (cached)
    - `getLangChainTools()` (cached via `loadMcpTools`)
    - `executeTool(name, args)`
    - `healthCheck()` against MCP server `/health` (if available)

- [x] Task 14: Implement the Research agent/tool (delegated research reports)
  - Files:
    - `apps/agent/src/agents/ResearchAgent.ts` (new)
    - `apps/agent/src/tools/researchTools.ts` (new)
    - `apps/agent/src/controller/nodes/specialistToolBuilder.ts`
  - Action:
    - Build a Research agent that can call the SearXNG MCP `search` tool and produce a structured report: `{ summary, key_findings[], sources[] }`.
    - Expose it to other agents as a LangChain tool (e.g., `search_web_research({ query, time_range?, safesearch? })`).
    - Add the tool to `docs`/`gmail` specialists so they can pull research when needed.
  - Notes:
    - PII safety: before calling SearXNG MCP, sanitize the query and ensure we never include persona/long-term memory content in web queries.
    - Use `PerimeterGuard().redactPII()` on the final query string (or block with a safe error if it becomes empty).

- [x] Task 15: Implement “every 3 steps” checkpoint routing back to the General Agent
  - Files:
    - `apps/agent/src/controller/graph.ts`
    - `apps/agent/src/controller/nodes/generalAgent.ts`
    - `apps/agent/src/services/ExecutionRunService.ts`
  - Action:
    - Update routing so checkpointing happens only on real progress:
      - Add ephemeral state `router_completed_step_key: string | null` to AgentState.
      - Router sets it ONLY when a worker step is completed (including idempotent recovery completion); set `null` when re-planning or escalating.
      - Update `routeAfterRouter` to route to `general_agent` when:
        - `router_completed_step_key` is non-null
        - the plan has > 3 steps
        - there are still pending steps
        - done-step count (completed|skipped|failed|blocked) is a multiple of 3
    - Extend `generalAgentNode` so when an execution_run exists *and* the checkpoint condition holds, it:
      - reviews progress (completed step titles + handoffs + outputs)
      - decides whether to revise remaining steps
      - applies revisions via a new ExecutionRunService method (e.g., `reviseRemainingSteps`) and logs to the ledger
    - Ensure it continues silently (no `paused` / no user confirmation).

- [x] Task 16: Inject persona/long-term memory into assistant.command planning + specialist execution (minimal contract change)
  - Files:
    - `apps/agent/src/controller/nodes/types.ts`
    - `apps/agent/src/controller/nodes/router.ts`
    - `apps/agent/src/controller/nodes/specialistToolBuilder.ts`
    - `apps/agent/src/controller/nodes/generalAgent.ts`
  - Action:
    - Extend `SpecialistNodeContext` to include a `memory` payload, e.g. `{ persona_memory, long_term_memory }` (strings, truncated).
    - Router populates this from AgentState when building `specialistContext`.
    - `buildSpecialistContextPrompt()` includes a “User preferences / memory” section.
    - General Agent includes persona/long-term memory in the planning user message (truncated).
  - Notes:
    - Truncation: hard cap each memory section (e.g., 2–4k chars) to prevent prompt bloat.

### Acceptance Criteria

- [ ] AC 1: Given a logged-in user, when they issue a command like “save this as a skill: …”, then `AssistantCommandProcessor` delegates to `skills.manage` and the system returns a success summary.
- [ ] AC 2: Given `skills.manage` is executed, when the Skill Creator agent parses the preference, then a `public.user_skills` row is created/updated for `(organization_id, user_id)` with the expected `name` and `content_markdown`.
- [ ] AC 3: Given two different users in the same organization, when user A lists/searches skills, then only user A’s skills are returned (no cross-user leakage).
- [ ] AC 4: Given a user has a saved cover-letter style skill, when they request “write a cover letter” and the Docs specialist executes, then the specialist calls `search_user_skills` and applies the style guidance in the produced document.
- [ ] AC 5: Given a user has no matching skills, when a specialist calls `search_user_skills`, then the tool returns an empty result set and the specialist continues with default behavior.
- [ ] AC 6: Given a plan includes a Drive step, when Router routes to `drive`, then it uses the Drive specialist node (not fallback) and produces a handoff note with file id + extracted context.
- [ ] AC 7: Given SearXNG MCP is configured and healthy, when an agent calls the research tool with a query, then it returns a structured research report with at least 3 sources (URLs) when available.
- [ ] AC 8: Given SearXNG MCP is unreachable, when an agent calls the research tool, then the tool returns a clear error message and does not crash the overall task execution.
- [ ] AC 9: Given an execution plan has >3 steps, when Router completes step 3, then LangGraph routes to `general_agent` for a checkpoint review and then continues silently to step 4.
- [ ] AC 10: Given a checkpoint review determines the plan must change, when General Agent revises the remaining steps, then `execution_runs.plan_json` is updated, `replan_count` increments, and the ledger records the checkpoint replan.
- [ ] AC 11: Given persona/long-term memory exists for the user, when General Agent plans or a specialist executes an assistant.command task, then their prompts include the memory context (within configured truncation limits).
- [ ] AC 12: Given `skills.manage` runs without `task.user_id`, when it executes, then it returns an escalation/setup_required response (skills are user-scoped).
- [ ] AC 13: Given research is invoked with a query containing PII, when the research tool runs, then it redacts/strips PII and does not leak persona/long-term memory into the web query.
- [ ] AC 14: Given Router triggers a `recordReplan()` (no worker step completion), when `routeAfterRouter` runs, then it does not route to General Agent checkpoint solely because the done-step count is a multiple of 3.

## Review Notes

- Adversarial review completed.
- Findings: 12 total, 11 fixed, 1 skipped.
- Resolution approach: auto-fix (`F`).
- Fixed findings: F1, F2, F3, F4, F5, F7, F8, F9, F10, F11, F12.
- Skipped findings: F6 (undecided).

## Additional Context

### Dependencies

- Supabase migration(s) for `public.user_skills` storage + RLS (must be applied to the target Supabase project).
- SearXNG stack (prod): `searxng/searxng` + an MCP wrapper (recommended: `ghcr.io/jae-jae/searxng-mul-mcp` in HTTP mode).
- Agent runtime configuration:
  - `SEARXNG_MCP_URL` (HTTP MCP endpoint, e.g., `http://127.0.0.1:3000/mcp`)
  - `SEARXNG_URL` (SearXNG base URL the wrapper uses)

### Testing Strategy

- Unit/integration tests (Vitest):
  - Migration test asserts `user_skills` table + RLS policy exists.
  - Skills service tests for org/user scoping and deterministic upsert behavior.
  - Router tests cover drive specialist routing.
  - General Agent checkpoint tests verify every-3-steps routing and plan revision persistence.
  - Prompt tests verify memory context is included for assistant.command path.
- Manual validation:
  - Bring up `infra/searxng-mcp/docker-compose.yml`, verify `/health` and MCP tool listing, then run a sample “research” request.

### Notes

- Current system injects memory into `reasoningNode` only; this spec intentionally extends memory injection to planning + specialist execution so “permanent memory” actually affects user-visible outputs.
- Risk: prompt bloat — memory + skills must be truncated/filtered so specialists don’t exceed model context; prefer persona/long-term only for most steps.
- Service-role Supabase bypasses RLS; org/user scoping must be enforced in server code and covered by tests.
- Checkpoint replans must preserve idempotency keys and completed step outputs so retries don’t repeat side effects.
