// server/routes/zoneLabels.ts
// 구역 라벨 매핑 API · 2026-07-31 (사용자 요청 · B단계 관리 UI)
//   - GET  /api/zone-labels        · 전체 매핑 반환
//   - PUT  /api/zone-labels        · 일괄 upsert (body: { mappings: [{zone_id, number, sub_label?}] })
//   - POST /api/zone-labels        · 단일 upsert
//   - DELETE /api/zone-labels/:zoneId · 단일 삭제

import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

// GET /api/zone-labels
router.get("/api/zone-labels", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("zone_labels")
      .select("zone_id, number, sub_label, updated_at")
      .order("number", { ascending: true });
    if (error) {
      // 2026-08-05 · 테이블 미존재 (사용자 SQL 미실행) 은 warning 만 · 빈 배열 반환
      //   · migrations/create_zone_labels_2026-08-05.sql 실행 후 자동 해결
      const msg = error.message ?? "";
      if (/could not find the table|does not exist|schema cache/i.test(msg)) {
        console.warn("[zone-labels GET] zone_labels 테이블 미존재 · SQL 마이그레이션 실행 필요 · 빈 배열 반환");
        return res.json({ mappings: [], _missing: true });
      }
      throw new Error(msg);
    }
    res.json({ mappings: data ?? [] });
  } catch (err: any) {
    console.error("[zone-labels GET]", err?.message);
    res.status(500).json({ error: err?.message ?? "구역 라벨 조회 실패" });
  }
});

// PUT /api/zone-labels
// body: { mappings: [{ zone_id, number, sub_label? }] }
// 전체 일괄 upsert · 사용자 편집 저장 시 호출
router.put("/api/zone-labels", async (req, res) => {
  try {
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    if (mappings.length === 0) return res.status(400).json({ error: "mappings 배열 필요" });
    const rows = mappings.map((m: any) => ({
      zone_id: String(m.zone_id ?? "").trim(),
      number: Number(m.number ?? 0),
      sub_label: m.sub_label ? String(m.sub_label).trim() : null,
      updated_at: new Date().toISOString(),
    })).filter((r: any) => r.zone_id && r.number > 0);
    if (rows.length === 0) return res.status(400).json({ error: "유효한 매핑 없음" });
    const { data, error } = await supabase
      .from("zone_labels")
      .upsert(rows, { onConflict: "zone_id" })
      .select("*");
    if (error) throw new Error(error.message);
    res.json({ ok: true, updated: data?.length ?? 0 });
  } catch (err: any) {
    console.error("[zone-labels PUT]", err?.message);
    res.status(500).json({ error: err?.message ?? "구역 라벨 저장 실패" });
  }
});

// POST /api/zone-labels
// body: { zone_id, number, sub_label? }
// 단일 upsert
router.post("/api/zone-labels", async (req, res) => {
  try {
    const zone_id = String(req.body?.zone_id ?? "").trim();
    const number = Number(req.body?.number ?? 0);
    if (!zone_id || number <= 0) return res.status(400).json({ error: "zone_id / number 필수" });
    const row = {
      zone_id,
      number,
      sub_label: req.body?.sub_label ? String(req.body.sub_label).trim() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("zone_labels")
      .upsert([row], { onConflict: "zone_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, row: data });
  } catch (err: any) {
    console.error("[zone-labels POST]", err?.message);
    res.status(500).json({ error: err?.message ?? "구역 라벨 저장 실패" });
  }
});

// DELETE /api/zone-labels/:zoneId
router.delete("/api/zone-labels/:zoneId", async (req, res) => {
  try {
    const zone_id = String(req.params.zoneId ?? "").trim();
    if (!zone_id) return res.status(400).json({ error: "zoneId 필수" });
    const { error } = await supabase.from("zone_labels").delete().eq("zone_id", zone_id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[zone-labels DELETE]", err?.message);
    res.status(500).json({ error: err?.message ?? "구역 라벨 삭제 실패" });
  }
});

export default router;
