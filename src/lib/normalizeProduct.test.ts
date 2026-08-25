// 2026-08-25 · normalizeProduct 유틸 테스트
//   · pure 함수 · normalizeProductRow 만 테스트 (resolveProduct 는 api mock 필요 · 별도)

import { describe, it, expect } from "vitest";
import { normalizeProductRow } from "./normalizeProduct";

describe("normalizeProductRow · raw DB row → ProductInfo shape", () => {
  it("product_code + product_name → code + name 정규화", () => {
    const raw = { product_code: "PC001", product_name: "타이레놀", supplier: "존슨앤존슨" };
    const r = normalizeProductRow(raw, "");
    expect(r.code).toBe("PC001");
    expect(r.name).toBe("타이레놀");
    expect(r.supplier).toBe("존슨앤존슨");
  });

  it("이미 정규화된 shape (code + name) 도 유지", () => {
    const raw = { code: "X1", name: "이미정규화" };
    const r = normalizeProductRow(raw, "");
    expect(r.code).toBe("X1");
    expect(r.name).toBe("이미정규화");
  });

  it("fallbackCode · raw 에 code/product_code 없을 때 사용", () => {
    const r = normalizeProductRow({ product_name: "N/A" }, "FALLBACK123");
    expect(r.code).toBe("FALLBACK123");
    expect(r.name).toBe("N/A");
  });

  it("빈 raw + fallbackCode 없음 · code=빈 문자열", () => {
    const r = normalizeProductRow({}, "");
    expect(r.code).toBe("");
    expect(r.name).toBe("");
  });

  it("null raw · 안전 처리 · 빈 code + fallbackCode 사용", () => {
    const r = normalizeProductRow(null, "F1");
    expect(r.code).toBe("F1");
    expect(r.name).toBe("");
  });

  it("real_map + realMap · 양방향 정규화", () => {
    // real_map (snake_case · DB) → realMap (camelCase · JS) 도 세팅
    const r1 = normalizeProductRow({ product_code: "A", real_map: "1A" }, "");
    expect(r1.realMap).toBe("1A");
    expect(r1.real_map).toBe("1A");
    // realMap (camelCase · client 계산) → real_map 도 세팅
    const r2 = normalizeProductRow({ product_code: "A", realMap: "2B" }, "");
    expect(r2.realMap).toBe("2B");
    expect(r2.real_map).toBe("2B");
  });

  it("supplier null · null 그대로 유지", () => {
    const r = normalizeProductRow({ product_code: "A", supplier: null }, "");
    expect(r.supplier).toBeNull();
  });

  it("나머지 필드 (spec 등) 은 · 원본 raw spread 로 유지", () => {
    const r = normalizeProductRow(
      { product_code: "A", product_name: "B", spec: "10정", brand: "타이레놀", current_stock: 5 },
      "",
    );
    expect(r.spec).toBe("10정");
    expect((r as any).brand).toBe("타이레놀");
    expect((r as any).current_stock).toBe(5);
  });

  it("name 우선순위 · name > product_name (name 이 있으면 우선)", () => {
    const r = normalizeProductRow({ name: "A", product_name: "B" }, "");
    expect(r.name).toBe("A");
  });

  it("code 우선순위 · code > product_code > fallbackCode", () => {
    const r1 = normalizeProductRow({ code: "X", product_code: "Y" }, "Z");
    expect(r1.code).toBe("X");
    const r2 = normalizeProductRow({ product_code: "Y" }, "Z");
    expect(r2.code).toBe("Y");
    const r3 = normalizeProductRow({}, "Z");
    expect(r3.code).toBe("Z");
  });
});
