import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "../../../lib/http";
import type {
  ApplicationInput, Holiday, LeaveApplication, LeaveBalance,
  LeaveCategory, LeaveEvent, Page,
} from "./types";

const KEY = "employee-leave";

// Follow pagination so older applications and later calendar months remain visible.
async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: Page<T> = (await http.get<Page<T>>(next)).data;
    rows.push(...page.results);
    if (page.next) {
      const url = new URL(page.next, window.location.origin);
      next = url.pathname.replace(/^\/api\/v1/, "") + url.search;
    } else next = null;
  }
  return rows;
}

export function useLeaveCategories(enabled = true) {
  return useQuery({
    queryKey: [KEY, "categories"], enabled,
    queryFn: () => allPages<LeaveCategory>("/leave/categories"),
  });
}

export function useLeaveBalances(enabled = true) {
  return useQuery({
    queryKey: [KEY, "balances"], enabled,
    queryFn: () => allPages<LeaveBalance>("/leave/balances"),
  });
}

export function useLeaveApplications(enabled = true) {
  return useQuery({
    queryKey: [KEY, "applications"], enabled,
    queryFn: () => allPages<LeaveApplication>("/leave/applications"),
  });
}

export function useLeaveHolidays(year: number) {
  return useQuery({
    queryKey: [KEY, "calendar", year],
    queryFn: () => allPages<Holiday>(`/leave/calendar?year=${year}`),
  });
}

export function useLeaveHistory(id: number | null) {
  return useQuery({
    queryKey: [KEY, "history", id], enabled: id !== null,
    queryFn: () => allPages<LeaveEvent>(`/leave/applications/${id}/history`),
  });
}

export function useCreateLeaveApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ApplicationInput) =>
      (await http.post<LeaveApplication>("/leave/applications", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useWithdrawLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await http.post<LeaveApplication>(`/leave/applications/${id}/withdraw`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
