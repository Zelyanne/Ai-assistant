import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReasoningTrace } from "./useReasoningTrace";
import { supabase } from "../services/supabase";

vi.mock("../services/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("useReasoningTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a trace correctly", async () => {
    const mockData = { id: "log-1", task_id: "task-1" };

    const mockMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: mockData, error: null });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const { traceLog, loading, error, fetchTrace } = useReasoningTrace();

    expect(loading.value).toBe(false);
    expect(traceLog.value).toBe(null);

    const promise = fetchTrace("task-1");
    expect(loading.value).toBe(true);

    await promise;

    expect(loading.value).toBe(false);
    expect(error.value).toBe(null);
    expect(traceLog.value).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith("agent_activity_log");
    expect(mockMaybeSingle).toHaveBeenCalled();
  });

  it("handles empty results gracefully without throwing", async () => {
    const mockMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as any).mockReturnValue({ select: mockSelect });

    const { traceLog, error, fetchTrace } = useReasoningTrace();
    await fetchTrace("task-nonexistent");

    expect(error.value).toBe(null);
    expect(traceLog.value).toBe(null);
  });
});
