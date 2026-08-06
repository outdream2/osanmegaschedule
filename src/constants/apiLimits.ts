// src/constants/apiLimits.ts
// 2026-08-06 · T-Constants-Extract · API 조회 limit 상수 통합

export const API_LIMITS = {
  MEDIUM: 500,    // ProductPurchaseHistoryModal · SalesTrendPage 공급사별 조회
  LARGE: 5000,    // PurchaseHistoryTab · SalesTrendPage · SupplierTab 조회
  MAX: 50000,     // CategoryTab · SalesTrendPage · SupplierTab 전체 조회
} as const;
