export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          name: string;
          calendar_start_hour: number;
          calendar_end_hour: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          calendar_start_hour?: number;
          calendar_end_hour?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          calendar_start_hour?: number;
          calendar_end_hour?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          color: string;
          cannot_be_alone: boolean;
          is_guardian: boolean;
          user_id: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          color: string;
          cannot_be_alone?: boolean;
          is_guardian?: boolean;
          user_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          color?: string;
          cannot_be_alone?: boolean;
          is_guardian?: boolean;
          user_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          family_id: string;
          name: string;
          icon_emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          icon_emoji?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          name?: string;
          icon_emoji?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          family_id: string;
          title: string;
          notes: string | null;
          start_time: string;
          end_time: string;
          travel_before_min: number;
          travel_after_min: number;
          vehicle_id: string | null;
          owner_id: string | null;
          is_all_family: boolean;
          is_event: boolean;
          recurrence_rule: string | null;
          recurrence_parent_id: string | null;
          exception_date: string | null;
          is_deleted: boolean;
          is_all_day: boolean;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          title: string;
          notes?: string | null;
          start_time: string;
          end_time: string;
          travel_before_min?: number;
          travel_after_min?: number;
          vehicle_id?: string | null;
          owner_id?: string | null;
          is_all_family?: boolean;
          is_event?: boolean;
          is_all_day?: boolean;
          recurrence_rule?: string | null;
          recurrence_parent_id?: string | null;
          exception_date?: string | null;
          is_deleted?: boolean;
          color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          title?: string;
          notes?: string | null;
          start_time?: string;
          end_time?: string;
          travel_before_min?: number;
          travel_after_min?: number;
          vehicle_id?: string | null;
          owner_id?: string | null;
          is_all_family?: boolean;
          is_event?: boolean;
          is_all_day?: boolean;
          recurrence_rule?: string | null;
          recurrence_parent_id?: string | null;
          exception_date?: string | null;
          is_deleted?: boolean;
          color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      appointment_participants: {
        Row: {
          appointment_id: string;
          member_id: string;
          is_supervisor: boolean;
        };
        Insert: {
          appointment_id: string;
          member_id: string;
          is_supervisor?: boolean;
        };
        Update: {
          appointment_id?: string;
          member_id?: string;
          is_supervisor?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_participants_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_participants_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      family_invites: {
        Row: {
          id: string;
          family_id: string;
          code: string;
          created_by: string | null;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          code: string;
          created_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          code?: string;
          created_by?: string | null;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      meals: {
        Row: {
          id: string;
          family_id: string;
          /** Local date "YYYY-MM-DD" */
          date: string;
          lunch: string | null;
          dinner: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          date: string;
          lunch?: string | null;
          dinner?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          date?: string;
          lunch?: string | null;
          dinner?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meals_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_invite_valid: {
        Args: { invite_code: string };
        Returns: boolean;
      };
      accept_invite: {
        Args: { invite_code: string; member_name: string; member_color: string };
        Returns: Database["public"]["Tables"]["family_members"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience types
export type Family = Database["public"]["Tables"]["families"]["Row"];
export type FamilyMember = Database["public"]["Tables"]["family_members"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentParticipant = Database["public"]["Tables"]["appointment_participants"]["Row"];
export type FamilyInvite = Database["public"]["Tables"]["family_invites"]["Row"];
export type Meal = Database["public"]["Tables"]["meals"]["Row"];

/** Appointment enriched with participants */
export interface AppointmentWithParticipants extends Appointment {
  participants: AppointmentParticipant[];
}
