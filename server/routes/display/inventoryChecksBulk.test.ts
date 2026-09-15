// 2026-09-15 · T-SP-BULK · POST /api/inventory-checks/bulk · shelf_positions 병합 지원
//   · 순수 로직 (mergeShelfPositions) + Zod 스키마 검증
//   · DB 통합 테스트는 별도 · 여기선 pure logic 만 검증 (server test 관례)
import { describe, it, expect } from "vitest";
import type { StorageLocation } from "../../../src/shared/schemas/settings";
import {
  BulkInventoryCheckSchema,
  CreateInventoryCheckSchema,
} from "../../../src/shared/schemas/inventoryChecks";
import { mergeShelfPositions } from "./inventoryChecksShelfMerge";

// ── 테스트 헬퍼 ──────────────────────────────────────────────────────────────
const STORAGE_LOCS: StorageLocation[] = [
  { code: "store1",     name: "매장1", kind: "store",     required_detail: true,  sort_order: 1, active: true },
  { code: "store2",     name: "매장2", kind: "store",     required_detail: true,  sort_order: 2, active: true },
  { code: "store3",     name: "매장3", kind: "store",     required_detail: true,  sort_order: 3, active: true },
  { code: "warehouse1", name: "창고1", kind: "warehouse", required_detail: false, sort_order: 4, active: true },
  { code: "warehouse2", name: "창고2", kind: "warehouse", required_detail: false, sort_order: 5, active: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// Zod 스키마 · shelf_positions 필드 · Bulk 지원
// ═══════════════════════════════════════════════════════════════════════════
describe("BulkInventoryCheckSchema · shelf_positions 필드 · T-SP-BULK", () => {
  it("shelf_positions 없는 item · 통과 (BC · 기존 클라이언트)", () => {
    const r = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [
        { product_code: "PC001", warehouse1_stock: 10, store1_stock: 5 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("shelf_positions 3자리 값 · 통과", () => {
    const r = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [
        {
          product_code: "PC001",
          store1_stock: 5,
          shelf_positions: { store1: "332", warehouse1: "1A2" },
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("shelf_positions null 값 · 통과 (미입력 리셋)", () => {
    const r = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [
        { product_code: "PC001", shelf_positions: { store1: null } },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("shelf_positions · 4자리 값 · 실패 (3자리 regex)", () => {
    const r = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [
        { product_code: "PC001", shelf_positions: { store1: "3321" } },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("shelf_positions · 다중 item · 각기 다른 값", () => {
    const r = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [
        { product_code: "PC001", shelf_positions: { store1: "332" } },
        { product_code: "PC002", shelf_positions: { store2: "445", warehouse1: "112" } },
        { product_code: "PC003", store1_stock: 3 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("items 빈 배열 · 실패 (min(1))", () => {
    const r = BulkInventoryCheckSchema.safeParse({ checked_by: "홍길동", items: [] });
    expect(r.success).toBe(false);
  });

  it("CreateInventoryCheckSchema 와 · shelf_positions 필드 · 형태 동일", () => {
    // 단건과 일괄 · 동일 shelf_positions 형태 (regression 방지)
    const shelfPos = { store1: "332", warehouse1: "1A2", store2: null };
    const single = CreateInventoryCheckSchema.safeParse({
      product_code: "PC001",
      shelf_positions: shelfPos,
    });
    const bulk = BulkInventoryCheckSchema.safeParse({
      checked_by: "홍길동",
      items: [{ product_code: "PC001", shelf_positions: shelfPos }],
    });
    expect(single.success).toBe(true);
    expect(bulk.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mergeShelfPositions · 병합 순수 로직
// ═══════════════════════════════════════════════════════════════════════════
describe("mergeShelfPositions · 병합 · T-SP-BULK", () => {
  it("빈 기존 + 신규 3자리 · 병합 · dupCheck 대상 등록", () => {
    const r = mergeShelfPositions({}, { store1: "332" }, STORAGE_LOCS);
    expect(r.merged).toEqual({ store1: "332" });
    expect(r.dupCheckTargets).toEqual([{ key: "store1", value: "332" }]);
  });

  it("기존 유지 · 신규 추가 · 다른 위치 병합", () => {
    const existing = { store1: "332", warehouse1: null };
    const r = mergeShelfPositions(existing, { store2: "445" }, STORAGE_LOCS);
    expect(r.merged).toEqual({ store1: "332", warehouse1: null, store2: "445" });
    expect(r.dupCheckTargets).toEqual([{ key: "store2", value: "445" }]);
  });

  it("기존과 · 동일 값 · dupCheck skip (변화 없음)", () => {
    const existing = { store1: "332" };
    const r = mergeShelfPositions(existing, { store1: "332" }, STORAGE_LOCS);
    expect(r.merged).toEqual({ store1: "332" });
    expect(r.dupCheckTargets).toEqual([]);
  });

  it("undefined · 부분 업데이트 · 스킵 (기존 유지)", () => {
    const existing = { store1: "332", warehouse1: "112" };
    const r = mergeShelfPositions(existing, { store1: undefined }, STORAGE_LOCS);
    expect(r.merged).toEqual({ store1: "332", warehouse1: "112" });
    expect(r.dupCheckTargets).toEqual([]);
  });

  it("null · 값 클리어 (창고 · required_detail=false)", () => {
    const existing = { warehouse1: "112" };
    const r = mergeShelfPositions(existing, { warehouse1: null }, STORAGE_LOCS);
    expect(r.merged).toEqual({ warehouse1: null });
    expect(r.dupCheckTargets).toEqual([]);
  });

  it("소문자 → 대문자 자동 변환 (3자리 uppercase)", () => {
    const r = mergeShelfPositions({}, { warehouse1: "1a2" }, STORAGE_LOCS);
    expect(r.merged.warehouse1).toBe("1A2");
    expect(r.dupCheckTargets[0].value).toBe("1A2");
  });

  it("매장 필수 · 빈 문자열 · badRequest throw (400)", () => {
    expect(() =>
      mergeShelfPositions({}, { store1: "" }, STORAGE_LOCS)
    ).toThrow(/매장 위치.*필수/);
  });

  it("매장 필수 · 빈 문자열 · store2 도 동일하게 throw", () => {
    expect(() =>
      mergeShelfPositions({ store2: "445" }, { store2: "" }, STORAGE_LOCS)
    ).toThrow(/store2.*필수/);
  });

  it("창고 · 빈 문자열 X (null 은 허용) · required_detail=false", () => {
    // 창고는 required_detail=false 이므로 null 허용
    const r = mergeShelfPositions({}, { warehouse1: null }, STORAGE_LOCS);
    expect(r.merged.warehouse1).toBe(null);
  });

  it("3자리 아닌 값 · 4자리 · badRequest throw", () => {
    expect(() =>
      mergeShelfPositions({}, { store1: "3321" }, STORAGE_LOCS)
    ).toThrow(/3자리/);
  });

  it("3자리 아닌 값 · 특수문자 포함 · badRequest throw", () => {
    expect(() =>
      mergeShelfPositions({}, { store1: "3-2" }, STORAGE_LOCS)
    ).toThrow(/3자리/);
  });

  it("병합 · 동시 5개 위치 · 각기 다른 값", () => {
    const r = mergeShelfPositions(
      {},
      {
        store1: "111",
        store2: "222",
        store3: "333",
        warehouse1: "4A4",
        warehouse2: "5B5",
      },
      STORAGE_LOCS,
    );
    expect(Object.keys(r.merged).sort()).toEqual(
      ["store1", "store2", "store3", "warehouse1", "warehouse2"]
    );
    expect(r.dupCheckTargets).toHaveLength(5);
  });

  it("required_detail · active=false · 검증 스킵 (비활성 매장은 필수 아님)", () => {
    const locsInactive: StorageLocation[] = STORAGE_LOCS.map(s =>
      s.code === "store1" ? { ...s, active: false } : s
    );
    // store1 이 비활성이면 · 빈 문자열도 허용 (skip 규칙)
    const r = mergeShelfPositions({}, { store1: "" }, locsInactive);
    expect(r.merged.store1).toBe(null);
  });

  it("공백 3자리 → trim + 대문자 · 통과", () => {
    const r = mergeShelfPositions({}, { store1: "  aB3  " }, STORAGE_LOCS);
    expect(r.merged.store1).toBe("AB3");
  });

  it("기존 값과 · 다른 새 값 · dupCheck 등록 (교체)", () => {
    const existing = { store1: "111" };
    const r = mergeShelfPositions(existing, { store1: "222" }, STORAGE_LOCS);
    expect(r.merged).toEqual({ store1: "222" });
    expect(r.dupCheckTargets).toEqual([{ key: "store1", value: "222" }]);
  });
});
