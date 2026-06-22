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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agenda_items: {
        Row: {
          assembly_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number
          title: string
          voting_enabled: boolean
          voting_status: Database["public"]["Enums"]["agenda_item_voting_status_enum"]
        }
        Insert: {
          assembly_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index: number
          title: string
          voting_enabled?: boolean
          voting_status?: Database["public"]["Enums"]["agenda_item_voting_status_enum"]
        }
        Update: {
          assembly_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          voting_enabled?: boolean
          voting_status?: Database["public"]["Enums"]["agenda_item_voting_status_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "agenda_items_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      assemblies: {
        Row: {
          building_id: string
          created_at: string
          created_by: string
          id: string
          location: string | null
          quorum_required: number
          scheduled_at: string
          status: Database["public"]["Enums"]["assembly_status_enum"]
          type: Database["public"]["Enums"]["assembly_type_enum"]
        }
        Insert: {
          building_id: string
          created_at?: string
          created_by: string
          id?: string
          location?: string | null
          quorum_required?: number
          scheduled_at: string
          status?: Database["public"]["Enums"]["assembly_status_enum"]
          type: Database["public"]["Enums"]["assembly_type_enum"]
        }
        Update: {
          building_id?: string
          created_at?: string
          created_by?: string
          id?: string
          location?: string | null
          quorum_required?: number
          scheduled_at?: string
          status?: Database["public"]["Enums"]["assembly_status_enum"]
          type?: Database["public"]["Enums"]["assembly_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atas: {
        Row: {
          assembly_id: string
          content: string
          created_at: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          status: Database["public"]["Enums"]["ata_status_enum"]
        }
        Insert: {
          assembly_id: string
          content?: string
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["ata_status_enum"]
        }
        Update: {
          assembly_id?: string
          content?: string
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["ata_status_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "atas_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: true
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atas_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_snapshot: Json | null
          before_snapshot: Json | null
          building_id: string | null
          id: string
          occurred_at: string
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          building_id?: string | null
          id?: string
          occurred_at?: string
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          building_id?: string | null
          id?: string
          occurred_at?: string
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_building_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_line_items: {
        Row: {
          amount_cents: number
          budget_id: string
          category: Database["public"]["Enums"]["budget_category_enum"]
          description: string | null
          id: string
        }
        Insert: {
          amount_cents: number
          budget_id: string
          category: Database["public"]["Enums"]["budget_category_enum"]
          description?: string | null
          id?: string
        }
        Update: {
          amount_cents?: number
          budget_id?: string
          category?: Database["public"]["Enums"]["budget_category_enum"]
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_line_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          building_id: string
          created_at: string
          created_by: string
          fiscal_year: number
          id: string
          reserve_amount_cents: number
          status: Database["public"]["Enums"]["budget_status_enum"]
          total_amount_cents: number
        }
        Insert: {
          building_id: string
          created_at?: string
          created_by: string
          fiscal_year: number
          id?: string
          reserve_amount_cents: number
          status?: Database["public"]["Enums"]["budget_status_enum"]
          total_amount_cents: number
        }
        Update: {
          building_id?: string
          created_at?: string
          created_by?: string
          fiscal_year?: number
          id?: string
          reserve_amount_cents?: number
          status?: Database["public"]["Enums"]["budget_status_enum"]
          total_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      building_invitations: {
        Row: {
          building_id: string
          created_at: string
          email: string
          id: string
          invited_by: string
          status: string
          unit_id: string | null
        }
        Insert: {
          building_id: string
          created_at?: string
          email: string
          id?: string
          invited_by: string
          status?: string
          unit_id?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          status?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_invitations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_invitations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string
          created_at: string
          fiscal_number: string
          id: string
          name: string
          owner_gestor_id: string
        }
        Insert: {
          address: string
          created_at?: string
          fiscal_number: string
          id?: string
          name: string
          owner_gestor_id: string
        }
        Update: {
          address?: string
          created_at?: string
          fiscal_number?: string
          id?: string
          name?: string
          owner_gestor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_owner_gestor_id_fkey"
            columns: ["owner_gestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          building_id: string
          created_at: string
          file_size_bytes: number
          id: string
          mime_type: string
          ocr_payload: Json | null
          status: Database["public"]["Enums"]["document_status_enum"]
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          building_id: string
          created_at?: string
          file_size_bytes: number
          id?: string
          mime_type: string
          ocr_payload?: Json | null
          status?: Database["public"]["Enums"]["document_status_enum"]
          storage_path: string
          uploaded_by: string
        }
        Update: {
          building_id?: string
          created_at?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          ocr_payload?: Json | null
          status?: Database["public"]["Enums"]["document_status_enum"]
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          building_id: string
          category: Database["public"]["Enums"]["budget_category_enum"]
          created_at: string
          description: string | null
          document_id: string | null
          expense_date: string
          id: string
          status: Database["public"]["Enums"]["expense_status_enum"]
          supplier_id: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          approved_by?: string | null
          building_id: string
          category: Database["public"]["Enums"]["budget_category_enum"]
          created_at?: string
          description?: string | null
          document_id?: string | null
          expense_date: string
          id?: string
          status?: Database["public"]["Enums"]["expense_status_enum"]
          supplier_id: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          building_id?: string
          category?: Database["public"]["Enums"]["budget_category_enum"]
          created_at?: string
          description?: string | null
          document_id?: string | null
          expense_date?: string
          id?: string
          status?: Database["public"]["Enums"]["expense_status_enum"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_deletion_requests: {
        Row: {
          completed_at: string | null
          id: string
          requested_at: string
          requesting_user_id: string
          status: Database["public"]["Enums"]["gdpr_request_status_enum"]
          target_user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          requesting_user_id: string
          status?: Database["public"]["Enums"]["gdpr_request_status_enum"]
          target_user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          requesting_user_id?: string
          status?: Database["public"]["Enums"]["gdpr_request_status_enum"]
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_deletion_requests_requesting_user_id_fkey"
            columns: ["requesting_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_deletion_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_attachments: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          mime_type: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          mime_type: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_attachments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_history: {
        Row: {
          actor_user_id: string
          comment: string | null
          from_status:
            | Database["public"]["Enums"]["incident_status_enum"]
            | null
          id: string
          incident_id: string
          to_status: Database["public"]["Enums"]["incident_status_enum"]
          transitioned_at: string
        }
        Insert: {
          actor_user_id: string
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["incident_status_enum"]
            | null
          id?: string
          incident_id: string
          to_status: Database["public"]["Enums"]["incident_status_enum"]
          transitioned_at?: string
        }
        Update: {
          actor_user_id?: string
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["incident_status_enum"]
            | null
          id?: string
          incident_id?: string
          to_status?: Database["public"]["Enums"]["incident_status_enum"]
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_history_actor_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_history_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          building_id: string
          created_at: string
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["incident_priority_enum"] | null
          reported_by: string
          status: Database["public"]["Enums"]["incident_status_enum"]
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          description?: string | null
          id?: string
          priority?:
            | Database["public"]["Enums"]["incident_priority_enum"]
            | null
          reported_by: string
          status?: Database["public"]["Enums"]["incident_status_enum"]
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?:
            | Database["public"]["Enums"]["incident_priority_enum"]
            | null
          reported_by?: string
          status?: Database["public"]["Enums"]["incident_status_enum"]
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          building_id: string
          created_at: string
          email_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          building_id?: string
          created_at?: string
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          building_id: string
          channel: Database["public"]["Enums"]["notification_channel_enum"]
          created_at: string
          delivery_status: Database["public"]["Enums"]["notification_delivery_status_enum"]
          event_type: Database["public"]["Enums"]["notification_event_enum"]
          id: string
          payload: Json
          recipient_user_id: string
          sent_at: string | null
        }
        Insert: {
          building_id: string
          channel: Database["public"]["Enums"]["notification_channel_enum"]
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["notification_delivery_status_enum"]
          event_type: Database["public"]["Enums"]["notification_event_enum"]
          id?: string
          payload?: Json
          recipient_user_id: string
          sent_at?: string | null
        }
        Update: {
          building_id?: string
          channel?: Database["public"]["Enums"]["notification_channel_enum"]
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["notification_delivery_status_enum"]
          event_type?: Database["public"]["Enums"]["notification_event_enum"]
          id?: string
          payload?: Json
          recipient_user_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          paid_by: string
          payment_method: string
          quota_id: string
          reference: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          paid_by: string
          payment_method: string
          quota_id: string
          reference?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          paid_by?: string
          payment_method?: string
          quota_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_quota_id_fkey"
            columns: ["quota_id"]
            isOneToOne: false
            referencedRelation: "quotas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      quotas: {
        Row: {
          amount_cents: number
          budget_id: string
          due_date: string
          id: string
          paid_at: string | null
          reserve_cents: number
          status: Database["public"]["Enums"]["quota_status_enum"]
          unit_id: string
        }
        Insert: {
          amount_cents: number
          budget_id: string
          due_date: string
          id?: string
          paid_at?: string | null
          reserve_cents: number
          status?: Database["public"]["Enums"]["quota_status_enum"]
          unit_id: string
        }
        Update: {
          amount_cents?: number
          budget_id?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          reserve_cents?: number
          status?: Database["public"]["Enums"]["quota_status_enum"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotas_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      session_log: {
        Row: {
          action: string
          building_id: string | null
          id: string
          impersonated_user_id: string | null
          occurred_at: string
          superadmin_user_id: string
        }
        Insert: {
          action: string
          building_id?: string | null
          id?: string
          impersonated_user_id?: string | null
          occurred_at?: string
          superadmin_user_id: string
        }
        Update: {
          action?: string
          building_id?: string | null
          id?: string
          impersonated_user_id?: string | null
          occurred_at?: string
          superadmin_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_log_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_impersonated_user_id_fkey"
            columns: ["impersonated_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_log_superadmin_user_id_fkey"
            columns: ["superadmin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_dispatches: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          notes: string | null
          quoted_cost_cents: number | null
          scheduled_date: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          notes?: string | null
          quoted_cost_cents?: number | null
          scheduled_date: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          notes?: string | null
          quoted_cost_cents?: number | null
          scheduled_date?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_dispatches_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_dispatches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          building_id: string
          contact_email: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          nif: string | null
          service_type: string
        }
        Insert: {
          building_id: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          nif?: string | null
          service_type: string
        }
        Update: {
          building_id?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          nif?: string | null
          service_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_ownership: {
        Row: {
          ended_at: string | null
          id: string
          owner_user_id: string
          started_at: string
          unit_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          owner_user_id: string
          started_at: string
          unit_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          owner_user_id?: string
          started_at?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_ownership_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_ownership_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          building_id: string
          created_at: string
          floor: number
          id: string
          identifier: string
          permilagem: number
        }
        Insert: {
          building_id: string
          created_at?: string
          floor: number
          id?: string
          identifier: string
          permilagem: number
        }
        Update: {
          building_id?: string
          created_at?: string
          floor?: number
          id?: string
          identifier?: string
          permilagem?: number
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_building_roles: {
        Row: {
          building_id: string
          created_at: string
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Update: {
          building_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["user_role_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_building_roles_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_building_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_proxies: {
        Row: {
          assembly_id: string
          created_at: string
          grantor_unit_id: string
          id: string
          proxy_unit_id: string
        }
        Insert: {
          assembly_id: string
          created_at?: string
          grantor_unit_id: string
          id?: string
          proxy_unit_id: string
        }
        Update: {
          assembly_id?: string
          created_at?: string
          grantor_unit_id?: string
          id?: string
          proxy_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_proxies_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_proxies_grantor_unit_id_fkey"
            columns: ["grantor_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_proxies_proxy_unit_id_fkey"
            columns: ["proxy_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          agenda_item_id: string
          cast_at: string
          id: string
          unit_id: string
          vote: Database["public"]["Enums"]["vote_choice_enum"]
          voter_user_id: string
          weighted_permilagem: number
        }
        Insert: {
          agenda_item_id: string
          cast_at?: string
          id?: string
          unit_id: string
          vote: Database["public"]["Enums"]["vote_choice_enum"]
          voter_user_id: string
          weighted_permilagem: number
        }
        Update: {
          agenda_item_id?: string
          cast_at?: string
          id?: string
          unit_id?: string
          vote?: Database["public"]["Enums"]["vote_choice_enum"]
          voter_user_id?: string
          weighted_permilagem?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_user_id_fkey"
            columns: ["voter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      financial_summary: {
        Row: {
          building_id: string | null
          expense_cents: number | null
          income_cents: number | null
          month: string | null
          outstanding_debt_cents: number | null
          reserve_balance_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agenda_item_voting_status_enum: "CLOSED" | "OPEN" | "CONCLUDED"
      assembly_status_enum:
        | "DRAFT"
        | "PUBLISHED"
        | "IN_PROGRESS"
        | "CONCLUDED"
        | "ARCHIVED"
      assembly_type_enum: "ORDINÁRIA" | "EXTRAORDINÁRIA"
      ata_status_enum: "DRAFT" | "FINALIZED"
      budget_category_enum:
        | "MAINTENANCE"
        | "WATER"
        | "ELECTRICITY"
        | "INSURANCE"
        | "CLEANING"
        | "ELEVATOR"
        | "ADMINISTRATIVE"
        | "OTHER"
      budget_status_enum: "DRAFT" | "APPROVED"
      document_status_enum: "PROCESSING" | "DRAFT" | "LINKED"
      expense_status_enum:
        | "DRAFT"
        | "AWAITING_APPROVAL"
        | "APPROVED"
        | "RECONCILED"
      gdpr_request_status_enum: "PENDING" | "PROCESSING" | "COMPLETED"
      incident_priority_enum: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      incident_status_enum:
        | "REPORTED"
        | "ASSESSED"
        | "SUPPLIER_DISPATCHED"
        | "IN_PROGRESS"
        | "RESOLVED"
        | "CLOSED"
      notification_channel_enum: "IN_APP" | "EMAIL" | "SMS" | "PUSH"
      notification_delivery_status_enum: "PENDING" | "SENT" | "FAILED" | "READ"
      notification_event_enum:
        | "QUOTA_OVERDUE"
        | "QUOTA_REMINDER"
        | "ASSEMBLY_SCHEDULED"
        | "ASSEMBLY_REMINDER_48H"
        | "VOTE_OPEN"
        | "INCIDENT_REPORTED"
        | "INCIDENT_RESOLVED"
      quota_status_enum: "PENDING" | "PAID" | "OVERDUE" | "WAIVED"
      user_role_enum: "GESTOR" | "CONDÓMINO"
      vote_choice_enum: "FAVOR" | "AGAINST" | "ABSTAIN"
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
      agenda_item_voting_status_enum: ["CLOSED", "OPEN", "CONCLUDED"],
      assembly_status_enum: [
        "DRAFT",
        "PUBLISHED",
        "IN_PROGRESS",
        "CONCLUDED",
        "ARCHIVED",
      ],
      assembly_type_enum: ["ORDINÁRIA", "EXTRAORDINÁRIA"],
      ata_status_enum: ["DRAFT", "FINALIZED"],
      budget_category_enum: [
        "MAINTENANCE",
        "WATER",
        "ELECTRICITY",
        "INSURANCE",
        "CLEANING",
        "ELEVATOR",
        "ADMINISTRATIVE",
        "OTHER",
      ],
      budget_status_enum: ["DRAFT", "APPROVED"],
      document_status_enum: ["PROCESSING", "DRAFT", "LINKED"],
      expense_status_enum: [
        "DRAFT",
        "AWAITING_APPROVAL",
        "APPROVED",
        "RECONCILED",
      ],
      gdpr_request_status_enum: ["PENDING", "PROCESSING", "COMPLETED"],
      incident_priority_enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      incident_status_enum: [
        "REPORTED",
        "ASSESSED",
        "SUPPLIER_DISPATCHED",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
      ],
      notification_channel_enum: ["IN_APP", "EMAIL", "SMS", "PUSH"],
      notification_delivery_status_enum: ["PENDING", "SENT", "FAILED", "READ"],
      notification_event_enum: [
        "QUOTA_OVERDUE",
        "QUOTA_REMINDER",
        "ASSEMBLY_SCHEDULED",
        "ASSEMBLY_REMINDER_48H",
        "VOTE_OPEN",
        "INCIDENT_REPORTED",
        "INCIDENT_RESOLVED",
      ],
      quota_status_enum: ["PENDING", "PAID", "OVERDUE", "WAIVED"],
      user_role_enum: ["GESTOR", "CONDÓMINO"],
      vote_choice_enum: ["FAVOR", "AGAINST", "ABSTAIN"],
    },
  },
} as const
