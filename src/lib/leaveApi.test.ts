// @vitest-environment jsdom
// 2026-09-14 · leaveApi · 연차 CRUD 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  listLeaveRequests,
  getLeavePendingCount,
  createLeaveRequest,
  reviewLeaveRequest,
  deleteLeaveRequest,
} from "./leaveApi";
import { api } from "./apiClient";

const sample = {
  id: "L001",
  employee_id: 42,
  employee_name: "홍길동",
  leave_type: "연차",
  start_date: "2026-10-01",
  end_date: "2026-10-02",
  reason: "여행",
  status: "pending" as const,
  created_at: "2026-09-14T10:00:00Z",
};

describe("listLeaveRequests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("params 없음 · base URL", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [sample] });
    const list = await listLeaveRequests();
    expect(list).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/api/leave-requests");
  });

  it("employeeId 필터", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [] });
    await listLeaveRequests({ employeeId: 42 });
    expect(api.get).toHaveBeenCalledWith("/api/leave-requests?employeeId=42");
  });

  it("all=true · 관리자", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [] });
    await listLeaveRequests({ all: true });
    expect(api.get).toHaveBeenCalledWith("/api/leave-requests?all=true");
  });
});

describe("getLeavePendingCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("count 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { count: 5 } });
    expect(await getLeavePendingCount()).toBe(5);
  });

  it("빈 응답 · 0", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await getLeavePendingCount()).toBe(0);
  });
});

describe("createLeaveRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST · payload 그대로", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await createLeaveRequest({
      employee_id: 42,
      employee_name: "홍길동",
      leave_type: "연차",
      start_date: "2026-10-01",
      end_date: "2026-10-02",
      reason: "여행",
    });
    expect(api.post).toHaveBeenCalledWith("/api/leave-requests", {
      employee_id: 42,
      employee_name: "홍길동",
      leave_type: "연차",
      start_date: "2026-10-01",
      end_date: "2026-10-02",
      reason: "여행",
    });
  });
});

describe("reviewLeaveRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUT · id/status/note", async () => {
    (api.put as any).mockResolvedValueOnce({ data: null });
    await reviewLeaveRequest("L001", { status: "approved", reviewer_note: "OK" });
    expect(api.put).toHaveBeenCalledWith("/api/leave-requests/L001", {
      status: "approved",
      reviewer_note: "OK",
    });
  });
});

describe("deleteLeaveRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETE · id URL", async () => {
    (api.del as any).mockResolvedValueOnce({});
    await deleteLeaveRequest("L001");
    expect(api.del).toHaveBeenCalledWith("/api/leave-requests/L001");
  });
});
