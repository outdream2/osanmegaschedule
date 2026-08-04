// src/components/OrderManagePage/PurchaseHistoryTab.tsx
// #146 · 매입 탭 > 매입이력 서브탭 · 공급사별 purchase_details 원장
// 2026-08-03 · UX 대공사 (Phase A/B/C)
//   · Phase A · 좌측 vendor 카드형 2줄 (VendorRowCard · sparkline · 최근성 · SKU)
//   · Phase B · 우측 상단 VendorHeaderPanel (KPI 4카드)
//   · Phase C · 우측 하단 PurchaseSubTabs (매입원장 · 상품별 · 매입추이)
// 2026-08-03 · #191 · 뷰 모드 토글 추가 (공급사별 · 상품별)
//   · 공급사별 (default) · 기존 방식 100% 유지
//   · 상품별 (신규) · 좌 상품 리스트 · 우 상품별 매입이력
// Ref · Zoho·QuickBooks·Odoo·Cin7 Procurement Dashboard 벤치마크

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Package, RefreshCw } from "lucide-react";
import { SeasonButtons } from "../common/SeasonButtons";
import { SplitPanel } from "../common/SplitPanel";
import { ListLoading } from "../common/ListLoading";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import VendorRowCard, { type VendorSummary } from "./PurchaseHistoryTab/VendorRowCard";
import VendorHeaderPanel, { type VendorFull } from "./PurchaseHistoryTab/VendorHeaderPanel";
import PurchaseSubTabs, {
  type PurchaseLedgerRow,
  type PurchaseDetailRow,
  type TabKey as PurchaseSubTabKey,
} from "./PurchaseHistoryTab/PurchaseSubTabs";
import ProductRowCard, { type ProductSummary } from "./PurchaseHistoryTab/ProductRowCard";
import ProductPurchaseDetailPanel, {
  type ProductPurchaseRow,
} from "./PurchaseHistoryTab/ProductPurchaseDetailPanel";
import { useLedgerHighlight } from "../../hooks/useLedgerHighlight";
// 2026-08-04 · by-vendor 좌측 리스트 · SupplierTab embedded 모드 재사용 (사용자 요청)
//   · 기존 VendorRowCard 리스트 → SupplierTab 좌측 (재고자산·상품수·매입·판매량·판매액 컬럼)
//   · 우측 상세 (VendorHeaderPanel + PurchaseSubTabs) 는 100% 유지
import { SupplierTab } from "../StockManagePage/SupplierTab";

// ─── Types ───────────────────────────────────────────────────────────────────

// VendorFull · VendorHeaderPanel 에서 export · here alias
type VendorItem = VendorFull;

interface SummaryResponse {
  suppliers: Array<VendorSummary & { supplier: string }>;
  source?: "purchase_details" | "ocr_confirmed_items";
  diagnostics?: {
    pd_ok?: boolean;
    pd_row_count?: number;
    pd_skipped_null_supplier?: number;
    total_rows?: number;
  };
}

// data source · 서버 응답 source 필드 · UI 배지 표시
type DataSource = "purchase_details" | "ocr_confirmed_items" | null;
interface SourceDiagnostics {
  pd_ok?: boolean;
  pd_row_count?: number;
  pd_skipped_null_supplier?: number;
  pd_relation_missing?: boolean;
  pd_total_all_time?: number | null;
  pd_latest_date?: string | null;
  total_rows?: number;
}

// 뷰 모드 (#191)
type ViewMode = "by-vendor" | "by-product";

// 상품 리스트 정렬 (#191)
type ProductSort = "amount" | "recent" | "name" | "count";

// ─── PurchaseHistoryTab ───────────────────────────────────────────────────────

export const PurchaseHistoryTab: React.FC = () => {
  // ═══════════════════════════════════════════════════════════════════════
  //  뷰 모드 (#191 · 공급사별 / 상품별)
  // ═══════════════════════════════════════════════════════════════════════
  const [viewMode, setViewMode] = useState<ViewMode>("by-vendor");

  // ═══════════════════════════════════════════════════════════════════════
  //  공급사별 뷰 (기존)
  // ═══════════════════════════════════════════════════════════════════════

  // 공급사 목록 · 초기값 true (첫 렌더부터 로딩 표시 · 사용자 요청 2026-08-04)
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] =
    useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 좌측 요약 (VendorRowCard 용)
  const [summaryMap, setSummaryMap] = useState<Map<string, VendorSummary>>(new Map());
  const [, setSummaryLoading] = useState(false);

  // 데이터 소스 진단 · 2026-08-04 · 매입이력이 purchase_details(ERP) 인지 ocr_confirmed_items(거래명세서) 인지 UI 배지 표시
  const [summarySource, setSummarySource] = useState<DataSource>(null);
  const [summaryDiagnostics, setSummaryDiagnostics] = useState<SourceDiagnostics | null>(null);
  const [detailSource, setDetailSource] = useState<DataSource>(null);

  // 좌측 정렬 · 2026-08-04 슬림 (사용자 요청 · SKU/판매/판매액 정렬 제거 · 카드 4컬럼 통일)
  type LeftSort = "recent" | "amount" | "cycle" | "name";
  type LeftDir = "asc" | "desc";
  const [leftSort, setLeftSort] = useState<LeftSort>("recent");
  const [leftDir, setLeftDir] = useState<LeftDir>("desc");
  const toggleLeftSort = (k: LeftSort) => {
    if (leftSort === k) {
      setLeftDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setLeftSort(k);
      // 이름 정렬은 asc default · 나머지는 desc default (큰 값 위로)
      setLeftDir(k === "name" ? "asc" : "desc");
    }
  };

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 우측 서브탭 · controlled · 공급사 클릭 시 강제 "ledger" 전환용
  const [subTab, setSubTab] = useState<PurchaseSubTabKey>("ledger");

  // 원장 row 강조 훅 · 좌측 카드 클릭 시 최신 매입건 잠깐 강조 (2.4초)
  const { highlightId, triggerHighlight } = useLedgerHighlight(2600);

  // 우측 · 원장 (기간 필터 반영 · Tab 1 표시용)
  const [ledgerRows, setLedgerRows] = useState<PurchaseLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 우측 · detail (최근 365일 · KPI + Tab 2/3 용 · 기간 필터 무관)
  const [detailRows, setDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 기간 필터 (원장 탭 전용)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // ═══════════════════════════════════════════════════════════════════════
  //  상품별 뷰 (#191 · 신규)
  // ═══════════════════════════════════════════════════════════════════════

  // 전체 매입상세 (최근 1년 · 상품별 groupBy 소스)
  const [allDetails, setAllDetails] = useState<PurchaseDetailRow[]>([]);
  const [allDetailsLoading, setAllDetailsLoading] = useState(false);
  const [allDetailsError, setAllDetailsError] = useState<string | null>(null);
  const [allDetailsLoaded, setAllDetailsLoaded] = useState(false);

  // 매입상세 원본에는 supplier_name 이 함께 있어야 상품별 원장에 필요
  //   PurchaseDetailRow 타입은 supplier_name 을 갖지 않으므로 별도로 map 을 관리
  const [detailSupplierMap, setDetailSupplierMap] = useState<Map<string | number, string | null>>(new Map());

  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<ProductSort>("amount");

  // 선택 상품 (product_code · 없으면 product_name key)
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);

  // Split 리사이저 · 공통 SplitPanel 사용 (2026-08-04 · feedback_ui_principles B-3 준수)
  //   storageKey · by-vendor / by-product 별도 · SplitPanel 이 megatown_ prefix 자동 붙임

  // ─── 공급사 목록 로드 ────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({
        id: v.id,
        company_name: String(v.company_name ?? ""),
        category: v.category ?? null,
        contact_name: v.contact_name ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
        business_number: v.business_number ?? null,
        note: v.note ?? null,
        created_at: v.created_at ?? null,
      })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  // ─── 좌측 요약 (최근 90일) 로드 ─────────────────────────────────────────
  //   2026-08-03 · purchase_details primary (서버 스왑) + top-sales?months=1 병렬 조인
  //     - 최근 한달 판매량·판매금액 (공급사별 집계)
  //     - avg_cycle_days 는 서버 응답에서 그대로 사용
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [summaryRes, salesRes] = await Promise.all([
        fetch("/api/supplier-purchase-summary?days=90"),
        // top-sales?months=1 · sale_qty_month · sale_amount_month · supplier_name 포함
        //   ReturnListPanel · OrderManagePage 가 warm 시켜둔 서버 캐시(TTL) 재활용
        fetch("/api/stock-manage/top-sales?months=1&limit=5000&sort=sale&dir=desc").catch(() => null),
      ]);
      if (!summaryRes.ok) throw new Error(String(summaryRes.status));
      const j: SummaryResponse & { suppliers: any[] } = await summaryRes.json();
      // source · diagnostics 저장 (UI 배지·console 출력)
      setSummarySource(j.source ?? null);
      setSummaryDiagnostics(j.diagnostics ?? null);
      if (j.source === "ocr_confirmed_items") {
        console.warn(
          "[PurchaseHistory] 매입이력 데이터가 거래명세서(ocr_confirmed_items) 폴백으로 로드됨. " +
          "정답 소스는 purchase_details (ERP xlsx 임포트). " +
          "diagnostics:", j.diagnostics,
        );
      } else if (j.source === "purchase_details") {
        console.log("[PurchaseHistory] source=purchase_details (ERP 임포트) · diagnostics:", j.diagnostics);
      }

      // 공급사별 판매량·판매금액 집계 (top-sales row 는 상품 단위 · supplier 필드로 groupBy)
      //   2026-08-03 fix (이슈 C) · top-sales rows[].supplier 는 products.supplier 원본 (숫자 코드 or 축약)
      //     · vendors.company_name 과 접미어(㈜/주식회사/(주)) 차이로 매칭 실패 다수 → 정규화 후 매칭
      //     · 원본 key + 정규화 key 둘 다 저장 · 조회 시 두 key 모두 시도
      const normalizeName = (s: string): string =>
        s.replace(/[\s()㈜㈐]/g, "")
         .replace(/^\(주\)/g, "")
         .replace(/주식회사/g, "")
         .replace(/\(주\)$/g, "")
         .toLowerCase();
      const salesBySupplier = new Map<string, { qty: number; amt: number }>();
      const salesBySupplierNorm = new Map<string, { qty: number; amt: number }>();
      if (salesRes && salesRes.ok) {
        try {
          const sb = await salesRes.json();
          const rows: any[] = Array.isArray(sb?.rows) ? sb.rows : [];
          for (const r of rows) {
            const sup = String(r.supplier_name ?? r.supplier ?? "").trim();
            if (!sup) continue;
            const qty = Number(r.sale_qty_month ?? 0) || 0;
            const amt = Number(r.sale_amount_month ?? 0) || 0;
            if (qty === 0 && amt === 0) continue;
            const cur = salesBySupplier.get(sup) ?? { qty: 0, amt: 0 };
            cur.qty += qty;
            cur.amt += amt;
            salesBySupplier.set(sup, cur);
            const norm = normalizeName(sup);
            if (norm && norm !== sup) {
              const curN = salesBySupplierNorm.get(norm) ?? { qty: 0, amt: 0 };
              curN.qty += qty;
              curN.amt += amt;
              salesBySupplierNorm.set(norm, curN);
            } else if (norm) {
              salesBySupplierNorm.set(norm, cur);
            }
          }
        } catch {
          // top-sales 실패는 무시 · summary 는 계속 진행
        }
      }

      const map = new Map<string, VendorSummary>();
      for (const s of j.suppliers ?? []) {
        // 2026-08-03 fix (이슈 C) · 원본 매칭 우선 · 실패 시 정규화 매칭
        let sales = salesBySupplier.get(s.supplier);
        if (!sales) {
          const norm = normalizeName(String(s.supplier ?? ""));
          if (norm) sales = salesBySupplierNorm.get(norm);
        }
        map.set(s.supplier, {
          last_purchase_date: s.last_purchase_date,
          first_purchase_date: s.first_purchase_date ?? null,
          this_month_amount: s.this_month_amount,
          total_amount: s.total_amount,
          purchase_count: s.purchase_count,
          sku_count: s.sku_count,
          avg_cycle_days: s.avg_cycle_days ?? null,
          sale_qty_month: sales?.qty ?? null,
          sale_amount_month: sales?.amt ?? null,
          weekly_sparkline: Array.isArray(s.weekly_sparkline) && s.weekly_sparkline.length === 12
            ? s.weekly_sparkline
            : new Array(12).fill(0),
        });
      }
      setSummaryMap(map);
    } catch {
      setSummaryMap(new Map());
    } finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    loadSummary();
    const onChange = () => { loadVendors(); loadSummary(); };
    window.addEventListener("vendors-changed", onChange);
    return () => window.removeEventListener("vendors-changed", onChange);
  }, [loadVendors, loadSummary]);

  // ─── 원장 (기간 필터) 로드 ─────────────────────────────────────────────
  // 2026-08-04 · /api/purchase-details 로 전환 (해당 공급사 모든 상품 · products 조인 자동)
  //   기존 /api/supplier-purchase-detail 은 fallback 오작동 · 서버 fix 반영 대기중
  const loadLedger = useCallback(async (supplier: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const isDays10 = periodMonths === 0 && !periodSeason;
      const days = periodSeason
        ? 365
        : isDays10 ? 10 : (periodMonths || 1) * 30;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().slice(0, 10);
      const params = new URLSearchParams({ supplier, from: fromStr, limit: "5000" });
      const res = await fetch(`/api/purchase-details?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rowsFromApi: any[] = Array.isArray(j.rows) ? j.rows : [];
      // supplier 매칭 · raw supplier_name 또는 products 조인 supplier_name 모두
      const filtered = rowsFromApi.filter(r => {
        const rn = String(r.supplier_name ?? r.supplier ?? "").trim();
        return rn === supplier;
      });
      const purchaseRows: PurchaseLedgerRow[] = filtered.map((r: any) => ({
        id: r.id,
        invoice_date: r.purchase_date ?? r.invoice_date ?? null,
        product_name: r.product_name ?? null,
        product_code: r.product_code ?? null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unit_price: r.unit_price != null ? Number(r.unit_price) : null,
        amount: Number(r.amount ?? r.total) || 0,
      }));
      setLedgerRows(purchaseRows);
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedgerRows([]);
    } finally { setLedgerLoading(false); }
  }, [periodMonths, periodSeason]);

  // ─── detail (최근 1년) 로드 · /api/purchase-details 로 전환 (2026-08-04) ────
  const loadDetail = useCallback(async (supplier: string) => {
    setDetailLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
      const params = new URLSearchParams({ supplier, from: fromStr, limit: "5000" });
      const res = await fetch(`/api/purchase-details?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rowsFromApi: any[] = Array.isArray(j.rows) ? j.rows : [];
      const filtered = rowsFromApi.filter(r => {
        const rn = String(r.supplier_name ?? r.supplier ?? "").trim();
        return rn === supplier;
      });
      const rows: PurchaseDetailRow[] = filtered.map((r: any) => ({
        id: r.id,
        date: r.purchase_date ?? r.invoice_date ?? "",
        product_code: r.product_code ?? null,
        product_name: r.product_name ?? null,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        amount: Number(r.amount ?? r.total) || 0,
        vat_amount: Number(r.vat_amount ?? r.vat) || 0,
        supply_amount: Number(r.supply_amount) || 0,
      }));
      setDetailRows(rows);
      setDetailSource("purchase_details" as DataSource);
    } catch {
      setDetailRows([]);
      setDetailSource(null);
    } finally { setDetailLoading(false); }
  }, []);

  // 공급사 선택 시 · 원장 + detail 동시 로드
  useEffect(() => {
    if (!selectedVendor) {
      setLedgerRows([]);
      setDetailRows([]);
      return;
    }
    loadLedger(selectedVendor.company_name);
    loadDetail(selectedVendor.company_name);
  }, [selectedVendor, loadLedger, loadDetail]);

  // 원장 로드 완료 후 · 서브탭이 ledger 이고 최신 row 가 있으면 잠깐 강조
  useEffect(() => {
    if (!selectedVendor) return;
    if (ledgerLoading) return;
    if (subTab !== "ledger") return;
    if (ledgerRows.length === 0) return;
    // 최신 매입일 row 선택 (desc 정렬)
    let latest: PurchaseLedgerRow | null = null;
    for (const r of ledgerRows) {
      if (!latest) { latest = r; continue; }
      const ad = String(r.invoice_date ?? "");
      const bd = String(latest.invoice_date ?? "");
      if (ad > bd) latest = r;
    }
    if (latest) triggerHighlight(latest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerRows, ledgerLoading, subTab, selectedVendor?.id]);

  // ═══════════════════════════════════════════════════════════════════════
  //  상품별 뷰 · 데이터 로드 (#191)
  //   - /api/purchase-details?limit=5000 (unfiltered · 최근 매입일 desc)
  //   - 응답: rows = [{ id, purchase_date, supplier_name, product_code, product_name,
  //                    quantity, unit_price, amount, ... }]
  //   - 클라이언트에서 상품별 groupBy
  // ═══════════════════════════════════════════════════════════════════════
  const loadAllDetails = useCallback(async (force = false) => {
    if (allDetailsLoaded && !force) return;
    setAllDetailsLoading(true);
    setAllDetailsError(null);
    try {
      // 최근 1년치 fetch · limit=5000 (서버 max)
      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
      const params = new URLSearchParams({ from: fromStr, limit: "5000" });
      const res = await fetch(`/api/purchase-details?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rows: any[] = Array.isArray(j.rows) ? j.rows : [];

      // PurchaseDetailRow 로 정규화 + supplier_name map 별도 저장
      const details: PurchaseDetailRow[] = [];
      const supMap = new Map<string | number, string | null>();
      for (const r of rows) {
        const id = r.id;
        const date = String(r.purchase_date ?? "").slice(0, 10);
        if (!id || !date) continue;
        details.push({
          id,
          date,
          product_code: r.product_code ?? null,
          product_name: r.product_name ?? null,
          quantity: Number(r.quantity) || 0,
          unit_price: Number(r.unit_price) || 0,
          amount: Number(r.amount ?? r.total) || 0,
        });
        supMap.set(id, r.supplier_name ?? null);
      }
      setAllDetails(details);
      setDetailSupplierMap(supMap);
      setAllDetailsLoaded(true);
    } catch (e: any) {
      setAllDetailsError(e?.message ?? "네트워크 오류");
      setAllDetails([]);
      setDetailSupplierMap(new Map());
    } finally { setAllDetailsLoading(false); }
  }, [allDetailsLoaded]);

  // 뷰 모드가 by-product 로 전환될 때 lazy load
  useEffect(() => {
    if (viewMode === "by-product") loadAllDetails();
  }, [viewMode, loadAllDetails]);

  // ─── summary lookup · vendors.company_name → summaryMap value ─────────────
  //   2026-08-03 fix (이슈 C) · 서버 supplier 와 vendor company_name 접미어 차이 대응
  //     · 정확 매칭 우선 · 실패 시 정규화 매칭 (㈜/(주)/주식회사 제거)
  const summaryLookup = useMemo(() => {
    const norm = (s: string): string =>
      s.replace(/[\s()㈜㈐]/g, "")
       .replace(/^\(주\)/g, "")
       .replace(/주식회사/g, "")
       .replace(/\(주\)$/g, "")
       .toLowerCase();
    const byNorm = new Map<string, VendorSummary>();
    for (const [k, v] of summaryMap) {
      const n = norm(k);
      if (n && !byNorm.has(n)) byNorm.set(n, v);
    }
    return (companyName: string): VendorSummary | null => {
      const direct = summaryMap.get(companyName);
      if (direct) return direct;
      const n = norm(companyName);
      return (n ? byNorm.get(n) : undefined) ?? null;
    };
  }, [summaryMap]);

  // ─── 필터링 · 정렬된 좌측 리스트 (공급사) ────────────────────────────────
  //   2026-08-03 · leftSort · leftDir 조합 · asc/desc 토글 지원
  //   null 값은 desc 정렬 시 항상 뒤로 · asc 정렬 시 항상 뒤로 (일관성)
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const list = vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
    const dirSign = leftDir === "asc" ? 1 : -1;

    // 컬럼별 정렬 값 추출 (숫자 or 문자열)
    //   2026-08-04 · amount 는 이번달(this_month_amount) 기준 · 카드 표시와 일치
    const pickNum = (v: VendorItem): number | null => {
      const s = summaryLookup(v.company_name);
      switch (leftSort) {
        case "amount":    return s?.this_month_amount ?? null;
        case "cycle":     return s?.avg_cycle_days ?? null;
        default:          return null;
      }
    };

    return list.sort((a, b) => {
      const sa = summaryLookup(a.company_name);
      const sb = summaryLookup(b.company_name);
      // name 정렬 (예외 · 항상 문자열 비교)
      if (leftSort === "name") {
        return dirSign * a.company_name.localeCompare(b.company_name, "ko");
      }
      // recent · 문자열 (YYYY-MM-DD)
      if (leftSort === "recent") {
        const da = sa?.last_purchase_date ?? "";
        const db = sb?.last_purchase_date ?? "";
        // null 값은 항상 뒤 (dir 무관)
        if (!da && !db) return a.company_name.localeCompare(b.company_name, "ko");
        if (!da) return 1;
        if (!db) return -1;
        if (da !== db) return dirSign * da.localeCompare(db);
        return a.company_name.localeCompare(b.company_name, "ko");
      }
      // 숫자 컬럼 (null → 항상 뒤)
      const va = pickNum(a);
      const vb = pickNum(b);
      if (va == null && vb == null) return a.company_name.localeCompare(b.company_name, "ko");
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va !== vb) return dirSign * (va - vb);
      return a.company_name.localeCompare(b.company_name, "ko");
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, summaryLookup, leftSort, leftDir]);

  // ─── 상품별 집계 (allDetails groupBy product_code || product_name) ──────
  const productList = useMemo<ProductSummary[]>(() => {
    if (allDetails.length === 0) return [];
    const map = new Map<string, ProductSummary & { supplierSet: Map<string, number> }>();
    for (const r of allDetails) {
      const key = String(r.product_code ?? "").trim() || String(r.product_name ?? "").trim() || "(무명)";
      const supName = detailSupplierMap.get(r.id) ?? null;
      let a = map.get(key);
      if (!a) {
        a = {
          product_code: r.product_code ?? null,
          product_name: String(r.product_name ?? "").trim() || "(이름없음)",
          total_amount: 0,
          total_qty: 0,
          purchase_count: 0,
          last_purchase_date: null,
          primary_supplier: null,
          supplier_count: 0,
          supplierSet: new Map<string, number>(),
        };
        map.set(key, a);
      }
      a.total_amount += r.amount;
      a.total_qty += r.quantity;
      a.purchase_count += 1;
      if (!a.last_purchase_date || r.date > a.last_purchase_date) a.last_purchase_date = r.date;
      if (supName) a.supplierSet.set(supName, (a.supplierSet.get(supName) ?? 0) + r.amount);
    }
    // supplierSet → primary_supplier (매입액 최대) + supplier_count
    const list: ProductSummary[] = [];
    for (const a of map.values()) {
      let top: [string, number] | null = null;
      for (const entry of a.supplierSet) {
        if (!top || entry[1] > top[1]) top = entry;
      }
      list.push({
        product_code: a.product_code,
        product_name: a.product_name,
        total_amount: a.total_amount,
        total_qty: a.total_qty,
        purchase_count: a.purchase_count,
        last_purchase_date: a.last_purchase_date,
        primary_supplier: top ? top[0] : null,
        supplier_count: a.supplierSet.size,
      });
    }
    return list;
  }, [allDetails, detailSupplierMap]);

  // 상품 필터링 + 정렬
  const filteredProducts = useMemo<ProductSummary[]>(() => {
    const q = productSearch.trim().toLowerCase();
    const list = productList.filter(p => {
      if (!q) return true;
      if (p.product_name.toLowerCase().includes(q)) return true;
      if (p.product_code && p.product_code.toLowerCase().includes(q)) return true;
      return false;
    });
    return list.sort((a, b) => {
      switch (productSort) {
        case "amount": {
          if (b.total_amount !== a.total_amount) return b.total_amount - a.total_amount;
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "recent": {
          const da = a.last_purchase_date ?? "";
          const db = b.last_purchase_date ?? "";
          if (db !== da) return db.localeCompare(da);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "count": {
          if (b.purchase_count !== a.purchase_count) return b.purchase_count - a.purchase_count;
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "name":
        default:
          return a.product_name.localeCompare(b.product_name, "ko");
      }
    });
  }, [productList, productSearch, productSort]);

  // 선택 상품의 header + row 목록
  const selectedProduct = useMemo<ProductSummary | null>(() => {
    if (!selectedProductKey) return null;
    return productList.find(p => {
      const k = String(p.product_code ?? "").trim() || p.product_name;
      return k === selectedProductKey;
    }) ?? null;
  }, [productList, selectedProductKey]);

  const selectedProductRows = useMemo<ProductPurchaseRow[]>(() => {
    if (!selectedProductKey) return [];
    const rows: ProductPurchaseRow[] = [];
    for (const r of allDetails) {
      const k = String(r.product_code ?? "").trim() || String(r.product_name ?? "").trim() || "(무명)";
      if (k !== selectedProductKey) continue;
      rows.push({
        id: r.id,
        date: r.date,
        supplier_name: detailSupplierMap.get(r.id) ?? null,
        quantity: r.quantity,
        unit_price: r.unit_price,
        amount: r.amount,
      });
    }
    // 최근 순 정렬 (default)
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return rows;
  }, [allDetails, detailSupplierMap, selectedProductKey]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 상단 필터바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          {viewMode === "by-vendor"
            ? <Building2 size={14} className="text-emerald-500 shrink-0" />
            : <Package size={14} className="text-sky-500 shrink-0" />}
          <span className="text-[13px] font-semibold text-slate-800">매입이력</span>
          {viewMode === "by-vendor" && selectedVendor && (
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-200 tabular-nums">
              {ledgerRows.length}건
            </span>
          )}
          {viewMode === "by-product" && (
            <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">
              {productList.length}종
            </span>
          )}
          {/* 데이터 소스 배지 (2026-08-04) · 사용자가 매입이력 vs 거래명세서 소스 구분 · fallback 시 warning */}
          {summarySource && (
            <span
              className={`text-[10px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 border tabular-nums cursor-help ${
                summarySource === "purchase_details"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : "text-amber-800 bg-amber-50 border-amber-300 animate-pulse"
              }`}
              title={
                summarySource === "purchase_details"
                  ? `ERP 매입상세 (xlsx 임포트) · ${summaryDiagnostics?.pd_row_count ?? 0}행 (최근 90일)` +
                    (summaryDiagnostics?.pd_skipped_null_supplier
                      ? ` · 스킵 ${summaryDiagnostics.pd_skipped_null_supplier}행 (supplier_name NULL)`
                      : "") +
                    ` · 전체 ${summaryDiagnostics?.pd_total_all_time ?? "?"}행 · 최근매입 ${summaryDiagnostics?.pd_latest_date ?? "-"}`
                  : summaryDiagnostics?.pd_relation_missing
                    ? "⚠ purchase_details 테이블이 Supabase 에 없음. xlsx 임포트 실행 필요."
                    : (summaryDiagnostics?.pd_total_all_time ?? 0) === 0
                      ? "⚠ purchase_details 테이블은 있지만 데이터 없음. xlsx 임포트 실행 필요."
                      : (summaryDiagnostics?.pd_row_count ?? 0) === 0 && (summaryDiagnostics?.pd_total_all_time ?? 0) > 0
                        ? `⚠ 90일 이내 매입 없음. 전체 ${summaryDiagnostics?.pd_total_all_time}행 · 최근 매입 ${summaryDiagnostics?.pd_latest_date ?? "-"} · 90일보다 오래됨`
                        : (summaryDiagnostics?.pd_skipped_null_supplier ?? 0) > 0
                          ? `⚠ supplier_name NULL 로 ${summaryDiagnostics?.pd_skipped_null_supplier}행 스킵 · vendors.supplier_code 매핑 실패`
                          : "⚠ 매입이력이 거래명세서(OCR)로 폴백됨. 원인 미상 · console 확인."
              }
            >
              {summarySource === "purchase_details" ? "🟢 ERP" : "🟠 OCR"}
            </span>
          )}
          {/* 선택 공급사 detail source · summary 와 다르면 표시 */}
          {selectedVendor && detailSource && detailSource !== summarySource && (
            <span
              className={`text-[10px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 border tabular-nums cursor-help ${
                detailSource === "purchase_details"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : "text-amber-800 bg-amber-50 border-amber-300 animate-pulse"
              }`}
              title={`선택 공급사 원장 소스: ${detailSource === "purchase_details" ? "ERP 매입상세" : "거래명세서(OCR) 폴백"}`}
            >
              선택: {detailSource === "purchase_details" ? "🟢 ERP" : "🟠 OCR"}
            </span>
          )}
        </div>

        {/* 뷰 모드 토글 (#191) · segmented control */}
        <div className="inline-flex bg-slate-100 border border-slate-200 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("by-vendor")}
            className={`px-2.5 h-7 text-[11px] font-black rounded transition cursor-pointer inline-flex items-center gap-1.5 ${
              viewMode === "by-vendor"
                ? "bg-white text-emerald-700 shadow-sm border border-emerald-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
            title="공급사 단위로 매입이력 조회"
          >
            <Building2 size={12} />
            공급사별
          </button>
          <button
            type="button"
            onClick={() => setViewMode("by-product")}
            className={`px-2.5 h-7 text-[11px] font-black rounded transition cursor-pointer inline-flex items-center gap-1.5 ${
              viewMode === "by-product"
                ? "bg-white text-sky-700 shadow-sm border border-sky-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
            title="상품 단위로 매입이력 조회 (최근 1년)"
          >
            <Package size={12} />
            상품별
          </button>
        </div>

        {/* 기간 필터 · 원장 탭 전용 (공급사별 뷰에서만 표시)
            2026-08-04 · 사용자 요청 · 반응형 시간기간+계절기간 수직 배치 (< sm) */}
        {viewMode === "by-vendor" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">시간기간</span>
              <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
                <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
                  className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
                {([1, 2, 3, 4, 5, 6] as const).map(m => (
                  <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
                    className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 sm:hidden">계절기간</span>
              <SeasonButtons value={periodSeason} onChange={(v) => { setPeriodSeason(v); if (v) setPeriodMonths(0); }} size="sm" hideLabel />
            </div>
          </div>
        )}

        {/* 새로고침 */}
        {viewMode === "by-vendor" && selectedVendor && (
          <button
            type="button"
            onClick={() => {
              loadLedger(selectedVendor.company_name);
              loadDetail(selectedVendor.company_name);
              loadSummary();
            }}
            disabled={ledgerLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-400 hover:text-emerald-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={ledgerLoading ? "animate-spin" : ""} />
          </button>
        )}
        {viewMode === "by-product" && (
          <button
            type="button"
            onClick={() => loadAllDetails(true)}
            disabled={allDetailsLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
            title="상품별 매입이력 새로고침"
          >
            <RefreshCw size={13} className={allDetailsLoading ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 좌우 분할 · 리사이저 (2026-08-03) · 좌측 폭 드래그 조정 · localStorage 저장 */}
      <div className="flex flex-col lg:flex-row gap-2 lg:gap-0 flex-1 min-h-0">
        {viewMode === "by-vendor" ? (
          /* 공급사별 뷰 (기존) · 공통 SplitPanel · 좌측 검색·필터·정렬·공급사리스트 · 우측 헤더·서브탭 */
          <SplitPanel
            key="by-vendor"
            storageKey="purchaseHistory.byVendor.leftWidth"
            defaultWidth={380}
            minWidth={320}
            maxWidth={640}
            dividerColor="emerald"
            wrapLeft={false}
            wrapRight={false}
            className="flex-1 min-h-0 gap-2 lg:gap-0"
            mobileRightAsModal={true}
            mobileModalTitle={selectedVendor?.company_name ?? "공급사 상세"}
            mobileOpen={!!selectedVendor}
            onMobileClose={() => setSelectedVendor(null)}
            left={
              /* 2026-08-04 · 사용자 요청 · 좌측 리스트를 SupplierTab 좌측(공급사현황) 스타일로 대체
                   · 기존 검색+분류+정렬+VendorRowCard 리스트 → SupplierTab embedded 모드
                   · 공급사 클릭 → 콜백으로 vendors 매칭 → setSelectedVendor(v) → 우측 상세는 그대로 유지
                   · vendorSearch·vendorCategoryFilter·leftSort·leftDir·filteredVendors 는 미사용
                     (제거 시 회귀 위험 · 별도 PR 에서 정리) */
              <SupplierTab
                embedded
                hideSaleColumns
                showExtraPurchaseColumns
                selectedSupplierName={selectedVendor?.company_name ?? null}
                onSupplierClick={(supplierName) => {
                  // vendors 에서 공급사명 매칭 (정확 → 정규화 순)
                  const clean = (s: string): string =>
                    s.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim();
                  const target = clean(supplierName);
                  const targetLc = target.toLowerCase();
                  // 1) 정확 매칭
                  let v = vendors.find(x => clean(x.company_name) === target);
                  // 2) case-insensitive
                  if (!v) v = vendors.find(x => clean(x.company_name).toLowerCase() === targetLc);
                  // 3) 정규화 (공백·괄호·㈜·(주)·주식회사 제거)
                  if (!v) {
                    const norm = (s: string) => s
                      .replace(/[\s()㈜㈐]/g, "")
                      .replace(/^\(주\)/g, "")
                      .replace(/주식회사/g, "")
                      .replace(/\(주\)$/g, "")
                      .toLowerCase();
                    const nt = norm(target);
                    if (nt) v = vendors.find(x => norm(clean(x.company_name)) === nt);
                  }
                  if (v) {
                    setSelectedVendor(v);
                    setSubTab("ledger");
                  } else {
                    // vendors 에 없는 공급사 (ERP 매입만 있고 vendors 등록 안 됨)
                    //   · 임시 VendorItem 으로 셋팅 · 우측 상세는 상품명 기반으로 로드 가능
                    setSelectedVendor({
                      id: -1,
                      company_name: target,
                      category: null,
                      contact_name: null,
                      phone: null,
                      email: null,
                      business_number: null,
                      note: null,
                      created_at: null,
                    } as VendorItem);
                    setSubTab("ledger");
                  }
                }}
              />
            }
            right={
              /* 우측: 헤더 + 서브탭 */
              <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
              {!selectedVendor ? (
                <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                  <Package size={40} className="mb-3 opacity-30" />
                  <div className="text-[11px] font-semibold">좌측에서 공급사를 선택하세요</div>
                  <div className="text-[11px] mt-1">매입이력 · 상품별 집계 · 매입 추이가 표시됩니다</div>
                </div>
              ) : ledgerError ? (
                <div className="bg-white rounded-xl border border-rose-200 p-4 text-sm text-rose-700 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">원장 조회 실패</div>
                  <div className="text-[12px] font-mono bg-rose-50 border border-rose-100 rounded px-2 py-1">{ledgerError}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerError(null);
                      if (selectedVendor) {
                        loadLedger(selectedVendor.company_name);
                        loadDetail(selectedVendor.company_name);
                      }
                    }}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-rose-600 text-white text-[12px] font-bold hover:bg-rose-700 transition cursor-pointer"
                  >
                    <RefreshCw size={12} /> 다시 시도
                  </button>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-rose-100">
                    원인 · 서버 API 미구성 · 네트워크 문제 · Supabase 테이블 미생성 (ocr_confirmed_items · supplier_payments) 등. 콘솔 로그 확인 필요.
                  </div>
                </div>
              ) : (
                <>
                  {/* Phase B · 공급사 헤더 + KPI 4카드 */}
                  <VendorHeaderPanel
                    vendor={selectedVendor}
                    detailRows={detailRows}
                    loading={detailLoading}
                  />
                  {/* Phase C · 서브탭 3개 (매입원장 · 상품별 · 매입추이)
                      · controlled · 공급사 클릭 시 ledger 로 자동 전환 + 최신 row highlight */}
                  <PurchaseSubTabs
                    ledgerRows={ledgerRows}
                    ledgerLoading={ledgerLoading}
                    detailRows={detailRows}
                    detailLoading={detailLoading}
                    activeTab={subTab}
                    onTabChange={setSubTab}
                    highlightId={highlightId}
                  />
                </>
              )}
              </div>
            }
          />
        ) : (
          /* 상품별 뷰 (#191 · 신규) · 공통 SplitPanel · 좌측 검색·정렬·상품리스트 · 우측 상품상세 */
          <SplitPanel
            key="by-product"
            storageKey="purchaseHistory.byProduct.leftWidth"
            defaultWidth={380}
            minWidth={320}
            maxWidth={640}
            dividerColor="sky"
            wrapLeft={false}
            wrapRight={false}
            className="flex-1 min-h-0 gap-2 lg:gap-0"
            mobileRightAsModal={true}
            mobileModalTitle={selectedProduct?.product_name ?? "상품 상세"}
            mobileOpen={!!selectedProductKey}
            onMobileClose={() => setSelectedProductKey(null)}
            left={
              <div className="w-full flex flex-col gap-2 h-full min-h-0">
              {/* 검색 + 정렬 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-col gap-2">
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="상품명 · 코드 검색"
                  className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
                />
                <div className="flex items-center gap-1 pt-1 border-t border-slate-100 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">정렬</span>
                  {([
                    { k: "amount" as const, label: "매입액" },
                    { k: "recent" as const, label: "최근매입" },
                    { k: "count"  as const, label: "매입건수" },
                    { k: "name"   as const, label: "가나다" },
                  ]).map(o => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setProductSort(o.k)}
                      className={`h-5 px-1.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                        productSort === o.k
                          ? "bg-sky-500 text-white"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                      }`}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
              {/* 상품 리스트 · 카드 2줄 · 상단 컬럼 헤더 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 max-h-[65vh] flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 shrink-0 grid grid-cols-[1fr_auto_auto] gap-2 items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>상품</span>
                  <span className="text-right whitespace-nowrap">매입정보</span>
                  <span className="text-right whitespace-nowrap">최근</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                {allDetailsLoading ? (
                  <ListLoading label="상품 매입이력 불러오는 중..." tone="sky" />
                ) : allDetailsError ? (
                  <div className="p-4 text-[11px] text-rose-600 space-y-1">
                    <div className="font-black">로드 실패</div>
                    <div className="font-mono bg-rose-50 border border-rose-100 rounded px-2 py-1">{allDetailsError}</div>
                    <button
                      type="button"
                      onClick={() => loadAllDetails(true)}
                      className="mt-1 inline-flex items-center gap-1 h-6 px-2 rounded bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 transition cursor-pointer"
                    >
                      <RefreshCw size={10} /> 다시 시도
                    </button>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-300">
                    {productSearch ? "검색 결과 없음" : "최근 1년 매입 상품 없음"}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {filteredProducts.map(p => {
                      const key = String(p.product_code ?? "").trim() || p.product_name;
                      return (
                        <ProductRowCard
                          key={`prc-${key}`}
                          product={p}
                          active={selectedProductKey === key}
                          onSelect={() => setSelectedProductKey(key)}
                        />
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
              </div>
            }
            right={
              /* 우측: 상품 상세 (헤더 + 매입 원장) */
              <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
              {!selectedProduct ? (
                <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                  <Package size={40} className="mb-3 opacity-30" />
                  <div className="text-[11px] font-semibold">좌측에서 상품을 선택하세요</div>
                  <div className="text-[11px] mt-1">최근 1년 · 공급사별 매입 원장이 표시됩니다</div>
                </div>
              ) : (
                <ProductPurchaseDetailPanel
                  product={selectedProduct}
                  rows={selectedProductRows}
                  loading={allDetailsLoading}
                />
              )}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};

export default PurchaseHistoryTab;
