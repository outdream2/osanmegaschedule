// 2026-09-01 · 서버·클라 공유 · 앱 설정 Zod 스키마
import { z } from "zod";

/** POST /api/settings · key/value upsert */
export const UpsertSettingSchema = z.object({
  key: z.string().min(1, "key required").max(200),
  value: z.unknown(),
});
export type UpsertSettingInput = z.infer<typeof UpsertSettingSchema>;

/** POST /api/settings/season-ranges */
export const UpsertSeasonRangesSchema = z.object({
  ranges: z.unknown(),
});
export type UpsertSeasonRangesInput = z.infer<typeof UpsertSeasonRangesSchema>;

/** POST /api/permissions */
export const UpsertPermissionsSchema = z.object({
  permissions: z.record(z.string(), z.unknown()),
});
export type UpsertPermissionsInput = z.infer<typeof UpsertPermissionsSchema>;

/** PUT /api/zone-groups */
export const UpsertZoneGroupsSchema = z.array(z.unknown()).min(1, "array required");
export type UpsertZoneGroupsInput = z.infer<typeof UpsertZoneGroupsSchema>;

/** POST /api/blocked-slots */
export const UpsertBlockedSlotSchema = z.object({
  date: z.string().min(1, "date required").max(20),
  staffName: z.string().min(1, "staffName required").max(100),
  time: z.string().min(1, "time required").max(20),
  blocked: z.boolean().optional(),
});
export type UpsertBlockedSlotInput = z.infer<typeof UpsertBlockedSlotSchema>;

/** POST /api/zones */
export const UpsertZonesSchema = z.object({
  zones: z.array(z.record(z.string(), z.unknown())).min(1, "zones array required"),
});
export type UpsertZonesInput = z.infer<typeof UpsertZonesSchema>;

/** 2026-09-08 · 매장·창고 마스터 (KV settings.storage_locations)
 *   · 진열위치 상세 저장·표시 시 · 위치 목록 참조
 *   · required_detail=true 인 위치는 저장 시 상세위치 필수 (매장)
 */
export const StorageLocationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(50),
  kind: z.enum(["store", "warehouse"]),
  required_detail: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
export type StorageLocation = z.infer<typeof StorageLocationSchema>;

export const UpsertStorageLocationsSchema = z.object({
  locations: z.array(StorageLocationSchema).min(1, "locations required"),
});
export type UpsertStorageLocationsInput = z.infer<typeof UpsertStorageLocationsSchema>;

export const DEFAULT_STORAGE_LOCATIONS: StorageLocation[] = [
  { code: "store1",     name: "매장1", kind: "store",     required_detail: true,  sort_order: 1, active: true },
  { code: "store2",     name: "매장2", kind: "store",     required_detail: true,  sort_order: 2, active: true },
  { code: "store3",     name: "매장3", kind: "store",     required_detail: true,  sort_order: 3, active: true },
  { code: "warehouse1", name: "창고1", kind: "warehouse", required_detail: false, sort_order: 4, active: true },
  { code: "warehouse2", name: "창고2", kind: "warehouse", required_detail: false, sort_order: 5, active: true },
];

/** 3자리 상세위치 값 · 층·칸·순서 각 1자리 (0~9 or A~Z) · 예 "332" · null 허용 (미입력) */
export const ShelfPositionValueSchema = z
  .string()
  .regex(/^[0-9A-Z]{3}$/, "3자리 (층·칸·순서 · 예 332) 여야 합니다")
  .nullable()
  .optional();

/** shelf_positions JSON · key=location code · value=3자리 or null */
export const ShelfPositionsSchema = z.record(z.string(), ShelfPositionValueSchema);
export type ShelfPositions = Record<string, string | null | undefined>;
