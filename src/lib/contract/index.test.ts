// @vitest-environment jsdom
// 2026-08-20 · contract · pure logic (localStorage + normalize + fetch/save)
// 2026-08-21 · Framework Phase 3 · apiClient 이관 반영 · vi.mock("../apiClient")
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 2026-08-21 · apiClient 모듈 mock (module 레벨) · fetch mock 은 제거
vi.mock("../apiClient", () => {
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
  loadContractSettings,
  fetchContractWriterSettings,
  saveContractWriterSettingsToServer,
  loadJobWages,
  normalizeClauses,
  loadContractClauses,
  fetchContractClauses,
  saveContractClausesToServer,
  cloneClauses,
  clausesEqual,
  DEFAULT_CONTRACT_SETTINGS,
  DEFAULT_JOB_WAGES,
  DEFAULT_CLAUSES,
  CONTRACT_SETTINGS_KEY,
  CONTRACT_WRITER_SETTINGS_DB_KEY,
  JOB_WAGES_KEY,
  CONTRACT_CLAUSES_KEY,
} from "./index";
import { api, ApiError } from "../apiClient";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;
const mockPut = api.put as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("상수 · key 및 default", () => {
  it("CONTRACT_SETTINGS_KEY · contract-writer-settings", () => {
    expect(CONTRACT_SETTINGS_KEY).toBe("contract-writer-settings");
  });

  it("CONTRACT_WRITER_SETTINGS_DB_KEY · contract_writer_settings", () => {
    expect(CONTRACT_WRITER_SETTINGS_DB_KEY).toBe("contract_writer_settings");
  });

  it("JOB_WAGES_KEY · contractJobWages:v1", () => {
    expect(JOB_WAGES_KEY).toBe("contractJobWages:v1");
  });

  it("CONTRACT_CLAUSES_KEY · contractClauses:v1", () => {
    expect(CONTRACT_CLAUSES_KEY).toBe("contractClauses:v1");
  });

  it("DEFAULT_CONTRACT_SETTINGS · 4 카테고리 + commonNotice", () => {
    expect(typeof DEFAULT_CONTRACT_SETTINGS.약사).toBe("string");
    expect(DEFAULT_CONTRACT_SETTINGS.약사.length).toBeGreaterThan(0);
    expect(typeof DEFAULT_CONTRACT_SETTINGS.매장).toBe("string");
    expect(typeof DEFAULT_CONTRACT_SETTINGS.창고).toBe("string");
    expect(DEFAULT_CONTRACT_SETTINGS.기타).toBeDefined();
    expect(DEFAULT_CONTRACT_SETTINGS.commonNotice).toBe("");
  });

  it("DEFAULT_JOB_WAGES · 4 카테고리 · weekday/weekend > 0", () => {
    for (const cat of ["약사", "매장", "창고", "기타"] as const) {
      expect(DEFAULT_JOB_WAGES[cat].weekday).toBeGreaterThan(0);
      expect(DEFAULT_JOB_WAGES[cat].weekend).toBeGreaterThan(0);
    }
  });

  it("DEFAULT_CLAUSES · 6 그룹 모두 채워짐", () => {
    for (const k of [
      "wageClauses", "workTimeClauses", "holidayClauses",
      "disciplineClauses", "etcClauses", "privacyClauses",
    ] as const) {
      expect(Array.isArray(DEFAULT_CLAUSES[k])).toBe(true);
      expect(DEFAULT_CLAUSES[k].length).toBeGreaterThan(0);
    }
  });
});

describe("loadContractSettings · localStorage 로더", () => {
  it("빈 상태 · DEFAULT 반환", () => {
    const r = loadContractSettings();
    expect(r).toEqual({ ...DEFAULT_CONTRACT_SETTINGS });
  });

  it("정상 값 · 그대로 반환", () => {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify({
      약사: "A", 매장: "B", 창고: "C", 기타: "D", commonNotice: "N",
    }));
    const r = loadContractSettings();
    expect(r.약사).toBe("A");
    expect(r.매장).toBe("B");
    expect(r.commonNotice).toBe("N");
  });

  it("잘못된 JSON · DEFAULT 반환", () => {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, "{not json");
    const r = loadContractSettings();
    expect(r).toEqual({ ...DEFAULT_CONTRACT_SETTINGS });
  });

  it("부분 값 · 빠진 필드 · DEFAULT 로 채움", () => {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify({ 약사: "X" }));
    const r = loadContractSettings();
    expect(r.약사).toBe("X");
    expect(r.매장).toBe(DEFAULT_CONTRACT_SETTINGS.매장);
    expect(r.commonNotice).toBe("");
  });

  it("배열 · 객체 아님 · DEFAULT 반환", () => {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify([1, 2, 3]));
    const r = loadContractSettings();
    // 배열은 typeof "object" 이므로 각 필드 미매칭 → DEFAULT 로 fill
    expect(r.약사).toBe(DEFAULT_CONTRACT_SETTINGS.약사);
  });
});

describe("fetchContractWriterSettings · 서버 조회 + fallback", () => {
  it("서버 성공 · value 있음 · localStorage 캐시 동기화", async () => {
    mockGet.mockResolvedValue({
      data: { value: { 약사: "S", 매장: "M", 창고: "W", 기타: "E", commonNotice: "N" } },
      status: 200, headers: {},
    });
    const r = await fetchContractWriterSettings();
    expect(r.약사).toBe("S");
    expect(localStorage.getItem(CONTRACT_SETTINGS_KEY)).toContain("S");
  });

  it("서버 실패 (network) · localStorage fallback", async () => {
    localStorage.setItem(CONTRACT_SETTINGS_KEY, JSON.stringify({
      약사: "L", 매장: "M", 창고: "W", 기타: "E",
    }));
    mockGet.mockRejectedValue(new Error("network"));
    const r = await fetchContractWriterSettings();
    expect(r.약사).toBe("L");
  });

  it("서버 성공 · value=null · localStorage 없음 · DEFAULT", async () => {
    mockGet.mockResolvedValue({ data: { value: null }, status: 200, headers: {} });
    const r = await fetchContractWriterSettings();
    expect(r).toEqual({ ...DEFAULT_CONTRACT_SETTINGS });
  });

  it("서버 응답 실패 · ApiError · fallback", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Internal Error"));
    const r = await fetchContractWriterSettings();
    expect(r).toEqual({ ...DEFAULT_CONTRACT_SETTINGS });
  });
});

describe("saveContractWriterSettingsToServer", () => {
  it("성공 · savedToServer=true · localStorage 저장", async () => {
    mockPost.mockResolvedValue({ data: {}, status: 200, headers: {} });
    const settings = { ...DEFAULT_CONTRACT_SETTINGS, 약사: "New" };
    const r = await saveContractWriterSettingsToServer(settings);
    expect(r.ok).toBe(true);
    expect(r.savedToServer).toBe(true);
    expect(localStorage.getItem(CONTRACT_SETTINGS_KEY)).toContain("New");
  });

  it("실패 (ApiError with data.error) · savedToServer=false · localStorage 는 저장됨", async () => {
    mockPost.mockRejectedValue(new ApiError(500, "Server Error", undefined, { error: "fail" }));
    const r = await saveContractWriterSettingsToServer({ ...DEFAULT_CONTRACT_SETTINGS, 약사: "Fallback" });
    expect(r.ok).toBe(true);
    expect(r.savedToServer).toBe(false);
    expect(r.error).toBe("fail");
    expect(localStorage.getItem(CONTRACT_SETTINGS_KEY)).toContain("Fallback");
  });

  it("네트워크 예외 (Error) · savedToServer=false · error 메시지", async () => {
    mockPost.mockRejectedValue(new Error("네트워크 오류"));
    const r = await saveContractWriterSettingsToServer(DEFAULT_CONTRACT_SETTINGS);
    expect(r.savedToServer).toBe(false);
    expect(r.error).toBe("네트워크 오류");
  });
});

describe("loadJobWages", () => {
  it("빈 상태 · DEFAULT", () => {
    const r = loadJobWages();
    expect(r).toEqual({ ...DEFAULT_JOB_WAGES });
  });

  it("정상 값 · 그대로 반환", () => {
    localStorage.setItem(JOB_WAGES_KEY, JSON.stringify({
      약사: { weekday: 40000, weekend: 45000 },
      매장: { weekday: 12000, weekend: 13000 },
      창고: { weekday: 11000, weekend: 12000 },
      기타: { weekday: 10000, weekend: 11000 },
    }));
    const r = loadJobWages();
    expect(r.약사.weekday).toBe(40000);
    expect(r.매장.weekend).toBe(13000);
  });

  it("잘못된 JSON · DEFAULT", () => {
    localStorage.setItem(JOB_WAGES_KEY, "invalid{");
    expect(loadJobWages()).toEqual({ ...DEFAULT_JOB_WAGES });
  });

  it("음수 · DEFAULT 로 대체", () => {
    localStorage.setItem(JOB_WAGES_KEY, JSON.stringify({
      약사: { weekday: -100, weekend: 50000 },
    }));
    const r = loadJobWages();
    expect(r.약사.weekday).toBe(DEFAULT_JOB_WAGES.약사.weekday);
    expect(r.약사.weekend).toBe(50000);
  });

  it("NaN · DEFAULT 로 대체", () => {
    localStorage.setItem(JOB_WAGES_KEY, JSON.stringify({
      약사: { weekday: "abc", weekend: "xyz" },
    }));
    const r = loadJobWages();
    expect(r.약사.weekday).toBe(DEFAULT_JOB_WAGES.약사.weekday);
  });

  it("null · 객체 아님 · DEFAULT", () => {
    localStorage.setItem(JOB_WAGES_KEY, "null");
    expect(loadJobWages()).toEqual({ ...DEFAULT_JOB_WAGES });
  });

  it("일부 카테고리만 · 나머지 DEFAULT", () => {
    localStorage.setItem(JOB_WAGES_KEY, JSON.stringify({
      약사: { weekday: 50000, weekend: 55000 },
    }));
    const r = loadJobWages();
    expect(r.약사.weekday).toBe(50000);
    expect(r.매장).toEqual(DEFAULT_JOB_WAGES.매장);
  });
});

describe("normalizeClauses", () => {
  it("null · DEFAULT clone", () => {
    const r = normalizeClauses(null);
    expect(r).toEqual(DEFAULT_CLAUSES);
    expect(r).not.toBe(DEFAULT_CLAUSES);
  });

  it("빈 객체 · DEFAULT 로 채움", () => {
    const r = normalizeClauses({});
    expect(r.wageClauses).toEqual(DEFAULT_CLAUSES.wageClauses);
    expect(r.privacyClauses).toEqual(DEFAULT_CLAUSES.privacyClauses);
  });

  it("정상 배열 · 그대로 사용", () => {
    const r = normalizeClauses({ wageClauses: ["A", "B"] });
    expect(r.wageClauses).toEqual(["A", "B"]);
    expect(r.holidayClauses).toEqual(DEFAULT_CLAUSES.holidayClauses);
  });

  it("빈 배열 · DEFAULT 로 fallback", () => {
    const r = normalizeClauses({ wageClauses: [] });
    expect(r.wageClauses).toEqual(DEFAULT_CLAUSES.wageClauses);
  });

  it("비-문자열 요소 · DEFAULT 로 fallback", () => {
    const r = normalizeClauses({ wageClauses: ["ok", 123, null] });
    expect(r.wageClauses).toEqual(DEFAULT_CLAUSES.wageClauses);
  });

  it("배열 아님 · DEFAULT", () => {
    const r = normalizeClauses({ wageClauses: "string" });
    expect(r.wageClauses).toEqual(DEFAULT_CLAUSES.wageClauses);
  });
});

describe("loadContractClauses", () => {
  it("빈 · DEFAULT clone", () => {
    const r = loadContractClauses();
    expect(r).toEqual(DEFAULT_CLAUSES);
  });

  it("정상 값 · normalize 후 반환", () => {
    localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify({ wageClauses: ["X"] }));
    const r = loadContractClauses();
    expect(r.wageClauses).toEqual(["X"]);
  });

  it("잘못된 JSON · DEFAULT clone", () => {
    localStorage.setItem(CONTRACT_CLAUSES_KEY, "{not json");
    expect(loadContractClauses()).toEqual(DEFAULT_CLAUSES);
  });
});

describe("fetchContractClauses · saveContractClausesToServer", () => {
  it("서버 성공 · localStorage 동기화", async () => {
    mockGet.mockResolvedValue({ data: { wageClauses: ["S1", "S2"] }, status: 200, headers: {} });
    const r = await fetchContractClauses();
    expect(r.wageClauses).toEqual(["S1", "S2"]);
    expect(localStorage.getItem(CONTRACT_CLAUSES_KEY)).toContain("S1");
  });

  it("서버 실패 · fallback (loadContractClauses)", async () => {
    localStorage.setItem(CONTRACT_CLAUSES_KEY, JSON.stringify({ wageClauses: ["L"] }));
    mockGet.mockRejectedValue(new Error("down"));
    const r = await fetchContractClauses();
    expect(r.wageClauses).toEqual(["L"]);
  });

  it("save 성공 · savedToServer=true", async () => {
    mockPut.mockResolvedValue({ data: {}, status: 200, headers: {} });
    const r = await saveContractClausesToServer(DEFAULT_CLAUSES);
    expect(r.savedToServer).toBe(true);
  });

  it("save 실패 (ApiError with data.error) · fallback error", async () => {
    mockPut.mockRejectedValue(new ApiError(500, "Bad", undefined, { error: "boom" }));
    const r = await saveContractClausesToServer(DEFAULT_CLAUSES);
    expect(r.savedToServer).toBe(false);
    expect(r.error).toBe("boom");
  });

  it("save · localStorage 는 항상 저장", async () => {
    mockPut.mockRejectedValue(new Error("bad"));
    const custom = { ...DEFAULT_CLAUSES, wageClauses: ["Hello"] };
    await saveContractClausesToServer(custom);
    expect(localStorage.getItem(CONTRACT_CLAUSES_KEY)).toContain("Hello");
  });
});

describe("cloneClauses · clausesEqual", () => {
  it("clone · 깊은 복사 (배열 인스턴스 다름)", () => {
    const c = cloneClauses(DEFAULT_CLAUSES);
    expect(c).toEqual(DEFAULT_CLAUSES);
    expect(c.wageClauses).not.toBe(DEFAULT_CLAUSES.wageClauses);
  });

  it("equal · 동일 내용 · true", () => {
    expect(clausesEqual(DEFAULT_CLAUSES, cloneClauses(DEFAULT_CLAUSES))).toBe(true);
  });

  it("equal · 배열 길이 다름 · false", () => {
    const b = cloneClauses(DEFAULT_CLAUSES);
    b.wageClauses = b.wageClauses.slice(0, -1);
    expect(clausesEqual(DEFAULT_CLAUSES, b)).toBe(false);
  });

  it("equal · 요소 값 다름 · false", () => {
    const b = cloneClauses(DEFAULT_CLAUSES);
    b.wageClauses[0] = "different";
    expect(clausesEqual(DEFAULT_CLAUSES, b)).toBe(false);
  });
});
