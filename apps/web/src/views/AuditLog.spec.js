import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import AuditLog from "./AuditLog.vue";
import { supabase } from "../services/supabase";
import { createTestingPinia } from "@pinia/testing";
import PrimeVue from "primevue/config";
// Mock components to simplify test rendering and avoid PrimeVue component prop validation warnings
vi.mock("primevue/datatable", () => ({
    default: {
        template: '<div class="mock-datatable"><slot name="empty"></slot><slot name="loading"></slot><slot></slot></div>',
        props: [
            "value",
            "loading",
            "paginator",
            "rows",
            "totalRecords",
            "lazy",
            "filters",
            "filterDisplay",
            "dataKey",
            "stripedRows",
            "hoverableRows",
            "rowClass",
        ],
    },
}));
vi.mock("primevue/column", () => ({
    default: {
        template: '<div class="mock-column"><slot name="body" :data="mockData"></slot></div>',
        props: ["field", "header", "sortable", "alignFrozen"],
        data() {
            return {
                mockData: {
                    agent_id: "test",
                    action_taken: "test",
                    created_at: new Date().toISOString(),
                },
            };
        },
    },
}));
vi.mock("primevue/inputtext", () => ({
    default: { template: '<input class="mock-input" />' },
}));
vi.mock("primevue/button", () => ({
    default: { template: '<button class="mock-button"></button>' },
}));
vi.mock("primevue/badge", () => ({
    default: { template: '<span class="mock-badge"></span>' },
}));
vi.mock("primevue/tag", () => ({
    default: { template: '<span class="mock-tag"></span>' },
}));
vi.mock("../components/activity/ReasoningTracePane.vue", () => ({
    default: {
        template: '<div class="mock-trace-pane"></div>',
        props: ["visible", "taskId"],
    },
}));
// Mock Supabase
vi.mock("../services/supabase", () => {
    const mockRemoveChannel = vi.fn();
    const mockOn = vi.fn().mockReturnThis();
    const mockSubscribe = vi.fn().mockReturnThis();
    const mockChannel = vi.fn(() => ({
        on: mockOn,
        subscribe: mockSubscribe,
    }));
    return {
        supabase: {
            from: vi.fn(),
            channel: mockChannel,
            removeChannel: mockRemoveChannel,
        },
    };
});
// Mock ReasoningTrace composable
vi.mock("../composables/useReasoningTrace", () => ({
    useReasoningTrace: () => ({
        loading: false,
        error: null,
        traceLog: null,
        fetchTrace: vi.fn(),
    }),
}));
describe("AuditLog.vue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    const createComponent = () => {
        // Setup Supabase mock for the list fetch
        const mockOrder = vi.fn().mockReturnThis();
        const mockRange = vi.fn().mockResolvedValue({
            data: [
                {
                    id: "123",
                    agent_id: "agent-controller",
                    action_taken: "task_completed",
                    task_id: "test-task",
                    created_at: new Date().toISOString(),
                    reasoning_trace: [],
                    citations: [],
                },
            ],
            error: null,
            count: 1,
        });
        const mockEq = vi.fn().mockReturnThis();
        const mockIlike = vi.fn().mockReturnThis();
        const mockSelect = vi.fn().mockReturnValue({
            order: mockOrder,
            range: mockRange,
            eq: mockEq,
            ilike: mockIlike,
        });
        supabase.from.mockReturnValue({
            select: mockSelect,
        });
        return mount(AuditLog, {
            global: {
                plugins: [createTestingPinia(), PrimeVue],
            },
        });
    };
    it("renders the audit log table correctly", async () => {
        const wrapper = createComponent();
        // Wait for the initial fetch to complete
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(wrapper.find(".audit-log-container").exists()).toBe(true);
        expect(wrapper.text()).toContain("Audit Log");
        expect(supabase.from).toHaveBeenCalledWith("agent_activity_log");
    });
    it("cleans up realtime subscriptions on unmount", () => {
        const wrapper = createComponent();
        wrapper.unmount();
        expect(supabase.removeChannel).toHaveBeenCalled();
    });
});
//# sourceMappingURL=AuditLog.spec.js.map