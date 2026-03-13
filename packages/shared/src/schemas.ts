import { z } from "zod";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const TaskStatusSchema = z.enum([
  "queued",
  "processing",
  "done",
  "error",
  "escalation",
  "paused",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AgencyTierSchema = z.enum(["Public", "Controlled", "Restricted"]);
export type AgencyTier = z.infer<typeof AgencyTierSchema>;

export const AgencyPerimeterSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  topic_name: z.string(),
  tier: AgencyTierSchema.default("Restricted"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AgencyPerimeter = z.infer<typeof AgencyPerimeterSchema>;

export const UserRoleSchema = z.enum([
  "CEO",
  "PM",
  "Team Member",
  "Simple User",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  domain_action: z
    .string()
    .regex(
      /^[a-z]+\.[a-z]+$/,
      "Action must be in domain.action format (e.g., email.ingest)",
    ),
  topic: z.string().optional(),
  status: TaskStatusSchema.default("queued"),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const ChannelSchema = z.enum(["web", "telegram", "whatsapp"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const DeliveryStateSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "failed",
]);
export type DeliveryState = z.infer<typeof DeliveryStateSchema>;

export const CommandRoleSchema = z.enum(["user", "assistant", "system"]);
export type CommandRole = z.infer<typeof CommandRoleSchema>;

export const CommandMessageStateSchema = z.enum([
  "intent_preview",
  "queued",
  "processing",
  "done",
  "error",
  "escalation",
  "paused",
]);

export type CommandMessageState = z.infer<typeof CommandMessageStateSchema>;

export const CommandConversationSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  created_by: z.string().uuid().nullable().optional(),
  title: z.string().nullable().optional(),
  channel: ChannelSchema.default("web"),
  external_thread_id: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type CommandConversation = z.infer<typeof CommandConversationSchema>;

export const CommandMessageSchema = z.object({
  id: z.string().uuid().optional(),
  conversation_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  role: CommandRoleSchema,
  content: z.string().trim().min(1),
  state: CommandMessageStateSchema.optional(),
  source_task_id: z.string().uuid().nullable().optional(),
  channel: ChannelSchema.default("web"),
  correlation_id: z.string().optional(),
  thread_id: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type CommandMessage = z.infer<typeof CommandMessageSchema>;

export const NormalizedInboundEnvelopeSchema = z.object({
  channel: ChannelSchema,
  external_message_id: z.string().min(1),
  thread_id: z.string().min(1),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  domain_action: z
    .string()
    .regex(
      /^[a-z]+\.[a-z]+$/,
      "Action must be in domain.action format (e.g., thread.action)",
    )
    .default("thread.action"),
  topic: z.string().optional(),
  message_text: z.string().optional(),
  channel_metadata: z.record(z.unknown()).default({}),
  raw_payload: z.record(z.unknown()).default({}),
  correlation_id: z.string().optional(),
});

export type NormalizedInboundEnvelope = z.infer<
  typeof NormalizedInboundEnvelopeSchema
>;

export const OutboundChannelMessageSchema = z.object({
  channel: ChannelSchema,
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  task_id: z.string().uuid().optional(),
  external_message_id: z.string().min(1),
  thread_id: z.string().min(1),
  message_text: z.string().min(1),
  channel_metadata: z.record(z.unknown()).default({}),
  provider_payload: z.record(z.unknown()).optional(),
  correlation_id: z.string().optional(),
});

export type OutboundChannelMessage = z.infer<
  typeof OutboundChannelMessageSchema
>;

export const DeliveryEventEnvelopeSchema = z.object({
  channel: ChannelSchema,
  organization_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
  external_message_id: z.string().min(1),
  thread_id: z.string().min(1).optional(),
  provider_message_id: z.string().optional(),
  delivery_state: DeliveryStateSchema,
  occurred_at: z.string().optional(),
  attempt_count: z.number().int().nonnegative().default(1),
  terminal: z.boolean().default(false),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  channel_metadata: z.record(z.unknown()).default({}),
  raw_payload: z.record(z.unknown()).default({}),
  correlation_id: z.string().optional(),
});

export type DeliveryEventEnvelope = z.infer<typeof DeliveryEventEnvelopeSchema>;

export const DeliveryRetryDecisionSchema = z.object({
  should_retry: z.boolean(),
  next_delay_ms: z.number().int().nonnegative().nullable(),
  attempt_count: z.number().int().nonnegative(),
  terminal: z.boolean(),
  reason: z.string().optional(),
});

export type DeliveryRetryDecision = z.infer<typeof DeliveryRetryDecisionSchema>;

export const ReasoningStepSchema = z.object({
  timestamp: z.string(),
  step_name: z.string(),
  message: z.string(),
  confidence_score: z.number().min(0).max(1).optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  ambiguity_detected: z.boolean().optional(),
  escalation_trigger: z
    .enum([
      "low_confidence",
      "ambiguity_detected",
      "restricted_topic",
      "approval_guardrail",
    ])
    .optional(),
  input_summary: z.string().optional(),
  output_summary: z.string().optional(),
});

export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const ReasoningTraceSchema = z.array(ReasoningStepSchema);

export type ReasoningTrace = z.infer<typeof ReasoningTraceSchema>;

export const CitationSchema = z.object({
  source_type: z.string(),
  source_id: z.string(),
  link: z.string().url().optional().or(z.literal("")),
  description: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const EscalationTriggerSchema = z.enum([
  "low_confidence",
  "ambiguity_detected",
  "restricted_topic",
  "approval_guardrail",
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
  encrypted_creds: z.unknown(),
  sync_status: z.string(),
  label_preferences: z.array(z.string()).default([]),
  last_sync_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type WorkspaceIntegration = z.infer<typeof WorkspaceIntegrationSchema>;

export const ThreadSummarySchema = z.object({
  context: z.string().describe("High-level purpose of the thread."),
  decisions: z.array(z.string()).describe("Key updates or decisions made."),
  action_items: z
    .array(z.string())
    .describe("Specific tasks required from the user."),
});

export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const EmailTriageMatchSchema = z.object({
  topic: z.string(),
  reason: z.string(),
  priority_score: z.number().min(0).max(100),
});

export type EmailTriageMatch = z.infer<typeof EmailTriageMatchSchema>;

export const EmailTriageClassificationSchema = z.object({
  matches: z.array(EmailTriageMatchSchema),
  overall_priority_score: z.number().min(0).max(100),
  is_highlighted: z.boolean(),
});

export type EmailTriageClassification = z.infer<
  typeof EmailTriageClassificationSchema
>;

export const BatchedEmailTriageResultItemSchema = z.object({
  thread_id: z.string().min(1),
  classification: EmailTriageClassificationSchema,
});

export type BatchedEmailTriageResultItem = z.infer<
  typeof BatchedEmailTriageResultItemSchema
>;

export const BatchedEmailTriageResultSchema = z.array(
  BatchedEmailTriageResultItemSchema,
);

export type BatchedEmailTriageResult = z.infer<
  typeof BatchedEmailTriageResultSchema
>;

export const ThreadActionDecisionSchema = z
  .object({
    action: z.enum([
      "email.reply",
      "email.draft",
      "calendar.create",
      "escalate",
    ]),
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
    if (
      (value.action === "email.reply" || value.action === "email.draft") &&
      !value.email
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "email is required when action is email.reply or email.draft",
      });
    }
    if (value.action === "calendar.create" && !value.calendar) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "calendar is required when action is calendar.create",
      });
    }
    if (value.action === "escalate" && !value.escalation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "escalation is required when action is escalate",
      });
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
  metadata: z.record(z.unknown()),
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
  metadata: z.record(z.unknown()),
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
  priority: z.enum(["high", "medium", "low"]),
  topic: z.string(),
});

export type MorningBriefActionableItem = z.infer<
  typeof MorningBriefActionableItemSchema
>;

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

export const StatusReportPrioritySchema = z.enum(["high", "medium", "low"]);
export type StatusReportPriority = z.infer<typeof StatusReportPrioritySchema>;

export const StatusReportSectionItemSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  source_type: z.string().optional(),
  source_id: z.string().optional(),
});

export type StatusReportSectionItem = z.infer<
  typeof StatusReportSectionItemSchema
>;

export const StatusReportCriticalActionSchema = z.object({
  title: z.string().min(1),
  action_required: z.string().min(1),
  priority: StatusReportPrioritySchema,
  rationale: z.string().min(1),
  source_type: z.string().optional(),
  source_id: z.string().optional(),
});

export type StatusReportCriticalAction = z.infer<
  typeof StatusReportCriticalActionSchema
>;

export const StatusReportMetadataSchema = z
  .object({
    source_ids: z.array(z.string()).default([]),
    source_links: z.array(CitationSchema).default([]),
    generated_by: z.string().optional(),
    window_key: z.string().optional(),
  })
  .passthrough();

export type StatusReportMetadata = z.infer<typeof StatusReportMetadataSchema>;

export const StatusReportSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  source_task_id: z.string().uuid().nullable().optional(),
  report_period_start: z.string(),
  report_period_end: z.string(),
  idempotency_key: z.string().min(1),
  narrative: z.string().min(1),
  wins: z.array(StatusReportSectionItemSchema).default([]),
  blockers_risks: z.array(StatusReportSectionItemSchema).default([]),
  commitments: z.array(StatusReportSectionItemSchema).default([]),
  next_actions: z.array(StatusReportSectionItemSchema).default([]),
  critical_actions: z.array(StatusReportCriticalActionSchema).default([]),
  metadata: StatusReportMetadataSchema.default({
    source_ids: [],
    source_links: [],
  }),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type StatusReport = z.infer<typeof StatusReportSchema>;

export const StatusReportPayloadSchema = z.object({
  report_period_start: z.string().datetime().optional(),
  report_period_end: z.string().datetime().optional(),
  idempotency_key: z.string().trim().min(1).optional(),
  manual_trigger: z.boolean().optional(),
  force: z.boolean().optional(),
});

export type StatusReportPayload = z.infer<typeof StatusReportPayloadSchema>;

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

export type ProtocolGeneratePayload = z.infer<
  typeof ProtocolGeneratePayloadSchema
>;

export const ProtocolMetadataSchema = z.object({
  nudging_frequency_hours: z.number(),
  tone: z.string(),
  escalation_threshold: z.number(),
  preferred_channels: z.array(z.string()),
});

export type ProtocolMetadata = z.infer<typeof ProtocolMetadataSchema>;

export const ProtocolOptimizationSuggestionSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  source_task_id: z.string().uuid().optional(),
  nl_diff_summary: z.string().min(1),
  rationale: z.string().min(1),
  evidence_task_ids: z.array(z.string().uuid()).default([]),
  evidence_log_ids: z.array(z.string().uuid()).default([]),
  markdown_section: z.string().min(1),
  old_content: z.string().min(1),
  new_content: z.string().min(1),
  metadata_changes: z.record(JsonValueSchema).default({}),
  status: z
    .enum(["pending", "review", "approved", "declined", "applied"])
    .default("review"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProtocolOptimizationSuggestion = z.infer<
  typeof ProtocolOptimizationSuggestionSchema
>;

export const ProtocolOptimizationApprovalPayloadSchema = z.object({
  suggestion_id: z.string().uuid(),
  approved: z.boolean(),
  approved_by: z.string().uuid(),
  approved_at: z.string().datetime(),
  source_task_id: z.string().uuid().optional(),
  title: z.string().optional(),
  content_markdown: z.string().optional(),
  metadata: z.record(JsonValueSchema).optional(),
});

export type ProtocolOptimizationApprovalPayload = z.infer<
  typeof ProtocolOptimizationApprovalPayloadSchema
>;

export const ProtocolOptimizePayloadSchema = z.object({
  organization_id: z.string().uuid().optional(),
  trigger: z.enum(["manual", "scheduled"]).default("manual"),
  lookback_days: z.number().int().positive().max(90).default(14),
  min_friction_events: z.number().int().positive().max(20).default(3),
  source_task_id: z.string().uuid().optional(),
});

export type ProtocolOptimizePayload = z.infer<
  typeof ProtocolOptimizePayloadSchema
>;

export const ProjectSetupStatusSchema = z.enum(["incomplete", "complete"]);
export type ProjectSetupStatus = z.infer<typeof ProjectSetupStatusSchema>;

export const RelancingReasonCodeSchema = z.enum([
  "missing_required_fields",
  "deadline_urgency",
  "blocker_paused",
  "emergency_brake",
  "duplicate_prevented",
]);

export type RelancingReasonCode = z.infer<typeof RelancingReasonCodeSchema>;

export const ProjectSchedulingContextSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  project_name: z.string(),
  deadline: z.string().nullable().optional(),
  setup_status: ProjectSetupStatusSchema.default("incomplete"),
  scheduler_config: z.record(z.unknown()).default({}),
  next_nudge_at: z.string().nullable().optional(),
  last_nudge_at: z.string().nullable().optional(),
  blocker_active: z.boolean().default(false),
  blocker_summary: z.string().nullable().optional(),
  blocker_reported_by: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProjectSchedulingContext = z.infer<
  typeof ProjectSchedulingContextSchema
>;

export const ProjectMemberAssignmentSchema = z.object({
  id: z.string().uuid().optional(),
  project_context_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  member_user_id: z.string().uuid().nullable().optional(),
  member_name: z.string().min(1),
  is_active: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProjectMemberAssignment = z.infer<
  typeof ProjectMemberAssignmentSchema
>;

export const ProjectNudgeDispatchSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  project_context_id: z.string().uuid(),
  member_assignment_id: z.string().uuid(),
  nudge_window_start: z.string(),
  nudge_window_end: z.string(),
  task_id: z.string().uuid().nullable().optional(),
  reason_code: RelancingReasonCodeSchema,
  created_at: z.string().optional(),
});

export type ProjectNudgeDispatch = z.infer<typeof ProjectNudgeDispatchSchema>;

export const RelancingNudgePayloadSchema = z.object({
  project_context_id: z.string().uuid(),
  member_assignment_id: z.string().uuid(),
  project_name: z.string().min(1),
  member_name: z.string().min(1),
  member_user_id: z.string().uuid().nullable().optional(),
  deadline: z.string(),
  urgency_band: z.enum(["base", "urgent_7d", "urgent_3d", "overdue"]),
  cadence_hours: z.number().positive(),
  nudge_window_start: z.string(),
  nudge_window_end: z.string(),
  reason_code: RelancingReasonCodeSchema.default("deadline_urgency"),
  escalation_priority: z.enum(["normal", "high"]).default("normal"),
});

export type RelancingNudgePayload = z.infer<typeof RelancingNudgePayloadSchema>;

export const RelancingSetupInputSchema = z.object({
  project_name: z.string().trim().min(1),
  members: z.array(z.string().trim().min(1)).min(1),
  deadline: z.string().datetime(),
});

export type RelancingSetupInput = z.infer<typeof RelancingSetupInputSchema>;

export const RelancingUpdateIntentSchema = z.enum([
  "status_update",
  "blocker_report",
]);
export type RelancingUpdateIntent = z.infer<typeof RelancingUpdateIntentSchema>;

export const RelancingUpdateSchema = z
  .object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid(),
    project_context_id: z.string().uuid(),
    member_assignment_id: z.string().uuid(),
    source_task_id: z.string().uuid().nullable().optional(),
    source_user_id: z.string().uuid().nullable().optional(),

    channel: ChannelSchema,
    external_message_id: z.string().min(1).optional(),
    thread_id: z.string().min(1).optional(),
    correlation_id: z.string().min(1).optional(),
    idempotency_key: z.string().trim().min(1),

    message_text: z.string().min(1),
    intents: z.array(RelancingUpdateIntentSchema).min(1),

    progress_summary: z.string().optional(),
    blocker_summary: z.string().optional(),
    dependency: z.string().optional(),
    requested_help: z.string().optional(),
    eta_hint: z.string().optional(),

    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.external_message_id && !value.correlation_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Either external_message_id or correlation_id is required for relancing update idempotency",
        path: ["external_message_id"],
      });
    }
  });

export type RelancingUpdate = z.infer<typeof RelancingUpdateSchema>;

export const ProtocolGenerationResultSchema = z.object({
  markdown: z.string(),
  metadata: ProtocolMetadataSchema,
});

export type ProtocolGenerationResult = z.infer<
  typeof ProtocolGenerationResultSchema
>;

export const ProtocolOptimizationTaskResultSchema = z.object({
  summary: z.string().min(1),
  suggestion: ProtocolOptimizationSuggestionSchema.optional(),
  escalation: z.boolean().optional(),
  reason: z.string().optional(),
  prompt: z.string().optional(),
});

export type ProtocolOptimizationTaskResult = z.infer<
  typeof ProtocolOptimizationTaskResultSchema
>;

export const ContextReferenceSchema = z.object({
  url: z.string().url(),
  file_id: z.string(),
});
export type ContextReference = z.infer<typeof ContextReferenceSchema>;

export const WorkerTypeSchema = z.enum([
  "planner",
  "gmail",
  "drive",
  "docs",
  "sheets",
  "slides",
  "calendar",
]);
export type WorkerType = z.infer<typeof WorkerTypeSchema>;

export const ExecutionRunStatusSchema = z.enum([
  "planned",
  "processing",
  "completed",
  "failed",
  "escalated",
  "blocked",
]);
export type ExecutionRunStatus = z.infer<typeof ExecutionRunStatusSchema>;

export const ExecutionPlanStepStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "blocked",
  "skipped",
]);
export type ExecutionPlanStepStatus = z.infer<
  typeof ExecutionPlanStepStatusSchema
>;

export const CapabilityReadinessResultSchema = z.object({
  worker_type: WorkerTypeSchema,
  ready: z.boolean(),
  integration_active: z.boolean().default(false),
  policy_allowed: z.boolean().default(false),
  required_scopes: z.array(z.string()).default([]),
  missing_scopes: z.array(z.string()).default([]),
  requested_tools: z.array(z.string()).default([]),
  resolved_tools: z.array(z.string()).default([]),
  unavailable_tools: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});
export type CapabilityReadinessResult = z.infer<
  typeof CapabilityReadinessResultSchema
>;

export const AssistantCommandIntentStepSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  worker_type: WorkerTypeSchema,
  action: z.string().min(1),
  requested_tools: z.array(z.string()).default([]),
  input: z.record(JsonValueSchema).default({}),
  idempotency_key: z.string().trim().min(1).optional(),
  recoverable: z.boolean().default(false),
});
export type AssistantCommandIntentStep = z.infer<
  typeof AssistantCommandIntentStepSchema
>;

export const AssistantCommandIntentSchema = z.object({
  original_command: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  mode: z.enum(["single_step", "multi_step"]).default("single_step"),
  requested_steps: z.array(AssistantCommandIntentStepSchema).min(1),
  high_risk: z.boolean().default(false),
  confirmed: z.boolean().default(false),
  context_references: z.array(ContextReferenceSchema).default([]),
  conversation_id: z.string().optional(),
  source_message_id: z.string().optional(),
  correlation_id: z.string().optional(),
  conversation_context: z.unknown().optional(),
});
export type AssistantCommandIntent = z.infer<
  typeof AssistantCommandIntentSchema
>;

export const ExecutionLedgerEntrySchema = z.object({
  step_key: z.string().min(1),
  worker_type: WorkerTypeSchema,
  action: z.string().min(1),
  input_summary: z.string().min(1),
  outputs_summary: z.string().min(1),
  next_worker_note: z.string().min(1),
  attempt_number: z.number().int().positive(),
  timestamp: z.string(),
});
export type ExecutionLedgerEntry = z.infer<typeof ExecutionLedgerEntrySchema>;

export const ExecutionPlanStepSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  worker_type: WorkerTypeSchema,
  action: z.string().min(1),
  status: ExecutionPlanStepStatusSchema.default("pending"),
  requested_tools: z.array(z.string()).default([]),
  tool_name: z.string().optional(),
  input: z.record(JsonValueSchema).default({}),
  output: z.record(JsonValueSchema).default({}),
  handoff_note: z.string().nullable().optional(),
  attempt_count: z.number().int().nonnegative().default(0),
  idempotency_key: z.string().trim().min(1),
  recoverable: z.boolean().default(false),
  error_message: z.string().nullable().optional(),
  capability_readiness: CapabilityReadinessResultSchema.optional(),
});
export type ExecutionPlanStep = z.infer<typeof ExecutionPlanStepSchema>;

export const ExecutionPlanSchema = z.object({
  version: z.literal("v1").default("v1"),
  original_command: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  steps: z.array(ExecutionPlanStepSchema).min(1),
  ledger_entries: z.array(ExecutionLedgerEntrySchema).default([]),
  replan_count: z.number().int().nonnegative().default(0),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const IdempotencyEntrySchema = z.object({
  status: z.enum(["pending", "completed", "skipped"]).default("pending"),
  tool_name: z.string().optional(),
  output: z.record(JsonValueSchema).default({}),
  updated_at: z.string(),
});
export type IdempotencyEntry = z.infer<typeof IdempotencyEntrySchema>;

export const IdempotencyStateSchema = z
  .record(IdempotencyEntrySchema)
  .default({});
export type IdempotencyState = z.infer<typeof IdempotencyStateSchema>;

export const ExecutionRunSchema = z.object({
  id: z.string().uuid().optional(),
  task_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  status: ExecutionRunStatusSchema,
  plan_json: ExecutionPlanSchema,
  ledger_markdown: z.string(),
  current_step_key: z.string().nullable().optional(),
  current_worker_type: WorkerTypeSchema.nullable().optional(),
  tool_policy_version: z.string().trim().min(1),
  idempotency_state: IdempotencyStateSchema,
  version: z.number().int().nonnegative().default(1),
  last_error: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ExecutionRun = z.infer<typeof ExecutionRunSchema>;

export const WorkspaceContextItemSchema = z.object({
  content: z.string(),
  citation: CitationSchema,
});
export type WorkspaceContextItem = z.infer<typeof WorkspaceContextItemSchema>;
