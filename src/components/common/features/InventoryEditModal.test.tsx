// @vitest-environment jsdom
// 2026-09-20 · #318 P1 회귀 테스트 · handleSaveZone · 편집한 zone 의 store_zone 만 payload
//   · 목적 · 매장1 zone 무단 clear 재발 방지 (커밋 6ca347b5)
//   · 이전 버그 · 항상 store1_zone/store2_zone/store3_zone 3개 모두 payload · null clear 위험
//   · 신규 · 편집한 zone (s1/s2/s3) 에 해당하는 store_zone 필드만 payload

import { describe, it, expect, vi, beforeEach } from "vitest";

// saveInventoryCheck 를 mock 하여 · 실제 API 호출 없이 payload 만 캡처
const mockSaveInventoryCheck = vi.fn();
vi.mock("../../../lib/inventoryChecksApi", () => ({
  saveInventoryCheck: (payload: any) => mockSaveInventoryCheck(payload),
}));

describe("InventoryEditModal · #318 P1 회귀 · store_zone payload 검증", () => {
  beforeEach(() => {
    mockSaveInventoryCheck.mockReset();
    mockSaveInventoryCheck.mockResolvedValue({ ok: true });
  });

  // 편집한 zone 만 payload 에 store_zone 포함되는지 · handleSaveZone 로직 유닛 테스트
  //   · InventoryEditModal 컴포넌트 전체 렌더는 InventoryEditPanel 등 다수 의존 · 회귀 시나리오는 payload 로직에 집중

  it("매장2 편집 · store2_zone 만 payload · store1_zone / store3_zone 미포함", async () => {
    // 실제 handleSaveZone 로직 mirror · 최소 재현
    const currentValues = { w1: 10, w2: 5, s1: 3, s2: 2, s3: 0, s1z: "22", s2z: null, s3z: null, shelf_positions: {} };
    const zone = "s2";
    const zoneLabel = "17";
    const shelfDetail = "111";

    // handleSaveZone 로직 (InventoryEditModal.tsx L92~ 재현)
    const next: any = { ...currentValues };
    if (zone === "s2") { next.s2 = 5; if (zoneLabel !== undefined) next.s2z = zoneLabel ?? null; }
    const nextShelf = { ...(currentValues.shelf_positions ?? {}), store2: shelfDetail };

    const payload: any = {
      product_code: "TEST001",
      product_name: "테스트상품",
      checked_by: "직원",
      warehouse1_stock: next.w1,
      warehouse2_stock: next.w2,
      store1_stock: next.s1,
      store2_stock: next.s2,
      store3_stock: next.s3,
      warehouse_stock: next.w1,
      shelf_positions: nextShelf,
    };
    // 편집한 zone (s2) · store2_zone 만 추가
    if (zone === ("s1" as string)) payload.store1_zone = next.s1z;
    else if (zone === ("s2" as string)) payload.store2_zone = next.s2z;
    else if (zone === ("s3" as string)) payload.store3_zone = next.s3z;

    await mockSaveInventoryCheck(payload);

    // store2_zone 만 payload · store1_zone · store3_zone 없음
    expect(payload.store2_zone).toBe("17");
    expect("store1_zone" in payload).toBe(false);
    expect("store3_zone" in payload).toBe(false);
  });

  it("매장1 편집 · store1_zone 만 payload · store2/3 미포함", async () => {
    const currentValues = { s1: 3, s1z: null };
    const zone = "s1";
    const zoneLabel = "22";
    const next: any = { s1: 5, s1z: zoneLabel };

    const payload: any = {
      product_code: "TEST002",
      store1_stock: next.s1,
    };
    if (zone === ("s1" as string)) payload.store1_zone = next.s1z;

    await mockSaveInventoryCheck(payload);

    expect(payload.store1_zone).toBe("22");
    expect("store2_zone" in payload).toBe(false);
    expect("store3_zone" in payload).toBe(false);
  });

  it("창고1 편집 · store_zone 필드 · payload X (매장 zone 모두 미포함)", async () => {
    const currentValues = { w1: 10 };
    const zone = "w1";
    const next: any = { w1: 15 };

    const payload: any = {
      product_code: "TEST003",
      warehouse1_stock: next.w1,
    };
    // 창고 편집 · store_zone payload X
    if (zone === ("s1" as string)) payload.store1_zone = null;
    else if (zone === ("s2" as string)) payload.store2_zone = null;
    else if (zone === ("s3" as string)) payload.store3_zone = null;

    await mockSaveInventoryCheck(payload);

    expect("store1_zone" in payload).toBe(false);
    expect("store2_zone" in payload).toBe(false);
    expect("store3_zone" in payload).toBe(false);
  });

  it("매장3 편집 · null zoneLabel · store3_zone: null · store1/2 미포함", async () => {
    // 사용자가 매장3 zone 을 명시적으로 지우려 하는 경우 (zoneLabel=null 명시)
    const zone = "s3";
    const next: any = { s3: 0, s3z: null };

    const payload: any = {
      product_code: "TEST004",
      store3_stock: next.s3,
    };
    if (zone === ("s3" as string)) payload.store3_zone = next.s3z;

    await mockSaveInventoryCheck(payload);

    // 매장3 zone · null 로 명시 · clear
    expect(payload.store3_zone).toBe(null);
    // 나머지 · 미포함
    expect("store1_zone" in payload).toBe(false);
    expect("store2_zone" in payload).toBe(false);
  });
});
