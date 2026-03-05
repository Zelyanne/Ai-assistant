import { z } from 'zod';

export const TaskStatusSchema = z.enum(['queued', 'processing', 'done', 'error', 'escalation', 'paused']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgencyTierSchema = z.enum(['Public', 'Controlled', 'Restricted']);
export type AgencyTier = z.infer<typeof AgencyTierSchema>;

export const AgencyPerimeterSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  topic_name: z.string(),
  tier: AgencyTierSchema.default('Restricted'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AgencyPerimeter = z.infer<typeof AgencyPerimeterSchema>;

export const UserRoleSchema = z.enum(['CEO', 'PM', 'Team Member', 'Simple User']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/, 'Action must be in domain.action format (e.g., email.ingest)'),
  topic: z.string().optional(),
  status: TaskStatusSchema.default('queued'),
  payload: z.record(z.any()),
  result: z.record(z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const ReasoningStepSchema = z.object({
  timestamp: z.string(),
  step_name: z.string(),
  message: z.string(),
  confidence_score: z.number().min(0).max(1).optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  ambiguity_detected: z.boolean().optional(),
  escalation_trigger: z.enum(['low_confidence', 'ambiguity_detected', 'restricted_topic', 'approval_guardrail']).optional(),
  input_summary: z.string().optional(),
  output_summary: z.string().optional(),
});

export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const ReasoningTraceSchema = z.array(ReasoningStepSchema);

export type ReasoningTrace = z.infer<typeof ReasoningTraceSchema>;

export const CitationSchema = z.object({
  source_type: z.string(),
  source_id: z.string(),
  link: z.string().url().optional().or(z.literal('')),
  description: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const EscalationTriggerSchema = z.enum([
  'low_confidence',
  'ambiguity_detected',
  'restricted_topic',
  'approval_guardrail',
]);

export type EscalationTrigger = z.infer<typeof EscalationTriggerSchema>;

export const EscalationResultSchema = z
  .object({
    escalation: z.literal(true),
    reason: z.string(),
    prompt: z.string(),
    confidence_score: z.number().min(0).max(1).optional(),
    confidence_threshold: z.number().min(0).max(1).optional(),
    escalation_trigger: EscalationTriggerSchema.optional(),
  })
  .passthrough();

export type EscalationResult = z.infer<typeof EscalationResultSchema>;

export const AgentActivityLogSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  agent_id: z.string(),
  action_taken: z.string(),
  reasoning_trace: ReasoningTraceSchema,
  citations: z.array(CitationSchema),
  created_at: z.string().optional(),
});

export type AgentActivityLog = z.infer<typeof AgentActivityLogSchema>;


export const OrganizationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  created_at: z.string().optional(),
});

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  role: UserRoleSchema.nullable().optional(),
  updated_at: z.string().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const WorkspaceIntegrationSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  provider: z.string(),
  encrypted_creds: z.any(),
  sync_status: z.string(),
  label_preferences: z.array(z.string()).default([]),
  last_sync_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type WorkspaceIntegration = z.infer<typeof WorkspaceIntegrationSchema>;

export const ThreadSummarySchema = z.object({
  context: z.string().describe('High-level purpose of the thread.'),
  decisions: z.array(z.string()).describe('Key updates or decisions made.'),
  action_items: z.array(z.string()).describe('Specific tasks required from the user.'),
});

export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ThreadActionDecisionSchema = z
  .object({
    action: z.enum(['email.reply', 'email.draft', 'calendar.create', 'escalate']),
    confidence: z.number().min(0).max(1),
    ambiguity_detected: z.boolean().default(false),
    email: z
      .object({
        subject: z.string(),
        body: z.string(),
      })
      .optional(),
    calendar: z
      .object({
        summary: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
      })
      .optional(),
    escalation: z
      .object({
        reason: z.string(),
        prompt: z.string(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.action === 'email.reply' || value.action === 'email.draft') && !value.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'email is required when action is email.reply or email.draft' });
    }
    if (value.action === 'calendar.create' && !value.calendar) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'calendar is required when action is calendar.create' });
    }
    if (value.action === 'escalate' && !value.escalation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'escalation is required when action is escalate' });
    }
  });

export type ThreadActionDecision = z.infer<typeof ThreadActionDecisionSchema>;

export const IngestedThreadSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  external_id: z.string(),
  subject: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  priority_score: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  summary_json: ThreadSummarySchema.nullable().optional(),
  body: z.string().optional(),
  metadata: z.record(z.any()),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});


export type IngestedThread = z.infer<typeof IngestedThreadSchema>;

export const CalendarEventSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  external_id: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  metadata: z.record(z.any()),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;


export const UserCredentialsSchema = z.object({
  user_id: z.string().uuid(),
  provider: z.string(),
  access_token: z.string().nullable().optional(),
  refresh_token: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  updated_at: z.string().optional(),
});

export const WatchTopicSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  topic_name: z.string(),
  keywords_array: z.array(z.string()),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const TopicDeepDiveSchema = z.object({
  topic: z.string(),
  count: z.number(),
  summaries: z.array(z.string()),
});

export type TopicDeepDive = z.infer<typeof TopicDeepDiveSchema>;

export const MorningBriefActionableItemSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  action_required: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  topic: z.string(),
});

export type MorningBriefActionableItem = z.infer<typeof MorningBriefActionableItemSchema>;

export const MorningBriefMetadataSchema = z
  .object({
    source_ids: z.array(z.string()).optional(),
    actionable_items: z.array(MorningBriefActionableItemSchema).optional(),
  })
  .passthrough();

export type MorningBriefMetadata = z.infer<typeof MorningBriefMetadataSchema>;
 
export const MorningBriefSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  generated_at: z.string(),
  summary_text: z.string(),
  blockers: z.array(z.string()),
  risks: z.array(z.string()),
  topic_deep_dives: z.array(TopicDeepDiveSchema),
  metadata: MorningBriefMetadataSchema.optional(),
  is_read: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MorningBrief = z.infer<typeof MorningBriefSchema>;

export const UserProtocolSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  content_markdown: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type UserProtocol = z.infer<typeof UserProtocolSchema>;

export const ProtocolGeneratePayloadSchema = z.object({
  philosophy: z.string(),
});

export type ProtocolGeneratePayload = z.infer<typeof ProtocolGeneratePayloadSchema>;

export const ProtocolMetadataSchema = z.object({
  nudging_frequency_hours: z.number(),
  tone: z.string(),
  escalation_threshold: z.number(),
  preferred_channels: z.array(z.string()),
});

export type ProtocolMetadata = z.infer<typeof ProtocolMetadataSchema>;

export const ProtocolGenerationResultSchema = z.object({
  markdown: z.string(),
  metadata: ProtocolMetadataSchema,
});

export type ProtocolGenerationResult = z.infer<typeof ProtocolGenerationResultSchema>;
