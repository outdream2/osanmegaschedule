// 실재고입력 (ScanPage) · 2026-07-30 리팩터
// 좌: 바코드 스캐너 + 최근 스캔 상품 + notFoundCode
// 우: 스캔한 상품 테이블 · 창고/매장1/매장2 입력 · 전체 등록
// real_map "/" 분할 → 매장1·매장2 컬럼 (없으면 매장1만)

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ScanLine, Loader2, AlertCircle, Package,
  CheckCircle2, Trash2, RotateCcw, Warehouse, Store,
  Hash, Building2, Box, MapPin, ArrowUpDown, ArrowUp, ArrowDown,
  SaveAll, Sparkles,
} from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { loadZBar } from "./BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  type ProductInfo,
} from "../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../types";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface ScanPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─────────────────────────────────────────────────────────────
// real_map 파싱 · "/" 기준 분할 → 매장1 / 매장2
// 예: "8A/냉" → ["8A", "냉"] · "9B" → ["9B", null]
// ─────────────────────────────────────────────────────────────
function parseRealMap(realMap: string | null | undefined): [string | null, string | null] {
  if (!realMap) return [null, null];
  const idx = realMap.indexOf("/");
  if (idx < 0) return [realMap.trim() || null, null];
  const a = realMap.slice(0, idx).trim();
  const b = realMap.slice(idx + 1).trim();
  return [a || null, b || null];
}

// ─────────────────────────────────────────────────────────────
// StockRow · 우측 테이블 한 행
// ─────────────────────────────────────────────────────────────
interface StockRow {
  key: string;                    // code + timestamp
  code: string;
  product: ProductInfo;
  addedAt: number;
  warehouseQty: number | "";
  store1Qty:    number | "";
  store2Qty:    number | "";     // real_map "/" 있을 때만 의미 있음
  store1Label:  string | null;   // real_map 첫 번째 위치명
  store2Label:  string | null;   // real_map 두 번째 위치명 (없으면 null)
}

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
interface ToastProps { message: string }
const Toast: React.FC<ToastProps> = ({ message }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed top-4 right-4 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl
      bg-slate-900/95 backdrop-blur-sm text-white text-xs font-bold
      shadow-[0_8px_32px_rgba(0,0,0,0.32)] border border-white/10"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
    {message}
  </div>
);

// ─────────────────────────────────────────────────────────────
// SortIcon
// ─────────────────────────────────────────────────────────────
type SortDir = "asc" | "desc";
const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={10} className="text-slate-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={10} className="text-teal-500 ml-0.5 inline" />
    : <ArrowDown size={10} className="text-teal-500 ml-0.5 inline" />;
};

// ─────────────────────────────────────────────────────────────
// NumberInput · 수량 입력 공통
// ─────────────────────────────────────────────────────────────
interface NumberInputProps {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  disabled?: boolean;
  accent?: string;
}
const NumberInput: React.FC<NumberInputProps> = ({
  value, onChange, placeholder = "0", disabled = false, accent = "focus:border-teal-400",
}) => (
  <input
    type="number"
    inputMode="numeric"
    value={value}
    disabled={disabled}
    onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    placeholder={placeholder}
    className={`w-full h-9 text-right px-2 bg-white border border-slate-200 rounded-lg
      text-[13px] font-black tabular-nums focus:outline-none transition
      disabled:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed
      ${accent}`}
  />
);

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const ScanPage: React.FC<ScanPageProps> = ({
  onBack, authSession, onNavigate, onLogout,
}) => {
  // ── scanner
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [mapLoading, setMapLoading]             = useState(false);
  const [toast, setToast]                       = useState<string | null>(null);

  // ── 좌측 마지막 스캔 상태
  const [lastProduct, setLastProduct]           = useState<ProductInfo | null>(null);
  const [lastCode, setLastCode]                 = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode]         = useState<string | null>(null);

  // ── 우측 테이블
  const [rows, setRows]                         = useState<StockRow[]>([]);
  const [lastAddedKey, setLastAddedKey]         = useState<string | null>(null);

  // ── 전체 저장
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError]               = useState<string | null>(null);
  const [savedCount, setSavedCount]             = useState<number>(0);

  // ── 정렬
  type SortKey = "addedAt" | "name" | "supplier" | "realMap";
  const [sortKey, setSortKey]                   = useState<SortKey>("addedAt");
  const [sortDir, setSortDir]                   = useState<SortDir>("desc");

  useEffect(() => { loadZBar(); }, []);
  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
  }, []);

  const showToast = useCallback((msg: string, ms = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  // ── 스캔 핸들러
  const handleScan = useCallback(async (result: string) => {
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
      setLastProduct(null);
      setLastCode(result);
      showToast("등록되지 않은 상품");
      return;
    }
    setLastProduct(found);
    setLastCode(result);

    // 중복 코드면 기존 행 하이라이트
    const existingIdx = rows.findIndex(r => r.code === result);
    if (existingIdx >= 0) {
      setLastAddedKey(rows[existingIdx].key);
      showToast("이미 등록된 상품 (기존 행 활성화)");
      return;
    }

    // real_map 파싱
    const rm = found.realMap ?? (found as any).real_map ?? null;
    const [s1Label, s2Label] = parseRealMap(rm);

    const newRow: StockRow = {
      key: `${result}-${Date.now()}`,
      code: result,
      product: found,
      addedAt: Date.now(),
      warehouseQty: "",
      store1Qty: "",
      store2Qty: "",
      store1Label: s1Label,
      store2Label: s2Label,
    };

    setRows(prev => [newRow, ...prev]);
    setLastAddedKey(newRow.key);
    setSaveStatus("idle");

    // 기존 실재고 자동 로드
    fetch(`/api/inventory-checks?product_code=${encodeURIComponent(result)}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        const last = list[0];
        if (!last) return;
        setRows(prev => prev.map(r => r.key === newRow.key
          ? {
              ...r,
              warehouseQty: last.warehouse_stock != null ? Number(last.warehouse_stock) : "",
              store1Qty:    last.store_stock      != null ? Number(last.store_stock)     : "",
              store2Qty:    last.store_stock_2    != null ? Number(last.store_stock_2)   : "",
            }
          : r
        ));
      })
      .catch(() => {});
  }, [rows, showToast]);

  // ── 행 필드 업데이트
  const patchRow = useCallback((key: string, patch: Partial<StockRow>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const resetAll = () => {
    if (rows.length === 0) return;
    if (!window.confirm(`등록된 ${rows.length}개 항목을 모두 초기화할까요?`)) return;
    setRows([]);
    setLastAddedKey(null);
    setLastProduct(null);
    setLastCode(null);
    setNotFoundCode(null);
    setSaveStatus("idle");
    setSaveError(null);
  };

  // ── 전체 저장
  const handleBulkSave = async () => {
    if (rows.length === 0) return;
    if (saveStatus === "saving") return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/inventory-checks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checked_by: authSession?.employeeName ?? "익명",
          items: rows.map(r => ({
            product_code:    r.code,
            product_name:    r.product.name,
            warehouse_stock: r.warehouseQty !== "" ? Number(r.warehouseQty) : null,
            store_stock:     r.store1Qty    !== "" ? Number(r.store1Qty)    : null,
            store_stock_2:   r.store2Qty    !== "" ? Number(r.store2Qty)    : null,
          })),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? `저장 실패 (${res.status})`);
      }
      const j = await res.json() as { saved?: number; failed?: number };
      setSavedCount(j.saved ?? rows.length);
      setSaveStatus("done");
      showToast(`${j.saved ?? rows.length}건 저장 완료`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장 실패";
      setSaveError(msg);
      setSaveStatus("error");
    }
  };

  // ── 정렬
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const sortedRows = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      switch (sortKey) {
        case "addedAt":  return sign * (a.addedAt - b.addedAt);
        case "name":     return sign * a.product.name.localeCompare(b.product.name, "ko");
        case "supplier": return sign * (a.product.supplier ?? "").localeCompare(b.product.supplier ?? "", "ko");
        case "realMap": {
          const ra = a.product.realMap ?? (a.product as any).real_map ?? "";
          const rb = b.product.realMap ?? (b.product as any).real_map ?? "";
          return sign * ra.localeCompare(rb, "ko");
        }
        default: return 0;
      }
    });
  }, [rows, sortKey, sortDir]);

  // 합계 계산 헬퍼
  const total = (r: StockRow): number => {
    const w  = r.warehouseQty !== "" ? Number(r.warehouseQty) : 0;
    const s1 = r.store1Qty    !== "" ? Number(r.store1Qty)    : 0;
    const s2 = r.store2Qty    !== "" ? Number(r.store2Qty)    : 0;
    return w + s1 + s2;
  };

  const hasDualStore = sortedRows.some(r => r.store2Label !== null);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">

      {/* ── AppNavHeader ── */}
      <AppNavHeader
        activePage="scan"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          rows.length > 0 ? (
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
          title="실재고 바코드 스캔"
        />
      )}

      {/* ── Page header strip ── */}
      <div className="bg-white border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600
            flex items-center justify-center shadow-sm shrink-0">
            <ScanLine size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-900 leading-none">실재고 입력</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-none">
              바코드 스캔 후 창고·매장 수량 입력 · 전체 저장
            </p>
          </div>
          {rows.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-slate-400">{rows.length}건</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5
        flex flex-col lg:flex-row gap-4 lg:gap-5">

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL · 스캐너 + 마지막 스캔 상품
        ══════════════════════════════════════════════════════ */}
        <aside className="lg:w-[320px] xl:w-[340px] lg:shrink-0 flex flex-col gap-4
          lg:sticky lg:top-4 lg:self-start">

          {/* ── 스캔 카드 ── */}
          <div className="bg-white rounded-xl border border-slate-200/80
            shadow-sm overflow-hidden">

            {/* 헤더 그라디언트 */}
            <div className="relative px-5 pt-4 pb-3 bg-gradient-to-b from-teal-50/70 to-transparent">
              <div className="absolute top-3 right-3 w-12 h-12 rounded-full bg-teal-100/50 border border-teal-200/40" />
              <div className="relative flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600
                  flex items-center justify-center shadow-md shrink-0 relative">
                  <ScanLine size={17} className="text-white" />
                  <span className="absolute top-1 left-1 w-1.5 h-1.5 border-t-2 border-l-2 border-white/60 rounded-tl-sm" />
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 border-t-2 border-r-2 border-white/60 rounded-tr-sm" />
                  <span className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b-2 border-l-2 border-white/60 rounded-bl-sm" />
                  <span className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b-2 border-r-2 border-white/60 rounded-br-sm" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800 leading-tight">바코드 스캔</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-none">
                    스캔 시 우측 리스트에 자동 등록
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-5 flex flex-col gap-3">
              {/* 스캔 버튼 */}
              <button
                onClick={() => setScannerOpen(true)}
                disabled={mapLoading}
                className="relative w-full min-h-[52px] flex items-center justify-center gap-2.5
                  py-3.5 rounded-xl font-black text-[14px] sm:text-[15px] text-white
                  bg-gradient-to-r from-teal-500 to-teal-600
                  hover:from-teal-600 hover:to-teal-700
                  active:from-teal-700 active:to-teal-800
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_4px_14px_rgba(20,184,166,0.4)]
                  hover:shadow-[0_4px_20px_rgba(20,184,166,0.5)]
                  transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                {mapLoading
                  ? <><Loader2 size={18} className="animate-spin" /> 상품 정보 로딩...</>
                  : <><ScanLine size={18} /> 바코드 스캔</>
                }
              </button>

              {/* 미등록 코드 경고 */}
              {notFoundCode && !lastProduct && (
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

              {/* 마지막 스캔 상품 */}
              {lastProduct && (
                <div className="flex flex-col gap-2.5 px-3.5 py-3.5 rounded-xl
                  bg-gradient-to-b from-teal-50 to-teal-50/30
                  border border-teal-200/80
                  shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">

                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-[10px] font-black text-teal-700 uppercase tracking-wider">최근 스캔</span>
                    {lastCode && (
                      <span className="ml-auto text-[10px] font-mono tabular-nums text-teal-500
                        bg-teal-100 px-1.5 py-0.5 rounded-md border border-teal-200/60">
                        #{lastCode}
                      </span>
                    )}
                  </div>

                  <p className="text-[14px] sm:text-[15px] font-black text-slate-800
                    break-words whitespace-normal leading-snug -mt-0.5">
                    {lastProduct.name}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {lastProduct.spec && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600
                        bg-white/80 border border-slate-200/60 rounded-lg px-2 py-1">
                        <Box size={10} className="text-slate-400" />
                        {lastProduct.spec}
                      </span>
                    )}
                    {lastProduct.supplier && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700
                        bg-sky-50 border border-sky-200/70 rounded-lg px-2 py-1">
                        <Building2 size={10} className="text-sky-500" />
                        {lastProduct.supplier}
                      </span>
                    )}
                    {(() => {
                      const rm = lastProduct.realMap ?? (lastProduct as any).real_map ?? null;
                      if (!rm) return null;
                      return (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700
                          bg-violet-50 border border-violet-200/70 rounded-lg px-2 py-1">
                          <MapPin size={10} className="text-violet-400" />
                          {rm}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 도움말 ── */}
          <div className="bg-teal-50/60 rounded-xl border border-teal-200/60 px-4 py-3.5 flex flex-col gap-1.5">
            <p className="text-[11px] font-black text-teal-700">입력 안내</p>
            <ul className="text-[11px] text-teal-600 leading-relaxed space-y-1">
              <li>창고·매장1·매장2 수량을 입력</li>
              <li>실재고 합계는 자동 계산됩니다</li>
              <li>매장2는 real_map "/" 있을 때만 활성</li>
              <li>하단 "전체 등록" 버튼으로 일괄 저장</li>
            </ul>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 스캔 리스트 테이블
        ══════════════════════════════════════════════════════ */}
        <section className="flex-1 min-w-0 flex flex-col gap-4">

          {/* ── 리스트 카드 ── */}
          <div className="bg-white rounded-xl border border-slate-200/80
            shadow-sm flex flex-col min-h-[320px] overflow-hidden">

            {/* 테이블 헤더 바 */}
            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-200/80
              bg-gradient-to-r from-slate-50/80 to-white rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Package size={14} className="text-teal-600" />
                </div>
                <span className="text-sm font-black text-slate-800">스캔한 상품 · 실재고 입력</span>
                {rows.length > 0 && (
                  <span className="text-[11px] font-black text-teal-700
                    bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 tabular-nums">
                    {rows.length}건
                  </span>
                )}
              </div>
            </div>

            {/* 빈 상태 */}
            {rows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Package size={28} className="text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-400">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-xs text-slate-300 mt-1">좌측 바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto max-h-[56vh] lg:max-h-[62vh]">
                <table className="w-full border-collapse text-[12px] sm:text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/60">
                      {/* 시각 */}
                      <th
                        className="text-left px-3 py-2.5 w-[64px] sm:w-[72px] font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors whitespace-nowrap"
                        onClick={() => handleSort("addedAt")}
                      >
                        시각 <SortIcon active={sortKey === "addedAt"} dir={sortDir} />
                      </th>
                      {/* 상품명 */}
                      <th
                        className="text-left px-2 py-2.5 font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        상품명 <SortIcon active={sortKey === "name"} dir={sortDir} />
                      </th>
                      {/* 구역 */}
                      <th
                        className="text-left px-2 py-2.5 w-[70px] font-bold text-slate-400
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors whitespace-nowrap"
                        onClick={() => handleSort("realMap")}
                      >
                        구역 <SortIcon active={sortKey === "realMap"} dir={sortDir} />
                      </th>
                      {/* 창고 */}
                      <th className="text-center px-2 py-2.5 w-[76px] sm:w-[86px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-orange-400" /> 창고
                        </span>
                      </th>
                      {/* 매장1 */}
                      <th className="text-center px-2 py-2.5 w-[76px] sm:w-[86px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-emerald-500" /> 매장1
                        </span>
                      </th>
                      {/* 매장2 (dual store 있을 때만) */}
                      {hasDualStore && (
                        <th className="text-center px-2 py-2.5 w-[76px] sm:w-[86px] font-bold text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Store size={11} className="text-violet-500" /> 매장2
                          </span>
                        </th>
                      )}
                      {/* 합계 */}
                      <th className="text-center px-2 py-2.5 w-[60px] font-bold text-slate-400 whitespace-nowrap">
                        합계
                      </th>
                      {/* 삭제 */}
                      <th className="px-2 py-2.5 w-9" />
                    </tr>
                  </thead>

                  <tbody>
                    {sortedRows.map((row, idx) => {
                      const isRecent = row.key === lastAddedKey;
                      const d = new Date(row.addedAt);
                      const addedAt = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      const rm = row.product.realMap ?? (row.product as any).real_map ?? null;
                      const rowTotal = total(row);
                      const hasAnyValue = row.warehouseQty !== "" || row.store1Qty !== "" || row.store2Qty !== "";

                      const rowBg = isRecent
                        ? "bg-teal-50/60"
                        : idx % 2 === 0
                          ? "bg-white hover:bg-slate-50/50"
                          : "bg-slate-50/30 hover:bg-slate-50/60";

                      const accentColor = isRecent ? "border-l-teal-400" : "border-l-transparent";

                      return (
                        <tr
                          key={row.key}
                          className={`border-l-[3px] border-b border-slate-100/70 transition-colors duration-100
                            ${accentColor} ${rowBg}`}
                        >
                          {/* 시각 */}
                          <td className="px-3 py-2 align-middle tabular-nums font-mono text-[11px]
                            text-slate-400 whitespace-nowrap">
                            {addedAt}
                          </td>

                          {/* 상품명 · 규격 · 코드 */}
                          <td className="px-2 py-2 align-middle min-w-[120px]">
                            <p className="text-[12px] sm:text-[13px] font-black text-slate-800
                              break-words whitespace-normal leading-snug">
                              {row.product.name}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {row.product.spec && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold
                                  text-slate-500 bg-slate-100/80 rounded px-1.5 py-0.5">
                                  <Box size={8} className="text-slate-400" />
                                  {row.product.spec}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono
                                text-slate-400 bg-slate-100/60 rounded px-1.5 py-0.5">
                                <Hash size={8} className="text-slate-300" />
                                {row.code}
                              </span>
                            </div>
                          </td>

                          {/* 구역 */}
                          <td className="px-2 py-2 align-middle">
                            {rm ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold
                                text-violet-700 bg-violet-50 border border-violet-200/60 rounded-md px-1.5 py-0.5
                                whitespace-nowrap">
                                <MapPin size={9} className="text-violet-400 shrink-0" />
                                {rm}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">-</span>
                            )}
                          </td>

                          {/* 창고 수량 */}
                          <td className="px-1.5 py-2 align-middle">
                            <NumberInput
                              value={row.warehouseQty}
                              onChange={v => patchRow(row.key, { warehouseQty: v })}
                              accent="focus:border-orange-400"
                            />
                          </td>

                          {/* 매장1 수량 */}
                          <td className="px-1.5 py-2 align-middle">
                            <div className="flex flex-col gap-0.5">
                              <NumberInput
                                value={row.store1Qty}
                                onChange={v => patchRow(row.key, { store1Qty: v })}
                                accent="focus:border-emerald-400"
                              />
                              {row.store1Label && (
                                <span className="text-[9px] text-center text-emerald-600 font-bold leading-none">
                                  {row.store1Label}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 매장2 수량 (hasDualStore 열이 있을 때) */}
                          {hasDualStore && (
                            <td className="px-1.5 py-2 align-middle">
                              {row.store2Label !== null ? (
                                <div className="flex flex-col gap-0.5">
                                  <NumberInput
                                    value={row.store2Qty}
                                    onChange={v => patchRow(row.key, { store2Qty: v })}
                                    accent="focus:border-violet-400"
                                  />
                                  <span className="text-[9px] text-center text-violet-600 font-bold leading-none">
                                    {row.store2Label}
                                  </span>
                                </div>
                              ) : (
                                <div className="h-9 rounded-lg bg-slate-100/60 border border-slate-200/40 flex items-center justify-center">
                                  <span className="text-[10px] text-slate-300">-</span>
                                </div>
                              )}
                            </td>
                          )}

                          {/* 합계 */}
                          <td className="px-2 py-2 align-middle text-center">
                            {hasAnyValue ? (
                              <span className={`text-[13px] font-black tabular-nums
                                ${rowTotal > 0 ? "text-teal-700" : "text-slate-400"}`}>
                                {rowTotal}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">-</span>
                            )}
                          </td>

                          {/* 삭제 */}
                          <td className="px-2 py-2 text-center align-middle">
                            <button
                              onClick={() => removeRow(row.key)}
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

          {/* ── 전체 저장 카드 ── */}
          {rows.length > 0 && (
            <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
              saveStatus === "done"
                ? "border-emerald-300/80 shadow-[0_0_0_4px_rgba(16,185,129,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
                : "border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            }`}>
              <div className={`px-5 py-3.5 border-b border-slate-100/80 flex items-center justify-between gap-2 ${
                saveStatus === "done" ? "bg-gradient-to-r from-emerald-50/60 to-transparent" : "bg-slate-50/40"
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    saveStatus === "done" ? "bg-emerald-100" : "bg-slate-100"
                  }`}>
                    <SaveAll size={14} className={saveStatus === "done" ? "text-emerald-600" : "text-slate-400"} />
                  </div>
                  <span className="text-sm font-black text-slate-800">전체 등록</span>
                </div>
                <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                  {rows.length}건 · 총 {rows.reduce((acc, r) => acc + total(r), 0)}개
                </span>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  리스트의 모든 항목을 한 번에 저장합니다.
                  창고·매장 수량을 입력한 뒤 아래 버튼을 누르세요.
                </p>

                {/* 저장 버튼 */}
                <button
                  onClick={handleBulkSave}
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
                          : "bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-[0_4px_20px_rgba(20,184,166,0.45)] hover:shadow-[0_4px_24px_rgba(20,184,166,0.55)]",
                  ].join(" ")}
                >
                  <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                  <span className="relative flex items-center justify-center gap-2.5">
                    {saveStatus === "saving" && <Loader2 size={17} className="animate-spin" />}
                    {saveStatus === "done"    && <Sparkles size={17} />}
                    {saveStatus === "error"   && <AlertCircle size={17} />}
                    {saveStatus === "idle"    && <SaveAll size={17} />}
                    {saveStatus === "saving" ? "저장 중..." :
                     saveStatus === "done"   ? `저장 완료 (${savedCount}건)` :
                     saveStatus === "error"  ? "다시 시도" :
                     `전체 등록 (${rows.length}건)`}
                  </span>
                </button>

                {saveError && (
                  <p className="text-[12px] text-rose-600 font-semibold px-1">{saveError}</p>
                )}

                {saveStatus === "done" && (
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] text-emerald-600 font-semibold flex-1">
                      저장 완료. 재고관리 탭에서 실재고 현황을 확인할 수 있습니다.
                    </p>
                    <button
                      onClick={() => {
                        setRows([]);
                        setLastAddedKey(null);
                        setSaveStatus("idle");
                        setSaveError(null);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold
                        text-slate-500 bg-white border border-slate-200 hover:bg-slate-50
                        transition cursor-pointer shrink-0"
                    >
                      <RotateCcw size={11} /> 목록 초기화
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
