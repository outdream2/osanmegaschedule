// server/routes/reference/referenceValues.ts
// 2026-08-06 · T-DualStorage-Connect · 5개 하드코딩 배열 → DB DISTINCT 값 조회
// 2026-08-16 · asyncHandler 프레임워크 적용
// 2026-09-14 · 사용자 대원칙 · 실시간 정확성 · in-memory 캐시 + max-age 5min 제거
// GET /api/reference-values
//   · vendors.category      → vendorCategories
//   · employees.position    → positions
//   · employees.rank        → ranks
//   · employees.employmentType → contractTypes
//   · employees.workplace   → workplaces

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";

const router = Router();

export interface ReferenceValues {
  vendorCategories: string[];
  positions: string[];
  ranks: string[];
  contractTypes: string[];
  workplaces: string[];
}

async function fetchDistinct(table: string, column: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .not(column, "is", null)
    .neq(column, "");
  if (error || !data) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data) {
    const val = String((row as any)[column] ?? "").trim();
    if (val && !seen.has(val)) {
      seen.add(val);
      result.push(val);
    }
  }
  return result;
}

async function loadReferenceValues(): Promise<ReferenceValues> {
  const [vendorCategories, positions, ranks, contractTypes, workplaces] = await Promise.all([
    fetchDistinct("vendors", "category"),
    fetchDistinct("employees", "position"),
    fetchDistinct("employees", "rank"),
    fetchDistinct("employees", "employmentType"),
    fetchDistinct("employees", "workplace"),
  ]);
  return { vendorCategories, positions, ranks, contractTypes, workplaces };
}

router.get("/api/reference-values", asyncHandler(async (_req, res) => {
  const data = await loadReferenceValues();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json(data);
}));

export default router;
