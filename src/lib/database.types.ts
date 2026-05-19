export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: string
          created_at?: string
        }
      }
      app_users: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          must_change_password: boolean
          password_changed_at: string | null
        }
        Insert: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          must_change_password?: boolean
          password_changed_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          must_change_password?: boolean
          password_changed_at?: string | null
        }
      }
      bug_reports: {
        Row: {
          id: string
          title: string
          description: string
          page_path: string
          page_url: string
          page_title: string
          created_by: string | null
          created_by_name: string
          created_by_email: string | null
          status: string
          context: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string
          page_path: string
          page_url?: string
          page_title?: string
          created_by?: string | null
          created_by_name?: string
          created_by_email?: string | null
          status?: string
          context?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          page_path?: string
          page_url?: string
          page_title?: string
          created_by?: string | null
          created_by_name?: string
          created_by_email?: string | null
          status?: string
          context?: Json
          created_at?: string
          updated_at?: string
        }
      }
      bug_report_attachments: {
        Row: {
          id: string
          bug_report_id: string
          storage_path: string
          file_url: string
          file_name: string
          file_type: string | null
          file_size: number | null
          created_at: string
        }
        Insert: {
          id?: string
          bug_report_id: string
          storage_path?: string
          file_url: string
          file_name?: string
          file_type?: string | null
          file_size?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          bug_report_id?: string
          storage_path?: string
          file_url?: string
          file_name?: string
          file_type?: string | null
          file_size?: number | null
          created_at?: string
        }
      }
      delivery_offers: {
        Row: {
          id: string
          name: string
          description: string | null
          pricing_type: string
          rate_amount: number
          base_amount: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          pricing_type: string
          rate_amount?: number
          base_amount?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          pricing_type?: string
          rate_amount?: number
          base_amount?: number
          is_active?: boolean
          created_at?: string
        }
      }
      warehouses: {
        Row: {
          id: string
          name: string
          address: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          address: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string
          created_at?: string
        }
      }
      equipment: {
        Row: {
          id: string
          name: string
          type: string
          subtype: string | null
          rental_price_ht: number
          rental_price_ttc: number
          status: string
          inventory_category: 'series' | 'vrac' | 'consommable'
          image_url: string | null
          description: string | null
          serial_number: string | null
          purchase_date: string | null
          purchase_price: number
          created_at: string
          category_id: string | null
          subcategory_id: string | null
          internal_location: string | null
          qr_code_value: string | null
          qr_code_url: string | null
          qr_code_generated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          type: string
          subtype?: string | null
          rental_price_ht?: number
          rental_price_ttc?: number
          status?: string
          inventory_category?: 'series' | 'vrac' | 'consommable'
          image_url?: string | null
          description?: string | null
          serial_number?: string | null
          purchase_date?: string | null
          purchase_price?: number
          created_at?: string
          category_id?: string | null
          subcategory_id?: string | null
          internal_location?: string | null
          qr_code_value?: string | null
          qr_code_url?: string | null
          qr_code_generated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: string
          subtype?: string | null
          rental_price_ht?: number
          rental_price_ttc?: number
          status?: string
          inventory_category?: 'series' | 'vrac' | 'consommable'
          image_url?: string | null
          description?: string | null
          serial_number?: string | null
          purchase_date?: string | null
          purchase_price?: number
          created_at?: string
          category_id?: string | null
          subcategory_id?: string | null
          internal_location?: string | null
          qr_code_value?: string | null
          qr_code_url?: string | null
          qr_code_generated_at?: string | null
        }
      }
      equipment_packs: {
        Row: {
          equipment_id: string
          overview: string | null
          highlights: string | null
          conditions: string | null
          created_at: string
        }
        Insert: {
          equipment_id: string
          overview?: string | null
          highlights?: string | null
          conditions?: string | null
          created_at?: string
        }
        Update: {
          equipment_id?: string
          overview?: string | null
          highlights?: string | null
          conditions?: string | null
          created_at?: string
        }
      }
      equipment_pack_items: {
        Row: {
          id: string
          pack_id: string
          equipment_id: string
          quantity: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          pack_id: string
          equipment_id: string
          quantity?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          pack_id?: string
          equipment_id?: string
          quantity?: number
          sort_order?: number
          created_at?: string
        }
      }
      equipment_categories: {
        Row: {
          id: string
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          created_at?: string
        }
      }
      equipment_subcategories: {
        Row: {
          id: string
          category_id: string | null
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          category_id?: string | null
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string | null
          name?: string
          sort_order?: number
          created_at?: string
        }
      }
      equipment_accessories: {
        Row: {
          id: string
          equipment_id: string
          name: string
          description: string | null
          image_urls: string[]
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          name: string
          description?: string | null
          image_urls?: string[]
          quantity?: number
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          name?: string
          description?: string | null
          image_urls?: string[]
          quantity?: number
          created_at?: string
        }
      }
      equipment_stock: {
        Row: {
          id: string
          equipment_id: string
          warehouse_id: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          warehouse_id: string
          quantity?: number
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          warehouse_id?: string
          quantity?: number
          created_at?: string
        }
      }
      equipment_maintenance: {
        Row: {
          id: string
          equipment_id: string | null
          warehouse_id: string | null
          serial_number: string | null
          maintenance_type: string
          status: string
          task_id: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          equipment_id?: string | null
          warehouse_id?: string | null
          serial_number?: string | null
          maintenance_type?: string
          status?: string
          task_id?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          equipment_id?: string | null
          warehouse_id?: string | null
          serial_number?: string | null
          maintenance_type?: string
          status?: string
          task_id?: string | null
          created_at?: string
          completed_at?: string | null
        }
      }
      clients: {
        Row: {
          id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          company: string | null
          image_url: string | null
          client_type: 'person' | 'company'
          company_client_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          company?: string | null
          image_url?: string | null
          client_type?: 'person' | 'company'
          company_client_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          company?: string | null
          image_url?: string | null
          client_type?: 'person' | 'company'
          company_client_id?: string | null
          created_at?: string
        }
      }
      rentals: {
        Row: {
          id: string
          client_id: string | null
          type: string
          start_date: string
          end_date: string
          location: string | null
          delivery_offer_id: string | null
          delivery_offer_name: string | null
          delivery_pricing_type: string | null
          delivery_rate_amount: number | null
          delivery_base_amount: number | null
          delivery_quantity: number | null
          delivery_round_trip: boolean | null
          delivery_total_amount: number | null
          delivered_at: string | null
          delivery_confirmation_note: string | null
          return_delivery_at: string | null
          return_delivery_confirmation_note: string | null
          client_represents_company: boolean
          cancelled_at: string | null
          cancellation_reason: string | null
          cancellation_payment_policy: string | null
          cancellation_refund_amount: number | null
          status_before_cancellation: string | null
          status: string
          total_price: number
          discount_type: string | null
          discount_value: number | null
          generate_invoice: boolean
          color: string | null
          description: string | null
          title: string | null
          notes: string | null
          delivery_address: string | null
          pickup_address: string | null
          created_at: string
          reference_code: string | null
          returned_at: string | null
          quote_expired_at: string | null
          quote_expired_notice_at: string | null
          rental_coefficient_override: number | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          type: string
          start_date: string
          end_date: string
          location?: string | null
          delivery_offer_id?: string | null
          delivery_offer_name?: string | null
          delivery_pricing_type?: string | null
          delivery_rate_amount?: number | null
          delivery_base_amount?: number | null
          delivery_quantity?: number | null
          delivery_round_trip?: boolean | null
          delivery_total_amount?: number | null
          delivered_at?: string | null
          delivery_confirmation_note?: string | null
          return_delivery_at?: string | null
          return_delivery_confirmation_note?: string | null
          client_represents_company?: boolean
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancellation_payment_policy?: string | null
          cancellation_refund_amount?: number | null
          status_before_cancellation?: string | null
          status?: string
          total_price?: number
          discount_type?: string | null
          discount_value?: number | null
          generate_invoice?: boolean
          color?: string | null
          description?: string | null
          title?: string | null
          notes?: string | null
          delivery_address?: string | null
          pickup_address?: string | null
          created_at?: string
          reference_code?: string | null
          returned_at?: string | null
          quote_expired_at?: string | null
          quote_expired_notice_at?: string | null
          rental_coefficient_override?: number | null
        }
        Update: {
          id?: string
          client_id?: string | null
          type?: string
          start_date?: string
          end_date?: string
          location?: string | null
          delivery_offer_id?: string | null
          delivery_offer_name?: string | null
          delivery_pricing_type?: string | null
          delivery_rate_amount?: number | null
          delivery_base_amount?: number | null
          delivery_quantity?: number | null
          delivery_round_trip?: boolean | null
          delivery_total_amount?: number | null
          delivered_at?: string | null
          delivery_confirmation_note?: string | null
          return_delivery_at?: string | null
          return_delivery_confirmation_note?: string | null
          client_represents_company?: boolean
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancellation_payment_policy?: string | null
          cancellation_refund_amount?: number | null
          status_before_cancellation?: string | null
          status?: string
          total_price?: number
          discount_type?: string | null
          discount_value?: number | null
          generate_invoice?: boolean
          color?: string | null
          description?: string | null
          title?: string | null
          notes?: string | null
          delivery_address?: string | null
          pickup_address?: string | null
          created_at?: string
          reference_code?: string | null
          returned_at?: string | null
          quote_expired_at?: string | null
          quote_expired_notice_at?: string | null
          rental_coefficient_override?: number | null
        }
      }
      rental_items: {
        Row: {
          id: string
          rental_id: string
          equipment_id: string
          quantity: number
          price_per_day: number
          discount_percent: number
          created_at: string
          group_id: string | null
          position: number
          is_external: boolean | null
          external_name: string | null
          external_description: string | null
          external_type: string | null
          external_subtype: string | null
          external_supplier: string | null
        }
        Insert: {
          id?: string
          rental_id: string
          equipment_id: string
          quantity?: number
          price_per_day?: number
          discount_percent?: number
          created_at?: string
          group_id?: string | null
          position?: number
          is_external?: boolean | null
          external_name?: string | null
          external_description?: string | null
          external_type?: string | null
          external_subtype?: string | null
          external_supplier?: string | null
        }
        Update: {
          id?: string
          rental_id?: string
          equipment_id?: string
          quantity?: number
          price_per_day?: number
          discount_percent?: number
          created_at?: string
          group_id?: string | null
          position?: number
          is_external?: boolean | null
          external_name?: string | null
          external_description?: string | null
          external_type?: string | null
          external_subtype?: string | null
          external_supplier?: string | null
        }
      }
      rental_item_groups: {
        Row: {
          id: string
          rental_id: string
          name: string
          position: number
          created_at: string
          parent_group_id: string | null
        }
        Insert: {
          id?: string
          rental_id: string
          name: string
          position?: number
          created_at?: string
          parent_group_id?: string | null
        }
        Update: {
          id?: string
          rental_id?: string
          name?: string
          position?: number
          created_at?: string
          parent_group_id?: string | null
        }
      }
      rental_affectation: {
        Row: {
          id: string
          rental_id: string
          personnel_id: string
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          personnel_id: string
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          personnel_id?: string
          created_at?: string
        }
      }
      rental_personnel_services: {
        Row: {
          id: string
          rental_id: string
          service_record_id: string
          quantity: number
          days: number
          discount_percent: number
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          service_record_id: string
          quantity?: number
          days?: number
          discount_percent?: number
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          service_record_id?: string
          quantity?: number
          days?: number
          discount_percent?: number
          created_at?: string
        }
      }
      rental_insurance_services: {
        Row: {
          id: string
          rental_id: string
          service_record_id: string
          days: number
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          service_record_id: string
          days?: number
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          service_record_id?: string
          days?: number
          created_at?: string
        }
      }
      rental_other_services: {
        Row: {
          id: string
          rental_id: string
          service_record_id: string
          quantity: number
          days: number
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          service_record_id: string
          quantity?: number
          days?: number
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          service_record_id?: string
          quantity?: number
          days?: number
          created_at?: string
        }
      }
      rental_returns: {
        Row: {
          id: string
          rental_id: string
          status: string
          started_by: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          status?: string
          started_by?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          status?: string
          started_by?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
      rental_return_items: {
        Row: {
          id: string
          return_id: string
          equipment_id: string | null
          equipment_name: string | null
          equipment_type: string | null
          expected_quantity: number
          returned_quantity: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          return_id: string
          equipment_id?: string | null
          equipment_name?: string | null
          equipment_type?: string | null
          expected_quantity?: number
          returned_quantity?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          return_id?: string
          equipment_id?: string | null
          equipment_name?: string | null
          equipment_type?: string | null
          expected_quantity?: number
          returned_quantity?: number
          notes?: string | null
          created_at?: string
        }
      }
      personnel: {
        Row: {
          id: string
          first_name: string
          last_name: string
          email: string
          phone: string
          role: string
          status: string
          hire_date: string
          salary: number
          avatar_url: string | null
          address: string | null
          emergency_contact: Json
          skills: string[]
          certifications: string[]
          created_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          email: string
          phone: string
          role: string
          status?: string
          hire_date: string
          salary?: number
          avatar_url?: string | null
          address?: string | null
          emergency_contact?: Json
          skills?: string[]
          certifications?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          email?: string
          phone?: string
          role?: string
          status?: string
          hire_date?: string
          salary?: number
          avatar_url?: string | null
          address?: string | null
          emergency_contact?: Json
          skills?: string[]
          certifications?: string[]
          created_at?: string
        }
      }
      personnel_activities: {
        Row: {
          id: string
          personnel_id: string | null
          type: string
          title: string
          description: string | null
          rental_id: string | null
          client_name: string | null
          location: string | null
          start_time: string
          end_time: string | null
          duration_minutes: number | null
          status: string
          notes: string | null
          equipment_involved: string[]
          created_at: string
        }
        Insert: {
          id?: string
          personnel_id?: string | null
          type: string
          title: string
          description?: string | null
          rental_id?: string | null
          client_name?: string | null
          location?: string | null
          start_time: string
          end_time?: string | null
          duration_minutes?: number | null
          status?: string
          notes?: string | null
          equipment_involved?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          personnel_id?: string | null
          type?: string
          title?: string
          description?: string | null
          rental_id?: string | null
          client_name?: string | null
          location?: string | null
          start_time?: string
          end_time?: string | null
          duration_minutes?: number | null
          status?: string
          notes?: string | null
          equipment_involved?: string[]
          created_at?: string
        }
      }
      personnel_chat_messages: {
        Row: {
          id: string
          thread_id: string
          author_id: string | null
          reply_to_message_id: string | null
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          author_id?: string | null
          reply_to_message_id?: string | null
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          author_id?: string | null
          reply_to_message_id?: string | null
          message?: string
          created_at?: string
        }
      }
      personnel_chat_message_reactions: {
        Row: {
          message_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          emoji?: string
          created_at?: string
        }
      }
      personnel_chat_message_attachments: {
        Row: {
          id: string
          message_id: string
          storage_path: string
          file_name: string | null
          file_type: string | null
          file_size: number | null
          public_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          storage_path: string
          file_name?: string | null
          file_type?: string | null
          file_size?: number | null
          public_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          storage_path?: string
          file_name?: string | null
          file_type?: string | null
          file_size?: number | null
          public_url?: string | null
          created_at?: string
        }
      }
      personnel_chat_participants: {
        Row: {
          thread_id: string
          user_id: string
          added_at: string
          last_read_at: string | null
        }
        Insert: {
          thread_id: string
          user_id: string
          added_at?: string
          last_read_at?: string | null
        }
        Update: {
          thread_id?: string
          user_id?: string
          added_at?: string
          last_read_at?: string | null
        }
      }
      personnel_chat_threads: {
        Row: {
          id: string
          topic: string | null
          is_group: boolean
          created_at: string
          updated_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          topic?: string | null
          is_group?: boolean
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          topic?: string | null
          is_group?: boolean
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
      }
      personnel_schedules: {
        Row: {
          id: string
          personnel_id: string | null
          date: string
          start_time: string
          end_time: string
          break_duration: number
          is_working_day: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          personnel_id?: string | null
          date: string
          start_time: string
          end_time: string
          break_duration?: number
          is_working_day?: boolean
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          personnel_id?: string | null
          date?: string
          start_time?: string
          end_time?: string
          break_duration?: number
          is_working_day?: boolean
          notes?: string | null
          created_at?: string
        }
      }
      calendar_events: {
        Row: {
          id: string
          title: string
          description: string | null
          type: string
          start_date: string
          end_date: string
          color: string | null
          rental_id: string | null
          service_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          type: string
          start_date: string
          end_date: string
          color?: string | null
          rental_id?: string | null
          service_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          type?: string
          start_date?: string
          end_date?: string
          color?: string | null
          rental_id?: string | null
          service_id?: string | null
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          client_id: string | null
          rental_id: string | null
          amount_ht: number
          amount_ttc: number
          vat_amount: number
          status: string
          due_date: string | null
          paid_date: string | null
          payment_method: string | null
          notes: string | null
          created_at: string
          origin: string
        }
        Insert: {
          id?: string
          invoice_number: string
          client_id?: string | null
          rental_id?: string | null
          amount_ht?: number
          amount_ttc?: number
          vat_amount?: number
          status?: string
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string
          origin?: string
        }
        Update: {
          id?: string
          invoice_number?: string
          client_id?: string | null
          rental_id?: string | null
          amount_ht?: number
          amount_ttc?: number
          vat_amount?: number
          status?: string
          due_date?: string | null
          paid_date?: string | null
          payment_method?: string | null
          notes?: string | null
          created_at?: string
          origin?: string
        }
      }
      payments: {
        Row: {
          id: string
          invoice_id: string | null
          rental_id: string | null
          amount: number
          payment_method: string
          payment_date: string
          reference: string | null
          status: string
          payment_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id?: string | null
          rental_id?: string | null
          amount: number
          payment_method: string
          payment_date: string
          reference?: string | null
          status?: string
          payment_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string | null
          rental_id?: string | null
          amount?: number
          payment_method?: string
          payment_date?: string
          reference?: string | null
          status?: string
          payment_type?: string | null
          created_at?: string
        }
      }
      rental_documents: {
        Row: {
          id: string
          rental_id: string
          doc_type: string
          title: string
          file_url: string
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          doc_type: string
          title: string
          file_url: string
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          doc_type?: string
          title?: string
          file_url?: string
          created_at?: string
        }
      }
      rental_document_shares: {
        Row: {
          id: string
          document_id: string
          token: string
          status: string
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          token: string
          status?: string
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          token?: string
          status?: string
          expires_at?: string | null
          created_at?: string
        }
      }
      rental_dossier_entries: {
        Row: {
          id: string
          rental_id: string
          parent_id: string | null
          entry_type: string
          name: string
          file_url: string | null
          file_name: string | null
          file_type: string | null
          file_size: number | null
          color: string | null
          icon: string | null
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          parent_id?: string | null
          entry_type: string
          name: string
          file_url?: string | null
          file_name?: string | null
          file_type?: string | null
          file_size?: number | null
          color?: string | null
          icon?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          parent_id?: string | null
          entry_type?: string
          name?: string
          file_url?: string | null
          file_name?: string | null
          file_type?: string | null
          file_size?: number | null
          color?: string | null
          icon?: string | null
          created_at?: string
        }
      }
      rental_dossier_shares: {
        Row: {
          id: string
          rental_id: string
          root_entry_id: string | null
          token: string
          status: string
          expires_at: string | null
          password_hash: string | null
          password_salt: string | null
          access_mode: string
          whitelist_enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          root_entry_id?: string | null
          token: string
          status?: string
          expires_at?: string | null
          password_hash?: string | null
          password_salt?: string | null
          access_mode?: string
          whitelist_enabled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          root_entry_id?: string | null
          token?: string
          status?: string
          expires_at?: string | null
          password_hash?: string | null
          password_salt?: string | null
          access_mode?: string
          whitelist_enabled?: boolean
          created_at?: string
        }
      }
      rental_dossier_share_access_codes: {
        Row: {
          id: string
          share_id: string
          email: string
          code: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          share_id: string
          email: string
          code: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          share_id?: string
          email?: string
          code?: string
          expires_at?: string
          created_at?: string
        }
      }
      rental_dossier_share_access_sessions: {
        Row: {
          id: string
          share_id: string
          email: string
          token: string
          expires_at: string
          method: string
          created_at: string
        }
        Insert: {
          id?: string
          share_id: string
          email: string
          token: string
          expires_at: string
          method?: string
          created_at?: string
        }
        Update: {
          id?: string
          share_id?: string
          email?: string
          token?: string
          expires_at?: string
          method?: string
          created_at?: string
        }
      }
      rental_dossier_whitelist_emails: {
        Row: {
          id: string
          rental_id: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          email?: string
          created_at?: string
        }
      }
      rental_dossier_whitelist_verifications: {
        Row: {
          id: string
          rental_id: string
          email: string
          code: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          email: string
          code: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          email?: string
          code?: string
          expires_at?: string
          created_at?: string
        }
      }
      rental_milestones: {
        Row: {
          id: string
          rental_id: string
          title: string
          description: string | null
          start_at: string
          end_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          title: string
          description?: string | null
          start_at: string
          end_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          title?: string
          description?: string | null
          start_at?: string
          end_at?: string | null
          created_at?: string
        }
      }
      rental_milestone_personnel: {
        Row: {
          id: string
          milestone_id: string
          personnel_id: string
          created_at: string
        }
        Insert: {
          id?: string
          milestone_id: string
          personnel_id: string
          created_at?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          personnel_id?: string
          created_at?: string
        }
      }
      rental_milestone_vehicles: {
        Row: {
          id: string
          milestone_id: string
          vehicle_id: string
          created_at: string
        }
        Insert: {
          id?: string
          milestone_id: string
          vehicle_id: string
          created_at?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          vehicle_id?: string
          created_at?: string
        }
      }
      rental_milestone_items: {
        Row: {
          id: string
          milestone_id: string
          rental_item_id: string
          created_at: string
        }
        Insert: {
          id?: string
          milestone_id: string
          rental_item_id: string
          created_at?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          rental_item_id?: string
          created_at?: string
        }
      }
      rental_tasks: {
        Row: {
          id: string
          rental_id: string
          status: string
          title: string
          description: string | null
          image_url: string | null
          starts_at: string | null
          ends_at: string | null
          created_by: string | null
          created_by_name: string
          updated_by: string | null
          updated_by_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          status?: string
          title: string
          description?: string | null
          image_url?: string | null
          starts_at?: string | null
          ends_at?: string | null
          created_by?: string | null
          created_by_name?: string
          updated_by?: string | null
          updated_by_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          status?: string
          title?: string
          description?: string | null
          image_url?: string | null
          starts_at?: string | null
          ends_at?: string | null
          created_by?: string | null
          created_by_name?: string
          updated_by?: string | null
          updated_by_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      rental_task_assignees: {
        Row: {
          id: string
          task_id: string
          personnel_id: string
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          personnel_id: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          personnel_id?: string
          created_at?: string
        }
      }
      rental_task_checklist_items: {
        Row: {
          id: string
          task_id: string
          title: string
          sort_order: number
          is_completed: boolean
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          task_id: string
          title: string
          sort_order?: number
          is_completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          title?: string
          sort_order?: number
          is_completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      rental_activity_logs: {
        Row: {
          id: string
          rental_id: string
          actor_id: string | null
          actor_name: string
          action: string
          details: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          actor_id?: string | null
          actor_name: string
          action: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          actor_id?: string | null
          actor_name?: string
          action?: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      rental_maintenance_charges: {
        Row: {
          id: string
          rental_id: string
          maintenance_id: string | null
          label: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          rental_id: string
          maintenance_id?: string | null
          label: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          rental_id?: string
          maintenance_id?: string | null
          label?: string
          amount?: number
          created_at?: string
        }
      }
      maintenance_documents: {
        Row: {
          id: string
          maintenance_id: string
          doc_type: string
          title: string
          file_url: string
          created_at: string
        }
        Insert: {
          id?: string
          maintenance_id: string
          doc_type: string
          title: string
          file_url: string
          created_at?: string
        }
        Update: {
          id?: string
          maintenance_id?: string
          doc_type?: string
          title?: string
          file_url?: string
          created_at?: string
        }
      }
      maintenance_tasks: {
        Row: {
          id: string
          equipment_id: string | null
          personnel_id: string | null
          type: string
          priority: string
          title: string
          description: string | null
          scheduled_date: string
          completed_date: string | null
          status: string
          cost: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id?: string | null
          personnel_id?: string | null
          type: string
          priority?: string
          title: string
          description?: string | null
          scheduled_date: string
          completed_date?: string | null
          status?: string
          cost?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string | null
          personnel_id?: string | null
          type?: string
          priority?: string
          title?: string
          description?: string | null
          scheduled_date?: string
          completed_date?: string | null
          status?: string
          cost?: number
          notes?: string | null
          created_at?: string
        }
      }
      service_records: {
        Row: {
          id: string
          category: string
          title: string
          cost_per_person: number | null
          price: number | null
          provider: string | null
          coverage: string[] | null
          start_date: string | null
          end_date: string | null
          amount_per_day: number | null
          category_id: string | null
          subcategory_id: string | null
          status: string
          proof_file_url: string | null
          proof_file_name: string | null
          proof_file_type: string | null
          proof_file_size: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          category: string
          title: string
          cost_per_person?: number | null
          price?: number | null
          provider?: string | null
          coverage?: string[] | null
          start_date?: string | null
          end_date?: string | null
          amount_per_day?: number | null
          category_id?: string | null
          subcategory_id?: string | null
          status?: string
          proof_file_url?: string | null
          proof_file_name?: string | null
          proof_file_type?: string | null
          proof_file_size?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          category?: string
          title?: string
          cost_per_person?: number | null
          price?: number | null
          provider?: string | null
          coverage?: string[] | null
          start_date?: string | null
          end_date?: string | null
          amount_per_day?: number | null
          category_id?: string | null
          subcategory_id?: string | null
          status?: string
          proof_file_url?: string | null
          proof_file_name?: string | null
          proof_file_type?: string | null
          proof_file_size?: number | null
          notes?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_maintenance_task: {
        Args: {
          p_task_id: string
          p_completed_at?: string | null
        }
        Returns: undefined
      }
      delete_maintenance_task: {
        Args: {
          p_task_id: string
        }
        Returns: undefined
      }
      personnel_chat_get_threads: {
        Args: {
          p_user_id: string
        }
        Returns: {
          id: string
          topic: string | null
          is_group: boolean
          created_at: string
          updated_at: string
          last_message_at: string | null
          participants: Json
          last_message: Json | null
          unread_count: number
        }[]
      }
      personnel_chat_get_messages: {
        Args: {
          p_user_id: string
          p_thread_id: string
          p_limit?: number
          p_before?: string | null
        }
        Returns: {
          id: string
          thread_id: string
          author_id: string | null
          message: string
          created_at: string
          reply_to: Json | null
          reply_to_message_id: string | null
          attachments: Json
          reactions: Json
        }[]
      }
      personnel_chat_send_message: {
        Args: {
          p_thread_id: string
          p_author: string
          p_message: string
          p_reply_to?: string | null
          p_attachments?: Json
        }
        Returns: {
          id: string
          thread_id: string
          author_id: string | null
          message: string
          created_at: string
          reply_to: Json | null
          reply_to_message_id: string | null
          attachments: Json
          reactions: Json
        }[]
      }
      personnel_chat_mark_read: {
        Args: {
          p_thread_id: string
          p_user_id: string
          p_read_at?: string | null
        }
        Returns: undefined
      }
      personnel_chat_start_direct_thread: {
        Args: {
          p_requester: string
          p_partner: string
        }
        Returns: {
          id: string
          topic: string | null
          is_group: boolean
          created_at: string
          updated_at: string
          last_message_at: string | null
          participants: Json
          last_message: Json | null
          unread_count: number
        }[]
      }
      personnel_chat_toggle_reaction: {
        Args: {
          p_message_id: string
          p_user_id: string
          p_emoji: string
        }
        Returns: Json
      }
    }
    Enums: {
      personnel_role: 'admin' | 'manager' | 'technician' | 'driver' | 'commercial' | 'accountant'
      personnel_status: 'active' | 'inactive' | 'vacation' | 'sick_leave'
      activity_type: 'preparation' | 'delivery' | 'pickup' | 'maintenance' | 'service' | 'meeting' | 'training'
      activity_status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
      event_type: 'task' | 'meeting' | 'reminder' | 'rental' | 'service'
      invoice_status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
      payment_status: 'pending' | 'completed' | 'failed'
      maintenance_type: 'preventive' | 'corrective' | 'inspection'
      maintenance_priority: 'low' | 'medium' | 'high' | 'urgent'
      maintenance_status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
