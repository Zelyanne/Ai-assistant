import { ChatMistralAI } from '@langchain/mistralai';
import { z } from 'zod';
import { config } from '../config/index.js';
import { tracingService } from '../services/llm/tracing.js';

export const SkillDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  content_markdown: z.string().min(1),
  tags: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});

export type SkillDraft = z.infer<typeof SkillDraftSchema>;

export interface SkillCreatorInput {
  commandText: string;
  existingName?: string;
}

export class SkillCreatorAgent {
  async createSkill(input: SkillCreatorInput): Promise<SkillDraft> {
    const langfuseHandler = tracingService.getHandler();
    const callbacks = langfuseHandler ? [langfuseHandler] : [];
    const llm = new ChatMistralAI({
      apiKey: config.MISTRAL_API_KEY,
      model: config.DEFAULT_LLM_MODEL,
      temperature: 0,
      callbacks,
    }).withStructuredOutput(SkillDraftSchema, {
      name: 'skill_draft',
    });

    const prompt = [
      'You convert user preferences into reusable assistant skills.',
      'Return only JSON matching the requested schema.',
      '',
      'Rules:',
      '- name must be a stable slug-like identifier (kebab-case, lowercase).',
      '- description must explain when to apply the skill.',
      '- content_markdown must include direct reusable instructions and one concise example.',
      '- tags should be broad labels (e.g., cover-letter, career, writing-style).',
      '- triggers should reflect retrieval terms a specialist might search for.',
      '- Keep the skill safe and practical; no secrets or personal data.',
      input.existingName
        ? `- Keep the skill name as: ${input.existingName.trim()}`
        : '- Infer a suitable skill name from the user instruction.',
      '',
      'User preference text:',
      input.commandText,
    ].join('\n');

    const response = await llm.invoke(prompt);
    tracingService.handleSuccess();
    await tracingService.flush();

    const parsed = SkillDraftSchema.parse(response);
    return {
      ...parsed,
      name: parsed.name.trim().toLowerCase(),
      description: parsed.description.trim(),
      content_markdown: parsed.content_markdown.trim(),
      tags: parsed.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      triggers: parsed.triggers
        .map((trigger) => trigger.trim().toLowerCase())
        .filter(Boolean),
      is_active: parsed.is_active ?? true,
    };
  }
}

export const skillCreatorAgent = new SkillCreatorAgent();
