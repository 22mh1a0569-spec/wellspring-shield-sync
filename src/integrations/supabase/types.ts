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
      appointment_notes: {
        Row: {
          appointment_id: string
          created_at: string
          diagnosis: string | null
          doctor_id: string
          finalized_at: string | null
          id: string
          is_final: boolean
          patient_id: string
          recommendations: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          diagnosis?: string | null
          doctor_id: string
          finalized_at?: string | null
          id?: string
          is_final?: boolean
          patient_id: string
          recommendations?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string
          finalized_at?: string | null
          id?: string
          is_final?: boolean
          patient_id?: string
          recommendations?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          doctor_id: string
          ended_at: string | null
          id: string
          patient_id: string
          reason: string | null
          scheduled_for: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          ended_at?: string | null
          id?: string
          patient_id: string
          reason?: string | null
          scheduled_for: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          ended_at?: string | null
          id?: string
          patient_id?: string
          reason?: string | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          appointment_id: string
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          appointment_id: string
          body: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          appointment_id?: string
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_availability: {
        Row: {
          created_at: string
          doctor_id: string
          is_available: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          is_available?: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          is_available?: boolean
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      doctor_patient_consents: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          note: string | null
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          note?: string | null
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          note?: string | null
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      health_metrics: {
        Row: {
          created_at: string
          diastolic_bp: number | null
          glucose_mgdl: number | null
          heart_rate: number | null
          id: string
          patient_id: string
          recorded_at: string
          systolic_bp: number | null
          temperature_c: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          diastolic_bp?: number | null
          glucose_mgdl?: number | null
          heart_rate?: number | null
          id?: string
          patient_id: string
          recorded_at?: string
          systolic_bp?: number | null
          temperature_c?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          diastolic_bp?: number | null
          glucose_mgdl?: number | null
          heart_rate?: number | null
          id?: string
          patient_id?: string
          recorded_at?: string
          systolic_bp?: number | null
          temperature_c?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ledger_transactions: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by: string
          id: string
          note_id: string | null
          patient_id: string
          payload_hash: string
          prediction_id: string | null
          prev_hash: string | null
          tx_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          note_id?: string | null
          patient_id: string
          payload_hash: string
          prediction_id?: string | null
          prev_hash?: string | null
          tx_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          note_id?: string | null
          patient_id?: string
          payload_hash?: string
          prediction_id?: string | null
          prev_hash?: string | null
          tx_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "appointment_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          created_at: string
          created_by: string
          doctor_remarks: string | null
          health_score: number
          id: string
          input: Json
          patient_id: string
          risk_category: string
          risk_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          doctor_remarks?: string | null
          health_score: number
          id?: string
          input: Json
          patient_id: string
          risk_category: string
          risk_percentage: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          doctor_remarks?: string | null
          health_score?: number
          id?: string
          input?: Json
          patient_id?: string
          risk_category?: string
          risk_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          phone: string | null
          specialization: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_ledger_tx_meta_for_doctor: {
        Args: { _tx_id: string }
        Returns: {
          appointment_id: string
          created_at: string
          note_id: string
          patient_id: string
          prediction_id: string
          tx_id: string
        }[]
      }
      get_patient_label_for_doctor: {
        Args: { _patient_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      request_patient_consent: {
        Args: { _patient_id: string }
        Returns: string
      }
      send_notification: {
        Args: {
          _appointment_id?: string
          _body?: string
          _href?: string
          _recipient_id: string
          _title: string
          _type: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "patient" | "doctor"
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
      app_role: ["patient", "doctor"],
    },
  },
} as const
