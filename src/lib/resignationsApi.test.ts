// @vitest-environment jsdom
// 2026-09-14 · resignationsApi · 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  listResignations,
  getResignationPendingCount,
  createResignation,
  reviewResignation,
} from "./resignationsApi";
import { api } from "./apiClient";

describe("listResignations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("리스트 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [{ id: 1, employee_name: "홍길동" }] });
    const list = await listResignations();
    expect(list).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/api/resignations");
  });

  it("Array 아닌 응답 · 빈 배열", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await listResignations()).toEqual([]);
  });
});

describe("getResignationPendingCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("count 반환", async () => {
    (api.get as any).mockResolvedValueOnce({ data: { count: 3 } });
    expect(await getResignationPendingCount()).toBe(3);
    expect(api.get).toHaveBeenCalledWith("/api/resignations/pending-count");
  });

  it("빈 응답 · 0", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await getResignationPendingCount()).toBe(0);
  });
});

describe("createResignation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST · payload 그대로", async () => {
    (api.post as any).mockResolvedValueOnce({ data: null });
    await createResignation({
      employee_id: 42,
      employee_name: "홍길동",
      last_work_date: "2026-10-31",
      reason: "개인 사정",
      signature_data_url: "data:image/png;base64,xxx",
    });
    expect(api.post).toHaveBeenCalledWith("/api/resignations", {
      employee_id: 42,
      employee_name: "홍길동",
      last_work_date: "2026-10-31",
      reason: "개인 사정",
      signature_data_url: "data:image/png;base64,xxx",
    });
  });
});

describe("reviewResignation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCH · id + payload", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: null });
    await reviewResignation(1, {
      status: "approved",
      approved_by: "관리자",
      approved_by_id: 1,
    });
    expect(api.patch).toHaveBeenCalledWith("/api/resignations/1", {
      status: "approved",
      approved_by: "관리자",
      approved_by_id: 1,
    });
  });

  it("반려 · reject_reason 포함", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: null });
    await reviewResignation(2, {
      status: "rejected",
      reject_reason: "재검토 필요",
    });
    expect(api.patch).toHaveBeenCalledWith("/api/resignations/2", {
      status: "rejected",
      reject_reason: "재검토 필요",
    });
  });
});
