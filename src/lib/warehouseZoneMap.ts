// src/lib/warehouseZoneMap.ts
// 2026-09-20 · re-export shim · 로직 SSOT → src/shared/warehouseZones.ts
// 기존 import 경로 하위호환 유지

export {
  WAREHOUSE_1_CODES,
  WAREHOUSE_2_CODES,
  isValidZoneCode,
  resolveWarehouseForCode,
  resolveWarehouseVisibility,
  classifyArrivalSlot,
  assignZonesToSlots,
  buildInitialShelfPositions,
} from "../shared/warehouseZones";

export type {
  WarehouseVisibility,
  ArrivalSlot,
  SlotZones,
  ShelfPositionsDraft,
} from "../shared/warehouseZones";

// (호환) 레거시 · 신규 로직에서는 미사용
export const WAREHOUSE_BOTH_CODES = new Set<string>([]);
