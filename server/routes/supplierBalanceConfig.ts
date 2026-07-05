import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();
const TABLE = "supplier_balance_configs";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS supplier_balance_configs (
  supplier_name  TEXT PRIMARY KEY,
  balance_field  TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

(async () => {
  const { error } = await supabase.from(TABLE).select("supplier_name").limit(1);
  if (error && /relation|does not exist/i.test(error.message)) {
    console.warn(`\n[SETUP REQUIRED] '${TABLE}' 테이블이 없습니다.`);
    console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 아래 SQL을 실행하세요:\n");
    console.warn(CREATE_SQL);
  }
})();

// GET /api/supplier-balance-configs  →  [{ supplier_name, balance_field, column_layout? }]
router.get("/api/supplier-balance-configs", async (_req, res) => {
  // column_layout 컬럼 포함 조회, 없으면 fallback
  let data: any[] | null = null;
  const first = await supabase.from(TABLE).select("supplier_name, balance_field, column_layout");
  if (first.error) {
    const fb = await supabase.from(TABLE).select("supplier_name, balance_field");
    if (fb.error) {
      if (/relation|does not exist/i.test(fb.error.message)) return res.json([]);
      return res.status(500).json({ error: fb.error.message });
    }
    data = fb.data;
  } else {
    data = first.data;
  }
  return res.json(data ?? []);
});

// PUT /api/supplier-balance-configs  →  upsert { supplier_name, balance_field, column_layout? }
router.put("/api/supplier-balance-configs", async (req, res) => {
  const { supplier_name, balance_field, column_layout } = req.body ?? {};
  if (!supplier_name) return res.status(400).json({ error: "supplier_name 필수" });

  const payload: Record<string, unknown> = {
    supplier_name,
    balance_field: balance_field ?? "",
    updated_at: new Date().toISOString(),
  };
  if (column_layout !== undefined) payload.column_layout = column_layout;

  let { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "supplier_name" });
  if (error && /column|does not exist/i.test(error.message)) {
    // column_layout 컬럼 없으면 제외하고 재시도
    delete payload.column_layout;
    const fb = await supabase.from(TABLE).upsert(payload, { onConflict: "supplier_name" });
    error = fb.error;
  }
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.status(503).json({ error: `${TABLE} 테이블이 없습니다.\n${CREATE_SQL}` });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
});

// DELETE /api/supplier-balance-configs/:supplier_name
router.delete("/api/supplier-balance-configs/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { error } = await supabase.from(TABLE).delete().eq("supplier_name", name);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
