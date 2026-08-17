// 상품입고 검수 페이지 · 2026-07-30 · Premium UI Redesign
// 목적: 거래명세표와 실제 입고물품·개수 일치 확인
// 벤치마크: Vercel Dashboard · Linear · Stripe · shadcn/ui
// 좌측: 바코드 스캔 · 상품정보 · 요약
// 우측: 스캔 상품 자동 등록 리스트 · 상태 선택
// 하단: 전체 품목일치 · 품목불일치 최종 확인

// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { SplitPanel } from "../common/SplitPanel";
import {
  ScanLine, Loader2, AlertCircle, PackagePlus, CheckCircle2, XCircle, Clock,
  Trash2, Minus, Plus, RotateCcw, ClipboardCheck, ClipboardX,
  Barcode, Building2, Box, Hash, ArrowUpDown, ArrowUp, ArrowDown,
  Sparkles, ShieldCheck, Package, RefreshCw, X,
} from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { BarcodeScanner } from "../BarcodeScanner";
import { loadZBar } from "../BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  type ProductInfo,
} from "../../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
// 2026-08-09 · 사용자 요청 · 상품 검색·확인 · 리스트 등록 (공통)
import { ProductSearchInput } from "../common/ProductSearchInput";
import { useToast } from "../../hooks/useToast";

interface ProductArrivalPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** 2026-08-03 · true 이면 AppNavHeader 및 min-h-screen 컨테이너 skip · 부모 서브탭 임베드 모드 */
  embedded?: boolean;
}

// 일치/불일치 배타 · 유통기한임박 독립 toggle
type ItemStatus = "pending" | "match" | "mismatch";

interface ArrivalItem {
  key: string;
  code: string;
  product: ProductInfo | null;
  qty: number;
  status: ItemStatus;
  expiring: boolean;
  addedAt: number;
}

const STATUS_META: Record<ItemStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  pending:  { label: "미확인",     color: "text-zinc-500",   bg: "bg-zinc-100",   border: "border-zinc-300",   icon: <ClipboardCheck size={12} /> },
  match:    { label: "수량일치",   color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-400", icon: <CheckCircle2 size={12} /> },
  mismatch: { label: "수량불일치", color: "text-rose-700",    bg: "bg-rose-100",    border: "border-rose-400",    icon: <XCircle size={12} /> },
};

// ─────────────────────────────────────────────────────────────
// Toast · 우측 상단 · 프리미엄 pill
// ─────────────────────────────────────────────────────────────
interface ToastProps { message: string }
const Toast: React.FC<ToastProps> = ({ message }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed top-4 right-4 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl
      bg-zinc-900/95 backdrop-blur-sm text-white text-xs font-bold
      shadow-[0_8px_32px_rgba(0,0,0,0.32)] border border-white/10
      animate-in slide-in-from-top-2 fade-in duration-200"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
    {message}
  </div>
);

// ─────────────────────────────────────────────────────────────
// SummaryPill · 요약 통계 셀
// ─────────────────────────────────────────────────────────────
interface SummaryPillProps { label: string; value: number; valueClass: string; accent?: string }
const SummaryPill: React.FC<SummaryPillProps> = ({ label, value, valueClass, accent }) => (
  <div className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition ${accent ?? ""}`}>
    <span className={`text-[16px] sm:text-[18px] font-bold tabular-nums leading-none ${valueClass}`}>{value}</span>
    <span className="text-[14px] sm:text-[15px] font-semibold text-zinc-400 leading-none">{label}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// SortIcon
// ─────────────────────────────────────────────────────────────
const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={11} className="text-zinc-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={11} className="text-sky-500 ml-0.5 inline" />
    : <ArrowDown size={11} className="text-sky-500 ml-0.5 inline" />;
};

type ArrivalSortKey = "addedAt" | "supplier" | "name" | "qty" | "status";

const ARRIVAL_CMP: Record<ArrivalSortKey, Comparator<ArrivalItem>> = {
  addedAt:  (a, b) => a.addedAt - b.addedAt,
  supplier: (a, b) => (a.product?.supplier ?? "").localeCompare(b.product?.supplier ?? "", "ko"),
  name:     (a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "ko"),
  qty:      (a, b) => a.qty - b.qty,
  status:   (a, b) => a.status.localeCompare(b.status),
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const ProductArrivalPage: React.FC<ProductArrivalPageProps> = ({
  onBack, authSession, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();

  // 2026-08-03 · 내부 탭 (상품입고 / 입고내역) · 입고내역 로직 · OrderManagePage 에서 이동
  const [arrivalTab, setArrivalTab]             = useState<"input" | "history">("input");
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [mapLoading, setMapLoading]             = useState(false);
  const [items, setItems]                       = useState<ArrivalItem[]>([]);
  const [lastAddedKey, setLastAddedKey]         = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode]         = useState<string | null>(null);
  const [finalDecision, setFinalDecision]       = useState<"all_match" | "has_mismatch" | null>(null);
  const [mismatchMemo, setMismatchMemo]         = useState<string>("");
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError]               = useState<string | null>(null);
  const [savedId, setSavedId]                   = useState<number | null>(null);
  // 2026-08-16 · useToast 프레임워크 · setTimeout 자동 관리
  const { toast: _toastObj, show: _showToast } = useToast(2200);
  const toast = _toastObj?.message ?? null;
  const [lastScannedProduct, setLastScannedProduct] = useState<ProductInfo | null>(null);
  const [lastScannedCode, setLastScannedCode]   = useState<string | null>(null);

  // ─── 입고내역(history) state · OrderManagePage 에서 이동 (2026-08-03) ───
  interface ArrivalHistoryRow {
    id: number;
    arrival_date: string;
    checked_by: string | null;
    total_items: number;
    total_qty: number;
    match_count: number;
    mismatch_count: number;
    expiring_count: number;
    final_decision: string | null;
    supplier_summary: string | null;
    note: string | null;
  }
  interface ArrivalHistoryDetail extends ArrivalHistoryRow {
    items: Array<{ id: number; product_code: string | null; product_name: string | null; supplier: string | null; qty: number; status: string }>;
  }
  const [arrivals, setArrivals] = useState<ArrivalHistoryRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalDays, setArrivalDays] = useState<7 | 30 | 90>(30);
  const [selectedArrivalId, setSelectedArrivalId] = useState<number | null>(null);
  const [arrivalDetail, setArrivalDetail] = useState<ArrivalHistoryDetail | null>(null);
  const [arrivalDetailLoading, setArrivalDetailLoading] = useState(false);
  const loadArrivals = useCallback(async () => {
    setArrivalsLoading(true);
    try {
      const { data: j } = await api.get<{ rows?: any[] }>(`/api/product-arrivals?limit=100&days=${arrivalDays}`);
      setArrivals(Array.isArray(j?.rows) ? j.rows : []);
    } catch { setArrivals([]); }
    finally { setArrivalsLoading(false); }
  }, [arrivalDays]);
  useEffect(() => { if (arrivalTab === "history") loadArrivals(); }, [arrivalTab, loadArrivals]);
  useEffect(() => {
    if (selectedArrivalId == null) { setArrivalDetail(null); return; }
    setArrivalDetailLoading(true);
    api.get<any>(`/api/product-arrivals/${selectedArrivalId}`)
      .then(({ data }) => setArrivalDetail(data ?? null))
      .catch(() => setArrivalDetail(null))
      .finally(() => setArrivalDetailLoading(false));
  }, [selectedArrivalId]);
  const deleteArrival = async (id: number) => {
    if (!await confirm({ message: "이 입고내역을 삭제하시겠습니까? (관련 아이템 모두 삭제)", danger: true })) return;
    try {
      await api.del(`/api/product-arrivals/${id}`);
      setArrivals(prev => prev.filter(a => a.id !== id));
      if (selectedArrivalId === id) setSelectedArrivalId(null);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
      alert(`삭제 실패: ${msg}`);
    }
  };

  useEffect(() => { loadZBar(); }, []);
  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
  }, []);

  const showToast = (msg: string) => _showToast(msg);

  const handleScan = async (result: string) => {
    setScannerOpen(false);
    setNotFoundCode(null);
    if (!isProductsLoaded()) {
      setMapLoading(true);
      await getProductsMap();
      setMapLoading(false);
    }
    const found = lookupProduct(result);
    if (!found) {
      setNotFoundCode(result);
      setLastScannedProduct(null);
      setLastScannedCode(result);
      showToast("등록되지 않은 상품");
      return;
    }
    setLastScannedProduct(found);
    setLastScannedCode(result);
    let addedKey: string;
    const existingIdx = items.findIndex(it => it.code === result);
    if (existingIdx >= 0) {
      addedKey = items[existingIdx].key;
      setItems(prev => {
        const idx = prev.findIndex(it => it.code === result);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      });
    } else {
      const newItem: ArrivalItem = {
        key: `${result}-${Date.now()}`,
        code: result,
        product: found,
        qty: 1,
        status: "pending",
        expiring: false,
        addedAt: Date.now(),
      };
      addedKey = newItem.key;
      setItems(prev => [newItem, ...prev]);
    }
    setLastAddedKey(addedKey);
    setFinalDecision(null);
  };

  const updateQty = (key: string, delta: number) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, qty: Math.max(0, it.qty + delta) } : it
    ));
  };

  const setQtyDirect = (key: string, val: number) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, qty: Math.max(0, val) } : it
    ));
  };

  const setStatus = (key: string, status: ItemStatus) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, status } : it
    ));
  };

  const toggleExpiring = (key: string) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, expiring: !it.expiring } : it
    ));
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(it => it.key !== key));
  };

  const resetAll = async () => {
    if (items.length === 0) return;
    if (!await confirm({ message: "리스트를 모두 초기화하시겠습니까?", danger: true })) return;
    setItems([]);
    setFinalDecision(null);
    setNotFoundCode(null);
    setLastAddedKey(null);
    setLastScannedProduct(null);
    setLastScannedCode(null);
  };

  // ── 정렬
  const { sorted: sortedItems, sortKey, sortDir, toggleSort: handleSort } = useSortableTable<ArrivalItem, ArrivalSortKey>(
    items, "addedAt", ARRIVAL_CMP, "desc",
  );

  const counts = useMemo(() => {
    const c = { total: items.length, match: 0, mismatch: 0, expiring: 0, pending: 0, totalQty: 0 };
    for (const it of items) {
      c[it.status]++;
      if (it.expiring) c.expiring++;
      c.totalQty += it.qty;
    }
    return c;
  }, [items]);

  const allDecided = counts.total > 0 && counts.pending === 0;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col bg-[#F4F7FA]" : "min-h-screen bg-[#F4F7FA] flex flex-col"}>

      {/* ── AppNavHeader (embedded 모드에선 부모가 헤더 렌더 · skip) ── */}
      {!embedded && (
        <AppNavHeader
          activePage="productarrival"
          authSession={authSession ?? null}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
          rightSlot={
            arrivalTab === "input" && items.length > 0 ? (
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                  text-zinc-500 hover:text-zinc-800 bg-white border border-line
                  hover:bg-zinc-50 hover:border-zinc-300 shadow-sm
                  transition-all duration-150 cursor-pointer"
              >
                <RotateCcw size={12} />
                초기화
              </button>
            ) : undefined
          }
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast} />}

      {/* ── BarcodeScanner overlay ── */}
      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
          title="입고 상품 바코드 스캔"
        />
      )}

      {/* ── Page header strip · 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 ── */}
      <div className="bg-white border-b border-line shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <span className="w-[3px] h-[22px] rounded-full bg-brand-deep shrink-0" />
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-deep
            flex items-center justify-center shadow-sm shrink-0">
            <PackagePlus size={17} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] sm:text-[19px] font-bold text-ink leading-tight tracking-tight">상품 입고 검수</h1>
            <p className="text-[13px] sm:text-[14px] text-ink-soft mt-0.5 leading-tight">
              거래명세표와 실제 입고물품·수량 일치 확인
            </p>
          </div>
          {arrivalTab === "input" && counts.total > 0 && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <StatusPill tone="brand" size="md">{counts.total}건 / {counts.totalQty}개</StatusPill>
              {counts.pending > 0 && (
                <StatusPill tone="amber" size="md" dot pulse>{counts.pending}건 미결</StatusPill>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 내부 서브탭 (2026-08-03 · 상품입고 / 입고내역) ── */}
      <div className="max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 pt-3">
        <div className="inline-flex bg-white border border-line rounded-xl p-1 shadow-sm">
          {([
            { k: "input"   as const, label: "상품입고", icon: PackagePlus, color: "sky"    },
            { k: "history" as const, label: "입고내역", icon: Package,     color: "indigo" },
          ]).map(({ k, label, icon: Icon, color }) => {
            const active = arrivalTab === k;
            const activeColor = color === "sky"
              ? "bg-sky-500 text-white shadow-sm"
              : "bg-brand-deep text-white shadow-sm";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setArrivalTab(k)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[14px] font-bold transition cursor-pointer ${
                  active ? activeColor : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main layout (arrivalTab === "input") ── */}
      {arrivalTab === "input" && (
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5 flex flex-col">
        <SplitPanel
          storageKey="productArrivalPage.leftWidth"
          defaultWidth={340}
          minWidth={240}
          maxWidth={520}
          dividerColor="sky"
          wrapLeft={false}
          wrapRight={false}
          leftClassName="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start max-h-none"
          mobileRightAsModal={false}
          left={<>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL · 스캐너 + 마지막 스캔 + 요약
        ══════════════════════════════════════════════════════ */}


          {/* ── 스캔 카드 ── */}
          <div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">

            {/* 2026-08-17 · 최신 트렌드 · 좌측 accent bar + 딥네이비 통일 · 장식 링 제거 */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line bg-zinc-50/60">
              <span className="w-[3px] h-[16px] rounded-full bg-brand-deep shrink-0" />
              {/* 카메라 프레임 아이콘 · 딥네이비 통일 */}
              <div className="relative w-9 h-9 rounded-xl bg-brand-deep
                flex items-center justify-center shadow-sm shrink-0">
                <ScanLine size={17} className="text-white" />
                {/* 코너 마커 · 브랜드 톤 */}
                <span className="absolute top-1 left-1 w-1.5 h-1.5 border-t-2 border-l-2 border-white/70 rounded-tl-sm" />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 border-t-2 border-r-2 border-white/70 rounded-tr-sm" />
                <span className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b-2 border-l-2 border-white/70 rounded-bl-sm" />
                <span className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b-2 border-r-2 border-white/70 rounded-br-sm" />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-ink leading-tight tracking-tight">바코드 스캔</p>
                <p className="text-[13px] text-ink-soft mt-0.5 leading-tight">
                  스캔 시 자동 등록됩니다
                </p>
              </div>
            </div>

            <div className="px-4 pb-5 flex flex-col gap-3">
              {/* CTA 스캔 버튼 · 2026-08-17 · 딥네이비 통일 */}
              <button
                onClick={() => setScannerOpen(true)}
                disabled={mapLoading}
                className="relative w-full min-h-[52px] flex items-center justify-center gap-2.5
                  py-3.5 rounded-xl font-bold text-[14px] sm:text-[15px] text-white
                  bg-brand-deep
                  hover:bg-[#0d3a5c]
                  active:bg-[#08253a]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-sm hover:shadow-md
                  transition-colors duration-150 cursor-pointer overflow-hidden"
              >
                {/* 광택 레이어 */}
                <span className="absolute inset-0 bg-gradient-to-b from-white/12 to-transparent pointer-events-none" />
                {mapLoading
                  ? <><Loader2 size={18} className="animate-spin" /> 상품 정보 로딩...</>
                  : <><ScanLine size={18} /> 바코드 스캔</>
                }
              </button>

              {/* 2026-08-09 · 상품 검색 · 바코드 스캔 버튼 아래 (사용자 요청) */}
              <ProductSearchInput
                accent="sky"
                placeholder="상품명·코드 검색"
                onSelect={(code) => handleScan(code)}
              />

              {/* 미등록 상품 경고 */}
              {notFoundCode && !lastScannedProduct && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl
                  bg-amber-50 border border-amber-200/80">
                  <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-800 leading-none">미등록 상품 코드</p>
                    <p className="text-[15px] font-mono tabular-nums text-amber-700 break-all mt-1.5
                      bg-amber-100/60 px-2 py-1 rounded-md">
                      {notFoundCode}
                    </p>
                  </div>
                </div>
              )}

              {/* 마지막 스캔 상품 정보 카드 */}
              {lastScannedProduct && (
                <div className="flex flex-col gap-3 px-3.5 py-3.5 rounded-xl
                  bg-emerald-50
                  border border-emerald-200/80
                  shadow-sm">

                  {/* 헤더 */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-[14px] font-bold text-emerald-700 uppercase tracking-wider">최근 스캔</span>
                    {lastScannedCode && (
                      <span className="ml-auto text-[14px] font-mono tabular-nums text-emerald-500
                        bg-emerald-100 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                        #{lastScannedCode}
                      </span>
                    )}
                  </div>

                  {/* 상품명 */}
                  <p className="text-[14px] sm:text-[15px] font-bold text-zinc-800
                    break-words whitespace-normal leading-snug -mt-0.5">
                    {lastScannedProduct.name}
                  </p>

                  {/* 규격 + 공급사 */}
                  <div className="flex flex-wrap items-center gap-2">
                    {lastScannedProduct.spec && (
                      <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-zinc-600
                        bg-white/80 border border-line/60 rounded-lg px-2 py-1">
                        <Box size={11} className="text-zinc-400" />
                        {lastScannedProduct.spec}
                      </span>
                    )}
                    {lastScannedProduct.supplier && (
                      <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-sky-700
                        bg-sky-50 border border-sky-200/70 rounded-lg px-2 py-1">
                        <Building2 size={11} className="text-sky-500" />
                        {lastScannedProduct.supplier}
                      </span>
                    )}
                  </div>

                  {/* 재고·가격 */}
                  {(lastScannedProduct.current_stock != null || lastScannedProduct.sale_price != null) && (
                    <div className="flex flex-wrap items-center gap-3 pt-2.5 mt-0.5
                      border-t border-emerald-200/60">
                      {lastScannedProduct.current_stock != null && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] font-semibold text-zinc-400 leading-none">현재고</span>
                          <span className="text-[15px] font-bold text-amber-700 tabular-nums leading-none">
                            {Number(lastScannedProduct.current_stock).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {lastScannedProduct.sale_price != null && Number(lastScannedProduct.sale_price) > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] font-semibold text-zinc-400 leading-none">판매가</span>
                          <span className="text-[15px] font-bold text-orange-700 tabular-nums leading-none">
                            ₩{Number(lastScannedProduct.sale_price).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── 요약 카운트 카드 ── */}
          <div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-2 py-2">
            <div className="grid grid-cols-4 gap-1">
              <SummaryPill label="총건수"  value={counts.total}    valueClass="text-zinc-800" />
              <SummaryPill label="일치"    value={counts.match}    valueClass="text-emerald-600" accent="hover:bg-emerald-50/60 rounded-xl transition" />
              <SummaryPill label="불일치"  value={counts.mismatch} valueClass="text-rose-600"    accent="hover:bg-rose-50/60 rounded-xl transition" />
              <SummaryPill label="기한임박" value={counts.expiring} valueClass="text-amber-600"   accent="hover:bg-amber-50/60 rounded-xl transition" />
            </div>
            <div className="mx-2 mt-1 pt-2.5 border-t border-zinc-100
              flex items-center justify-between">
              <span className="text-[15px] font-semibold text-zinc-400">총 입고 수량</span>
              <span className="text-[15px] font-bold text-zinc-800 tabular-nums">
                {counts.totalQty}<span className="text-[14px] font-semibold text-zinc-400 ml-0.5">개</span>
              </span>
            </div>
          </div>
        </>}
          right={<div className="flex flex-col gap-4">

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 등록 리스트 + 최종 확인
        ══════════════════════════════════════════════════════ */}


          {/* ── 등록 리스트 카드 ── */}
          <div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">

            {/* 테이블 헤더 바 */}
            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5
              border-b border-line/80
              bg-zinc-50/80
              rounded-t-2xl sticky top-0 z-10
              shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
                  <ClipboardCheck size={14} className="text-sky-600" />
                </div>
                <span className="text-sm font-bold text-zinc-800">등록된 입고 상품</span>
                {items.length > 0 && (
                  <span className="text-[15px] font-bold text-sky-700
                    bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 tabular-nums">
                    {items.length}건
                  </span>
                )}
              </div>
              {counts.pending > 0 && (
                <span className="text-[14px] sm:text-[15px] font-bold
                  text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  {counts.pending}건 미결정
                </span>
              )}
            </div>

            {/* 빈 상태 */}
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
                    <Barcode size={28} className="text-zinc-300" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full
                    bg-sky-100 border-2 border-white flex items-center justify-center">
                    <Plus size={10} className="text-sky-500" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-zinc-400">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-xs text-zinc-300 mt-1">바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : (
              /* 테이블 */
              <div className="flex-1 overflow-auto max-h-[58vh] lg:max-h-[64vh]">
                <table className="w-full border-collapse text-[14px] sm:text-[15px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-zinc-50/95 backdrop-blur-sm border-b border-line/60">
                      {/* 입고일 */}
                      <th
                        className="text-left px-3 py-2.5 w-[68px] sm:w-20 font-bold text-zinc-400
                          cursor-pointer select-none hover:text-zinc-600 hover:bg-zinc-100/60 transition-colors"
                        onClick={() => handleSort("addedAt")}
                      >
                        입고일 <SortIcon active={sortKey === "addedAt"} dir={sortDir} />
                      </th>
                      {/* 공급사 */}
                      <th
                        className="text-left px-2 py-2.5 w-20 sm:w-28 font-bold text-zinc-400
                          cursor-pointer select-none hover:text-zinc-600 hover:bg-zinc-100/60 transition-colors"
                        onClick={() => handleSort("supplier")}
                      >
                        공급사 <SortIcon active={sortKey === "supplier"} dir={sortDir} />
                      </th>
                      {/* 상품명 */}
                      <th
                        className="text-left px-2 py-2.5 font-bold text-zinc-400
                          cursor-pointer select-none hover:text-zinc-600 hover:bg-zinc-100/60 transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        상품명 <SortIcon active={sortKey === "name"} dir={sortDir} />
                      </th>
                      {/* 갯수/상태 · 반응형 폭 확대 · 한 화면에 3상태 (일치/불일치/유통기한) 나란히 */}
                      <th
                        className="text-center px-2 py-2.5 w-[220px] sm:w-[260px] font-bold text-zinc-400
                          cursor-pointer select-none hover:text-zinc-600 hover:bg-zinc-100/60 transition-colors"
                        onClick={() => handleSort("qty")}
                      >
                        갯수 / 상태 <SortIcon active={sortKey === "qty"} dir={sortDir} />
                      </th>
                      {/* 삭제 */}
                      <th className="px-2 py-2.5 w-9" />
                    </tr>
                  </thead>

                  <tbody>
                    {sortedItems.map((it, idx) => {
                      const isRecent = it.key === lastAddedKey;
                      const d = new Date(it.addedAt);
                      const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

                      // 좌측 액센트 스트라이프 색
                      const accentColor =
                        it.status === "match"    ? "border-l-emerald-400" :
                        it.status === "mismatch" ? "border-l-rose-400" :
                        it.expiring              ? "border-l-amber-400" :
                                                   "border-l-transparent";

                      const rowBg =
                        isRecent
                          ? "bg-sky-50/60"
                          : idx % 2 === 0
                            ? "bg-white hover:bg-zinc-50/60"
                            : "bg-zinc-50/30 hover:bg-zinc-50/60";

                      return (
                        <tr
                          key={it.key}
                          className={`border-l-[3px] border-b border-zinc-100/70 transition-colors duration-100
                            ${accentColor} ${rowBg}`}
                        >
                          {/* 입고일 */}
                          <td className="px-3 py-2.5 align-top tabular-nums font-mono text-[15px]
                            text-zinc-500 leading-tight whitespace-nowrap">
                            {arrivedAt}
                          </td>

                          {/* 공급사 */}
                          <td className="px-2 py-2.5 align-top">
                            <span className="inline-flex items-center gap-1 text-[15px] font-bold
                              text-sky-700 bg-sky-50/80 border border-sky-200/60 rounded-md px-1.5 py-0.5
                              break-words whitespace-normal leading-tight">
                              <Building2 size={10} className="text-sky-400 shrink-0" />
                              {it.product?.supplier ?? "-"}
                            </span>
                          </td>

                          {/* 상품명 · 규격 · 코드 */}
                          <td className="px-2 py-2.5 align-top">
                            <p className="text-[15px] sm:text-[14px] font-bold text-zinc-800
                              break-words whitespace-normal leading-snug">
                              {it.product?.name ?? "(미등록 상품)"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {it.product?.spec && (
                                <span className="inline-flex items-center gap-1 text-[14px] font-semibold
                                  text-zinc-500 bg-zinc-100/80 rounded px-1.5 py-0.5">
                                  <Box size={9} className="text-zinc-400" />
                                  {it.product.spec}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[14px] font-mono
                                text-zinc-400 bg-zinc-100/60 rounded px-1.5 py-0.5">
                                <Hash size={9} className="text-zinc-300" />
                                {it.code}
                              </span>
                            </div>
                          </td>

                          {/* 갯수 + 상태 셀 */}
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex flex-col gap-2">

                              {/* ── 수량 Stepper ── */}
                              <div className="inline-flex items-center rounded-xl overflow-hidden
                                border border-line/80 bg-zinc-50/80
                                shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                                <button
                                  onClick={() => updateQty(it.key, -1)}
                                  className="w-8 h-[44px] flex items-center justify-center
                                    text-zinc-500 hover:text-zinc-800 hover:bg-white
                                    active:bg-zinc-100 transition-colors cursor-pointer"
                                  title="수량 -1"
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={it.qty}
                                  onChange={(e) => setQtyDirect(it.key, Number(e.target.value) || 0)}
                                  className="w-10 h-[44px] text-center bg-transparent
                                    text-[15px] font-bold tabular-nums text-zinc-800
                                    focus:outline-none focus:bg-white transition-colors"
                                />
                                <button
                                  onClick={() => updateQty(it.key, 1)}
                                  className="w-8 h-[44px] flex items-center justify-center
                                    text-zinc-500 hover:text-zinc-800 hover:bg-white
                                    active:bg-zinc-100 transition-colors cursor-pointer"
                                  title="수량 +1"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>

                              {/* ── 3상태 통합 · 한 줄 · 일치 · 불일치 (배타) · 유통기한 (독립) ── */}
                              <div
                                role="group"
                                aria-label="일치 · 불일치 · 유통기한"
                                className="flex rounded-xl overflow-hidden
                                  border border-line/80 bg-zinc-100/80
                                  shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]"
                              >
                                {(["match", "mismatch"] as ItemStatus[]).map((s, segIdx) => {
                                  const meta = STATUS_META[s];
                                  const active = it.status === s;
                                  return (
                                    <button
                                      key={s}
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => setStatus(it.key, active ? "pending" : s)}
                                      title={`${meta.label} · 클릭 시 선택/해제`}
                                      className={[
                                        "flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                                        "min-h-[40px] text-[14px] font-bold",
                                        "transition-all duration-150 cursor-pointer select-none",
                                        segIdx === 0 ? "" : "border-l border-line/60",
                                        active
                                          ? s === "match"
                                            ? "bg-emerald-500 text-white shadow-sm"
                                            : "bg-rose-500 text-white shadow-sm"
                                          : "text-zinc-400 hover:text-zinc-600 hover:bg-white/60",
                                      ].join(" ")}
                                    >
                                      {active
                                        ? (s === "match" ? <CheckCircle2 size={11} /> : <XCircle size={11} />)
                                        : meta.icon
                                      }
                                      <span className="leading-none">{s === "match" ? "일치" : "불일치"}</span>
                                    </button>
                                  );
                                })}
                                {/* 유통기한 · 독립 토글 · 같은 줄 · 왼쪽 border */}
                                <button
                                  onClick={() => toggleExpiring(it.key)}
                                  aria-pressed={it.expiring}
                                  title={`유통기한임박 ${it.expiring ? "on" : "off"} · 독립 토글`}
                                  className={[
                                    "flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                                    "min-h-[40px] text-[14px] font-bold border-l border-line/60",
                                    "transition-all duration-150 cursor-pointer select-none",
                                    it.expiring
                                      ? "bg-amber-500 text-white shadow-sm"
                                      : "text-zinc-400 hover:text-zinc-600 hover:bg-white/60",
                                  ].join(" ")}
                                >
                                  <Clock size={11} />
                                  <span className="leading-none">유통기한</span>
                                </button>
                              </div>

                            </div>
                          </td>

                          {/* 삭제 */}
                          <td className="px-2 py-2.5 text-center align-top">
                            <button
                              onClick={() => removeItem(it.key)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg mx-auto
                                text-zinc-300 hover:text-rose-500 hover:bg-rose-50
                                transition-all duration-150 cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════
              최종 확인 카드
          ══════════════════════════════════════════════════════ */}
          <div className={`bg-white rounded-2xl border-2 transition-colors duration-150 overflow-hidden ${
            allDecided
              ? "border-sky-300/80 shadow-[0_0_0_4px_rgba(14,165,233,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
              : "border-line/80 shadow-[0_2px_8px_rgba(0,0,0,0.05)] opacity-90"
          }`}>

            {/* 카드 헤더 */}
            <div className={`px-5 py-4 border-b border-zinc-100/80 flex items-center justify-between gap-2 ${
              allDecided ? "bg-sky-50/60" : "bg-zinc-50/40"
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  allDecided ? "bg-sky-100" : "bg-zinc-100"
                }`}>
                  <ShieldCheck size={14} className={allDecided ? "text-sky-600" : "text-zinc-400"} />
                </div>
                <span className="text-sm font-bold text-zinc-800">최종 확인 · 거래명세표 대조</span>
              </div>
              {!allDecided && items.length > 0 && (
                <span className="text-[14px] sm:text-[15px] font-bold
                  text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  {counts.pending}건 상태 미결정
                </span>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-[14px] text-zinc-500 leading-relaxed">
                모든 항목의 상태를 지정한 뒤, 거래명세표와 실제 입고 물품의
                최종 일치 여부를 선택하세요.
              </p>

              {/* 최종 결정 버튼 2개 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 전체 품목일치 */}
                <button
                  onClick={() => setFinalDecision("all_match")}
                  disabled={!allDecided}
                  className={[
                    "relative inline-flex items-center justify-center gap-2.5",
                    "min-h-[56px] py-3.5 rounded-xl font-bold text-[14px] sm:text-[15px]",
                    "border-2 transition-colors duration-150 cursor-pointer",
                    "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
                    finalDecision === "all_match"
                      ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                      : allDecided
                        ? "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 shadow-sm hover:shadow-md"
                        : "bg-zinc-50 text-zinc-300 border-line shadow-none",
                  ].join(" ")}
                >
                  {finalDecision === "all_match" && (
                    <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                  )}
                  <ClipboardCheck size={17} />
                  전체 품목일치
                </button>

                {/* 품목 불일치 있음 */}
                <button
                  onClick={() => setFinalDecision("has_mismatch")}
                  disabled={!allDecided}
                  className={[
                    "relative inline-flex items-center justify-center gap-2.5",
                    "min-h-[56px] py-3.5 rounded-xl font-bold text-[14px] sm:text-[15px]",
                    "border-2 transition-colors duration-150 cursor-pointer",
                    "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
                    finalDecision === "has_mismatch"
                      ? "bg-rose-500 text-white border-rose-500 shadow-md"
                      : allDecided
                        ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50 hover:border-rose-400 shadow-sm hover:shadow-md"
                        : "bg-zinc-50 text-zinc-300 border-line shadow-none",
                  ].join(" ")}
                >
                  {finalDecision === "has_mismatch" && (
                    <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                  )}
                  <ClipboardX size={17} />
                  품목 불일치 있음
                </button>
              </div>

              {/* 품목 불일치 메모칸 */}
              {finalDecision === "has_mismatch" && (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-[14px] font-bold text-rose-700">
                    <ClipboardX size={13} />
                    품목이상 상세 메모
                  </label>
                  <textarea
                    value={mismatchMemo}
                    onChange={(e) => setMismatchMemo(e.target.value)}
                    rows={2}
                    placeholder="예) 박카스디 10병 · 3개 부족 · 명세표 20 실물 17"
                    className="w-full px-3.5 py-2.5 rounded-xl text-[15px] resize-none
                      border-2 border-rose-200 bg-rose-50/30
                      placeholder:text-rose-300 text-zinc-800
                      focus:outline-none focus:border-brand-deep focus:bg-white
                      focus:ring-4 focus:ring-brand-tint/60
                      transition-colors duration-150"
                  />
                </div>
              )}

              {/* 최종 판정 배너 */}
              {finalDecision && (
                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[14px] sm:text-[15px] font-bold border-2 ${
                  finalDecision === "all_match"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}>
                  {finalDecision === "all_match"
                    ? <CheckCircle2 size={16} />
                    : <XCircle size={16} />
                  }
                  최종 판정: {finalDecision === "all_match"
                    ? "거래명세표와 실제 입고 완전 일치"
                    : "거래명세표와 실제 입고 불일치 존재"}
                </div>
              )}

              {/* DB 저장 버튼 */}
              {finalDecision && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      if (saveStatus === "saving") return;
                      setSaveStatus("saving");
                      setSaveError(null);
                      try {
                        const { data: j } = await api.post<{ id?: number }>("/api/product-arrivals", {
                          checked_by: authSession?.employeeName ?? "익명",
                          checked_by_id: authSession?.employeeId ?? null,
                          final_decision: finalDecision,
                          note: finalDecision === "has_mismatch" ? mismatchMemo.trim() : null,
                          items: items.map(it => ({
                            product_code: it.code,
                            product_name: it.product?.name ?? "",
                            supplier: it.product?.supplier ?? "",
                            qty: it.qty,
                            status: it.status,
                            expiring: it.expiring,
                          })),
                        });
                        setSavedId(j?.id ?? null);
                        setSaveStatus("done");
                        showToast("DB에 저장 완료");
                      } catch (e: unknown) {
                        const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "저장 실패");
                        setSaveError(msg);
                        setSaveStatus("error");
                      }
                    }}
                    disabled={saveStatus === "saving" || saveStatus === "done"}
                    className={[
                      "relative w-full min-h-[56px] py-3.5 rounded-xl",
                      "font-bold text-[14px] sm:text-[15px] text-white",
                      "transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed",
                      "active:scale-[0.99] overflow-hidden",
                      saveStatus === "done"
                        ? "bg-emerald-500 shadow-md"
                        : saveStatus === "error"
                          ? "bg-rose-500 hover:bg-rose-600 shadow-md"
                          : saveStatus === "saving"
                            ? "bg-zinc-400"
                            : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-md hover:shadow-lg",
                    ].join(" ")}
                  >
                    {/* 광택 */}
                    <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                    <span className="relative flex items-center justify-center gap-2.5">
                      {saveStatus === "saving" && <Loader2 size={17} className="animate-spin" />}
                      {saveStatus === "done"    && <Sparkles size={17} />}
                      {saveStatus === "error"   && <AlertCircle size={17} />}
                      {saveStatus === "idle"    && <PackagePlus size={17} />}
                      {saveStatus === "saving" ? "등록 중..." :
                       saveStatus === "done"   ? `등록 완료 (ID: ${savedId ?? "-"})` :
                       saveStatus === "error"  ? "다시 등록" :
                       "전체 등록"}
                    </span>
                  </button>

                  {saveError && (
                    <p className="text-[14px] text-rose-600 font-semibold px-1">{saveError}</p>
                  )}
                  {saveStatus === "done" && (
                    <p className="text-[14px] text-zinc-400 font-medium px-1 leading-relaxed">
                      저장 완료. 발주/사입관리 · 입고매칭 탭에서 발주 대비 확인 가능.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>}
        />
      </main>
      )}

      {/* ── 입고내역 (arrivalTab === "history") · 2026-08-03 · OrderManagePage 에서 이동 ── */}
      {arrivalTab === "history" && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5 flex flex-col gap-3 min-h-0">
          {/* 헤더 카드 */}
          <div className="bg-white border border-line rounded-xl shadow-sm p-3 h-12 flex items-center gap-2">
            <Package size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[15px] font-semibold text-zinc-700">입고내역</span>
            <span className="text-[15px] font-bold text-zinc-500 bg-zinc-100 rounded-full px-2 py-0.5 tabular-nums">{arrivals.length}건</span>
            <span className="text-[15px] font-medium text-zinc-400 ml-2 hidden sm:inline">최근 {arrivalDays}일</span>
            <div className="flex items-center gap-0.5 bg-zinc-100 border border-line rounded-lg p-1 ml-auto">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setArrivalDays(d as any)}
                  className={`text-[15px] font-semibold px-2 py-1 rounded transition whitespace-nowrap cursor-pointer ${arrivalDays === d ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                  {d}일
                </button>
              ))}
            </div>
            <button onClick={loadArrivals} disabled={arrivalsLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
              title="새로고침">
              <RefreshCw size={13} className={arrivalsLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* 리스트 카드 */}
          <div className="bg-white border border-line rounded-xl shadow-sm overflow-hidden">
            {arrivalsLoading && arrivals.length === 0 ? (
              <div className="py-12 flex items-center justify-center gap-2 text-zinc-400 text-[15px] font-semibold">
                <Loader2 size={16} className="animate-spin" /> 불러오는 중...
              </div>
            ) : arrivals.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-[15px] font-semibold">최근 {arrivalDays}일 입고내역 없음</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                  <thead className="bg-indigo-50/50 border-b border-indigo-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-10">#</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-32">등록일시</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-24">담당</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 min-w-[200px]">공급사 요약</th>
                      <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">품목</th>
                      <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">수량</th>
                      <th className="px-2 py-2 text-center font-bold text-emerald-700 w-14">일치</th>
                      <th className="px-2 py-2 text-center font-bold text-rose-700 w-14">불일치</th>
                      <th className="px-2 py-2 text-center font-bold text-amber-700 w-14">기한임박</th>
                      <th className="px-2 py-2 text-center font-bold text-indigo-800 w-24">최종판정</th>
                      <th className="px-2 py-2 text-center font-bold text-zinc-500 w-24">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {arrivals.map((a, i) => {
                      const d = new Date(a.arrival_date);
                      const dateStr = isNaN(d.getTime()) ? "-" : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      const isSelected = selectedArrivalId === a.id;
                      return (
                        <tr key={a.id} className={`transition ${isSelected ? "bg-indigo-50/60" : "hover:bg-zinc-50/60"}`}>
                          <td className="px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                          <td className="px-2 py-1.5 text-zinc-700 tabular-nums font-semibold">{dateStr}</td>
                          <td className="px-2 py-1.5 text-zinc-600">{a.checked_by ?? "-"}</td>
                          <td className="px-2 py-1.5 text-zinc-600 truncate max-w-[240px]" title={a.supplier_summary ?? ""}>{a.supplier_summary ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-800 font-bold tabular-nums">{a.total_items}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-800 font-bold tabular-nums">{a.total_qty.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-center text-emerald-700 font-bold tabular-nums">{a.match_count}</td>
                          <td className="px-2 py-1.5 text-center text-rose-700 font-bold tabular-nums">{a.mismatch_count}</td>
                          <td className="px-2 py-1.5 text-center text-amber-700 font-bold tabular-nums">{a.expiring_count}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[14px] font-bold border ${
                              a.final_decision === "all_match" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : a.final_decision === "has_mismatch" ? "bg-rose-50 text-rose-700 border-rose-300"
                                : "bg-zinc-50 text-zinc-500 border-zinc-300"
                            }`}>
                              {a.final_decision === "all_match" ? "완전일치" : a.final_decision === "has_mismatch" ? "불일치 있음" : "-"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => setSelectedArrivalId(a.id)}
                                className="h-7 px-2 rounded-md text-[15px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer transition">
                                상세
                              </button>
                              <button type="button" onClick={() => deleteArrival(a.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 border border-line hover:border-rose-200 cursor-pointer transition"
                                title="삭제">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}

      {/* 입고내역 상세 모달 · 2026-08-03 · OrderManagePage 에서 이동 */}
      {selectedArrivalId != null && (
        <div className="fixed inset-0 z-[100] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSelectedArrivalId(null)}>
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 · 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line bg-zinc-50/60 shrink-0">
              <span className="w-[3px] h-[20px] rounded-full bg-brand-deep shrink-0" />
              <Package size={18} className="text-brand-deep" />
              <h3 className="text-[17px] font-bold text-ink tracking-tight">입고내역 상세</h3>
              <span className="text-[13px] font-semibold text-ink-soft tabular-nums">ID {selectedArrivalId}</span>
              <button type="button" onClick={() => setSelectedArrivalId(null)}
                className="ml-auto w-9 h-9 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint text-ink-soft hover:text-brand-deep flex items-center justify-center cursor-pointer transition-colors" title="닫기" aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {arrivalDetailLoading || !arrivalDetail ? (
                <div className="py-12 flex items-center justify-center gap-2 text-zinc-400 text-[15px] font-semibold">
                  <Loader2 size={16} className="animate-spin" /> 상세 로딩 중...
                </div>
              ) : (
                <>
                  {/* 헤더 요약 카드 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-zinc-50 border border-line rounded-lg p-3">
                      <div className="text-[15px] font-bold text-ink tracking-tight">등록일시</div>
                      <div className="text-[15px] font-bold text-zinc-800 tabular-nums mt-0.5">
                        {(() => { const d = new Date(arrivalDetail.arrival_date); return isNaN(d.getTime()) ? "-" : d.toLocaleString("ko-KR"); })()}
                      </div>
                    </div>
                    <div className="bg-zinc-50 border border-line rounded-lg p-3">
                      <div className="text-[15px] font-bold text-ink tracking-tight">담당자</div>
                      <div className="text-[15px] font-bold text-zinc-800 mt-0.5">{arrivalDetail.checked_by ?? "-"}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="text-[15px] font-semibold text-emerald-600 uppercase tracking-wider">품목·수량</div>
                      <div className="text-[15px] font-bold text-emerald-700 tabular-nums mt-0.5">{arrivalDetail.total_items}개 · {arrivalDetail.total_qty.toLocaleString()}수량</div>
                    </div>
                    <div className={`border rounded-lg p-3 ${arrivalDetail.final_decision === "all_match" ? "bg-emerald-50 border-emerald-200" : arrivalDetail.final_decision === "has_mismatch" ? "bg-rose-50 border-rose-200" : "bg-zinc-50 border-line"}`}>
                      <div className="text-[15px] font-bold text-ink tracking-tight">최종 판정</div>
                      <div className={`text-[15px] font-bold mt-0.5 ${arrivalDetail.final_decision === "all_match" ? "text-emerald-700" : arrivalDetail.final_decision === "has_mismatch" ? "text-rose-700" : "text-zinc-500"}`}>
                        {arrivalDetail.final_decision === "all_match" ? "완전일치" : arrivalDetail.final_decision === "has_mismatch" ? "불일치 있음" : "-"}
                      </div>
                    </div>
                  </div>
                  {/* 상태 카운트 */}
                  <div className="flex items-center gap-3 flex-wrap text-[14px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                      수량일치 <span className="font-bold tabular-nums">{arrivalDetail.match_count}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-300">
                      수량불일치 <span className="font-bold tabular-nums">{arrivalDetail.mismatch_count}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                      유통기한 임박 <span className="font-bold tabular-nums">{arrivalDetail.expiring_count}</span>
                    </span>
                  </div>
                  {/* 공급사 요약 · 메모 */}
                  {arrivalDetail.supplier_summary && (
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                      <div className="text-[15px] font-semibold text-sky-600 uppercase tracking-wider mb-1">공급사 요약</div>
                      <div className="text-[15px] font-medium text-zinc-700 break-words">{arrivalDetail.supplier_summary}</div>
                    </div>
                  )}
                  {arrivalDetail.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-[15px] font-semibold text-amber-700 uppercase tracking-wider mb-1">메모</div>
                      <div className="text-[15px] font-medium text-zinc-700 whitespace-pre-wrap">{arrivalDetail.note}</div>
                    </div>
                  )}
                  {/* 아이템 리스트 */}
                  <div className="border border-line rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-zinc-50 border-b border-line flex items-center gap-2">
                      <span className="text-[14px] font-bold text-zinc-700">입고 아이템</span>
                      <span className="text-[15px] font-semibold text-zinc-500 tabular-nums">{arrivalDetail.items?.length ?? 0}개</span>
                    </div>
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-[14px]">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-line text-[15px] font-bold text-ink tracking-tight">
                            <th className="px-2 py-1.5 text-left w-10">#</th>
                            <th className="px-2 py-1.5 text-left w-24">코드</th>
                            <th className="px-2 py-1.5 text-left min-w-[180px]">상품명</th>
                            <th className="px-2 py-1.5 text-left w-28">공급사</th>
                            <th className="px-2 py-1.5 text-right w-14">수량</th>
                            <th className="px-2 py-1.5 text-center w-20">상태</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {(arrivalDetail.items ?? []).map((it, i) => (
                            <tr key={it.id} className="hover:bg-zinc-50/60">
                              <td className="px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                              <td className="px-2 py-1.5 text-zinc-500 tabular-nums text-[15px]">{it.product_code ?? "-"}</td>
                              <td className="px-2 py-1.5 text-zinc-800 font-semibold break-words">{it.product_name ?? "-"}</td>
                              <td className="px-2 py-1.5 text-zinc-600">{it.supplier ?? "-"}</td>
                              <td className="px-2 py-1.5 text-right font-bold tabular-nums text-zinc-800">{it.qty.toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[14px] font-bold border ${
                                  it.status === "match" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : it.status === "mismatch" ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : it.status === "expiring" ? "bg-amber-50 text-amber-700 border-amber-300"
                                    : "bg-zinc-50 text-zinc-500 border-zinc-300"
                                }`}>
                                  {it.status === "match" ? "일치" : it.status === "mismatch" ? "불일치" : it.status === "expiring" ? "기한임박" : "미확인"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// (unused components kept for type-safety — referenced externally)
// ─────────────────────────────────────────────────────────────
interface StatusToggleProps {
  status: ItemStatus;
  active: boolean;
  onToggle: () => void;
}
const _StatusToggle: React.FC<StatusToggleProps> = ({ status, active, onToggle }) => {
  const meta = STATUS_META[status];
  return (
    <button onClick={onToggle}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full border-2 transition cursor-pointer active:scale-95 ${
        active
          ? `${meta.bg} ${meta.color} ${meta.border} shadow-sm`
          : "bg-white text-zinc-300 border-line hover:border-zinc-300 hover:text-zinc-500"
      }`}
      title={`${meta.label} ${active ? "on" : "off"}`}
    >
      {meta.icon}
    </button>
  );
};
void _StatusToggle;
