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
        profiles: {
            Row: {
                avatar_url: string | null;
                email: string | null;
                full_name: string | null;
                id: string;
                organization_id: string | null;
                role: Database["public"]["Enums"]["user_role"] | null;
                updated_at: string;
            };
            Insert: {
                avatar_url?: string | null;
                email?: string | null;
                full_name?: string | null;
                id: string;
                organization_id?: string | null;
                role?: Database["public"]["Enums"]["user_role"] | null;
                updated_at?: string;
            };
            Update: {
                avatar_url?: string | null;
                email?: string | null;
                full_name?: string | null;
                id?: string;
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
                organization_id: string;
                title: string;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                content_markdown: string;
                created_at?: string;
                id?: string;
                organization_id: string;
                title: string;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                content_markdown?: string;
                created_at?: string;
                id?: string;
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
        task_status: "queued" | "processing" | "done" | "error" | "escalation";
        user_role: "CEO" | "PM" | "Team Member" | "Simple User";
    };
    CompositeTypes: { [_ in never]: never; };
}, {
    PostgrestVersion: "14.1";
}>;
export declare const signInWithGoogle: () => Promise<void>;
