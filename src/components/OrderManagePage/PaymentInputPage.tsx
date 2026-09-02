// src/components/OrderManagePage/PaymentInputPage.tsx
// 2026-08-25 · #111 · 결제입력 페이지 재구성 (사용자 지시 · Option B · 신규 파일 · 회귀 X)
//   · 상단 · 검색(공급사 autocomplete) + 필터(분류)
//   · 미선택 시 · 하단 전체 · 안내 화면
//   · 리스트 선택 즉시 · SplitPanel (2026-08-25 · [확인] 버튼 제거 · 즉시 조회 UX)
//     · 좌 · VendorInfoHeader + 결제 요약 KPI + 결제 등록 안내
//     · 우 · SplitRightTabs (발주내역 · 판매내역 월별)
//         · 발주내역 · order-history 데이터 · 월별 bar chart + 최근 발주 리스트
//         · 판매내역 · top-sales 데이터 · 월별 line + 상품별 최근 판매
//   · 병렬 fetch (Promise.all) · order-history · top-sales · supplier-balance
//   · recharts 사용 (기존 LossHistoryTab 패턴)

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Wallet, Building2, ClipboardList, LineChart as LineChartIcon,
  Package, CircleCheck, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { useVendors } from "../../hooks/useVendors";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import { SplitPanel } from "../common/SplitPanel";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import { VendorInfoHeader } from "../common/VendorInfoHeader";
import { api } from "../../lib/apiClient";
// 2026-08-25 · #111 · PaymentEntryForm wiring · 결제 등록 폼 실사용
import { PaymentEntryForm } from "./PaymentEntryForm";
import type { VendorItem, BalanceResp } from "./PaymentInfoTab.types";

// 2026-09-02 · #69 · 사용자 지시 · 결제내역 탭 추가 (발주내역·판매내역 옆)
type RightTab = "orders" | "sales" | "payments";

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
  sale_qty?: number | null;
  total_amount?: number | null;
  purchase_qty?: number | null;
  purchase_price?: number | null;
}

interface Balance {
  supplier: string;
  balance: number;
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

// 최근 12개월 · 빈 달 0 채움
function build12MonthBuckets(): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const now = new Date();
  now.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key: k, label: monthLabel(k) });
  }
  return out;
}

export const PaymentInputPage: React.FC = () => {
  const { vendors, loading: vendorsLoading } = useVendors();
  const { vendorCategories: dbVendorCategories } = useReferenceValues();
  const { toast, showError } = useToast();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("orders");
  // 2026-08-26 · P0 fix · 모바일 우측 상세 모달 열림/닫힘 별도 state (기존 rightTab != null 은 항상 true)
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
  const [sales, setSales] = useState<SalesItem[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  // 2026-09-02 · #69 · 공급사별 결제 이력 (payments tab)
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !String(v.company_name ?? "").toLowerCase().includes(q)) return false;
      if (category !== "전체" && String(v.category ?? "") !== category) return false;
      return true;
    }).slice(0, 20);
  }, [vendors, query, category]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  // 병렬 데이터 로드 · order-history + top-sales + balance
  const loadSupplierData = useCallback(async (supplierName: string) => {
    setDataLoading(true);
    setDataError(null);
    setOrderHistory([]); setSales([]); setBalance(null); setPayments([]);
    const supEnc = encodeURIComponent(supplierName);
    try {
      const [orderRes, salesRes, balRes, payRes] = await Promise.allSettled([
        api.get<{ orders?: OrderHistoryItem[] }>(`/api/order-history?days=365&supplier=${supEnc}`),
        api.get<{ rows?: SalesItem[] }>(`/api/stock-manage/top-sales?months=12&supplier=${supEnc}&sort=sale&dir=desc&limit=200`),
        api.get<any>(`/api/supplier-balances`),
        // 2026-09-02 · #69 · 공급사별 결제 이력
        api.get<{ rows?: PaymentHistoryItem[] }>(`/api/supplier-payments?supplier=${supEnc}&days=3650`),
      ]);
      if (orderRes.status === "fulfilled") {
        setOrderHistory(Array.isArray(orderRes.value.data?.orders) ? orderRes.value.data.orders : []);
      }
      if (salesRes.status === "fulfilled") {
        setSales(Array.isArray(salesRes.value.data?.rows) ? salesRes.value.data.rows : []);
      }
      if (balRes.status === "fulfilled") {
        const list = Array.isArray(balRes.value.data) ? balRes.value.data : (balRes.value.data?.rows ?? []);
        const hit = list.find((b: any) => String(b.supplier ?? "").trim() === supplierName.trim());
        if (hit) setBalance({ supplier: hit.supplier, balance: Number(hit.balance ?? 0), updated_at: hit.updated_at });
      }
      if (payRes.status === "fulfilled") {
        setPayments(Array.isArray(payRes.value.data?.rows) ? payRes.value.data.rows : []);
      }
    } catch (e: any) {
      setDataError(e?.message ?? "네트워크 오류");
      showError(`데이터 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setDataLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (selected?.company_name) {
      loadSupplierData(String(selected.company_name));
    }
  }, [selected?.company_name, loadSupplierData]);

  // 2026-08-26 · P0 fix · vendor 선택 해제 시 · 모바일 상세 모달 자동 닫기
  useEffect(() => {
    if (!selected) setMobileDetailOpen(false);
  }, [selected]);

  // 2026-08-25 · 사용자 지시 · [확인] 버튼 제거 · 리스트 선택 즉시 조회
  // Enter 키 · 첫 매치 즉시 선택 (implicit confirm)
  const selectFirstMatch = () => {
    if (!query.trim()) return;
    const exact = vendors.find(v => String(v.company_name ?? "").trim() === query.trim());
    const first = exact ?? filtered[0];
    if (!first) { showError("일치하는 공급사가 없습니다"); return; }
    setSelectedId(first.id);
    setQuery(String(first.company_name ?? ""));
    setDropdownOpen(false);
  };

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
  const buckets = useMemo(() => build12MonthBuckets(), []);

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

  const kpi = useMemo(() => {
    const totalOrderAmount = orderHistory.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const totalOrderCount = orderHistory.length;
    const totalSaleAmount = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0);
    const totalSaleQty = sales.reduce((s, x) => s + Number(x.sale_qty ?? 0), 0);
    return { totalOrderAmount, totalOrderCount, totalSaleAmount, totalSaleQty };
  }, [orderHistory, sales]);

  // ─── UI ─────────────────────────────────────────────────────────────
  const introScreen = (
    <div className="flex-1 min-h-0 flex items-center justify-center p-6">
      <Card padding="lg" topAccent clip className="w-full max-w-3xl">
        <div className="flex items-center gap-2.5 mb-4">
          <IconTile icon={<Wallet size={16} />} tone="amber" size="md" />
          <div>
            <div className="text-[17px] font-bold text-ink tracking-tight">결제입력</div>
            <div className="text-[15px] text-ink-soft">공급사를 검색하고 리스트에서 선택하면 즉시 조회됩니다</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-zinc-50/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                <Building2 size={16} className="text-sky-600" />
              </div>
              <div className="text-[17px] font-bold text-ink">좌측 · 결제 정보</div>
            </div>
            <ul className="text-[15px] text-ink-soft leading-relaxed pl-1 space-y-1">
              <li>· 공급사 정보 (담당자·연락처·카테고리)</li>
              <li>· 잔고 요약 (미결제 금액)</li>
              <li>· 총 매입액 · 총 판매액 KPI</li>
              <li>· 결제 등록 안내</li>
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
              <li>· 발주내역 · 최근 12개월 월별 매입 bar</li>
              <li>· 판매내역 · 상품별 판매량·금액 line</li>
              <li>· 최근 발주 리스트</li>
              <li>· KPI · 총 매입·판매·잔고</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[14px] text-ink-soft/70">
          <CircleCheck size={13} className="text-emerald-500" />
          <span>상단 검색창에 공급사명 입력 → 리스트 클릭 시 즉시 조회</span>
        </div>
      </Card>
    </div>
  );

  const leftPane = selected ? (
    <div className="flex flex-col gap-3 h-full overflow-auto p-1">
      <VendorInfoHeader vendor={selected as any} />

      {/* KPI 3 카드 · 잔고 · 총 매입 · 총 판매 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card padding="md" topAccent>
          <div className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">잔고 (미결제)</div>
          <div className={`mt-1 text-[22px] font-extrabold tabular-nums leading-none ${balance && balance.balance > 0 ? "text-rose-700" : "text-emerald-700"}`}>
            {balance ? balance.balance.toLocaleString() : "0"}
            <span className="text-[15px] font-semibold text-ink-soft ml-1">원</span>
          </div>
        </Card>
        <Card padding="md" topAccent>
          <div className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">총 매입 (12개월)</div>
          <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none text-brand-deep">
            {kpi.totalOrderAmount.toLocaleString()}
            <span className="text-[15px] font-semibold text-ink-soft ml-1">원</span>
          </div>
          <div className="text-[13px] text-ink-soft/80 mt-1 tabular-nums">발주 {kpi.totalOrderCount}건</div>
        </Card>
        <Card padding="md" topAccent>
          <div className="text-[13px] font-bold text-ink-soft uppercase tracking-wider">총 판매 (12개월)</div>
          <div className="mt-1 text-[22px] font-extrabold tabular-nums leading-none text-emerald-700">
            {kpi.totalSaleAmount.toLocaleString()}
            <span className="text-[15px] font-semibold text-ink-soft ml-1">원</span>
          </div>
          <div className="text-[13px] text-ink-soft/80 mt-1 tabular-nums">수량 {kpi.totalSaleQty.toLocaleString()}</div>
        </Card>
      </div>

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
      {/* 2026-09-02 · 사용자 지시 · 배지 (*건 · *상품) 제거 · 결제내역 탭 추가 · 폰트 +2 */}
      <SplitRightTabs
        tabs={[
          { key: "orders",   label: "발주내역" },
          { key: "sales",    label: "판매내역" },
          { key: "payments", label: "결제내역" },
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
      ) : (
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
                      판매수량: Number(p.sale_qty ?? 0),
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
                    <span className="text-[16px] text-zinc-400 tabular-nums shrink-0">{Number(p.sale_qty ?? 0).toLocaleString()}개</span>
                    <span className="text-emerald-700 font-bold tabular-nums shrink-0">{fmtWon(Number(p.total_amount ?? 0))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* 2026-09-02 · #69 · 사용자 지시 · 결제내역 탭 · 공급사별 결제 리스트 · KPI */}
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

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-3 h-full min-h-0">
        {/* 상단 · 검색 + 필터 · 2026-08-26 · clip 제거 (dropdown 잘림 fix) · z-40 dropdown */}
        <Card padding="md" topAccent className="relative z-30">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <IconTile icon={<Wallet size={15} />} tone="amber" size="md" />
              <div className="min-w-0">
                <div className="text-[18px] font-bold text-ink leading-tight tracking-tight">결제입력</div>
                <div className="text-[14px] text-ink-soft leading-tight mt-0.5">공급사 검색 → 리스트 선택 즉시 · 결제 정보 · 발주·판매내역 조회</div>
              </div>
              {selected && (
                <StatusPill tone="emerald" size="sm" dot>선택 · {selected.company_name}</StatusPill>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setQuery(""); setDropdownOpen(false); }}
                  className="ml-auto inline-flex items-center h-8 px-3 rounded-lg bg-white border border-line text-[15px] font-bold text-ink-soft hover:border-brand-deep/40 hover:text-brand-deep transition cursor-pointer"
                  title="다른 공급사 검색"
                >
                  초기화
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SupplierSearchInput
                query={query}
                setQuery={setQuery}
                dropdownOpen={dropdownOpen}
                setDropdownOpen={setDropdownOpen}
                filtered={filtered}
                onSelect={(v) => { setSelectedId(v.id); setQuery(String(v.company_name ?? "")); setDropdownOpen(false); }}
                selectFirstMatch={selectFirstMatch}
              />
              <CategoryChips
                value={category}
                onChange={(v) => setCategory(String(v))}
                options={chipOptions}
                size="sm"
                ariaLabel="공급사 분류 필터"
              />
            </div>
          </div>
        </Card>

        {selected ? (
          <SplitPanel
            storageKey="paymentInput.leftWidth"
            defaultWidth={typeof window !== "undefined" ? Math.max(380, Math.min(600, Math.floor(window.innerWidth * 0.38))) : 460}
            minWidth={300}
            maxWidth={800}
            dividerColor="amber"
            left={leftPane}
            right={rightPane}
            wrapLeft={false}
            wrapRight={false}
            mobileRightAsModal
            mobileModalTitle={selected.company_name ?? "발주·판매내역"}
            mobileOpen={mobileDetailOpen}
            onMobileClose={() => setMobileDetailOpen(false)}
            className="flex-1 min-h-0"
          />
        ) : (
          introScreen
        )}
      </div>
    </>
  );
};

export default PaymentInputPage;

// -----------------------------------------------------------------------------
// 공급사 검색 · Portal 드롭다운
//   · 부모 overflow / sticky / 반응형 wrap 영향 X
//   · 화면 하단 공간 부족 시 · 위로 flip
// -----------------------------------------------------------------------------
interface SupplierSearchInputProps {
  query: string;
  setQuery: (v: string) => void;
  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  filtered: VendorItem[];
  onSelect: (v: VendorItem) => void;
  selectFirstMatch: () => void;
}

const SupplierSearchInput: React.FC<SupplierSearchInputProps> = ({
  query, setQuery, dropdownOpen, setDropdownOpen, filtered, onSelect, selectFirstMatch,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);

  const open = dropdownOpen && !!query.trim() && filtered.length > 0;

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      const maxListH = 224; // max-h-56
      const flip = spaceBelow < maxListH + 8 && spaceAbove > spaceBelow;
      setPos({
        top: flip ? Math.max(8, r.top - maxListH - 6) : r.bottom + 4,
        left: r.left,
        width: r.width,
        flip,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const dd = document.getElementById("supplier-search-portal-dd");
      if (dd?.contains(t)) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, setDropdownOpen]);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[220px] max-w-md">
      <Building2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
        onFocus={() => setDropdownOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); selectFirstMatch(); }
          if (e.key === "Escape") setDropdownOpen(false);
        }}
        placeholder="공급사명 검색 · 리스트 클릭 즉시 조회 (Enter · 첫 매치)"
        className="w-full h-10 pl-8 pr-3 rounded-lg border border-line bg-white text-[16px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
      />
      {open && pos && ReactDOM.createPortal(
        <div
          id="supplier-search-portal-dd"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
        >
          <Card padding="none" rounded="lg" className="shadow-2xl max-h-56 overflow-y-auto ring-1 ring-black/5">
            {filtered.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v)}
                className="w-full text-left px-3 py-2 text-[15px] font-medium text-ink hover:bg-brand-tint/30 flex items-center gap-2 transition-colors border-b border-line/50 last:border-b-0"
              >
                <span className="truncate flex-1">{v.company_name}</span>
                {v.category && <span className="ml-auto text-[13px] text-ink-soft shrink-0">{v.category}</span>}
              </button>
            ))}
          </Card>
        </div>,
        document.body
      )}
    </div>
  );
};
