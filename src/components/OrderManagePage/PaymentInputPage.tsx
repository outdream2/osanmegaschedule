// src/components/OrderManagePage/PaymentInputPage.tsx
// 2026-08-25 · #111 · 결제입력 페이지 재구성 (사용자 지시 · Option B · 신규 파일 · 회귀 X)
// 2026-10-05 · 사용자 지시 · 레이아웃 3분할 재구성 (상단/하단 → 좌/중/우)
//   · 좌 · SplitListPanel · 공급사 리스트 · 미지급금(balance) desc 정렬 · 검색·분류 필터
//   · 중 · VendorInfoHeader + KPI + PaymentEntryForm (기존 좌 영역)
//   · 우 · SplitRightTabs (발주·매입·판매·결제 · 기존 우 영역)
//   · 미선택 시 · 좌 리스트 + 우측 전체 안내 화면
//   · 병렬 fetch (Promise.allSettled) · order-history · supplier-ledger · top-sales
//   · bulk · /api/supplier-balances-map · 전체 공급사 미지급금 (리스트 정렬·badge)
//   · recharts 사용 (기존 LossHistoryTab 패턴)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Building2, ClipboardList, LineChart as LineChartIcon,
  Package, CircleCheck, TrendingUp, TrendingDown,
} from "lucide-react";
// 2026-10-05 · SupplierSearchInput 제거 (좌측 리스트로 통합) · ReactDOM / useRef / StatusPill unused · 삭제됨
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { useVendors } from "../../hooks/useVendors";
import { matchesSupplierQuery } from "../../lib/supplierMatch";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import { SplitPanel } from "../common/SplitPanel";
import { SplitListPanel } from "../common/SplitListPanel";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { MonthToggleSelector, currentYm } from "../common/MonthToggleSelector";
import { useMonthFilter } from "../../hooks/useMonthFilter";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import { VendorInfoHeader } from "../common/VendorInfoHeader";
import { api } from "../../lib/apiClient";
// 2026-08-25 · #111 · PaymentEntryForm wiring · 결제 등록 폼 실사용
import { PaymentEntryForm } from "./PaymentEntryForm";
import type { VendorItem, BalanceResp } from "./PaymentInfoTab.types";

// 2026-09-02 · #69 · 사용자 지시 · 결제내역 탭 추가 (발주내역·판매내역 옆)
type RightTab = "orders" | "purchases" | "sales" | "payments";

// 2026-09-07 · 사용자 지시 · 매입내역 탭 · purchase_details 원본
interface PurchaseDetailItem {
  id: number;
  purchase_date: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  verify_status?: string | null;
}

interface PaymentHistoryItem {
  id: number;
  payment_date: string;
  amount: number;
  method: string;
  memo: string | null;
  card_id: number | null;
  created_at: string;
}

interface OrderHistoryItem {
  order_number: string;
  order_date: string | null;
  sent_at: string | null;
  supplier: string;
  total_qty: number;
  total_amount: number;
  items: Array<{ product_name: string; order_qty: number; unit_price: number }>;
}

interface SalesItem {
  product_code: string;
  product_name: string;
  supplier?: string | null;
  sale_stock?: number | null;
  total_amount?: number | null;
  buy_stock?: number | null;
  purchase_price?: number | null;
}

interface Balance {
  supplier: string;
  balance: number;
  // 2026-09-11 · #125·#127 · 사용자 지시 · 총 매입 · balance-map.purchase 사용 (order-history · 발주 기반) 대체
  //   · 발주 없이 매입만 있는 상품 (ERP 임포트) · 발주 기반은 0 · 실제 매입 (purchase_details) 기반 사용
  purchase?: number;
  payment?: number;
  cogs?: number;
  stock_asset?: number;
  updated_at?: string | null;
}

// 월 키 YYYY-MM
const monthKey = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (k: string): string => k.slice(2).replace("-", "/"); // "26/08"
const fmtWon = (n: number): string => n > 0 ? n.toLocaleString() + "원" : "-";

// 2026-09-07 · 사용자 지시 · 기간 필터 대응 · 파라미터화
// 2026-10-06 · 사용자 지시 · 월 멀티선택 전환 (STANDARD)
//   · selectedMonths 리스트 그대로 bucket · 비연속 월 유지 (중간 월 자동 포함 X)
//   · 과거→최근 정렬 · bar chart 가독성
function buildMonthBuckets(selectedMonths: string[]): Array<{ key: string; label: string }> {
  const sorted = [...selectedMonths].sort((a, b) => a.localeCompare(b));
  return sorted.map(k => ({ key: k, label: monthLabel(k) }));
}

export const PaymentInputPage: React.FC = () => {
  const { vendors, loading: vendorsLoading } = useVendors();
  const { vendorCategories: dbVendorCategories } = useReferenceValues();
  const { toast, showError } = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 2026-09-02 · 사용자 지시 · 최근결제내역이 첫 탭 · 기본 선택
  const [rightTab, setRightTab] = useState<RightTab>("payments");
  // 2026-10-06 · 사용자 지시 · 월 멀티선택 통일 (STANDARD · useMonthFilter + MonthToggleSelector)
  //   · default · 현재 월 1개 · 비연속 월 지원
  //   · 커스텀 날짜 (customFrom/To) 는 임의 날짜 지정 용도로 유지 (기간 UX 다른 축)
  const { selectedMonths, setSelectedMonths, monthsList: monthsListStr } = useMonthFilter();
  // 2026-09-08 · 사용자 지시 · 커스텀 기간 지정 (from/to 날짜)
  //   · 값 있을 때 · 월 멀티선택 무시 · custom range 우선
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  // 2026-08-26 · P0 fix · 모바일 우측 상세 모달 열림/닫힘 별도 state (기존 rightTab != null 은 항상 true)
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false);

  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
  const [purchaseDetails, setPurchaseDetails] = useState<PurchaseDetailItem[]>([]);
  const [sales, setSales] = useState<SalesItem[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  // 2026-09-02 · #69 · 공급사별 결제 이력 (payments tab)
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // 2026-10-05 · 사용자 지시 · 좌측 리스트 · 공급사 chunk × 30개씩 · progressive load
  //   · GET /api/supplier-balances-map?lite=1&suppliers=A,B,C · lite 모드 (purchase/payment/balance 만 · 빠른 응답)
  //   · 각 chunk 응답 즉시 머지 → 리스트 자동 재정렬 (desc)
  //   · 전체 벤더 수가 많아도 UI 는 vendors 로드 즉시 보임 · balance 는 백그라운드로 채워짐
  const [balancesMap, setBalancesMap] = useState<Record<string, number>>({});
  const [balancesLoadedCount, setBalancesLoadedCount] = useState<number>(0);
  const [balancesTotal, setBalancesTotal] = useState<number>(0);

  useEffect(() => {
    if (vendorsLoading) return;
    if (!vendors || vendors.length === 0) {
      setBalancesTotal(0);
      setBalancesLoadedCount(0);
      return;
    }
    let cancelled = false;
    const uniqueNames = Array.from(new Set(
      vendors.map(v => String(v.company_name ?? "").trim()).filter(n => n.length > 0),
    ));
    setBalancesTotal(uniqueNames.length);
    setBalancesLoadedCount(0);
    const CHUNK = 30;
    (async () => {
      for (let i = 0; i < uniqueNames.length; i += CHUNK) {
        if (cancelled) return;
        const chunk = uniqueNames.slice(i, i + CHUNK);
        const qp = chunk.map(n => encodeURIComponent(n)).join(",");
        try {
          const { data } = await api.get<{ values?: Record<string, { balance?: number }> }>(
            `/api/supplier-balances-map?lite=1&suppliers=${qp}`,
          );
          if (cancelled) return;
          const patch: Record<string, number> = {};
          for (const [name, v] of Object.entries(data?.values ?? {})) {
            patch[String(name).trim()] = Number(v?.balance ?? 0) || 0;
          }
          // 응답에 없는 공급사 (레코드 없음) · 0 (완납) 세팅 · UI 반영
          for (const n of chunk) {
            if (!(n in patch)) patch[n] = 0;
          }
          setBalancesMap(prev => ({ ...prev, ...patch }));
          setBalancesLoadedCount(c => c + chunk.length);
        } catch {
          setBalancesLoadedCount(c => c + chunk.length);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [vendors, vendorsLoading]);

  const balancesMapLoading = balancesTotal > 0 && balancesLoadedCount < balancesTotal;

  // 좌측 리스트 · 분류 + 검색 필터 → 미지급금 desc 정렬 (양수 큰 순 · 0 · 음수 순)
  const sortedVendors = useMemo(() => {
    const q = query.trim();
    const rows = vendors.filter(v => {
      if (q && !matchesSupplierQuery(v, q)) return false;
      if (category !== "전체" && String(v.category ?? "") !== category) return false;
      return true;
    });
    const withBalance = rows.map(v => ({
      v,
      bal: balancesMap[String(v.company_name ?? "").trim()] ?? 0,
    }));
    withBalance.sort((a, b) => b.bal - a.bal);
    return withBalance;
  }, [vendors, query, category, balancesMap]);

  // 2026-10-05 · 사용자 지시 · UI 페이징 · 초기 60개 · 스크롤 하단 접근 시 60개씩 추가
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, category]);
  const visibleVendors = useMemo(() => sortedVendors.slice(0, visibleCount), [sortedVendors, visibleCount]);
  const hasMore = sortedVendors.length > visibleCount;

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  // 병렬 데이터 로드 · order-history + top-sales + balance
  // 2026-09-07 · 사용자 지시 · 우측 탭 기간 필터 (rightPeriodMonths) 반영
  const loadSupplierData = useCallback(async (supplierName: string) => {
    setDataLoading(true);
    setDataError(null);
    setOrderHistory([]); setPurchaseDetails([]); setSales([]); setBalance(null); setPayments([]);
    const supEnc = encodeURIComponent(supplierName);
    // 2026-10-06 · 사용자 지시 · months_list 우선 · customFrom/To 는 days 로 환산 fallback
    //   · customFrom/To 지정 시 · 임의 날짜 범위 (월 멀티 보다 우선)
    //   · 서버 route 는 months_list 수신 시 days 무시
    const periodQs = (() => {
      if (customFrom && customTo) {
        const f = new Date(customFrom + "T00:00:00");
        const t = new Date(customTo + "T23:59:59");
        const diff = Math.max(1, Math.ceil((t.getTime() - f.getTime()) / (24 * 60 * 60 * 1000)));
        return { days: String(diff), months: String(Math.max(1, Math.round(diff / 30))), monthsList: "" };
      }
      // 월 멀티 모드 · min~max days 환산 (fallback 용 · 서버는 months_list 우선 사용)
      const sorted = [...selectedMonths].sort((a, b) => a.localeCompare(b));
      const minYm = sorted[0] ?? currentYm();
      const maxYm = sorted[sorted.length - 1] ?? minYm;
      const [yy, mm] = maxYm.split("-").map(Number);
      const endLast = new Date(yy, mm, 0);
      const [yy0, mm0] = minYm.split("-").map(Number);
      const startFirst = new Date(yy0, mm0 - 1, 1);
      const diffDays = Math.max(1, Math.ceil((endLast.getTime() - startFirst.getTime()) / 86400000) + 1);
      return { days: String(diffDays), months: String(sorted.length), monthsList: monthsListStr };
    })();
    const orderUrl = periodQs.monthsList
      ? `/api/order-history?months_list=${encodeURIComponent(periodQs.monthsList)}&supplier=${supEnc}`
      : `/api/order-history?days=${periodQs.days}&supplier=${supEnc}`;
    const ledgerUrl = periodQs.monthsList
      ? `/api/supplier-ledger?supplier=${supEnc}&months_list=${encodeURIComponent(periodQs.monthsList)}`
      : `/api/supplier-ledger?supplier=${supEnc}&days=${periodQs.days}`;
    const salesUrl = periodQs.monthsList
      ? `/api/stock-manage/top-sales?months_list=${encodeURIComponent(periodQs.monthsList)}&supplier=${supEnc}&sort=sale&dir=desc&limit=200`
      : `/api/stock-manage/top-sales?months=${periodQs.months}&supplier=${supEnc}&sort=sale&dir=desc&limit=200`;
    try {
      // 2026-09-11 · #127 · SSOT 통합 · Option A · supplier-ledger 하나로 · 매입·결제·잔고 정합성 100%
      //   · 이전 · order-history + purchase-details + supplier-balances-map + supplier-payments (4개) · 미스매치 원인
      //   · 지금 · /api/supplier-ledger · 매입 (purchase_details) + 결제 (supplier_payments) UNION · running balance
      //   · 유지 · order-history (발주 도메인 · 별도) · top-sales (판매 도메인 · 별도)
      const [orderRes, ledgerRes, salesRes] = await Promise.allSettled([
        api.get<{ orders?: OrderHistoryItem[] }>(orderUrl),
        api.get<{
          supplier: string;
          rows: Array<{
            type: "purchase" | "payment";
            id: number;
            date: string;
            amount: number;
            method: string | null;
            memo: string | null;
            product_code?: string | null;
            product_name?: string | null;
            quantity?: number;
            unit_price?: number;
            vat_amount: number;
            supply_amount: number;
            tax_invoice_no?: string | null;
            running_balance: number;
          }>;
          total_purchase: number;
          total_purchase_vat: number;
          total_purchase_supply: number;
          total_payment: number;
          total_payment_vat: number;
          total_payment_supply: number;
          current_balance: number;
        }>(ledgerUrl),
        api.get<{ rows?: SalesItem[] }>(salesUrl),
      ]);
      if (orderRes.status === "fulfilled") {
        setOrderHistory(Array.isArray(orderRes.value.data?.orders) ? orderRes.value.data.orders : []);
      }
      if (salesRes.status === "fulfilled") {
        setSales(Array.isArray(salesRes.value.data?.rows) ? salesRes.value.data.rows : []);
      }
      if (ledgerRes.status === "fulfilled") {
        const L = ledgerRes.value.data;
        const trimmed = supplierName.trim();
        // 재고자산 (SSOT · 재고자산 = 매입액 − 판매원가) · sales 로드 후 파생 계산 필요
        //   · 여기선 임시 0 · useMemo(kpi) 에서 totalSaleCogs 로 계산 (기존 로직 유지)
        setBalance({
          supplier: trimmed,
          balance: Number(L?.current_balance ?? 0),
          purchase: Number(L?.total_purchase ?? 0),
          payment: Number(L?.total_payment ?? 0),
          cogs: 0,
          stock_asset: 0,
          updated_at: new Date().toISOString(),
        });
        // rows[type='purchase'] → 우측 매입내역 탭 표시
        const purRows: PurchaseDetailItem[] = (L?.rows ?? [])
          .filter(r => r.type === "purchase")
          .map(r => ({
            id: r.id,
            purchase_date: r.date,
            product_code: r.product_code ?? null,
            product_name: r.product_name ?? r.memo ?? null,
            quantity: Number(r.quantity ?? 0),
            unit_price: Number(r.unit_price ?? 0),
            amount: Number(r.amount ?? 0),
            verify_status: null,
          }));
        setPurchaseDetails(purRows);
        // rows[type='payment'] → 우측 결제내역 탭 표시
        const payRows: PaymentHistoryItem[] = (L?.rows ?? [])
          .filter(r => r.type === "payment")
          .map(r => ({
            id: r.id,
            payment_date: r.date,
            amount: Number(r.amount ?? 0),
            method: String(r.method ?? ""),
            memo: r.memo ?? null,
            card_id: null,
            created_at: r.date,
          }));
        setPayments(payRows);
      } else {
        setBalance({ supplier: supplierName.trim(), balance: 0, purchase: 0, payment: 0, cogs: 0, stock_asset: 0, updated_at: new Date().toISOString() });
        setPurchaseDetails([]);
        setPayments([]);
      }
    } catch (e: any) {
      setDataError(e?.message ?? "네트워크 오류");
      showError(`데이터 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setDataLoading(false);
    }
  }, [showError, selectedMonths, monthsListStr, customFrom, customTo]);

  useEffect(() => {
    if (selected?.company_name) {
      loadSupplierData(String(selected.company_name));
    }
  }, [selected?.company_name, loadSupplierData]);

  // 2026-10-05 · 선택 공급사의 상세 balance 가 갱신되면 · 좌측 리스트 map 즉시 동기화 (결제 등록 후 반영)
  useEffect(() => {
    if (!balance?.supplier) return;
    const name = String(balance.supplier).trim();
    const next = Number(balance.balance ?? 0) || 0;
    setBalancesMap(prev => (prev[name] === next ? prev : { ...prev, [name]: next }));
  }, [balance?.supplier, balance?.balance]);

  // 2026-08-26 · P0 fix · vendor 선택 해제 시 · 모바일 상세 모달 자동 닫기
  useEffect(() => {
    if (!selected) setMobileDetailOpen(false);
  }, [selected]);

  // 2026-10-05 · 사용자 지시 · 좌측 리스트에서 공급사 클릭 즉시 조회 (dropdown 삭제)

  const chipOptions = useMemo(() => (
    (["전체", ...dbVendorCategories] as string[]).map(cat => ({
      value: cat, label: cat,
      tone: (cat === "전체"   ? "zinc"
           : cat === "위탁"   ? "violet"
           : cat === "선결제" ? "rose"
           : cat === "60회전" ? "emerald"
           : cat === "90회전" ? "teal"
           :                    "zinc") as ChipTone,
    }))
  ), [dbVendorCategories]);

  // ─── 집계 · 월별 발주 + 월별 판매 + KPI ───────────────────────────────
  const buckets = useMemo(() => buildMonthBuckets(selectedMonths), [selectedMonths]);

  const monthlyOrders = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const o of orderHistory) {
      const k = monthKey(o.sent_at ?? o.order_date ?? "");
      if (!k) continue;
      const cur = map.get(k) ?? { amount: 0, count: 0 };
      cur.amount += Number(o.total_amount ?? 0);
      cur.count += 1;
      map.set(k, cur);
    }
    return buckets.map(b => ({
      label: b.label,
      금액: map.get(b.key)?.amount ?? 0,
      건수: map.get(b.key)?.count ?? 0,
    }));
  }, [orderHistory, buckets]);

  // 판매내역 · sales row 는 상품 단위 · monthly breakdown 미포함
  //   · 대안 · 상품별 총계 사용 · 상위 top 10 표시
  const topSalesProducts = useMemo(() => {
    return [...sales].sort((a, b) => Number(b.total_amount ?? 0) - Number(a.total_amount ?? 0)).slice(0, 12);
  }, [sales]);

  // 2026-09-11 · 사용자 지시 · 총판매원가·총판매금액 · 별도 표시
  //   · 원가 = SUM(sale_qty × purchase_price) · 대원칙 SSOT
  //   · 판매금액 = SUM(total_amount) or SUM(sale_qty × sale_price)
  const kpi = useMemo(() => {
    const totalOrderAmount = orderHistory.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const totalOrderCount = orderHistory.length;
    const totalSaleAmount = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0);
    const totalSaleQty = sales.reduce((s, x) => s + Number(x.sale_stock ?? 0), 0);
    const totalSaleCogs = sales.reduce((s, x) => {
      const qty = Number(x.sale_stock ?? 0);
      const pp = Number(x.purchase_price ?? 0);
      return s + (qty > 0 && pp > 0 ? qty * pp : 0);
    }, 0);
    return { totalOrderAmount, totalOrderCount, totalSaleAmount, totalSaleQty, totalSaleCogs };
  }, [orderHistory, sales]);

  // ─── UI ─────────────────────────────────────────────────────────────
  const introScreen = (
    <div className="h-full min-h-0 flex items-center justify-center p-6">
      <Card padding="lg" topAccent clip className="w-full max-w-3xl">
        <div className="flex items-center gap-2.5 mb-4">
          <IconTile icon={<Wallet size={16} />} tone="amber" size="md" />
          <div>
            <div className="text-[17px] font-bold text-ink tracking-tight">결제입력</div>
            <div className="text-[15px] text-ink-soft">좌측 공급사 리스트에서 선택하면 즉시 조회됩니다 (미지급금 큰 순)</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-zinc-50/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <Building2 size={16} className="text-sky-600" />
              </div>
              <div className="text-[17px] font-bold text-ink">중앙 · 결제 입력</div>
            </div>
            <ul className="text-[15px] text-ink-soft leading-relaxed pl-1 space-y-1">
              <li>· 공급사 정보 (담당자·연락처·카테고리)</li>
              <li>· 잔고 요약 (미지급 · 선지급 · 완납)</li>
              <li>· 총 매입액 · 총 판매액 KPI</li>
              <li>· 결제 등록 폼</li>
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-zinc-50/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <LineChartIcon size={16} className="text-emerald-600" />
              </div>
              <div className="text-[17px] font-bold text-ink">우측 · 발주·판매내역</div>
            </div>
            <ul className="text-[15px] text-ink-soft leading-relaxed pl-1 space-y-1">
              <li>· 발주내역 · 최근 월별 매입 bar</li>
              <li>· 매입내역 · purchase_details 원본</li>
              <li>· 판매내역 · 상품별 판매량·금액</li>
              <li>· 결제내역 · 공급사별 결제 이력</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[14px] text-ink-soft/70">
          <CircleCheck size={13} className="text-emerald-500" />
          <span>좌측 리스트에서 공급사 클릭 → 중앙·우측 즉시 조회</span>
        </div>
      </Card>
    </div>
  );

  const leftPane = selected ? (
    <div className="flex flex-col gap-3 h-full overflow-auto p-1">
      <VendorInfoHeader vendor={selected as any} />

      {/* KPI 3 카드 · 잔고 · 총 매입 · 총 판매 */}
      {/* 2026-09-11 · 사용자 지시 · 라벨 · 기간 반영
          · 2026-10-06 · 월 멀티선택 · 1개월이면 YYYY-MM · 다수면 N개월 선택 · 커스텀 지정 시 "직접 지정" */}
      {(() => {
        const periodLabel = (customFrom && customTo)
          ? "직접 지정"
          : selectedMonths.length === 1
            ? selectedMonths[0]
            : `${selectedMonths.length}개월 선택`;
        return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card padding="md" topAccent>
          {/* 2026-09-11 · #128·#122 · 사용자 지시 · 잔고 라벨 · 색상 확정 · 기간 반영
              · 미지급 (>0) · 파란색 (sky) · 공급사에 지급할 금액 (아직 결제 안 함)
              · 선지급 (<0) · 붉은색 (rose) · 공급사에 선지급된 금액 (초과 결제 · 위험 표시)
              · 완납 (=0) · emerald
              · 잔고 = 매입액 − 결제액 · SSOT */}
          {(() => {
            const bal = balance?.balance ?? 0;
            const label = bal > 0 ? "미지급" : bal < 0 ? "선지급" : "완납";
            const toneCls = bal > 0 ? "text-sky-700" : bal < 0 ? "text-rose-700" : "text-emerald-700";
            return (
              <>
                <div className="text-[15px] font-bold text-ink-soft uppercase tracking-wider">잔고 · {label} ({periodLabel})</div>
                <div className={`mt-1 text-[22px] font-extrabold tabular-nums leading-none ${toneCls}`}>
                  {Math.abs(bal).toLocaleString()}
                  <span className="text-[15px] font-semibold text-ink-soft ml-1">원</span>
                </div>
                <div className="text-[13px] text-ink-soft/70 mt-1">
                  {bal > 0 ? "공급사에 지급할 금액" : bal < 0 ? "공급사에 선지급된 금액" : "완납 상태"}
                </div>
              </>
            );
          })()}
        </Card>
        <Card padding="md" topAccent>
          {/* 2026-09-11 · #125·#127 · 사용자 지시 · 총 매입 · balance-map.purchase 우선 (실제 매입 · purchase_details 기반)
              · fallback · order-history 합계 (발주 기반 · 이전 로직)
              · 발주 없이 매입만 있는 상품 (ERP 임포트) · balance-map.purchase · 정확 값 */}
          <div className="text-[15px] font-bold text-ink-soft uppercase tracking-wider">총 매입 (전체)</div>
          <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none text-brand-deep">
            {(balance?.purchase ?? kpi.totalOrderAmount).toLocaleString()}
            <span className="text-[15px] font-semibold text-ink-soft ml-1">원</span>
          </div>
          <div className="text-[15px] text-ink-soft/80 mt-1 tabular-nums">
            발주 {kpi.totalOrderCount}건 · 결제 {(balance?.payment ?? 0).toLocaleString()}원
          </div>
        </Card>
        <Card padding="md" topAccent>
          {/* 2026-09-11 · 사용자 지시 · 총판매금액·총판매원가 · 2개 필드 별도 · 명확 강조 */}
          <div className="text-[15px] font-bold text-ink-soft uppercase tracking-wider">총 판매 ({periodLabel})</div>
          <div className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-soft">총판매금액</span>
              <span className="text-[18px] font-extrabold tabular-nums text-emerald-700">
                {kpi.totalSaleAmount.toLocaleString()}<span className="text-[13px] font-semibold text-ink-soft ml-0.5">원</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink-soft">총판매원가</span>
              <span className="text-[18px] font-extrabold tabular-nums text-rose-600">
                {kpi.totalSaleCogs.toLocaleString()}<span className="text-[13px] font-semibold text-ink-soft ml-0.5">원</span>
              </span>
            </div>
          </div>
          <div className="text-[13px] text-ink-soft/70 mt-1.5 tabular-nums">수량 {kpi.totalSaleQty.toLocaleString()}</div>
        </Card>
      </div>
        );
      })()}

      {/* 2026-08-25 · #111 · 결제 등록 폼 · PaymentEntryForm 재사용 (자체 Card + 헤더 포함) */}
      <PaymentEntryForm
        key={selected!.id}
        selectedVendor={selected as unknown as VendorItem}
        balance={balance ? ({
          supplier: balance.supplier,
          total_purchase: 0,
          total_payment: 0,
          balance: balance.balance,
          purchase_count: 0,
          payment_count: 0,
        } as BalanceResp) : null}
        vatIncluded={Boolean((selected as any)?.vat_included)}
        onSubmitted={(supplierName) => { loadSupplierData(supplierName); }}
      />
    </div>
  ) : null;

  const rightPane = selected ? (
    <div className="flex flex-col gap-3 h-full overflow-auto p-1">
      {/* 2026-09-07 · 사용자 지시 · 우측 탭 공통 기간 필터 · 탭 상단 배치 */}
      {/* 2026-09-08 · 사용자 지시 · 프리셋 옆에 커스텀 기간 (from/to) 지정 */}
      <div className="flex items-center gap-2 px-1 flex-wrap">
        <span className="text-[14px] font-semibold text-ink-soft shrink-0">기간</span>
        {/* 2026-10-06 · 월 멀티선택 통일 (매입이력 STANDARD) · 비연속 월 지원 */}
        <MonthToggleSelector
          selectedMonths={selectedMonths}
          onChange={(months) => { setSelectedMonths(months); setCustomFrom(""); setCustomTo(""); }}
          maxMonths={6}
          minOne
          ariaLabel="우측 탭 기간 선택"
        />
        {selectedMonths.length > 0 && !customFrom && !customTo && (
          <span className="text-[13px] text-ink-soft tabular-nums">{selectedMonths.length}개월 선택</span>
        )}
        <span className="text-zinc-300 text-[13px]">|</span>
        <span className="text-[13px] font-medium text-ink-soft">직접 지정</span>
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="h-8 px-2 text-[13px] border border-line rounded-md bg-white tabular-nums focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
          title="시작일"
        />
        <span className="text-zinc-400 text-[13px]">~</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="h-8 px-2 text-[13px] border border-line rounded-md bg-white tabular-nums focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
          title="종료일"
        />
        {(customFrom || customTo) && (
          <button
            type="button"
            onClick={() => { setCustomFrom(""); setCustomTo(""); }}
            className="h-8 px-2 text-[13px] text-zinc-500 hover:text-ink border border-line rounded-md hover:bg-zinc-50 cursor-pointer transition"
            title="커스텀 기간 초기화"
          >
            ✕
          </button>
        )}
      </div>
      {/* 2026-09-02 · 사용자 지시 · 최근결제내역 · 발주내역 앞 · 배지 (*건 · *상품) 제거 · 폰트 +2 */}
      <SplitRightTabs
        tabs={[
          { key: "payments",  label: "최근결제내역" },
          { key: "orders",    label: "발주내역" },
          { key: "purchases", label: "매입내역" },
          { key: "sales",     label: "판매내역" },
        ]}
        active={rightTab}
        onSelect={(k) => setRightTab(k as RightTab)}
      />

      {dataLoading && orderHistory.length === 0 && sales.length === 0 ? (
        <Card padding="md" className="flex items-center justify-center py-12">
          <Spinner size={16} tone="brand" label="공급사 데이터 로딩 중..." labelSize={14} />
        </Card>
      ) : rightTab === "orders" ? (
        <>
          <Card padding="md" topAccent>
            <div className="flex items-center gap-2 mb-2">
              <IconTile icon={<ClipboardList size={14} />} tone="brand" size="sm" />
              <div className="text-[17px] font-bold text-ink">발주내역 · 월별 매입 금액</div>
              <div className="ml-auto flex items-center gap-1.5 text-[14px] text-ink-soft">
                <TrendingUp size={12} className="text-brand-deep" /> 최근 12개월
              </div>
            </div>
            {monthlyOrders.every(m => m.금액 === 0) ? (
              <EmptyState icon={ClipboardList} title="발주 이력 없음" hint={`${selected.company_name} · 최근 12개월 발주 데이터 없음`} size="normal" />
            ) : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlyOrders} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)} />
                    <Tooltip formatter={(v: any, n: string) => n === "금액" ? [`${Number(v).toLocaleString()}원`, "금액"] : [v, n]} />
                    <Bar dataKey="금액" fill="#0A2E4A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* 최근 발주 리스트 (10건) */}
          {orderHistory.length > 0 && (
            <Card padding="md" topAccent>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[16px] font-bold text-ink">최근 발주 · Top 10</div>
                <div className="ml-auto text-[14px] text-ink-soft tabular-nums">{orderHistory.length}건 중 10건</div>
              </div>
              <ul className="divide-y divide-zinc-100">
                {orderHistory.slice(0, 10).map(o => (
                  <li key={o.order_number} className="flex items-center gap-2 py-2 text-[15px]">
                    <span className="text-zinc-400 tabular-nums shrink-0">{String(o.sent_at ?? o.order_date ?? "").slice(0, 10)}</span>
                    <span className="text-zinc-500 shrink-0 tabular-nums text-[14px]">#{o.order_number}</span>
                    <span className="ml-auto text-brand-deep font-bold tabular-nums">{fmtWon(o.total_amount)}</span>
                    <span className="text-[14px] text-zinc-400 tabular-nums shrink-0">{o.items.length}종 · {o.total_qty}개</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : rightTab === "purchases" ? (
        // 2026-09-07 · 사용자 지시 · 매입내역 · purchase_details 원본 · 월별 집계 + 최근 리스트
        (() => {
          // 월별 집계
          const buckets = buildMonthBuckets(selectedMonths);
          const monthMap = new Map<string, number>();
          const monthQtyMap = new Map<string, number>();
          for (const b of buckets) { monthMap.set(b.key, 0); monthQtyMap.set(b.key, 0); }
          let totalAmount = 0;
          let totalQty = 0;
          for (const r of purchaseDetails) {
            const k = monthKey(r.purchase_date);
            if (!k) continue;
            const amt = Number(r.amount ?? 0) || 0;
            const qty = Number(r.quantity ?? 0) || 0;
            totalAmount += amt; totalQty += qty;
            if (monthMap.has(k)) { monthMap.set(k, (monthMap.get(k) ?? 0) + amt); monthQtyMap.set(k, (monthQtyMap.get(k) ?? 0) + qty); }
          }
          const monthlyPurchases = buckets.map(b => ({ month: b.label, 금액: monthMap.get(b.key) ?? 0, 수량: monthQtyMap.get(b.key) ?? 0 }));
          const recent = [...purchaseDetails].sort((a, b) => String(b.purchase_date ?? "").localeCompare(String(a.purchase_date ?? ""))).slice(0, 10);
          return (
            <>
              <Card padding="md" topAccent>
                <div className="flex items-center gap-2 mb-2">
                  <IconTile icon={<ClipboardList size={14} />} tone="teal" size="sm" />
                  <div className="text-[17px] font-bold text-ink">매입내역 · 월별 금액</div>
                  <div className="ml-auto flex items-center gap-1.5 text-[14px] text-ink-soft">
                    <TrendingUp size={12} className="text-teal-600" /> 최근 12개월 · 총 {fmtWon(totalAmount)} · {totalQty.toLocaleString()}개
                  </div>
                </div>
                {monthlyPurchases.every(m => m.금액 === 0) ? (
                  <EmptyState icon={ClipboardList} title="매입 이력 없음" hint={`${selected.company_name} · 최근 12개월 매입 데이터 없음`} size="normal" />
                ) : (
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={monthlyPurchases} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" fontSize={11} stroke="#94a3b8" />
                        <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)} />
                        <Tooltip formatter={(v: any, n: string) => n === "금액" ? [`${Number(v).toLocaleString()}원`, "금액"] : [v, n]} />
                        <Bar dataKey="금액" fill="#0F766E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {recent.length > 0 && (
                <Card padding="md" topAccent>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-[16px] font-bold text-ink">최근 매입 · Top 10</div>
                    <div className="ml-auto text-[14px] text-ink-soft tabular-nums">{purchaseDetails.length}건 중 10건</div>
                  </div>
                  <ul className="divide-y divide-zinc-100">
                    {recent.map(r => (
                      <li key={r.id} className="flex items-center gap-2 py-2 text-[15px]">
                        <span className="text-zinc-400 tabular-nums shrink-0">{String(r.purchase_date ?? "").slice(0, 10)}</span>
                        <span className="text-ink font-semibold truncate min-w-0 flex-1">{r.product_name ?? "-"}</span>
                        <span className="text-zinc-500 tabular-nums text-[14px] shrink-0">{Number(r.quantity).toLocaleString()}개</span>
                        <span className="text-teal-700 font-bold tabular-nums shrink-0">{fmtWon(Number(r.amount ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          );
        })()
      ) : rightTab === "sales" ? (
        <>
          <Card padding="md" topAccent>
            <div className="flex items-center gap-2 mb-2">
              <IconTile icon={<Package size={14} />} tone="emerald" size="sm" />
              <div className="text-[17px] font-bold text-ink">판매내역 · 상품별 (Top 12)</div>
              <div className="ml-auto flex items-center gap-1.5 text-[14px] text-ink-soft">
                <TrendingDown size={12} className="text-emerald-600" /> 최근 12개월
              </div>
            </div>
            {topSalesProducts.length === 0 ? (
              <EmptyState icon={Package} title="판매 이력 없음" hint={`${selected.company_name} · 공급 상품 판매 데이터 없음`} size="normal" />
            ) : (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={topSalesProducts.map(p => ({
                      name: (p.product_name ?? "").slice(0, 8),
                      판매금액: Number(p.total_amount ?? 0),
                      판매수량: Number(p.sale_stock ?? 0),
                    }))}
                    margin={{ top: 8, right: 10, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={10} stroke="#94a3b8" />
                    <YAxis yAxisId="left"  fontSize={11} stroke="#94a3b8" tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#94a3b8" />
                    <Tooltip formatter={(v: any, n: string) => n === "판매금액" ? [`${Number(v).toLocaleString()}원`, n] : [Number(v).toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left"  type="monotone" dataKey="판매금액" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="판매수량" stroke="#0369a1" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* 상품별 판매 · 리스트 */}
          {topSalesProducts.length > 0 && (
            <Card padding="md" topAccent>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[18px] font-bold text-ink">상품별 · 판매 상위 12</div>
              </div>
              <ul className="divide-y divide-zinc-100">
                {topSalesProducts.map(p => (
                  <li key={p.product_code} className="flex items-center gap-2 py-2 text-[17px]">
                    <span className="text-zinc-500 shrink-0 font-mono text-[15px] w-24 truncate">{p.product_code}</span>
                    <span className="text-ink font-bold truncate flex-1 min-w-0">{p.product_name}</span>
                    <span className="text-[16px] text-zinc-400 tabular-nums shrink-0">{Number(p.sale_stock ?? 0).toLocaleString()}개</span>
                    <span className="text-emerald-700 font-bold tabular-nums shrink-0">{fmtWon(Number(p.total_amount ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}

      {/* 2026-09-02 · #69 · 사용자 지시 · 최근 결제내역 탭 · 공급사별 결제 리스트 · KPI · 첫 탭 */}
      {!dataLoading && rightTab === "payments" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card padding="md" topAccent>
              <div className="text-[17px] text-zinc-500 font-semibold">총 결제 건수</div>
              <div className="text-[24px] font-extrabold text-brand-deep tabular-nums mt-1">{payments.length.toLocaleString()}건</div>
            </Card>
            <Card padding="md" topAccent>
              <div className="text-[17px] text-zinc-500 font-semibold">총 결제 금액</div>
              <div className="text-[24px] font-extrabold text-emerald-700 tabular-nums mt-1">
                {fmtWon(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))}
              </div>
            </Card>
            <Card padding="md" topAccent>
              <div className="text-[17px] text-zinc-500 font-semibold">최근 결제일</div>
              <div className="text-[20px] font-bold text-ink tabular-nums mt-1">
                {payments[0]?.payment_date ?? "-"}
              </div>
            </Card>
          </div>

          <Card padding="md" topAccent>
            <div className="flex items-center gap-2 mb-2">
              <IconTile icon={<Wallet size={14} />} tone="amber" size="sm" />
              <div className="text-[17px] font-bold text-ink">공급사별 결제 이력</div>
              <div className="ml-auto text-[16px] text-ink-soft tabular-nums">{payments.length}건</div>
            </div>
            {payments.length === 0 ? (
              <EmptyState icon={Wallet} title="결제 이력 없음" hint={`${selected.company_name} · 결제 등록 후 여기 표시`} size="normal" />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {payments.slice(0, 30).map(p => (
                  <li key={p.id} className="flex items-center gap-2 py-2.5 text-[17px]">
                    <span className="text-zinc-500 tabular-nums shrink-0 w-24">{String(p.payment_date).slice(0, 10)}</span>
                    <span className={`text-[16px] font-semibold px-2 py-0.5 rounded-lg shrink-0 ${
                      p.method === "card" ? "bg-blue-50 text-blue-700"
                      : p.method === "transfer" ? "bg-sky-50 text-sky-700"
                      : p.method === "cash" ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                    }`}>
                      {p.method === "card" ? "카드" : p.method === "transfer" ? "이체" : p.method === "cash" ? "현금" : p.method === "check" ? "수표" : "기타"}
                    </span>
                    {p.card_id && <span className="text-[15px] text-blue-600 font-semibold shrink-0">#카드{p.card_id}</span>}
                    <span className="ml-auto text-brand-deep font-bold tabular-nums">{fmtWon(Number(p.amount) || 0)}</span>
                  </li>
                ))}
                {payments.length > 30 && (
                  <li className="py-2 text-center text-[15px] text-zinc-400">
                    · 외 {payments.length - 30}건 · 최근 30건 표시
                  </li>
                )}
              </ul>
            )}
          </Card>
        </>
      )}

      {dataError && (
        <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700">
          ⚠ {dataError}
          <button type="button" onClick={() => selected?.company_name && loadSupplierData(String(selected.company_name))} className="ml-2 underline cursor-pointer">다시 시도</button>
        </Card>
      )}
    </div>
  ) : null;

  // 2026-10-05 · 좌측 공급사 리스트 아이템 렌더링 · 미지급금 색상 (양수=sky · 음수=rose · 0=emerald)
  const renderVendorRow = (v: VendorItem, bal: number): React.ReactNode => {
    const isActive = v.id === selectedId;
    const name = String(v.company_name ?? "");
    const cat = String(v.category ?? "").trim();
    const absBal = Math.abs(bal);
    const balLabel = bal > 0 ? "미지급" : bal < 0 ? "선지급" : "완납";
    const balTone =
      bal > 0 ? "text-sky-700" :
      bal < 0 ? "text-rose-700" :
                "text-emerald-700";
    const shown = displayVendorName(name) || name;
    return (
      <button
        key={v.id}
        type="button"
        onClick={() => { setSelectedId(v.id); setMobileDetailOpen(true); }}
        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
          isActive
            ? "bg-brand-tint/60 border-brand-deep/40 ring-1 ring-brand-deep/20"
            : "bg-white border-line hover:border-brand-deep/30 hover:bg-brand-tint/20"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink leading-tight break-keep">{shown}</div>
            {cat && <div className="mt-0.5 text-[13px] text-ink-soft">{cat}</div>}
          </div>
          <div className="text-right shrink-0">
            <div className={`text-[15px] font-extrabold tabular-nums leading-none ${balTone}`}>
              {absBal > 0 ? absBal.toLocaleString() : "-"}
              {absBal > 0 && <span className="text-[11px] font-semibold text-ink-soft ml-0.5">원</span>}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink-soft">{balLabel}</div>
          </div>
        </div>
      </button>
    );
  };

  // 좌측 리스트 패널 (SplitListPanel · 검색 + 분류 chips + 미지급금 desc 리스트)
  const leftListPanel = (
    <SplitListPanel
      title={
        <span className="inline-flex items-center gap-2">
          <IconTile icon={<Wallet size={14} />} tone="amber" size="sm" />
          <span>결제입력 · 공급사</span>
        </span>
      }
      count={sortedVendors.length}
      search={query}
      onSearchChange={setQuery}
      searchPlaceholder="공급사명·담당자 검색"
      filters={
        <CategoryChips
          value={category}
          onChange={(v) => setCategory(String(v))}
          options={chipOptions}
          size="sm"
          ariaLabel="공급사 분류 필터"
        />
      }
      loading={vendorsLoading}
      empty={!vendorsLoading && sortedVendors.length === 0}
      emptyText="조건에 맞는 공급사가 없습니다"
      emptyIcon={Building2}
      topAccent
      bodyClassName="flex-1 min-h-0 overflow-y-auto p-2"
      countDisplay={
        balancesMapLoading
          ? <span className="text-[12px] font-semibold text-ink-soft tabular-nums">{sortedVendors.length} · 잔고 {balancesLoadedCount}/{balancesTotal}</span>
          : <span className="text-[12px] font-semibold text-ink-soft tabular-nums">{sortedVendors.length}</span>
      }
    >
      <div className="flex flex-col gap-1.5">
        {visibleVendors.map(({ v, bal }) => renderVendorRow(v, bal))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="mt-1 w-full h-9 rounded-lg bg-white border border-line text-[14px] font-bold text-ink-soft hover:border-brand-deep/40 hover:text-brand-deep transition cursor-pointer"
          >
            더 보기 · {sortedVendors.length - visibleCount}개 남음
          </button>
        )}
      </div>
    </SplitListPanel>
  );

  // 우측 영역 (중 결제입력 + 우 발주·판매내역) · 선택 시 SplitPanel · 미선택 시 introScreen
  const rightArea = selected ? (
    <SplitPanel
      storageKey="paymentInput.midWidth"
      defaultWidth={typeof window !== "undefined" ? Math.max(360, Math.min(560, Math.floor(window.innerWidth * 0.32))) : 440}
      minWidth={300}
      maxWidth={720}
      dividerColor="amber"
      left={leftPane}
      right={rightPane}
      wrapLeft={false}
      wrapRight={false}
      mobileRightAsModal
      mobileModalTitle={selected.company_name ?? "발주·판매내역"}
      mobileOpen={mobileDetailOpen}
      onMobileClose={() => setMobileDetailOpen(false)}
      className="h-full"
    />
  ) : introScreen;

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="h-full min-h-0">
        {/* 2026-10-05 · 사용자 지시 · 3분할 레이아웃 (좌 공급사 리스트 · 중 결제입력 · 우 발주·판매내역)
            SplitPanel 중첩 · 외곽은 좌(리스트) vs 우(중+우) · 내부는 중 vs 우 */}
        <SplitPanel
          storageKey="paymentInput.listWidth"
          defaultWidth={320}
          minWidth={260}
          maxWidth={440}
          dividerColor="amber"
          left={leftListPanel}
          right={rightArea}
          wrapLeft={false}
          wrapRight={false}
          className="h-full"
        />
      </div>
    </>
  );
};

export default PaymentInputPage;
