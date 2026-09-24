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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          belt_id: string
          created_at: string | null
          description: string
          id: string
          priority: string
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          status: string
          title: string
        }
        Insert: {
          belt_id: string
          created_at?: string | null
          description: string
          id?: string
          priority: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          belt_id?: string
          created_at?: string | null
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_belt_id_fkey"
            columns: ["belt_id"]
            isOneToOne: false
            referencedRelation: "conveyor_belts"
            referencedColumns: ["id"]
          },
        ]
      }
      conveyor_belts: {
        Row: {
          created_at: string | null
          id: string
          last_maintenance: string | null
          load_percentage: number | null
          location: string
          name: string
          speed: number | null
          status: string
          temperature: number | null
          updated_at: string | null
          vibration: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_maintenance?: string | null
          load_percentage?: number | null
          location: string
          name: string
          speed?: number | null
          status?: string
          temperature?: number | null
          updated_at?: string | null
          vibration?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_maintenance?: string | null
          load_percentage?: number | null
          location?: string
          name?: string
          speed?: number | null
          status?: string
          temperature?: number | null
          updated_at?: string | null
          vibration?: number | null
        }
        Relationships: []
      }
      belt_thresholds: {
        Row: {
          belt_id: string
          created_at: string | null
          id: string
          load_crit: number | null
          load_warn: number | null
          speed_crit: number | null
          speed_warn: number | null
          temp_crit: number | null
          temp_warn: number | null
          updated_at: string | null
          updated_by: string | null
          vibration_crit: number | null
          vibration_warn: number | null
        }
        Insert: {
          belt_id: string
          created_at?: string | null
          id?: string
          load_crit?: number | null
          load_warn?: number | null
          speed_crit?: number | null
          speed_warn?: number | null
          temp_crit?: number | null
          temp_warn?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vibration_crit?: number | null
          vibration_warn?: number | null
        }
        Update: {
          belt_id?: string
          created_at?: string | null
          id?: string
          load_crit?: number | null
          load_warn?: number | null
          speed_crit?: number | null
          speed_warn?: number | null
          temp_crit?: number | null
          temp_warn?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vibration_crit?: number | null
          vibration_warn?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "belt_thresholds_belt_id_fkey"
            columns: ["belt_id"]
            isOneToOne: true
            referencedRelation: "conveyor_belts"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          belt_id: string
          cost: number | null
          description: string | null
          downtime_hours: number | null
          id: string
          maintenance_type: string
          performed_at: string | null
          performed_by: string
        }
        Insert: {
          belt_id: string
          cost?: number | null
          description?: string | null
          downtime_hours?: number | null
          id?: string
          maintenance_type: string
          performed_at?: string | null
          performed_by: string
        }
        Update: {
          belt_id?: string
          cost?: number | null
          description?: string | null
          downtime_hours?: number | null
          id?: string
          maintenance_type?: string
          performed_at?: string | null
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_belt_id_fkey"
            columns: ["belt_id"]
            isOneToOne: false
            referencedRelation: "conveyor_belts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      analyses: {
        Row: {
          created_at: string | null
          file_name: string | null
          id: string
          summary: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          summary?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          summary?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          analysis_id: string
          id: string
          key_indicators: Json | null
          machine_id: string
          priority_score: number | null
          recommended_action: string | null
          risk_level: string
          servicing_probability: number
        }
        Insert: {
          analysis_id: string
          id?: string
          key_indicators?: Json | null
          machine_id: string
          priority_score?: number | null
          recommended_action?: string | null
          risk_level: string
          servicing_probability: number
        }
        Update: {
          analysis_id?: string
          id?: string
          key_indicators?: Json | null
          machine_id?: string
          priority_score?: number | null
          recommended_action?: string | null
          risk_level?: string
          servicing_probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "predictions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          belt_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          belt_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority: string
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          belt_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_belt_id_fkey"
            columns: ["belt_id"]
            isOneToOne: false
            referencedRelation: "conveyor_belts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_readings: {
        Row: {
          belt_id: string
          id: string
          load_percentage: number
          speed: number
          temperature: number
          timestamp: string | null
          vibration: number
        }
        Insert: {
          belt_id: string
          id?: string
          load_percentage: number
          speed: number
          temperature: number
          timestamp?: string | null
          vibration: number
        }
        Update: {
          belt_id?: string
          id?: string
          load_percentage?: number
          speed?: number
          temperature?: number
          timestamp?: string | null
          vibration?: number
        }
        Relationships: [
          {
            foreignKeyName: "sensor_readings_belt_id_fkey"
            columns: ["belt_id"]
            isOneToOne: false
            referencedRelation: "conveyor_belts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      kpi_summary: {
        Row: {
          active_alerts: number | null
          active_critical_alerts: number | null
          corrective_count: number | null
          critical_belts: number | null
          fleet_availability: number | null
          mtbf_hours: number | null
          mttr_hours: number | null
          open_work_orders: number | null
          operational_belts: number | null
          predictive_count: number | null
          preventive_count: number | null
          total_belts: number | null
          total_cost: number | null
          total_downtime_hours: number | null
          total_maintenance: number | null
          warning_belts: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
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
      app_role: ["admin", "operator", "viewer"],
    },
  },
} as const
