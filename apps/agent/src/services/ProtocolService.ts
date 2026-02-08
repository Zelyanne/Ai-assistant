import { supabase } from './supabase.js';
import { LLMProviderFactory } from './llm/factory.js';
import { Task, ProtocolGenerationResultSchema, ProtocolGenerationResult } from '@ai-assistant/shared';

export class ProtocolService {
  /**
   * Fetches the protocol markdown for an organization.
   */
  static async fetchProtocol(organizationId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('user_protocols')
        .select('content_markdown')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        console.error(`[ProtocolService] Error fetching protocol for org ${organizationId}:`, error.message);
        return null;
      }

      return data?.content_markdown || null;
    } catch (err: any) {
      console.error(`[ProtocolService] Unexpected error fetching protocol: ${err.message}`);
      return null;
    }
  }

  /**
   * Extracts actionable rules from protocol markdown for a specific task using LLM.
   */
  static async extractRules(protocolMd: string, task: Task): Promise<string> {
    const provider = LLMProviderFactory.getProvider();
    
    const prompt = `
      You are an expert at extracting actionable rules from a natural language leadership protocol.
      
      Protocol:
      """
      ${protocolMd}
      """
      
      Current Task:
      Domain Action: ${task.domain_action}
      Payload: ${JSON.stringify(task.payload)}
      
      Instructions:
      1. Analyze the protocol above.
      2. Extract ONLY the rules, constraints, and guidelines that apply to the current task.
      3. Format the rules as a concise bulleted list.
      4. If the protocol explicitly mandates a specific agency tier for this context, you MUST include a line exactly like this: "Required Agency Tier: [Public/Controlled/Restricted]".
      5. If no specific rules apply, provide general professional guidelines consistent with the protocol.
      6. Include citations to the protocol sections if possible, e.g., [Source: Section Name].
      
      Actionable Rules:
    `;

    const response = await provider.generateText(prompt, { temperature: 0.1 });
    return response.data;
  }

  /**
   * Generates a structured protocol from a natural language philosophy description.
   */
  static async generateProtocol(philosophy: string): Promise<ProtocolGenerationResult> {
    const provider = LLMProviderFactory.getProvider();

    const prompt = `
      You are an expert at creating structured leadership protocols for AI agents.
      Convert the following natural language description of a leader's philosophy and leadership style into a comprehensive, structured Markdown protocol AND a machine-readable JSON metadata object.

      User Philosophy:
      """
      ${philosophy}
      """

      Instructions for Markdown:
      1. Create a well-structured Markdown document with clear headers.
      2. The protocol MUST include the following sections:
         - **Objectives**: Primary goals for the AI agent when acting on behalf of the user.
         - **Nudging Rules**: How and when the AI should nudge the user or team members.
         - **Agency Tier Overrides**: Explicit rules for when actions should be Public, Controlled, or Restricted.
         - **Escalation Logic**: Criteria for when the AI must stop and ask for human intervention.
      3. Use a professional, executive tone.

      Instructions for JSON Metadata:
      Extract the following parameters:
      - nudging_frequency_hours: An integer representing how often to nudge (e.g., 24).
      - tone: A string describing the agent's tone (e.g., "supportive").
      - escalation_threshold: A float between 0 and 1 representing confidence required.
      - preferred_channels: An array of strings (e.g., ["email", "slack"]).

      Your output must strictly follow the ProtocolGenerationResult schema.
    `;

    const response = await provider.generateStructured(prompt, ProtocolGenerationResultSchema);
    return response.data as ProtocolGenerationResult;
  }

  /**
   * Saves a protocol to the user_protocols table.
   */
  static async saveProtocol(organizationId: string, userId: string, title: string, contentMd: string, metadata: any): Promise<void> {
    const { error } = await supabase
      .from('user_protocols')
      .upsert({
        organization_id: organizationId,
        user_id: userId,
        title,
        content_markdown: contentMd,
        metadata: metadata,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id'
      });

    if (error) {
      throw new Error(`Failed to save protocol: ${error.message}`);
    }
  }
}
