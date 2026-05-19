export type PersonnelRole = 'admin' | 'manager' | 'technician' | 'driver' | 'commercial' | 'accountant';
export type PersonnelStatus = 'active' | 'inactive' | 'vacation' | 'sick_leave';
export type ActivityType = 'preparation' | 'delivery' | 'pickup' | 'maintenance' | 'service' | 'meeting' | 'training';
export type ActivityStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Personnel {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: PersonnelRole;
  status: PersonnelStatus;
  hire_date: string;
  salary: number;
  avatar_url?: string;
  address: string;
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  };
  skills: string[];
  certifications: string[];
  created_at: string;
}

export interface PersonnelActivity {
  id: string;
  personnel_id: string;
  personnel_name: string;
  type: ActivityType;
  title: string;
  description: string;
  rental_id?: string;
  client_name?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  status: ActivityStatus;
  notes?: string;
  equipment_involved?: string[];
  created_at: string;
}

export interface PersonnelSchedule {
  id: string;
  personnel_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_duration: number;
  is_working_day: boolean;
  notes?: string;
}

export interface PersonnelPerformance {
  personnel_id: string;
  month: string;
  activities_completed: number;
  total_hours: number;
  efficiency_score: number;
  client_satisfaction: number;
  punctuality_score: number;
  revenue_generated: number;
}