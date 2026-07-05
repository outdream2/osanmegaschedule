import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
const TABLE = "zone_assignments";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS zone_assignments (
  dow            INTEGER PRIMARY KEY CHECK (dow BETWEEN 0 AND 6),
  zone_slots     JSONB   NOT NULL DEFAULT '{}',
  lunch_slots    JSONB   NOT NULL DEFAULT '{}',
  rest_slots     JSONB   NOT NULL DEFAULT '{}',
  lunch_offset   INTEGER NOT NULL DEFAULT 0,
  rest_offset    INTEGER NOT NULL DEFAULT 0,
  lunch_interval INTEGER NOT NULL DEFAULT 30,
  rest_interval  INTEGER NOT NULL DEFAULT 30,
  lunch_count    INTEGER NOT NULL DEFAULT 1,
  rest_count     INTEGER NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 기존 테이블에 컬럼 추가 (없을 때만)
ALTER TABLE zone_assignments ADD COLUMN IF NOT EXISTS lunch_interval INTEGER NOT NULL DEFAULT 30;
ALTER TABLE zone_assignments ADD COLUMN IF NOT EXISTS rest_interval  INTEGER NOT NULL DEFAULT 30;
ALTER TABLE zone_assignments ADD COLUMN IF NOT EXISTS lunch_count    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE zone_assignments ADD COLUMN IF NOT EXISTS rest_count     INTEGER NOT NULL DEFAULT 1;
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

const EMPTY_ROW = {
  zone_slots: {},
  lunch_slots: {},
  rest_slots: {},
  lunch_offset: 0,
  rest_offset: 0,
  lunch_interval: 30,
  rest_interval: 30,
  lunch_count: 1,
  rest_count: 1,
};

// GET /api/zone-assignments/:dow  →  { dow, zone_slots, lunch_slots, rest_slots, lunch_offset, rest_offset, lunch_interval, rest_interval }
router.get("/api/zone-assignments/:dow", async (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: "dow는 0~6이어야 합니다" });

  const { data, error } = await supabase.from(TABLE).select("*").eq("dow", dow).maybeSingle();
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json({ dow, ...EMPTY_ROW });
    }
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.json({ dow, ...EMPTY_ROW });
  // DB에 interval 컬럼이 없을 수 있으니 기본값 fallback
  return res.json({
    ...data,
    lunch_interval: (data as { lunch_interval?: number }).lunch_interval ?? 30,
    rest_interval:  (data as { rest_interval?: number }).rest_interval ?? 30,
    lunch_count:    (data as { lunch_count?: number }).lunch_count ?? 1,
    rest_count:     (data as { rest_count?: number }).rest_count ?? 1,
  });
});

// PUT /api/zone-assignments/:dow  →  upsert template for that day-of-week
router.put("/api/zone-assignments/:dow", async (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: "dow는 0~6이어야 합니다" });

  const { zone_slots, lunch_slots, rest_slots, lunch_offset, rest_offset, lunch_interval, rest_interval, lunch_count, rest_count } = req.body ?? {};

  const fullPayload = {
    dow,
    zone_slots:     zone_slots     ?? {},
    lunch_slots:    lunch_slots    ?? {},
    rest_slots:     rest_slots     ?? {},
    lunch_offset:   lunch_offset   ?? 0,
    rest_offset:    rest_offset    ?? 0,
    lunch_interval: lunch_interval ?? 30,
    rest_interval:  rest_interval  ?? 30,
    lunch_count:    lunch_count    ?? 1,
    rest_count:     rest_count     ?? 1,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase.from(TABLE).upsert(fullPayload, { onConflict: "dow" });

  // 컬럼이 아직 없는 경우 (구 스키마) 신규 필드 제외하고 재시도
  if (error && /column .*(lunch_interval|rest_interval|lunch_count|rest_count).* does not exist/i.test(error.message)) {
    const {
      lunch_interval: _li,
      rest_interval: _ri,
      lunch_count: _lc,
      rest_count: _rc,
      ...legacyPayload
    } = fullPayload;
    void _li; void _ri; void _lc; void _rc;
    ({ error } = await supabase.from(TABLE).upsert(legacyPayload, { onConflict: "dow" }));
  }

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `zone_assignments 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

export default router;
