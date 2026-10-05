// 2026-08-17 · apiClient 마이그레이션
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
// 2026-08-29 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
import { matchesSupplierQuery } from "../../lib/supplierMatch";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 정제 후 정렬
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { lookupProduct } from "../../lib/productsCache";
// 2026-08-22 · Framework Phase 4 · UI imports 정리 (panels 로 이관)
// T-CSS Phase 2 · 2026-08-06
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import type { VendorSummary } from "./PurchaseHistoryTab/VendorRowCard";
import type { VendorFull } from "./PurchaseHistoryTab/VendorHeaderPanel";
import type { Vendor as VendorRecord } from "../LandingPage/VendorListEditor";
import type {
  PurchaseLedgerRow,
  PurchaseDetailRow,
  TabKey as PurchaseSubTabKey,
} from "./PurchaseHistoryTab/PurchaseSubTabs";
import type { ProductSummary } from "./PurchaseHistoryTab/ProductRowCard";
import type { ProductPurchaseRow } from "./PurchaseHistoryTab/ProductPurchaseDetailPanel";
import { useLedgerHighlight } from "../../hooks/useLedgerHighlight";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";
import { API_LIMITS } from "../../constants/apiLimits";
import { api, ApiError } from "../../lib/apiClient";
import { devLog, devWarn } from "../../lib/devLog";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import type { VendorItem, SummaryResponse, DataSource, SourceDiagnostics, ViewMode, ProductSort, ProductSortDir } from "./PurchaseHistoryTab.types";
// 2026-08-22 · Framework Phase 4 · 3섹션 별도 컴포넌트 이관
import { FilterBar, ByVendorPanel, ByProductPanel } from "./PurchaseHistoryTab.panels";

// ─── PurchaseHistoryTab ───────────────────────────────────────────────────────

export const PurchaseHistoryTab: React.FC = () => {
  const { toast, showError } = useToast();
  // ═══════════════════════════════════════════════════════════════════════
  //  뷰 모드 (#191 · 공급사별 / 상품별)
  // 2026-08-25 · 사용자 지시 · 공급사별 을 앞으로 · 기본 탭으로 재변경
  // ═══════════════════════════════════════════════════════════════════════
  const [viewMode, setViewMode] = useState<ViewMode>("by-vendor");

  // ═══════════════════════════════════════════════════════════════════════
  //  #324 · 판매상태 필터 (2026-09-20)
  // ═══════════════════════════════════════════════════════════════════════
  const [saleStatusFilter, setSaleStatusFilter] = useState<"all" | "selling" | "stopped">("all");

  // ─── 공급사 상세 모달 (T-COMMON-VendorInfoModal · 2026-08-06) ─────────────
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();

  // ═══════════════════════════════════════════════════════════════════════
  //  공급사별 뷰 (기존)
  // ═══════════════════════════════════════════════════════════════════════

  // 공급사 목록 · useVendors 캐시 (inline fetch 제거)
  const { vendors: _rawVendors, loading: vendorsLoading } = useVendors();
  const vendors = useMemo<VendorItem[]>(() => _rawVendors as unknown as VendorItem[], [_rawVendors]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>("전체");

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

  // 2026-09-18 · #93 · 사용자 지시 · 옵션 C 하이브리드 · 유사 매입이력 병합 모드
  //   · 선택 vendor 의 purchase_details 가 0건일 때 · 유사 vendor 매입이력 병합 표시
  //   · vendor·검색어 변경 시 자동 리셋 (정확 검색 기본)
  const [unionMode, setUnionMode] = useState(false);
  // union 병합 결과 · unionMode = true 일 때만 세팅됨
  const [unionLedgerRows, setUnionLedgerRows] = useState<PurchaseLedgerRow[]>([]);
  const [unionDetailRows, setUnionDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [unionLoading, setUnionLoading] = useState(false);
  const [unionError, setUnionError] = useState<string | null>(null);
  const [unionVendorCount, setUnionVendorCount] = useState(0);

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
  // 2026-10-05 · 사용자 지시 · 월 멀티선택 (비연속 지원) · selectedMonths SSOT · Supabase purchase_details 직접 조회
  //   · periodMonths 는 호환성 유지 (summary API days 변환용 · summary API 는 months_list 지원함)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const now = new Date();
    return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`];
  });
  const monthsListParamStr = useMemo(
    () => [...selectedMonths].sort((a, b) => a.localeCompare(b)).join(","),
    [selectedMonths],
  );

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
  // #324-2차 · 표형식 · 정렬 방향 (amount/recent/count/sale_qty/sale_amt → desc default · name → asc default)
  const [productSortDir, setProductSortDir] = useState<ProductSortDir>("desc");
  const toggleProductSort = (k: ProductSort) => {
    if (productSort === k) {
      setProductSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setProductSort(k);
      setProductSortDir(k === "name" ? "asc" : "desc");
    }
  };

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
      // 2026-10-05 · 사용자 지시 · 월 멀티선택 · Supabase 직접 조회 · months_list 전달
      //   · season 선택 시 · days=365 폴백 (season-mode 유지)
      //   · months_list 비면 periodMonths 폴백 (하위호환)
      const isDays10 = periodMonths === 0 && !periodSeason;
      const summaryDays = isDays10 ? 10 : (periodMonths || 3) * 30;
      const summaryUseMonthsList = !periodSeason && selectedMonths.length > 0;
      const summaryUrl = summaryUseMonthsList
        ? `/api/supplier-purchase-summary?months_list=${encodeURIComponent(monthsListParamStr)}`
        : `/api/supplier-purchase-summary?days=${summaryDays}`;
      const salesUrl = summaryUseMonthsList
        ? `/api/stock-manage/top-sales?months_list=${encodeURIComponent(monthsListParamStr)}&limit=5000&sort=sale&dir=desc`
        : `/api/stock-manage/top-sales?months=${periodMonths > 0 ? periodMonths : 1}&limit=5000&sort=sale&dir=desc`;
      const [summaryResult, salesResult] = await Promise.allSettled([
        api.get<SummaryResponse & { suppliers: any[] }>(summaryUrl),
        api.get<any>(salesUrl),
      ]);
      if (summaryResult.status === "rejected") throw summaryResult.reason;
      const j: SummaryResponse & { suppliers: any[] } = summaryResult.value.data;
      // source · diagnostics 저장 (UI 배지·console 출력)
      setSummarySource(j.source ?? null);
      setSummaryDiagnostics(j.diagnostics ?? null);
      if (j.source === "ocr_confirmed_items") {
        devWarn(
          "[PurchaseHistory] 매입이력 데이터가 거래명세서(ocr_confirmed_items) 폴백으로 로드됨. " +
          "정답 소스는 purchase_details (ERP xlsx 임포트). " +
          "diagnostics:", j.diagnostics,
        );
      } else if (j.source === "purchase_details") {
        devLog("[PurchaseHistory] source=purchase_details (ERP 임포트) · diagnostics:", j.diagnostics);
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
      if (salesResult.status === "fulfilled") {
        try {
          const sb = salesResult.value.data;
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
    } catch (e: any) {
      setSummaryMap(new Map());
      showError(`공급사 요약 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally { setSummaryLoading(false); }
    // 2026-10-05 · 사용자 지시 · 월 멀티선택 · deps 에 monthsListParamStr 추가
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMonths, periodSeason, monthsListParamStr]);

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
      const params = new URLSearchParams({ supplier, from: fromStr, limit: String(API_LIMITS.LARGE), no_cycle: "1" });
      const { data: j } = await api.get<any>(`/api/purchase-details?${params}`);
      const rowsFromApi: any[] = Array.isArray(j.rows) ? j.rows : [];
      // 2026-08-30 · 사용자 지시 · 정제명 매칭 · (주)녹십자 vs 녹십자 · vat 부가정보 무시
      const { displayVendorName: dv } = await import("../../utils/vendorNameNormalize");
      const norm = dv(supplier);
      const filtered = rowsFromApi.filter(r => {
        const rn = String(r.supplier_name ?? r.supplier ?? "");
        return dv(rn) === norm;
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
      const msg = e?.message ?? "네트워크 오류";
      setLedgerError(msg);
      setLedgerRows([]);
      setDetailRows([]);
      setDetailSource(null);
      showError(`매입원장 로드 실패: ${msg}`);
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
  //  #93 · 옵션 C 하이브리드 · 유사 vendor 계산 · union 로드 (2026-09-18)
  // ═══════════════════════════════════════════════════════════════════════

  // 유사 vendor · 검색어 우선 · 없으면 선택된 vendor 이름
  const similarVendors = useMemo<VendorItem[]>(() => {
    if (!selectedVendor) return [];
    const query = vendorSearch.trim() || selectedVendor.company_name;
    if (!query) return [];
    return vendors.filter(v =>
      v.id !== selectedVendor.id
      && matchesSupplierQuery({ company_name: v.company_name }, query)
    );
  }, [selectedVendor, vendorSearch, vendors]);

  // 유사 vendor 중 · 매입이력 존재 개수 (좌측 summaryMap 기반 판별)
  const similarWithHistoryCount = useMemo<number>(() => {
    if (similarVendors.length === 0) return 0;
    const norm = (s: string): string =>
      s.replace(/[\s()㈜㈐]/g, "")
       .replace(/^\(주\)/g, "")
       .replace(/주식회사/g, "")
       .replace(/\(주\)$/g, "")
       .toLowerCase();
    // summaryMap 은 supplier(=purchase_details.supplier_name) key 이므로
    // vendors.company_name 을 원본·정규화 양쪽으로 매칭
    const summaryNormMap = new Map<string, VendorSummary>();
    for (const [k, v] of summaryMap) {
      const n = norm(k);
      if (n && !summaryNormMap.has(n)) summaryNormMap.set(n, v);
    }
    let cnt = 0;
    for (const v of similarVendors) {
      let s = summaryMap.get(v.company_name);
      if (!s) {
        const n = norm(v.company_name);
        if (n) s = summaryNormMap.get(n);
      }
      if (s && ((s.sku_count ?? 0) > 0 || (s.total_amount ?? 0) > 0)) cnt++;
    }
    return cnt;
  }, [similarVendors, summaryMap]);

  // vendor·검색어 변경 시 · unionMode 리셋 (정확 검색 우선)
  useEffect(() => {
    setUnionMode(false);
    setUnionLedgerRows([]);
    setUnionDetailRows([]);
    setUnionError(null);
    setUnionVendorCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor?.id, vendorSearch]);

  // union 병합 로드 (선택 vendor + 유사 vendor 전체 · 상한 20개 · Promise.all)
  //   · Race guard runId · vendor·기간 변경 시 이전 결과 무시
  const unionRunIdRef = useRef(0);
  const loadUnionData = useCallback(async () => {
    if (!selectedVendor) return;
    const runId = ++unionRunIdRef.current;
    setUnionLoading(true);
    setUnionError(null);
    try {
      // 대상 vendor 목록 · 선택 + 유사 · dedup · 상한 20개
      const targetsRaw: string[] = [selectedVendor.company_name, ...similarVendors.map(v => v.company_name)];
      const seen = new Set<string>();
      const targets: string[] = [];
      for (const t of targetsRaw) {
        const key = String(t ?? "").trim();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push(key);
        if (targets.length >= 20) break;
      }
      setUnionVendorCount(targets.length);

      // 기간 계산 (loadVendorData 와 동일)
      const isDays10 = periodMonths === 0 && !periodSeason;
      const days = periodSeason
        ? 365
        : isDays10 ? 10 : (periodMonths || 1) * 30;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().slice(0, 10);

      const { displayVendorName: dv } = await import("../../utils/vendorNameNormalize");

      // 병렬 fetch · Promise.allSettled · 개별 실패는 무시 (부분 성공 허용)
      const results = await Promise.allSettled(
        targets.map(sup => {
          const params = new URLSearchParams({
            supplier: sup,
            from: fromStr,
            limit: String(API_LIMITS.LARGE),
            no_cycle: "1",
          });
          return api.get<any>(`/api/purchase-details?${params}`);
        }),
      );
      // race guard · 이 호출이 최신 아니면 폐기
      if (runId !== unionRunIdRef.current) return;

      const merged: any[] = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status !== "fulfilled") continue;
        const rowsFromApi: any[] = Array.isArray(r.value.data?.rows) ? r.value.data.rows : [];
        // 정제명 매칭 · 서버가 유사 이름을 반환하는 경우 필터 (loadVendorData 와 동일 로직)
        const norm = dv(targets[i]);
        for (const raw of rowsFromApi) {
          const rn = String(raw.supplier_name ?? raw.supplier ?? "");
          if (dv(rn) !== norm) continue;
          merged.push(raw);
        }
      }

      // dedup by id · 서버 결과 중복 방지
      const byId = new Map<string | number, any>();
      for (const r of merged) {
        if (r?.id != null && !byId.has(r.id)) byId.set(r.id, r);
      }
      const uniq = Array.from(byId.values());

      const purchaseRows: PurchaseLedgerRow[] = uniq.map((r: any) => ({
        id: r.id,
        invoice_date: r.purchase_date ?? r.invoice_date ?? null,
        product_name: r.product_name ?? null,
        product_code: r.product_code ?? null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        unit_price: r.unit_price != null ? Number(r.unit_price) : null,
        amount: Number(r.amount ?? r.total) || 0,
      }));
      const detRows: PurchaseDetailRow[] = uniq.map((r: any) => ({
        id: r.id,
        date: r.purchase_date ?? r.invoice_date ?? "",
        product_code: r.product_code ?? null,
        product_name: r.product_name ?? null,
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        amount: Number(r.amount ?? r.total) || 0,
      }));

      if (runId !== unionRunIdRef.current) return;
      setUnionLedgerRows(purchaseRows);
      setUnionDetailRows(detRows);
    } catch (e: any) {
      if (runId !== unionRunIdRef.current) return;
      const msg = e?.message ?? "네트워크 오류";
      setUnionError(msg);
      setUnionLedgerRows([]);
      setUnionDetailRows([]);
      showError(`유사 매입이력 병합 로드 실패: ${msg}`);
    } finally {
      if (runId === unionRunIdRef.current) setUnionLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor, similarVendors, periodMonths, periodSeason]);

  // unionMode ON · vendor·기간 변경 시 재로드
  useEffect(() => {
    if (!unionMode) return;
    if (!selectedVendor) return;
    loadUnionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unionMode, selectedVendor?.id, periodMonths, periodSeason]);

  // 최종 render 용 rows · unionMode 여부에 따라 스왑
  const _rawDisplayLedgerRows = unionMode ? unionLedgerRows : ledgerRows;
  const _rawDisplayDetailRows = unionMode ? unionDetailRows : detailRows;
  const displayLedgerLoading = unionMode ? unionLoading : ledgerLoading;
  const displayDetailLoading = unionMode ? unionLoading : detailLoading;
  const displayLedgerError = unionMode ? unionError : ledgerError;

  // 2026-09-20 · #324 · 공급사별 뷰 · 판매상태 필터 적용 (client-side lookupProduct 조인)
  const displayLedgerRows = useMemo<PurchaseLedgerRow[]>(() => {
    if (saleStatusFilter === "all") return _rawDisplayLedgerRows;
    return _rawDisplayLedgerRows.filter(r => {
      const cached = r.product_code ? lookupProduct(String(r.product_code)) : null;
      const s = String((cached as any)?.sale_status ?? "").trim();
      return saleStatusFilter === "selling" ? s === "판매중" : s !== "판매중";
    });
  }, [_rawDisplayLedgerRows, saleStatusFilter]);

  const displayDetailRows = useMemo<PurchaseDetailRow[]>(() => {
    if (saleStatusFilter === "all") return _rawDisplayDetailRows;
    return _rawDisplayDetailRows.filter(r => {
      const cached = r.product_code ? lookupProduct(String(r.product_code)) : null;
      const s = String((cached as any)?.sale_status ?? "").trim();
      return saleStatusFilter === "selling" ? s === "판매중" : s !== "판매중";
    });
  }, [_rawDisplayDetailRows, saleStatusFilter]);

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
      // 2026-10-05 · 사용자 지시 · 1년 고정 fetch 제거 · selectedMonths 전달 · Supabase 직접 조회
      //   · season 선택 시 · 폴백 (season 전체 범위 사용)
      //   · selectedMonths 비면 · 현재월 default (fallback)
      const useMonthsList = !periodSeason && selectedMonths.length > 0;
      const firstParams = new URLSearchParams({
        no_cycle: "1",
      });
      if (useMonthsList) {
        firstParams.set("months_list", monthsListParamStr);
        // months_list 모드 · 서버가 전체 반환 · pagination X
      } else {
        // 폴백 · 기존 1년 fetch
        const now = new Date();
        const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
        firstParams.set("from", fromStr);
        firstParams.set("per_page", String(PER_PAGE_ALL));
        firstParams.set("page", "1");
      }
      // top-sales · 월 멀티선택 반영
      const salesUrl = useMonthsList
        ? `/api/stock-manage/top-sales?months_list=${encodeURIComponent(monthsListParamStr)}&limit=5000&sort=sale&dir=desc`
        : "/api/stock-manage/top-sales?months=1&limit=5000&sort=sale&dir=desc";
      const [firstResult, salesResult] = await Promise.allSettled([
        api.get<any>(`/api/purchase-details?${firstParams}`),
        api.get<any>(salesUrl),
      ]);
      if (firstResult.status === "rejected") throw firstResult.reason;
      const j = firstResult.value.data;
      const firstRows: any[] = Array.isArray(j.rows) ? j.rows : [];

      // 판매지표 map 구성 (product_code 기준 · leading zero 형태도 함께 저장)
      const salesMap = new Map<string, { qty: number; amt: number }>();
      if (salesResult.status === "fulfilled") {
        try {
          const sb = salesResult.value.data;
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
      // 2026-10-05 · months_list 모드 · 서버가 전체 반환 · pagination skip
      const fromStrForPagination = useMonthsList ? null : firstParams.get("from");
      if (j.has_more && !useMonthsList && fromStrForPagination) {
        let page = 2;
        const accumulated = [...firstRows];
        while (true) {
          // 경쟁 방지 · 이 루프가 최신 호출이 아니면 중단 (force 재호출 시)
          if (currentRunId !== loadAllDetailsRunIdRef.current) break;
          const moreParams = new URLSearchParams({
            from: fromStrForPagination,
            per_page: String(PER_PAGE_ALL),
            page: String(page),
            no_cycle: "1",
          });
          let mj: any;
          try {
            const { data } = await api.get<any>(`/api/purchase-details?${moreParams}`);
            mj = data;
          } catch { break; }
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
      const msg = e?.message ?? "네트워크 오류";
      setAllDetailsError(msg);
      setAllDetails([]);
      setDetailSupplierMap(new Map());
      setProductSalesMap(new Map());
      setAllDetailsLoading(false);
      showError(`상품별 매입 로드 실패: ${msg}`);
    }
    // 2026-10-05 · 사용자 지시 · selectedMonths 변경 시 재조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDetailsLoaded, monthsListParamStr, periodSeason]);

  // 뷰 모드가 by-product 로 전환될 때 lazy load
  useEffect(() => {
    if (viewMode === "by-product") loadAllDetails();
  }, [viewMode, loadAllDetails]);

  // 2026-10-05 · 사용자 지시 · 월 선택 변경 시 · by-product 뷰 재조회
  useEffect(() => {
    if (viewMode === "by-product") loadAllDetails(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsListParamStr, periodSeason]);

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
    const q = vendorSearch.trim();
    const list = vendors.filter(v => {
      if (q && !matchesSupplierQuery(v, q)) return false;
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

    // 2026-09-18 · 사용자 지시 · (주)·주식회사 무시 · 정제 후 정렬 · "(주)녹십자" · "녹십자" 동일 위치
    const cmpName = (x: { company_name: string }, y: { company_name: string }) =>
      displayVendorName(x.company_name).localeCompare(displayVendorName(y.company_name), "ko");
    return list.sort((a, b) => {
      const sa = summaryLookup(a.company_name);
      const sb = summaryLookup(b.company_name);
      // name 정렬 (예외 · 항상 문자열 비교)
      if (leftSort === "name") {
        return dirSign * cmpName(a, b);
      }
      // recent · 문자열 (YYYY-MM-DD)
      if (leftSort === "recent") {
        const da = sa?.last_purchase_date ?? "";
        const db = sb?.last_purchase_date ?? "";
        // null 값은 항상 뒤 (dir 무관)
        if (!da && !db) return cmpName(a, b);
        if (!da) return 1;
        if (!db) return -1;
        if (da !== db) return dirSign * da.localeCompare(db);
        return cmpName(a, b);
      }
      // 숫자 컬럼 (null → 항상 뒤)
      const va = pickNum(a);
      const vb = pickNum(b);
      if (va == null && vb == null) return cmpName(a, b);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va !== vb) return dirSign * (va - vb);
      return cmpName(a, b);
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, summaryLookup, leftSort, leftDir]);

  // 2026-10-05 · 사용자 지시 · client-side periodMonths slicing 제거
  //   · 서버 /api/purchase-details?months_list=... 가 이미 선택 월 기준 필터 완료
  //   · allDetails = 서버가 반환한 선택 월 범위 그대로 사용
  //   · season 모드 폴백 · 기존 periodMonths 범위 slicing 유지 (season-mode 호환)
  const filteredAllDetails = useMemo<PurchaseDetailRow[]>(() => {
    if (allDetails.length === 0) return [];
    const useMonthsList = !periodSeason && selectedMonths.length > 0;
    if (useMonthsList) return allDetails;
    // 폴백 (season-mode) · 기존 days 기반 slicing 유지
    const isDays10 = periodMonths === 0 && !periodSeason;
    const days = periodSeason ? 365 : (isDays10 ? 10 : (periodMonths || 1) * 30);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toISOString().slice(0, 10);
    return allDetails.filter(r => r.date >= fromStr);
  }, [allDetails, periodMonths, periodSeason, selectedMonths]);

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
      const cached = a.product_code ? lookupProduct(a.product_code) : null;
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
        current_stock: cached ? (cached.current_stock ?? null) : null,
        sale_amount: sales ? sales.amt : null,
        // 2026-09-20 · #324 · productsCache 조인 · 판매상태 필터용
        sale_status: cached ? (String((cached as any).sale_status ?? "").trim() || null) : null,
      });
    }
    return list;
  }, [filteredAllDetails, detailSupplierMap, productSalesMap]);

  // 상품 필터링 + 정렬
  const filteredProducts = useMemo<ProductSummary[]>(() => {
    // 2026-08-29 · 통일 로직 · matchesProductQuery
    // 2026-09-20 · #324 · 판매상태 필터 적용
    const saleOk = (status: string | null | undefined): boolean => {
      if (saleStatusFilter === "all") return true;
      const s = String(status ?? "").trim();
      if (saleStatusFilter === "selling") return s === "판매중";
      // stopped: "판매중" 이 아닌 것 (판매중지 · null 포함)
      return s !== "판매중";
    };
    const list = productList.filter(p => matchesProductQuery(p, productSearch) && saleOk(p.sale_status));
    // #324-2차 · productSortDir 반영 · dirSign
    const ds = productSortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (productSort) {
        case "amount": {
          if (a.total_amount !== b.total_amount) return ds * (a.total_amount - b.total_amount);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "recent": {
          const da = a.last_purchase_date ?? "";
          const db = b.last_purchase_date ?? "";
          if (da !== db) return ds * da.localeCompare(db);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "count": {
          if (a.purchase_count !== b.purchase_count) return ds * (a.purchase_count - b.purchase_count);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "sale_qty": {
          const va = a.sale_qty ?? null;
          const vb = b.sale_qty ?? null;
          if (va == null && vb == null) return a.product_name.localeCompare(b.product_name, "ko");
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va !== vb) return ds * (va - vb);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "sale_amt": {
          const va = a.sale_amount ?? null;
          const vb = b.sale_amount ?? null;
          if (va == null && vb == null) return a.product_name.localeCompare(b.product_name, "ko");
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va !== vb) return ds * (va - vb);
          return a.product_name.localeCompare(b.product_name, "ko");
        }
        case "name":
        default:
          return ds * a.product_name.localeCompare(b.product_name, "ko");
      }
    });
  }, [productList, productSearch, productSort, productSortDir, saleStatusFilter]);

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
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · FilterBar */}
      {/* 2026-09-20 · #324 · saleStatusFilter props 추가 */}
      <FilterBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedVendor={selectedVendor}
        ledgerRowsCount={displayLedgerRows.length}
        productListCount={filteredProducts.length}
        summarySource={summarySource}
        summaryDiagnostics={summaryDiagnostics}
        detailSource={detailSource}
        periodMonths={periodMonths}
        setPeriodMonths={setPeriodMonths}
        periodSeason={periodSeason}
        setPeriodSeason={setPeriodSeason}
        selectedMonths={selectedMonths}
        setSelectedMonths={setSelectedMonths}
        ledgerLoading={ledgerLoading}
        allDetailsLoading={allDetailsLoading}
        saleStatusFilter={saleStatusFilter}
        setSaleStatusFilter={setSaleStatusFilter}
        onRefreshVendor={() => {
          if (selectedVendor) loadVendorData(selectedVendor.company_name);
          loadSummary();
        }}
        onRefreshProducts={() => loadAllDetails(true)}
      />

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · ByVendorPanel / ByProductPanel */}
      <div className="flex flex-col lg:flex-row gap-2 lg:gap-0 flex-1 min-h-0">
        {viewMode === "by-vendor" ? (
          <ByVendorPanel
            vendors={vendors}
            selectedVendor={selectedVendor}
            setSelectedVendor={setSelectedVendor}
            subTab={subTab}
            setSubTab={setSubTab}
            detailRows={displayDetailRows}
            detailLoading={displayDetailLoading}
            ledgerRows={displayLedgerRows}
            ledgerLoading={displayLedgerLoading}
            ledgerError={displayLedgerError}
            setLedgerError={setLedgerError}
            highlightId={highlightId}
            periodMonths={periodMonths}
            setPeriodMonths={setPeriodMonths}
            periodSeason={periodSeason}
            setPeriodSeason={setPeriodSeason}
            openVendorInfo={openVendorInfo as (v: VendorRecord) => void}
            loadVendorData={loadVendorData}
            /* 2026-09-18 · #93 · 옵션 C · 하이브리드 배너 */
            unionMode={unionMode}
            onEnableUnion={() => setUnionMode(true)}
            onDisableUnion={() => setUnionMode(false)}
            similarWithHistoryCount={similarWithHistoryCount}
            unionVendorCount={unionVendorCount}
          />
        ) : (
          <ByProductPanel
            filteredProducts={filteredProducts}
            filteredAllDetails={filteredAllDetails}
            selectedProductKey={selectedProductKey}
            setSelectedProductKey={setSelectedProductKey}
            selectedProduct={selectedProduct}
            selectedProductRows={selectedProductRows}
            productSearch={productSearch}
            setProductSearch={setProductSearch}
            productSort={productSort}
            setProductSort={setProductSort}
            productSortDir={productSortDir}
            toggleProductSort={toggleProductSort}
            allDetailsLoading={allDetailsLoading}
            allDetailsError={allDetailsError}
            loadAllDetails={loadAllDetails}
          />
        )}
      </div>
    </div>
    {/* 공급사 상세 모달 (T-COMMON-VendorInfoModal) */}
    {vendorModalElement}
    </>
  );
};
export default PurchaseHistoryTab;
