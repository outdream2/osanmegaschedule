// server/routes/display/zoneDefs.ts
// 2026-08-30 · 사용자 지시 · zone_defs KV → 정식 DB 테이블 이관
//   · 이전 · settings.zone_defs (KV blob) · 원본 테이블 우선 대원칙 위배
//   · 이후 · zone_defs 정식 테이블 · CRUD API · 프레임워크화 · API화
//   · 마이그레이션 · sql/2026-08-30-zone-defs-table-migration.sql

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

// 2026-08-30 · 테이블 미존재 warning 한번만 · 로그 스팸 방지
let _tableMissingWarned = false;

interface ZoneDefRow {
  num: number;
  label: string;
  category: string;
  section: string;
  sub_a: string | null;
  sub_b: string | null;
  sub_c: string | null;
  description: string | null;
  description_a: string | null;
  description_b: string | null;
  description_c: string | null;
  updated_at: string;
}

/** DB row → 프론트 ZoneDef · 필드 매핑 (snake → camel) */
function rowToDto(r: ZoneDefRow) {
  return {
    num: r.num,
    label: r.label,
    category: r.category,
    section: r.section,
    subA: r.sub_a ?? undefined,
    subB: r.sub_b ?? undefined,
    subC: r.sub_c ?? undefined,
    description: r.description ?? undefined,
    descriptionA: r.description_a ?? undefined,
    descriptionB: r.description_b ?? undefined,
    descriptionC: r.description_c ?? undefined,
  };
}

/** 프론트 ZoneDef → DB row (upsert) */
function dtoToRow(z: any) {
  return {
    num: Number(z.num),
    label: String(z.label ?? ""),
    category: String(z.category ?? ""),
    section: String(z.section ?? "aisle"),
    sub_a: z.subA != null ? String(z.subA) : null,
    sub_b: z.subB != null ? String(z.subB) : null,
    sub_c: z.subC != null ? String(z.subC) : null,
    description:   z.description   != null ? String(z.description)   : null,
    description_a: z.descriptionA  != null ? String(z.descriptionA)  : null,
    description_b: z.descriptionB  != null ? String(z.descriptionB)  : null,
    description_c: z.descriptionC  != null ? String(z.descriptionC)  : null,
    updated_at: new Date().toISOString(),
  };
}

// GET /api/zone-defs
router.get("/api/zone-defs", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("zone_defs")
    .select("*")
    .order("num", { ascending: true });
  if (error) {
    const msg = error.message ?? "";
    // 테이블 미존재 · 마이그레이션 미실행 · 빈 배열 · 프론트는 KV 폴백
    if (/does not exist|could not find|schema cache/i.test(msg)) {
      if (!_tableMissingWarned) {
        console.warn("[zone-defs GET] zone_defs 테이블 미존재 · sql/2026-08-30-zone-defs-table-migration.sql 실행 필요");
        _tableMissingWarned = true;
      }
      return res.json({ zones: [], _missing: true });
    }
    console.error("[zone-defs GET]", msg);
    throw new HttpError(500, msg);
  }
  const zones = (data as ZoneDefRow[] | null ?? []).map(rowToDto);
  res.json({ zones, count: zones.length });
}));

// PUT /api/zone-defs · 전체 일괄 upsert · 관리자 lv9
router.put("/api/zone-defs", authorize(9), asyncHandler(async (req, res) => {
  const zones = Array.isArray(req.body?.zones) ? req.body.zones : [];
  if (zones.length === 0) throw badRequest("zones 배열 필요");
  const rows = zones
    .map(dtoToRow)
    .filter((r: any) => Number.isFinite(r.num) && r.num > 0 && r.label && r.category);
  if (rows.length === 0) throw badRequest("유효한 zone 없음");
  const { data, error } = await supabase
    .from("zone_defs")
    .upsert(rows, { onConflict: "num" })
    .select("*");
  if (error) {
    console.error("[zone-defs PUT]", error.message);
    throw new HttpError(500, error.message);
  }
  const result = (data as ZoneDefRow[] | null ?? []).map(rowToDto);
  res.json({ ok: true, zones: result, updated: result.length });
}));

// PATCH /api/zone-defs/:num · 단건 편집 · 관리자 lv9
router.patch("/api/zone-defs/:num", authorize(9), asyncHandler(async (req, res) => {
  const num = Number(req.params.num);
  if (!Number.isFinite(num) || num <= 0) throw badRequest("잘못된 zone 번호");
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  const b = req.body ?? {};
  if (b.label       !== undefined) patch.label       = String(b.label);
  if (b.category    !== undefined) patch.category    = String(b.category);
  if (b.section     !== undefined) patch.section     = String(b.section);
  if (b.subA        !== undefined) patch.sub_a       = b.subA == null ? null : String(b.subA);
  if (b.subB        !== undefined) patch.sub_b       = b.subB == null ? null : String(b.subB);
  if (b.subC        !== undefined) patch.sub_c       = b.subC == null ? null : String(b.subC);
  if (b.description !== undefined) patch.description = b.description == null ? null : String(b.description);
  if (b.descriptionA!== undefined) patch.description_a = b.descriptionA == null ? null : String(b.descriptionA);
  if (b.descriptionB!== undefined) patch.description_b = b.descriptionB == null ? null : String(b.descriptionB);
  if (b.descriptionC!== undefined) patch.description_c = b.descriptionC == null ? null : String(b.descriptionC);
  const { data, error } = await supabase
    .from("zone_defs")
    .update(patch)
    .eq("num", num)
    .select("*")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, `zone ${num} not found`);
  res.json({ ok: true, zone: rowToDto(data as ZoneDefRow) });
}));

export default router;
