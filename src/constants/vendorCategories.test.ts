// 2026-08-20 · vendorCategories · 공급사 카테고리 상수
import { describe, it, expect } from "vitest";
import { VENDOR_CATEGORIES } from "./vendorCategories";

describe("VENDOR_CATEGORIES · 공급사 분류", () => {
  it("5종 · 위탁·선결제·60회전·90회전·기타", () => {
    expect(VENDOR_CATEGORIES).toEqual(["위탁", "선결제", "60회전", "90회전", "기타"]);
  });

  it("readonly · const array", () => {
    expect(VENDOR_CATEGORIES).toHaveLength(5);
  });

  it("60회전·90회전 포함 · 회전율 카테고리", () => {
    expect(VENDOR_CATEGORIES).toContain("60회전");
    expect(VENDOR_CATEGORIES).toContain("90회전");
  });
});
