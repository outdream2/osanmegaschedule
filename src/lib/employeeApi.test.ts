// @vitest-environment jsdom
// 2026-08-20 · employeeApi · updateEmployee / create / delete / upload
// 2026-08-21 · Framework Phase 3 · apiClient 이관 반영 · vi.mock("./apiClient") 사용
import { describe, it, expect, vi, beforeEach } from "vitest";

// 2026-08-21 · apiClient 모듈 mock (module 레벨)
vi.mock("./apiClient", () => {
  class ApiError extends Error {
    status: number;
    code?: string;
    data?: unknown;
    constructor(status: number, message: string, code?: string, data?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.data = data;
    }
  }
  return {
    ApiError,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

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
import { api, ApiError } from "./apiClient";
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

const mockPut = api.put as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;
const mockDel = api.del as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPut.mockReset().mockResolvedValue({ data: { id: 42, name: "홍길동" }, status: 200, headers: {} });
  mockPost.mockReset().mockResolvedValue({ data: { id: 42, name: "홍길동" }, status: 200, headers: {} });
  mockDel.mockReset().mockResolvedValue({ data: null, status: 200, headers: {} });
});

describe("updateEmployee · 부분 갱신", () => {
  it("PUT · /api/employees/{id} · base merge + patch", async () => {
    await updateEmployee(baseEmployee, { level: 9 });
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [url, body] = mockPut.mock.calls[0];
    expect(url).toBe("/api/employees/42");
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
    const [, body] = mockPut.mock.calls[0];
    expect(body.retireDate).toBeNull();
    expect(body.bankbook_image_url).toBeNull();
  });

  it("서버 에러 (ApiError with body.error) · throw · body.error 메시지", async () => {
    mockPut.mockRejectedValue(new ApiError(400, "Bad Request", undefined, { error: "이름 필수" }));
    await expect(updateEmployee(baseEmployee, {})).rejects.toThrow("이름 필수");
  });

  it("서버 에러 (ApiError without body.error) · ApiError.message fallback", async () => {
    mockPut.mockRejectedValue(new ApiError(500, "Internal Error"));
    await expect(updateEmployee(baseEmployee, {})).rejects.toThrow("Internal Error");
  });
});

describe("updateEmployeeFull", () => {
  it("PUT · full payload · 서버 응답 반환", async () => {
    mockPut.mockResolvedValue({ data: { id: 100, name: "새로 저장됨" }, status: 200, headers: {} });
    const result = await updateEmployeeFull(100, { name: "새 이름" });
    expect(mockPut.mock.calls[0][0]).toBe("/api/employees/100");
    expect(result.name).toBe("새로 저장됨");
  });
});

describe("createEmployee", () => {
  it("POST · /api/employees · payload · 응답 반환", async () => {
    mockPost.mockResolvedValue({ data: { id: 999, name: "신규직원" }, status: 200, headers: {} });
    const result = await createEmployee({ name: "신규직원", position: "캐셔" });
    expect(mockPost.mock.calls[0][0]).toBe("/api/employees");
    expect(result.id).toBe(999);
  });
});

describe("deleteEmployee", () => {
  it("DELETE · /api/employees/{id}", async () => {
    await deleteEmployee(42);
    expect(mockDel.mock.calls[0][0]).toBe("/api/employees/42");
  });

  it("서버 에러 · throw", async () => {
    mockDel.mockRejectedValue(new ApiError(404, "Not Found"));
    await expect(deleteEmployee(999)).rejects.toThrow();
  });
});

describe("uploadResume", () => {
  it("POST FormData · resume field · url 반환", async () => {
    mockPost.mockResolvedValue({ data: { url: "https://drive.google.com/xyz" }, status: 200, headers: {} });
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    const result = await uploadResume(42, file);
    expect(mockPost.mock.calls[0][0]).toBe("/api/employees/42/resume");
    expect(mockPost.mock.calls[0][1]).toBeInstanceOf(FormData);
    expect(result.url).toBe("https://drive.google.com/xyz");
  });
});

describe("deleteResume", () => {
  it("DELETE · /api/employees/{id}/resume", async () => {
    await deleteResume(42);
    expect(mockDel.mock.calls[0][0]).toBe("/api/employees/42/resume");
  });
});

describe("uploadContract", () => {
  it("POST FormData · contract · url 반환", async () => {
    mockPost.mockResolvedValue({ data: { url: "https://supabase/contracts/42.pdf" }, status: 200, headers: {} });
    const file = new File(["x"], "contract.pdf");
    const result = await uploadContract(42, file);
    expect(mockPost.mock.calls[0][0]).toBe("/api/employees/42/contract");
    expect(result.url).toBe("https://supabase/contracts/42.pdf");
  });

  it("url 없음 · undefined", async () => {
    mockPost.mockResolvedValue({ data: {}, status: 200, headers: {} });
    const result = await uploadContract(42, new File(["x"], "c.pdf"));
    expect(result.url).toBeUndefined();
  });
});

describe("uploadResignationFile", () => {
  it("POST · file field · resignation-file", async () => {
    mockPost.mockResolvedValue({ data: { url: "url" }, status: 200, headers: {} });
    await uploadResignationFile(42, new File(["x"], "r.pdf"));
    expect(mockPost.mock.calls[0][0]).toBe("/api/employees/42/resignation-file");
  });
});
