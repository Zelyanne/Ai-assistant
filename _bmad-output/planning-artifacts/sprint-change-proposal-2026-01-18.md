# Sprint Change Proposal: UI Foundation Gap

**Date:** 2026-01-18
**Author:** Bob (Scrum Master)
**Trigger:** Missing foundational UI stories identified during review.

## 1. Issue Summary
**Problem:** The current backlog jumps from project initialization (Epic 1) directly to complex feature implementation (Epic 3), skipping the critical step of setting up the Frontend UI Architecture (Design System, Theme, Layout).
**Impact:** Without this foundation, developers would be forced to "implied" scaffold the entire app shell inside the first feature story, leading to scope creep and inconsistency.

## 2. Impact Analysis
*   **Epic Impact:** **Epic 3** requires a new prerequisite story.
*   **Artifacts:** `planning-artifacts/epics.md` and `implementation-artifacts/sprint-status.yaml` need updating.
*   **Dependencies:** All UI stories in Epics 3, 4, 5, and 6 will depend on this new Story 3.0.

## 3. Recommended Approach
**Direct Adjustment:** Insert **Story 3.0** at the start of Epic 3 to formally track the implementation of the UX Design Specification requirements.

## 4. Detailed Change Proposals

### Artifact: `_bmad-output/planning-artifacts/epics.md`

**ADD** to **Epic 3: Personalized Triage & The "Brain" Setup**:

```markdown
### Story 3.0: UI Design System & App Shell Implementation
As a Developer,
I want to set up the core UI framework, Design System, and Application Shell,
So that subsequent features (Morning Brief, Settings) have a consistent foundation to build upon.

**Acceptance Criteria:**
**Given** the UX Design Specification (Executive Calm palette, Typography)
**When** the frontend application is configured
**Then** Material UI (or PrimeVue) is installed with a custom Theme Provider using the specified colors (Indigo #334155, Deep Teal #059669)
**And** the "Structured Hub" layout is implemented (Persistent Sidebar, Header, Main Content Area)
**And** the layout is responsive (Collapsible sidebar on mobile)
**And** basic routing is set up for Dashboard and Settings.
```

## 5. Implementation Handoff
*   **Scope:** **Moderate** (Requires creating a new story but fits within existing Epic structure).
*   **Routing:** **Scrum Master** (Self) to update artifacts immediately.

---
**Approval Status:** Approved by Alexis.
