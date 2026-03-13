import type { WorkerType } from "@ai-assistant/shared";

export type CapabilityWorkerType = Exclude<WorkerType, "planner">;

export interface WorkerToolPolicy {
  workerType: CapabilityWorkerType;
  allowedTools: string[];
  requiredScopes: string[];
}

const POLICY_VERSION = "workspace-v1.14.2";

const WORKER_POLICIES: Record<CapabilityWorkerType, WorkerToolPolicy> = {
  gmail: {
    workerType: "gmail",
    allowedTools: ["draft_gmail_message", "create_gmail_draft", "send_gmail_message"],
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  },
  drive: {
    workerType: "drive",
    allowedTools: [
      "search_drive_files",
      "get_drive_file_content",
      "get_drive_shareable_link",
      "create_drive_file",
      "create_drive_folder",
      "import_to_google_doc",
      "update_drive_file",
    ],
    requiredScopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  },
  docs: {
    workerType: "docs",
    allowedTools: ["get_doc_content", "create_doc", "modify_doc_text"],
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
  },
  sheets: {
    workerType: "sheets",
    allowedTools: ["create_spreadsheet", "read_sheet_values", "modify_sheet_values"],
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  slides: {
    workerType: "slides",
    allowedTools: ["create_presentation", "modify_presentation"],
    requiredScopes: ["https://www.googleapis.com/auth/presentations"],
  },
  calendar: {
    workerType: "calendar",
    allowedTools: [
      "manage_event",
      "create_calendar_event",
      "patch_calendar_event",
      "update_calendar_event",
      "query_freebusy",
      "query_calendar_freebusy",
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
