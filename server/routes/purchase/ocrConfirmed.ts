// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { clearOcrAggCache } from "../stock/stockManage";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();
const TABLE = "ocr_confirmed_items";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS ocr_confirmed_items (
  id              SERIAL PRIMARY KEY,
  saved_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_date    TEXT,
  supplier        TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  product_code    TEXT,
  quantity        NUMERIC,
  unit_price      NUMERIC,
  amount          NUMERIC,
  balance         NUMERIC,
  expiry_date     TEXT,
  memo            TEXT,
  raw_json        JSONB,
  image_url       TEXT,
  image_public_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 기존 테이블 컬럼 추가 (컬럼 없으면):
-- ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS invoice_date TEXT;
-- ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS image_url TEXT;
-- ALTER TABLE ocr_confirmed_items ADD COLUMN IF NOT EXISTS image_public_id TEXT;
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
  invoice_date?: string | null; // 거래명세서 원본 날짜 (OCR meta.date)
  image_url?: string | null;         // 2026-07-28 · Cloudinary 이미지 URL
  image_public_id?: string | null;   // 2026-07-28 · Cloudinary public_id (삭제 시 사용)
}

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
};

// POST /api/ocr-confirmed-items  →  batch insert
// 2026-08-29 · 보안 P1 N9 fix · authorize(2) · OCR 확정 매입 임의 삽입 방지
router.post("/api/ocr-confirmed-items", authorize(2), asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const rawItems: ConfirmedItemInput[] = Array.isArray(body.items) ? body.items : [];
  const defaultSavedAt: string | undefined = typeof body.saved_at === "string" ? body.saved_at : undefined;

  if (rawItems.length === 0) throw badRequest("items 배열이 비어 있습니다.");

  const rows = rawItems
    .map(item => {
      const supplier = String(item.supplier ?? "").trim();
      const product_name = String(item.product_name ?? "").trim();
      if (!supplier || !product_name) return null;
      return {
        saved_at: item.saved_at ?? defaultSavedAt ?? new Date().toISOString().slice(0, 10),
        invoice_date: item.invoice_date ? String(item.invoice_date).trim() : null,
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
        // 2026-07-28 · 사용자 요청 "이미지도 같이 저장" · Cloudinary URL · public_id 저장
        image_url: (item as any).image_url ? String((item as any).image_url) : null,
        image_public_id: (item as any).image_public_id ? String((item as any).image_public_id) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) throw badRequest("저장 가능한 항목이 없습니다. (공급처/품명 필수)");

  const { data, error } = await supabase.from(TABLE).insert(rows).select();

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `${TABLE} 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    throw new HttpError(500, error.message);
  }

  clearOcrAggCache(); // 2026-07-31 · 신규 매입 저장 시 공급사/상품 캐시 무효화
  res.json({ ok: true, inserted: data?.length ?? rows.length, items: data ?? [] });
}));

// GET /api/ocr-confirmed-items?date=YYYY-MM-DD&supplier=xxx&hasBalance=true
router.get("/api/ocr-confirmed-items", asyncHandler(async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date.trim() : "";
  const supplierParam = typeof req.query.supplier === "string" ? req.query.supplier.trim() : "";
  const hasBalanceParam = typeof req.query.hasBalance === "string" && req.query.hasBalance === "true";

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("saved_at", { ascending: false })
    .order("id", { ascending: false });

  if (dateParam) {
    query = query.eq("saved_at", dateParam);
  } else if (!hasBalanceParam) {
    // 최근 30일 (오늘 포함) — hasBalance 조회 시에는 날짜 제한 없이 전체 히스토리 반환
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const fromStr = from.toISOString().slice(0, 10);
    query = query.gte("saved_at", fromStr);
  }

  if (supplierParam) {
    query = query.ilike("supplier", `%${supplierParam}%`);
  }

  if (hasBalanceParam) {
    query = query.not("balance", "is", null).gt("balance", 0);
  }

  // 기본 한도 500 (Supabase PostgREST 기본 1000 초과 방지 · Render 메모리 절감)
  query = query.limit(500);

  const { data, error } = await query;

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json({ items: [] });
    }
    throw new HttpError(500, error.message);
  }

  res.json({ items: data ?? [] });
}));

// DELETE /api/ocr-confirmed-items/:id
router.delete("/api/ocr-confirmed-items/:id", authorize(2), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("유효한 id가 필요합니다.");
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  clearOcrAggCache(); // 2026-07-31 · 매입 삭제 시 공급사/상품 캐시 무효화
  res.json({ ok: true });
}));

export default router;
