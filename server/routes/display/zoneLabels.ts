// server/routes/zoneLabels.ts
// 구역 라벨 매핑 API · 2026-07-31 (사용자 요청 · B단계 관리 UI)
//   - GET  /api/zone-labels        · 전체 매핑 반환
//   - PUT  /api/zone-labels        · 일괄 upsert (body: { mappings: [{zone_id, number, sub_label?}] })
//   - POST /api/zone-labels        · 단일 upsert
//   - DELETE /api/zone-labels/:zoneId · 단일 삭제
// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

// 2026-08-05 · 미존재 warning · 한번만 출력 (로그 스팸 방지)
let _missingWarned = false;

// GET /api/zone-labels
router.get("/api/zone-labels", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("zone_labels")
    .select("zone_id, number, sub_label, updated_at")
    .order("number", { ascending: true });
  if (error) {
    // 2026-08-05 · 테이블 미존재 (사용자 SQL 미실행) 은 warning 만 · 빈 배열 반환
    //   · migrations/create_zone_labels_2026-08-05.sql 실행 후 자동 해결
    const msg = error.message ?? "";
    if (/could not find the table|does not exist|schema cache/i.test(msg)) {
      if (!_missingWarned) {
        console.warn("[zone-labels GET] zone_labels 테이블 미존재 · migrations/create_zone_labels_2026-08-05.sql 실행 필요 · 이후 warning 침묵");
        _missingWarned = true;
      }
      return res.json({ mappings: [], _missing: true });
    }
    console.error("[zone-labels GET]", msg);
    throw new HttpError(500, msg);
  }
  // T-SLIM E · 표준 shape · { mappings, count } · 프론트는 mappings 만 소비 (count 추가 필드)
  res.json({ mappings: data ?? [], count: (data ?? []).length });
}));

// PUT /api/zone-labels
// body: { mappings: [{ zone_id, number, sub_label? }] }
// 전체 일괄 upsert · 사용자 편집 저장 시 호출
router.put("/api/zone-labels", authorize(9), asyncHandler(async (req, res) => {
  const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
  if (mappings.length === 0) throw badRequest("mappings 배열 필요");
  const rows = mappings.map((m: any) => ({
    zone_id: String(m.zone_id ?? "").trim(),
    number: Number(m.number ?? 0),
    sub_label: m.sub_label ? String(m.sub_label).trim() : null,
    updated_at: new Date().toISOString(),
  })).filter((r: any) => r.zone_id && r.number > 0);
  if (rows.length === 0) throw badRequest("유효한 매핑 없음");
  const { data, error } = await supabase
    .from("zone_labels")
    .upsert(rows, { onConflict: "zone_id" })
    .select("zone_id, number, sub_label, updated_at");
  if (error) {
    console.error("[zone-labels PUT]", error.message);
    throw new HttpError(500, error.message);
  }
  res.json({ ok: true, updated: data?.length ?? 0 });
}));

// POST /api/zone-labels
// body: { zone_id, number, sub_label? }
// 단일 upsert
router.post("/api/zone-labels", authorize(9), asyncHandler(async (req, res) => {
  const zone_id = String(req.body?.zone_id ?? "").trim();
  const number = Number(req.body?.number ?? 0);
  if (!zone_id || number <= 0) throw badRequest("zone_id / number 필수");
  const row = {
    zone_id,
    number,
    sub_label: req.body?.sub_label ? String(req.body.sub_label).trim() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("zone_labels")
    .upsert([row], { onConflict: "zone_id" })
    .select("zone_id, number, sub_label, updated_at")
    .single();
  if (error) {
    console.error("[zone-labels POST]", error.message);
    throw new HttpError(500, error.message);
  }
  res.json({ ok: true, row: data });
}));

// DELETE /api/zone-labels/:zoneId
router.delete("/api/zone-labels/:zoneId", authorize(9), asyncHandler(async (req, res) => {
  const zone_id = String(req.params.zoneId ?? "").trim();
  if (!zone_id) throw badRequest("zoneId 필수");
  const { error } = await supabase.from("zone_labels").delete().eq("zone_id", zone_id);
  if (error) {
    console.error("[zone-labels DELETE]", error.message);
    throw new HttpError(500, error.message);
  }
  res.json({ ok: true });
}));

export default router;
