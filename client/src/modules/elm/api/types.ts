export interface Page<T> {
  results: T[];
  next: string | null;
  previous: string | null;
}

export interface LeaveCategory {
  id: number;
  code: string;
  label: string;
  description: string;
  annual_entitlement: string;
  requires_substitute: boolean;
}

export interface LeaveBalance {
  id: number;
  category: LeaveCategory;
  leave_year: string;
  available: string;
  used: string;
  pending: string;
}

export interface LeaveApplication {
  id: number;
  category: LeaveCategory;
  start_date: string;
  end_date: string;
  half_day: boolean;
  half_day_period: "" | "first" | "second";
  reason: string;
  status: string;
  current_stage: string;
  substitute_user_id: number | null;
  submitted_at: string;
  decision_note: string;
  day_count: string;
}

export interface ApplicationInput {
  category_code: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  half_day_period: "" | "first" | "second";
  reason: string;
  substitute_user_id: number | null;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  kind: string;
  is_restricted: boolean;
}

export interface LeaveEvent {
  id: number;
  action: string;
  from_status: string;
  to_status: string;
  created_at: string;
}
