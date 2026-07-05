import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
// zone_assignments 테이블은 settings.ts에서 zone_id 기반 구역 배치 데이터로 사용 중.
// 요일별 근무 배치 템플릿(dow + JSONB)은 별도 테이블 zone_dow_templates 에 저장한다.
const TABLE = "zone_dow_templates";
// 날짜별 배정은 zone_day_assignments 테이블에 저장한다.
const DAY_TABLE = "zone_day_assignments";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS zone_dow_templates (
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
`;

const CREATE_DAY_SQL = `
CREATE TABLE IF NOT EXISTS zone_day_assignments (
  date           TEXT PRIMARY KEY,
  zone_slots     JSONB    NOT NULL DEFAULT '{}',
  lunch_slots    JSONB    NOT NULL DEFAULT '{}',
  rest_slots     JSONB    NOT NULL DEFAULT '{}',
  lunch_offset   INTEGER  NOT NULL DEFAULT 0,
  rest_offset    INTEGER  NOT NULL DEFAULT 0,
  lunch_interval INTEGER  NOT NULL DEFAULT 30,
  rest_interval  INTEGER  NOT NULL DEFAULT 30,
  lunch_count    INTEGER  NOT NULL DEFAULT 1,
  rest_count     INTEGER  NOT NULL DEFAULT 1,
  is_confirmed   BOOLEAN  NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

(async () => {
  const { error } = await supabase.from(DAY_TABLE).select("date").limit(1);
  if (error && /relation|does not exist/i.test(error.message)) {
    console.warn(`\n[SETUP REQUIRED] '${DAY_TABLE}' 테이블이 없습니다.`);
    console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
    console.warn(CREATE_DAY_SQL);
  }
})();

// ↑ zone_assignments 테이블과 이름이 달라 충돌하지 않는다.
// zone_assignments  = settings.ts 에서 사용하는 zone_id 기반 구역 배치 테이블
// zone_dow_templates = 이 파일에서 사용하는 요일별 근무 배치 JSONB 템플릿 테이블

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
      return res.status(503).json({ error: `zone_dow_templates 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

// ─── 날짜별 배정 API ──────────────────────────────────────────────────────────

const EMPTY_DAY_ROW = {
  zone_slots: {},
  lunch_slots: {},
  rest_slots: {},
  lunch_offset: 0,
  rest_offset: 0,
  lunch_interval: 30,
  rest_interval: 30,
  lunch_count: 1,
  rest_count: 1,
  is_confirmed: false,
};

// GET /api/zone-day/:date  →  특정 날짜 배정 불러오기
router.get("/api/zone-day/:date", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date는 YYYY-MM-DD 형식이어야 합니다" });

  const { data, error } = await supabase.from(DAY_TABLE).select("*").eq("date", date).maybeSingle();
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json({ date, ...EMPTY_DAY_ROW });
    }
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.json({ date, ...EMPTY_DAY_ROW, _empty: true });
  return res.json({
    ...data,
    lunch_interval: (data as Record<string, unknown>).lunch_interval ?? 30,
    rest_interval:  (data as Record<string, unknown>).rest_interval  ?? 30,
    lunch_count:    (data as Record<string, unknown>).lunch_count    ?? 1,
    rest_count:     (data as Record<string, unknown>).rest_count     ?? 1,
    is_confirmed:   (data as Record<string, unknown>).is_confirmed   ?? false,
  });
});

// PUT /api/zone-day/:date  →  날짜별 배정 저장 (upsert)
router.put("/api/zone-day/:date", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date는 YYYY-MM-DD 형식이어야 합니다" });

  const {
    zone_slots, lunch_slots, rest_slots,
    lunch_offset, rest_offset,
    lunch_interval, rest_interval,
    lunch_count, rest_count,
    is_confirmed,
  } = req.body ?? {};

  const payload = {
    date,
    zone_slots:     zone_slots     ?? {},
    lunch_slots:    lunch_slots    ?? {},
    rest_slots:     rest_slots     ?? {},
    lunch_offset:   lunch_offset   ?? 0,
    rest_offset:    rest_offset    ?? 0,
    lunch_interval: lunch_interval ?? 30,
    rest_interval:  rest_interval  ?? 30,
    lunch_count:    lunch_count    ?? 1,
    rest_count:     rest_count     ?? 1,
    is_confirmed:   is_confirmed   ?? false,
    updated_at:     new Date().toISOString(),
  };

  let { error } = await supabase.from(DAY_TABLE).upsert(payload, { onConflict: "date" });

  // 구 스키마 fallback: is_confirmed / interval / count 컬럼이 없으면 제외하고 재시도
  if (error && /column .*(is_confirmed|lunch_interval|rest_interval|lunch_count|rest_count).* does not exist/i.test(error.message)) {
    const {
      is_confirmed: _ic,
      lunch_interval: _li,
      rest_interval: _ri,
      lunch_count: _lc,
      rest_count: _rc,
      ...legacyPayload
    } = payload;
    void _ic; void _li; void _ri; void _lc; void _rc;
    ({ error } = await supabase.from(DAY_TABLE).upsert(legacyPayload, { onConflict: "date" }));
  }

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `zone_day_assignments 테이블이 없습니다.\n${CREATE_DAY_SQL}` });
    }
    console.error("[zone-day PUT] error:", error);
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

// POST /api/zone-day/copy-month  →  전월의 일별 배정을 이번 달로 복사
// body: { targetYear, targetMonth, overwrite: boolean }
router.post("/api/zone-day/copy-month", async (req, res) => {
  const { targetYear, targetMonth, overwrite } = req.body ?? {};
  const y = parseInt(targetYear, 10);
  const m = parseInt(targetMonth, 10);
  if (!y || !m || m < 1 || m > 12) return res.status(400).json({ error: "targetYear/targetMonth 필수" });

  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevPrefix = `${prevY}-${String(prevM).padStart(2, "0")}-`;
  const curPrefix  = `${y}-${String(m).padStart(2, "0")}-`;

  // 이전 달 데이터 로드
  const { data: prevRows, error: prevErr } = await supabase
    .from(DAY_TABLE)
    .select("*")
    .like("date", `${prevPrefix}%`);
  if (prevErr) {
    if (/relation|does not exist/i.test(prevErr.message)) return res.json({ ok: true, count: 0 });
    return res.status(500).json({ error: prevErr.message });
  }
  if (!prevRows || prevRows.length === 0) return res.json({ ok: true, count: 0 });

  // 이번 달 기존 데이터 확인
  const { data: curRows } = await supabase
    .from(DAY_TABLE)
    .select("date")
    .like("date", `${curPrefix}%`);
  const hasExisting = (curRows?.length ?? 0) > 0;
  if (hasExisting && !overwrite) {
    return res.status(409).json({ error: "이번 달에 이미 일별 근무설정 데이터가 있습니다.", hasExisting: true });
  }

  // day-of-month 기준으로 복사 (일이 없으면 skip)
  const daysInPrev = new Date(prevY, prevM, 0).getDate();
  const daysInCur  = new Date(y, m, 0).getDate();
  const payloads: any[] = [];
  for (const row of prevRows) {
    const day = parseInt((row.date as string).slice(-2), 10);
    if (day < 1 || day > daysInCur) continue; // 이번 달에 없는 날짜(31일 등) skip
    payloads.push({
      date: `${curPrefix}${String(day).padStart(2, "0")}`,
      zone_slots:     row.zone_slots ?? {},
      lunch_slots:    row.lunch_slots ?? {},
      rest_slots:     row.rest_slots ?? {},
      lunch_offset:   (row as any).lunch_offset ?? 0,
      rest_offset:    (row as any).rest_offset ?? 0,
      lunch_interval: (row as any).lunch_interval ?? 30,
      rest_interval:  (row as any).rest_interval ?? 30,
      lunch_count:    (row as any).lunch_count ?? 1,
      rest_count:     (row as any).rest_count ?? 1,
      is_confirmed:   false,
      updated_at:     new Date().toISOString(),
    });
  }
  void daysInPrev;
  if (payloads.length === 0) return res.json({ ok: true, count: 0 });

  const { error: upErr } = await supabase.from(DAY_TABLE).upsert(payloads, { onConflict: "date" });
  if (upErr) {
    console.error("[zone-day copy-month] error:", upErr);
    return res.status(500).json({ error: upErr.message });
  }
  return res.json({ ok: true, count: payloads.length });
});

export default router;
