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
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
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
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_markdown: string
          created_at?: string
          id?: string
          organization_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_markdown?: string
          created_at?: string
          id?: string
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
      task_status: "queued" | "processing" | "done" | "error" | "escalation"
      user_role: "CEO" | "PM" | "Team Member"
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
      task_status: ["queued", "processing", "done", "error", "escalation"],
      user_role: ["CEO", "PM", "Team Member"],
    },
  },
} as const
