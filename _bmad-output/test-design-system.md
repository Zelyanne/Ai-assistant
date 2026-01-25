# System-Level Test Design - Ai assistant

## Testability Assessment

- **Controllability: PASS (with Considerations)**
  - The system uses a **Database-as-Queue** pattern via Supabase, which is highly controllable. We can seed the `tasks` table directly for integration testing.
  - **Consideration:** The Agent Controller (Node.js) requires a "Mock MCP" mode to avoid side effects in Google Workspace during automated test runs.
  - **Consideration:** LLM non-determinism should be mitigated using fixed prompts/seeds or mocked LLM providers in lower-level tests.

- **Observability: PASS**
  - The immutable `agent_activity_log` provides excellent visibility into the agent's reasoning process.
  - Supabase Realtime enables monitoring of task state transitions (`queued` -> `processing` -> `done`/`error`) without polling.
  - **Requirement:** Ensure `trace_id` is propagated from the Frontend through the Agent Controller to the log.

- **Reliability: CONCERNS**
  - Dependency on external LLMs and Google APIs introduces high potential for flakiness.
  - **Requirement:** Implement a robust retry strategy with exponential backoff in the Agent Controller, validated via fault-injection tests.

## Architecturally Significant Requirements (ASRs)

| ID | Category | Requirement | Risk Score (P×I) | Mitigation Approach |
|---|---|---|---|---|
| ASR-1 | SEC | PII Masking (PerimeterGuard) | 2 × 3 = **6** | Unit tests for PII regex/NLP filters; E2E tests verifying no PII reaches the LLM mock. |
| ASR-2 | PERF | Emergency Brake Latency <500ms | 2 × 3 = **6** | k6 performance tests measuring time from DB write (stop signal) to Agent process termination. |
| ASR-3 | BUS | Shadow Mode Alignment >95% | 3 × 2 = **6** | CI job comparing agent-generated drafts against a "Golden Set" of human-verified responses. |
| ASR-4 | TECH | Realtime Task Synchronization | 2 × 2 = **4** | Playwright tests simulating network drops between Hetzner and Supabase to verify task recovery. |

## Test Levels Strategy

- **Unit (Vitest): 70%**
  - **Scope:** `packages/shared` (Zod schemas), `apps/web` (Pinia stores, utility logic), `apps/agent` (PerimeterGuard logic, payload parsing).
  - **Rationale:** Fast feedback for core business rules and data integrity.

- **Integration (API): 20%**
  - **Scope:** Supabase RLS policies (Testing via `supabase-js` with different user contexts), Agent Controller internal loop (mocking MCP stdio).
  - **Rationale:** Ensures security boundaries and internal service orchestration are sound.

- **E2E (Playwright): 10%**
  - **Scope:** The complete "Morning Brief" loop. UI Task Creation -> DB Sync -> Agent Execution -> UI Results.
  - **Rationale:** High-confidence validation of the asynchronous event-driven architecture.

## NFR Testing Approach

- **Security:** 
  - **Auth/RLS:** Automated Playwright tests verifying User A cannot see User B's `tasks` or `agent_activity_log`.
  - **Perimeter:** Negative testing of `PerimeterGuard` using "Jailbreak" and PII-heavy prompts.
- **Performance:** 
  - **Load:** **k6** tests for 100 concurrent reasoning sessions to identify memory leaks in the Node.js controller.
  - **Latency:** **k6** validation of the <60s triage SLO.
- **Reliability:** 
  - **Recovery:** Interrupting the Agent during `processing` and verifying it resumes or fails gracefully upon restart.
- **Maintainability:** 
  - **Coverage:** Strict 80% line coverage enforcement in CI for `apps/agent` and `packages/shared`.

## Test Environment Requirements

- **Ephemeral DB:** Supabase local development (via Docker) for CI runs to ensure isolation.
- **Mock MCP Server:** A lightweight TypeScript sub-process that mimics Google Workspace MCP behavior for testing the Agent Controller.
- **LLM Mock Service:** To provide deterministic responses and avoid API costs during CI.

## Testability Concerns

- **Non-Deterministic Reasoning:** Traditional string-matching assertions will fail on LLM outputs. 
  - *Recommendation:* Use LLM-as-a-judge for semantic validation of "Reasoning Traces" in P1/P2 scenarios.
- **Google MCP Sandbox:** Testing actual Google Workspace integration requires dedicated test accounts and potentially brittle "pre-seeding" of emails/calendars.
  - *Recommendation:* Prioritize mocking at the MCP boundary; use actual Google integration only for a small subset of nightly P0 smoke tests.

## Recommendations for Sprint 0

1. **[TF] Framework:** Initialize `apps/agent` Vitest setup with the Mock MCP runner.
2. **[CI] Pipeline:** Configure Supabase CLI in GitHub Actions for automated RLS testing.
3. **[AT] ATDD:** Create the first P0 E2E test: "Agent successfully triages a high-priority email and logs the reasoning trace."
