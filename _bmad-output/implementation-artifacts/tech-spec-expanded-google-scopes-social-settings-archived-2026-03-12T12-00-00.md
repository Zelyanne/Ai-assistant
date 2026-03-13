---
title: 'Expanded Google Scopes, Social Settings, and Personal Escalation Bypass'
slug: 'expanded-google-scopes-social-settings'
created: '2026-03-12'
status: 'review'
stepsCompleted: [1, 2, 3]
tech_stack: ['Vue 3', 'TypeScript', 'PrimeVue', 'Supabase', 'Express', 'Google OAuth2', 'LangGraph']
files_to_modify: [
  'apps/web/src/views/Settings.vue',
  'apps/agent/src/controller/graph.ts',
  'apps/agent/src/controller/nodes/escalate.ts',
  'apps/agent/src/services/googleAuth.ts',
  'apps/web/src/components/WorkspaceIntegration.vue',
  'apps/agent/src/channels/ChannelAdapterRegistry.ts'
]
code_patterns: [
  'Database-as-Queue (Tasks table)',
  'Unified confidence gate in LangGraph',
  'Registry-based processor and adapter patterns',
  'RLS-protected multi-tenancy'
]
test_patterns: [
  'Vitest for components and services',
  'Integration tests for LangGraph nodes'
]
---

# Tech-Spec: Expanded Google Scopes, Social Settings, and Personal Escalation Bypass

**Created:** 2026-03-12

## Overview

### Problem Statement

Alexis needs broader integration capabilities and a more streamlined user experience for high-authority users. Specifically:
1.  **Missing Social Settings**: Telegram and WhatsApp account configurations are missing from the UI.
2.  **Redundant Escalation**: Direct commands from the CEO (via Web Chat, WhatsApp, or Telegram) are currently subject to confidence-based escalation, which is unnecessary for the primary user.
3.  **Limited Google Scopes**: The current Google Workspace integration lacks Read/Write access for Docs, Sheets, and Slides, which are required for the Google Workspace MCP tools to function correctly.

### Solution

1.  **Settings UI Upgrade**: Add dedicated configuration sections for Telegram and WhatsApp in `Settings.vue`.
2.  **Escalation Bypass Logic**: Implement a "CEO Bypass" in the Agent Controller's LangGraph. If a task is an `assistant.command` and the user is the organization owner (CEO), the confidence gate and perimeter escalation are bypassed.
3.  **OAuth Scope Expansion**: Update `GoogleAuthService` to include full Read/Write scopes for Email, Calendar, Docs, Sheets, and Slides. Update the UI to reflect these new permission requirements.

### Scope

**In Scope:**
*   Adding Telegram/WhatsApp configuration UI and persistence logic in `Settings.vue`.
*   Updating `GoogleAuthService` with scopes: `gmail.modify`, `calendar`, `drive`, `documents`, `spreadsheets`, `presentations`.
*   Implementing the "CEO Bypass" in `graph.ts` and `escalateNode.ts`.
*   Updating `WorkspaceIntegration.vue` to communicate the expanded Google permissions.
*   Ensuring `ChannelAdapterRegistry` can load credentials dynamically (priority for local dev/env, but UI provides the path).

**Out of Scope:**
*   Implementing new MCP servers (using existing Google Workspace MCP).
*   Changing escalation logic for non-CEO roles.

## Context for Development

### Codebase Patterns

*   **LangGraph Orchestration**: The Agent Controller uses `graph.ts` to route tasks through nodes like `initialize`, `check_perimeter`, and `reasoning`.
*   **Confidence Gates**: Escalation is triggered if `confidence_score < CONFIDENCE_THRESHOLD` (0.8 by default).
*   **Adapter Pattern**: `ChannelAdapter` implementations (Telegram, WhatsApp, Web) handle inbound normalization and outbound delivery.
*   **Profile Roles**: Roles are defined in the `profiles` table: `CEO`, `PM`, `Team Member`, `Simple User`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/web/src/views/Settings.vue` | Main settings page |
| `apps/agent/src/controller/graph.ts` | LangGraph definition and unified gate logic |
| `apps/agent/src/controller/nodes/escalate.ts` | Escalation logic implementation |
| `apps/agent/src/services/googleAuth.ts` | Google OAuth configuration and scopes |
| `apps/web/src/components/WorkspaceIntegration.vue` | Google connection UI |
| `apps/agent/src/channels/ChannelAdapterRegistry.ts` | Adapter initialization |
| `apps/agent/src/processors/AssistantCommandProcessor.ts` | Command intent parsing |

### Technical Decisions

*   **Google Scopes**: We will upgrade `drive.readonly` to full `drive` + specific service scopes (`documents`, `spreadsheets`, `presentations`) to ensure full MCP compatibility.
*   **Bypass Identity**: We will fetch the user role in the `initialize` node. If `role === 'CEO'`, we set `bypass_escalation: true` in the graph state.
*   **Persistence**: Social settings will be stored in `workspace_integrations` with providers `telegram` and `whatsapp`.

## Implementation Plan

### Tasks

- [ ] Task 1: Expand Google OAuth Scopes
  - File: `apps/agent/src/services/googleAuth.ts`
  - Action: Update `getAuthUrl` scopes array to include `drive`, `documents`, `spreadsheets`, and `presentations`.
  - Notes: This ensures the Google MCP has write access.

- [ ] Task 2: Update Workspace Integration UI
  - File: `apps/web/src/components/WorkspaceIntegration.vue`
  - Action: Update the feature list to include "Full Docs/Sheets/Slides access (Read/Write)".
  - Notes: Clear communication for the user about why these permissions are needed.

- [ ] Task 3: Implement CEO Bypass in LangGraph
  - File: `apps/agent/src/controller/graph.ts`
  - Action: Update the `initialize` node to fetch the profile of the `task.user_id`. Add `is_ceo` flag to the state.
  - Action: In the routing logic, if `is_ceo` is true and `domain_action` is `assistant.command`, force `confidence_score` to 1.0.

- [ ] Task 4: Prevent Escalation for CEO Commands
  - File: `apps/agent/src/controller/nodes/escalate.ts`
  - Action: Add a check at the start of the node. If `state.is_ceo` is true, immediately return a result that does NOT transition to `escalation` status.
  - Notes: Ensures the task proceeds directly to execution.

- [ ] Task 5: Add Telegram & WhatsApp Settings UI
  - File: `apps/web/src/views/Settings.vue`
  - Action: Create two new PrimeVue Cards for Telegram and WhatsApp.
  - Action: Add inputs for Token, Chat ID (Telegram) and API Key, Phone ID (WhatsApp).
  - Action: Implement persistence logic using Supabase `workspace_integrations`.

- [ ] Task 6: Dynamic Adapter Configuration
  - File: `apps/agent/src/channels/ChannelAdapterRegistry.ts`
  - Action: Update the registry to allow fetching organization-specific credentials from the DB if not provided in env.

### Acceptance Criteria

- [ ] AC 1: Given a user clicks "Connect Workspace", when the Google consent screen appears, then it must list Read/Write permissions for Drive, Docs, Sheets, and Slides.
- [ ] AC 2: Given Alexis (CEO) sends a command via WhatsApp, when the agent processes it, then it must NOT trigger a "Human Review Required" escalation regardless of confidence score.
- [ ] AC 3: Given Alexis navigates to Settings, when they enter Telegram credentials and click save, then the credentials must be persisted to the `workspace_integrations` table for that organization.
- [ ] AC 4: Given an error occurs during social setting save, when the user clicks save, then a proper PrimeVue toast/message error must be displayed.

## Additional Context

### Dependencies

*   `googleapis` npm package
*   Supabase RLS (ensure CEO can insert into `workspace_integrations`)

### Testing Strategy

*   **OAuth**: Manual verification of the consent screen.
*   **Escalation**: Unit test `escalateNode` with a state where `is_ceo: true`.
*   **Settings**: Manual verification of DB records after UI save.

### Notes

*   **Security**: Ensure `workspace_integrations.encrypted_creds` is handled securely. The backend already has a `tokenService.ts` that handles encryption.
