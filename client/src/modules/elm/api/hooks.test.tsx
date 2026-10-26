import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { http } from "../../../lib/http";
import {
  useCreateLeaveApplication, useLeaveApplications, useLeaveHistory,
  useLeaveHolidays, useWithdrawLeave,
} from "./hooks";

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, wrapper: Wrapper };
}

describe("leave API integration", () => {
  it("loads older applications through cursor links", async () => {
    const get = vi.spyOn(http, "get")
      .mockResolvedValueOnce({ data: {
        results: [{ id: 1 }], next: "http://localhost/api/v1/leave/applications?cursor=abc",
      } })
      .mockResolvedValueOnce({ data: { results: [{ id: 2 }], next: null } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useLeaveApplications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual([1, 2]);
    expect(get).toHaveBeenNthCalledWith(2, "/leave/applications?cursor=abc");
  });

  it("does not query applications without view permission", async () => {
    const get = vi.spyOn(http, "get");
    const { wrapper } = setup();
    const { result } = renderHook(() => useLeaveApplications(false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps calendar years in separate caches", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ data: { results: [], next: null } });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ year }) => useLeaveHolidays(year), {
      wrapper, initialProps: { year: 2026 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ year: 2027 });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/leave/calendar?year=2027"));
    expect(get).toHaveBeenCalledWith("/leave/calendar?year=2026");
  });

  it("preserves first and second half payload fields", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({ data: { id: 12 } });
    const { wrapper, qc } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateLeaveApplication(), { wrapper });
    const body = {
      category_code: "CL", start_date: "2026-11-02", end_date: "2026-11-02",
      half_day: true, half_day_period: "second" as const,
      reason: "Personal", substitute_user_id: null,
    };
    await act(async () => { await result.current.mutateAsync(body); });
    expect(post).toHaveBeenCalledWith("/leave/applications", body);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employee-leave"] });
  });

  it("surfaces failed withdrawal without marking caches successful", async () => {
    const failure = { response: { status: 409 } };
    vi.spyOn(http, "post").mockRejectedValue(failure);
    const { wrapper, qc } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useWithdrawLeave(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(12)).rejects.toEqual(failure);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not fetch history before an application is selected", () => {
    const get = vi.spyOn(http, "get");
    const { wrapper } = setup();
    renderHook(() => useLeaveHistory(null), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("propagates errors on later pages instead of showing an incomplete list", async () => {
    vi.spyOn(http, "get")
      .mockResolvedValueOnce({ data: { results: [{ id: 1 }], next: "/api/v1/leave/applications?cursor=x" } })
      .mockRejectedValueOnce(new Error("Connection lost"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useLeaveApplications(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
