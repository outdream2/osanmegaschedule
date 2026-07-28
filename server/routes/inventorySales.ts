// 2026-07-28 · 재고·판매 통합 API
//   목적 · 상품별/공급사별 재고회전율 · GMROI · 유통기한 · ABC 통합 조회
//   재사용 · /api/stock-manage/top-sales 로직 활용 · 여기서는 프론트 편의 필드로 재가공
//   Phase 1 · 회전율·DOH·GMROI·유통기한·ABC·등급 서버 계산 · 프론트는 표시만
import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

interface StockFlowRow {
  product_code: string;
  product_name: string | null;
  supplier: string | null;
  spec: string | null;
  real_map?: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  closing_stock: number;
  total_amount: number;
  supply_amount: number;
  expiry_date?: string | null;
  purchase_price?: number | null;
  sale_price?: number | null;
  // 2026-07-28 · 매입주기 · 최근매입일 · 단가 (사용자 요청)
  last_purchase_date?: string | null;
  purchase_interval?: number | null;   // 평균 간격 (일)
  unit_price?: number | null;          // 사입단가
}

interface ProductOut {
  product_code: string;
  product_name: string;
  supplier: string;
  real_map: string | null;
  current_stock: number;         // 현재고 (사용자 요청)
  purchase_interval: number | null; // 매입주기 (일)
  last_purchase_date: string | null;
  purchase_qty: number;          // 매입수량 (기간 내)
  unit_price: number;            // 사입단가
  total_amount: number;          // 판매금액 (기간 내)
  stock_value: number;           // 재고금액 = 현재고 × 단가
  sale_qty: number;              // 판매수량 (참고용)
  turnover: number;
  doh: number;
}

interface SupplierOut {
  supplier: string;
  sku_count: number;
  total_stock_qty: number;          // 현재고 총합
  avg_purchase_interval: number | null; // 평균 매입주기
  last_purchase_date: string | null;    // 가장 최근 매입일
  purchase_qty: number;             // 매입수량 (기간 내)
  avg_unit_price: number;           // 평균 단가
  total_amount: number;             // 판매금액
  stock_value: number;              // 재고금액
  sale_qty: number;                 // 판매수량 (참고)
  turnover: number;
  doh: number;
  balance: number;
}

const clampNum = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function computeGrade(doh: number, saleQty: number): "A" | "B" | "C" | "D" {
  if (saleQty <= 0) return "D";
  if (!Number.isFinite(doh) || doh <= 0) return "D";
  if (doh > 90) return "D";
  if (doh <= 25) return "A";
  if (doh <= 60) return "B";
  return "C";
}

function computeAbc(sortedIdx: number, cumRatio: number): "A" | "B" | "C" {
  if (cumRatio <= 0.8) return "A";
  if (cumRatio <= 0.95) return "B";
  return "C";
}

function computeStatus(doh: number, saleQty: number, daysToExpiry: number | null): string {
  const flags: string[] = [];
  if (daysToExpiry != null && daysToExpiry <= 30) flags.push("⚠유통기한");
  if (saleQty === 0) flags.push("💀데드");
  else if (doh > 90) flags.push("🐢과다");
  else if (doh > 0 && doh < 5) flags.push("🔥소진");
  return flags.join(" ");
}

async function fetchStockFlow(days: number): Promise<StockFlowRow[]> {
  // Supabase 최신 스냅샷 + 판매/매입 집계
  //   기본 · stock_history 테이블 · 없거나 실패 시 빈 배열
  //   추가 · ocr_confirmed_items 로 매입주기·최근매입일·단가 계산 (사용자 요청)
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = now.toISOString().slice(0, 10);

  const { data: latest, error: latestErr } = await supabase
    .from("stock_history")
    .select("*")
    .lte("snapshot_date", toStr)
    .order("snapshot_date", { ascending: false })
    .limit(5000);
  if (latestErr || !latest) return [];

  const byCode = new Map<string, any>();
  for (const r of latest) {
    const code = String((r as any).product_code ?? "").trim();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, r);
  }

  const { data: opening } = await supabase
    .from("stock_history")
    .select("*")
    .gte("snapshot_date", fromStr)
    .lte("snapshot_date", fromStr)
    .limit(5000);
  const openingByCode = new Map<string, any>();
  if (Array.isArray(opening)) {
    for (const r of opening) {
      const code = String((r as any).product_code ?? "").trim();
      if (code && !openingByCode.has(code)) openingByCode.set(code, r);
    }
  }

  // ocr_confirmed_items · 매입이력 (product_code · invoice_date · unit_price)
  //   최근매입일 · MAX(invoice_date)
  //   매입주기 · invoice_date 간격들의 평균
  //   단가 · 최신 unit_price
  const purchaseByCode = new Map<string, { dates: string[]; latestUnit: number | null }>();
  try {
    const { data: purchases } = await supabase
      .from("ocr_confirmed_items")
      .select("product_code, invoice_date, unit_price, saved_at")
      .not("product_code", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(10000);
    if (Array.isArray(purchases)) {
      for (const p of purchases) {
        const code = String((p as any).product_code ?? "").trim();
        if (!code) continue;
        const date = ((p as any).invoice_date ?? (p as any).saved_at ?? "").slice(0, 10);
        if (!date) continue;
        if (!purchaseByCode.has(code)) purchaseByCode.set(code, { dates: [], latestUnit: null });
        const rec = purchaseByCode.get(code)!;
        rec.dates.push(date);
        if (rec.latestUnit == null) {
          const up = clampNum((p as any).unit_price);
          if (up > 0) rec.latestUnit = up;
        }
      }
    }
  } catch { /* 조회 실패 시 빈 map · fallback 처리됨 */ }

  const computeInterval = (dates: string[]): number | null => {
    if (dates.length < 2) return null;
    const sorted = [...new Set(dates)].sort();  // 오름차순 · 중복 제거
    if (sorted.length < 2) return null;
    let sum = 0, cnt = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1]).getTime();
      const d2 = new Date(sorted[i]).getTime();
      if (!isNaN(d1) && !isNaN(d2) && d2 > d1) {
        sum += (d2 - d1) / (86400 * 1000);
        cnt++;
      }
    }
    return cnt > 0 ? sum / cnt : null;
  };

  const rows: StockFlowRow[] = [];
  for (const [code, latestR] of byCode) {
    const openR = openingByCode.get(code) ?? latestR;
    const purchase = purchaseByCode.get(code);
    const purchase_qty = clampNum((latestR as any).purchase_qty_period ?? (latestR as any).purchase_qty);
    const supply_amount = clampNum((latestR as any).purchase_amount_period ?? (latestR as any).supply_amount);
    // 사입단가 · 우선 ocr_confirmed_items 최신 · 없으면 supply_amount/purchase_qty · 없으면 products.purchase_price
    const unitFromPurchase = purchase?.latestUnit ?? null;
    const unitFromFlow = purchase_qty > 0 ? supply_amount / purchase_qty : null;
    const unit_price = unitFromPurchase ?? unitFromFlow ?? clampNum((latestR as any).purchase_price) ?? 0;
    rows.push({
      product_code: code,
      product_name: (latestR as any).product_name ?? null,
      supplier: (latestR as any).supplier ?? null,
      spec: (latestR as any).spec ?? null,
      real_map: (latestR as any).real_map ?? null,
      opening_stock: clampNum((openR as any).current_stock ?? (openR as any).stock),
      purchase_qty,
      sale_qty: clampNum((latestR as any).sale_qty_period ?? (latestR as any).sale_qty),
      disposal_qty: clampNum((latestR as any).disposal_qty_period ?? (latestR as any).disposal_qty),
      closing_stock: clampNum((latestR as any).current_stock ?? (latestR as any).stock),
      total_amount: clampNum((latestR as any).sale_amount_period ?? (latestR as any).total_amount),
      supply_amount,
      expiry_date: (latestR as any).expiry_date ?? null,
      purchase_price: clampNum((latestR as any).purchase_price),
      sale_price: clampNum((latestR as any).sale_price),
      last_purchase_date: purchase?.dates[0] ?? null,
      purchase_interval: purchase ? computeInterval(purchase.dates) : null,
      unit_price: Number.isFinite(unit_price) ? unit_price : 0,
    });
  }
  return rows;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / (86400 * 1000));
  return diff;
}

// GET /api/inventory-sales/products?days=30
router.get("/api/inventory-sales/products", async (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days ?? 30) || 30));
  try {
    const flow = await fetchStockFlow(days);
    if (flow.length === 0) {
      return res.json({ items: [], note: "stock_history 데이터 없음 · 재고 스냅샷 업로드 필요" });
    }

    const items: ProductOut[] = flow.map((r) => {
      const avgStock = (r.opening_stock + r.closing_stock) / 2;
      const turnover = avgStock > 0 ? r.sale_qty / avgStock : 0;
      const doh = turnover > 0 ? days / turnover : Infinity;
      const unitPrice = r.unit_price ?? 0;
      const stockValue = r.closing_stock * unitPrice;
      return {
        product_code: r.product_code,
        product_name: r.product_name ?? "",
        supplier: r.supplier ?? "",
        real_map: r.real_map ?? null,
        current_stock: r.closing_stock,
        purchase_interval: r.purchase_interval ?? null,
        last_purchase_date: r.last_purchase_date ?? null,
        purchase_qty: r.purchase_qty,
        unit_price: unitPrice,
        total_amount: r.total_amount,
        stock_value: stockValue,
        sale_qty: r.sale_qty,
        turnover: Number.isFinite(turnover) ? turnover : 0,
        doh: Number.isFinite(doh) ? doh : 999,
      };
    });

    return res.json({ items });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "조회 실패" });
  }
});

// GET /api/inventory-sales/suppliers?days=30
router.get("/api/inventory-sales/suppliers", async (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days ?? 30) || 30));
  try {
    const flow = await fetchStockFlow(days);
    if (flow.length === 0) {
      return res.json({ items: [], note: "stock_history 데이터 없음 · 재고 스냅샷 업로드 필요" });
    }

    // 공급사별 집계
    const bySup = new Map<string, StockFlowRow[]>();
    for (const r of flow) {
      const key = String(r.supplier ?? "미상").trim() || "미상";
      if (!bySup.has(key)) bySup.set(key, []);
      bySup.get(key)!.push(r);
    }

    // 잔고 조회 · ocr_confirmed_items 최신 balance
    const { data: balData } = await supabase
      .from("ocr_confirmed_items")
      .select("supplier, balance, saved_at")
      .not("balance", "is", null)
      .gt("balance", 0)
      .order("saved_at", { ascending: false })
      .limit(2000);
    const latestBal = new Map<string, number>();
    if (Array.isArray(balData)) {
      for (const b of balData) {
        const s = String((b as any).supplier ?? "").trim();
        if (s && !latestBal.has(s)) latestBal.set(s, clampNum((b as any).balance));
      }
    }

    const items: SupplierOut[] = [];
    for (const [supplier, rows] of bySup) {
      const sku_count = rows.length;
      const total_stock_qty = rows.reduce((s, r) => s + r.closing_stock, 0);
      const purchase_qty = rows.reduce((s, r) => s + r.purchase_qty, 0);
      const sale_qty = rows.reduce((s, r) => s + r.sale_qty, 0);
      const total_amount = rows.reduce((s, r) => s + r.total_amount, 0);
      const stock_value = rows.reduce((s, r) => s + r.closing_stock * (r.unit_price ?? 0), 0);
      const avgStockTotal = rows.reduce((s, r) => s + (r.opening_stock + r.closing_stock) / 2, 0);
      const turnover = avgStockTotal > 0 ? sale_qty / avgStockTotal : 0;
      const doh = turnover > 0 ? days / turnover : 999;

      // 매입주기 · 평균 · 최근매입일 · MAX · 평균 단가 · 매입가중
      const intervals = rows.map(r => r.purchase_interval).filter((x): x is number => x != null && Number.isFinite(x));
      const avg_purchase_interval = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : null;
      const last_purchase_date = rows.map(r => r.last_purchase_date).filter((x): x is string => !!x).sort().reverse()[0] ?? null;
      const totalPurchaseQty = rows.reduce((s, r) => s + r.purchase_qty, 0);
      const totalSupplyAmt = rows.reduce((s, r) => s + r.supply_amount, 0);
      const avg_unit_price = totalPurchaseQty > 0 ? totalSupplyAmt / totalPurchaseQty : (rows.reduce((s, r) => s + (r.unit_price ?? 0), 0) / Math.max(sku_count, 1));

      items.push({
        supplier,
        sku_count,
        total_stock_qty,
        avg_purchase_interval,
        last_purchase_date,
        purchase_qty,
        avg_unit_price: Number.isFinite(avg_unit_price) ? avg_unit_price : 0,
        total_amount,
        stock_value,
        sale_qty,
        turnover: Number.isFinite(turnover) ? turnover : 0,
        doh: Number.isFinite(doh) ? doh : 999,
        balance: latestBal.get(supplier) ?? 0,
      });
    }

    return res.json({ items });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "조회 실패" });
  }
});

export default router;
