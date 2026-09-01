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
