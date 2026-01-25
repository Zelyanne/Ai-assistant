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

export const UserRoleSchema = z.enum(['CEO', 'PM', 'Team Member']);
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
  ambiguity_detected: z.boolean().optional(),
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

export const MorningBriefSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid(),
  brief_date: z.string(),
  content_json: z.record(z.any()),
  is_read: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

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

