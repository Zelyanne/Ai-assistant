# Google Workspace Project Management Skill for the General Agent

Use this file for the General Agent when the user asks to plan, coordinate, launch, track, review, or close a project in Google Workspace.

This skill is for orchestration. The General Agent should think like a project lead who knows how to turn a request into a clean Google Workspace operating system across Gmail, Calendar, Docs, Sheets, Slides, Drive, and recurring scheduling flows.

The General Agent is not the final tool operator. Its job is to:

- understand the real project outcome
- decide which Workspace artifacts are needed
- avoid duplicate or unnecessary artifacts
- break the work into specialist-friendly steps
- preserve dependencies between steps
- include scheduled follow-ups when the user wants recurring project rituals

## Core Principle

Do not treat Google Workspace as isolated apps.

Treat it as a connected project operating model:

- Gmail for stakeholder communication and approvals
- Calendar for milestones, working sessions, reviews, and recurring rituals
- Docs for charter, briefs, notes, decision logs, and narrative status updates
- Sheets for trackers, RAID logs, budgets, dashboards, and task visibility
- Slides for kickoff decks, steering updates, and executive summaries
- Drive for the artifact hub and discovery of existing files

The best project plan is not the one with the most files. It is the one with the clearest operating system.

## When To Use This Skill

Apply this skill whenever the request is about:

- project kickoff
- project planning
- project tracking
- status reporting
- stakeholder communication
- team coordination
- milestone management
- budget tracking
- action tracking
- meeting cadence setup
- recurring reminders, reviews, or reports
- project closeout or handoff

Typical requests:

- "Set up a project workspace for the redesign"
- "Create a project plan and weekly status cadence"
- "Organize kickoff docs, tracker, and stakeholder update"
- "Build a dashboard and send weekly progress emails"
- "Create a steering committee deck and recurring review meetings"

## General Agent Role

The General Agent should:

1. Determine the project goal.
2. Identify the smallest useful set of artifacts.
3. Check whether existing project artifacts likely already exist.
4. Create a step plan using the right specialists.
5. Sequence steps so downstream workers can reuse upstream outputs.
6. Add recurring scheduling logic when the user asks for automation or regular cadence.

The General Agent should not:

- specify raw tool names in the plan
- create five files when one file is enough
- create a deck for every project by default
- create a tracker without deciding what will actually be tracked
- create recurring meetings when the user wanted recurring automated reminders

## Workspace Project Operating Model

For most Google Workspace project-management requests, think in six layers.

## 1. Project Home

Goal: create or identify the project hub.

Preferred artifact:

- Drive-located project file set or at least a clearly named primary doc/sheet/deck set

Guidance:

- If the project probably already exists, search first before creating new artifacts.
- Reuse existing files if they are clearly the right project assets.
- If you create new assets, keep names consistent.

Good naming pattern:

- `Project Phoenix - Charter`
- `Project Phoenix - Tracker`
- `Project Phoenix - Weekly Status`
- `Project Phoenix - Steering Deck`

## 2. Project Definition

Goal: make the work legible.

Preferred artifact:

- Google Doc

Recommended contents:

- project objective
- scope
- non-goals
- stakeholders
- timeline
- milestones
- deliverables
- decision owners
- risks and assumptions

Use Docs when the project needs shared narrative understanding, not just rows and columns.

## 3. Execution Tracker

Goal: make work trackable.

Preferred artifact:

- Google Sheet

Recommended tabs:

- `Tasks`
- `Milestones`
- `RAID`
- `Budget` if relevant
- `Dashboard` if reporting matters

Default task columns:

- task id
- workstream
- task
- owner
- priority
- status
- start date
- due date
- blocker
- dependency
- notes

Helpful tracker details the General Agent should encourage when appropriate:

- notes on columns when a field needs explanation
- status dropdowns or checkbox-style completion markers
- filters so owners can focus on their own tasks or overdue work
- conditional formatting for late, blocked, or at-risk items

Default RAID columns:

- type
- item
- impact
- probability
- owner
- mitigation
- status
- target date

## 4. Team Rhythm

Goal: maintain momentum.

Preferred artifact:

- Google Calendar events and recurring review structure

Typical rituals:

- kickoff meeting
- weekly project sync
- milestone review
- stakeholder review
- retrospective or closeout session

Use Calendar for meetings, milestones, and visible time commitments.

## 5. Communication Layer

Goal: keep stakeholders aligned.

Preferred artifact:

- Gmail drafts or sends

Good uses:

- kickoff announcement
- weekly update
- approval request
- escalation note
- delivery or handoff summary

## 6. Executive Reporting Layer

Goal: translate project data into decisions.

Preferred artifact:

- Slides for leadership-ready summaries
- Docs for narrative status memos
- Sheets dashboards for operational reporting

Not every project needs Slides. Use Slides when executive review, steering, or visual storytelling is required.

## Default Orchestration Patterns

## Lightweight project setup

Use this when the project is small to medium and the user wants a working system fast.

Recommended steps:

1. Search Drive for existing project artifacts if the project likely already exists.
2. Create a project charter Doc.
3. Create a project tracker Sheet.
4. Create kickoff or review Calendar event if requested.
5. Draft stakeholder kickoff email if requested.

## Full project workspace setup

Use this when the user wants an end-to-end PM workspace.

Recommended steps:

1. Search existing Drive assets.
2. Create charter or scope Doc.
3. Create tracker and dashboard Sheet.
4. Create kickoff presentation if a formal launch is needed.
5. Create milestone and recurring review events.
6. Draft stakeholder launch email.

## Status reporting workflow

Use this when the project already exists and the user wants reporting.

Recommended steps:

1. Read the existing tracker or source docs.
2. Update or create a summary Doc or status deck.
3. Draft or send stakeholder update email.
4. If recurring, set up scheduled status cadence when supported.

## Closeout workflow

Use this when the user wants to wrap a project.

Recommended steps:

1. Read existing artifacts.
2. Create closeout or handoff Doc.
3. Create summary Slide deck only if needed.
4. Draft handoff or completion email.
5. Schedule post-mortem or retrospective only if requested.

## Planning Rules For The General Agent

When building a plan, always decide:

- Is this a new project or an existing one?
- Do we need narrative definition, structured tracking, or both?
- Is the audience operational or executive?
- Does the user want one-time setup, ongoing tracking, or recurring automation?
- Which artifact is the source of truth?

## Artifact Selection Heuristics

Choose artifacts intentionally.

Use Docs when:

- the project needs scope, charter, notes, decisions, or narrative status
- stakeholders need context and rationale

Use Sheets when:

- the project needs tracking, status fields, dates, ownership, risks, or dashboards
- data must be updated by multiple contributors

Use Slides when:

- the audience is executives or sponsors
- the user asked for a presentation or formal project update
- the work needs visual summary rather than raw tables

Use Calendar when:

- the task involves meetings, milestones, checkpoints, or review cadence

Use Gmail when:

- the task involves notification, coordination, approval, escalation, or summary distribution

## Sequencing Rules

Plan upstream artifacts before downstream communication.

Good sequence:

1. search or read existing context
2. create or update source artifact
3. create schedule or meeting layer
4. communicate using Gmail

Bad sequence:

1. email people about a tracker that does not exist yet
2. create a deck before defining project scope

## Handoff Rules Between Steps

Use `source_step_key` whenever later steps need outputs from earlier steps.

Examples:

- email step references the charter doc and tracker sheet created earlier
- slides step references the sheet dashboard created earlier
- status update step references the most recent tracker output

The General Agent should create step inputs that are rich enough for specialists to act without guessing.

## Naming Rules

Use stable names across all artifacts.

Preferred pattern:

- `<Project Name> - Charter`
- `<Project Name> - Tracker`
- `<Project Name> - Weekly Status`
- `<Project Name> - Steering Deck`
- `<Project Name> - RAID Log`

Consistency matters because it improves Drive searchability and avoids duplicate artifacts.

## Scheduling And Recurring Task Guidance

This is critical.

Project management is not only artifact creation. It is cadence management.

When the user asks for recurring follow-up, reminders, routine status prompts, or periodic reports, the General Agent should think in two layers:

### 1. Calendar cadence

Use Calendar when the cadence is about meetings, milestone reviews, or visible time blocks.

When recurring calendar support is the best fit, recurring event series are the right mental model for weekly syncs, steering reviews, and fixed project rituals.

Examples:

- weekly project sync every Monday at 9 AM
- steering committee every first Wednesday at 2 PM
- milestone review on launch minus 7 days

### 2. Scheduled task automation

Use scheduled-task capacity when the cadence is about recurring agent behavior rather than just a meeting.

Examples:

- every Friday at 4 PM remind me to update the project tracker
- every Monday at 8 AM prepare a project status draft
- every weekday at 5 PM send me a summary of overdue items
- every first business day of the month prompt me to review project risks

Important scheduling rule:

- Do not model recurring automation as a stack of one-off manual plan steps.
- If the orchestration layer supports schedule management, preserve the recurrence intent for that scheduling flow.
- If only workspace specialists are available, fall back to Calendar events and clearly note that this is a meeting or reminder approximation, not a durable background automation.

## Suggested Project Cadences

Use these defaults when the user wants recommendations:

- daily standup reminder: weekday mornings
- weekly project sync: once per week, same day/time
- weekly written status update: Friday afternoon or end of local week
- milestone review: 3 to 7 days before milestone deadline
- monthly steering update: once per month with Slides or Doc summary
- closeout review: within one week of project completion

## PM Templates The General Agent Should Prefer

## Project charter Doc outline

- project name
- objective
- problem or opportunity
- scope
- non-goals
- stakeholders
- milestones
- deliverables
- risks and assumptions
- decisions needed

## Project tracker Sheet outline

- task list tab
- milestone tab
- RAID tab
- dashboard tab if reporting matters

## Weekly status Doc or email outline

- overall status: on track, at risk, off track
- wins this period
- upcoming milestones
- blockers and risks
- decisions needed
- owner actions for next period

## Steering deck outline

- executive summary
- KPI or milestone snapshot
- progress since last review
- risks and decisions
- next steps

## What Good Plans Look Like

## Example 1: Project kickoff workspace

User request:

`Set up a project workspace for our website redesign with a charter, tracker, kickoff meeting, and stakeholder email.`

Good plan shape:

```json
{
  "summary": "Set up a lightweight Google Workspace project operating system for the website redesign.",
  "steps": [
    {
      "key": "step-1",
      "title": "Search for existing website redesign assets",
      "worker_type": "drive",
      "action": "Look for existing project files related to the website redesign before creating duplicates.",
      "input": {
        "query": "Website redesign charter tracker kickoff"
      }
    },
    {
      "key": "step-2",
      "title": "Create project charter",
      "worker_type": "docs",
      "action": "Create a project charter document for the website redesign covering scope, goals, milestones, stakeholders, and risks.",
      "input": {
        "title": "Website Redesign - Charter",
        "source_step_key": "step-1"
      }
    },
    {
      "key": "step-3",
      "title": "Create project tracker",
      "worker_type": "sheets",
      "action": "Create a project tracker spreadsheet with task, milestone, and RAID tracking for the website redesign.",
      "input": {
        "title": "Website Redesign - Tracker",
        "description": "Track tasks, milestones, owners, statuses, due dates, and risks.",
        "source_step_key": "step-2"
      }
    },
    {
      "key": "step-4",
      "title": "Create kickoff meeting",
      "worker_type": "calendar",
      "action": "Create a kickoff calendar event for the website redesign project.",
      "input": {
        "summary": "Website Redesign Kickoff",
        "source_step_key": "step-2"
      }
    },
    {
      "key": "step-5",
      "title": "Draft stakeholder kickoff email",
      "worker_type": "gmail",
      "action": "Draft a stakeholder kickoff email that shares the new charter, tracker, and kickoff meeting details.",
      "input": {
        "source_step_key": "step-4"
      }
    }
  ]
}
```

Why it is good:

- searches first
- creates the defining document before the tracker
- creates communication only after artifacts exist
- preserves handoff flow

## Example 2: Executive reporting setup

User request:

`Create a project dashboard and a monthly steering committee deck for the CRM migration.`

Good orchestration:

- create or update the Sheets dashboard first
- create the Slides deck second using the dashboard output
- optionally draft the meeting invite or stakeholder email third

## Example 3: Recurring follow-up automation

User request:

`Every Friday at 4 PM remind me to update the CRM migration tracker and every first Monday of the month prepare a steering update draft.`

General Agent interpretation:

- this is recurring automation, not just ordinary artifact creation
- keep the user's recurrence intent intact
- prefer scheduled-task capacity if available
- if the runtime only supports workspace specialists, represent the rhythm with Calendar plus a note about the limitation

## Example 4: Mid-project recovery

User request:

`We already have docs and a tracker, but things are messy. Organize the project and prepare a status update for leadership.`

Good orchestration:

1. search and read existing files
2. do not recreate everything blindly
3. create or update a clean summary doc or dashboard
4. create a leadership status deck only if needed
5. draft the update email after the summary artifact exists

## Guidance On Recommendations

If the user asks for advice rather than direct execution, the General Agent should still think in concrete workspace architecture.

For example:

- recommend a charter Doc if scope is unclear
- recommend a tracker Sheet if ownership or deadlines are unclear
- recommend recurring status rhythm if progress is slipping
- recommend Slides only if executive alignment is a real need

## Anti-Patterns

Do not:

- create a Slides deck for an internal two-person task list
- create a tracker without owners and dates
- create a schedule without clarifying whether it is a meeting cadence or automation cadence
- recreate a project workspace if existing files are already sufficient
- send a status email before creating the underlying summary
- create too many parallel sources of truth
- confuse project notes with the official tracker

## Final Checklist For The General Agent

Before finishing plan generation, verify:

- the project outcome is clear
- the plan uses the minimum useful set of artifacts
- existing artifacts are searched before new ones are created when appropriate
- step ordering makes sense
- later steps use `source_step_key` when they depend on earlier outputs
- Calendar cadence and scheduled-task cadence are not confused
- recurring automation is preserved when the user explicitly asked for recurrence

## Research Basis

This skill is based on:

- Google Workspace Learning Center guidance for planning and managing projects
- Google's project-management guidance across Docs, Sheets, Calendar, Drive, Gmail, and Slides
- Google Workspace blog guidance on scope docs, task trackers, shared drives, and review cadence
- official developer references surfaced through Context7 for recurring calendar events and structured spreadsheet behaviors like filters, notes, and conditional formatting
- project reporting best practices for dashboards, status docs, and executive decks
- this repository's scheduling capability, including recurring scheduled-task flows and cron-backed user schedules
