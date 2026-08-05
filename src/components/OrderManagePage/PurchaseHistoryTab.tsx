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

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useVendors } from "../../hooks/useVendors";
import { Building2, Loader2, Package, RefreshCw } from "lucide-react";
import { SplitPanel } from "../common/SplitPanel";
import { ListLoading } from "../common/ListLoading";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import VendorRowCard, { type VendorSummary } from "./PurchaseHistoryTab/VendorRowCard";
import VendorHeaderPanel, { type VendorFull } from "./PurchaseHistoryTab/VendorHeaderPanel";
import PurchaseSubTabs, {
  type PurchaseLedgerRow,
  type PurchaseDetailRow,
  type TabKey as PurchaseSubTabKey,
  CategoryPieChart,
  MonthlyPieChart,
  TopProductsPieChart,
} from "./PurchaseHistoryTab/PurchaseSubTabs";
import { SeasonButtons } from "../common/SeasonButtons";
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
// 2026-08-04 · 판매량(sale_qty) · 판매금액(sale_amt) 정렬 추가 (사용자 요청)
type ProductSort = "amount" | "recent" | "name" | "count" | "sale_qty" | "sale_amt";

// ─── PurchaseHistoryTab ───────────────────────────────────────────────────────

export const PurchaseHistoryTab: React.FC = () => {
  // ═══════════════════════════════════════════════════════════════════════
  //  뷰 모드 (#191 · 공급사별 / 상품별)
  // ═══════════════════════════════════════════════════════════════════════
  const [viewMode, setViewMode] = useState<ViewMode>("by-vendor");

  // ═══════════════════════════════════════════════════════════════════════
  //  공급사별 뷰 (기존)
  // ═══════════════════════════════════════════════════════════════════════

  // 공급사 목록 · useVendors 캐시 (inline fetch 제거)
  const { vendors: _rawVendors, loading: vendorsLoading } = useVendors();
  const vendors = useMemo<VendorItem[]>(() => _rawVendors as unknown as VendorItem[], [_rawVendors]);
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

  // 기간 필터 (3탭 공통 · 2026-08-05 · 매입이력 전용 → 3탭 공통 이관)
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

  // 2026-08-04 · 상품별 판매지표 map · top-sales?months=1 · product_code → { qty, amt }
  //   · by-product 리스트 · 판매량·판매금액 컬럼·정렬 (사용자 요청)
  //   · 매핑 실패 상품은 undefined · UI 회색 처리
  const [productSalesMap, setProductSalesMap] = useState<Map<string, { qty: number; amt: number }>>(new Map());

  // 매입상세 원본에는 supplier_name 이 함께 있어야 상품별 원장에 필요
  //   PurchaseDetailRow 타입은 supplier_name 을 갖지 않으므로 별도로 map 을 관리
  const [detailSupplierMap, setDetailSupplierMap] = useState<Map<string | number, string | null>>(new Map());

  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<ProductSort>("amount");

  // 선택 상품 (product_code · 없으면 product_name key)
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);

  // Split 리사이저 · 공통 SplitPanel 사용 (2026-08-04 · feedback_ui_principles B-3 준수)
  //   storageKey · by-vendor / by-product 별도 · SplitPanel 이 megatown_ prefix 자동 붙임

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

  // vendors-changed → loadSummary 재조회 (vendors 는 useVendors 내부에서 자동 갱신)
  useEffect(() => {
    loadSummary();
    const onChange = () => loadSummary();
    window.addEventListener("vendors-changed", onChange);
    return () => window.removeEventListener("vendors-changed", onChange);
  }, [loadSummary]);

  // ─── 원장 + detail 통합 로드 (2026-08-05 · 단일 fetch · no_cycle=1) ────
  //   기존 loadLedger / loadDetail 이 동일 URL 을 두 번 호출하던 N+1 패턴 제거.
  //   한 번 fetch → ledgerRows / detailRows 동시 세팅.
  //   no_cycle=1 → 서버 cycle_days 재귀 쿼리 완전 스킵 (공급사 원장에서 미사용).
  const loadVendorData = useCallback(async (supplier: string) => {
    setLedgerLoading(true);
    setDetailLoading(true);
    setLedgerError(null);
    try {
      const isDays10 = periodMonths === 0 && !periodSeason;
      const days = periodSeason
        ? 365
        : isDays10 ? 10 : (periodMonths || 1) * 30;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().slice(0, 10);
      // no_cycle=1 · cycle_days 계산 스킵 → 서버 응답 수십 배 빠름
      const params = new URLSearchParams({ supplier, from: fromStr, limit: "5000", no_cycle: "1" });
      const res = await fetch(`/api/purchase-details?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const rowsFromApi: any[] = Array.isArray(j.rows) ? j.rows : [];
      // supplier 매칭 · raw supplier_name 또는 products 조인 supplier_name 모두
      const filtered = rowsFromApi.filter(r => {
        const rn = String(r.supplier_name ?? r.supplier ?? "").trim();
        return rn === supplier;
      });
      // ledgerRows
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
      // detailRows (동일 데이터 · PurchaseDetailRow 타입 변환)
      const detRows: PurchaseDetailRow[] = filtered.map((r: any) => ({
        id: r.id,
        date: r.purchase_date ?? r.invoice_date ?? "",
        product_code: r.product_code ?? null,
        product_name: r.product_name ?? null,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        amount: Number(r.amount ?? r.total) || 0,
      }));
      setDetailRows(detRows);
      setDetailSource("purchase_details" as DataSource);
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedgerRows([]);
      setDetailRows([]);
      setDetailSource(null);
    } finally {
      setLedgerLoading(false);
      setDetailLoading(false);
    }
  }, [periodMonths, periodSeason]);

  // 공급사 선택 시 · 단일 fetch
  useEffect(() => {
    if (!selectedVendor) {
      setLedgerRows([]);
      setDetailRows([]);
      return;
    }
    loadVendorData(selectedVendor.company_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor, loadVendorData]);

  // 기간 필터 변경 시 재조회 (2026-08-05 · 3탭 공통 기간 반영)
  useEffect(() => {
    if (!selectedVendor) return;
    loadVendorData(selectedVendor.company_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMonths, periodSeason]);

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
  //   2026-08-05 · 서버 페이지네이션 도입
  //     · 첫 fetch: per_page=200&page=1 (빠른 초기 표시)
  //     · has_more=true 이면 백그라운드로 나머지 페이지 누적 로드
  //     · no_cycle=1 · cycle_days 계산 완전 스킵
  //     · top-sales 는 첫 fetch 와 병렬 (기존 동일)
  // ═══════════════════════════════════════════════════════════════════════
  const PER_PAGE_ALL = 200; // 첫 페이지 행 수
  // 2026-08-05 · loadAllDetails 경쟁 방지 (bug fix · stability-bug-hunter)
  //   · force=true 재호출 시 · 이전 백그라운드 루프 무효화
  //   · runId 증가 · 각 반복 · currentRunId !== loadAllDetailsRunIdRef.current 면 break
  const loadAllDetailsRunIdRef = useRef(0);
  const loadAllDetails = useCallback(async (force = false) => {
    if (allDetailsLoaded && !force) return;
    const currentRunId = ++loadAllDetailsRunIdRef.current;
    setAllDetailsLoading(true);
    setAllDetailsError(null);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
      const firstParams = new URLSearchParams({
        from: fromStr,
        per_page: String(PER_PAGE_ALL),
        page: "1",
        no_cycle: "1",
      });
      // 첫 페이지 + top-sales 병렬
      const [res, salesRes] = await Promise.all([
        fetch(`/api/purchase-details?${firstParams}`),
        fetch("/api/stock-manage/top-sales?months=1&limit=5000&sort=sale&dir=desc").catch(() => null),
      ]);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const firstRows: any[] = Array.isArray(j.rows) ? j.rows : [];

      // 판매지표 map 구성 (product_code 기준 · leading zero 형태도 함께 저장)
      const salesMap = new Map<string, { qty: number; amt: number }>();
      if (salesRes && salesRes.ok) {
        try {
          const sb = await salesRes.json();
          const sRows: any[] = Array.isArray(sb?.rows) ? sb.rows : [];
          for (const r of sRows) {
            const code = String(r.product_code ?? "").trim();
            if (!code) continue;
            const qty = Number(r.sale_qty_month ?? 0) || 0;
            const amt = Number(r.sale_amount_month ?? 0) || 0;
            if (qty === 0 && amt === 0) continue;
            const cur = salesMap.get(code) ?? { qty: 0, amt: 0 };
            cur.qty += qty;
            cur.amt += amt;
            salesMap.set(code, cur);
            const stripped = code.replace(/^0+/, "");
            if (stripped && stripped !== code && !salesMap.has(stripped)) {
              salesMap.set(stripped, cur);
            }
          }
        } catch { /* 판매 데이터 실패는 무시 · 매입은 표시 */ }
      }
      setProductSalesMap(salesMap);

      // 정규화 헬퍼
      const normalizeRows = (raw: any[]): { details: PurchaseDetailRow[]; supMap: Map<string | number, string | null> } => {
        const details: PurchaseDetailRow[] = [];
        const supMap = new Map<string | number, string | null>();
        for (const r of raw) {
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
        return { details, supMap };
      };

      const { details: firstDetails, supMap: firstSupMap } = normalizeRows(firstRows);

      // 첫 페이지로 즉시 표시 → 체감 로딩 빠름
      setAllDetails(firstDetails);
      setDetailSupplierMap(firstSupMap);
      setAllDetailsLoaded(true);
      setAllDetailsLoading(false); // 스피너 off · 나머지는 백그라운드

      // has_more=true 이면 나머지 페이지 누적 로드 (백그라운드)
      if (j.has_more) {
        let page = 2;
        const accumulated = [...firstRows];
        while (true) {
          // 경쟁 방지 · 이 루프가 최신 호출이 아니면 중단 (force 재호출 시)
          if (currentRunId !== loadAllDetailsRunIdRef.current) break;
          const moreParams = new URLSearchParams({
            from: fromStr,
            per_page: String(PER_PAGE_ALL),
            page: String(page),
            no_cycle: "1",
          });
          const moreRes = await fetch(`/api/purchase-details?${moreParams}`);
          if (!moreRes.ok) break;
          const mj = await moreRes.json();
          const moreRows: any[] = Array.isArray(mj.rows) ? mj.rows : [];
          if (moreRows.length === 0) break;
          accumulated.push(...moreRows);
          const { details: accDet, supMap: accSup } = normalizeRows(accumulated);
          // 결과 반영 전에도 최신 runId 확인
          if (currentRunId !== loadAllDetailsRunIdRef.current) break;
          setAllDetails(accDet);
          setDetailSupplierMap(accSup);
          if (!mj.has_more) break;
          page++;
        }
      }
    } catch (e: any) {
      setAllDetailsError(e?.message ?? "네트워크 오류");
      setAllDetails([]);
      setDetailSupplierMap(new Map());
      setProductSalesMap(new Map());
      setAllDetailsLoading(false);
    }
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

  // ─── by-product 기간 필터 적용 allDetails 슬라이스 (2026-08-05) ──────────
  //   · allDetails 는 최근 1년치 전부 · 기간 필터로 클라이언트 슬라이스
  //   · periodMonths/periodSeason 은 by-vendor 뷰와 공유 state
  const filteredAllDetails = useMemo<PurchaseDetailRow[]>(() => {
    if (allDetails.length === 0) return [];
    const isDays10 = periodMonths === 0 && !periodSeason;
    const days = periodSeason
      ? 365
      : isDays10 ? 10 : (periodMonths || 1) * 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toISOString().slice(0, 10);
    return allDetails.filter(r => r.date >= fromStr);
  }, [allDetails, periodMonths, periodSeason]);

  // 기간 필터 변경 시 · 선택 상품이 필터된 리스트에 없으면 해제 (2026-08-05)
  useEffect(() => {
    if (!selectedProductKey || viewMode !== "by-product") return;
    const found = filteredAllDetails.some(r => {
      const k = String(r.product_code ?? "").trim() || String(r.product_name ?? "").trim() || "(무명)";
      return k === selectedProductKey;
    });
    if (!found) setSelectedProductKey(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAllDetails]);

  // ─── 상품별 집계 (filteredAllDetails groupBy · 기간 필터 반영) ────────────
  const productList = useMemo<ProductSummary[]>(() => {
    if (filteredAllDetails.length === 0) return [];
    const map = new Map<string, ProductSummary & { supplierSet: Map<string, number> }>();
    for (const r of filteredAllDetails) {
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
    // 2026-08-04 · productSalesMap 조인 · sale_qty/sale_amount 매핑 (사용자 요청)
    const list: ProductSummary[] = [];
    for (const a of map.values()) {
      let top: [string, number] | null = null;
      for (const entry of a.supplierSet) {
        if (!top || entry[1] > top[1]) top = entry;
      }
      // 판매지표 매핑 · product_code 원본 → leading zero strip 순
      let sales: { qty: number; amt: number } | undefined;
      if (a.product_code) {
        const code = String(a.product_code).trim();
        sales = productSalesMap.get(code);
        if (!sales) {
          const stripped = code.replace(/^0+/, "");
          if (stripped) sales = productSalesMap.get(stripped);
        }
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
        sale_qty: sales ? sales.qty : null,
        sale_amount: sales ? sales.amt : null,
      });
    }
    return list;
  }, [filteredAllDetails, detailSupplierMap, productSalesMap]);

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
        case "sale_qty": {
          // 2026-08-04 · 판매량 desc · null 은 항상 뒤 (사용자 요청)
          const va = a.sale_qty ?? null;
          const vb = b.sale_qty ?? null;
          if (va == null && vb == null) return a.product_name.localeCompare(b.product_name, "ko");
          if (va == null) return 1;
          if (vb == null) return -1;
          if (vb !== va) return vb - va;
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "sale_amt": {
          // 2026-08-04 · 판매금액 desc · null 은 항상 뒤 (사용자 요청)
          const va = a.sale_amount ?? null;
          const vb = b.sale_amount ?? null;
          if (va == null && vb == null) return a.product_name.localeCompare(b.product_name, "ko");
          if (va == null) return 1;
          if (vb == null) return -1;
          if (vb !== va) return vb - va;
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
    for (const r of filteredAllDetails) {
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
  }, [filteredAllDetails, detailSupplierMap, selectedProductKey]);

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

        {/* 기간 필터 · 매입이력 탭 내부로 이동 (개선 3 · 2026-08-05)
            by-vendor 공급사별 뷰에서 상단 공통 필터 제거 · PurchaseSubTabs 내부 ledger 탭 헤더에 배치 */}

        {/* 새로고침 */}
        {viewMode === "by-vendor" && selectedVendor && (
          <button
            type="button"
            onClick={() => {
              loadVendorData(selectedVendor.company_name);
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
            leftClassName="max-h-[60vh] lg:max-h-none"
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
                showExtraPurchaseColumns
                showCycleColumn
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
                        loadVendorData(selectedVendor.company_name);
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
                    periodMonths={periodMonths}
                    periodSeason={periodSeason}
                    onPeriodChange={(months, season) => {
                      setPeriodMonths(months);
                      setPeriodSeason(season);
                    }}
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
            /* 2026-08-05 · 모바일 max-h-[42vh] 기본 제한 · 상품 리스트 안 보임 해결 */
            leftClassName="max-h-[80vh] lg:max-h-none"
            className="flex-1 min-h-0 gap-2 lg:gap-0"
            mobileRightAsModal={true}
            mobileModalTitle={selectedProduct?.product_name ?? "상품 상세"}
            mobileOpen={!!selectedProductKey}
            onMobileClose={() => setSelectedProductKey(null)}
            left={
              <div className="w-full flex flex-col gap-2 h-full min-h-0">
              {/* 검색 + 기간 필터 + 정렬 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-col gap-2">
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="상품명 · 코드 검색"
                  className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
                />
                {/* 2026-08-05 · 기간 필터 (by-product 공통 periodMonths/periodSeason 공유) */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">기간</span>
                  <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded-md p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => { setPeriodMonths(0); setPeriodSeason(null); }}
                      className={`px-2 h-6 text-[10px] font-semibold rounded transition cursor-pointer ${
                        !periodSeason && periodMonths === 0
                          ? "bg-sky-500 text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >10일</button>
                    {([1, 2, 3, 6] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setPeriodMonths(m); setPeriodSeason(null); }}
                        className={`px-2 h-6 text-[10px] font-semibold rounded transition cursor-pointer ${
                          !periodSeason && periodMonths === m
                            ? "bg-sky-500 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >{m}개월</button>
                    ))}
                  </div>
                  <SeasonButtons
                    value={periodSeason ?? null}
                    onChange={(v) => { setPeriodSeason(v); }}
                    size="sm"
                    hideLabel
                  />
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-slate-100 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">정렬</span>
                  {/* 2026-08-04 · 판매량·판매금액 정렬 추가 (사용자 요청 · 판매는 rose · 매입/기타는 sky) */}
                  {([
                    { k: "amount"   as const, label: "매입액",   color: "sky" as const },
                    { k: "recent"   as const, label: "최근매입", color: "sky" as const },
                    { k: "count"    as const, label: "매입건수", color: "sky" as const },
                    { k: "sale_qty" as const, label: "판매량",   color: "rose" as const },
                    { k: "sale_amt" as const, label: "판매금액", color: "rose" as const },
                    { k: "name"     as const, label: "가나다",   color: "sky" as const },
                  ]).map(o => {
                    const activeCls = o.color === "rose" ? "bg-rose-500 text-white" : "bg-sky-500 text-white";
                    return (
                      <button
                        key={o.k}
                        type="button"
                        onClick={() => setProductSort(o.k)}
                        className={`h-5 px-1.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                          productSort === o.k
                            ? activeCls
                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >{o.label}</button>
                    );
                  })}
                </div>
              </div>
              {/* 상품 리스트 · 카드 2줄 · 상단 컬럼 헤더 */}
              {/* 2026-08-05 · max-h-[65vh] 좁아서 스크롤·데이터 안 보임 문제 · 90vh 로 확대 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 max-h-[calc(100vh-200px)] flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/60 shrink-0 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>상품</span>
                  <span className="text-right whitespace-nowrap text-amber-600">매입</span>
                  <span className="text-right whitespace-nowrap text-rose-600">판매</span>
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
                    {productSearch ? "검색 결과 없음" : "해당 기간 매입 상품 없음"}
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
              /* 우측: 상품 선택 전 → 전체 파이차트 3종 / 선택 후 → 상품 상세 */
              <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
              {!selectedProduct ? (
                /* 2026-08-05 · 상품 선택 전 · 기간 필터 기반 전체 매입 파이차트 3종 */
                <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto">
                  {/* 차트 헤더 */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5 flex items-center gap-2 shrink-0">
                    <Package size={14} className="text-sky-500 shrink-0" />
                    <span className="text-[13px] font-black text-slate-800">상품별 매입 분석</span>
                    <span className="text-[11px] text-slate-400 font-semibold ml-1">
                      {filteredAllDetails.length > 0
                        ? `${filteredAllDetails.length}건 분석`
                        : allDetailsLoading ? "로딩 중..." : "데이터 없음"}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-400">좌측에서 상품을 선택하면 원장 표시</span>
                  </div>
                  {/* 3종 파이차트 · 반응형 그리드 */}
                  {allDetailsLoading ? (
                    <div className="bg-white rounded-xl border border-slate-200 flex-1 flex items-center justify-center text-slate-400 text-[12px] gap-2 min-h-[300px]">
                      <Loader2 size={14} className="animate-spin" />
                      <span>매입 데이터 로딩 중...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 pb-2">
                      <CategoryPieChart rows={filteredAllDetails} />
                      <TopProductsPieChart rows={filteredAllDetails} />
                      <div className="xl:col-span-2">
                        <MonthlyPieChart rows={filteredAllDetails} />
                      </div>
                    </div>
                  )}
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
