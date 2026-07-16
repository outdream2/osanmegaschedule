import { Router } from "express";
import { supabase } from "../../src/supabase/client";

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

router.get("/api/settings/season-ranges", async (_req, res) => {
  try {
    const ranges = await getSeasonRanges();
    res.json(ranges);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "조회 실패" }); }
});

router.post("/api/settings/season-ranges", async (req, res) => {
  try {
    const { employeeId, ranges } = req.body ?? {};
    if (!employeeId) return res.status(403).json({ error: "인증 정보가 없습니다" });
    const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(employeeId)).maybeSingle();
    if (!emp || (emp.level ?? 1) < 9) return res.status(403).json({ error: "권한이 없습니다 (level 9 필요)" });
    const normalized = normalizeSeasonRanges(ranges);
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "season_ranges", value: normalized, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    seasonCache = { data: normalized, expiresAt: Date.now() + SEASON_TTL }; // 캐시 즉시 갱신
    res.json({ ok: true, ranges: normalized });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "저장 실패" }); }
});

router.get("/api/settings", async (req, res) => {
  const { key } = req.query;
  if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
  try {
    const { data, error } = await supabase
      .from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ value: data?.value ?? null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/settings", async (req, res) => {
  const { key, value } = req.body ?? {};
  if (!key) return res.status(400).json({ error: "key required" });
  try {
    const { error } = await supabase.from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/permissions", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", "page_permissions").maybeSingle();
    if (error) throw new Error(error.message);
    const defaults = { schedule:{read:1,write:1}, display:{read:2,write:2}, scan:{read:1,write:1}, requests:{read:2,write:2}, leave:{read:1,write:1}, ocr:{read:2,write:2}, upload:{read:2,write:2} };
    res.json(data?.value ?? defaults);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/permissions", async (req, res) => {
  const { permissions, employeeId } = req.body ?? {};
  if (!employeeId) return res.status(403).json({ error: "인증 정보가 없습니다" });
  try {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(employeeId)).maybeSingle();
    if (!emp || (emp.level ?? 1) < 9) return res.status(403).json({ error: "권한이 없습니다 (level 9 필요)" });
    if (!permissions) return res.status(400).json({ error: "permissions required" });
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "page_permissions", value: permissions, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/zone-groups", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("app_settings").select("value").eq("key", "zone_groups").maybeSingle();
    if (error) throw new Error(error.message);
    const value = data?.value;
    res.json(Array.isArray(value) ? value : []);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/api/zone-groups", async (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: "array required" });
  try {
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "zone_groups", value: body, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/blocked-slots", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") return res.status(400).json({ error: "date required" });
  try {
    const { data, error } = await supabase.from("app_settings").select("value")
      .eq("key", `blocked_slots_${date}`).maybeSingle();
    if (error) throw new Error(error.message);
    res.json((data?.value as Record<string, string[]>) ?? {});
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/blocked-slots", async (req, res) => {
  const { date, staffName, time, blocked } = req.body ?? {};
  if (!date || !staffName || !time) {
    return res.status(400).json({ error: "date, staffName, time required" });
  }
  const key = `blocked_slots_${date}`;
  try {
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
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/api/zones", async (_req, res) => {
  try {
    // dow_map 컬럼이 있으면 함께 조회, 없으면 (마이그레이션 미적용) 기존 컬럼만
    let data: any[] | null = null;
    const first = await supabase
      .from("zone_assignments")
      .select("zone_id, employee_id, employee_name, status, products, dow_map");
    if (first.error) {
      const fb = await supabase
        .from("zone_assignments")
        .select("zone_id, employee_id, employee_name, status, products");
      if (fb.error) throw new Error(fb.error.message);
      data = fb.data;
    } else {
      data = first.data;
    }
    res.json(data ?? []);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/zones", async (req, res) => {
  const { zones } = req.body ?? {};
  if (!Array.isArray(zones)) return res.status(400).json({ error: "zones array required" });
  try {
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
      if (fb.error) throw new Error(fb.error.message);
    }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
