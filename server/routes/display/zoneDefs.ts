// server/routes/display/zoneDefs.ts
// 2026-08-30 · zone_defs 정식 DB 테이블 · 4개 컬럼 · 매장구역도·매장구역편집 단일 소스
//   · 컬럼 · zone (구역) · category (카테고리) · detailed_category (상세) · cell_id (셀 위치)
//   · id (SERIAL PK) · updated_at
//   · 이전 · num · label · sub_a/b/c · description · description_a/b/c 스키마 폐기
//   · 이관 SQL · sql/2026-08-30b-zone-defs-cell-num.sql
//   · 대원칙 · KV 폴백 제거 · DB 단일 소스 · 문제 즉시 발견

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import {
  PatchZoneDefSchema,
  UpsertZoneDefsSchema,
  CreateZoneDefSchema,
} from "../../../src/shared/schemas/zoneDefs";

const router = Router();

interface ZoneDefRow {
  id: number;
  location: string | null;
  zone: string | null;
  category: string | null;
  detailed_category: string | null;
  assignee: string[] | null;
  cell_id: number;
  updated_at: string;
}

/** DB row → 프론트 DTO (snake_case → camelCase) */
function rowToDto(r: ZoneDefRow) {
  return {
    id: r.id,
    cellId: r.cell_id,
    location: r.location ?? undefined,
    zone: r.zone ?? undefined,
    category: r.category ?? undefined,
    detailedCategory: r.detailed_category ?? undefined,
    assignee: Array.isArray(r.assignee) ? r.assignee : [],
  };
}

/** 프론트 DTO → DB row · POST/PUT/PATCH body 정규화 */
function bodyToRow(b: any) {
  return {
    location: b.location != null && b.location !== "" ? String(b.location).trim() : null,
    zone: b.zone != null && b.zone !== "" ? String(b.zone).trim() : null,
    category: b.category != null && b.category !== "" ? String(b.category).trim() : null,
    detailed_category: b.detailedCategory != null && b.detailedCategory !== ""
      ? String(b.detailedCategory)
      : null,
    assignee: Array.isArray(b.assignee)
      ? b.assignee.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    cell_id: Number(b.cellId),
    updated_at: new Date().toISOString(),
  };
}

// GET /api/zone-defs · 전체 조회 · cell_id 순
router.get("/api/zone-defs", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("zone_defs")
    .select("id, location, zone, category, detailed_category, assignee, cell_id, updated_at")
    .order("cell_id", { ascending: true });
  if (error) {
    console.error("[zone-defs GET]", error.message);
    throw new HttpError(500, error.message);
  }
  const zones = (data as ZoneDefRow[] | null ?? []).map(rowToDto);
  res.json({ zones, count: zones.length });
}));

// PATCH /api/zone-defs/:id · 단건 편집 · 관리자 lv9
//   · body · { zone?, category?, detailedCategory?, cellId? }
router.patch("/api/zone-defs/:id", authorize(9), validateBody(PatchZoneDefSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("잘못된 id");
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  const b = req.body ?? {};
  if (b.location         !== undefined) patch.location         = b.location == null || b.location === "" ? null : String(b.location).trim();
  if (b.zone             !== undefined) patch.zone             = b.zone == null || b.zone === "" ? null : String(b.zone).trim();
  if (b.category         !== undefined) patch.category         = b.category == null || b.category === "" ? null : String(b.category).trim();
  if (b.detailedCategory !== undefined) patch.detailed_category = b.detailedCategory == null || b.detailedCategory === "" ? null : String(b.detailedCategory);
  if (b.assignee         !== undefined) patch.assignee         = Array.isArray(b.assignee)
    ? b.assignee.map((s: any) => String(s).trim()).filter(Boolean)
    : [];
  if (b.cellId           !== undefined) patch.cell_id          = Number(b.cellId);
  const { data, error } = await supabase
    .from("zone_defs")
    .update(patch)
    .eq("id", id)
    .select("id, location, zone, category, detailed_category, assignee, cell_id, updated_at")
    .maybeSingle();
  if (error) {
    console.error("[zone-defs PATCH]", error.message);
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, `zone_defs id=${id} not found`);
  res.json({ ok: true, zone: rowToDto(data as ZoneDefRow) });
}));

// PUT /api/zone-defs · 전체 일괄 upsert (cell_id 기준) · 관리자 lv9
router.put("/api/zone-defs", authorize(9), validateBody(UpsertZoneDefsSchema), asyncHandler(async (req, res) => {
  const { zones } = req.body;
  const rows = zones
    .map(bodyToRow)
    .filter((r: any) => Number.isFinite(r.cell_id) && r.cell_id > 0);
  if (rows.length === 0) throw badRequest("유효한 zone 없음");
  const { data, error } = await supabase
    .from("zone_defs")
    .upsert(rows, { onConflict: "cell_id" })
    .select("id, location, zone, category, detailed_category, assignee, cell_id, updated_at");
  if (error) {
    console.error("[zone-defs PUT]", error.message);
    throw new HttpError(500, error.message);
  }
  const result = (data as ZoneDefRow[] | null ?? []).map(rowToDto);
  res.json({ ok: true, zones: result, updated: result.length });
}));

// POST /api/zone-defs · 신규 zone 추가 · cell_id 중복 시 409 · 관리자 lv9
router.post("/api/zone-defs", authorize(9), validateBody(CreateZoneDefSchema), asyncHandler(async (req, res) => {
  const row = bodyToRow(req.body);
  const { data: exists } = await supabase.from("zone_defs").select("id").eq("cell_id", row.cell_id).maybeSingle();
  if (exists) throw new HttpError(409, `cell_id ${row.cell_id} 이미 존재합니다`);
  const { data, error } = await supabase
    .from("zone_defs")
    .insert([row])
    .select("id, location, zone, category, detailed_category, assignee, cell_id, updated_at")
    .single();
  if (error) {
    console.error("[zone-defs POST]", error.message);
    throw new HttpError(500, error.message);
  }
  res.status(201).json({ ok: true, zone: rowToDto(data as ZoneDefRow) });
}));

// DELETE /api/zone-defs/:id · 삭제 · 관리자 lv9
router.delete("/api/zone-defs/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("잘못된 id");
  const { error } = await supabase.from("zone_defs").delete().eq("id", id);
  if (error) {
    console.error("[zone-defs DELETE]", error.message);
    throw new HttpError(500, error.message);
  }
  res.json({ ok: true, deleted: id });
}));

export default router;
