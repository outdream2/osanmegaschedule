// server/routes/reference/referenceValues.ts
// 2026-08-06 · T-DualStorage-Connect · 5개 하드코딩 배열 → DB DISTINCT 값 조회
// 2026-08-16 · asyncHandler 프레임워크 적용
// GET /api/reference-values
//   · vendors.category      → vendorCategories
//   · employees.position    → positions
//   · employees.rank        → ranks
//   · employees.employmentType → contractTypes
//   · employees.workplace   → workplaces
//   · 5분 in-memory 캐시

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";

const router = Router();

const TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  data: ReferenceValues;
  time: number;
}
let _cache: CacheEntry | null = null;

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
  if (_cache && Date.now() - _cache.time < TTL_MS) return _cache.data;
  const [vendorCategories, positions, ranks, contractTypes, workplaces] = await Promise.all([
    fetchDistinct("vendors", "category"),
    fetchDistinct("employees", "position"),
    fetchDistinct("employees", "rank"),
    fetchDistinct("employees", "employmentType"),
    fetchDistinct("employees", "workplace"),
  ]);
  const data: ReferenceValues = { vendorCategories, positions, ranks, contractTypes, workplaces };
  _cache = { data, time: Date.now() };
  return data;
}

router.get("/api/reference-values", asyncHandler(async (_req, res) => {
  const data = await loadReferenceValues();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(data);
}));

export default router;
