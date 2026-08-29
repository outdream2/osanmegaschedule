// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
// server/routes/lossTracking.ts
// 2026-08-06 · T-LOSS-HISTORY · 손실추적 (DiffTab) 날짜별 스냅샷·이력·집계
//
// 정의:
//   loss = erp - actual (양수: 손실 · 음수: 초과)
//   loss_value = loss × purchase_price
//
// Endpoints:
//   POST /api/loss-tracking/snapshot                     · 오늘 날짜 스냅샷 upsert (자동/수동)
//   GET  /api/loss-tracking?from=&to=&supplier=          · raw rows (기간·공급사)
//   GET  /api/loss-tracking/summary?from=&to=&groupBy=   · 집계 (date | supplier | product)
//
// 회귀 방지:
//   - loss_tracking_daily 테이블 미존재 시 · 서버 크래시 X (500 대신 빈 배열 · snapshot 은 fallback 응답)
//   - inventory-checks 자동 트리거는 fire-and-forget (원 요청 실패 유발 X)

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { fetchAllWithRange } from "../../utils/supabaseFetchAll";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import { authorize } from "../../middleware/requireAuth";

const router = Router();

// ── 날짜 유틸 ────────────────────────────────────────────────────────────────

/** 오늘 YYYY-MM-DD (로컬 · KST 기준 · 서버 시간대 의존 최소화 위해 slice(0,10)) */
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** YYYY-MM-DD 형식 검증 */
function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** N일 전 YYYY-MM-DD */
function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** relation does not exist 감지 · 안전 fallback */
function isMissingRelation(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return /relation|does not exist|schema cache/i.test(msg);
}

// ── 손실 계산 (low-stock 재사용 · 서버 내부 · 자기 fetch 없이 직접 supabase 접근) ─

/**
 * 오늘 시점 · 상품 × inventory_checks 병합 → 손실 있는 행 (loss !== 0) 만 반환
 * · low-stock 로직과 동일 · 하지만 optimal_stock 필터는 없음 (전체 상품 스캔 · diff!=0 만)
 */
async function buildTodaySnapshotRows(): Promise<Array<{
  product_code: string;
  product_name: string | null;
  supplier: string | null;
  erp_stock: number | null;
  actual_stock: number | null;
  loss: number;
  purchase_price: number | null;
  sale_price: number | null;
  loss_value: number | null;
}>> {
  // 1) products 전체 로드 (hidden=false)
  const products = await fetchAllWithRange<any>(() => supabase
    .from("products")
    .select("product_code, product_name, current_stock, supplier, purchase_price, sale_price")
    .eq("hidden", false), 100000);

  // 2) inventory_checks 최신값 (product_code 별 · checked_at DESC · 첫값만)
  const invMap = new Map<string, { warehouse: number | null; store: number | null }>();
  try {
    const invRows = await fetchAllWithRange<any>(() => supabase
      .from("inventory_checks")
      .select("product_code, warehouse_stock, warehouse1_stock, warehouse2_stock, store_stock, store_stock_2, store3_stock, checked_at")
      .order("checked_at", { ascending: false }), 100000);
    for (const r of invRows ?? []) {
      const code = String(r.product_code ?? "").trim();
      if (!code || invMap.has(code)) continue;
      // warehouse 총합 · store 총합 (모든 신규·레거시 컬럼 합산 · 없으면 0)
      const wh = (
        (r.warehouse1_stock != null ? Number(r.warehouse1_stock) : (r.warehouse_stock != null ? Number(r.warehouse_stock) : 0)) +
        (r.warehouse2_stock != null ? Number(r.warehouse2_stock) : 0)
      );
      const st = (
        (r.store_stock   != null ? Number(r.store_stock)   : 0) +
        (r.store_stock_2 != null ? Number(r.store_stock_2) : 0) +
        (r.store3_stock  != null ? Number(r.store3_stock)  : 0)
      );
      invMap.set(code, {
        warehouse: Number.isFinite(wh) ? wh : null,
        store:     Number.isFinite(st) ? st : null,
      });
    }
  } catch (e: any) {
    if (!isMissingRelation(e)) throw e;
  }

  // 3) 병합 · loss 계산 · diff !== 0 만 남김
  const out: any[] = [];
  for (const p of products ?? []) {
    const code = String(p.product_code ?? "").trim();
    if (!code) continue;
    const inv = invMap.get(code);
    if (!inv) continue; // 실재고 미기록 · 스냅샷 대상 아님
    const erp = p.current_stock != null && p.current_stock !== "" ? Number(p.current_stock) : null;
    const actual = (Number(inv.warehouse) || 0) + (Number(inv.store) || 0);
    if (erp == null) continue;
    const loss = erp - actual;
    if (loss === 0) continue;
    const purchase = p.purchase_price != null && p.purchase_price !== "" ? Number(p.purchase_price) : null;
    const sale = p.sale_price != null && p.sale_price !== "" ? Number(p.sale_price) : null;
    const loss_value = purchase != null && purchase > 0 ? loss * purchase : null;
    out.push({
      product_code:   code,
      product_name:   p.product_name ?? null,
      supplier:       p.supplier ?? null,
      erp_stock:      Number.isFinite(erp) ? erp : null,
      actual_stock:   Number.isFinite(actual) ? actual : null,
      loss,
      purchase_price: purchase,
      sale_price:     sale,
      loss_value,
    });
  }
  return out;
}

// ── 스냅샷 실행 · 재사용 가능 함수 (route + 트리거 공용) ─────────────────────

export interface SnapshotResult {
  ok: boolean;
  snapshot_date: string;
  saved: number;
  error?: string;
  hint?: string;
}

/**
 * 오늘 날짜 loss snapshot upsert · 재사용 가능 함수
 *   · route 핸들러 · fire-and-forget 트리거 모두에서 사용
 *   · 테이블 미존재 시 · error='TABLE_MISSING' 응답 (throw X)
 */
export async function runTodaySnapshot(): Promise<SnapshotResult> {
  const snapshot_date = todayYmd();
  try {
    const rows = await buildTodaySnapshotRows();
    if (rows.length === 0) {
      return { ok: true, snapshot_date, saved: 0 };
    }
    const payload = rows.map(r => ({ snapshot_date, ...r }));
    const { error } = await supabase
      .from("loss_tracking_daily")
      .upsert(payload, { onConflict: "snapshot_date,product_code" });
    if (error) {
      if (isMissingRelation(error)) {
        console.warn("[loss-tracking/snapshot] loss_tracking_daily 테이블 미존재 · migration 실행 필요");
        return { ok: false, snapshot_date, saved: 0, error: "TABLE_MISSING", hint: "migrations/loss_tracking_daily.sql 실행 필요" };
      }
      throw error;
    }
    return { ok: true, snapshot_date, saved: payload.length };
  } catch (err: any) {
    console.error("[loss-tracking/runTodaySnapshot]", err?.message);
    return { ok: false, snapshot_date, saved: 0, error: err?.message ?? "snapshot 실패" };
  }
}

/**
 * fire-and-forget · inventory-checks 저장 후 백그라운드로 스냅샷 실행
 *   · 원 요청 실패에 영향 X · error 는 console.warn 만
 *   · setImmediate 로 이벤트 루프 다음 tick 에 실행 (응답 지연 X)
 */
export function scheduleSnapshotBackground(): void {
  setImmediate(async () => {
    try {
      const r = await runTodaySnapshot();
      if (!r.ok && r.error && r.error !== "TABLE_MISSING") {
        console.warn("[loss-tracking/bg]", r.error);
      }
    } catch (e: any) {
      console.warn("[loss-tracking/bg] 백그라운드 스냅샷 실패:", e?.message);
    }
  });
}

// ── POST /api/loss-tracking/snapshot · 오늘 날짜 upsert ──────────────────────

// 2026-08-29 · 보안 P1 N13 fix · authorize(9) · 일별 손실 스냅샷 임의 덮어쓰기 방지
router.post("/api/loss-tracking/snapshot", authorize(9), asyncHandler(async (_req, res) => {
  const result = await runTodaySnapshot();
  return res.json(result);
}));

// ── GET /api/loss-tracking?from=&to=&supplier= · raw rows ────────────────────

router.get("/api/loss-tracking", asyncHandler(async (req, res) => {
  const from = isYmd(req.query.from) ? String(req.query.from) : daysAgoYmd(30);
  const to   = isYmd(req.query.to)   ? String(req.query.to)   : todayYmd();
  const supplier = String(req.query.supplier ?? "").trim() || null;
  let q = supabase
    .from("loss_tracking_daily")
    .select("snapshot_date, product_code, product_name, supplier, erp_stock, actual_stock, loss, purchase_price, sale_price, loss_value")
    .gte("snapshot_date", from)
    .lte("snapshot_date", to)
    .order("snapshot_date", { ascending: false });
  if (supplier) q = q.eq("supplier", supplier);
  // 상한 · 최대 5만행
  const { data, error } = await q.limit(50000);
  if (error) {
    if (isMissingRelation(error)) return res.json({ from, to, supplier, rows: [] });
    throw new HttpError(500, error.message);
  }
  return res.json({ from, to, supplier, rows: data ?? [] });
}));

// ── GET /api/loss-tracking/summary?from=&to=&groupBy=date|supplier|product ──

router.get("/api/loss-tracking/summary", asyncHandler(async (req, res) => {
  const from = isYmd(req.query.from) ? String(req.query.from) : daysAgoYmd(30);
  const to   = isYmd(req.query.to)   ? String(req.query.to)   : todayYmd();
  const groupBy = ["date", "supplier", "product"].includes(String(req.query.groupBy))
    ? (String(req.query.groupBy) as "date" | "supplier" | "product")
    : "date";
  const supplier = String(req.query.supplier ?? "").trim() || null;

  let q = supabase
    .from("loss_tracking_daily")
    .select("snapshot_date, product_code, product_name, supplier, loss, loss_value")
    .gte("snapshot_date", from)
    .lte("snapshot_date", to);
  if (supplier) q = q.eq("supplier", supplier);
  const { data, error } = await q.limit(50000);
  if (error) {
    if (isMissingRelation(error)) {
      return res.json({ from, to, groupBy, supplier, rows: [], total: { loss: 0, loss_value: 0, count: 0 } });
    }
    throw new HttpError(500, error.message);
  }

  const rows = data ?? [];
  const total = rows.reduce((acc, r) => {
    acc.loss += Number(r.loss ?? 0) || 0;
    acc.loss_value += Number(r.loss_value ?? 0) || 0;
    acc.count += 1;
    return acc;
  }, { loss: 0, loss_value: 0, count: 0 });

  // groupBy 집계 (in-memory · 50k 이하 · 순회 1회)
  const map = new Map<string, { key: string; label: string; loss: number; loss_value: number; count: number; extra?: any }>();
  for (const r of rows) {
    let key: string, label: string, extra: any = undefined;
    if (groupBy === "date") {
      key = String(r.snapshot_date ?? "");
      label = key;
    } else if (groupBy === "supplier") {
      key = String(r.supplier ?? "미지정");
      label = key;
    } else {
      key = String(r.product_code ?? "");
      label = String(r.product_name ?? key);
      extra = { product_code: key };
    }
    if (!key) continue;
    const cur = map.get(key) ?? { key, label, loss: 0, loss_value: 0, count: 0, extra };
    cur.loss += Number(r.loss ?? 0) || 0;
    cur.loss_value += Number(r.loss_value ?? 0) || 0;
    cur.count += 1;
    map.set(key, cur);
  }
  // 정렬: date 는 date ASC · supplier/product 는 loss_value DESC
  const grouped = Array.from(map.values());
  if (groupBy === "date") grouped.sort((a, b) => a.key.localeCompare(b.key));
  else grouped.sort((a, b) => b.loss_value - a.loss_value);

  return res.json({ from, to, groupBy, supplier, rows: grouped, total });
}));

export default router;
