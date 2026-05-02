---
stepsCompleted: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]
inputDocuments: ["C:/Users/othil/Documents/Project/Ai assistant/_bmad-output/planning-artifacts/product-brief-Ai assistant-2026-01-09.md"]
documentCounts:
  briefCount: 1
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 0
workflowType: 'prd'
lastStep: 10
---

# Product Requirements Document - Ai assistant

**Author:** Alexis
**Date:** 2026-01-09

## Executive Summary

Ai assistant is a high-agency, autonomous digital "Chief of Staff" designed to eliminate administrative friction for SME leaders and project managers. It transcends traditional scheduling tools by acting as a proactive Proxy Agent that manages communication, resolves logistical conflicts with executive-level reasoning, and autonomously executes pre-authorized tasks. The product's core mission is to reclaim high-value leadership time by ensuring business momentum never stalls due to manual follow-up gaps.

### What Makes This Special

*   **Dynamic "Relancing" Protocols:** Unlike static notification systems, Ai assistant allows users to describe their nudging philosophy in natural language. The AI then generates, stores (as .md context), and executes a personalized accountability protocol that mirrors the user's specific leadership style.
*   **Autonomous Proxy Execution:** The system operates within user-defined "Agency Tiers," allowing it to provide information and resolve routine requests autonomously based on historical patterns and authorized "Allowed Topics."
*   **Outcome-Cent Agency:** The "Brain" of the assistant is optimized for moving tasks from "pending" to "complete," treating the calendar as a tool for execution rather than just a visualization of time.

## Project Classification

**Technical Type:** saas_b2b
**Domain:** general
**Complexity:** medium
**Project Context:** Greenfield - new project

This classification reflects the platform's nature as a B2B productivity tool with significant innovation in AI-driven agency and personalized protocol generation. The medium complexity accounts for the requirement of high-agency LLM reasoning and the management of autonomous proxy perimeters.

## Success Criteria

### User Success
*   **"Trust Velocity":** Measured by the rapid transition of topics from "Restricted" (manual approval) to "Public" (autonomous proxy) agency tiers within the first 30 days.
*   **Cognitive Offloading:** A 70% reduction in the "mental checklist" of pending follow-ups as reported by the user.
*   **Relief Milestone:** The user experiences their first "Aha!" moment when a complex status report or routine information request is handled entirely by the AI without their intervention.

### Business Success
*   **Leadership Reclaim:** CEOs and leaders reclaim a minimum of 3-5 hours of high-value strategic time per week.
*   **Operational Momentum:** A measurable 20% reduction in project "drift" or bottlenecks caused by delayed follow-ups.
*   **Trust Foundation:** Achieving a <2% correction rate on autonomous proxy actions after the initial 2-week learning period.

### Technical Success
*   **Protocol Precision:** 95% alignment between the user's natural language "nudging philosophy" and the AI-generated `.md` protocol.
*   **Agency Perimeter Integrity:** Zero "Restricted Topic" leaks; 100% accuracy in identifying when a request exceeds the AI's current agency tier.
*   **Integration Stability:** High-reliability syncing with Google Workspace and mobile messaging channels (WhatsApp/Telegram).

### Measurable Outcomes
*   **Friction Reduction:** Measuring "Team Sentiment" through low-friction response rates (e.g., team members providing updates via the AI rather than waiting for a direct CEO "ping").
*   **Manual Task Decay:** A 50% decrease in the number of manually written administrative emails and follow-ups within 4 weeks.
*   **Reporting Efficiency:** 80% of routine status reports drafted or completed by the AI based on gathered "Relancing" data.

## Product Scope

### MVP - Minimum Viable Product
*   **Messaging-First Interaction:** Primary interaction via WhatsApp/Telegram for delegation and morning briefs.
*   **Layered Brain & Memory System:** MD-based memory architecture (Persona, Short-Term, Weekly, Long-Term) for high-agency context.
*   **JSON Scheduling Tool:** Natural language scheduling stored in DB and triggered by Cron.
*   **Self-Evolving Nudging Protocols:** Ability for users to describe their nudging style and have the AI generate and execute a personalized `.md` protocol.
*   **Web Testing Hub:** Command Center and configuration interface for testing and debugging agent logic.
*   **Relancing Engine:** Proactive status chasing across Gmail and mobile messaging.
*   **Smart Summarization:** Intelligent daily briefs sent via messaging apps.

### Growth Features (Post-MVP)
*   **Team Cohesion Analytics:** Visualizing team response patterns and identifying systemic bottlenecks.
*   **Multi-Agent Coordination:** Allowing the "Chief of Staff" to communicate with other team-member assistants.
*   **Advanced Agency Perimeters:** Dynamic, context-aware shifting of agency tiers based on project urgency.

### Vision (Future)
*   **The Invisible Executive:** A state where the baseline operational momentum of an SME is entirely self-managed by the AI, allowing the human leader to operate purely in the realm of strategy, creativity, and high-level relationships.

## User Journeys

### Journey 1: Sarah (The Overstretched CEO) – From Bottleneck to Strategist
Sarah is the CEO of a 25-person fintech startup. She spends hours manually triageing communication and "routing" tasks. After installing Ai assistant, she defines her "Agency Perimeter" for legal queries.
*   **The Climax:** A routine NDA question is handled autonomously by the AI Proxy while Sarah is in a board meeting.
*   **The Resolution:** Sarah reclaims her Friday afternoons for strategic growth, trusting the AI to handle the operational "nudge" logic.

### Journey 2: Leo (The Team Member) – The "Nudged" Experience
Leo is a Senior Designer who values deep work. He finds direct pings for status updates disruptive.
*   **The Climax:** The AI detects Leo's "Focus Mode" and sends a context-aware nudge on Slack, allowing him to provide a quick update via an emoji response when he finishes his task.
*   **The Resolution:** Leo feels respected and stays in his creative flow longer, as the AI handles the documentation and reporting for him.

### Journey 3: Marcus (The Scaling PM) – Orchestrating Without Burnout
Marcus manages multiple teams and dreads the "Friday Reporting" scramble. He describes a custom "Reporting Protocol" to the AI.
*   **The Climax:** By Friday morning, the AI has autonomously gathered 80% of updates and drafted a summary highlighting two critical blockers.
*   **The Resolution:** Marcus spends 10 minutes reviewing the draft instead of 3 hours chasing people, leading to a more cohesive and informed team.

### Journey Requirements Summary
These journeys reveal requirements for:
*   **Agency Perimeter Management:** Interface for defining "Allowed Topics" and escalation logic.
*   **Context-Aware Relancing:** Integration with user status (Focus Mode, OOO) and communication style.
*   **Natural Language Protocol Generation:** Ability to convert a descriptive "nudging philosophy" into a stored `.md` protocol.
*   **Automated Status Aggregation:** Logic for gathering updates from multiple sources into a single draft report.

## Innovation & Novel Patterns

### Detected Innovation Areas
*   **Adaptive & Bidirectional Relancing Protocols:** The system moves beyond static "ping" intervals. It uses LLM-reasoning to translate a user's natural language leadership philosophy into a structured `.md` protocol. **Innovation Enhancement:** These protocols are bidirectional; team members can report "Blockers" directly to the AI, which automatically pauses nudges and updates status reports, preventing redundant or annoying follow-ups.
*   **Permissioned Protocol Evolution with "Diff" Summaries:** The AI proactively identifies patterns in team responsiveness and suggests optimizations. To maintain transparency, every suggested change is accompanied by a natural language "Diff" summary (e.g., explaining why a nudge interval was shifted), requiring explicit CEO/PM approval before enactment.
*   **Agency Tier Perimeter:** A novel approach to AI security where "Allowed Topics" are sharded into tiers (Public, Controlled, Restricted). This allows the AI to act as a high-agency proxy for routine tasks while ensuring zero "Restricted Topic" leaks.

### Market Context & Competitive Landscape
*   **Beyond Reactive Schedulers:** While tools like Motion or Reclaim focus on "Time Blocking," Ai assistant focuses on "Outcome Execution." It is the first to bridge the gap between "knowing what to do" and "actually doing the follow-up" across multiple communication channels.
*   **The "Chief of Staff" Paradigm:** Most current AI tools are "personal assistants." This is a "team orchestrator" that understands the social dynamics and focus-needs of an entire SME.

### Validation Approach
*   **Protocol Alignment Testing:** Comparing AI-generated protocols against user intent through "Shadow Execution" modes where the user reviews the first 5-10 autonomous actions.
*   **Response Friction Analysis:** Measuring team response rates and sentiment to validate that the "Adaptive Protocols" are actually reducing organizational friction rather than increasing it.

### Risk Mitigation
*   **The "Emergency Brake":** A global toggle to immediately revert the AI from "Proxy Agent" back to "Draft Mode" (reactive) if any anomalies are detected.
*   **Transparency Logs & Traceable Evidence:** Every autonomous action and protocol change is logged in a human-readable format. All AI-generated summaries and reports include **Source Citations** (deep links to original Slack/Email messages), allowing users to instantly verify the "why" behind any AI assertion.

## SaaS B2B Specific Requirements

### Project-Type Overview
Ai assistant is a SaaS B2B platform designed to operate as a high-agency "Chief of Staff." It utilizes a multi-tenant architecture to provide secure, isolated environments for SMEs. The product’s technical foundation is optimized for executive-level delegation, ensuring that the "Proxy Agent" acts within a strictly defined perimeter while maintaining the high trust required for handling sensitive leadership communication.

### Technical Architecture Considerations

#### Tenant Model: Organization-Based Isolation
*   **Standard Isolation:** For the MVP, we will implement a standard organization-based isolation strategy. Each SME organization will have its own logical data partition, ensuring that data from one company (e.g., protocols, message history, "allowed topics") is never accessible or leaked to another.
*   **Logical Sandboxing:** While the underlying LLM infrastructure is shared, the prompt-context and stored protocols (.md files) will be isolated at the database and file-storage level using unique Organization IDs.

#### Permission Model: Principal-Driven Agency
*   **Dynamic Access Control:** Permissions will be tailored based on the primary user profile (the "Principal Client").
    *   **CEO Level:** Full agency control, ability to set/reset "Agency Tiers," and manual override ("Emergency Brake") for all proxy actions.
    *   **PM Level:** Focused on "Relancing" (follow-up) logic for specific projects, with limited access to the CEO's private "Restricted" perimeters.
    *   **Team Member Level:** Capability to provide updates and interact with the assistant, but zero visibility into the underlying "Nudging Protocols" or the CEO's private triage feeds.

### Implementation Considerations

#### Subscription & Monetization Model
*   **Value-Based Tiers:** Pricing will be determined by two primary scaling factors:
    1.  **Integration Volume:** Number of connected channels (e.g., Gmail + Slack vs. full Google Workspace + WhatsApp + Telegram).
    2.  **Team Scale:** Seat-based pricing or tiers based on the number of team members being "managed" or "nudged" by the assistant.

#### Integration Strategy: Google Workspace Core
*   **Executive Toolset:** We will prioritize deep integration with **Google Calendar** (for logistical conflict resolution) and **Google Docs** (for gathering context from project charters, briefs, and status reports).
*   **Proxy Triggers:** The system will monitor these tools to identify "outcome-centric" tasks that require follow-up, using Google’s OAuth scopes to maintain least-privilege access.

#### Compliance & Privacy: "Executive Trust" Best Practices
To address the high-sensitivity nature of executive data, we will apply the following B2B SaaS best practices:
*   **Zero-Training Guarantee:** Explicitly ensure that no user data (emails, messages, protocols) is used to train or fine-tune third-party LLM models.
*   **Audit-Ready Transparency:** Every autonomous action taken by the Proxy Agent will generate a human-readable audit log, traceable back to the specific "Allowed Topic" or user-authorized protocol.
*   **Data Encryption & PII Redaction:** Implementation of AES-256 encryption for data at rest. We will also implement PII (Personally Identifiable Information) masking where possible before sending data to LLM providers to minimize exposure.
*   **SOC2 Alignment:** The system architecture will be designed with SOC2 Type II principles in mind, focusing on security, availability, and confidentiality.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP - Focus on the "Aha!" moment through deep Google Workspace trust and flawlessly executed autonomous responses.
**Resource Requirements:** Small, high-seniority team specialized in LLM reasoning, secure B2B SaaS architecture, and deep API integrations (Google Workspace).

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
*   **The Overstretched CEO:** Autonomous resolution of routine requests to prove trust.
*   **The Team Member:** Context-aware nudges that respect "Focus Time" and reduce friction.

**Must-Have Capabilities:**
*   **Google Workspace Core:** High-reliability Gmail and Calendar integration.
*   **Protocol Generator:** Natural language translation of "nudging philosophy" into stored .md protocols.
*   **Agency Tier 1 (Public):** Autonomous responses for pre-authorized topics.
*   **The "Emergency Brake":** Global toggle to revert AI to reactive draft mode instantly.
*   **Audit & Transparency Logs:** Human-readable logs with source citations for all autonomous actions.

### Post-MVP Features

**Phase 2 (Growth):**
*   **Mobile Messaging Proxy:** WhatsApp and Telegram integrations for mobile-first leadership.
*   **Google Docs Integration:** Gathering context from project charters and briefs for smarter reporting.
*   **Permissioned Protocol Evolution:** AI-suggested optimizations with natural language "Diff" summaries.

**Phase 3 (Expansion):**
*   **Multi-Agent Coordination:** "Chief of Staff" communication with other team assistants.
*   **Team Cohesion Analytics:** Visualizing response patterns and systemic bottlenecks.
*   **Advanced Agency Perimeters:** Context-aware shifting of tiers based on project urgency.

### Risk Mitigation Strategy

**Technical Risks:** LLM reasoning errors in Agency Tier classification. **Mitigation:** Implementation of "Shadow Mode" for initial validation period where the user reviews all drafts before they are sent.
**Market Risks:** User hesitation to grant autonomous agency. **Mitigation:** Emphasis on "Source Citations" and the "Emergency Brake" to ensure users always feel in control.
**Resource Risks:** Integration complexity with multiple APIs. **Mitigation:** Prioritizing Google Workspace for MVP to validate core value before expanding to mobile channels.

## Functional Requirements

### 1. Adaptive Protocol & Memory Management
*   **FR1:** The user can describe their "nudging philosophy" and leadership style in natural language.
*   **FR2:** The system can convert the user's natural language philosophy into a structured, stored `.md` protocol.
*   **FR3:** The system maintains a layered memory system:
    *   **Persona (`persona.md`):** Permanent identity and role definition.
    *   **Short-Term Memory (`short-term.md`):** Daily task history, resets EOD.
    *   **Weekly Memory (`weekly-memory.md`):** EOD summaries, resets EOM.
    *   **Long-Term Memory (`long-term.md`):** Monthly distilled insights.
*   **FR4:** The system uses a `task-state.json` file to track steps and status for the current active task.
*   **FR5:** The system automatically executes EOD, EOW, and EOM memory aggregation and rotation logic.

### 2. Messaging-First Proxy Agency
*   **FR6:** The primary user interface for delegation and morning briefs is WhatsApp/Telegram, but the system also supports a full chat interface within the Web Testing Hub.
*   **FR7:** The system can initiate conversations for morning briefs, high-priority alerts, or task updates across both messaging and web channels.
*   **FR8:** The user can schedule tasks or routines via natural language in chat, stored as JSON in the database.
*   **FR9:** A Cron service triggers the agent based on stored schedules for execution at the correct time.
*   **FR10:** The user can define "Agency Tiers" (Public, Controlled, Restricted) for specific topics or contacts.
*   **FR11:** The system can evaluate its own confidence level before taking an autonomous action.
*   **FR12:** The user can invoke an "Emergency Brake" to instantly halt all autonomous proxy actions.

### 3. Google Workspace Core Integration
*   **FR13:** The system can monitor and categorize incoming Gmail threads in real-time.
*   **FR14:** The system can resolve logistical calendar conflicts using executive-level reasoning.
*   **FR14:** The system can gather context from Google Docs and Sheets to inform its proxy actions.
*   **FR15:** The system can create and update calendar events based on natural language commands.
*   **FR16:** The system can draft and send emails on behalf of the user within authorized perimeters.

### 4. Smart Triage & Reporting
*   **FR17:** The system can generate an intelligent "Morning Brief" summarizing saved time and pending actions.
*   **FR18:** The system can summarize long email threads and highlight critical action items for the user.
*   **FR19:** The system can draft routine status reports based on gathered "Relancing" data.
*   **FR20:** The system can provide source citations (deep links) for every assertion in an AI-generated summary.

### 5. Multi-Tenant Administration
*   **FR21:** The system can isolate all organization-specific data (protocols, context, history) at the database level.
*   **FR22:** The user can manage their organization's "Agency Perimeter" through a central interface.
*   **FR23:** The system can apply principal-driven permissions (CEO vs. PM vs. Team Member) to all assistant interactions.
*   **FR24:** The user can monitor and rotate API integrations and integration-specific permissions.

### 6. Transparency & Audit
*   **FR25:** The system can generate human-readable audit logs for every autonomous proxy action.
*   **FR26:** The user can review the "Reasoning Trace" (the logic behind an AI decision) for any action.
*   **FR27:** The system can present a "Diff" summary of any suggested protocol optimizations for user approval.

## Non-Functional Requirements

### Security & Privacy
*   **NFR1:** All data must be encrypted at rest using AES-256 and in transit using TLS 1.2 or higher.
*   **NFR2:** User communication data must never be used for training or fine-tuning third-party LLMs.
*   **NFR3:** Personally Identifiable Information (PII) must be masked or redacted before LLM processing where feasible.
*   **NFR4:** The system architecture must align with SOC2 Type II security and confidentiality principles.

### Reliability & Accuracy
*   **NFR5:** The system must achieve >95% alignment with user protocols in "Shadow Mode" before autonomous activation.
*   **NFR6:** The "Emergency Brake" must halt all autonomous actions within <500ms of activation.
*   **NFR7:** 100% of autonomous actions must include a reasoning log and source citations.

### Performance & Latency
*   **NFR8:** Interactive queries (e.g., summaries) must provide the first token of response within <2 seconds.
*   **NFR9:** High-priority incoming emails must be triaged and flagged within <60 seconds of receipt.
*   **NFR10:** The system must support 100 concurrent proxy reasoning sessions per organization without performance degradation.
