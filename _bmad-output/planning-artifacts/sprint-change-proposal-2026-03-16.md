# Sprint Change Proposal: Messaging-First Chief of Staff Pivot
**Date:** 2026-03-16
**Status:** Approved (Pending Final Review)

## 1. Issue Summary
* **Trigger:** Strategic pivot to reduce user friction by moving primary interaction from a Web Hub to **WhatsApp/Telegram**.
* **Problem Statement:** The current web-centric architecture creates too much friction for the "Overstretched CEO." The agent needs a persistent, layered memory of *how* tasks were done to truly act as a proxy.

## 2. Recommended Approach: Messaging-First & Layered Memory
We will transition to a "Mobile-First" architecture while retaining the Web Hub as a testing and configuration platform. The core innovation is a layered, Markdown-based memory system and a JSON-driven scheduling tool.

## 3. Impact Analysis

### **3.1 Functional Impact**
* **Primary Interaction:** Shifts to WhatsApp/Telegram.
* **Web UI Role:** Dual-purpose platform for:
    * **Testing & Configuration:** Monitoring agent execution and memory states.
    * **Direct Interaction:** Users can also chat with the AI directly via the Web Command Center.
* **Brain & Memory:** Layered MD system (`persona.md`, `task-state.json`, `short-term.md`, `weekly-memory.md`, `long-term.md`).
* **Scheduling:** JSON-based persistent schedules triggered by a Cron service.

### **3.2 Technical & Artifact Impact**
* **PRD:** Update core journeys to messaging-first. Add Memory Layer requirements.
* **Architecture:** Add Messaging Integration Service, Memory Manager, and Cron Scheduler.
* **Epics:** Redefine Epics 3 and 6. Add Epic 7 (Messaging & Scheduling).

## 4. Detailed Change Proposals

### [PRD] Layered Memory Architecture
- **Persona (`persona.md`):** Identity, user role, personality. Loaded every prompt.
- **Short-Term Memory (`short-term.md`):** Daily task history. Loaded after first task. Reset EOD.
- **Weekly Memory (`week-XX.md`):** EOD summaries. Loaded every prompt. Reset EOM.
- **Long-Term Memory (`long-term.md`):** Monthly distilled insights. Permanent.
- **Task State (`task-state.json`):** Working memory for the current active task (Steps/Status).

### [Architecture] Execution Loop
- **Trigger:** Webhook (WhatsApp/Telegram) or Cron (Schedules).
- **Execution:** Agent loads context -> Executes task (updating `task-state.json`) -> Reports outcome -> Updates `short-term.md`.
- **EOD Process:** Agent summarizes `short-term.md` -> Appends to `weekly-memory.md` -> Resets `short-term.md`.

## 5. Implementation Plan (Handoff)
- **Epic 7 (New):** Messaging Integration & Scheduling Service.
- **Epic 3 (Refocused):** Memory Manager & MD-based Brain.
- **Web Hub:** Retain "Command Center" as a visualization of the Agent's internal state for testing.
