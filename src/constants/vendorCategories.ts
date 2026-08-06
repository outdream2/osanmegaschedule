// src/constants/vendorCategories.ts
// 2026-08-06 · T-Constants-Extract · 공급사 카테고리 배열 통합
// 주의: VendorCategoryBadge.tsx 의 VendorCategory 타입 · VALID_CATEGORIES 와 값 동일해야 함

export const VENDOR_CATEGORIES = ["위탁", "선결제", "60회전", "90회전", "기타"] as const;
export type VendorCategoryLegacy = typeof VENDOR_CATEGORIES[number];
