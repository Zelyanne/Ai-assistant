export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agency_perimeters: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          tier: Database["public"]["Enums"]["agency_tier"]
          topic_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          tier?: Database["public"]["Enums"]["agency_tier"]
          topic_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          tier?: Database["public"]["Enums"]["agency_tier"]
          topic_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_perimeters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activity_log: {
        Row: {
          action_taken: string
          agent_id: string
          citations: Json
          created_at: string
          id: string
          organization_id: string
          reasoning_trace: Json
          task_id: string | null
        }
        Insert: {
          action_taken: string
          agent_id: string
          citations?: Json
          created_at?: string
          id?: string
          organization_id: string
          reasoning_trace?: Json
          task_id?: string | null
        }
        Update: {
          action_taken?: string
          agent_id?: string
          citations?: Json
          created_at?: string
          id?: string
          organization_id?: string
          reasoning_trace?: Json
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          description: string | null
          end_time: string | null
          external_id: string
          id: string
          location: string | null
          metadata: Json
          organization_id: string
          start_time: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          external_id: string
          id?: string
          location?: string | null
          metadata?: Json
          organization_id: string
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          external_id?: string
          id?: string
          location?: string | null
          metadata?: Json
          organization_id?: string
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      command_conversations: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          external_thread_id: string | null
          id: string
          metadata: Json
          organization_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      command_messages: {
        Row: {
          channel: string
          content: string
          conversation_id: string
          correlation_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          role: string
          source_task_id: string | null
          state: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          content: string
          conversation_id: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          role: string
          source_task_id?: string | null
          state?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          content?: string
          conversation_id?: string
          correlation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          role?: string
          source_task_id?: string | null
          state?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "command_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_messages_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_runs: {
        Row: {
          created_at: string
          current_step_key: string | null
          current_worker_type: string | null
          id: string
          idempotency_state: Json
          last_error: string | null
          ledger_markdown: string
          organization_id: string
          plan_json: Json
          status: string
          task_id: string
          tool_policy_version: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          current_step_key?: string | null
          current_worker_type?: string | null
          id?: string
          idempotency_state?: Json
          last_error?: string | null
          ledger_markdown?: string
          organization_id: string
          plan_json?: Json
          status?: string
          task_id: string
          tool_policy_version: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          current_step_key?: string | null
          current_worker_type?: string | null
          id?: string
          idempotency_state?: Json
          last_error?: string | null
          ledger_markdown?: string
          organization_id?: string
          plan_json?: Json
          status?: string
          task_id?: string
          tool_policy_version?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "execution_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_threads: {
        Row: {
          category: string | null
          classification: Json | null
          created_at: string
          external_id: string
          id: string
          is_highlighted: boolean | null
          metadata: Json
          organization_id: string
          priority_score: number | null
          subject: string | null
          summary: string | null
          summary_json: Json | null
          body: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          classification?: Json | null
          created_at?: string
          external_id: string
          id?: string
          is_highlighted?: boolean | null
          metadata?: Json
          organization_id: string
          priority_score?: number | null
          subject?: string | null
          summary?: string | null
          summary_json?: Json | null
          body?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          classification?: Json | null
          created_at?: string
          external_id?: string
          id?: string
          is_highlighted?: boolean | null
          metadata?: Json
          organization_id?: string
          priority_score?: number | null
          subject?: string | null
          summary?: string | null
          summary_json?: Json | null
          body?: string | null
          updated_at?: string
          user_id?: string | null
        }

        Relationships: [
          {
            foreignKeyName: "ingested_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingested_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_briefs: {
        Row: {
          brief_date: string
          content_json: Json
          created_at: string
          id: string
          is_read: boolean
          metadata: Json
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_date?: string
          content_json?: Json
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_date?: string
          content_json?: Json
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          organization_id?: string
          updated_at?: string
          user_id?: string
        }

        Relationships: [
          {
            foreignKeyName: "morning_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "morning_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      org_safety_controls: {
        Row: {
          emergency_brake_enabled: boolean
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          emergency_brake_enabled?: boolean
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          emergency_brake_enabled?: boolean
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_safety_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_safety_controls_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          last_brief_generated_at: string | null
          memory_file_paths: Json
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_brief_generated_at?: string | null
          memory_file_paths?: Json
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_brief_generated_at?: string | null
          memory_file_paths?: Json
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
        }

        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_member_assignments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          member_name: string
          member_user_id: string | null
          organization_id: string
          project_context_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_name: string
          member_user_id?: string | null
          organization_id: string
          project_context_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_name?: string
          member_user_id?: string | null
          organization_id?: string
          project_context_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_member_assignments_member_user_id_fkey"
            columns: ["member_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_member_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_member_assignments_project_context_id_fkey"
            columns: ["project_context_id"]
            isOneToOne: false
            referencedRelation: "project_scheduling_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_nudge_dispatches: {
        Row: {
          created_at: string
          id: string
          member_assignment_id: string
          nudge_window_end: string
          nudge_window_start: string
          organization_id: string
          project_context_id: string
          reason_code: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_assignment_id: string
          nudge_window_end: string
          nudge_window_start: string
          organization_id: string
          project_context_id: string
          reason_code: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_assignment_id?: string
          nudge_window_end?: string
          nudge_window_start?: string
          organization_id?: string
          project_context_id?: string
          reason_code?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_nudge_dispatches_member_assignment_id_fkey"
            columns: ["member_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_member_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_nudge_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_nudge_dispatches_project_context_id_fkey"
            columns: ["project_context_id"]
            isOneToOne: false
            referencedRelation: "project_scheduling_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_nudge_dispatches_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scheduling_contexts: {
        Row: {
          blocker_active: boolean
          blocker_reported_by: string | null
          blocker_summary: string | null
          created_at: string
          deadline: string | null
          id: string
          last_nudge_at: string | null
          next_nudge_at: string | null
          organization_id: string
          project_name: string
          scheduler_config: Json
          setup_status: Database["public"]["Enums"]["project_setup_status"]
          updated_at: string
        }
        Insert: {
          blocker_active?: boolean
          blocker_reported_by?: string | null
          blocker_summary?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          last_nudge_at?: string | null
          next_nudge_at?: string | null
          organization_id: string
          project_name?: string
          scheduler_config?: Json
          setup_status?: Database["public"]["Enums"]["project_setup_status"]
          updated_at?: string
        }
        Update: {
          blocker_active?: boolean
          blocker_reported_by?: string | null
          blocker_summary?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          last_nudge_at?: string | null
          next_nudge_at?: string | null
          organization_id?: string
          project_name?: string
          scheduler_config?: Json
          setup_status?: Database["public"]["Enums"]["project_setup_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_scheduling_contexts_blocker_reported_by_fkey"
            columns: ["blocker_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_scheduling_contexts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      relancing_update_events: {
        Row: {
          channel: string
          correlation_id: string | null
          event_type: string
          external_message_id: string | null
          id: string
          idempotency_key: string
          occurred_at: string
          organization_id: string
          raw_payload: Json
          relancing_update_id: string | null
          task_id: string | null
        }
        Insert: {
          channel: string
          correlation_id?: string | null
          event_type: string
          external_message_id?: string | null
          id?: string
          idempotency_key: string
          occurred_at?: string
          organization_id: string
          raw_payload?: Json
          relancing_update_id?: string | null
          task_id?: string | null
        }
        Update: {
          channel?: string
          correlation_id?: string | null
          event_type?: string
          external_message_id?: string | null
          id?: string
          idempotency_key?: string
          occurred_at?: string
          organization_id?: string
          raw_payload?: Json
          relancing_update_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relancing_update_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_update_events_relancing_update_id_fkey"
            columns: ["relancing_update_id"]
            isOneToOne: false
            referencedRelation: "relancing_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_update_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      relancing_updates: {
        Row: {
          blocker_summary: string | null
          channel: string
          correlation_id: string | null
          created_at: string
          dependency: string | null
          eta_hint: string | null
          external_message_id: string | null
          id: string
          idempotency_key: string
          intents: Database["public"]["Enums"]["relancing_update_intent"][]
          member_assignment_id: string
          message_text: string
          organization_id: string
          progress_summary: string | null
          project_context_id: string
          requested_help: string | null
          source_task_id: string | null
          source_user_id: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          blocker_summary?: string | null
          channel: string
          correlation_id?: string | null
          created_at?: string
          dependency?: string | null
          eta_hint?: string | null
          external_message_id?: string | null
          id?: string
          idempotency_key: string
          intents: Database["public"]["Enums"]["relancing_update_intent"][]
          member_assignment_id: string
          message_text: string
          organization_id: string
          progress_summary?: string | null
          project_context_id: string
          requested_help?: string | null
          source_task_id?: string | null
          source_user_id?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          blocker_summary?: string | null
          channel?: string
          correlation_id?: string | null
          created_at?: string
          dependency?: string | null
          eta_hint?: string | null
          external_message_id?: string | null
          id?: string
          idempotency_key?: string
          intents?: Database["public"]["Enums"]["relancing_update_intent"][]
          member_assignment_id?: string
          message_text?: string
          organization_id?: string
          progress_summary?: string | null
          project_context_id?: string
          requested_help?: string | null
          source_task_id?: string | null
          source_user_id?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relancing_updates_member_assignment_id_fkey"
            columns: ["member_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_member_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_updates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_updates_project_context_id_fkey"
            columns: ["project_context_id"]
            isOneToOne: false
            referencedRelation: "project_scheduling_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_updates_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relancing_updates_source_user_id_fkey"
            columns: ["source_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      status_reports: {
        Row: {
          blockers_risks: Json
          commitments: Json
          created_at: string
          critical_actions: Json
          id: string
          idempotency_key: string
          metadata: Json
          narrative: string
          next_actions: Json
          organization_id: string
          report_period_end: string
          report_period_start: string
          source_task_id: string | null
          updated_at: string
          wins: Json
        }
        Insert: {
          blockers_risks?: Json
          commitments?: Json
          created_at?: string
          critical_actions?: Json
          id?: string
          idempotency_key: string
          metadata?: Json
          narrative: string
          next_actions?: Json
          organization_id: string
          report_period_end: string
          report_period_start: string
          source_task_id?: string | null
          updated_at?: string
          wins?: Json
        }
        Update: {
          blockers_risks?: Json
          commitments?: Json
          created_at?: string
          critical_actions?: Json
          id?: string
          idempotency_key?: string
          metadata?: Json
          narrative?: string
          next_actions?: Json
          organization_id?: string
          report_period_end?: string
          report_period_start?: string
          source_task_id?: string | null
          updated_at?: string
          wins?: Json
        }
        Relationships: [
          {
            foreignKeyName: "status_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_reports_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          domain_action: string
          id: string
          organization_id: string
          payload: Json
          result: Json
          status: Database["public"]["Enums"]["task_status"]
          topic: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          domain_action: string
          id?: string
          organization_id: string
          payload?: Json
          result?: Json
          status?: Database["public"]["Enums"]["task_status"]
          topic?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          domain_action?: string
          id?: string
          organization_id?: string
          payload?: Json
          result?: Json
          status?: Database["public"]["Enums"]["task_status"]
          topic?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credentials: {
        Row: {
          access_token: string | null
          expires_at: string | null
          provider: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          provider: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          provider?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_protocols: {
        Row: {
          content_markdown: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_markdown: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_markdown?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_protocols_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_protocols_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_topics: {
        Row: {
          created_at: string
          id: string
          keywords_array: string[]
          organization_id: string
          topic_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keywords_array?: string[]
          organization_id: string
          topic_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keywords_array?: string[]
          organization_id?: string
          topic_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_topics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          created_at: string
          encrypted_creds: Json
          id: string
          label_preferences: Json
          last_sync_at: string | null
          organization_id: string
          provider: string
          sync_status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          encrypted_creds: Json
          id?: string
          label_preferences?: Json
          last_sync_at?: string | null
          organization_id: string
          provider: string
          sync_status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          encrypted_creds?: Json
          id?: string
          label_preferences?: Json
          last_sync_at?: string | null
          organization_id?: string
          provider?: string
          sync_status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_organization: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_principal_access: {
        Args: { item_user_id: string; org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      agency_tier: "Public" | "Controlled" | "Restricted"
      project_setup_status: "incomplete" | "complete"
      relancing_update_intent: "status_update" | "blocker_report"
      task_status: "queued" | "processing" | "done" | "error" | "escalation" | "paused"
      user_role: "CEO" | "PM" | "Team Member" | "Simple User"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agency_tier: ["Public", "Controlled", "Restricted"],
      project_setup_status: ["incomplete", "complete"],
      task_status: ["queued", "processing", "done", "error", "escalation", "paused"],
      user_role: ["CEO", "PM", "Team Member", "Simple User"],
    },
  },
} as const
