export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
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
          recurrence_rule: string | null;
          recurrence_parent_id: string | null;
          exception_date: string | null;
          is_deleted: boolean;
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
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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

/** Appointment enriched with participants */
export interface AppointmentWithParticipants extends Appointment {
  participants: AppointmentParticipant[];
}
