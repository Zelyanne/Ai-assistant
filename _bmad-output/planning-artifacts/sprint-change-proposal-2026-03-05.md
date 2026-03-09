# Sprint Change Proposal

**Project:** Ai assistant  
**Date:** 2026-03-05  
**Owner:** Scrum Master (Bob) with Alexis  
**Mode:** Incremental

## 1) Issue Summary

### Trigger
- Trigger area: Epic 6, with Story 6.1 as the closest initiating story.
- Change type: New requirement.

### Problem Statement
The current implementation path is too command-center/email-centric. The product is an AI assistant and must support direct, persistent, multi-turn user conversation as a first-class interaction model, including execution of authorized Google Workspace tasks from that conversation context.

### Evidence
- Product intent requires direct user-to-assistant interaction for task delegation, not only email processing.
- This requirement is needed for MVP now.
- External messaging channels are required in MVP with full send/execute behavior.
- Telegram is prioritized first, followed by WhatsApp.

## 2) Impact Analysis

### Epic Impact
- **Epic 6 (Operational Mastery & Transparency):** Expanded from command input toward full conversational execution and channel operations.
- **Epic 2 (Agent Controller Foundation & Task Orchestration):** Requires explicit channel adapter/routing story for normalized multi-channel execution and delivery lifecycle management.
- **Epic 4 (Autonomous Proxy & Actionable Trust):** Agency-tier and confidence escalation rules must explicitly apply to Telegram/WhatsApp actions.
- **Epic 1 (Secure Hub & Ingestion Foundation):** Integration/admin scope should include messaging-channel credentials/permissions governance.

### Story Impact
- **Modify existing:** Story 6.1 (scope increase).
- **Add new:** Story 6.6 (Telegram), Story 6.7 (WhatsApp), Story 2.9 (multi-channel adapter/routing).

### Artifact Conflicts
- **PRD conflict:** Current roadmap places messaging proxy in post-MVP; this conflicts with MVP-now requirement.
- **Architecture conflict:** Current integration pattern does not model messaging channels as first-class execution paths.
- **UX conflict:** Current UX emphasizes Morning Brief + command field; must elevate assistant chat as a primary surface.

### Technical Impact
- New channel adapters and webhook ingestion handling.
- Unified message normalization envelope and outbound dispatcher.
- Delivery state tracking, retries/backoff, and provider-error observability.
- Channel metadata in immutable audit logs.

## 3) Recommended Approach

### Selected Path
**Hybrid (Option 1 Direct Adjustment + Option 3 MVP Review):**
- Directly adjust stories and architecture to include conversational + channel execution capabilities.
- Re-baseline MVP scope to include Telegram first and WhatsApp second.

### Why This Path
- Preserves product truth (assistant is conversational and operational).
- Avoids deferring core user value behind a phase boundary.
- Reuses existing task queue/orchestration design instead of introducing parallel pipelines.

### Effort, Risk, Timeline
- **Effort:** High
- **Risk:** Medium-High (provider integration complexity, reliability constraints)
- **Timeline impact:** Medium; requires reprioritization of Epic 6 and explicit Epic 2 backend support.

## 4) Detailed Change Proposals

### A) Stories (Epics)

#### Story 6.1 Update
**OLD:** Natural Language Command Center focused on a persistent input and task creation.  
**NEW:** Conversational Command Center & Execution Chat with multi-turn context, inline execution states, and escalation behavior.

**Rationale:** Aligns story with MVP conversational execution requirement.

#### New Story 6.6
**OLD:** No explicit Telegram MVP execution story.  
**NEW:** Telegram Bidirectional Proxy Execution (MVP first external channel).

**Rationale:** Establishes first external channel with full send/execute behavior.

#### New Story 6.7
**OLD:** No explicit WhatsApp MVP execution story.  
**NEW:** WhatsApp Bidirectional Proxy Execution (MVP second external channel).

**Rationale:** Preserves full MVP requirement with staged channel rollout.

#### New Story 2.9
**OLD:** No explicit backend channel adapter/routing story.  
**NEW:** Multi-Channel Messaging Adapter, Routing, and Delivery State.

**Rationale:** Prevents fragmented channel-specific logic and centralizes security/reliability behavior.

### B) PRD Modifications

**OLD:** Messaging proxy listed in post-MVP Phase 2.  
**NEW:** Conversational chat and Telegram/WhatsApp execution moved into MVP scope, with Telegram first and WhatsApp second.

**Rationale:** Removes contradiction between roadmap and current validated requirement.

### C) Architecture Modifications

**OLD:** Frontend/Supabase/Agent/MCP flow without first-class messaging channel adapters.  
**NEW:** Add channel adapter layer, normalized task envelope, outbound dispatcher, delivery lifecycle/retries, and channel-aware audit fields.

**Rationale:** Keeps architecture coherent and operationally supportable under MVP expectations.

### D) UX Specification Modifications

**OLD:** Morning Brief + command center as primary interaction pattern.  
**NEW:** Assistant Chat becomes a primary interaction surface across web and mobile, with explicit Telegram/WhatsApp flows and trust controls.

**Rationale:** Ensures UX matches product behavior and user expectation.

## 5) Implementation Handoff

### Scope Classification
**Major**

### Routing
- **Product Manager + Architect:** Re-baseline MVP scope, confirm timeline and risk acceptance.
- **Product Owner + Scrum Master:** Reorder backlog and sequence story creation based on new dependencies.
- **Development Team:** Implement 2.9 first (adapter/routing foundation), then 6.1 update, then 6.6 Telegram, then 6.7 WhatsApp.

### Success Criteria
- Users can complete end-to-end delegated actions through web chat and Telegram/WhatsApp under agency constraints.
- All channel actions include reasoning trace linkage and immutable audit entries with channel metadata.
- Escalation behavior is consistent across web and messaging channels.

## Proposed Backlog Sequencing

1. 2.9 Multi-Channel Messaging Adapter, Routing, and Delivery State
2. 6.1 Conversational Command Center & Execution Chat (updated)
3. 6.6 Telegram Bidirectional Proxy Execution
4. 6.7 WhatsApp Bidirectional Proxy Execution
5. Regression checks for Epic 4 confidence/escalation and Epic 1 integration governance

---

## Approval and Workflow Log

- **User approval:** Approved by Alexis on 2026-03-05 (`yes`)
- **Scope classification confirmed:** Major
- **Handoff routes confirmed:** PM + Architect, PO + SM, Development Team
- **Execution log note:** `sprint-status.yaml` updated with approved story entries and scope note for Story 6.1

**Status:** Approved for implementation routing.
