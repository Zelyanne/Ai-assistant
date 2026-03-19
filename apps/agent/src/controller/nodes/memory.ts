import { AuditLogger } from "../../services/AuditLogger.js";
import { memoryService } from "../../services/MemoryService.js";
import type { AgentState } from "../graph.js";

export const loadMemoryNode = async (
  state: AgentState,
): Promise<Partial<AgentState>> => {
  if (state.error) {
    return {};
  }

  const { task } = state;

  if (!task.id) {
    return {
      trace: [
        AuditLogger.createStep(
          "Memory Loading",
          "Skipped personalized memory load because task.id is missing",
        ),
      ],
    };
  }

  if (!task.user_id) {
    return {
      trace: [
        AuditLogger.createStep(
          "Memory Loading",
          "Skipped personalized memory load because task.user_id is missing",
        ),
      ],
    };
  }

  console.log(
    `[Graph][${task.id}] Loading memory for org ${task.organization_id} user ${task.user_id}...`,
  );

  try {
    const taskState = await memoryService.updateTaskState(
      task.organization_id,
      task.user_id,
      task.id,
      {
        status: task.status,
        current_node: "load_memory",
        domain_action: task.domain_action,
      },
    );
    const snapshot = await memoryService.loadStartupMemoryContext(
      task.organization_id,
      task.user_id,
    );

    return {
      persona_memory: snapshot.persona,
      weekly_memory: snapshot.weekly_memory,
      long_term_memory: snapshot.long_term,
      memory_task_state: taskState,
      trace: [
        AuditLogger.createStep(
          "Memory Loading",
          "Loaded startup memory context",
          {
            input_summary: `persona=${snapshot.persona.length}, weekly=${snapshot.weekly_memory.length}, long_term=${snapshot.long_term.length}`,
          },
        ),
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Memory loading failed: ${message}`,
      trace: [
        AuditLogger.createStep("Memory Loading", `Failed: ${message}`),
      ],
    };
  }
};

export const loadShortTermMemoryNode = async (
  state: AgentState,
): Promise<Partial<AgentState>> => {
  if (state.error) {
    return {};
  }

  const { task } = state;

  if (!task.id || !task.user_id) {
    return {
      trace: [
        AuditLogger.createStep(
          "Short-Term Memory Loading",
          "Skipped short-term memory load because task identity is incomplete",
        ),
      ],
    };
  }

  try {
    const shortTermMemory = await memoryService.loadShortTermMemory(
      task.organization_id,
      task.user_id,
    );

    return {
      short_term_memory: shortTermMemory,
      trace: [
        AuditLogger.createStep(
          "Short-Term Memory Loading",
          "Loaded short-term memory after task initiation",
          {
            input_summary: `short_term=${shortTermMemory.length}`,
          },
        ),
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Short-term memory loading failed: ${message}`,
      trace: [
        AuditLogger.createStep(
          "Short-Term Memory Loading",
          `Failed: ${message}`,
        ),
      ],
    };
  }
};
