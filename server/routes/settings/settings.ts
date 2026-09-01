// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
// 2026-08-12 · POST /api/settings 인증 · JWT 쿠키 · level ≥ 9 (관리자)
//   GET 은 공개 유지 · 앱 설정 (brand·contact·permissions) 은 로그인 전에도 필요
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";
// 2026-08-29 · #197 C-5 fix · 설정 (KV) 편집 후 · 관련 서버 캐시 즉시 무효화
import { invalidateSaleActiveOnlyCache, resetProductCache } from "../../productCache";
import { validateBody } from "../../middleware/zodValidate";
import {
  UpsertSettingSchema,
  UpsertSeasonRangesSchema,
  UpsertPermissionsSchema,
  UpsertZoneGroupsSchema,
  UpsertBlockedSlotSchema,
  UpsertZonesSchema,
} from "../../../src/shared/schemas/settings";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// 계절(spring/summer/autumn/winter) → 월 목록 매핑 (app_settings key='season_ranges')
//   - 전 사용자 공유 · 관리자가 정의
//   - 기본값: 봄=3~5월 · 여름=6~8월 · 가을=9~11월 · 겨울=12·1·2월
//   - 재고/판매 조회 endpoint 의 ?season=spring|summer|autumn|winter 필터 지원
// ═══════════════════════════════════════════════════════════════════════════════
export type SeasonKey = "spring" | "summer" | "autumn" | "winter";
export type SeasonRanges = Record<SeasonKey, number[]>;

export const DEFAULT_SEASON_RANGES: SeasonRanges = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

// 유효성 검사: 각 계절 배열은 1~12 정수만 허용 (dedupe · 정렬)
function normalizeSeasonRanges(input: any): SeasonRanges {
  const clean = (arr: any): number[] => {
    if (!Array.isArray(arr)) return [];
    const set = new Set<number>();
    for (const v of arr) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= 12) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  };
  const raw = (input && typeof input === "object") ? input : {};
  const out: SeasonRanges = {
    spring: clean(raw.spring),
    summer: clean(raw.summer),
    autumn: clean(raw.autumn),
    winter: clean(raw.winter),
  };
  // 빈 배열이면 기본값으로 대체 (계절이 아예 빠지지 않도록)
  for (const k of ["spring", "summer", "autumn", "winter"] as SeasonKey[]) {
    if (out[k].length === 0) out[k] = [...DEFAULT_SEASON_RANGES[k]];
  }
  return out;
}

// 서버측 캐시 (5분 TTL) · 여러 endpoint 에서 재사용
let seasonCache: { data: SeasonRanges; expiresAt: number } | null = null;
const SEASON_TTL = 5 * 60 * 1000;

export async function getSeasonRanges(): Promise<SeasonRanges> {
  if (seasonCache && seasonCache.expiresAt > Date.now()) return seasonCache.data;
  try {
    const { data } = await supabase
      .from("app_settings").select("value").eq("key", "season_ranges").maybeSingle();
    const value = data?.value;
    const ranges = value ? normalizeSeasonRanges(value) : { ...DEFAULT_SEASON_RANGES };
    seasonCache = { data: ranges, expiresAt: Date.now() + SEASON_TTL };
    return ranges;
  } catch {
    return { ...DEFAULT_SEASON_RANGES };
  }
}

/** season 파라미터 → 월 배열 (없거나 유효하지 않으면 null 반환) */
export async function resolveSeasonMonths(season: string | undefined | null): Promise<number[] | null> {
  const s = String(season ?? "").trim().toLowerCase();
  if (s !== "spring" && s !== "summer" && s !== "autumn" && s !== "winter") return null;
  const ranges = await getSeasonRanges();
  return ranges[s as SeasonKey];
}

router.get("/api/settings/season-ranges", asyncHandler(async (_req, res) => {
  const ranges = await getSeasonRanges();
  res.json(ranges);
}));

router.post("/api/settings/season-ranges", authorize(9), validateBody(UpsertSeasonRangesSchema), asyncHandler(async (req, res) => {
  const { ranges } = req.body;
  const normalized = normalizeSeasonRanges(ranges);
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "season_ranges", value: normalized, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  seasonCache = { data: normalized, expiresAt: Date.now() + SEASON_TTL }; // 캐시 즉시 갱신
  res.json({ ok: true, ranges: normalized });
}));

router.get("/api/settings", asyncHandler(async (req, res) => {
  const { key } = req.query;
  if (!key || typeof key !== "string") throw badRequest("key required");
  const { data, error } = await supabase
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  res.json({ value: data?.value ?? null });
}));

router.post("/api/settings", authorize(9), validateBody(UpsertSettingSchema), asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const { error } = await supabase.from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  // 2026-08-29 · #197 C-5 fix · 캐시 무효화 · 편집 즉시 반영
  //   · stats.sale_active_only · 판매중 필터 KV · saleActiveOnlyCache (5초 TTL) 즉시 무효화
  //   · productCache 도 함께 리셋 · 판매중 필터 결과 즉시 갱신
  if (String(key) === "stats.sale_active_only") {
    invalidateSaleActiveOnlyCache();
    resetProductCache();
  }
  res.json({ ok: true });
}));

router.get("/api/permissions", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "page_permissions").maybeSingle();
  if (error) throw new HttpError(500, error.message);
  const defaults = { schedule:{read:1,write:1}, display:{read:2,write:2}, scan:{read:1,write:1}, requests:{read:2,write:2}, leave:{read:1,write:1}, ocr:{read:2,write:2}, upload:{read:2,write:2} };
  res.json(data?.value ?? defaults);
}));

router.post("/api/permissions", authorize(9), validateBody(UpsertPermissionsSchema), asyncHandler(async (req, res) => {
  const { permissions } = req.body;
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "page_permissions", value: permissions, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.get("/api/zone-groups", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("app_settings").select("value").eq("key", "zone_groups").maybeSingle();
  if (error) throw new HttpError(500, error.message);
  const value = data?.value;
  res.json(Array.isArray(value) ? value : []);
}));

router.put("/api/zone-groups", authorize(9), validateBody(UpsertZoneGroupsSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "zone_groups", value: body, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.get("/api/blocked-slots", asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date required");
  const { data, error } = await supabase.from("app_settings").select("value")
    .eq("key", `blocked_slots_${date}`).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  res.json((data?.value as Record<string, string[]>) ?? {});
}));

router.post("/api/blocked-slots", validateBody(UpsertBlockedSlotSchema), asyncHandler(async (req, res) => {
  const { date, staffName, time, blocked } = req.body;
  const key = `blocked_slots_${date}`;
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  const current: Record<string, string[]> = (data?.value as Record<string, string[]>) ?? {};
  if (!current[staffName]) current[staffName] = [];
  if (blocked) {
    if (!current[staffName].includes(time)) current[staffName].push(time);
  } else {
    current[staffName] = current[staffName].filter((t: string) => t !== time);
  }
  const { error } = await supabase.from("app_settings")
    .upsert({ key, value: current, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.get("/api/zones", asyncHandler(async (_req, res) => {
  // dow_map 컬럼이 있으면 함께 조회, 없으면 (마이그레이션 미적용) 기존 컬럼만
  let data: any[] | null = null;
  const first = await supabase
    .from("zone_assignments")
    .select("zone_id, employee_id, employee_name, status, products, dow_map");
  if (first.error) {
    const fb = await supabase
      .from("zone_assignments")
      .select("zone_id, employee_id, employee_name, status, products");
    if (fb.error) throw new HttpError(500, fb.error.message);
    data = fb.data;
  } else {
    data = first.data;
  }
  res.json(data ?? []);
}));

router.post("/api/zones", validateBody(UpsertZonesSchema), asyncHandler(async (req, res) => {
  const { zones } = req.body;
  const rowsWithDow = zones.map((z: any) => ({
    zone_id: String(z.zone_id),
    employee_id: z.employee_id ?? null,
    employee_name: z.employee_name ?? "",
    status: z.status ?? "normal",
    products: z.products ?? "",
    dow_map: z.dow_map ?? null,
  }));
  let { error } = await supabase
    .from("zone_assignments")
    .upsert(rowsWithDow, { onConflict: "zone_id" });
  if (error) {
    // 마이그레이션 미적용 시 dow_map 없이 재시도 (하위 호환)
    const rowsNoDow = rowsWithDow.map(({ dow_map: _dm, ...rest }) => rest);
    const fb = await supabase.from("zone_assignments").upsert(rowsNoDow, { onConflict: "zone_id" });
    if (fb.error) throw new HttpError(500, fb.error.message);
  }
  res.json({ ok: true });
}));

export default router;
