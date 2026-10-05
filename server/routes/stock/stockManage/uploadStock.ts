// 2026-10-04 · XLSX 재고 import 폐기 · stock_history schema 변경 (pcode 추가 · RENAME 6건) 과 함께
//   · POST /api/upload-stock           · 제거
//   · GET  /api/stock-import-log       · 하위 호환 유지 (이력 조회만)
//   · DELETE /api/stock-import-log     · 하위 호환 유지 (이력 초기화)
//   · 이력 데이터 자체는 app_settings · 테이블 그대로 두되 신규 import 는 ERP sync-agent 로 이관
import { Router } from "express";
import { supabase } from "../../../../src/supabase/client";
import { asyncHandler } from "../../../middleware/asyncHandler";
import { authorize } from "../../../middleware/requireAuth";

const router = Router();

// GET /api/stock-import-log · 이력 조회 (호환 유지)
router.get("/api/stock-import-log", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { data } = await supabase.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  res.json(Array.isArray(data?.value) ? data.value : []);
}));

// DELETE /api/stock-import-log · 이력 초기화 (호환 유지)
router.delete("/api/stock-import-log", authorize(9), asyncHandler(async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "stock_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
}));

// 2026-10-04 · POST /api/upload-stock 제거 · ERP sync-agent 가 stock_history 를 직접 공급

export default router;
