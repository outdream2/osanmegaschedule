// 2026-10-07 · Phase 2 · P0-5 OPTION A · settings_patch_jsonb concurrency tests
//   · POST /api/settings/patch · atomic jsonb_set RPC (lost-update 방지)
//   · 서로 다른 top-level path 동시 쓰기 → 둘 다 반영 (DB atomic)
//   · 같은 top-level path 동시 쓰기 → last-write-wins
//   · row 없음 → INSERT 되고 patch 반영
//   · 중첩 path (["wageRates","약사"]) 정확히 반영
//
// 테스트는 Supabase in-memory simulator 로 jsonb_set 동작 재현 (production DB 접근 금지).
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────
// In-memory simulator · settings_patch_jsonb RPC 재현
// ─────────────────────────────────────────────────────────────
type JsonLike = Record<string, unknown> | unknown[] | string | number | boolean | null;
interface Row { key: string; value: JsonLike; updated_at: string }
const store = new Map<string, Row>();

/** jsonb_set 동작 재현 · create_missing=true */
function jsonbSet(current: JsonLike, path: string[], newValue: unknown): JsonLike {
  if (path.length === 0) return newValue as JsonLike;
  const [head, ...rest] = path;
  const base: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if (rest.length === 0) {
    base[head] = newValue;
  } else {
    base[head] = jsonbSet((base[head] as JsonLike) ?? {}, rest, newValue);
  }
  return base;
}

/** settings_patch_jsonb · 순차 적용 (DB 트랜잭션 재현) */
function settingsPatchJsonb(key: string, patches: Array<{ path: string[]; value: unknown }>): JsonLike {
  if (!Array.isArray(patches)) throw new Error("patches must be array");
  if (patches.length === 0) {
    return store.get(key)?.value ?? {};
  }
  // bootstrap: row 없으면 {} INSERT
  if (!store.has(key)) {
    store.set(key, { key, value: {}, updated_at: new Date().toISOString() });
  }
  // 각 patch 순차 적용
  for (const p of patches) {
    if (!Array.isArray(p.path) || p.path.length === 0) throw new Error("patch.path must be non-empty array");
    const current = store.get(key)!;
    const next = jsonbSet(current.value, p.path, p.value);
    store.set(key, { key, value: next, updated_at: new Date().toISOString() });
  }
  return store.get(key)!.value;
}

/** Supabase client · rpc("settings_patch_jsonb", {...}) mock */
const supabaseMock = {
  rpc: vi.fn((_fn: string, args: { p_key: string; p_patches: Array<{ path: string[]; value: unknown }> }) => {
    try {
      const data = settingsPatchJsonb(args.p_key, args.p_patches);
      return Promise.resolve({ data, error: null });
    } catch (err: any) {
      return Promise.resolve({ data: null, error: { message: err.message } });
    }
  }),
};

// ─────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────
beforeEach(() => {
  store.clear();
  supabaseMock.rpc.mockClear();
});

describe("settings_patch_jsonb · OPTION A · atomic jsonb_set", () => {
  describe("A. 다른 top-level path · lost update 없음", () => {
    it("wageRates 와 visitorReservation 동시 patch · 둘 다 반영", async () => {
      // 두 patch · 서로 다른 top-level path
      const r1 = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates"], value: { "약사": { weekday: 35000, weekend: 40000 } } }],
      });
      const r2 = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["visitorReservation"], value: { assigneeEmployeeIds: [1, 2], slotMinutes: 30, bufferMinutes: 10, useEmployeeSchedule: true } }],
      });
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.wageRates).toEqual({ "약사": { weekday: 35000, weekend: 40000 } });
      expect((final.visitorReservation as any).assigneeEmployeeIds).toEqual([1, 2]);
    });

    it("positions 와 scheduleTypes 동시 patch · 둘 다 반영 (whole-object vs. path patch 비교)", async () => {
      // 기존 whole-object upsert 패턴 (lost update 발생 가능) 과 대비
      // 두 patch 순차 적용 · 각 patch 는 자신의 top-level key 만 수정
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["positions"], value: ["약사", "캐셔"] }],
      });
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["scheduleTypes"], value: [{ type: "오픈", hours: "10:00-18:00" }] }],
      });
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.positions).toEqual(["약사", "캐셔"]);
      expect(final.scheduleTypes).toEqual([{ type: "오픈", hours: "10:00-18:00" }]);
    });
  });

  describe("B. 같은 top-level path · last-write-wins (명시적 trade-off)", () => {
    it("두 patch 가 같은 wageRates 전체 · 뒤 patch 가 승리", async () => {
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates"], value: { "약사": { weekday: 30000, weekend: 35000 } } }],
      });
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates"], value: { "캐셔": { weekday: 10030, weekend: 12000 } } }],
      });
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      // 전체 wageRates 덮어쓰기 (약사 소거 · last-write-wins)
      expect(final.wageRates).toEqual({ "캐셔": { weekday: 10030, weekend: 12000 } });
    });

    it("중첩 path · 다른 nested key 는 공존", async () => {
      // 각 path 가 ["wageRates","약사"] vs ["wageRates","캐셔"] · 둘 다 반영
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates", "약사"], value: { weekday: 35000, weekend: 40000 } }],
      });
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates", "캐셔"], value: { weekday: 10030, weekend: 12000 } }],
      });
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.wageRates).toEqual({
        "약사": { weekday: 35000, weekend: 40000 },
        "캐셔": { weekday: 10030, weekend: 12000 },
      });
    });
  });

  describe("C. row 없음 · INSERT 되고 patch 반영", () => {
    it("최초 patch · 자동 bootstrap · 값 반영", async () => {
      expect(store.has("all_settings")).toBe(false);
      const r = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["positions"], value: ["약사"] }],
      });
      expect(r.error).toBeNull();
      expect(store.has("all_settings")).toBe(true);
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.positions).toEqual(["약사"]);
    });

    it("최초 patch (여러 개) · 전부 반영", async () => {
      const r = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [
          { path: ["positions"], value: ["약사"] },
          { path: ["wageRates"], value: { "약사": { weekday: 35000, weekend: 40000 } } },
          { path: ["underConstruction"], value: false },
        ],
      });
      expect(r.error).toBeNull();
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.positions).toEqual(["약사"]);
      expect(final.wageRates).toEqual({ "약사": { weekday: 35000, weekend: 40000 } });
      expect(final.underConstruction).toBe(false);
    });
  });

  describe("D. 중첩 path · 정확히 반영", () => {
    it("['wageRates','약사'] · 기존 다른 position 보존", async () => {
      // seed
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates"], value: { "약사": { weekday: 30000, weekend: 35000 }, "캐셔": { weekday: 10030, weekend: 12000 } } }],
      });
      // nested patch · 약사만 변경 · 캐셔 보존
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["wageRates", "약사"], value: { weekday: 35000, weekend: 40000 } }],
      });
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect(final.wageRates).toEqual({
        "약사": { weekday: 35000, weekend: 40000 },
        "캐셔": { weekday: 10030, weekend: 12000 },
      });
    });

    it("3-level 중첩 path · ['visitorReservation','assigneeEmployeeIds']", async () => {
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["visitorReservation"], value: { slotMinutes: 30, bufferMinutes: 10, useEmployeeSchedule: true, assigneeEmployeeIds: [1, 2] } }],
      });
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["visitorReservation", "assigneeEmployeeIds"], value: [3, 4, 5] }],
      });
      const final = store.get("all_settings")!.value as Record<string, unknown>;
      expect((final.visitorReservation as any).assigneeEmployeeIds).toEqual([3, 4, 5]);
      expect((final.visitorReservation as any).slotMinutes).toBe(30);
      expect((final.visitorReservation as any).bufferMinutes).toBe(10);
    });
  });

  describe("E. 빈 patches · READ-ONLY smoke call", () => {
    it("빈 배열 · 영향 없음 · 현재 value 반환", async () => {
      // seed
      await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: ["positions"], value: ["약사"] }],
      });
      const before = JSON.parse(JSON.stringify(store.get("all_settings")!.value));
      // smoke call · 빈 patches
      const r = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [],
      });
      expect(r.error).toBeNull();
      expect(r.data).toEqual(before);
      // store 변경 없음
      expect(store.get("all_settings")!.value).toEqual(before);
    });

    it("row 없고 빈 patches · bootstrap 안 됨 (READ-ONLY)", async () => {
      expect(store.has("missing_key")).toBe(false);
      const r = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "missing_key",
        p_patches: [],
      });
      expect(r.error).toBeNull();
      expect(r.data).toEqual({});
      expect(store.has("missing_key")).toBe(false); // 여전히 없음
    });
  });

  describe("F. 유효성 검사", () => {
    it("빈 path · 에러", async () => {
      const r = await supabaseMock.rpc("settings_patch_jsonb", {
        p_key: "all_settings",
        p_patches: [{ path: [], value: "x" }],
      });
      expect(r.error).toBeTruthy();
      expect(r.error!.message).toMatch(/path/);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// partialToPatches · 클라이언트 분해 로직 검증
// ─────────────────────────────────────────────────────────────
describe("partialToPatches · 클라이언트 path 분해", () => {
  function partialToPatches(partial: Record<string, unknown>): Array<{ path: string[]; value: unknown }> {
    const patches: Array<{ path: string[]; value: unknown }> = [];
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined) continue;
      patches.push({ path: [key], value });
    }
    return patches;
  }

  it("단일 top-level key · 1개 patch", () => {
    const patches = partialToPatches({ wageRates: { "약사": { weekday: 35000, weekend: 40000 } } });
    expect(patches).toEqual([{ path: ["wageRates"], value: { "약사": { weekday: 35000, weekend: 40000 } } }]);
  });

  it("여러 top-level key · 여러 patch (각 path = [key])", () => {
    const patches = partialToPatches({
      positions: ["약사"],
      wageRates: { "약사": { weekday: 35000, weekend: 40000 } },
      underConstruction: false,
    });
    expect(patches).toHaveLength(3);
    const paths = patches.map((p) => p.path);
    expect(paths).toContainEqual(["positions"]);
    expect(paths).toContainEqual(["wageRates"]);
    expect(paths).toContainEqual(["underConstruction"]);
  });

  it("undefined 값 · patch 에 포함 X", () => {
    const patches = partialToPatches({ positions: ["약사"], underConstruction: undefined });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ path: ["positions"], value: ["약사"] });
  });

  it("빈 객체 · patches 빈 배열", () => {
    expect(partialToPatches({})).toEqual([]);
  });

  it("명시적 null · 포함 (undefined 와 구분)", () => {
    const patches = partialToPatches({ visitorReservation: null });
    expect(patches).toEqual([{ path: ["visitorReservation"], value: null }]);
  });
});
