// 상품입고 검수 페이지 · 2026-07-28
// 목적: 거래명세표와 실제 입고물품·개수 일치 확인
// 좌측: 바코드 스캔 · 상품정보 조회 (실재고입력 참고)
// 우측: 스캔한 상품 자동 등록 리스트 · 상태 선택 (일치·불일치·유통기한 임박)
// 하단: 전체 품목일치 · 품목불일치 최종 확인

import React, { useEffect, useMemo, useState } from "react";
import {
  ScanLine, Loader2, AlertCircle, PackagePlus, CheckCircle2, XCircle, Clock,
  Trash2, Minus, Plus, RotateCcw, ClipboardCheck, ClipboardX,
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

// 2026-07-29 · 사용자 요청 · 일치/불일치는 배타 (하나만) · 유통기한임박은 독립 toggle
type ItemStatus = "pending" | "match" | "mismatch";

interface ArrivalItem {
  key: string;              // 리스트 key (barcode + timestamp)
  code: string;             // 스캔된 바코드
  product: ProductInfo | null;
  qty: number;              // 실제 입고 수량
  status: ItemStatus;       // 일치/불일치 (배타)
  expiring: boolean;        // 유통기한 임박 (독립 toggle)
  addedAt: number;
}

const STATUS_META: Record<ItemStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  pending:   { label: "미확인",       color: "text-slate-500",   bg: "bg-slate-100",   border: "border-slate-300",   icon: <ClipboardCheck size={12} /> },
  match:     { label: "수량일치",     color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-400", icon: <CheckCircle2 size={12} /> },
  mismatch:  { label: "수량불일치",   color: "text-rose-700",    bg: "bg-rose-100",    border: "border-rose-400",    icon: <XCircle size={12} /> },
};

export const ProductArrivalPage: React.FC<ProductArrivalPageProps> = ({
  onBack, authSession, onNavigate, onLogout,
}) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [items, setItems] = useState<ArrivalItem[]>([]);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [finalDecision, setFinalDecision] = useState<"all_match" | "has_mismatch" | null>(null);
  // 2026-07-29 · 사용자 요청 · 품목 불일치 시 메모 (뭐가 모자란지 등)
  const [mismatchMemo, setMismatchMemo] = useState<string>("");
  // 2026-07-29 · 사용자 요청 · DB 저장
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 2026-07-29 · 사용자 요청 · 실재고입력 페이지처럼 스캔한 상품 정보 좌측 표시
  const [lastScannedProduct, setLastScannedProduct] = useState<ProductInfo | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  useEffect(() => { loadZBar(); }, []);
  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
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
    // 이미 리스트에 있으면 수량 증가 (같은 코드 · pending 상태 우선)
    // 2026-07-29 · React 원칙 · updater 내 side-effect setState 금지 (StrictMode 2회 실행 방지)
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNavHeader
        activePage="productarrival"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          items.length > 0 ? (
            <button onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition cursor-pointer">
              <RotateCcw size={12} /> 초기화
            </button>
          ) : undefined
        }
      />

      {toast && (
        <div className="fixed top-5 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
          title="입고 상품 바코드 스캔"
        />
      )}

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 flex flex-col lg:flex-row gap-3 sm:gap-4">
        {/* 좌측 · 스캐너 + 요약 (모바일: 위 · 데스크탑: 왼쪽 sticky) */}
        <section className="lg:w-[340px] lg:shrink-0 flex flex-col gap-3 lg:sticky lg:top-3 lg:self-start">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col items-center gap-3">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-sky-50 border-2 border-sky-200 flex items-center justify-center shrink-0">
              <PackagePlus size={30} className="text-sky-500" />
            </div>
            <div className="text-center">
              <p className="text-base sm:text-lg font-black text-slate-800">상품 입고 검수</p>
              <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 leading-relaxed">
                거래명세표의 물품을 스캔해 등록하고<br />수량·유통기한을 확인하세요
              </p>
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              disabled={mapLoading}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 py-3.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 text-white font-black rounded-2xl shadow-md transition cursor-pointer text-[15px]"
            >
              {mapLoading ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
              {mapLoading ? "상품 정보 로딩..." : "바코드 스캔"}
            </button>
            {notFoundCode && !lastScannedProduct && (
              <div className="w-full flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[12px] leading-tight min-w-0">
                  <p className="font-black text-amber-800">미등록 상품 코드</p>
                  <p className="tabular-nums text-amber-700 break-all mt-0.5">{notFoundCode}</p>
                </div>
              </div>
            )}
            {/* 2026-07-29 · 사용자 요청 · 스캔한 상품 정보 좌측 표시 (실재고입력 페이지 패턴) */}
            {lastScannedProduct && (
              <div className="w-full flex flex-col gap-2 px-3.5 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">최근 스캔</span>
                  {lastScannedCode && (
                    <span className="text-[11px] tabular-nums text-emerald-600 ml-auto">#{lastScannedCode}</span>
                  )}
                </div>
                <p className="text-[15px] font-black text-slate-800 break-words whitespace-normal leading-snug">
                  {lastScannedProduct.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  {lastScannedProduct.spec && (
                    <span className="font-bold text-slate-600 break-words whitespace-normal">
                      {lastScannedProduct.spec}
                    </span>
                  )}
                  {lastScannedProduct.supplier && (
                    <span className="inline-flex items-center gap-1 font-bold text-sky-700 bg-white border border-sky-200 rounded-md px-2 py-0.5">
                      🏢 {lastScannedProduct.supplier}
                    </span>
                  )}
                </div>
                {(lastScannedProduct.current_stock != null || lastScannedProduct.sale_price != null) && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 mt-1 border-t border-emerald-200 text-[12px]">
                    {lastScannedProduct.current_stock != null && (
                      <span className="text-slate-600 font-semibold">
                        현재고 <span className="font-black text-amber-700 tabular-nums text-[13px]">{Number(lastScannedProduct.current_stock).toLocaleString()}</span>
                      </span>
                    )}
                    {lastScannedProduct.sale_price != null && Number(lastScannedProduct.sale_price) > 0 && (
                      <span className="text-slate-600 font-semibold">
                        판매가 <span className="font-black text-orange-700 tabular-nums text-[13px]">₩{Number(lastScannedProduct.sale_price).toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 요약 카운트 카드 · 모바일에서도 항상 노출 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <SummaryPill label="총건수" value={counts.total} valueClass="text-slate-800" />
              <SummaryPill label="일치" value={counts.match} valueClass="text-emerald-600" />
              <SummaryPill label="불일치" value={counts.mismatch} valueClass="text-rose-600" />
              <SummaryPill label="기한임박" value={counts.expiring} valueClass="text-amber-600" />
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[12px]">
              <span className="text-slate-500 font-bold">총 입고 수량</span>
              <span className="font-black text-slate-800 tabular-nums text-[14px]">{counts.totalQty}개</span>
            </div>
          </div>
        </section>

        {/* 우측 · 자동 등록 리스트 + 최종 확인 */}
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50/60 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={15} className="text-sky-600" />
                <span className="text-[14px] font-black text-slate-800">등록된 입고 상품</span>
                <span className="text-[12px] font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 tabular-nums">
                  {items.length}건
                </span>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-14 sm:py-20 text-slate-400">
                <PackagePlus size={36} className="text-slate-300" />
                <p className="text-[14px] font-black">스캔한 상품이 여기에 표시됩니다</p>
                <p className="text-[13px] text-slate-400">바코드 스캔 → 자동 등록</p>
              </div>
            ) : (
              /* 2026-07-29 · 리스트(표) 형식 원복 · 상태 버튼 줄바꿈 (사용자 요청 · "저번처럼 · 일치/불일치/기한임박 줄바꿈") */
              <div className="flex-1 overflow-auto max-h-[62vh] lg:max-h-[68vh]">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-slate-50 z-10 border-b-2 border-slate-200 shadow-sm">
                    <tr className="text-[12px] font-black text-slate-500 tracking-tight">
                      <th className="text-left px-2 py-2 w-16">입고일</th>
                      <th className="text-left px-2 py-2 w-20 sm:w-28">공급사</th>
                      <th className="text-left px-2 py-2">상품명</th>
                      <th className="text-center px-2 py-2 w-24">갯수</th>
                      <th className="text-center px-2 py-2 w-40">상태</th>
                      <th className="text-center px-1 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => {
                      const isRecent = it.key === lastAddedKey;
                      const d = new Date(it.addedAt);
                      const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      const stripeCls =
                        it.status === "match"    ? "border-l-4 border-l-emerald-500" :
                        it.status === "mismatch" ? "border-l-4 border-l-rose-500" :
                        it.expiring              ? "border-l-4 border-l-amber-500" :
                                                   "border-l-4 border-l-transparent";
                      return (
                        <tr key={it.key}
                          className={`transition ${isRecent ? "bg-sky-50/70" : "hover:bg-slate-50/60"} ${stripeCls}`}>
                          {/* 입고일 */}
                          <td className="px-2 py-2 align-top text-[12px] font-bold text-slate-600 tabular-nums leading-tight break-words whitespace-normal">
                            {arrivedAt}
                          </td>
                          {/* 공급사 */}
                          <td className="px-2 py-2 align-top text-[12px] font-bold text-sky-700 leading-tight break-words whitespace-normal">
                            {it.product?.supplier ?? "-"}
                          </td>
                          {/* 상품명 · 규격 · 코드 */}
                          <td className="px-2 py-2 align-top">
                            <p className="text-[14px] font-black text-slate-800 break-words whitespace-normal leading-snug">
                              {it.product?.name ?? "(미등록 상품)"}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {it.product?.spec && (
                                <span className="text-[11px] text-slate-600 font-bold break-words whitespace-normal">{it.product.spec}</span>
                              )}
                              <span className="text-[11px] text-slate-400 tabular-nums">#{it.code}</span>
                            </div>
                          </td>
                          {/* 갯수 · 상하 pinch 버튼 */}
                          <td className="px-2 py-2 align-top">
                            <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg">
                              <button onClick={() => updateQty(it.key, -1)}
                                className="w-7 h-8 flex items-center justify-center rounded-l-lg text-slate-700 hover:bg-white active:bg-slate-100 transition cursor-pointer"
                                title="수량 -1">
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                value={it.qty}
                                onChange={(e) => setQtyDirect(it.key, Number(e.target.value) || 0)}
                                className="w-10 h-8 text-center bg-transparent text-[14px] font-black tabular-nums focus:outline-none focus:bg-white"
                              />
                              <button onClick={() => updateQty(it.key, 1)}
                                className="w-7 h-8 flex items-center justify-center rounded-r-lg text-slate-700 hover:bg-white active:bg-slate-100 transition cursor-pointer"
                                title="수량 +1">
                                <Plus size={13} />
                              </button>
                            </div>
                          </td>
                          {/* 상태 · match/mismatch 배타 (하나만) + expiring 독립 toggle */}
                          <td className="px-2 py-2 align-top">
                            <div className="flex flex-wrap gap-1 items-stretch">
                              {(["match", "mismatch"] as ItemStatus[]).map((s) => {
                                const meta = STATUS_META[s];
                                const active = it.status === s;
                                return (
                                  <button key={s}
                                    onClick={() => setStatus(it.key, active ? "pending" : s)}
                                    className={`inline-flex items-center gap-1 min-h-[32px] px-2 py-1 rounded-md border-2 font-black text-[11px] transition cursor-pointer active:scale-95 ${
                                      active
                                        ? `${meta.bg} ${meta.color} ${meta.border} shadow-sm`
                                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                                    }`}
                                    title={`${meta.label} ${active ? "on" : "off"} · 일치/불일치 하나만 선택`}
                                  >
                                    {meta.icon}
                                    <span>{meta.label}</span>
                                  </button>
                                );
                              })}
                              {/* 유통기한 임박 · 독립 toggle · match/mismatch 와 병행 가능 */}
                              <button
                                onClick={() => toggleExpiring(it.key)}
                                className={`inline-flex items-center gap-1 min-h-[32px] px-2 py-1 rounded-md border-2 font-black text-[11px] transition cursor-pointer active:scale-95 ${
                                  it.expiring
                                    ? "bg-amber-100 text-amber-700 border-amber-400 shadow-sm"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                                }`}
                                title={`유통기한임박 ${it.expiring ? "on" : "off"} · 독립 toggle`}
                              >
                                <Clock size={12} />
                                <span>유통기한임박</span>
                              </button>
                            </div>
                          </td>
                          {/* 삭제 */}
                          <td className="px-1 py-2 text-center align-top">
                            <button
                              onClick={() => removeItem(it.key)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer mx-auto"
                              title="삭제"
                            >
                              <Trash2 size={14} />
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

          {/* 최종 확인 카드 · 모든 항목 상태 결정된 후 활성화 */}
          <div className={`bg-white rounded-2xl border-2 shadow-sm p-4 sm:p-5 transition ${
            allDecided ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200 opacity-80"
          }`}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
              <span className="text-[13px] sm:text-[14px] font-black text-slate-800">최종 확인 · 거래명세표 대조</span>
              {!allDecided && items.length > 0 && (
                <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5">
                  {counts.pending}건 상태 미결정
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-600 mb-3 leading-relaxed">
              모든 항목의 상태를 지정한 뒤 거래명세표와 실제 입고 물품의 최종 일치 여부를 선택하세요.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setFinalDecision("all_match")}
                disabled={!allDecided}
                className={`inline-flex items-center justify-center gap-2 min-h-[52px] py-3 rounded-xl font-black text-[14px] sm:text-[15px] border-2 transition cursor-pointer disabled:cursor-not-allowed active:scale-95 ${
                  finalDecision === "all_match"
                    ? "bg-emerald-500 text-white border-emerald-600 shadow-md"
                    : allDecided
                      ? "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      : "bg-slate-50 text-slate-300 border-slate-200"
                }`}
              >
                <ClipboardCheck size={17} /> 전체 품목일치
              </button>
              <button
                onClick={() => setFinalDecision("has_mismatch")}
                disabled={!allDecided}
                className={`inline-flex items-center justify-center gap-2 min-h-[52px] py-3 rounded-xl font-black text-[14px] sm:text-[15px] border-2 transition cursor-pointer disabled:cursor-not-allowed active:scale-95 ${
                  finalDecision === "has_mismatch"
                    ? "bg-rose-500 text-white border-rose-600 shadow-md"
                    : allDecided
                      ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50"
                      : "bg-slate-50 text-slate-300 border-slate-200"
                }`}
              >
                <ClipboardX size={17} /> 품목 불일치 있음
              </button>
            </div>
            {/* 2026-07-29 · 사용자 요청 · 품목 불일치 시 메모칸 · 뭐가 모자란지 · POST body.note 로 전달 */}
            {finalDecision === "has_mismatch" && (
              <div className="mt-3 flex flex-col gap-1.5">
                <label className="text-[12px] font-black text-rose-700 flex items-center gap-1">
                  <ClipboardX size={13} /> 품목이상 상세 · 뭐가 모자란지 · 수량이 얼마나 다른지 등
                </label>
                <textarea
                  value={mismatchMemo}
                  onChange={(e) => setMismatchMemo(e.target.value)}
                  rows={2}
                  placeholder="예) 박카스디 10병 · 3개 부족 · 명세표 20 실물 17"
                  className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-[13px] focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none"
                />
              </div>
            )}
            {finalDecision && (
              <div className={`mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] sm:text-[13px] font-black border-2 ${
                finalDecision === "all_match"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-rose-50 text-rose-700 border-rose-300"
              }`}>
                {finalDecision === "all_match" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                최종 판정: {finalDecision === "all_match" ? "거래명세표와 실제 입고 물품 완전 일치" : "거래명세표와 실제 입고 불일치 존재"}
              </div>
            )}
            {/* 2026-07-29 · DB 저장 버튼 (사용자 요청) */}
            {finalDecision && (
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={async () => {
                    if (saveStatus === "saving") return;
                    setSaveStatus("saving"); setSaveError(null);
                    try {
                      const res = await fetch("/api/product-arrivals", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          checked_by: authSession?.employeeName ?? "익명",
                          checked_by_id: authSession?.employeeId ?? null,
                          final_decision: finalDecision,
                          // 2026-07-29 · 사용자 요청 · 품목이상 메모 · 서버 note 컬럼 재사용
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
                        throw new Error(b.error ?? `저장 실패 (${res.status})`);
                      }
                      const j = await res.json();
                      setSavedId(j.id ?? null);
                      setSaveStatus("done");
                      showToast("✅ DB에 저장 완료");
                    } catch (e: any) {
                      setSaveError(e?.message ?? "저장 실패");
                      setSaveStatus("error");
                    }
                  }}
                  disabled={saveStatus === "saving" || saveStatus === "done"}
                  className={`w-full min-h-[56px] py-3.5 rounded-xl font-black text-[15px] sm:text-[16px] transition cursor-pointer disabled:cursor-not-allowed active:scale-95 shadow-md ${
                    saveStatus === "done"
                      ? "bg-emerald-500 text-white"
                      : saveStatus === "error"
                        ? "bg-rose-500 text-white hover:bg-rose-600"
                        : "bg-sky-600 hover:bg-sky-700 text-white"
                  }`}
                >
                  {saveStatus === "saving" ? "등록 중..." :
                   saveStatus === "done"   ? `✅ 등록됨 (ID: ${savedId ?? "-"})` :
                   saveStatus === "error"  ? "다시 등록" :
                   "📦 전체 등록"}
                </button>
                {saveError && (
                  <p className="text-[12px] text-rose-600 font-semibold">{saveError}</p>
                )}
                {saveStatus === "done" && (
                  <p className="text-[12px] text-slate-500">저장 완료. 발주/사입관리 · 입고매칭 탭에서 발주 대비 확인 가능.</p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

interface SummaryPillProps { label: string; value: number; valueClass: string }
const SummaryPill: React.FC<SummaryPillProps> = ({ label, value, valueClass }) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-[11px] font-bold text-slate-500">{label}</span>
    <span className={`text-[16px] font-black tabular-nums ${valueClass}`}>{value}</span>
  </div>
);

interface StatusToggleProps {
  status: ItemStatus;
  active: boolean;
  onToggle: () => void;
}
const StatusToggle: React.FC<StatusToggleProps> = ({ status, active, onToggle }) => {
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
