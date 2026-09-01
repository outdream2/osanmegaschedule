// 2026-09-01 · 서버·클라 공유 · 매장구역도 Zod 스키마
import { z } from "zod";

const ZoneDefBodySchema = z.object({
  location: z.string().max(100).nullable().optional(),
  zone: z.string().max(100).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  detailedCategory: z.string().max(200).nullable().optional(),
  assignee: z.array(z.string()).optional(),
  cellId: z.number().int().positive("cellId 필요 (양의 정수)"),
});

/** PATCH /api/zone-defs/:id · 단건 편집 */
export const PatchZoneDefSchema = ZoneDefBodySchema.partial();
export type PatchZoneDefInput = z.infer<typeof PatchZoneDefSchema>;

/** PUT /api/zone-defs · 일괄 upsert */
export const UpsertZoneDefsSchema = z.object({
  zones: z.array(ZoneDefBodySchema.partial().extend({ cellId: z.number().int().positive() })).min(1, "zones 배열 필요"),
});
export type UpsertZoneDefsInput = z.infer<typeof UpsertZoneDefsSchema>;

/** POST /api/zone-defs · 단건 추가 */
export const CreateZoneDefSchema = ZoneDefBodySchema;
export type CreateZoneDefInput = z.infer<typeof CreateZoneDefSchema>;
