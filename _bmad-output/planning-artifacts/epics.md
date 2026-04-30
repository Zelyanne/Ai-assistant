---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: 
  - "C:/Users/othil/Documents/Project/Ai assistant/_bmad-output/planning-artifacts/prd.md"
  - "C:/Users/othil/Documents/Project/Ai assistant/_bmad-output/planning-artifacts/architecture.md"
  - "C:/Users/othil/Documents/Project/Ai assistant/_bmad-output/planning-artifacts/ux-design-specification.md"
---

# Ai assistant - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Ai assistant, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The user can describe their "nudging philosophy" and leadership style in natural language.
FR2: The system can convert the user's natural language philosophy into a structured, stored `.md` protocol.
FR3: The user can review, edit, and manually approve the generated `.md` protocols.
FR4: The system can execute bidirectional nudges (team members can report blockers directly to the AI).
FR5: The system can pause or adjust active nudge cycles based on team member responses (e.g., detecting a "Blocker").
FR6: The user can define "Agency Tiers" (Public, Controlled, Restricted) for specific topics or contacts.
FR7: The system can autonomously provide information and resolve requests for topics classified as "Public."
FR8: The system can draft responses for "Controlled" topics and present them for user approval.
FR9: The system can identify and escalate "Restricted" topics to the human user immediately.
FR10: The system can evaluate its own confidence level before taking an autonomous action.
FR11: The user can invoke an "Emergency Brake" to instantly halt all autonomous proxy actions.
FR12: The system can monitor and categorize incoming Gmail threads in real-time.
FR13: The system can resolve logistical calendar conflicts using executive-level reasoning.
FR14: The system can gather context from Google Docs and Sheets to inform its proxy actions.
FR15: The system can create and update calendar events based on natural language commands.
FR16: The system can draft and send emails on behalf of the user within authorized perimeters.
FR17: The system can generate an intelligent "Morning Brief" summarizing saved time and pending actions.
FR18: The system can summarize long email threads and highlight critical action items for the user.
FR19: The system can draft routine status reports based on gathered "Relancing" data.
FR20: The system can provide source citations (deep links) for every assertion in an AI-generated summary.
FR21: The system can isolate all organization-specific data (protocols, context, history) at the database level.
FR22: The user can manage their organization's "Agency Perimeter" through a central interface.
FR23: The system can apply principal-driven permissions (CEO vs. PM vs. Team Member) to all assistant interactions.
FR24: The user can monitor and rotate API integrations and integration-specific permissions.
FR25: The system can generate human-readable audit logs for every autonomous proxy action.
FR26: The user can review the "Reasoning Trace" (the logic behind an AI decision) for any action.
FR27: The system can present a "Diff" summary of any suggested protocol optimizations for user approval.
FR28: The user can define custom "Watch Topics" or keywords for semantic classification.
FR29: The system can semantically classify emails based on user-defined keywords/topics.

### NonFunctional Requirements

NFR1: All data must be encrypted at rest using AES-256 and in transit using TLS 1.2 or higher.
NFR2: User communication data must never be used for training or fine-tuning third-party LLMs.
NFR3: Personally Identifiable Information (PII) must be masked or redacted before LLM processing where feasible.
NFR4: The system architecture must align with SOC2 Type II security and confidentiality principles.
NFR5: The system must achieve >95% alignment with user protocols in "Shadow Mode" before autonomous activation.
NFR6: The "Emergency Brake" must halt all autonomous actions within <500ms of activation.
NFR7: 100% of autonomous actions must include a reasoning log and source citations.
NFR8: Interactive queries (e.g., summaries) must provide the first token of response within <2 seconds.
NFR9: High-priority incoming emails must be triaged and flagged within <60 seconds of receipt.
NFR10: The system must support 100 concurrent proxy reasoning sessions per organization without performance degradation.

### Additional Requirements

- Use Vue 3 + TypeScript + Supabase (Vite template).
- Implement "Database-as-Queue" pattern using Supabase Realtime for Agent/UI sync.
- Monorepo structure with `apps/web`, `apps/agent`, and `packages/shared`.
- Agent Controller on Hetzner bridging to Python MCP server (Google Workspace reasoning) and Google APIs (automation/sync).
- Design System: MUI 3 with "Executive Calm" palette and Material You themes.
- Custom components: Outcome Card (with state colors), Reasoning Trace Pane, NL Command Center.
- PII filtering in `PerimeterGuard.ts` before LLM calls.
- Organization-based isolation using Supabase RLS.

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

## Epic List

### Epic 1: The Secure Hub & Ingestion Foundation
Establish the secure, multi-tenant workspace with PII filtering and the Google Workspace ingestion layer.
**FRs covered:** FR21, FR22, FR23, FR24, NFR1-4, NFR6.

### Epic 2: Agent Controller Foundation & Task Orchestration
Implement the core Agent Controller service that orchestrates autonomous execution, LLM reasoning, and MCP-based Google Workspace automation.
**FRs covered:** All FRs (provides backend execution layer for FRs 1-20, 25-29).
**NFRs covered:** NFR2 (zero-training), NFR3 (PII filtering), NFR5 (shadow mode), NFR6 (emergency brake), NFR7 (audit logs), NFR8-10 (performance).

### Epic 3: The "Brain" & Memory Layer
Implement the layered Markdown-based memory architecture and the agent's internal reasoning loop.
**FRs covered:** FR1-FR5.

### Story 3.1: Layered Memory Manager
As a Developer,
I want to implement the logic for loading, updating, and rotating the `.md` memory files,
So that the agent has persistent, layered context for all interactions.

**Acceptance Criteria:**
**Given** a new user prompt
**When** the agent starts processing
**Then** it loads `persona.md` and `weekly-memory.md`
**And** it loads `short-term.md` after the first task is initiated
**And** it updates `task-state.json` in real-time.

### Story 3.2: EOD Memory Aggregator
As a Developer,
I want to implement the EOD summary and rotation logic,
So that short-term tasks are distilled into weekly memories and the daily log is reset.

**Acceptance Criteria:**
**Given** the end of the day
**When** the cron triggers the EOD process
**Then** the agent summarizes `short-term.md`
**And** appends it to `weekly-memory.md`
**And** clears `short-term.md`.

### Epic 7: Messaging Integration & Scheduling
Implement the primary interaction layer via WhatsApp/Telegram and the JSON-based scheduling system.
**FRs covered:** FR6-FR9.

### Story 7.1: Messaging Channel Webhooks
As a User,
I want to interact with the agent via WhatsApp/Telegram,
So that I can delegate tasks from the apps I use most.

**Acceptance Criteria:**
**Given** an inbound message from a messaging app
**When** the webhook is triggered
**Then** the message is routed to the Agent Controller
**And** the agent responds via the same channel.

### Story 7.2: JSON Schedule & Cron Service
As a User,
I want to schedule recurring tasks via natural language,
So that the agent can execute them autonomously at the right time.

**Acceptance Criteria:**
**Given** a scheduling request (e.g., "Remind me every Monday...")
**When** the agent parses the command
**Then** it stores the schedule as JSON in the database
**And** a Cron service triggers the agent execution at the specified interval.


### Story 3.2: Semantic Email Triage & Keyword Classification
As a User,
I want the system to categorize my emails based on custom keywords,
So that my Morning Brief highlights exactly what I care about (FR28, FR29).

**Acceptance Criteria:**
**Given** a set of custom keywords (e.g., "Investor", "Blocker")
**When** new emails arrive
**Then** the system semantically classifies them in real-time
**And** flags high-priority threads within <60 seconds (NFR9).

### Story 3.3: Outcome-Centric Morning Brief UI
As an SME Leader,
I want a synthesized, card-based overview of my day,
So that I can see outcomes and momentum instead of a raw inbox.

**Acceptance Criteria:**
**Given** the Hub's Dashboard
**When** the Morning Brief is rendered
**Then** it uses the "Executive Calm" palette
**And** displays Outcome Cards for "Silent Wins", "Escalations", and "Insights".

### Story 3.4: Smart Thread Summarization with Action Items
As a User,
I want to see concise summaries of long email threads,
So that I can understand the critical context without reading every message (FR18).

**Acceptance Criteria:**
**Given** a multi-message email thread
**When** viewed in the Morning Brief
**Then** the system provides a 3-bullet summary with highlighted action items.

### Story 3.5: Reasoning Trace & Source Citation Engine
As an SME Leader,
I want to see the evidence and logic behind every AI assertion,
So that I can trust the summaries and automated decisions (FR20).

**Acceptance Criteria:**
**Given** any AI-generated summary
**When** I click "View Trace"
**Then** the system displays deep links to original source messages
**And** shows the step-by-step logic used by the agent.

## Epic 4: Autonomous Proxy & Actionable Trust

Activate autonomous responses for "Public" topics within defined Agency Tiers, protected by the Emergency Brake.

### Story 4.1: Agency Tier Configuration & Perimeter Management
As an SME Leader,
I want to define which topics the AI can handle autonomously,
So that I can safely delegate routine requests (FR6, FR22).

**Acceptance Criteria:**
**Given** the Agency Perimeter interface
**When** I drag "Project Logistics" to the "Public" tier
**Then** the AI is authorized to resolve those requests without my intervention.

### Story 4.2: Autonomous Proxy Execution
As a Team Member,
I want the assistant to answer routine questions on behalf of the CEO,
So that I get the information I need instantly (FR7).

**Acceptance Criteria:**
**Given** a request about a "Public" topic
**When** the Agent reaches a high confidence threshold
**Then** it sends the information/response directly via the authorized channel
**And** logs it as a "Silent Win" for the CEO.

### Story 4.3: Controlled Topic Drafting & Approval Flow
As an SME Leader,
I want the AI to draft responses for sensitive but routine topics,
So that I only have to review and approve instead of writing from scratch (FR8).

**Acceptance Criteria:**
**Given** a request about a "Controlled" topic
**When** the Agent processes it
**Then** it generates a draft and presents an "Escalation Card" in the Hub
**And** I can approve or edit the response with one click.

### Story 4.4: Real-time "Emergency Brake" Global Toggle
As a User,
I want an instant way to stop all autonomous AI actions,
So that I feel safe knowing I can intervene at any time (FR11).

**Acceptance Criteria:**
**Given** active autonomous cycles
**When** the "Emergency Brake" is toggled in the header
**Then** all pending and future proxy actions are halted within <500ms (NFR6).

### Story 4.5: Confidence-Based Escalation Logic
As a Developer,
I want the AI to escalate to a human when it is uncertain,
So that we prevent hallucination or incorrect proxy actions (FR10).

**Acceptance Criteria:**
**Given** a query that is ambiguous or low-confidence
**When** the Agent evaluates the request
**Then** it automatically shifts the task to "Escalation" status
**And** prompts the user for the "human touch."

## Epic 5: Adaptive Relancing & Team Alignment

Implement bidirectional nudge loops that gather status and detect blockers without disrupting team focus.

### Story 5.1: Adaptive Relancing Scheduler
As a PM,
I want the AI to follow up on tasks based on my leadership philosophy,
So that accountability is maintained without manual pings (FR4).

**Acceptance Criteria:**
**Given** an outstanding task
**When** the nudge interval is reached according to the protocol
**Then** the Agent evaluates the recipient's focus state
**And** triggers a context-aware follow-up if appropriate.

### Story 5.2: Bidirectional Nudge Interface
As a Team Member,
I want to report blockers or status directly to the AI,
So that the PM is updated without a formal meeting (FR4).

**Acceptance Criteria:**
**Given** a nudge from the AI
**When** I respond with "I'm blocked by the API docs"
**Then** the AI parses the blocker and updates the project's status report.

### Story 5.3: Blocker Detection & Automatic Protocol Adjustment
As a PM,
I want the AI to stop nudging someone when they report a blocker,
So that we don't create unnecessary organizational friction (FR5).

**Acceptance Criteria:**
**Given** a reported blocker from a team member
**When** the Agent processes the response
**Then** it pauses active nudge cycles for that task
**And** updates the PM's Morning Brief with the blocker alert.

### Story 5.4: Automated Status Aggregation & Reporting
As a PM,
I want the AI to draft my weekly status reports based on gathered data,
So that I can reclaim my Friday afternoons (FR19).

**Acceptance Criteria:**
**Given** the data gathered from relancing loops and Workspace integrations
**When** the reporting period ends
**Then** the AI generates a comprehensive draft report
**And** highlights critical action items for the review.

## Epic 6: Operational Mastery & Transparency

Enable complex logistical resolution (Calendar/Docs) with complete reasoning traces and human-readable audit logs.

### Story 6.1: Natural Language Command Center
As an SME Leader,
I want a persistent, conversational input field for delegation,
So that I can assign complex tasks to the assistant as easily as sending a message (FR15, FR16).

**Acceptance Criteria:**
**Given** an authenticated user in the Hub
**When** they type a command (e.g., "Draft a status update for Project Alpha based on the last 3 emails")
**Then** the UI shows a "Progressive Preview" of the task being structured
**And** the task is added to the `tasks` queue for processing by the Agent.

### Story 6.2: Calendar Conflict Resolution Logic
As an SME Leader,
I want the assistant to resolve my logistical calendar conflicts autonomously,
So that I don't have to manually manage my schedule (FR13).

**Acceptance Criteria:**
**Given** a detected calendar conflict
**When** the Agent Controller processes the conflict using my "Nudging Philosophy"
**Then** it proposes or executes a resolution (e.g., rescheduling a low-priority meeting) via the Google Calendar API
**And** it logs the reasoning (e.g., "Prioritized deep work over routine sync") in the Reasoning Trace.

### Story 6.3: Cross-Channel Context Gathering (Docs/Sheets)
As a Developer,
I want the Agent to gather context from Google Docs and Sheets,
So that its proxy actions are informed by the most recent project data (FR14).

**Acceptance Criteria:**
**Given** a delegation task that references a specific document or project
**When** the Agent Controller executes the task
**Then** it utilizes the Google Workspace API to read relevant Docs or Sheets
**And** it incorporates this context into its reasoning and output.

### Story 6.4: Comprehensive "Reasoning Trace" & Audit Logs
As an SME Leader,
I want a complete, immutable log of every action and thought process,
So that I have total transparency into what the assistant is doing on my behalf (FR25, FR26).

**Acceptance Criteria:**
**Given** any autonomous action taken by the Agent
**When** the action is logged
**Then** it includes a step-by-step "Reasoning Trace" (logic, confidence score, source citations)
**And** it is saved to the `agent_activity_log` table
**And** it is available for review in the Hub's Audit interface.

### Story 6.5: Protocol Optimization "Diff" Summaries
As an SME Leader,
I want to see suggested improvements to my protocols with clear "Diff" summaries,
So that I can evolve my assistant's behavior based on real-world performance (FR27).

**Acceptance Criteria:**
**Given** the Agent identifies a pattern that could be optimized in the user's protocol
**When** it suggests a change
**Then** it presents a natural language "Diff" summary (e.g., "Suggesting we change follow-up from 2 to 3 days for Leo based on his focus patterns")
**And** the change is only applied to the `.md` protocol after explicit user approval.
