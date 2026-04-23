import type { WorkerType } from "@ai-assistant/shared";

export type CapabilityWorkerType = Exclude<WorkerType, "planner">;

export interface WorkerToolPolicy {
  workerType: CapabilityWorkerType;
  allowedTools: string[];
  requiredScopes: string[];
}

// Aligned to taylorwilsdon/google_workspace_mcp actual tool names.
// These are the names the MCP server returns. No aliases, no mapping.
const POLICY_VERSION = "workspace-v1.17.0";

const WORKER_POLICIES: Record<CapabilityWorkerType, WorkerToolPolicy> = {
  gmail: {
    workerType: "gmail",
    allowedTools: [
      "draft_gmail_message",
      "send_gmail_message",
      "get_gmail_thread_content",
    ],
    requiredScopes: [
      // We request gmail.modify in our OAuth flow (see googleAuth.ts).
      // gmail.modify is sufficient for drafting/sending and reading thread content.
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  },
  drive: {
    workerType: "drive",
    allowedTools: [
      "search_drive_files",
      "get_drive_file_content",
      "create_drive_file",
      "import_to_google_doc",
    ],
    requiredScopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  },
  docs: {
    workerType: "docs",
    allowedTools: [
      "create_doc",
      "modify_doc_text",
      "get_doc_content",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
  },
  sheets: {
    workerType: "sheets",
    allowedTools: [
      "create_spreadsheet",
      "read_sheet_values",
      "modify_sheet_values",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  slides: {
    workerType: "slides",
    allowedTools: [
      "create_presentation",
      "modify_presentation",
      "batch_update_presentation",
    ],
    requiredScopes: ["https://www.googleapis.com/auth/presentations"],
  },
  calendar: {
    workerType: "calendar",
    allowedTools: [
      "manage_event",
      "query_freebusy",
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
