// 2026-08-17 · apiClient 마이그레이션
// src/components/OrderManagePage/PaymentInfoTab.tsx
// 결제 탭 > 결제정보 서브탭 (2026-08-03 재설계 · #196)
// 좌측 · 공급사 리스트 (잔고 정렬)
// 우측 · [결제 입력 폼] + [최근 결제 내역]
//   · 결제 방법 · 카드/이체/현금/어음/상계/기타 (segmented)
//   · 카드 선택 시 · 카드사 selectOrCustom (10 대 카드사 + 자유입력)
//   · 이체 선택 시 · 은행 selectOrCustom
//   · 세금계산서 발행 · 참조번호 · VAT 별도 계산 (vat_included 반영)
//   · 확장 필드는 memo prefix (JSON) 로 저장 · 백엔드 DDL 변경 없음
//
// 리서치 (2026-08 · 최신)
//   · Korean B2B 표준 · 사업자번호 · 공급가액 · VAT(10%) 별도 · 전자세금계산서
//   · U-pharm/Cresoty/Platpharm/Baropharm · 유팜 · 크레소티 등 벤치마크
//   · Zoho/QuickBooks · payment_method + reference_number + tax_invoice_no

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import {
  Building2, Wallet,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// T-COMMON-VendorInfo · 공급사 헤더 공통 컴포넌트 (2026-08-06)
import { VendorInfoHeader } from "../common/VendorInfoHeader";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";
import { SplitPanel } from "../common/SplitPanel";
// 2026-08-23 · #198 Phase 3C · SplitListPanel v3 (subHeader = KPI) · 좌측 리스트 프레임워크화
import { SplitListPanel } from "../common/SplitListPanel";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { IconTile } from "../common/IconTile";
import { Spinner } from "../common/Spinner";
import { useColumnResize } from "../../hooks/useColumnResize";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import type {
  VendorItem, PaymentRow, BalanceResp, MonthlyBreakdown,
  SalesStockBreakdown, PeriodDays, VendorSortKey, SortDir,
  ProductPurchaseSummary, ProdSortKey,
} from "./PaymentInfoTab.types";
import {
  PERIOD_STORAGE_KEY, PERIOD_OPTIONS, DEFAULT_PERIOD, loadPeriodPref,
  CATEGORY_COLORS,
  recentMonthKeys, fmtWonShort, fmtBizNum, fmtPhone,
  decodeMemo,
} from "./PaymentInfoTab.utils";
import {
  SortHeaderBtn, VendorListHeader, KpiMini,
} from "./PaymentInfoTab.subcomponents";
// 2026-08-22 · Framework Phase 4 · 3섹션 분리 + PaymentEntryForm 별도 파일 (2차)
import {
  MonthlyBreakdownSection, RecentPaymentsSection, ProductSummarySection,
} from "./PaymentInfoTab.sections";
import { PaymentEntryForm } from "./PaymentEntryForm";

// ─── PaymentInfoTab ──────────────────────────────────────────────────────────

export const PaymentInfoTab: React.FC = () => {
  const { toast, showError } = useToast();
  // DB + 하드코딩 병합 reference 값
  const { vendorCategories: dbVendorCategories } = useReferenceValues();

  // 공급사 상세 모달 (T-COMMON-VendorInfoModal · 2026-08-06)
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();

  // 공급사 목록 · useVendors 캐시 (inline fetch 제거)
  const { vendors: rawVendors, loading: vendorsLoading, refresh: reloadVendors } = useVendors();
  // latestBalance.balance 파싱 · VendorItem 형태로 변환
  const vendors = useMemo<VendorItem[]>(() => rawVendors.map(v => {
    const rawBal = (v as any)?.latestBalance?.balance;
    const bal = Number.isFinite(Number(rawBal)) ? Number(rawBal) : null;
    return {
      id: v.id,
      company_name: String(v.company_name ?? ""),
      category: v.category ?? null,
      contact_name: v.contact_name ?? null,
      phone: v.phone ?? null,
      email: v.email ?? null,
      business_number: (v.business_number ?? null) as string | null,
      created_at: ((v as any).created_at ?? null) as string | null,
      payment_terms: ((v as any).payment_terms ?? null) as string | null,
      active: ((v as any).active ?? null) as boolean | null,
      vat_included: ((v as any).vat_included ?? null) as boolean | null,
      balance: bal,
    };
  }), [rawVendors]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>("전체");

  // 기간 필터 · Task #103 (2026-08-04) · 매입·결제 집계 기간
  const [periodDays, setPeriodDaysState] = useState<PeriodDays>(() => loadPeriodPref());
  const setPeriodDays = useCallback((d: PeriodDays) => {
    setPeriodDaysState(d);
    try { window.localStorage.setItem(PERIOD_STORAGE_KEY, String(d)); } catch { /* ignore */ }
  }, []);

  // 좌측 리스트 · 매입·결제 aggregate (기간 내 벤더별 합계) · Task #103
  //   /api/supplier-purchase-summary?days=N + /api/supplier-payments?days=N
  //   벤더명 (company_name) → 금액 · 매칭 실패 시 0
  const [purchaseByVendor, setPurchaseByVendor] = useState<Map<string, number>>(new Map());
  const [paymentByVendor, setPaymentByVendor] = useState<Map<string, number>>(new Map());
  // 2026-08-09 · 최근매입일 · /api/supplier-purchase-summary suppliers[].last_purchase_date (purchase_details)
  const [lastPurchaseDateByVendor, setLastPurchaseDateByVendor] = useState<Map<string, string>>(new Map());
  // 2026-08-09 · 총판매액 + 총재고자산 · /api/stock-manage/supplier-purchases (stock_history · 최근 3개월)
  const [salesByVendor, setSalesByVendor] = useState<Map<string, number>>(new Map());
  const [stockValueByVendor, setStockValueByVendor] = useState<Map<string, number>>(new Map());
  const [salesLoading, setSalesLoading] = useState(true);
  const [aggregatesLoading, setAggregatesLoading] = useState(false);

  // T-TEST-공급사리스트-최근결제 (2026-08-06) · 각 공급사 최근 결제 (KPI 상단·모달용)
  const [latestPaymentByVendor, setLatestPaymentByVendor] = useState<Map<string, { date: string; amount: number }>>(new Map());

  // 정렬 상태 · Task #103 · default 잔고 desc
  const [sortKey, setSortKey] = useState<VendorSortKey>("balance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const handleSort = useCallback((key: VendorSortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      // 신규 컬럼 · 숫자는 desc(큰것 우선) · 이름은 asc(가나다) 로 초기화
      setSortDir(key === "name" ? "asc" : "desc");
      return key;
    });
  }, []);

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 잔고
  const [balance, setBalance] = useState<BalanceResp | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 최근 결제 이력
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // 월별 매입/결제 breakdown · 2026-08-04 · #58 · 상단 요약 표
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyBreakdown | null>(null);
  // 2026-08-09 · 7행 표 · 판매·실재고 월별 데이터 + 기간 선택
  const [breakdownMonths, setBreakdownMonths] = useState<number>(3);
  const [salesStockBreakdown, setSalesStockBreakdown] = useState<SalesStockBreakdown | null>(null);
  const [salesStockLoading, setSalesStockLoading] = useState(false);
  // T11 · 상품별 매입 그루핑 · 타입은 PaymentInfoTab.types.ts 로 이관 (2026-08-22 · Phase 4)
  const [productSummary, setProductSummary] = useState<ProductPurchaseSummary[]>([]);
  const [showProductGroup, setShowProductGroup] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // 상품매입 상세 표 · 헤더 자동 정렬 (2026-08-05 · UI #7)
  const productSortComparators = useMemo<Record<ProdSortKey, Comparator<ProductPurchaseSummary>>>(() => ({
    product_name: (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
    product_code: (a, b) => a.product_code.localeCompare(b.product_code, "ko"),
    totalQty:     (a, b) => a.totalQty - b.totalQty,
    totalAmount:  (a, b) => a.totalAmount - b.totalAmount,
    invoiceCount: (a, b) => a.invoiceCount - b.invoiceCount,
    latestDate:   (a, b) => a.latestDate.localeCompare(b.latestDate),
  }), []);
  const {
    sorted: sortedProductSummary,
    sortKey: prodSortKey,
    sortDir: prodSortDir,
    toggleSort: toggleProdSort,
  } = useSortableTable<ProductPurchaseSummary, ProdSortKey>(productSummary, "totalAmount", productSortComparators, "desc");
  const { getWidth: pw, resizerProps: pr } = useColumnResize("paymentProdSummary", {
    name:     { default: 200, min: 100, max: 400 },
    code:     { default: 80,  min: 60, max: 160  },
    qty:      { default: 64,  min: 48, max: 100  },
    amount:   { default: 80,  min: 56, max: 140  },
    count:    { default: 48,  min: 40, max: 80   },
    last_date:{ default: 80,  min: 60, max: 140  },
  });

  // 2026-08-22 · Framework Phase 4 · 폼 상태 + handleSubmit · PaymentEntryForm 컴포넌트로 이관

  // supplier-payment-added 이벤트 · 결제 등록 후 공급사 캐시 재fetch (vendors-changed 는 useVendors 내부에서 이미 구독)
  useEffect(() => {
    const onPaymentAdded = () => reloadVendors();
    window.addEventListener("supplier-payment-added", onPaymentAdded);
    return () => window.removeEventListener("supplier-payment-added", onPaymentAdded);
  }, [reloadVendors]);

  // 공급사 목록 refresh 후 선택 동기화
  useEffect(() => {
    if (!selectedVendor) return;
    const found = vendors.find(v => v.id === selectedVendor.id);
    if (found) setSelectedVendor(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  // ── 좌측 리스트 · 벤더별 매입·결제 aggregate 로드 · Task #103 (2026-08-04) ─
  //   기간(periodDays) 변경 시 · 결제 등록 시 · 초기 로드 시 자동 재조회
  //   /api/supplier-purchase-summary → suppliers[].total_amount (기간 내 매입 합)
  //   /api/supplier-payments → rows[] 를 supplier_name 별 sum (기간 내 결제 합)
  //   벤더명 = supplier_name (raw) · vendors.company_name 과 완전일치 매칭
  const loadAggregates = useCallback(async (days: PeriodDays) => {
    setAggregatesLoading(true);
    try {
      const [purResult, payResult] = await Promise.allSettled([
        api.get<any>(`/api/supplier-purchase-summary?days=${days}`),
        api.get<any>(`/api/supplier-payments?days=${days}`),
      ]);
      const purMap = new Map<string, number>();
      const payMap = new Map<string, number>();
      const lastDateMap = new Map<string, string>();
      if (purResult.status === "fulfilled") {
        const j = purResult.value.data;
        const list: any[] = Array.isArray(j?.suppliers) ? j.suppliers : [];
        for (const s of list) {
          const name = String(s?.supplier ?? "").trim();
          if (!name) continue;
          const amt = Number(s?.total_amount) || 0;
          purMap.set(name, (purMap.get(name) ?? 0) + amt);
          // 2026-08-09 · 최근매입일 · supplier-purchase-summary suppliers[].last_purchase_date (purchase_details)
          const lastDate = String(s?.last_purchase_date ?? "").trim();
          if (lastDate) {
            const prev = lastDateMap.get(name) ?? "";
            if (!prev || lastDate > prev) lastDateMap.set(name, lastDate);
          }
        }
      }
      if (payResult.status === "fulfilled") {
        const j = payResult.value.data;
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        for (const r of rows) {
          const name = String(r?.supplier_name ?? "").trim();
          if (!name) continue;
          const amt = Number(r?.amount) || 0;
          payMap.set(name, (payMap.get(name) ?? 0) + amt);
        }
      }
      setPurchaseByVendor(purMap);
      setPaymentByVendor(payMap);
      setLastPurchaseDateByVendor(lastDateMap);
    } catch (e: any) {
      setPurchaseByVendor(new Map());
      setPaymentByVendor(new Map());
      showError(`매입·결제 집계 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setAggregatesLoading(false);
    }
  }, []);

  // 기간 변경 · 초기 로드 · 결제 등록 후 재조회
  useEffect(() => {
    loadAggregates(periodDays);
    const reload = () => loadAggregates(periodDays);
    window.addEventListener("supplier-payment-added", reload);
    return () => {
      window.removeEventListener("supplier-payment-added", reload);
    };
  }, [periodDays, loadAggregates]);

  // 2026-08-09 · 총판매액 로드 · /api/stock-manage/supplier-purchases (stock_history · 최근 3개월)
  //   supplier 이름 정규화 매칭 (LandingPage VendorListEditor 와 동일 패턴)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSalesLoading(true);
      try {
        const { data: j } = await api.get<any>(`/api/stock-manage/supplier-purchases?months=3&limit=50000`);
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        const sMap = new Map<string, number>();
        const svMap = new Map<string, number>();
        for (const r of rows) {
          const nm = String(r.supplier ?? "").trim();
          if (!nm) continue;
          sMap.set(nm, (sMap.get(nm) ?? 0) + (Number(r.saleAmount ?? 0) || 0));
          svMap.set(nm, (svMap.get(nm) ?? 0) + (Number(r.totalStockAmount ?? 0) || 0));
        }
        if (!cancelled) {
          setSalesByVendor(sMap);
          setStockValueByVendor(svMap);
        }
      } catch { /* silent · 실패 시 - 표시 */ }
      finally { if (!cancelled) setSalesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // T-TEST-공급사리스트-최근결제 (2026-08-06) · 최근 결제일·결제액 배치 로드
  //   /api/supplier-payments/latest-per-supplier · 한번에 모든 공급사 최근 결제 fetch
  //   마운트 시 + 결제 등록 이벤트 시 재조회 · 기간 필터 무관 (전체 이력 중 최근)
  const loadLatestPayments = useCallback(async () => {
    try {
      const { data: j } = await api.get<any>("/api/supplier-payments/latest-per-supplier");
      const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      const m = new Map<string, { date: string; amount: number }>();
      for (const r of rows) {
        const name = String(r?.supplier_name ?? "").trim();
        if (!name) continue;
        m.set(name, {
          date: String(r?.latest_payment_date ?? ""),
          amount: Number(r?.latest_payment_amount) || 0,
        });
      }
      setLatestPaymentByVendor(m);
    } catch (e: any) {
      setLatestPaymentByVendor(new Map());
      showError(`최근 결제 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  }, []);

  useEffect(() => {
    loadLatestPayments();
    const reload = () => loadLatestPayments();
    window.addEventListener("supplier-payment-added", reload);
    return () => window.removeEventListener("supplier-payment-added", reload);
  }, [loadLatestPayments]);

  // ── 잔고 · 최근결제 로드 ─────────────────────────────────────
  const loadBalance = useCallback(async (supplierName: string) => {
    setBalanceLoading(true);
    try {
      const { data: j } = await api.get<BalanceResp>(`/api/supplier-balance/${encodeURIComponent(supplierName)}`);
      setBalance(j);
    } catch (e: any) {
      setBalance(null);
      showError(`잔고 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    }
    finally { setBalanceLoading(false); }
  }, []);

  const loadRecentPayments = useCallback(async (supplierName: string) => {
    setRecentLoading(true);
    try {
      // Task #104 · 결제 후 잔고 컬럼용으로 supplier-ledger 사용
      //   · ledger 는 매입+결제 시간순 merge 후 각 row 에 running_balance 계산 (서버측)
      //   · 여기서는 payment type 만 필터 · 결제 시점의 running_balance = "결제 후 잔고"
      //   · 넉넉히 3650일(10년) fetch · 누적 정합성 보장 (짧게 자르면 오래된 미결제 매입 누락 위험)
      const { data: j } = await api.get<any>(`/api/supplier-ledger?supplier=${encodeURIComponent(supplierName)}&days=3650`);
      const allRows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      // payment type 만 · 최근순 (desc) 정렬 후 상위 8건
      const paymentRows = allRows
        .filter(r => r?.type === "payment")
        .sort((a, b) => {
          const dCmp = String(b?.date ?? "").localeCompare(String(a?.date ?? ""));
          if (dCmp !== 0) return dCmp;
          return (Number(b?.id) || 0) - (Number(a?.id) || 0);
        })
        .slice(0, 8);
      const decoded: PaymentRow[] = paymentRows.map(r => {
        const { meta, note: n } = decodeMemo(r.memo);
        return {
          id: Number(r.id),
          supplier_name: supplierName,
          payment_date: String(r.date ?? ""),
          amount: Number(r.amount) || 0,
          method: r.method ?? null,
          memo: n,
          created_at: null,
          running_balance: Number.isFinite(Number(r.running_balance)) ? Number(r.running_balance) : null,
          meta,
        };
      });
      setRecentPayments(decoded);
    } catch (e: any) {
      setRecentPayments([]);
      showError(`최근 결제이력 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    }
    finally { setRecentLoading(false); }
  }, []);

  // 월별 매입·결제 breakdown 로드 · 2026-08-04 · #58
  //   · /api/supplier-purchase-detail (매입 raw) + /api/supplier-payments (결제 raw)
  //   · 클라이언트에서 YYYY-MM key 로 sum · 최근 N개월 표시
  //   · 파생컬럼 X · 기존 API 조합 · 서버 신규 없음 (feedback_no_derived_columns)
  const MONTHS_TO_SHOW = 3;
  const FETCH_DAYS = 365; // 1년치 fetch · 누적 컬럼 정합성 위해 넉넉히
  const loadMonthlyBreakdown = useCallback(async (supplierName: string) => {
    setMonthlyLoading(true);
    try {
      const [detailResult, paysResult] = await Promise.allSettled([
        api.get<any>(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
        api.get<any>(`/api/supplier-payments?supplier=${encodeURIComponent(supplierName)}&days=${FETCH_DAYS}`),
      ]);
      const purchase: Record<string, number> = {};
      const payment: Record<string, number> = {};
      let totalPurchase = 0;
      let totalPayment = 0;
      // T11 · 상품별 그루핑 (raw rows 를 product_code 로 집계)
      const productMap = new Map<string, ProductPurchaseSummary>();
      if (detailResult.status === "fulfilled") {
        const j = detailResult.value.data;
        for (const r of (Array.isArray(j?.rows) ? j.rows : [])) {
          const date = String(r?.date ?? "");
          if (!/^\d{4}-\d{2}/.test(date)) continue;
          const key = date.slice(0, 7);
          const amt = Number(r?.amount) || 0;
          purchase[key] = (purchase[key] ?? 0) + amt;
          totalPurchase += amt;
          // 상품별 집계
          const code = String(r?.product_code ?? "").trim();
          const pname = String(r?.product_name ?? "").trim();
          const groupKey = code || pname || "(미상)";
          const existing = productMap.get(groupKey);
          const qty = Number(r?.quantity) || 0;
          if (existing) {
            existing.totalAmount += amt;
            existing.totalQty += qty;
            existing.invoiceCount += 1;
            if (date > existing.latestDate) existing.latestDate = date;
          } else {
            productMap.set(groupKey, {
              product_code: code, product_name: pname || code || "(미상)",
              totalAmount: amt, totalQty: qty, invoiceCount: 1, latestDate: date,
            });
          }
        }
      }
      setProductSummary([...productMap.values()].sort((a, b) => b.totalAmount - a.totalAmount));
      if (paysResult.status === "fulfilled") {
        const j = paysResult.value.data;
        for (const r of (Array.isArray(j?.rows) ? j.rows : [])) {
          const date = String(r?.payment_date ?? "");
          if (!/^\d{4}-\d{2}/.test(date)) continue;
          const key = date.slice(0, 7);
          const amt = Number(r?.amount) || 0;
          payment[key] = (payment[key] ?? 0) + amt;
          totalPayment += amt;
        }
      }
      setMonthlyBreakdown({
        months: recentMonthKeys(MONTHS_TO_SHOW),
        purchase,
        payment,
        total_purchase: totalPurchase,
        total_payment: totalPayment,
      });
    } catch (e: any) {
      setMonthlyBreakdown(null);
      setProductSummary([]);
      showError(`월별 매입·결제 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  // 2026-08-09 · 판매·실재고 월별 로드 · /api/supplier-monthly-breakdown
  const loadSalesStockBreakdown = useCallback(async (supplierName: string, months: number) => {
    setSalesStockLoading(true);
    try {
      const { data: j } = await api.get<any>(`/api/supplier-monthly-breakdown?supplier=${encodeURIComponent(supplierName)}&months=${months}`);
      setSalesStockBreakdown(j);
    } catch (e: any) {
      setSalesStockBreakdown(null);
      showError(`판매·재고 월별 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setSalesStockLoading(false);
    }
  }, []);

  // 공급사 선택 시 · 잔고 + 최근결제 로드 · 폼 리셋
  useEffect(() => {
    if (!selectedVendor) {
      setBalance(null);
      setRecentPayments([]);
      setMonthlyBreakdown(null);
      setProductSummary([]);
      setSalesStockBreakdown(null);
      return;
    }
    loadBalance(selectedVendor.company_name);
    loadRecentPayments(selectedVendor.company_name);
    loadMonthlyBreakdown(selectedVendor.company_name);
    loadSalesStockBreakdown(selectedVendor.company_name, breakdownMonths);
    // 2026-08-22 · Phase 4 · 폼 리셋 · PaymentEntryForm 의 key={selectedVendor.id} 로 자동 remount → 별도 setter 호출 불필요
  }, [selectedVendor, loadBalance, loadRecentPayments, loadMonthlyBreakdown, loadSalesStockBreakdown, breakdownMonths]);

  // 2026-08-09 · breakdownMonths 변경 시 재조회
  useEffect(() => {
    if (!selectedVendor) return;
    loadSalesStockBreakdown(selectedVendor.company_name, breakdownMonths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownMonths]);

  // ── 필터링·정렬된 공급사 · Task #103 (2026-08-04) ─────────────
  //   필터 · 검색어 + 카테고리
  //   정렬 · sortKey (name/balance/purchase/payment) + sortDir (asc/desc)
  //     · 숫자 컬럼 · 값 없으면 0 취급 (내림차순 시 하단으로)
  //     · 이름 · localeCompare("ko") · 한글 가나다 순
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    const filtered = vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
    const dirMul = sortDir === "asc" ? 1 : -1;
    // 2026-08-09 · 4컬럼 재구성 · 총재고자산·총판매액·총결제액·총잔고
    const getBal = (v: any): number => Number(v?.latestBalance?.balance ?? 0);
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.company_name.localeCompare(b.company_name, "ko"); break;
        case "balance":
          cmp = getBal(a) - getBal(b); break;
        case "payment":
          cmp = (paymentByVendor.get(a.company_name) ?? 0) - (paymentByVendor.get(b.company_name) ?? 0); break;
        case "sales":
          cmp = (salesByVendor.get(a.company_name) ?? 0) - (salesByVendor.get(b.company_name) ?? 0); break;
        case "stockValue":
          cmp = (stockValueByVendor.get(a.company_name) ?? 0) - (stockValueByVendor.get(b.company_name) ?? 0); break;
      }
      if (cmp === 0) return a.company_name.localeCompare(b.company_name, "ko");
      return cmp * dirMul;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, sortKey, sortDir, paymentByVendor, salesByVendor, stockValueByVendor]);

  // ── VAT included 판정 (PaymentEntryForm 에 넘김) ──────────────
  // 2026-08-06 · null 기본 true · 이름 힌트 반영
  // 2026-08-22 · Phase 4 · VAT 계산 · 저장 로직은 PaymentEntryForm 내부로 이관
  const vatIncluded = useMemo(() => {
    if (!selectedVendor) return true;
    if (selectedVendor.vat_included === true) return true;
    if (selectedVendor.vat_included === false) return false;
    const nm = selectedVendor.company_name ?? "";
    return /vat\s*(미포함|별도|없음)/i.test(nm) ? false : true;
  }, [selectedVendor]);

  // 결제 등록 성공 시 부모의 데이터 재로드 (PaymentEntryForm.onSubmitted)
  const handlePaymentSubmitted = useCallback(async (supplierName: string) => {
    await Promise.all([
      loadBalance(supplierName),
      loadRecentPayments(supplierName),
      loadMonthlyBreakdown(supplierName),
    ]);
  }, [loadBalance, loadRecentPayments, loadMonthlyBreakdown]);

  // ═══════════════════════════════════════════════════════════════════
  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 2026-08-21 · 사용자 요청 · 조정 폭 확장 · minWidth 200→220 · maxWidth 400→720 (조정 500px 가능) */}
      <SplitPanel
        storageKey="paymentInfo.leftWidth"
        defaultWidth={280}
        minWidth={220}
        maxWidth={720}
        dividerColor="sky"
        wrapLeft={false}
        wrapRight={false}
        mobileRightAsModal={true}
        mobileModalTitle={selectedVendor?.company_name ?? "결제 정보"}
        mobileOpen={!!selectedVendor}
        onMobileClose={() => setSelectedVendor(null)}
        className="flex-1 min-h-0"
        left={
          /* ── 좌측 · 공급사 리스트 ─────────────────────────────── */
          /* 2026-08-23 · #198 Phase 3C · SplitListPanel v3 (subHeader = KPI) 이관
             · toolbar (search + CategoryChips + PeriodSelector) · header + filters slot
             · KPI 3-inline · subHeader slot
             · VendorListHeader + list · children slot */
          <SplitListPanel
            search={vendorSearch}
            onSearchChange={setVendorSearch}
            searchPlaceholder="공급사명 검색"
            filters={
              <div className="flex flex-col gap-2 w-full">
                <CategoryChips
                  value={vendorCategoryFilter}
                  onChange={(v) => setVendorCategoryFilter(String(v))}
                  size="sm"
                  ariaLabel="공급사 카테고리 필터"
                  options={(["전체", ...dbVendorCategories] as string[]).map(cat => ({
                    value: cat,
                    label: cat,
                    tone: (cat === "전체"   ? "zinc"
                         : cat === "위탁"   ? "violet"
                         : cat === "선결제" ? "rose"
                         : cat === "60회전" ? "emerald"
                         : cat === "90회전" ? "teal"
                         : "zinc") as ChipTone,
                  }))}
                />
                {/* 기간 필터 · PeriodSelector · localStorage megatown_payment_period */}
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
                  <span className="text-[15px] font-bold text-zinc-400 uppercase tracking-wider shrink-0" title="매입·결제 집계 기간">기간</span>
                  <PeriodSelector
                    options={PERIOD_DAYS_PRESET}
                    value={periodDays}
                    onChange={(d) => setPeriodDays(d as PeriodDays)}
                    accent="sky"
                    className="flex-1"
                    ariaLabel="매입·결제 집계 기간"
                  />
                  {aggregatesLoading && (
                    <Spinner size={11} tone="sky" className="shrink-0" />
                  )}
                </div>
              </div>
            }
            subHeader={(() => {
              /* KPI · 총 잔고 · 최근 결제일 · 최근 결제액 · #198 Phase 3C · subHeader 슬롯 */
              const totalBalance = vendors.reduce((s, v) => s + (Number(v.balance ?? 0)), 0);
              let latestDate = "";
              let latestAmount = 0;
              for (const [, v] of latestPaymentByVendor) {
                if (!latestDate || v.date > latestDate) {
                  latestDate = v.date;
                  latestAmount = v.amount;
                }
              }
              const latestDateShort = latestDate && /^\d{4}-\d{2}-\d{2}$/.test(latestDate)
                ? latestDate.slice(2)
                : latestDate || "-";
              return (
                <div className="flex items-center gap-3 px-1 py-0.5 text-[14px] flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="text-zinc-400 font-semibold">총 잔고</span>
                    <span className={`font-bold tabular-nums ${totalBalance > 0 ? "text-amber-700" : totalBalance < 0 ? "text-rose-700" : "text-zinc-400"}`}>
                      {totalBalance === 0 ? "-" : fmtWonShort(Math.abs(totalBalance))}
                    </span>
                  </span>
                  <span className="text-zinc-200 select-none">·</span>
                  <span className="flex items-center gap-1">
                    <span className="text-zinc-400 font-semibold">최근 결제일</span>
                    <span className="font-bold text-zinc-600 tabular-nums">{latestDateShort}</span>
                  </span>
                  <span className="text-zinc-200 select-none">·</span>
                  <span className="flex items-center gap-1">
                    <span className="text-zinc-400 font-semibold">최근 결제액</span>
                    <span className={`font-bold tabular-nums ${latestAmount > 0 ? "text-sky-700" : "text-zinc-400"}`}>
                      {latestAmount > 0 ? fmtWonShort(latestAmount) : "-"}
                    </span>
                  </span>
                </div>
              );
            })()}
            bodyClassName={`${CARD_BASE} flex-1 min-h-0 max-h-[42vh] lg:max-h-none flex flex-col overflow-hidden mt-2`}
          >
            <>
            <VendorListHeader
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              count={filteredVendors.length}
              loading={vendorsLoading || aggregatesLoading || salesLoading}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner tone="zinc" size={13} label="불러오는 중..." labelSize={14} /></div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-10 text-center text-[15px] text-zinc-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {filteredVendors.map(v => {
                  // 2026-08-09 · 4컬럼 재구성 · 총재고자산·총판매액·총결제액·총잔고
                  const lb = (v as any).latestBalance as { balance: number; total_purchase?: number; total_payment?: number; invoice_date?: string | null } | null | undefined;
                  const bal = Number(lb?.balance ?? 0);
                  const hasBal = lb != null && bal !== 0;
                  const payAmt = paymentByVendor.get(v.company_name) ?? 0;
                  const salesAmt = salesByVendor.get(v.company_name) ?? 0;
                  const stockAmt = stockValueByVendor.get(v.company_name) ?? 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVendor(prev => prev?.id === v.id ? null : v)}
                      className={`w-full text-left px-2 py-2.5 flex items-center gap-1.5 transition cursor-pointer ${
                        selectedVendor?.id === v.id
                          ? "bg-sky-50 border-l-2 border-sky-500"
                          : "hover:bg-zinc-50 border-l-2 border-transparent"
                      }`}
                    >
                      <span className="w-[42px] shrink-0"><VendorCategoryBadge category={v.category} /></span>
                      {/* VAT · 텍스트 · 2026-08-06 · 배지 → 깔끔한 텍스트 */}
                      <span className="w-[42px] shrink-0 text-center">
                        {(() => {
                          const nm = v.company_name ?? "";
                          const hint = /vat\s*(미포함|별도|없음)/i.test(nm);
                          const eff = v.vat_included === false ? false : v.vat_included === true ? true : hint ? false : true;
                          return eff
                            ? <span className="text-[14px] font-semibold text-emerald-700">포함</span>
                            : <span className="text-[14px] font-semibold text-zinc-500">별도</span>;
                        })()}
                      </span>
                      <span className={`text-[14px] font-semibold break-words whitespace-normal leading-tight flex-1 min-w-0 ${
                        selectedVendor?.id === v.id ? "text-sky-800" : "text-zinc-700"
                      }`}>
                        {v.company_name}
                      </span>
                      {/* 2026-08-09 · 4컬럼 재구성 (사용자 요청) · 총재고자산·총판매액·총결제액·총잔고 */}
                      <span className={`w-[62px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        stockAmt > 0 ? "text-teal-700" : "text-zinc-300"
                      }`} title={stockAmt > 0 ? `총재고자산 · 최근 3개월 ${stockAmt.toLocaleString()}원` : "재고 없음"}>
                        {stockAmt > 0 ? fmtWonShort(stockAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        salesAmt > 0 ? "text-indigo-700" : "text-zinc-300"
                      }`} title={salesAmt > 0 ? `최근 3개월 총판매 ${salesAmt.toLocaleString()}원` : "판매 없음"}>
                        {salesAmt > 0 ? fmtWonShort(salesAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        payAmt > 0 ? "text-sky-700" : "text-zinc-300"
                      }`} title={payAmt > 0 ? `최근 ${periodDays}일 총결제 ${payAmt.toLocaleString()}원` : "결제 없음"}>
                        {payAmt > 0 ? fmtWonShort(payAmt) : "-"}
                      </span>
                      <span className={`w-[58px] text-right text-[15px] font-bold tabular-nums shrink-0 ${
                        hasBal
                          ? bal > 0 ? "text-amber-700" : "text-rose-700"
                          : "text-zinc-300"
                      }`} title={hasBal ? `${bal > 0 ? "미결제" : "초과결제"} ${Math.abs(bal).toLocaleString()}원` : "잔고 없음"}>
                        {hasBal ? fmtWonShort(Math.abs(bal)) : "-"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
            </>
          </SplitListPanel>
        }
        right={
          /* ── 우측 · 결제 입력 · 최근 결제 ─────────────────────── */
          /* 2026-08-09 · 모바일 모달 세로 스크롤 fix · 우측 컨텐츠 자체 overflow 제거 · SplitPanel 모달바디가 처리
             기존 overflow-y-auto lg:overflow-hidden → nested scroll 로 모달 스크롤 안 됨 */
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 lg:overflow-hidden">
          {!selectedVendor ? (
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Wallet} title="결제 등록 · 공급사를 선택하세요" hint="좌측 공급사 리스트에서 대상 선택 후 결제 정보를 입력합니다" />
            </div>
          ) : (
            <>
              {/* ── 공급사 요약 카드 (T-COMMON-VendorInfo · VendorInfoHeader 위임) ── */}
              <div className="bg-white rounded-2xl border border-line shadow-sm p-4 flex flex-col gap-2.5">
                <VendorInfoHeader
                  vendor={selectedVendor}
                  onEdit={() => openVendorInfo(selectedVendor as any)}
                />

                {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 (MonthlyBreakdownSection · 7행 요약표) */}
                <MonthlyBreakdownSection
                  salesStockBreakdown={salesStockBreakdown}
                  breakdownMonths={breakdownMonths}
                  setBreakdownMonths={setBreakdownMonths}
                  salesStockLoading={salesStockLoading}
                  balanceLoading={balanceLoading}
                />
              </div>

              {/* 결제 입력 + 최근 결제 내역 · 좌우 분할 · 반응형 stack (2026-08-04 · xl 이상만 2열) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">

              {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 (PaymentEntryForm)
                  · key={selectedVendor.id} 로 vendor 변경 시 자동 remount → 폼 상태 리셋 */}
              <PaymentEntryForm
                key={selectedVendor.id}
                selectedVendor={selectedVendor}
                balance={balance}
                vatIncluded={vatIncluded}
                onSubmitted={handlePaymentSubmitted}
              />

              {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 (RecentPaymentsSection) */}
              <RecentPaymentsSection
                recentPayments={recentPayments}
                recentLoading={recentLoading}
                supplierName={selectedVendor?.company_name ?? null}
                onReload={loadRecentPayments}
              />
              </div>{/* 결제입력+최근결제내역 grid wrapper close */}

              {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 (ProductSummarySection) */}
              <ProductSummarySection
                productSummary={productSummary}
                sortedProductSummary={sortedProductSummary}
                showProductGroup={showProductGroup}
                setShowProductGroup={setShowProductGroup}
                prodSortKey={prodSortKey}
                prodSortDir={prodSortDir}
                toggleProdSort={toggleProdSort}
                pw={pw}
                pr={pr}
              />
            </>
          )}
          </div>
        }
      />
    </div>
    {/* 공급사 상세 모달 (T-COMMON-VendorInfoModal) */}
    {vendorModalElement}
    </>
  );
};

// ─── UI Helpers ─────────────────────────────────────────────────────────────
export default PaymentInfoTab;
