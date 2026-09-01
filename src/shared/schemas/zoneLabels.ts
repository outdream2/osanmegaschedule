// 2026-09-01 · 서버·클라 공유 · 구역 라벨 Zod 스키마
import { z } from "zod";

const ZoneLabelItemSchema = z.object({
  zone_id: z.string().min(1).max(50),
  number: z.number().int().positive(),
  sub_label: z.string().max(100).nullable().optional(),
});

/** PUT /api/zone-labels · 일괄 upsert */
export const UpsertZoneLabelsSchema = z.object({
  mappings: z.array(ZoneLabelItemSchema).min(1, "mappings 배열 필요"),
});
export type UpsertZoneLabelsInput = z.infer<typeof UpsertZoneLabelsSchema>;

/** POST /api/zone-labels · 단일 upsert */
export const CreateZoneLabelSchema = ZoneLabelItemSchema;
export type CreateZoneLabelInput = z.infer<typeof CreateZoneLabelSchema>;
