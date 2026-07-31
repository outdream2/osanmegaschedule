// 상품입고 검수 페이지 · 2026-07-30 · Premium UI Redesign
// 목적: 거래명세표와 실제 입고물품·개수 일치 확인
// 벤치마크: Vercel Dashboard · Linear · Stripe · shadcn/ui
// 좌측: 바코드 스캔 · 상품정보 · 요약
// 우측: 스캔 상품 자동 등록 리스트 · 상태 선택
// 하단: 전체 품목일치 · 품목불일치 최종 확인

import React, { useEffect, useMemo, useState } from "react";
import {
  ScanLine, Loader2, AlertCircle, PackagePlus, CheckCircle2, XCircle, Clock,
  Trash2, Minus, Plus, RotateCcw, ClipboardCheck, ClipboardX,
  Barcode, Building2, Box, Hash, ArrowUpDown, ArrowUp, ArrowDown,
  Sparkles, ShieldCheck,
} from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { loadZBar } from "./BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  type ProductInfo,
} from "../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../types";

interface ProductArrivalPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
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
  pending:  { label: "미확인",     color: "text-slate-500",   bg: "bg-slate-100",   border: "border-slate-300",   icon: <ClipboardCheck size={12} /> },
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
      bg-slate-900/95 backdrop-blur-sm text-white text-xs font-bold
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
    <span className={`text-[16px] sm:text-[18px] font-black tabular-nums leading-none ${valueClass}`}>{value}</span>
    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 leading-none">{label}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// SortIcon
// ─────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";
const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={11} className="text-slate-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={11} className="text-sky-500 ml-0.5 inline" />
    : <ArrowDown size={11} className="text-sky-500 ml-0.5 inline" />;
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const ProductArrivalPage: React.FC<ProductArrivalPageProps> = ({
  onBack, authSession, onNavigate, onLogout,
}) => {
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
  const [toast, setToast]                       = useState<string | null>(null);
  const [lastScannedProduct, setLastScannedProduct] = useState<ProductInfo | null>(null);
  const [lastScannedCode, setLastScannedCode]   = useState<string | null>(null);

  useEffect(() => { loadZBar(); }, []);
  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

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

  const resetAll = () => {
    if (items.length === 0) return;
    if (!window.confirm("리스트를 모두 초기화하시겠습니까?")) return;
    setItems([]);
    setFinalDecision(null);
    setNotFoundCode(null);
    setLastAddedKey(null);
    setLastScannedProduct(null);
    setLastScannedCode(null);
  };

  // ── 정렬
  type ArrivalSortKey = "addedAt" | "supplier" | "name" | "qty" | "status";
  const [sortKey, setSortKey] = useState<ArrivalSortKey>("addedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const handleSort = (k: ArrivalSortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sortedItems = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return items.slice().sort((a, b) => {
      switch (sortKey) {
        case "addedAt":  return sign * (a.addedAt - b.addedAt);
        case "supplier": return sign * (a.product?.supplier ?? "").localeCompare(b.product?.supplier ?? "", "ko");
        case "name":     return sign * (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "ko");
        case "qty":      return sign * (a.qty - b.qty);
        case "status":   return sign * a.status.localeCompare(b.status);
        default:         return 0;
      }
    });
  }, [items, sortKey, sortDir]);

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
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">

      {/* ── AppNavHeader (유지) ── */}
      <AppNavHeader
        activePage="productarrival"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          items.length > 0 ? (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                text-slate-500 hover:text-slate-800 bg-white border border-slate-200
                hover:bg-slate-50 hover:border-slate-300 shadow-sm
                transition-all duration-150 cursor-pointer"
            >
              <RotateCcw size={12} />
              초기화
            </button>
          ) : undefined
        }
      />

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

      {/* ── Page header strip ── */}
      <div className="bg-white border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600
            flex items-center justify-center shadow-sm shrink-0">
            <PackagePlus size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-900 leading-none">상품 입고 검수</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-none">
              거래명세표와 실제 입고물품·수량 일치 확인
            </p>
          </div>
          {counts.total > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-slate-400">
                {counts.total}건 / {counts.totalQty}개
              </span>
              {counts.pending > 0 && (
                <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full
                  bg-amber-50 text-amber-700 border border-amber-200">
                  {counts.pending}건 미결
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5
        flex flex-col lg:flex-row gap-4 lg:gap-5">

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL · 스캐너 + 마지막 스캔 + 요약
        ══════════════════════════════════════════════════════ */}
        <aside className="lg:w-[340px] xl:w-[360px] lg:shrink-0 flex flex-col gap-4
          lg:sticky lg:top-4 lg:self-start">

          {/* ── 스캔 카드 ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">

            {/* 상단 그라디언트 헤더 */}
            <div className="relative px-5 pt-4 pb-3 bg-gradient-to-b from-sky-50/60 to-transparent">
              {/* 장식 링 */}
              <div className="absolute top-3 right-3 w-12 h-12 rounded-full
                bg-sky-100/60 border border-sky-200/50" />
              <div className="absolute top-5.5 right-5.5 w-6 h-6 rounded-full
                bg-sky-200/40 border border-sky-300/30" />

              <div className="relative flex items-center gap-3 min-w-0">
                {/* 카메라 프레임 아이콘 */}
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600
                  flex items-center justify-center shadow-md shrink-0">
                  <ScanLine size={17} className="text-white" />
                  {/* 코너 마커 */}
                  <span className="absolute top-1 left-1 w-1.5 h-1.5 border-t-2 border-l-2 border-white/60 rounded-tl-sm" />
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 border-t-2 border-r-2 border-white/60 rounded-tr-sm" />
                  <span className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b-2 border-l-2 border-white/60 rounded-bl-sm" />
                  <span className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b-2 border-r-2 border-white/60 rounded-br-sm" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 leading-tight truncate">바코드 스캔</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-none truncate">
                    스캔 시 자동 등록됩니다
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-5 flex flex-col gap-3">
              {/* CTA 스캔 버튼 */}
              <button
                onClick={() => setScannerOpen(true)}
                disabled={mapLoading}
                className="relative w-full min-h-[52px] flex items-center justify-center gap-2.5
                  py-3.5 rounded-xl font-black text-[14px] sm:text-[15px] text-white
                  bg-gradient-to-r from-sky-500 to-sky-600
                  hover:from-sky-600 hover:to-sky-700
                  active:from-sky-700 active:to-sky-800
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_4px_14px_rgba(14,165,233,0.4)]
                  hover:shadow-[0_4px_20px_rgba(14,165,233,0.5)]
                  transition-all duration-200 cursor-pointer overflow-hidden"
              >
                {/* 광택 레이어 */}
                <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                {mapLoading
                  ? <><Loader2 size={18} className="animate-spin" /> 상품 정보 로딩...</>
                  : <><ScanLine size={18} /> 바코드 스캔</>
                }
              </button>

              {/* 미등록 상품 경고 */}
              {notFoundCode && !lastScannedProduct && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl
                  bg-amber-50 border border-amber-200/80">
                  <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-amber-800 leading-none">미등록 상품 코드</p>
                    <p className="text-[11px] font-mono tabular-nums text-amber-700 break-all mt-1.5
                      bg-amber-100/60 px-2 py-1 rounded-md">
                      {notFoundCode}
                    </p>
                  </div>
                </div>
              )}

              {/* 마지막 스캔 상품 정보 카드 */}
              {lastScannedProduct && (
                <div className="flex flex-col gap-3 px-3.5 py-3.5 rounded-xl
                  bg-gradient-to-b from-emerald-50 to-emerald-50/40
                  border border-emerald-200/80
                  shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">

                  {/* 헤더 */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">최근 스캔</span>
                    {lastScannedCode && (
                      <span className="ml-auto text-[10px] font-mono tabular-nums text-emerald-500
                        bg-emerald-100 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                        #{lastScannedCode}
                      </span>
                    )}
                  </div>

                  {/* 상품명 */}
                  <p className="text-[14px] sm:text-[15px] font-black text-slate-800
                    break-words whitespace-normal leading-snug -mt-0.5">
                    {lastScannedProduct.name}
                  </p>

                  {/* 규격 + 공급사 */}
                  <div className="flex flex-wrap items-center gap-2">
                    {lastScannedProduct.spec && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600
                        bg-white/80 border border-slate-200/60 rounded-lg px-2 py-1">
                        <Box size={11} className="text-slate-400" />
                        {lastScannedProduct.spec}
                      </span>
                    )}
                    {lastScannedProduct.supplier && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700
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
                          <span className="text-[10px] font-semibold text-slate-400 leading-none">현재고</span>
                          <span className="text-[13px] font-black text-amber-700 tabular-nums leading-none">
                            {Number(lastScannedProduct.current_stock).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {lastScannedProduct.sale_price != null && Number(lastScannedProduct.sale_price) > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-slate-400 leading-none">판매가</span>
                          <span className="text-[13px] font-black text-orange-700 tabular-nums leading-none">
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
          <div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-2 py-2">
            <div className="grid grid-cols-4 gap-1">
              <SummaryPill label="총건수"  value={counts.total}    valueClass="text-slate-800" />
              <SummaryPill label="일치"    value={counts.match}    valueClass="text-emerald-600" accent="hover:bg-emerald-50/60 rounded-xl transition" />
              <SummaryPill label="불일치"  value={counts.mismatch} valueClass="text-rose-600"    accent="hover:bg-rose-50/60 rounded-xl transition" />
              <SummaryPill label="기한임박" value={counts.expiring} valueClass="text-amber-600"   accent="hover:bg-amber-50/60 rounded-xl transition" />
            </div>
            <div className="mx-2 mt-1 pt-2.5 border-t border-slate-100
              flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">총 입고 수량</span>
              <span className="text-[13px] font-black text-slate-800 tabular-nums">
                {counts.totalQty}<span className="text-[10px] font-semibold text-slate-400 ml-0.5">개</span>
              </span>
            </div>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 등록 리스트 + 최종 확인
        ══════════════════════════════════════════════════════ */}
        <section className="flex-1 min-w-0 flex flex-col gap-4">

          {/* ── 등록 리스트 카드 ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">

            {/* 테이블 헤더 바 */}
            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5
              border-b border-slate-200/80
              bg-gradient-to-r from-slate-50/80 to-white
              rounded-t-2xl sticky top-0 z-10
              shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
                  <ClipboardCheck size={14} className="text-sky-600" />
                </div>
                <span className="text-sm font-black text-slate-800">등록된 입고 상품</span>
                {items.length > 0 && (
                  <span className="text-[11px] font-black text-sky-700
                    bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 tabular-nums">
                    {items.length}건
                  </span>
                )}
              </div>
              {counts.pending > 0 && (
                <span className="text-[10px] sm:text-[11px] font-black
                  text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  {counts.pending}건 미결정
                </span>
              )}
            </div>

            {/* 빈 상태 */}
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Barcode size={28} className="text-slate-300" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full
                    bg-sky-100 border-2 border-white flex items-center justify-center">
                    <Plus size={10} className="text-sky-500" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-400">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-xs text-slate-300 mt-1">바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : (
              /* 테이블 */
              <div className="flex-1 overflow-auto max-h-[58vh] lg:max-h-[64vh]">
                <table className="w-full border-collapse text-[12px] sm:text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/60">
                      {/* 입고일 */}
                      <th
                        className="text-left px-3 py-2.5 w-[68px] sm:w-20 font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                        onClick={() => handleSort("addedAt")}
                      >
                        입고일 <SortIcon active={sortKey === "addedAt"} dir={sortDir} />
                      </th>
                      {/* 공급사 */}
                      <th
                        className="text-left px-2 py-2.5 w-20 sm:w-28 font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                        onClick={() => handleSort("supplier")}
                      >
                        공급사 <SortIcon active={sortKey === "supplier"} dir={sortDir} />
                      </th>
                      {/* 상품명 */}
                      <th
                        className="text-left px-2 py-2.5 font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        상품명 <SortIcon active={sortKey === "name"} dir={sortDir} />
                      </th>
                      {/* 갯수/상태 · 반응형 폭 확대 · 한 화면에 3상태 (일치/불일치/유통기한) 나란히 */}
                      <th
                        className="text-center px-2 py-2.5 w-[220px] sm:w-[260px] font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
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
                            ? "bg-white hover:bg-slate-50/60"
                            : "bg-slate-50/30 hover:bg-slate-50/60";

                      return (
                        <tr
                          key={it.key}
                          className={`border-l-[3px] border-b border-slate-100/70 transition-colors duration-100
                            ${accentColor} ${rowBg}`}
                        >
                          {/* 입고일 */}
                          <td className="px-3 py-2.5 align-top tabular-nums font-mono text-[11px]
                            text-slate-500 leading-tight whitespace-nowrap">
                            {arrivedAt}
                          </td>

                          {/* 공급사 */}
                          <td className="px-2 py-2.5 align-top">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold
                              text-sky-700 bg-sky-50/80 border border-sky-200/60 rounded-md px-1.5 py-0.5
                              break-words whitespace-normal leading-tight">
                              <Building2 size={10} className="text-sky-400 shrink-0" />
                              {it.product?.supplier ?? "-"}
                            </span>
                          </td>

                          {/* 상품명 · 규격 · 코드 */}
                          <td className="px-2 py-2.5 align-top">
                            <p className="text-[13px] sm:text-[14px] font-black text-slate-800
                              break-words whitespace-normal leading-snug">
                              {it.product?.name ?? "(미등록 상품)"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {it.product?.spec && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                                  text-slate-500 bg-slate-100/80 rounded px-1.5 py-0.5">
                                  <Box size={9} className="text-slate-400" />
                                  {it.product.spec}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono
                                text-slate-400 bg-slate-100/60 rounded px-1.5 py-0.5">
                                <Hash size={9} className="text-slate-300" />
                                {it.code}
                              </span>
                            </div>
                          </td>

                          {/* 갯수 + 상태 셀 */}
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex flex-col gap-2">

                              {/* ── 수량 Stepper ── */}
                              <div className="inline-flex items-center rounded-xl overflow-hidden
                                border border-slate-200/80 bg-slate-50/80
                                shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                                <button
                                  onClick={() => updateQty(it.key, -1)}
                                  className="w-8 h-[44px] flex items-center justify-center
                                    text-slate-500 hover:text-slate-800 hover:bg-white
                                    active:bg-slate-100 transition-colors cursor-pointer"
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
                                    text-[13px] font-black tabular-nums text-slate-800
                                    focus:outline-none focus:bg-white transition-colors"
                                />
                                <button
                                  onClick={() => updateQty(it.key, 1)}
                                  className="w-8 h-[44px] flex items-center justify-center
                                    text-slate-500 hover:text-slate-800 hover:bg-white
                                    active:bg-slate-100 transition-colors cursor-pointer"
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
                                  border border-slate-200/80 bg-slate-100/80
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
                                        "min-h-[40px] text-[10px] font-black",
                                        "transition-all duration-150 cursor-pointer select-none",
                                        segIdx === 0 ? "" : "border-l border-slate-200/60",
                                        active
                                          ? s === "match"
                                            ? "bg-emerald-500 text-white shadow-sm"
                                            : "bg-rose-500 text-white shadow-sm"
                                          : "text-slate-400 hover:text-slate-600 hover:bg-white/60",
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
                                    "min-h-[40px] text-[10px] font-black border-l border-slate-200/60",
                                    "transition-all duration-150 cursor-pointer select-none",
                                    it.expiring
                                      ? "bg-amber-500 text-white shadow-sm"
                                      : "text-slate-400 hover:text-slate-600 hover:bg-white/60",
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
                                text-slate-300 hover:text-rose-500 hover:bg-rose-50
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
          <div className={`bg-white rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
            allDecided
              ? "border-sky-300/80 shadow-[0_0_0_4px_rgba(14,165,233,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
              : "border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.05)] opacity-90"
          }`}>

            {/* 카드 헤더 */}
            <div className={`px-5 py-4 border-b border-slate-100/80 flex items-center justify-between gap-2 ${
              allDecided ? "bg-gradient-to-r from-sky-50/60 to-transparent" : "bg-slate-50/40"
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  allDecided ? "bg-sky-100" : "bg-slate-100"
                }`}>
                  <ShieldCheck size={14} className={allDecided ? "text-sky-600" : "text-slate-400"} />
                </div>
                <span className="text-sm font-black text-slate-800">최종 확인 · 거래명세표 대조</span>
              </div>
              {!allDecided && items.length > 0 && (
                <span className="text-[10px] sm:text-[11px] font-black
                  text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  {counts.pending}건 상태 미결정
                </span>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-[12px] text-slate-500 leading-relaxed">
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
                    "min-h-[56px] py-3.5 rounded-xl font-black text-[14px] sm:text-[15px]",
                    "border-2 transition-all duration-200 cursor-pointer",
                    "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
                    finalDecision === "all_match"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-500 shadow-[0_4px_14px_rgba(16,185,129,0.4)]"
                      : allDecided
                        ? "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 shadow-sm hover:shadow-md"
                        : "bg-slate-50 text-slate-300 border-slate-200 shadow-none",
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
                    "min-h-[56px] py-3.5 rounded-xl font-black text-[14px] sm:text-[15px]",
                    "border-2 transition-all duration-200 cursor-pointer",
                    "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
                    finalDecision === "has_mismatch"
                      ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white border-rose-500 shadow-[0_4px_14px_rgba(239,68,68,0.4)]"
                      : allDecided
                        ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50 hover:border-rose-400 shadow-sm hover:shadow-md"
                        : "bg-slate-50 text-slate-300 border-slate-200 shadow-none",
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
                  <label className="flex items-center gap-1.5 text-[12px] font-black text-rose-700">
                    <ClipboardX size={13} />
                    품목이상 상세 메모
                  </label>
                  <textarea
                    value={mismatchMemo}
                    onChange={(e) => setMismatchMemo(e.target.value)}
                    rows={2}
                    placeholder="예) 박카스디 10병 · 3개 부족 · 명세표 20 실물 17"
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] resize-none
                      border-2 border-rose-200 bg-rose-50/30
                      placeholder:text-rose-300 text-slate-800
                      focus:outline-none focus:border-rose-400 focus:bg-white
                      focus:ring-4 focus:ring-rose-100/60
                      transition-all duration-200"
                  />
                </div>
              )}

              {/* 최종 판정 배너 */}
              {finalDecision && (
                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[12px] sm:text-[13px] font-black border-2 ${
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
                        const res = await fetch("/api/product-arrivals", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
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
                          }),
                        });
                        if (!res.ok) {
                          const b = await res.json().catch(() => ({}));
                          throw new Error((b as any).error ?? `저장 실패 (${res.status})`);
                        }
                        const j = await res.json() as { id?: number };
                        setSavedId(j.id ?? null);
                        setSaveStatus("done");
                        showToast("DB에 저장 완료");
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : "저장 실패";
                        setSaveError(msg);
                        setSaveStatus("error");
                      }
                    }}
                    disabled={saveStatus === "saving" || saveStatus === "done"}
                    className={[
                      "relative w-full min-h-[56px] py-3.5 rounded-xl",
                      "font-black text-[14px] sm:text-[15px] text-white",
                      "transition-all duration-200 cursor-pointer disabled:cursor-not-allowed",
                      "active:scale-[0.99] overflow-hidden",
                      saveStatus === "done"
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_4px_14px_rgba(16,185,129,0.35)]"
                        : saveStatus === "error"
                          ? "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 shadow-[0_4px_14px_rgba(239,68,68,0.35)]"
                          : saveStatus === "saving"
                            ? "bg-slate-400"
                            : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 shadow-[0_4px_20px_rgba(14,165,233,0.45)] hover:shadow-[0_4px_24px_rgba(14,165,233,0.55)]",
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
                    <p className="text-[12px] text-rose-600 font-semibold px-1">{saveError}</p>
                  )}
                  {saveStatus === "done" && (
                    <p className="text-[12px] text-slate-400 font-medium px-1 leading-relaxed">
                      저장 완료. 발주/사입관리 · 입고매칭 탭에서 발주 대비 확인 가능.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
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
          : "bg-white text-slate-300 border-slate-200 hover:border-slate-300 hover:text-slate-500"
      }`}
      title={`${meta.label} ${active ? "on" : "off"}`}
    >
      {meta.icon}
    </button>
  );
};
void _StatusToggle;
