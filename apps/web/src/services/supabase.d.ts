import type { Database } from '@ai-assistant/shared';
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<Database, "public", "public", {
    Tables: {
        agency_perimeters: {
            Row: {
                created_at: string;
                id: string;
                organization_id: string;
                tier: Database["public"]["Enums"]["agency_tier"];
                topic_name: string;
                updated_at: string;
            };
            Insert: {
                created_at?: string;
                id?: string;
                organization_id: string;
                tier?: Database["public"]["Enums"]["agency_tier"];
                topic_name: string;
                updated_at?: string;
            };
            Update: {
                created_at?: string;
                id?: string;
                organization_id?: string;
                tier?: Database["public"]["Enums"]["agency_tier"];
                topic_name?: string;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "agency_perimeters_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }];
        };
        agent_activity_log: {
            Row: {
                action_taken: string;
                agent_id: string;
                citations: import("@ai-assistant/shared").Json;
                created_at: string;
                id: string;
                organization_id: string;
                reasoning_trace: import("@ai-assistant/shared").Json;
                task_id: string | null;
            };
            Insert: {
                action_taken: string;
                agent_id: string;
                citations?: import("@ai-assistant/shared").Json;
                created_at?: string;
                id?: string;
                organization_id: string;
                reasoning_trace?: import("@ai-assistant/shared").Json;
                task_id?: string | null;
            };
            Update: {
                action_taken?: string;
                agent_id?: string;
                citations?: import("@ai-assistant/shared").Json;
                created_at?: string;
                id?: string;
                organization_id?: string;
                reasoning_trace?: import("@ai-assistant/shared").Json;
                task_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "agent_activity_log_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "agent_activity_log_task_id_fkey";
                columns: ["task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        calendar_events: {
            Row: {
                created_at: string;
                description: string | null;
                end_time: string | null;
                external_id: string;
                id: string;
                location: string | null;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                start_time: string | null;
                title: string | null;
                updated_at: string;
                user_id: string | null;
            };
            Insert: {
                created_at?: string;
                description?: string | null;
                end_time?: string | null;
                external_id: string;
                id?: string;
                location?: string | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                start_time?: string | null;
                title?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Update: {
                created_at?: string;
                description?: string | null;
                end_time?: string | null;
                external_id?: string;
                id?: string;
                location?: string | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                start_time?: string | null;
                title?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "calendar_events_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "calendar_events_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        command_conversations: {
            Row: {
                channel: string;
                created_at: string;
                created_by: string | null;
                external_thread_id: string | null;
                id: string;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                title: string | null;
                updated_at: string;
            };
            Insert: {
                channel?: string;
                created_at?: string;
                created_by?: string | null;
                external_thread_id?: string | null;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                title?: string | null;
                updated_at?: string;
            };
            Update: {
                channel?: string;
                created_at?: string;
                created_by?: string | null;
                external_thread_id?: string | null;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                title?: string | null;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "command_conversations_created_by_fkey";
                columns: ["created_by"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "command_conversations_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }];
        };
        command_messages: {
            Row: {
                channel: string;
                content: string;
                conversation_id: string;
                correlation_id: string | null;
                created_at: string;
                id: string;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                role: string;
                source_task_id: string | null;
                state: string | null;
                thread_id: string | null;
                updated_at: string;
            };
            Insert: {
                channel?: string;
                content: string;
                conversation_id: string;
                correlation_id?: string | null;
                created_at?: string;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                role: string;
                source_task_id?: string | null;
                state?: string | null;
                thread_id?: string | null;
                updated_at?: string;
            };
            Update: {
                channel?: string;
                content?: string;
                conversation_id?: string;
                correlation_id?: string | null;
                created_at?: string;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                role?: string;
                source_task_id?: string | null;
                state?: string | null;
                thread_id?: string | null;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "command_messages_conversation_id_fkey";
                columns: ["conversation_id"];
                isOneToOne: false;
                referencedRelation: "command_conversations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "command_messages_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "command_messages_source_task_id_fkey";
                columns: ["source_task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        messaging_channel_links: {
            Row: {
                channel: string;
                created_at: string;
                display_name: string | null;
                external_thread_id: string | null;
                external_user_id: string | null;
                id: string;
                last_seen_at: string | null;
                link_token_expires_at: string | null;
                link_token_hash: string | null;
                linked_at: string | null;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                status: string;
                updated_at: string;
                user_id: string;
                username: string | null;
            };
            Insert: {
                channel: string;
                created_at?: string;
                display_name?: string | null;
                external_thread_id?: string | null;
                external_user_id?: string | null;
                id?: string;
                last_seen_at?: string | null;
                link_token_expires_at?: string | null;
                link_token_hash?: string | null;
                linked_at?: string | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                status?: string;
                updated_at?: string;
                user_id: string;
                username?: string | null;
            };
            Update: {
                channel?: string;
                created_at?: string;
                display_name?: string | null;
                external_thread_id?: string | null;
                external_user_id?: string | null;
                id?: string;
                last_seen_at?: string | null;
                link_token_expires_at?: string | null;
                link_token_hash?: string | null;
                linked_at?: string | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                status?: string;
                updated_at?: string;
                user_id?: string;
                username?: string | null;
            };
            Relationships: [{
                foreignKeyName: "messaging_channel_links_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "messaging_channel_links_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        execution_runs: {
            Row: {
                created_at: string;
                current_step_key: string | null;
                current_worker_type: string | null;
                id: string;
                idempotency_state: import("@ai-assistant/shared").Json;
                last_error: string | null;
                ledger_markdown: string;
                organization_id: string;
                plan_json: import("@ai-assistant/shared").Json;
                status: string;
                task_id: string;
                tool_policy_version: string;
                updated_at: string;
                version: number;
            };
            Insert: {
                created_at?: string;
                current_step_key?: string | null;
                current_worker_type?: string | null;
                id?: string;
                idempotency_state?: import("@ai-assistant/shared").Json;
                last_error?: string | null;
                ledger_markdown?: string;
                organization_id: string;
                plan_json?: import("@ai-assistant/shared").Json;
                status?: string;
                task_id: string;
                tool_policy_version: string;
                updated_at?: string;
                version?: number;
            };
            Update: {
                created_at?: string;
                current_step_key?: string | null;
                current_worker_type?: string | null;
                id?: string;
                idempotency_state?: import("@ai-assistant/shared").Json;
                last_error?: string | null;
                ledger_markdown?: string;
                organization_id?: string;
                plan_json?: import("@ai-assistant/shared").Json;
                status?: string;
                task_id?: string;
                tool_policy_version?: string;
                updated_at?: string;
                version?: number;
            };
            Relationships: [{
                foreignKeyName: "execution_runs_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "execution_runs_task_id_fkey";
                columns: ["task_id"];
                isOneToOne: true;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        ingested_threads: {
            Row: {
                category: string | null;
                classification: import("@ai-assistant/shared").Json | null;
                created_at: string;
                external_id: string;
                id: string;
                is_highlighted: boolean | null;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                priority_score: number | null;
                subject: string | null;
                summary: string | null;
                summary_json: import("@ai-assistant/shared").Json | null;
                body: string | null;
                updated_at: string;
                user_id: string | null;
            };
            Insert: {
                category?: string | null;
                classification?: import("@ai-assistant/shared").Json | null;
                created_at?: string;
                external_id: string;
                id?: string;
                is_highlighted?: boolean | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                priority_score?: number | null;
                subject?: string | null;
                summary?: string | null;
                summary_json?: import("@ai-assistant/shared").Json | null;
                body?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Update: {
                category?: string | null;
                classification?: import("@ai-assistant/shared").Json | null;
                created_at?: string;
                external_id?: string;
                id?: string;
                is_highlighted?: boolean | null;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                priority_score?: number | null;
                subject?: string | null;
                summary?: string | null;
                summary_json?: import("@ai-assistant/shared").Json | null;
                body?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "ingested_threads_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "ingested_threads_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        morning_briefs: {
            Row: {
                brief_date: string;
                content_json: import("@ai-assistant/shared").Json;
                created_at: string;
                id: string;
                is_read: boolean;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                brief_date?: string;
                content_json?: import("@ai-assistant/shared").Json;
                created_at?: string;
                id?: string;
                is_read?: boolean;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                brief_date?: string;
                content_json?: import("@ai-assistant/shared").Json;
                created_at?: string;
                id?: string;
                is_read?: boolean;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "morning_briefs_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "morning_briefs_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        organizations: {
            Row: {
                created_at: string;
                id: string;
                name: string;
            };
            Insert: {
                created_at?: string;
                id?: string;
                name: string;
            };
            Update: {
                created_at?: string;
                id?: string;
                name?: string;
            };
            Relationships: [];
        };
        org_safety_controls: {
            Row: {
                emergency_brake_enabled: boolean;
                organization_id: string;
                updated_at: string;
                updated_by: string | null;
            };
            Insert: {
                emergency_brake_enabled?: boolean;
                organization_id: string;
                updated_at?: string;
                updated_by?: string | null;
            };
            Update: {
                emergency_brake_enabled?: boolean;
                organization_id?: string;
                updated_at?: string;
                updated_by?: string | null;
            };
            Relationships: [{
                foreignKeyName: "org_safety_controls_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: true;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "org_safety_controls_updated_by_fkey";
                columns: ["updated_by"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        profiles: {
            Row: {
                avatar_url: string | null;
                email: string | null;
                full_name: string | null;
                id: string;
                last_brief_generated_at: string | null;
                memory_file_paths: import("@ai-assistant/shared").Json;
                organization_id: string | null;
                role: Database["public"]["Enums"]["user_role"] | null;
                updated_at: string;
            };
            Insert: {
                avatar_url?: string | null;
                email?: string | null;
                full_name?: string | null;
                id: string;
                last_brief_generated_at?: string | null;
                memory_file_paths?: import("@ai-assistant/shared").Json;
                organization_id?: string | null;
                role?: Database["public"]["Enums"]["user_role"] | null;
                updated_at?: string;
            };
            Update: {
                avatar_url?: string | null;
                email?: string | null;
                full_name?: string | null;
                id?: string;
                last_brief_generated_at?: string | null;
                memory_file_paths?: import("@ai-assistant/shared").Json;
                organization_id?: string | null;
                role?: Database["public"]["Enums"]["user_role"] | null;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "profiles_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }];
        };
        project_member_assignments: {
            Row: {
                created_at: string;
                id: string;
                is_active: boolean;
                member_name: string;
                member_user_id: string | null;
                organization_id: string;
                project_context_id: string;
                updated_at: string;
            };
            Insert: {
                created_at?: string;
                id?: string;
                is_active?: boolean;
                member_name: string;
                member_user_id?: string | null;
                organization_id: string;
                project_context_id: string;
                updated_at?: string;
            };
            Update: {
                created_at?: string;
                id?: string;
                is_active?: boolean;
                member_name?: string;
                member_user_id?: string | null;
                organization_id?: string;
                project_context_id?: string;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "project_member_assignments_member_user_id_fkey";
                columns: ["member_user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_member_assignments_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_member_assignments_project_context_id_fkey";
                columns: ["project_context_id"];
                isOneToOne: false;
                referencedRelation: "project_scheduling_contexts";
                referencedColumns: ["id"];
            }];
        };
        project_nudge_dispatches: {
            Row: {
                created_at: string;
                id: string;
                member_assignment_id: string;
                nudge_window_end: string;
                nudge_window_start: string;
                organization_id: string;
                project_context_id: string;
                reason_code: string;
                task_id: string | null;
            };
            Insert: {
                created_at?: string;
                id?: string;
                member_assignment_id: string;
                nudge_window_end: string;
                nudge_window_start: string;
                organization_id: string;
                project_context_id: string;
                reason_code: string;
                task_id?: string | null;
            };
            Update: {
                created_at?: string;
                id?: string;
                member_assignment_id?: string;
                nudge_window_end?: string;
                nudge_window_start?: string;
                organization_id?: string;
                project_context_id?: string;
                reason_code?: string;
                task_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "project_nudge_dispatches_member_assignment_id_fkey";
                columns: ["member_assignment_id"];
                isOneToOne: false;
                referencedRelation: "project_member_assignments";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_nudge_dispatches_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_nudge_dispatches_project_context_id_fkey";
                columns: ["project_context_id"];
                isOneToOne: false;
                referencedRelation: "project_scheduling_contexts";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_nudge_dispatches_task_id_fkey";
                columns: ["task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        project_scheduling_contexts: {
            Row: {
                blocker_active: boolean;
                blocker_reported_by: string | null;
                blocker_summary: string | null;
                created_at: string;
                deadline: string | null;
                id: string;
                last_nudge_at: string | null;
                next_nudge_at: string | null;
                organization_id: string;
                project_name: string;
                scheduler_config: import("@ai-assistant/shared").Json;
                setup_status: Database["public"]["Enums"]["project_setup_status"];
                updated_at: string;
            };
            Insert: {
                blocker_active?: boolean;
                blocker_reported_by?: string | null;
                blocker_summary?: string | null;
                created_at?: string;
                deadline?: string | null;
                id?: string;
                last_nudge_at?: string | null;
                next_nudge_at?: string | null;
                organization_id: string;
                project_name?: string;
                scheduler_config?: import("@ai-assistant/shared").Json;
                setup_status?: Database["public"]["Enums"]["project_setup_status"];
                updated_at?: string;
            };
            Update: {
                blocker_active?: boolean;
                blocker_reported_by?: string | null;
                blocker_summary?: string | null;
                created_at?: string;
                deadline?: string | null;
                id?: string;
                last_nudge_at?: string | null;
                next_nudge_at?: string | null;
                organization_id?: string;
                project_name?: string;
                scheduler_config?: import("@ai-assistant/shared").Json;
                setup_status?: Database["public"]["Enums"]["project_setup_status"];
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "project_scheduling_contexts_blocker_reported_by_fkey";
                columns: ["blocker_reported_by"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "project_scheduling_contexts_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }];
        };
        relancing_update_events: {
            Row: {
                channel: string;
                correlation_id: string | null;
                event_type: string;
                external_message_id: string | null;
                id: string;
                idempotency_key: string;
                occurred_at: string;
                organization_id: string;
                raw_payload: import("@ai-assistant/shared").Json;
                relancing_update_id: string | null;
                task_id: string | null;
            };
            Insert: {
                channel: string;
                correlation_id?: string | null;
                event_type: string;
                external_message_id?: string | null;
                id?: string;
                idempotency_key: string;
                occurred_at?: string;
                organization_id: string;
                raw_payload?: import("@ai-assistant/shared").Json;
                relancing_update_id?: string | null;
                task_id?: string | null;
            };
            Update: {
                channel?: string;
                correlation_id?: string | null;
                event_type?: string;
                external_message_id?: string | null;
                id?: string;
                idempotency_key?: string;
                occurred_at?: string;
                organization_id?: string;
                raw_payload?: import("@ai-assistant/shared").Json;
                relancing_update_id?: string | null;
                task_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "relancing_update_events_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_update_events_relancing_update_id_fkey";
                columns: ["relancing_update_id"];
                isOneToOne: false;
                referencedRelation: "relancing_updates";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_update_events_task_id_fkey";
                columns: ["task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        relancing_updates: {
            Row: {
                blocker_summary: string | null;
                channel: string;
                correlation_id: string | null;
                created_at: string;
                dependency: string | null;
                eta_hint: string | null;
                external_message_id: string | null;
                id: string;
                idempotency_key: string;
                intents: Database["public"]["Enums"]["relancing_update_intent"][];
                member_assignment_id: string;
                message_text: string;
                organization_id: string;
                progress_summary: string | null;
                project_context_id: string;
                requested_help: string | null;
                source_task_id: string | null;
                source_user_id: string | null;
                thread_id: string | null;
                updated_at: string;
            };
            Insert: {
                blocker_summary?: string | null;
                channel: string;
                correlation_id?: string | null;
                created_at?: string;
                dependency?: string | null;
                eta_hint?: string | null;
                external_message_id?: string | null;
                id?: string;
                idempotency_key: string;
                intents: Database["public"]["Enums"]["relancing_update_intent"][];
                member_assignment_id: string;
                message_text: string;
                organization_id: string;
                progress_summary?: string | null;
                project_context_id: string;
                requested_help?: string | null;
                source_task_id?: string | null;
                source_user_id?: string | null;
                thread_id?: string | null;
                updated_at?: string;
            };
            Update: {
                blocker_summary?: string | null;
                channel?: string;
                correlation_id?: string | null;
                created_at?: string;
                dependency?: string | null;
                eta_hint?: string | null;
                external_message_id?: string | null;
                id?: string;
                idempotency_key?: string;
                intents?: Database["public"]["Enums"]["relancing_update_intent"][];
                member_assignment_id?: string;
                message_text?: string;
                organization_id?: string;
                progress_summary?: string | null;
                project_context_id?: string;
                requested_help?: string | null;
                source_task_id?: string | null;
                source_user_id?: string | null;
                thread_id?: string | null;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "relancing_updates_member_assignment_id_fkey";
                columns: ["member_assignment_id"];
                isOneToOne: false;
                referencedRelation: "project_member_assignments";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_updates_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_updates_project_context_id_fkey";
                columns: ["project_context_id"];
                isOneToOne: false;
                referencedRelation: "project_scheduling_contexts";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_updates_source_task_id_fkey";
                columns: ["source_task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "relancing_updates_source_user_id_fkey";
                columns: ["source_user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        status_reports: {
            Row: {
                blockers_risks: import("@ai-assistant/shared").Json;
                commitments: import("@ai-assistant/shared").Json;
                created_at: string;
                critical_actions: import("@ai-assistant/shared").Json;
                id: string;
                idempotency_key: string;
                metadata: import("@ai-assistant/shared").Json;
                narrative: string;
                next_actions: import("@ai-assistant/shared").Json;
                organization_id: string;
                report_period_end: string;
                report_period_start: string;
                source_task_id: string | null;
                updated_at: string;
                wins: import("@ai-assistant/shared").Json;
            };
            Insert: {
                blockers_risks?: import("@ai-assistant/shared").Json;
                commitments?: import("@ai-assistant/shared").Json;
                created_at?: string;
                critical_actions?: import("@ai-assistant/shared").Json;
                id?: string;
                idempotency_key: string;
                metadata?: import("@ai-assistant/shared").Json;
                narrative: string;
                next_actions?: import("@ai-assistant/shared").Json;
                organization_id: string;
                report_period_end: string;
                report_period_start: string;
                source_task_id?: string | null;
                updated_at?: string;
                wins?: import("@ai-assistant/shared").Json;
            };
            Update: {
                blockers_risks?: import("@ai-assistant/shared").Json;
                commitments?: import("@ai-assistant/shared").Json;
                created_at?: string;
                critical_actions?: import("@ai-assistant/shared").Json;
                id?: string;
                idempotency_key?: string;
                metadata?: import("@ai-assistant/shared").Json;
                narrative?: string;
                next_actions?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                report_period_end?: string;
                report_period_start?: string;
                source_task_id?: string | null;
                updated_at?: string;
                wins?: import("@ai-assistant/shared").Json;
            };
            Relationships: [{
                foreignKeyName: "status_reports_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "status_reports_source_task_id_fkey";
                columns: ["source_task_id"];
                isOneToOne: false;
                referencedRelation: "tasks";
                referencedColumns: ["id"];
            }];
        };
        tasks: {
            Row: {
                created_at: string;
                domain_action: string;
                id: string;
                organization_id: string;
                payload: import("@ai-assistant/shared").Json;
                result: import("@ai-assistant/shared").Json;
                status: Database["public"]["Enums"]["task_status"];
                topic: string | null;
                updated_at: string;
                user_id: string | null;
            };
            Insert: {
                created_at?: string;
                domain_action: string;
                id?: string;
                organization_id: string;
                payload?: import("@ai-assistant/shared").Json;
                result?: import("@ai-assistant/shared").Json;
                status?: Database["public"]["Enums"]["task_status"];
                topic?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Update: {
                created_at?: string;
                domain_action?: string;
                id?: string;
                organization_id?: string;
                payload?: import("@ai-assistant/shared").Json;
                result?: import("@ai-assistant/shared").Json;
                status?: Database["public"]["Enums"]["task_status"];
                topic?: string | null;
                updated_at?: string;
                user_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "tasks_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "tasks_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        user_credentials: {
            Row: {
                access_token: string | null;
                expires_at: string | null;
                provider: string;
                refresh_token: string | null;
                updated_at: string | null;
                user_id: string;
            };
            Insert: {
                access_token?: string | null;
                expires_at?: string | null;
                provider: string;
                refresh_token?: string | null;
                updated_at?: string | null;
                user_id: string;
            };
            Update: {
                access_token?: string | null;
                expires_at?: string | null;
                provider?: string;
                refresh_token?: string | null;
                updated_at?: string | null;
                user_id?: string;
            };
            Relationships: [];
        };
        user_protocols: {
            Row: {
                content_markdown: string;
                created_at: string;
                id: string;
                metadata: import("@ai-assistant/shared").Json;
                organization_id: string;
                title: string;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                content_markdown: string;
                created_at?: string;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id: string;
                title: string;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                content_markdown?: string;
                created_at?: string;
                id?: string;
                metadata?: import("@ai-assistant/shared").Json;
                organization_id?: string;
                title?: string;
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "user_protocols_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "user_protocols_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        user_skills: {
            Row: {
                content_markdown: string;
                created_at: string;
                description: string | null;
                id: string;
                is_active: boolean;
                name: string;
                organization_id: string;
                tags: string[];
                triggers: string[];
                updated_at: string;
                user_id: string;
            };
            Insert: {
                content_markdown: string;
                created_at?: string;
                description?: string | null;
                id?: string;
                is_active?: boolean;
                name: string;
                organization_id: string;
                tags?: string[];
                triggers?: string[];
                updated_at?: string;
                user_id: string;
            };
            Update: {
                content_markdown?: string;
                created_at?: string;
                description?: string | null;
                id?: string;
                is_active?: boolean;
                name?: string;
                organization_id?: string;
                tags?: string[];
                triggers?: string[];
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "user_skills_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "user_skills_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
        watch_topics: {
            Row: {
                created_at: string;
                id: string;
                keywords_array: string[];
                organization_id: string;
                topic_name: string;
                updated_at: string;
            };
            Insert: {
                created_at?: string;
                id?: string;
                keywords_array?: string[];
                organization_id: string;
                topic_name: string;
                updated_at?: string;
            };
            Update: {
                created_at?: string;
                id?: string;
                keywords_array?: string[];
                organization_id?: string;
                topic_name?: string;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "watch_topics_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }];
        };
        workspace_integrations: {
            Row: {
                created_at: string;
                encrypted_creds: import("@ai-assistant/shared").Json;
                id: string;
                label_preferences: import("@ai-assistant/shared").Json;
                last_sync_at: string | null;
                organization_id: string;
                provider: string;
                sync_status: string;
                updated_at: string;
                user_id: string | null;
            };
            Insert: {
                created_at?: string;
                encrypted_creds: import("@ai-assistant/shared").Json;
                id?: string;
                label_preferences?: import("@ai-assistant/shared").Json;
                last_sync_at?: string | null;
                organization_id: string;
                provider: string;
                sync_status?: string;
                updated_at?: string;
                user_id?: string | null;
            };
            Update: {
                created_at?: string;
                encrypted_creds?: import("@ai-assistant/shared").Json;
                id?: string;
                label_preferences?: import("@ai-assistant/shared").Json;
                last_sync_at?: string | null;
                organization_id?: string;
                provider?: string;
                sync_status?: string;
                updated_at?: string;
                user_id?: string | null;
            };
            Relationships: [{
                foreignKeyName: "workspace_integrations_organization_id_fkey";
                columns: ["organization_id"];
                isOneToOne: false;
                referencedRelation: "organizations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "workspace_integrations_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
            }];
        };
    };
    Views: { [_ in never]: never; };
    Functions: {
        get_user_organization: {
            Args: never;
            Returns: string;
        };
        get_user_role: {
            Args: never;
            Returns: Database["public"]["Enums"]["user_role"];
        };
        has_principal_access: {
            Args: {
                item_user_id: string;
                org_id: string;
            };
            Returns: boolean;
        };
    };
    Enums: {
        agency_tier: "Public" | "Controlled" | "Restricted";
        project_setup_status: "incomplete" | "complete";
        relancing_update_intent: "status_update" | "blocker_report";
        task_status: "queued" | "processing" | "done" | "error" | "escalation" | "paused";
        user_role: "CEO" | "PM" | "Team Member" | "Simple User";
    };
    CompositeTypes: { [_ in never]: never; };
}, {
    PostgrestVersion: "14.1";
}>;
export declare const signInWithGoogle: () => Promise<void>;
