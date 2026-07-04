import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
const TABLE = "zone_assignments";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS zone_assignments (
  dow           INTEGER PRIMARY KEY CHECK (dow BETWEEN 0 AND 6),
  zone_slots    JSONB   NOT NULL DEFAULT '{}',
  lunch_slots   JSONB   NOT NULL DEFAULT '{}',
  rest_slots    JSONB   NOT NULL DEFAULT '{}',
  lunch_offset  INTEGER NOT NULL DEFAULT 0,
  rest_offset   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// Check table exists on startup; print setup SQL if missing
(async () => {
  const { error } = await supabase.from(TABLE).select("dow").limit(1);
  if (error && /relation|does not exist/i.test(error.message)) {
    console.warn(`\n[SETUP REQUIRED] '${TABLE}' 테이블이 없습니다.`);
    console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
    console.warn(CREATE_SQL);
  }
})();

// GET /api/zone-assignments/:dow  →  { dow, zone_slots, lunch_slots, rest_slots, lunch_offset, rest_offset }
router.get("/api/zone-assignments/:dow", async (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: "dow는 0~6이어야 합니다" });

  const { data, error } = await supabase.from(TABLE).select("*").eq("dow", dow).maybeSingle();
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json({ dow, zone_slots: {}, lunch_slots: {}, rest_slots: {}, lunch_offset: 0, rest_offset: 0 });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json(data ?? { dow, zone_slots: {}, lunch_slots: {}, rest_slots: {}, lunch_offset: 0, rest_offset: 0 });
});

// PUT /api/zone-assignments/:dow  →  upsert template for that day-of-week
router.put("/api/zone-assignments/:dow", async (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: "dow는 0~6이어야 합니다" });

  const { zone_slots, lunch_slots, rest_slots, lunch_offset, rest_offset } = req.body ?? {};

  const { error } = await supabase.from(TABLE).upsert(
    {
      dow,
      zone_slots:   zone_slots   ?? {},
      lunch_slots:  lunch_slots  ?? {},
      rest_slots:   rest_slots   ?? {},
      lunch_offset: lunch_offset ?? 0,
      rest_offset:  rest_offset  ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dow" }
  );

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `zone_assignments 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

export default router;
