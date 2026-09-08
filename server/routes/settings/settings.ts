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
import { z } from "zod";
import {
  UpsertSettingSchema,
  UpsertSeasonRangesSchema,
  UpsertPermissionsSchema,
  UpsertZoneGroupsSchema,
  UpsertBlockedSlotSchema,
  UpsertZonesSchema,
  UpsertStorageLocationsSchema,
  DEFAULT_STORAGE_LOCATIONS,
  type StorageLocation,
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

// ═════════════════════════════════════════════════════════════════
// 2026-09-08 · 매장·창고 마스터 (진열위치 상세 저장·표시)
//   · KV app_settings.storage_locations · 5분 캐시
//   · GET  /api/settings/storage-locations · 공개 (모든 사용자 조회)
//   · POST /api/settings/storage-locations · 관리자 (level≥9)
// ═════════════════════════════════════════════════════════════════
const STORAGE_LOCATIONS_KEY = "storage_locations";
const STORAGE_LOCATIONS_TTL = 5 * 60 * 1000;
let storageLocationsCache: { data: StorageLocation[]; expiresAt: number } | null = null;

export async function getStorageLocations(): Promise<StorageLocation[]> {
  if (storageLocationsCache && storageLocationsCache.expiresAt > Date.now()) return storageLocationsCache.data;
  try {
    const { data } = await supabase
      .from("app_settings").select("value").eq("key", STORAGE_LOCATIONS_KEY).maybeSingle();
    const raw = data?.value;
    const list = Array.isArray(raw) && raw.length > 0 ? (raw as StorageLocation[]) : DEFAULT_STORAGE_LOCATIONS;
    storageLocationsCache = { data: list, expiresAt: Date.now() + STORAGE_LOCATIONS_TTL };
    return list;
  } catch {
    return DEFAULT_STORAGE_LOCATIONS;
  }
}

// 2026-09-08 · 사용자 지시 · 적정재고 계산 일수 · 매일 CRON refill 에서 사용
//   · GET 공개 (설정 화면 노출) · POST 관리자 (level>=9)
//   · 값 · 정수 1~365 · 기본 30
router.get("/api/settings/optimal-stock-days", asyncHandler(async (_req, res) => {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "optimal_stock_days").maybeSingle();
  const v = Number(data?.value ?? 30);
  res.json({ days: Number.isFinite(v) && v >= 1 && v <= 365 ? Math.floor(v) : 30 });
}));
router.post("/api/settings/optimal-stock-days", authorize(9), validateBody(z.object({ days: z.number().int().min(1).max(365) })), asyncHandler(async (req, res) => {
  const days = req.body.days;
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "optimal_stock_days", value: days, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true, days });
}));

router.get("/api/settings/storage-locations", asyncHandler(async (_req, res) => {
  const list = await getStorageLocations();
  res.json(list);
}));

router.post("/api/settings/storage-locations", authorize(9), validateBody(UpsertStorageLocationsSchema), asyncHandler(async (req, res) => {
  const { locations } = req.body;
  const { error } = await supabase.from("app_settings")
    .upsert({ key: STORAGE_LOCATIONS_KEY, value: locations, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  storageLocationsCache = { data: locations, expiresAt: Date.now() + STORAGE_LOCATIONS_TTL };
  res.json({ ok: true, locations });
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

router.post("/api/blocked-slots", authorize(5), validateBody(UpsertBlockedSlotSchema), asyncHandler(async (req, res) => {
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

// ═════════════════════════════════════════════════════════════════
// 발주 이메일 (SMTP) 설정 · 2026-09-07 · 사용자 지시
//   · GET  /api/settings/order-email · 저장된 SMTP 조회 (pass 마스킹)
//   · POST /api/settings/order-email · 저장 (app_settings 'order_email_smtp')
//   · POST /api/settings/order-email/test · 테스트 이메일 발송
// 서버 재시작 없이 · 저장 즉시 process.env 에 반영 (bulk-send 다음 요청부터 사용)
// ═════════════════════════════════════════════════════════════════
const SMTP_KEY = "order_email_smtp";

async function loadSmtp(): Promise<Record<string, string>> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", SMTP_KEY).maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, any>;
  return {
    smtp_host: String(raw.smtp_host ?? ""),
    smtp_port: String(raw.smtp_port ?? "587"),
    smtp_user: String(raw.smtp_user ?? ""),
    smtp_pass: String(raw.smtp_pass ?? ""),
    smtp_from: String(raw.smtp_from ?? ""),
  };
}

function applySmtpToEnv(cfg: Record<string, string>): void {
  if (cfg.smtp_host) process.env.SMTP_HOST = cfg.smtp_host;
  if (cfg.smtp_port) process.env.SMTP_PORT = cfg.smtp_port;
  if (cfg.smtp_user) process.env.SMTP_USER = cfg.smtp_user;
  if (cfg.smtp_pass) process.env.SMTP_PASS = cfg.smtp_pass;
  if (cfg.smtp_from) process.env.SMTP_FROM = cfg.smtp_from;
}

// 서버 부팅 시 · DB에 저장된 SMTP · process.env 로 로드
(async () => {
  try {
    const cfg = await loadSmtp();
    if (cfg.smtp_host) {
      applySmtpToEnv(cfg);
      console.log(`[settings] SMTP loaded from DB · host=${cfg.smtp_host}`);
    }
  } catch (e: any) {
    console.warn("[settings] SMTP boot load 실패:", e?.message);
  }
})();

router.get("/api/settings/order-email", authorize(9), asyncHandler(async (_req, res) => {
  const cfg = await loadSmtp();
  res.json({
    smtp_host: cfg.smtp_host,
    smtp_port: cfg.smtp_port,
    smtp_user: cfg.smtp_user,
    smtp_pass: cfg.smtp_pass ? "••••••••••••" : "", // 마스킹
    smtp_from: cfg.smtp_from,
    configured: !!cfg.smtp_host && !!cfg.smtp_from,
  });
}));

router.post("/api/settings/order-email", authorize(9), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const cfg = {
    smtp_host: String(b.smtp_host ?? "").trim(),
    smtp_port: String(b.smtp_port ?? "587").trim(),
    smtp_user: String(b.smtp_user ?? "").trim(),
    smtp_from: String(b.smtp_from ?? "").trim(),
    smtp_pass: String(b.smtp_pass ?? ""),
  };
  // 마스킹된 pass 유지 (프론트가 변경 안 하고 재저장 시)
  if (cfg.smtp_pass === "••••••••••••") {
    const existing = await loadSmtp();
    cfg.smtp_pass = existing.smtp_pass;
  }
  const { error } = await supabase.from("app_settings")
    .upsert({ key: SMTP_KEY, value: cfg, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new HttpError(500, error.message);
  applySmtpToEnv(cfg);
  res.json({ ok: true, configured: !!cfg.smtp_host && !!cfg.smtp_from });
}));

router.post("/api/settings/order-email/test", authorize(9), asyncHandler(async (req, res) => {
  const to = String(req.body?.to ?? "").trim();
  if (!to) throw new HttpError(400, "수신 이메일 필요");
  const cfg = await loadSmtp();
  if (!cfg.smtp_host) throw new HttpError(400, "SMTP 설정이 없습니다");
  try {
    // 2026-09-07 · fix · ESM 프로젝트 · require 대신 dynamic import
    const nodemailer = await import("nodemailer");
    const port = Number(cfg.smtp_port || 587);
    const transporter = nodemailer.default.createTransport({
      host: cfg.smtp_host,
      port,
      secure: port === 465,
      auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass ?? "" } : undefined,
    });
    await transporter.sendMail({
      from: cfg.smtp_from || cfg.smtp_user,
      to,
      subject: "[발주 시스템] SMTP 테스트 이메일",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <div style="font-family:sans-serif;padding:16px">
          <h2 style="color:#0A2E4A">✅ SMTP 설정 정상</h2>
          <p>발주 시스템 이메일 발송이 정상 동작합니다.</p>
          <p style="color:#666;font-size:12px">발신: ${cfg.smtp_from} · 호스트: ${cfg.smtp_host}:${port}</p>
        </div></body></html>`,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(200).json({ ok: false, message: e?.message ?? "발송 실패" });
  }
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

router.post("/api/zones", authorize(5), validateBody(UpsertZonesSchema), asyncHandler(async (req, res) => {
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
