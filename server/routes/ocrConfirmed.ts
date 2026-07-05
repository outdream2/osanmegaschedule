import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
const TABLE = "ocr_confirmed_items";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS ocr_confirmed_items (
  id           SERIAL PRIMARY KEY,
  saved_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier     TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_code TEXT,
  quantity     NUMERIC,
  unit_price   NUMERIC,
  amount       NUMERIC,
  balance      NUMERIC,
  expiry_date  TEXT,
  memo         TEXT,
  raw_json     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// 테이블 존재 여부 사전 체크 — 없으면 SQL 안내
(async () => {
  const { error } = await supabase.from(TABLE).select("id").limit(1);
  if (error && /relation|does not exist/i.test(error.message)) {
    console.warn(`\n[SETUP REQUIRED] '${TABLE}' 테이블이 없습니다.`);
    console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
    console.warn(CREATE_SQL);
  }
})();

interface ConfirmedItemInput {
  supplier?: string;
  product_name?: string;
  product_code?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  balance?: number | null;
  expiry_date?: string | null;
  memo?: string | null;
  raw_json?: Record<string, unknown> | null;
  saved_at?: string | null;
}

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
};

// POST /api/ocr-confirmed-items  →  batch insert
router.post("/api/ocr-confirmed-items", async (req, res) => {
  const body = req.body ?? {};
  const rawItems: ConfirmedItemInput[] = Array.isArray(body.items) ? body.items : [];
  const defaultSavedAt: string | undefined = typeof body.saved_at === "string" ? body.saved_at : undefined;

  if (rawItems.length === 0) {
    return res.status(400).json({ error: "items 배열이 비어 있습니다." });
  }

  const rows = rawItems
    .map(item => {
      const supplier = String(item.supplier ?? "").trim();
      const product_name = String(item.product_name ?? "").trim();
      if (!supplier || !product_name) return null;
      return {
        saved_at: item.saved_at ?? defaultSavedAt ?? new Date().toISOString().slice(0, 10),
        supplier,
        product_name,
        product_code: item.product_code ? String(item.product_code).trim() : null,
        quantity: toNumOrNull(item.quantity),
        unit_price: toNumOrNull(item.unit_price),
        amount: toNumOrNull(item.amount),
        balance: toNumOrNull(item.balance),
        expiry_date: item.expiry_date ? String(item.expiry_date).trim() : null,
        memo: item.memo ? String(item.memo) : null,
        raw_json: item.raw_json ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return res.status(400).json({ error: "저장 가능한 항목이 없습니다. (공급처/품명 필수)" });
  }

  const { data, error } = await supabase.from(TABLE).insert(rows).select();

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `${TABLE} 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ ok: true, inserted: data?.length ?? rows.length, items: data ?? [] });
});

// GET /api/ocr-confirmed-items?date=YYYY-MM-DD&supplier=xxx
router.get("/api/ocr-confirmed-items", async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";
  const supplierParam = typeof req.query.supplier === "string" ? req.query.supplier.trim() : "";

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("saved_at", { ascending: false })
    .order("id", { ascending: false });

  if (dateParam) {
    query = query.eq("saved_at", dateParam);
  } else {
    // 최근 30일 (오늘 포함)
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const fromStr = from.toISOString().slice(0, 10);
    query = query.gte("saved_at", fromStr);
  }

  if (supplierParam) {
    query = query.ilike("supplier", `%${supplierParam}%`);
  }

  const { data, error } = await query;

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json({ items: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ items: data ?? [] });
});

// DELETE /api/ocr-confirmed-items/:id
router.delete("/api/ocr-confirmed-items/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "유효한 id가 필요합니다." });
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
