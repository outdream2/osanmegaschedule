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

// GET /api/supplier-balance-configs  →  [{ supplier_name, balance_field }]
router.get("/api/supplier-balance-configs", async (_req, res) => {
  const { data, error } = await supabase.from(TABLE).select("supplier_name, balance_field");
  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return res.json([]);
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json(data ?? []);
});

// PUT /api/supplier-balance-configs  →  upsert { supplier_name, balance_field }
router.put("/api/supplier-balance-configs", async (req, res) => {
  const { supplier_name, balance_field } = req.body ?? {};
  if (!supplier_name) return res.status(400).json({ error: "supplier_name 필수" });

  const { error } = await supabase.from(TABLE).upsert(
    { supplier_name, balance_field: balance_field ?? "", updated_at: new Date().toISOString() },
    { onConflict: "supplier_name" }
  );

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
