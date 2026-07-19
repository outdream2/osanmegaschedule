import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
const SESSION_TABLE = "stock_reconciliation_sessions";
const ITEMS_TABLE = "stock_reconciliation_items";

// ── DDL (사용자가 Supabase SQL Editor에서 직접 실행) ────────────────────────
const CREATE_SQL = `
-- 1) 세션 테이블
CREATE TABLE IF NOT EXISTS stock_reconciliation_sessions (
  id                   SERIAL PRIMARY KEY,
  session_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier             TEXT,
  title                TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  source_confirmed_ids INTEGER[],
  memo                 TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at         TIMESTAMPTZ
);

-- 2) 아이템 테이블
CREATE TABLE IF NOT EXISTS stock_reconciliation_items (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER NOT NULL
                   REFERENCES stock_reconciliation_sessions(id) ON DELETE CASCADE,
  product_code   TEXT NOT NULL,
  product_name   TEXT,
  receiving_qty  NUMERIC,
  invoice_qty    NUMERIC,
  erp_qty        NUMERIC,
  receiving_note TEXT,
  invoice_note   TEXT,
  erp_note       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, product_code)
);
`;

// ── 담당자 확인 컬럼 ALTER (신규 설치 시 아래 SQL도 실행 필요) ─────────────────
const ALTER_CONFIRM_COLS_SQL = `
ALTER TABLE stock_reconciliation_items
  ADD COLUMN IF NOT EXISTS receiving_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS receiving_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_confirmed_by    TEXT,
  ADD COLUMN IF NOT EXISTS invoice_confirmed_at    TIMESTAMPTZ;
`;

// ── 테이블 존재 여부 체크 ────────────────────────────────────────────────────
(async () => {
  const { error } = await supabase.from(SESSION_TABLE).select("id").limit(1);
  if (error && /relation|does not exist/i.test(error.message)) {
    console.warn(`\n[SETUP REQUIRED] '${SESSION_TABLE}' 테이블이 없습니다.`);
    console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
    console.warn(CREATE_SQL);
    console.warn("[SETUP REQUIRED] 담당자 확인 컬럼도 추가하세요:\n");
    console.warn(ALTER_CONFIRM_COLS_SQL);
  } else {
    // 테이블은 있으나 확인 컬럼이 없을 수 있음 → 안내만 출력
    const { error: colErr } = await supabase
      .from(ITEMS_TABLE)
      .select("receiving_confirmed_by")
      .limit(1);
    if (colErr && /column|does not exist/i.test(colErr.message)) {
      console.warn("\n[SETUP REQUIRED] stock_reconciliation_items 에 담당자 확인 컬럼이 없습니다.");
      console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
      console.warn(ALTER_CONFIRM_COLS_SQL);
    }
  }
})();

// ── 유틸 ────────────────────────────────────────────────────────────────────
const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
};

const ALLOWED_STATUSES = [
  "draft",
  "receiving_done",
  "invoice_matched",
  "erp_done",
  "finalized",
] as const;

type ReconciliationStatus = (typeof ALLOWED_STATUSES)[number];

// ── 인터페이스 ───────────────────────────────────────────────────────────────
interface SessionCreateBody {
  session_date?: string;
  supplier?: string;
  title?: string;
  memo?: string;
  source_confirmed_ids?: number[];
  created_by?: string;
}

interface SessionPatchBody {
  title?: string;
  status?: ReconciliationStatus;
  memo?: string;
  source_confirmed_ids?: number[];
  supplier?: string;
}

interface ItemInput {
  product_code: string;
  product_name?: string;
  receiving_qty?: number | null;
  invoice_qty?: number | null;
  erp_qty?: number | null;
  receiving_note?: string | null;
  invoice_note?: string | null;
  erp_note?: string | null;
}

interface ItemPatchBody {
  product_name?: string | null;
  receiving_qty?: number | string | null;
  invoice_qty?: number | string | null;
  erp_qty?: number | string | null;
  receiving_note?: string | null;
  invoice_note?: string | null;
  erp_note?: string | null;
  receiving_confirmed_by?: string | null;
  receiving_confirmed_at?: string | null;
  invoice_confirmed_by?: string | null;
  invoice_confirmed_at?: string | null;
}

// ISO date-ish (YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM:SS...) 만 통과
function normalizeConfirmedAt(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // YYYY-MM-DD → 노말라이즈 (해당 날짜 09:00 KST 로 고정하지 않고 UTC 자정 사용)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// ── GET /api/stock-reconciliation/recent-confirms ───────────────────────────
// 최근 확인된 아이템 이력 조회
// query: limit (default 30, max 200)
// 반환: { confirms: [{ item_id, session_id, session_title, session_date,
//                      product_code, product_name, stage, confirmed_by,
//                      confirmed_at, qty }] }
// stage 별 (receiving, invoice) 로 각각 한 줄씩 · 최근 confirmed_at 내림차순
router.get("/api/stock-reconciliation/recent-confirms", async (req, res) => {
  const limitParam =
    typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 30;
  const limitVal =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 200)
      : 30;

  // 확인된 아이템만 (receiving OR invoice) — 서버측에서 최대 limit*2 만큼 뽑고
  // 나중에 stage 별로 flat 하게 만든 뒤 limit 컷.
  const { data: rows, error } = await supabase
    .from(ITEMS_TABLE)
    .select(
      "id, session_id, product_code, product_name, receiving_qty, invoice_qty, receiving_confirmed_by, receiving_confirmed_at, invoice_confirmed_by, invoice_confirmed_at",
    )
    .or(
      "receiving_confirmed_by.not.is.null,invoice_confirmed_by.not.is.null",
    )
    .order("updated_at", { ascending: false })
    .limit(limitVal * 2);

  if (error) {
    // 컬럼 없음 → 빈 리스트
    if (/column|does not exist|relation/i.test(error.message)) {
      return res.json({ confirms: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  const items = rows ?? [];
  const sessionIds = Array.from(
    new Set(items.map((r: any) => Number(r.session_id)).filter(Number.isFinite)),
  );

  // 세션 정보 join
  const sessMap = new Map<number, { title: string | null; session_date: string | null }>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from(SESSION_TABLE)
      .select("id, title, session_date")
      .in("id", sessionIds);
    (sessions ?? []).forEach((s: any) => {
      sessMap.set(Number(s.id), {
        title: s.title ?? null,
        session_date: s.session_date ?? null,
      });
    });
  }

  interface ConfirmRow {
    item_id: number;
    session_id: number;
    session_title: string | null;
    session_date: string | null;
    product_code: string;
    product_name: string | null;
    stage: "receiving" | "invoice";
    confirmed_by: string;
    confirmed_at: string;
    qty: number | null;
  }

  const flat: ConfirmRow[] = [];
  for (const r of items as any[]) {
    const sInfo = sessMap.get(Number(r.session_id));
    if (r.receiving_confirmed_by && r.receiving_confirmed_at) {
      flat.push({
        item_id: Number(r.id),
        session_id: Number(r.session_id),
        session_title: sInfo?.title ?? null,
        session_date: sInfo?.session_date ?? null,
        product_code: String(r.product_code ?? ""),
        product_name: r.product_name ?? null,
        stage: "receiving",
        confirmed_by: String(r.receiving_confirmed_by),
        confirmed_at: String(r.receiving_confirmed_at),
        qty: toNumOrNull(r.receiving_qty),
      });
    }
    if (r.invoice_confirmed_by && r.invoice_confirmed_at) {
      flat.push({
        item_id: Number(r.id),
        session_id: Number(r.session_id),
        session_title: sInfo?.title ?? null,
        session_date: sInfo?.session_date ?? null,
        product_code: String(r.product_code ?? ""),
        product_name: r.product_name ?? null,
        stage: "invoice",
        confirmed_by: String(r.invoice_confirmed_by),
        confirmed_at: String(r.invoice_confirmed_at),
        qty: toNumOrNull(r.invoice_qty),
      });
    }
  }

  // confirmed_at desc
  flat.sort((a, b) => (a.confirmed_at < b.confirmed_at ? 1 : -1));
  return res.json({ confirms: flat.slice(0, limitVal) });
});

// ── GET /api/stock-reconciliation ───────────────────────────────────────────
// query: from, to, status, limit (default 50)
router.get("/api/stock-reconciliation", async (req, res) => {
  const fromDate = typeof req.query.from === "string" ? req.query.from.trim() : null;
  const toDate = typeof req.query.to === "string" ? req.query.to.trim() : null;
  const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : null;
  const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const limitVal = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;

  let query = supabase
    .from(SESSION_TABLE)
    .select("*")
    .order("session_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limitVal);

  if (fromDate) query = query.gte("session_date", fromDate);
  if (toDate) query = query.lte("session_date", toDate);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) {
    if (/relation|does not exist/i.test(error.message)) return res.json({ sessions: [] });
    return res.status(500).json({ error: error.message });
  }
  return res.json({ sessions: data ?? [] });
});

// ── GET /api/stock-reconciliation/:id ───────────────────────────────────────
router.get("/api/stock-reconciliation/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "유효한 id가 필요합니다." });

  const [sessionRes, itemsRes] = await Promise.all([
    supabase.from(SESSION_TABLE).select("*").eq("id", id).single(),
    supabase
      .from(ITEMS_TABLE)
      .select("*")
      .eq("session_id", id)
      .order("product_code", { ascending: true }),
  ]);

  if (sessionRes.error) {
    if (/no rows|not found/i.test(sessionRes.error.message) || sessionRes.error.code === "PGRST116") {
      return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
    }
    return res.status(500).json({ error: sessionRes.error.message });
  }
  if (itemsRes.error) return res.status(500).json({ error: itemsRes.error.message });

  return res.json({ session: sessionRes.data, items: itemsRes.data ?? [] });
});

// ── POST /api/stock-reconciliation ──────────────────────────────────────────
router.post("/api/stock-reconciliation", async (req, res) => {
  const body: SessionCreateBody = req.body ?? {};

  const row: Record<string, unknown> = {
    status: "draft",
  };
  if (typeof body.session_date === "string" && body.session_date.trim()) {
    row.session_date = body.session_date.trim();
  }
  if (typeof body.supplier === "string" && body.supplier.trim()) {
    row.supplier = body.supplier.trim();
  }
  if (typeof body.title === "string" && body.title.trim()) {
    row.title = body.title.trim();
  }
  if (typeof body.memo === "string" && body.memo.trim()) {
    row.memo = body.memo.trim();
  }
  if (typeof body.created_by === "string" && body.created_by.trim()) {
    row.created_by = body.created_by.trim();
  }
  if (Array.isArray(body.source_confirmed_ids)) {
    row.source_confirmed_ids = body.source_confirmed_ids.map(Number).filter(Number.isFinite);
  }

  const { data, error } = await supabase.from(SESSION_TABLE).insert(row).select().single();
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `${SESSION_TABLE} 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ session: data });
});

// ── PATCH /api/stock-reconciliation/:id ─────────────────────────────────────
router.patch("/api/stock-reconciliation/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "유효한 id가 필요합니다." });

  const body: SessionPatchBody = req.body ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) patch.title = typeof body.title === "string" ? body.title.trim() || null : null;
  if (body.memo !== undefined) patch.memo = typeof body.memo === "string" ? body.memo.trim() || null : null;
  if (body.supplier !== undefined) patch.supplier = typeof body.supplier === "string" ? body.supplier.trim() || null : null;
  if (body.status !== undefined) {
    if (!(ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
      return res.status(400).json({ error: `status는 ${ALLOWED_STATUSES.join(" | ")} 중 하나여야 합니다.` });
    }
    patch.status = body.status;
  }
  if (body.source_confirmed_ids !== undefined) {
    if (!Array.isArray(body.source_confirmed_ids)) {
      return res.status(400).json({ error: "source_confirmed_ids는 배열이어야 합니다." });
    }
    patch.source_confirmed_ids = body.source_confirmed_ids.map(Number).filter(Number.isFinite);
  }

  if (Object.keys(patch).length === 1) {
    // only updated_at — nothing meaningful supplied
    return res.status(400).json({ error: "변경할 필드가 없습니다." });
  }

  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (/no rows|not found/i.test(error.message) || error.code === "PGRST116") {
      return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ session: data });
});

// ── POST /api/stock-reconciliation/:id/items ────────────────────────────────
// 배치 upsert — (session_id, product_code) 기준
router.post("/api/stock-reconciliation/:id/items", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "유효한 세션 id가 필요합니다." });
  }

  const rawItems: ItemInput[] = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) {
    return res.status(400).json({ error: "items 배열이 비어 있습니다." });
  }

  const rows = rawItems
    .map((item) => {
      const code = typeof item.product_code === "string" ? item.product_code.trim() : "";
      if (!code) return null;
      return {
        session_id: sessionId,
        product_code: code,
        product_name: typeof item.product_name === "string" ? item.product_name.trim() || null : null,
        receiving_qty: toNumOrNull(item.receiving_qty),
        invoice_qty: toNumOrNull(item.invoice_qty),
        erp_qty: toNumOrNull(item.erp_qty),
        receiving_note: typeof item.receiving_note === "string" ? item.receiving_note.trim() || null : null,
        invoice_note: typeof item.invoice_note === "string" ? item.invoice_note.trim() || null : null,
        erp_note: typeof item.erp_note === "string" ? item.erp_note.trim() || null : null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return res.status(400).json({ error: "유효한 항목이 없습니다. (product_code 필수)" });
  }

  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .upsert(rows, { onConflict: "session_id,product_code" })
    .select();

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `${ITEMS_TABLE} 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }

  // 세션 updated_at 갱신
  await supabase
    .from(SESSION_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return res.json({ ok: true, upserted: data?.length ?? rows.length, items: data ?? [] });
});

// ── DELETE /api/stock-reconciliation/:id/items/:itemId ──────────────────────
router.delete("/api/stock-reconciliation/:id/items/:itemId", async (req, res) => {
  const sessionId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(sessionId) || sessionId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
    return res.status(400).json({ error: "유효한 id가 필요합니다." });
  }

  const { error } = await supabase
    .from(ITEMS_TABLE)
    .delete()
    .eq("id", itemId)
    .eq("session_id", sessionId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ── POST /api/stock-reconciliation/:id/import-from-confirmed ────────────────
// ocr_confirmed_items 의 quantity → invoice_qty 로 자동 채움
router.post("/api/stock-reconciliation/:id/import-from-confirmed", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "유효한 세션 id가 필요합니다." });
  }

  const confirmedIds: number[] = Array.isArray(req.body?.confirmed_ids)
    ? req.body.confirmed_ids.map(Number).filter(Number.isFinite)
    : [];
  if (confirmedIds.length === 0) {
    return res.status(400).json({ error: "confirmed_ids 배열이 비어 있습니다." });
  }

  // 세션 존재 확인
  const { data: session, error: sessErr } = await supabase
    .from(SESSION_TABLE)
    .select("id")
    .eq("id", sessionId)
    .single();
  if (sessErr || !session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });

  // ocr_confirmed_items 조회
  const { data: confirmed, error: confErr } = await supabase
    .from("ocr_confirmed_items")
    .select("id, product_code, product_name, quantity")
    .in("id", confirmedIds);

  if (confErr) return res.status(500).json({ error: confErr.message });
  if (!confirmed || confirmed.length === 0) {
    return res.status(404).json({ error: "해당 confirmed_ids에 해당하는 항목이 없습니다." });
  }

  // product_code 없는 항목은 건너뜀, 같은 product_code끼리 수량 합산
  const aggregated = new Map<string, { product_name: string | null; qty: number }>();
  for (const row of confirmed) {
    const code = typeof row.product_code === "string" ? row.product_code.trim() : "";
    if (!code) continue;
    const qty = toNumOrNull(row.quantity) ?? 0;
    const existing = aggregated.get(code);
    if (existing) {
      existing.qty += qty;
    } else {
      aggregated.set(code, {
        product_name: typeof row.product_name === "string" ? row.product_name.trim() || null : null,
        qty,
      });
    }
  }

  if (aggregated.size === 0) {
    return res.status(400).json({ error: "product_code 있는 항목이 없습니다." });
  }

  const rows = Array.from(aggregated.entries()).map(([code, info]) => ({
    session_id: sessionId,
    product_code: code,
    product_name: info.product_name,
    invoice_qty: info.qty,
    updated_at: new Date().toISOString(),
  }));

  const { data: upserted, error: upsertErr } = await supabase
    .from(ITEMS_TABLE)
    .upsert(rows, { onConflict: "session_id,product_code" })
    .select();

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  // source_confirmed_ids 세션에 병합
  const { data: sess2 } = await supabase
    .from(SESSION_TABLE)
    .select("source_confirmed_ids")
    .eq("id", sessionId)
    .single();

  const existingIds: number[] = Array.isArray(sess2?.source_confirmed_ids)
    ? sess2.source_confirmed_ids
    : [];
  const mergedIds = Array.from(new Set([...existingIds, ...confirmedIds]));

  await supabase
    .from(SESSION_TABLE)
    .update({ source_confirmed_ids: mergedIds, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return res.json({
    ok: true,
    imported: upserted?.length ?? rows.length,
    items: upserted ?? [],
  });
});

// ── POST /api/stock-reconciliation/:id/finalize ─────────────────────────────
router.post("/api/stock-reconciliation/:id/finalize", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "유효한 세션 id가 필요합니다." });
  }

  // 세션 존재 확인
  const { data: session, error: sessErr } = await supabase
    .from(SESSION_TABLE)
    .select("id, status")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
  if (session.status === "finalized") {
    return res.status(400).json({ error: "이미 finalized 상태입니다." });
  }

  // 모든 아이템 조회
  const { data: items, error: itemsErr } = await supabase
    .from(ITEMS_TABLE)
    .select("product_code, product_name, receiving_qty, invoice_qty, erp_qty")
    .eq("session_id", sessionId);

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });
  if (!items || items.length === 0) {
    return res.status(400).json({ error: "finalize할 아이템이 없습니다." });
  }

  // 불일치 검사: 세 값 모두 not null + 동일해야 통과
  const mismatches = items.filter((item) => {
    const r = toNumOrNull(item.receiving_qty);
    const i = toNumOrNull(item.invoice_qty);
    const e = toNumOrNull(item.erp_qty);
    // null 이면 미입력 → 불일치 처리
    if (r == null || i == null || e == null) return true;
    return !(r === i && i === e);
  });

  if (mismatches.length > 0) {
    return res.status(400).json({
      error: "수량 불일치 항목이 있어 finalize할 수 없습니다.",
      mismatches: mismatches.map((m) => ({
        product_code: m.product_code,
        product_name: m.product_name ?? null,
        receiving_qty: m.receiving_qty,
        invoice_qty: m.invoice_qty,
        erp_qty: m.erp_qty,
      })),
    });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from(SESSION_TABLE)
    .update({ status: "finalized", finalized_at: now, updated_at: now })
    .eq("id", sessionId)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  return res.json({ ok: true, session: updated });
});

// ── POST /api/stock-reconciliation/:id/items/:itemId/confirm ────────────────
// body: { stage: "receiving" | "invoice", confirmed_by: string, confirmed_at?: string }
// confirmed_by 가 빈 문자열이면 확인 취소 (null 처리)
// confirmed_at 이 유효 날짜면 그 값으로 세팅 · 아니면 서버 now
router.post("/api/stock-reconciliation/:id/items/:itemId/confirm", async (req, res) => {
  const sessionId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (
    !Number.isFinite(sessionId) || sessionId <= 0 ||
    !Number.isFinite(itemId)   || itemId   <= 0
  ) {
    return res.status(400).json({ error: "유효한 id가 필요합니다." });
  }

  const stage: unknown = req.body?.stage;
  if (stage !== "receiving" && stage !== "invoice") {
    return res.status(400).json({ error: 'stage는 "receiving" 또는 "invoice" 이어야 합니다.' });
  }

  const rawBy: unknown = req.body?.confirmed_by;
  const confirmedBy =
    typeof rawBy === "string" && rawBy.trim() ? rawBy.trim() : null;

  // 클라이언트가 날짜를 넘겼으면 그 날짜로 confirmed_at 세팅 (없거나 잘못되면 서버 now)
  const rawAt: unknown = req.body?.confirmed_at;
  const overrideAt = normalizeConfirmedAt(rawAt);
  const nowIso = new Date().toISOString();
  const targetAt = overrideAt || nowIso;

  // 세션 소속 확인
  const { data: existingItem, error: fetchErr } = await supabase
    .from(ITEMS_TABLE)
    .select("id")
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .single();

  if (fetchErr || !existingItem) {
    return res.status(404).json({ error: "아이템을 찾을 수 없습니다." });
  }

  const patch: Record<string, unknown> = { updated_at: nowIso };
  if (stage === "receiving") {
    patch.receiving_confirmed_by = confirmedBy;
    patch.receiving_confirmed_at = confirmedBy ? targetAt : null;
  } else {
    patch.invoice_confirmed_by = confirmedBy;
    patch.invoice_confirmed_at = confirmedBy ? targetAt : null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from(ITEMS_TABLE)
    .update(patch)
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  return res.json({ ok: true, item: updated });
});

// ── DELETE /api/stock-reconciliation/:id ────────────────────────────────────
router.delete("/api/stock-reconciliation/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "유효한 id가 필요합니다." });

  // draft / receiving_done 만 삭제 허용
  const { data: session, error: sessErr } = await supabase
    .from(SESSION_TABLE)
    .select("id, status")
    .eq("id", id)
    .single();

  if (sessErr || !session) return res.status(404).json({ error: "세션을 찾을 수 없습니다." });

  const deletableStatuses: ReconciliationStatus[] = ["draft", "receiving_done"];
  if (!deletableStatuses.includes(session.status as ReconciliationStatus)) {
    return res.status(400).json({
      error: `'${session.status}' 상태의 세션은 삭제할 수 없습니다. (draft / receiving_done 만 가능)`,
    });
  }

  const { error } = await supabase.from(SESSION_TABLE).delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
