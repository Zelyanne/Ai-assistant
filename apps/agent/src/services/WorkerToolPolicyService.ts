import type { WorkerType } from "@ai-assistant/shared";

export type CapabilityWorkerType = Exclude<WorkerType, "planner">;

export interface WorkerToolPolicy {
  workerType: CapabilityWorkerType;
  allowedTools: string[];
  requiredScopes: string[];
}

// Aligned to taylorwilsdon/google_workspace_mcp actual tool names.
// Core tier: search, read, create, basic modify.
// Extended tier (--tool-tier extended): adds update_drive_file, list_drive_items,
//   get_gmail_thread_content, modify_gmail_message_labels, batch_update_presentation, etc.
// Fake/aliased tool names (create_calendar_event, patch_calendar_event, etc.) are handled
// transparently by the TOOL_ALIAS_MAP in mcp.ts — do NOT list them here.
const POLICY_VERSION = "workspace-v1.15.0";

const WORKER_POLICIES: Record<CapabilityWorkerType, WorkerToolPolicy> = {
  gmail: {
    workerType: "gmail",
    // Core: search, read, batch-read, send, draft
    // Extended: thread content, label management, filters
    allowedTools: [
      "search_gmail_messages",
      "get_gmail_message_content",
      "get_gmail_messages_content_batch",
      "send_gmail_message",
      "draft_gmail_message",
      "get_gmail_thread_content",
      "modify_gmail_message_labels",
    ],
    // gmail.modify covers gmail.send, gmail.compose, gmail.readonly, gmail.labels
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  },
  drive: {
    workerType: "drive",
    // Core: search, read, create, share, import
    // Extended: update metadata/move, list folder contents
    allowedTools: [
      "search_drive_files",
      "get_drive_file_content",
      "get_drive_shareable_link",
      "create_drive_file",
      "create_drive_folder",
      "import_to_google_doc",
      "update_drive_file",
      "list_drive_items",
    ],
    requiredScopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  },
  docs: {
    workerType: "docs",
    // Core: get, create, modify text
    // Extended: search, find-replace, list in folder, insert elements
    allowedTools: [
      "get_doc_content",
      "create_doc",
      "modify_doc_text",
      "search_docs",
      "find_and_replace_doc",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
  },
  sheets: {
    workerType: "sheets",
    // Core: read, write, create
    // Extended: list, metadata
    allowedTools: [
      "create_spreadsheet",
      "read_sheet_values",
      "modify_sheet_values",
      "list_spreadsheets",
      "get_spreadsheet_info",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  slides: {
    workerType: "slides",
    // Core: create, get
    // Extended: batch_update (the actual write tool), get page, thumbnail
    allowedTools: [
      "create_presentation",
      "get_presentation",
      "batch_update_presentation",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/presentations"],
  },
  calendar: {
    workerType: "calendar",
    // Core: list_calendars, get_events, manage_event (create/update/delete)
    // Aliases (create_calendar_event etc.) are resolved by TOOL_ALIAS_MAP in mcp.ts
    allowedTools: [
      "list_calendars",
      "get_events",
      "manage_event",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/calendar"],
  },
};

export class WorkerToolPolicyService {
  getVersion(): string {
    return POLICY_VERSION;
  }

  getPolicy(workerType: CapabilityWorkerType): WorkerToolPolicy {
    return WORKER_POLICIES[workerType];
  }

  getAllowedTools(workerType: CapabilityWorkerType): string[] {
    return this.getPolicy(workerType).allowedTools;
  }

  getRequiredScopes(workerType: CapabilityWorkerType): string[] {
    return this.getPolicy(workerType).requiredScopes;
  }

  isToolAllowed(workerType: CapabilityWorkerType, toolName: string): boolean {
    return this.getAllowedTools(workerType).includes(toolName);
  }
}

export const workerToolPolicyService = new WorkerToolPolicyService();
