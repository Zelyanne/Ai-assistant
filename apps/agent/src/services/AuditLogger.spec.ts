import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditLogger } from "./AuditLogger.js";
import { supabase } from "./supabase.js";

vi.mock("./supabase.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe("AuditLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("flush", () => {
    it("persists log correctly and unshifts a task citation", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      await AuditLogger.flush(
        "org-1",
        "task-1",
        "agent-controller",
        "task_completed",
        [{ step_name: "test", message: "test msg", timestamp: "2023-01-01" }],
        [],
      );

      expect(supabase.from).toHaveBeenCalledWith("agent_activity_log");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org-1",
          task_id: "task-1",
          agent_id: "agent-controller",
          action_taken: "task_completed",
          reasoning_trace: expect.any(Array),
          citations: expect.arrayContaining([
            expect.objectContaining({
              source_type: "task",
              source_id: "task-1",
            }),
          ]),
        }),
      );
    });

    it("works without a task id (background tasks)", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      await AuditLogger.flush(
        "org-1",
        null,
        "channel-router",
        "incoming_message",
        [],
        [],
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org-1",
          task_id: null,
          agent_id: "channel-router",
          action_taken: "incoming_message",
        }),
      );
    });
  });
});
