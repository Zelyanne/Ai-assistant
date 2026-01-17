# Sprint Change Proposal - Agent Controller Implementation Gap

**Date:** 2026-01-17  
**Author:** Bob (Scrum Master)  
**Prepared For:** Alexis  
**Workflow:** Correct Course - Sprint Change Management  

---

## Section 1: Issue Summary

### Problem Statement

**Missing Agent Controller Implementation Stories**

During epic review, it was discovered that while the PRD, Architecture, and UX documents thoroughly describe the AI agent's capabilities (protocol generation, autonomous proxy execution, relancing loops, LLM reasoning), the epic breakdown contains **zero stories for implementing the actual agent controller** (`apps/agent/`). All existing stories focus on UI components, database schemas, and configuration interfaces, but nothing builds the backend service that executes the autonomous "Chief of Staff" behavior.

### Context

**Discovery Method:** Proactive epic review  
**Triggering Event:** User (Alexis) noticed that "none of my epics or stories include the actual implementation of the agents itself"  

**Issue Category:** Misunderstanding of original requirements / Failed coverage during planning

### Evidence

**From Epic Analysis:**

- **Epic 1 (Secure Hub & Ingestion):** Stories focus on monorepo setup, database schema, OAuth integration, RLS policies, PII filtering service — **NO agent implementation**
- **Epic 2 (Personalized Triage & Brain Setup):** Stories focus on UI for protocol generation, email triage UI, Morning Brief UI, thread summarization UI — **NO actual agent logic to generate protocols or perform triage**
- **Epic 3 (Autonomous Proxy):** Stories focus on Agency Tier UI, approval flow UI, Emergency Brake toggle — **NO autonomous execution engine**
- **Epic 4 (Adaptive Relancing):** Stories focus on scheduler UI, nudge interface, blocker detection UI — **NO actual relancing loop logic**
- **Epic 5 (Operational Mastery):** Stories focus on NL Command Center UI, reasoning trace UI — **NO calendar resolution logic or context gathering implementation**

**The Pattern:** All stories describe **what the user sees and configures**, but nothing describes **how the agent actually executes those capabilities.**

**Missing Components (from Architecture):**
- `apps/agent/src/controller/AgencyController.ts` — Core orchestration logic
- `apps/agent/src/processors/taskProcessor.ts` — Relancing loop logic
- `apps/agent/src/services/mcp.ts` — MCP SDK integration
- `apps/agent/src/guards/PerimeterGuard.ts` — Security/Topic enforcement
- The entire **Agent Controller Service** that listens to Supabase Realtime and executes tasks

---

## Section 2: Impact Analysis

### Epic Impact

**Current State:**
- 5 epics defined (Epic 1-5)
- All epics focus on frontend/UI implementation
- No epic addresses backend agent controller

**Required Changes:**
- ✅ **Add New Epic 2: Agent Controller Foundation & Task Orchestration**
- ✅ **Renumber existing Epic 2-5 to Epic 3-6**
- ✅ All existing epic content remains valid

**Epic Dependency Chain:**
1. **Epic 1:** Foundation (database, auth, ingestion) — No dependencies
2. **Epic 2:** Agent Controller ⭐ NEW — Depends on Epic 1
3. **Epic 3-6:** UI/Frontend epics — Depend on Epic 2

### Story Impact

**Stories to Add:** 8 new stories in Epic 2
**Stories to Modify:** 0 (existing stories unchanged)
**Stories to Remove:** 0

**New Story List:**
- Story 2.1: Agent Controller Initialization & Realtime Subscription
- Story 2.2: Task Processor with Domain.Action Routing
- Story 2.3: MCP SDK Integration with Google Workspace Server
- Story 2.4: PerimeterGuard PII Filtering & Agency Tier Enforcement
- Story 2.5: LLM Reasoning Integration (OpenAI/Anthropic)
- Story 2.6: Immutable Audit Logging to agent_activity_log
- Story 2.7: Protocol Execution Engine
- Story 2.8: Confidence Evaluation & Escalation Logic

### Artifact Conflicts

**PRD (prd.md):**
- ❌ No conflicts
- ✅ PRD already describes all agent capabilities
- 🔄 No changes required

**Architecture (architecture.md):**
- ❌ No conflicts
- ✅ Architecture already specifies agent structure in detail
- 🔄 No changes required

**UX Design (ux-design-specification.md):**
- ❌ No conflicts
- ✅ UX already describes user-facing experience
- 🔄 No changes required

**Project Context (project-context.md):**
- ❌ No conflicts
- ✅ Already mentions Agent Controller and MCP integration
- 🔄 No changes required

**Epics (epics.md):**
- ✅ Changes required (detailed in Section 4)

### Technical Impact

**Code Impact:**
- New monorepo app: `apps/agent/` (~2000-3000 lines estimated)
- New shared types: `packages/shared/src/agent.types.ts`

**Infrastructure Impact:**
- Hetzner VPS deployment for Agent Controller
- Environment variables for LLM API keys and MCP server paths

**Testing Impact:**
- Unit tests for task processors and perimeter guard
- Integration tests for Supabase Realtime communication
- E2E tests for agent-to-UI interaction

---

## Section 3: Recommended Approach

### Selected Path: Direct Adjustment (Option 1)

**Approach:** Add new Epic 2: Agent Controller Foundation

**Why This Approach:**
- ✅ **Low Risk:** Clear, cohesive epic focused on one architectural component
- ✅ **Maintainable:** Agent implementation is centralized and well-bounded
- ✅ **Timeline Impact:** Minimal — this work was always required, just not documented
- ✅ **Team Clarity:** Developers have a clear "build the agent" epic with focused stories
- ✅ **Business Value:** Enables all downstream UI epics

**Alternatives Considered:**
- ❌ **Option 2: Rollback** — Not applicable (nothing implemented yet)
- ❌ **Option 3: MVP Review** — Not needed (MVP scope unchanged)
- ⚠️ **Distribute across existing epics** — Would fragment agent implementation and increase risk

### Effort Estimate

**Epic 2 Implementation:**
- **Effort:** Medium-High (8 stories, estimated 3-4 weeks for 2 developers)
- **Risk:** Low (well-defined architecture, clear requirements)
- **Complexity:** Medium (MCP integration, LLM reasoning, Realtime subscriptions)

### Timeline Impact

**Before:**
- Epic 1 → Epic 2 (UI) → Epic 3 (UI) → Epic 4 (UI) → Epic 5 (UI)
- **Problem:** No backend to power the UI

**After:**
- Epic 1 → Epic 2 (Agent) → Epic 3-6 (UI)
- **Timeline:** +3-4 weeks to implement Epic 2
- **Note:** This work was always required for MVP; we're documenting it, not adding scope

### Risk Assessment

**Technical Risks:**
- ⚠️ MCP SDK integration complexity — **Mitigation:** Architecture already specifies subprocess approach
- ⚠️ LLM rate limits and costs — **Mitigation:** Shadow mode for initial validation

**Schedule Risks:**
- ⚠️ Epic 2 becomes critical path — **Mitigation:** Prioritize Epic 2 immediately after Epic 1

**Quality Risks:**
- ⚠️ Agent logic fragmentation — **Mitigation:** Centralized in one epic prevents this

---

## Section 4: Detailed Change Proposals

### Change #1: Insert New Epic 2

**File:** `_bmad-output/planning-artifacts/epics.md`  
**Location:** After Epic 1 section (after line 183 in current file)  
**Type:** INSERT

**Content to Add:**

```markdown
## Epic 2: Agent Controller Foundation & Task Orchestration

Implement the core Agent Controller service that orchestrates autonomous execution, LLM reasoning, and MCP-based Google Workspace automation.

**FRs covered:** All FRs (provides backend execution layer for FRs 1-20, 25-29).
**NFRs covered:** NFR2 (zero-training), NFR3 (PII filtering), NFR5 (shadow mode), NFR6 (emergency brake), NFR7 (audit logs), NFR8-10 (performance).

### Story 2.1: Agent Controller Initialization & Realtime Subscription
As a System Architect,
I want a Node.js Agent Controller that listens to the Supabase `tasks` table via Realtime,
So that the agent can consume queued tasks from the frontend and process them asynchronously.

**Acceptance Criteria:**
**Given** a Supabase project with the `tasks` table
**When** the Agent Controller starts
**Then** it establishes a Realtime subscription to monitor `INSERT` events on `tasks` where `status = 'queued'`
**And** it updates task status to `processing` when picked up
**And** it writes results to the `result` JSONB field and updates status to `done` or `error`.

### Story 2.2: Task Processor with Domain.Action Routing
As a Developer,
I want a task processor that routes tasks based on the `domain.action` naming pattern,
So that different task types (email.draft, calendar.create, system.analyze) are handled by appropriate processors.

**Acceptance Criteria:**
**Given** a task with `type = 'email.draft'`
**When** the Task Processor receives it
**Then** it routes to the EmailDraftProcessor
**And** each processor follows the standard interface (process, validate, execute)
**And** unsupported task types return an error with `status = 'error'`.

### Story 2.3: MCP SDK Integration with Google Workspace Server
As a Developer,
I want the Agent Controller to communicate with the Google Workspace MCP Server via the MCP SDK,
So that it can read emails, manage calendar events, and access Google Docs programmatically.

**Acceptance Criteria:**
**Given** the Python Google Workspace MCP Server is available
**When** the Agent Controller needs to access Gmail or Calendar
**Then** it spawns the MCP server as a subprocess using the MCP SDK
**And** it sends MCP protocol requests (stdio or SSE transport)
**And** it receives structured responses for email threads, calendar events, and docs.

### Story 2.4: PerimeterGuard PII Filtering & Agency Tier Enforcement
As a Privacy Officer,
I want all data to pass through PerimeterGuard before being sent to external LLMs,
So that PII is redacted and agency tier boundaries are enforced (NFR3).

**Acceptance Criteria:**
**Given** the Agent Controller prepares a prompt for an LLM
**When** it calls `PerimeterGuard.filter(data, agencyTier)`
**Then** the utility redacts names, phone numbers, emails, and sensitive IDs
**And** it checks the requested action against the user's defined Agency Tier (Public/Controlled/Restricted)
**And** it escalates to the user if the action exceeds the authorized tier.

### Story 2.5: LLM Reasoning Integration (OpenAI/Anthropic)
As a Developer,
I want the Agent Controller to integrate with LLM providers for reasoning tasks,
So that it can generate protocols, draft emails, and make autonomous decisions.

**Acceptance Criteria:**
**Given** a task requiring LLM reasoning (e.g., `protocol.generate`)
**When** the Agent Controller processes it
**Then** it constructs a prompt using filtered context from PerimeterGuard
**And** it calls the configured LLM provider (OpenAI or Anthropic) via API
**And** it parses the structured response and stores it in the task result
**And** all interactions are logged with token usage and latency metrics.

### Story 2.6: Immutable Audit Logging to agent_activity_log
As an SME Leader,
I want every autonomous action logged with reasoning traces and source citations,
So that I have complete transparency into what the assistant is doing (FR25, FR26).

**Acceptance Criteria:**
**Given** any autonomous action taken by the Agent Controller
**When** the action completes
**Then** it writes to the `agent_activity_log` table with:
  - Action type and timestamp
  - Input data and output/result
  - Reasoning trace (step-by-step logic)
  - Confidence score
  - Source citations (deep links to Gmail/Calendar/Docs)
**And** the log is append-only (never updated or deleted).

### Story 2.7: Protocol Execution Engine
As an SME Leader,
I want the Agent Controller to load and execute my personalized `.md` protocols,
So that nudging behavior and autonomous actions align with my leadership style (FR2, FR3).

**Acceptance Criteria:**
**Given** a user has defined a protocol in the `user_protocols` table
**When** the Agent Controller processes a relancing or autonomous proxy task
**Then** it loads the relevant protocol from the database
**And** it parses the Markdown structure to extract rules and timing
**And** it applies the protocol logic to determine nudge intervals, tone, and escalation conditions.

### Story 2.8: Confidence Evaluation & Escalation Logic
As a Developer,
I want the Agent Controller to evaluate its confidence before autonomous actions,
So that low-confidence tasks are escalated to the user for review (FR10).

**Acceptance Criteria:**
**Given** a task requiring autonomous execution (Agency Tier: Public)
**When** the Agent Controller processes it
**Then** it evaluates confidence based on:
  - LLM response certainty
  - Availability of source data
  - Ambiguity in the request
**And** if confidence is below the configured threshold, it sets `status = 'escalation'` instead of executing
**And** the UI displays an "Escalation Card" for user review.
```

---

### Change #2: Renumber Existing Epics

**File:** `_bmad-output/planning-artifacts/epics.md`  
**Type:** FIND AND REPLACE throughout document

**Changes Required:**

1. **Epic Headers:**
   - `## Epic 2: Personalized Triage` → `## Epic 3: Personalized Triage`
   - `## Epic 3: Autonomous Proxy` → `## Epic 4: Autonomous Proxy`
   - `## Epic 4: Adaptive Relancing` → `## Epic 5: Adaptive Relancing`
   - `## Epic 5: Operational Mastery` → `## Epic 6: Operational Mastery`

2. **Story IDs (Examples):**
   - `Story 2.1` → `Story 3.1`
   - `Story 2.2` → `Story 3.2`
   - (Continue pattern through all stories in Epics 2-5)

3. **Add dependency notes to Epic 3-6 descriptions:**
   - Epic 3: Add "**Dependencies:** Requires Epic 2 (Agent Controller) for protocol execution and LLM reasoning."
   - Epic 4: Add "**Dependencies:** Requires Epic 2 (Agent Controller) for autonomous execution and confidence evaluation."
   - Epic 5: Add "**Dependencies:** Requires Epic 2 (Agent Controller) for task processing and MCP integration."
   - Epic 6: Add "**Dependencies:** Requires Epic 2 (Agent Controller) for MCP integration and audit logging."

---

### Change #3: Update FR Coverage Map

**File:** `_bmad-output/planning-artifacts/epics.md`  
**Location:** FR Coverage Map section (lines 73-103)  
**Type:** REPLACE entire section

**Replace With:**

```markdown
## FR Coverage Map

FR1: Epic 3 - Brain Setup & Protocols (UI), Epic 2 - Protocol Execution (Backend)
FR2: Epic 3 - Brain Setup & Protocols (UI), Epic 2 - Protocol Execution (Backend)
FR3: Epic 3 - Brain Setup & Protocols (UI), Epic 2 - Protocol Execution (Backend)
FR4: Epic 5 - Adaptive Relancing (UI), Epic 2 - Task Processing (Backend)
FR5: Epic 5 - Adaptive Relancing (UI), Epic 2 - Task Processing (Backend)
FR6: Epic 4 - Proxy Agency (UI), Epic 2 - Agency Tier Enforcement (Backend)
FR7: Epic 4 - Proxy Agency (UI), Epic 2 - Autonomous Execution (Backend)
FR8: Epic 4 - Proxy Agency (UI), Epic 2 - Autonomous Execution (Backend)
FR9: Epic 4 - Proxy Agency (UI), Epic 2 - Agency Tier Enforcement (Backend)
FR10: Epic 4 - Proxy Agency (UI), Epic 2 - Confidence Evaluation (Backend)
FR11: Epic 4 - Emergency Brake (UI), Epic 2 - Task Cancellation (Backend)
FR12: Epic 3 - Semantic Morning Brief (UI), Epic 2 - MCP Integration (Backend)
FR13: Epic 6 - Calendar Resolution (UI), Epic 2 - MCP Integration (Backend)
FR14: Epic 6 - Context Gathering (UI), Epic 2 - MCP Integration (Backend)
FR15: Epic 6 - Calendar Management (UI), Epic 2 - MCP Integration (Backend)
FR16: Epic 6 - Proxy Execution (UI), Epic 2 - MCP Integration (Backend)
FR17: Epic 3 - Semantic Morning Brief (UI), Epic 2 - LLM Reasoning (Backend)
FR18: Epic 3 - Semantic Morning Brief (UI), Epic 2 - LLM Reasoning (Backend)
FR19: Epic 5 - Status Reporting (UI), Epic 2 - LLM Reasoning (Backend)
FR20: Epic 3 - Source Citations (UI), Epic 2 - Audit Logging (Backend)
FR21: Epic 1 - Multi-tenant Isolation
FR22: Epic 1 - Admin Hub
FR23: Epic 1 - Principal Permissions
FR24: Epic 1 - API Management
FR25: Epic 6 - Audit Logs (UI), Epic 2 - Audit Logging (Backend)
FR26: Epic 6 - Reasoning Trace (UI), Epic 2 - Audit Logging (Backend)
FR27: Epic 6 - Protocol Optimization (UI), Epic 2 - Protocol Execution (Backend)
FR28: Epic 3 - Keyword Definition (UI), Epic 2 - LLM Reasoning (Backend)
FR29: Epic 3 - Semantic Classification (UI), Epic 2 - LLM Reasoning (Backend)
```

---

### Change #4: Update Epic List Summary

**File:** `_bmad-output/planning-artifacts/epics.md`  
**Location:** Epic List section (lines 105-125)  
**Type:** REPLACE entire section

**Replace With:**

```markdown
## Epic List

### Epic 1: The Secure Hub & Ingestion Foundation
Establish the secure, multi-tenant workspace with PII filtering and the Google Workspace ingestion layer.
**FRs covered:** FR21, FR22, FR23, FR24, NFR1-4, NFR6.

### Epic 2: Agent Controller Foundation & Task Orchestration
Implement the core Agent Controller service that orchestrates autonomous execution, LLM reasoning, and MCP-based Google Workspace automation.
**FRs covered:** All FRs (provides backend execution layer for FRs 1-20, 25-29).
**NFRs covered:** NFR2 (zero-training), NFR3 (PII filtering), NFR5 (shadow mode), NFR6 (emergency brake), NFR7 (audit logs), NFR8-10 (performance).

### Epic 3: Personalized Triage & The "Brain" Setup
Define leadership "nudging" protocols and custom keywords to receive the first semantically categorized Morning Brief.
**FRs covered:** FR1, FR2, FR3, FR12, FR17, FR18, FR20, FR28, FR29 (UI/Frontend), NFR8, NFR9.
**Dependencies:** Requires Epic 2 (Agent Controller) for protocol execution and LLM reasoning.

### Epic 4: Autonomous Proxy & Actionable Trust
Activate autonomous responses for "Public" topics within defined Agency Tiers, protected by the Emergency Brake.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11 (UI/Frontend), NFR5, NFR10.
**Dependencies:** Requires Epic 2 (Agent Controller) for autonomous execution and confidence evaluation.

### Epic 5: Adaptive Relancing & Team Alignment
Implement bidirectional nudge loops that gather status and detect blockers without disrupting team focus.
**FRs covered:** FR4, FR5, FR19 (UI/Frontend).
**Dependencies:** Requires Epic 2 (Agent Controller) for task processing and MCP integration.

### Epic 6: Operational Mastery & Transparency
Enable complex logistical resolution (Calendar/Docs) with complete reasoning traces and human-readable audit logs.
**FRs covered:** FR13, FR14, FR15, FR16, FR25, FR26, FR27 (UI/Frontend), NFR7.
**Dependencies:** Requires Epic 2 (Agent Controller) for MCP integration and audit logging.
```

---

## Section 5: Implementation Handoff

### Change Scope Classification

**Scope:** **Moderate**

**Rationale:**
- Requires backlog reorganization (epic renumbering)
- Adds significant new work (8 stories, 3-4 weeks)
- Does NOT require fundamental replan (architecture and PRD already support this)
- Can be implemented directly by development team

### Handoff Recipients

**Primary:** Development Team  
**Supporting:** Product Owner / Scrum Master

**Responsibilities:**

**Development Team:**
- Implement Epic 2 stories after Epic 1 completes
- Follow architecture specification for `apps/agent/` structure
- Coordinate with frontend team on task queue schema

**Product Owner / Scrum Master (Bob):**
- Update `epics.md` with approved changes
- Resequence sprint backlog to prioritize Epic 1 → Epic 2 → Epic 3-6
- Communicate timeline impact to stakeholders

**Architect:**
- Available for consultation on MCP SDK integration
- Review agent controller implementation for architectural alignment

### Success Criteria

**Epic 2 is considered complete when:**
1. ✅ All 8 stories pass acceptance criteria
2. ✅ Agent Controller successfully processes tasks from Supabase Realtime
3. ✅ MCP integration functional with Google Workspace
4. ✅ PerimeterGuard filters PII before LLM calls
5. ✅ Audit logging captures all agent actions
6. ✅ Integration tests pass for agent-to-UI communication

**Document updates are complete when:**
1. ✅ `epics.md` contains new Epic 2 with 8 stories
2. ✅ All epic numbers updated (2→3, 3→4, 4→5, 5→6)
3. ✅ FR Coverage Map reflects backend/frontend split
4. ✅ Dependencies documented in Epic 3-6 descriptions

### Next Steps

**Immediate (Today):**
1. Alexis reviews and approves this Sprint Change Proposal
2. Bob updates `epics.md` with approved changes
3. Bob updates sprint-status.yaml (if exists) with new epic structure

**Short-term (Next Sprint Planning):**
1. Product Owner prioritizes Epic 2 stories
2. Development team estimates Epic 2 effort
3. Sprint plan adjusted to accommodate Epic 2 timeline

**Medium-term (Implementation):**
1. Epic 1 completes (database, auth, ingestion)
2. Epic 2 begins (agent controller implementation)
3. Epic 3-6 UI work blocked until Epic 2 completes

---

## Section 6: Summary

### Issue Recap

**What was discovered:** Epic breakdown missing all agent controller implementation stories  
**Why it matters:** Without agent implementation, UI has no backend to communicate with  
**Scope of impact:** Affects all 5 epics (now 6 with new Epic 2)

### Solution Recap

**Recommended approach:** Add new Epic 2: Agent Controller Foundation  
**Stories added:** 8 new stories  
**Timeline impact:** +3-4 weeks for Epic 2 implementation  
**Risk level:** Low (well-defined architecture, clear requirements)

### Approval Status

**Checklist Completion:**
- ✅ Section 1: Understand Trigger and Context
- ✅ Section 2: Epic Impact Assessment
- ✅ Section 3: Artifact Conflict Analysis
- ✅ Section 4: Path Forward Evaluation
- ✅ Section 5: Sprint Change Proposal Components

**Change Proposals:**
- ✅ Change #1: Insert New Epic 2 — APPROVED
- ✅ Change #2: Renumber Existing Epics — APPROVED
- ✅ Change #3: Update FR Coverage Map — APPROVED
- ✅ Change #4: Update Epic List Summary — APPROVED

**Awaiting:**
- ⏳ **Final user approval to execute changes**

---

**Prepared by:** Bob (Scrum Master)  
**Date:** 2026-01-17  
**Status:** Ready for Final Approval
