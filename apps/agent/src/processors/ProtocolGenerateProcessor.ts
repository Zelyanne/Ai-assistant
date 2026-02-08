import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task, ProtocolGeneratePayloadSchema } from '@ai-assistant/shared';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { mcpService } from '../services/mcp.js';
import { AGENT_PROMPTS } from '../prompts/agentPrompts.js';

/**
 * Processor for generating a leadership protocol from natural language philosophy.
 * Refactored to use Multi-Turn Agentic Model (Task 7).
 */
export class ProtocolGenerateProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[ProtocolGenerateProcessor][${task.id}] Generating protocol (Agentic)...`);

    // 1. Validate payload
    const validation = ProtocolGeneratePayloadSchema.safeParse(task.payload);
    if (!validation.success) {
      throw new Error(`Invalid payload for protocol.generate: ${validation.error.message}`);
    }

    const { philosophy } = validation.data;
    const { organization_id } = task;

    const guard = new PerimeterGuard();
    
    // Fetch and wrap tools
    const rawTools = await mcpService.getLangChainTools(organization_id);
    const securedTools = rawTools.map(t => PerimeterGuard.wrapToolWithSecurity(t, guard));

    // 2. Run in multi-turn mode (Task 7)
    // Allows the agent to use tools to validate steps or refine the protocol
    const result = await this.runAgent(
      { ...task, payload: { philosophy } },
      AGENT_PROMPTS.PROTOCOL_GENERATE,
      securedTools,
      'multi-turn'
    );

    // 3. The agent output is expected to be the protocol markdown/metadata
    // For now we treat the main output as the markdown
    return {
      protocol_markdown: result.output,
      status: 'review_pending',
      message: 'Protocol generated successfully via multi-turn reasoning and is ready for review.',
      agent_trace: this.getTrace()
    };
  }
}
