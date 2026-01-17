import { z } from 'zod';

export const TaskStatusSchema = z.enum(['queued', 'processing', 'done', 'error']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const UserRoleSchema = z.enum(['CEO', 'PM', 'Team Member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/, 'Action must be in domain.action format (e.g., email.ingest)'),
  status: TaskStatusSchema.default('queued'),
  payload: z.record(z.any()),
  result: z.record(z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const AgentActivityLogSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  agent_id: z.string(),
  action_taken: z.string(),
  reasoning_trace: z.record(z.any()),
  citations: z.array(z.any()),
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

export const IngestedThreadSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  external_id: z.string(),
  subject: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  priority_score: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
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
