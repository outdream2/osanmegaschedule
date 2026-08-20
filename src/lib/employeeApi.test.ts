// @vitest-environment jsdom
// 2026-08-20 · employeeApi · fetch 기반 · updateEmployee / create / delete / upload
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateEmployee,
  updateEmployeeFull,
  createEmployee,
  deleteEmployee,
  uploadResume,
  deleteResume,
  uploadContract,
  uploadResignationFile,
} from "./employeeApi";
import type { Employee } from "../types";

const baseEmployee: Employee = {
  id: 42,
  name: "홍길동",
  position: "약사",
  rank: "약사",
  employmentType: "정직원",
  hireDate: "2024-01-01",
  retireDate: null,
  description: "",
  workplace: "매장",
  gender: "M",
  phone: "01012345678",
  annual_leave_days: 15,
  level: 3,
  address: "서울",
  email: "test@example.com",
  bankbook_image_url: null,
} as any;

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 42, name: "홍길동" }),
  });
  (globalThis as any).fetch = mockFetch;
});

describe("updateEmployee · 부분 갱신", () => {
  it("PUT · /api/employees/{id} · base merge + patch", async () => {
    await updateEmployee(baseEmployee, { level: 9 });
    const url = mockFetch.mock.calls[0][0];
    const opts = mockFetch.mock.calls[0][1];
    expect(url).toBe("/api/employees/42");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body);
    expect(body.name).toBe("홍길동"); // base 유지
    expect(body.level).toBe(9);       // patch 덮어씀
    expect(body.position).toBe("약사");
  });

  it("returns merged employee", async () => {
    const result = await updateEmployee(baseEmployee, { level: 5 });
    expect(result.id).toBe(42);
    expect(result.level).toBe(5);
    expect(result.name).toBe("홍길동");
  });

  it("null 필드 유지 · retireDate null · bankbook_image_url null", async () => {
    await updateEmployee(baseEmployee, {});
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.retireDate).toBeNull();
    expect(body.bankbook_image_url).toBeNull();
  });

  it("서버 에러 · throw · body.error 메시지", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "이름 필수" }),
    });
    await expect(updateEmployee(baseEmployee, {})).rejects.toThrow("이름 필수");
  });

  it("서버 응답 JSON parse 실패 · statusText fallback", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Error",
      json: async () => { throw new Error("bad json"); },
    });
    await expect(updateEmployee(baseEmployee, {})).rejects.toThrow("Internal Error");
  });
});

describe("updateEmployeeFull", () => {
  it("PUT · full payload · 서버 응답 반환", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 100, name: "새로 저장됨" }),
    });
    const result = await updateEmployeeFull(100, { name: "새 이름" });
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/100");
    expect(result.name).toBe("새로 저장됨");
  });
});

describe("createEmployee", () => {
  it("POST · /api/employees · payload · 응답 반환", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 999, name: "신규직원" }),
    });
    const result = await createEmployee({ name: "신규직원", position: "캐셔" });
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(result.id).toBe(999);
  });
});

describe("deleteEmployee", () => {
  it("DELETE · /api/employees/{id}", async () => {
    await deleteEmployee(42);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/42");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("서버 에러 · throw", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    });
    await expect(deleteEmployee(999)).rejects.toThrow();
  });
});

describe("uploadResume", () => {
  it("POST FormData · resume field · url 반환", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://drive.google.com/xyz" }),
    });
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    const result = await uploadResume(42, file);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/42/resume");
    expect(mockFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(result.url).toBe("https://drive.google.com/xyz");
  });
});

describe("deleteResume", () => {
  it("DELETE · /api/employees/{id}/resume", async () => {
    await deleteResume(42);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/42/resume");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("uploadContract", () => {
  it("POST FormData · contract · url 반환", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://supabase/contracts/42.pdf" }),
    });
    const file = new File(["x"], "contract.pdf");
    const result = await uploadContract(42, file);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/42/contract");
    expect(result.url).toBe("https://supabase/contracts/42.pdf");
  });

  it("url 없음 · undefined", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await uploadContract(42, new File(["x"], "c.pdf"));
    expect(result.url).toBeUndefined();
  });
});

describe("uploadResignationFile", () => {
  it("POST · file field · resignation-file", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "url" }),
    });
    await uploadResignationFile(42, new File(["x"], "r.pdf"));
    expect(mockFetch.mock.calls[0][0]).toBe("/api/employees/42/resignation-file");
  });
});
