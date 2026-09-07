// 상품입고 검수 페이지 · 2026-07-30 · Premium UI Redesign
// 목적: 거래명세표와 실제 입고물품·개수 일치 확인
// 벤치마크: Vercel Dashboard · Linear · Stripe · shadcn/ui
// 좌측: 바코드 스캔 · 상품정보 · 요약
// 우측: 스캔 상품 자동 등록 리스트 · 상태 선택
// 하단: 전체 품목일치 · 품목불일치 최종 확인

// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { PAGE_CONTAINER_CLS, CARD_BASE } from "../../styles/tokens";
import { useConfirm } from "../../hooks/useConfirm";
import { SplitPanel } from "../common/SplitPanel";
import {
  ScanLine, AlertCircle, PackagePlus, Clock,
  Minus, Plus, RotateCcw, ClipboardCheck,
  Barcode, Building2, Box, Hash, ArrowUpDown, ArrowUp, ArrowDown,
  Package,
} from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { BarcodeScanner } from "../BarcodeScanner";
import { loadZBar } from "../BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  addCachedProduct,
  type ProductInfo,
} from "../../lib/productsCache";
// 2026-08-25 · 프레임워크 · 상품 정규화 + API fallback 공통 유틸
import { resolveProduct } from "../../lib/normalizeProduct";
// 2026-09-07 · 상품정보 페이지가 사용하는 등록 모달 재사용
import { ProductCreateModal } from "../ProductInfoPage/ProductCreateModal";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
// 2026-08-09 · 사용자 요청 · 상품 검색·확인 · 리스트 등록 (공통)
import { ProductSearchInput } from "../common/features/ProductSearchInput";
import { IconTile } from "../common/IconTile";
import { AccentBar } from "../common/AccentBar";
import { ArrivalRowCard } from "./ArrivalRowCard";
import { useToast } from "../../hooks/useToast";
// 2026-09-03 · #108 · 사용자 리포트 · 미분류 → 상품등록 페이지 이동 flow (ScanPage 와 동일 패턴)
import { setScanPendingProductCode } from "../../hooks/useScanUnregisteredMode";
// 2026-08-21 · Framework Phase 4 · large-file 분리 · helpers 이관
import {
  Toast,
  SummaryPill,
  SortIcon,
  STATUS_META,
  ARRIVAL_CMP,
  type ItemStatus,
  type ArrivalItem,
  type ArrivalSortKey,
} from "./helpers";
// 2026-08-22 · Framework Phase 4 · 3섹션 별도 컴포넌트 이관 + 타입
import {
  FinalDecisionCard, ArrivalHistoryTab, ArrivalDetailModal, ExpiryListTab,
  type ArrivalHistoryRow, type ArrivalHistoryDetail,
} from "./ProductArrivalPage.panels";

interface ProductArrivalPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** 2026-08-03 · true 이면 AppNavHeader 및 min-h-screen 컨테이너 skip · 부모 서브탭 임베드 모드 */
  embedded?: boolean;
}

// 2026-08-21 · Framework Phase 4 · helpers.tsx 로 분리 (Toast · SummaryPill · SortIcon · STATUS_META · ARRIVAL_CMP · ItemStatus · ArrivalItem · ArrivalSortKey)

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const ProductArrivalPage: React.FC<ProductArrivalPageProps> = ({
  onBack, authSession, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();

  // 2026-08-03 · 내부 탭 (상품입고 / 입고내역) · 입고내역 로직 · OrderManagePage 에서 이동
  const [arrivalTab, setArrivalTab]             = useState<"input" | "history" | "expiry">("input");
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [mapLoading, setMapLoading]             = useState(false);
  const [items, setItems]                       = useState<ArrivalItem[]>([]);
  const [lastAddedKey, setLastAddedKey]         = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode]         = useState<string | null>(null);
  const [finalDecision, setFinalDecision]       = useState<"all_match" | "has_mismatch" | null>(null);
  const [mismatchMemo, setMismatchMemo]         = useState<string>("");
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError]               = useState<string | null>(null);
  // 2026-08-29 · #198 Phase 3 · savedId · string (groupId `YYYYMMDD_verifiedBy`) or 레거시 number 호환
  const [savedId, setSavedId]                   = useState<string | number | null>(null);
  // 2026-08-16 · useToast 프레임워크 · setTimeout 자동 관리
  const { toast: _toastObj, show: _showToast, showError } = useToast(2200);
  const toast = _toastObj?.message ?? null;
  const [lastScannedProduct, setLastScannedProduct] = useState<ProductInfo | null>(null);
  const [lastScannedCode, setLastScannedCode]   = useState<string | null>(null);
  // 2026-09-07 · 상품등록 모달 (상품정보 페이지의 ProductCreateModal 재사용)
  const [createOpen, setCreateOpen]             = useState(false);
  const canManageProducts =
    authSession?.role === "admin" ||
    authSession?.role === "superadmin" ||
    (authSession?.role === "manager" && (authSession?.level ?? 0) >= 5);

  // ─── 입고내역(history) state · OrderManagePage 에서 이동 (2026-08-03) ───
  // 2026-08-22 · Framework Phase 4 · 타입은 ProductArrivalPage.panels.tsx 로 이관
  const [arrivals, setArrivals] = useState<ArrivalHistoryRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalDays, setArrivalDays] = useState<7 | 30 | 90>(30);
  // 2026-08-29 · #198 Phase 3 · selectedArrivalId · string (groupId) or 레거시 number 호환
  const [selectedArrivalId, setSelectedArrivalId] = useState<string | number | null>(null);
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
  // 2026-09-07 · 사용자 지시 · 입고내역 자동 업데이트 · 어느 탭이든 검수 저장·상품 변경 시 즉시 리로드
  //   · product-mutated 이벤트 · 검수 저장 (POST /api/product-arrivals) 후 · 자동 dispatch
  useEffect(() => {
    const onMutated = () => { void loadArrivals(); };
    window.addEventListener("product-mutated", onMutated);
    return () => window.removeEventListener("product-mutated", onMutated);
  }, [loadArrivals]);
  useEffect(() => {
    if (selectedArrivalId == null) { setArrivalDetail(null); return; }
    setArrivalDetailLoading(true);
    api.get<any>(`/api/product-arrivals/${selectedArrivalId}`)
      // 서버: { header, items } 중첩 → flat ArrivalHistoryDetail 로 병합
      .then(({ data }) => setArrivalDetail(
        data?.header ? { ...data.header, items: data.items ?? [] } : (data ?? null)
      ))
      .catch(() => setArrivalDetail(null))
      .finally(() => setArrivalDetailLoading(false));
  }, [selectedArrivalId]);
  const deleteArrival = async (id: string | number) => {
    if (!await confirm({ message: "이 입고내역을 삭제하시겠습니까? (관련 아이템 모두 삭제)", danger: true })) return;
    try {
      await api.del(`/api/product-arrivals/${id}`);
      setArrivals(prev => prev.filter(a => a.id !== id));
      if (selectedArrivalId === id) setSelectedArrivalId(null);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "네트워크 오류");
      showError(`삭제 실패: ${msg}`);
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

  // 2026-08-25 · 프레임워크화 · resolveProduct 공통 helper 사용 (ScanPage 동일 패턴)
  const handleScan = async (result: string, preloadedProduct?: any | null) => {
    setScannerOpen(false);
    setNotFoundCode(null);
    if (!isProductsLoaded()) {
      setMapLoading(true);
      await getProductsMap();
      setMapLoading(false);
    }
    const found = await resolveProduct(result, preloadedProduct);
    if (!found) {
      setNotFoundCode(result);
      setLastScannedProduct(null);
      setLastScannedCode(result);
      showToast("등록되지 않은 상품");
      return;
    }
    // 2026-09-07 · 사용자 지시 · 상품 있지만 분류코드(category_code) 없으면 등록 유도
    //   · confirm · 취소 시 · 리스트 그냥 추가 · 확인 시 · 상품등록 모달 (분류코드 채워서 재등록)
    const cat = String((found as any).category ?? (found as any).category_code ?? "").trim();
    if (!cat && canManageProducts) {
      const ok = await confirm({
        title: "비분류 상품",
        message: `분류코드가 없는 상품입니다.\n#${result}\n${(found as any).name ?? ""}\n\n지금 등록 (분류코드 지정) 하시겠습니까?`,
      });
      if (ok) {
        setNotFoundCode(result);
        setCreateOpen(true);
        return;
      }
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
      // 2026-09-07 · 사용자 지시 · 신규 등록 상품 · products.purchase_price 를 단가 기본값
      const productPurchasePrice = Number((found as any).purchase_price ?? 0);
      // 2026-09-07 · 사용자 지시 · 매장구역 자동 채움 · product.location 첫 zone
      const productLocationStr = (found as any).location ?? (found as any).display_location ?? null;
      const firstZone = productLocationStr
        ? String(productLocationStr).split(/[\/,·]/).map(s => s.trim()).filter(Boolean)[0] ?? null
        : null;
      const newItem: ArrivalItem = {
        key: `${result}-${Date.now()}`,
        code: result,
        product: found,
        qty: 1,
        status: "pending",
        expiring: false,
        addedAt: Date.now(),
        location: firstZone,
        // 단가 기본값 · products.purchase_price · 없으면 아래 purchase-history 로 fallback
        unitPrice: productPurchasePrice > 0 ? productPurchasePrice : null,
        expiryDate: null,
      };
      addedKey = newItem.key;
      setItems(prev => [newItem, ...prev]);
      // 2026-09-03 · #78 · 사입 단가 자동 fill · fire-and-forget
      //   · /api/products/purchase-history · latest_unit_price 조회 · 응답 후 setItems 업데이트
      const autoFillKey = newItem.key;
      (async () => {
        try {
          const { data: j } = await api.get<any>(`/api/products/purchase-history?codes=${encodeURIComponent(result)}&limit=1`);
          const latestPrice = j?.history?.[result]?.latest_unit_price;
          if (latestPrice != null && Number.isFinite(Number(latestPrice))) {
            setItems(prev => prev.map(it =>
              it.key === autoFillKey && it.unitPrice == null ? { ...it, unitPrice: Number(latestPrice) } : it
            ));
          }
        } catch { /* silent · 자동 fill 실패해도 수동 입력 가능 */ }
      })();
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

  // 2026-09-01 · #93 · toggleExpiring 제거 · 명세서 상태 2종만 (일치·불일치)
  //   · expiring 필드는 데이터 스키마 하위호환 위해 유지 (신규 아이템 · false 기본값)
  //   · 서버 payload 도 유지 · 과거 기록 · 하위 호환 · 회귀 zero

  // 2026-09-01 · #92 · 입고 구역 지정 핸들러
  const setLocation = (key: string, location: string | null) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, location } : it
    ));
  };

  const setUnitPrice = (key: string, unitPrice: number | null) => {
    setItems(prev => prev.map(it => it.key === key ? { ...it, unitPrice } : it));
  };
  const setExpiryDate = (key: string, expiryDate: string | null) => {
    setItems(prev => prev.map(it => it.key === key ? { ...it, expiryDate } : it));
  };
  const setExpiring = (key: string, expiring: boolean) => {
    setItems(prev => prev.map(it =>
      it.key === key ? { ...it, expiring, expiryDate: expiring ? it.expiryDate : null } : it
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

  const allDecided = counts.total > 0 && counts.pending === 0
    && items.every(it => it.qty > 0 && !!it.location && it.unitPrice != null && it.unitPrice > 0);
  // 2026-08-29 · 사용자 지시 · finalDecision 자동 도출 (수동 버튼 제거 · UX 슬림)
  useEffect(() => {
    if (!allDecided) {
      if (finalDecision !== null) setFinalDecision(null);
      return;
    }
    const next = counts.mismatch > 0 ? "has_mismatch" : "all_match";
    if (finalDecision !== next) setFinalDecision(next);
  }, [allDecided, counts.mismatch, finalDecision]);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col bg-[#F4F7FA] min-h-0" : "min-h-screen bg-[#F4F7FA] flex flex-col"}>

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

      {/* ── Page header strip (standalone only) ── */}
      {!embedded && (
        <div className="bg-white border-b border-line shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className={`${PAGE_CONTAINER_CLS} px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3`}>
            <AccentBar h={22} className="shrink-0" />
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-deep
              flex items-center justify-center shadow-sm shrink-0">
              <PackagePlus size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[17px] sm:text-[19px] font-bold text-ink leading-tight tracking-tight">상품 입고 검수</h1>
              <p className="text-[15px] sm:text-[16px] text-ink-soft mt-0.5 leading-tight">
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
      )}

      {/* ── FilterBar (매입페이지 스타일 · CARD_BASE) ── */}
      <div className={`${PAGE_CONTAINER_CLS} px-3 sm:px-4 lg:px-6 ${embedded ? "py-3" : "pt-3"} shrink-0`}>
        <div className={`${CARD_BASE} px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2`}>
          {embedded && (
            <>
              <AccentBar />
              <div className="w-7 h-7 rounded-lg bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
                <PackagePlus size={13} className="text-white" />
              </div>
              <span className="text-[15px] font-bold text-ink tracking-tight">상품 입고 검수</span>
              {arrivalTab === "input" && counts.total > 0 && (
                <>
                  <StatusPill tone="brand" size="md">{counts.total}건 / {counts.totalQty}개</StatusPill>
                  {counts.pending > 0 && (
                    <StatusPill tone="amber" size="md" dot pulse>{counts.pending}건 미결</StatusPill>
                  )}
                </>
              )}
            </>
          )}
          {/* 탭 버튼 */}
          <div className={`${embedded ? "ml-auto" : ""} inline-flex items-center rounded-md border border-line bg-zinc-100 p-0.5 gap-px`}>
            {([
              { k: "input"   as const, label: "상품입고",    icon: PackagePlus, color: "sky"    },
              { k: "history" as const, label: "입고내역",    icon: Package,     color: "indigo" },
              { k: "expiry"  as const, label: "유통기한 임박", icon: Clock,       color: "rose"   },
            ]).map(({ k, label, icon: Icon, color }) => {
              const active = arrivalTab === k;
              const activeColor =
                color === "sky"   ? "bg-sky-500 text-white shadow-sm" :
                color === "rose"  ? "bg-rose-500 text-white shadow-sm" :
                                    "bg-brand-deep text-white shadow-sm";
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setArrivalTab(k)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-medium transition cursor-pointer whitespace-nowrap ${
                    active ? `font-semibold ${activeColor}` : "text-zinc-500 hover:text-zinc-700 hover:bg-white"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              );
            })}
          </div>
          {/* 초기화 버튼 (embedded · 입고 탭 · 아이템 있을 때) */}
          {embedded && arrivalTab === "input" && items.length > 0 && (
            <button
              onClick={resetAll}
              className="ml-1 flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-bold
                text-zinc-400 hover:text-zinc-700 bg-zinc-50 border border-line
                hover:bg-white hover:border-zinc-300 transition cursor-pointer"
            >
              <RotateCcw size={11} />초기화
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout (arrivalTab === "input") ── */}
      {arrivalTab === "input" && (
      <main className={`flex-1 min-h-0 ${PAGE_CONTAINER_CLS} px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col`}>
        <SplitPanel
          className="flex-1 min-h-0"
          storageKey="productArrivalPage.split5050.v2"
          defaultWidth={typeof window !== "undefined" ? Math.round(window.innerWidth * 0.5) : 600}
          minWidth={280}
          maxWidth={2400}
          dividerColor="sky"
          wrapLeft={false}
          wrapRight={false}
          leftClassName="flex flex-col gap-4 overflow-y-auto"
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
              <AccentBar className="shrink-0" />
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
                <p className="text-[18px] font-bold text-ink leading-tight tracking-tight">바코드 스캔</p>
                <p className="text-[15px] text-ink-soft mt-0.5 leading-tight">
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
                  py-3.5 rounded-xl font-bold text-[16px] sm:text-[17px] text-white
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
                  ? <><Spinner size={18} /> 상품 정보 로딩...</>
                  : <><ScanLine size={18} /> 바코드 스캔</>
                }
              </button>

              {/* 2026-08-09 · 상품 검색 · 바코드 스캔 버튼 아래 (사용자 요청) */}
              {/* 2026-08-25 · 사용자 지시 · onSelect 에 product 객체도 함께 전달 · 상품명 정규화 */}
              <ProductSearchInput
                accent="sky"
                placeholder="상품명·코드 검색"
                onSelect={(code, p) => handleScan(code, p)}
              />

              {/* 2026-09-07 · 사용자 지시 · 상품등록 버튼 · 모달 (상품정보 페이지의 ProductCreateModal 재사용) */}
              {canManageProducts && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2
                    py-2.5 rounded-xl font-bold text-[15px] text-brand-deep
                    bg-white border border-brand-deep/25
                    hover:bg-brand-deep/5 hover:border-brand-deep/40
                    active:bg-brand-deep/10
                    shadow-sm hover:shadow transition-colors cursor-pointer"
                >
                  <PackagePlus size={17} />
                  상품등록
                </button>
              )}

              {/* 미등록 상품 경고 + 상품등록 모달 열기 */}
              {notFoundCode && !lastScannedProduct && (
                <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200/80" padding="sm" className="flex items-start gap-2.5">
                  <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-amber-800 leading-none">미등록 상품 코드</p>
                    <p className="text-[17px] font-mono tabular-nums text-amber-700 break-all mt-1.5
                      bg-amber-100/60 px-2 py-1 rounded-md">
                      {notFoundCode}
                    </p>
                    {canManageProducts ? (
                      <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[15px] font-bold shadow-sm transition cursor-pointer"
                      >
                        <PackagePlus size={14} />
                        상품등록
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm({ message: `미등록 코드입니다.\n#${notFoundCode}\n\n상품등록 페이지로 이동할까요?` });
                          if (!ok) return;
                          setScanPendingProductCode(notFoundCode);
                          onNavigate?.("display");
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[15px] font-bold shadow-sm transition cursor-pointer"
                      >
                        📝 상품등록 페이지로 이동
                      </button>
                    )}
                  </div>
                </Card>
              )}

              {/* 2026-08-17 · 세련 · 마지막 스캔 카드 · 뉴트럴 body + StatusPill 헤더 */}
              {lastScannedProduct && (
                <div className="flex flex-col gap-3 px-3.5 py-3.5 rounded-2xl bg-white border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_2px_8px_rgba(10,46,74,0.06)]">

                  {/* 헤더 · StatusPill emerald + 상품코드 */}
                  <div className="flex items-center gap-2">
                    <StatusPill tone="emerald" size="sm" dot>최근 스캔</StatusPill>
                    {lastScannedCode && (
                      <span className="ml-auto text-[15px] font-mono tabular-nums text-ink-soft bg-zinc-50 border border-line px-2 py-0.5 rounded-md">
                        #{lastScannedCode}
                      </span>
                    )}
                  </div>

                  {/* 상품명 */}
                  <p className="text-[16px] sm:text-[17px] font-bold text-zinc-800
                    break-words whitespace-normal leading-snug -mt-0.5">
                    {lastScannedProduct.name}
                  </p>

                  {/* 규격 + 공급사 */}
                  <div className="flex flex-wrap items-center gap-2">
                    {lastScannedProduct.spec && (
                      <span className="inline-flex items-center gap-1.5 text-[17px] font-bold text-zinc-600
                        bg-white/80 border border-line/60 rounded-lg px-2 py-1">
                        <Box size={11} className="text-zinc-400" />
                        {lastScannedProduct.spec}
                      </span>
                    )}
                    {lastScannedProduct.supplier && (
                      <span className="inline-flex items-center gap-1.5 text-[17px] font-bold text-sky-700
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
                          <span className="text-[16px] font-semibold text-zinc-400 leading-none">현재고</span>
                          <span className="text-[17px] font-bold text-amber-700 tabular-nums leading-none">
                            {Number(lastScannedProduct.current_stock).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {lastScannedProduct.sale_price != null && Number(lastScannedProduct.sale_price) > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[16px] font-semibold text-zinc-400 leading-none">판매가</span>
                          <span className="text-[17px] font-bold text-orange-700 tabular-nums leading-none">
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
            {/* 2026-09-01 · #93 · 명세서 상태 2종만 (일치·불일치) · 기한임박 pill 제거 · 4→3 컬럼 */}
            <div className="grid grid-cols-3 gap-1">
              <SummaryPill label="총건수"  value={counts.total}    valueClass="text-zinc-800" />
              <SummaryPill label="일치"    value={counts.match}    valueClass="text-emerald-600" accent="hover:bg-emerald-50/60 rounded-xl transition" />
              <SummaryPill label="불일치"  value={counts.mismatch} valueClass="text-rose-600"    accent="hover:bg-rose-50/60 rounded-xl transition" />
            </div>
            <div className="mx-2 mt-1 pt-2.5 border-t border-zinc-100
              flex items-center justify-between">
              <span className="text-[17px] font-semibold text-zinc-400">총 입고 수량</span>
              <span className="text-[17px] font-bold text-zinc-800 tabular-nums">
                {counts.totalQty}<span className="text-[16px] font-semibold text-zinc-400 ml-0.5">개</span>
              </span>
            </div>
          </div>
        </>}
          right={<div className="flex-1 flex flex-col gap-3 min-h-0">

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 등록 리스트 + 최종 확인
        ══════════════════════════════════════════════════════ */}


          {/* ── 등록 리스트 카드 ── */}
          <div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* 테이블 헤더 바 */}
            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5
              border-b border-line/80
              bg-zinc-50/80
              rounded-t-2xl sticky top-0 z-10
              shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2.5">
                {/* 2026-08-18 · IconTile 확산 */}
                <IconTile icon={<ClipboardCheck size={14} />} tone="sky" size="md" />

                <span className="text-sm font-bold text-zinc-800">등록된 입고 상품</span>
                {items.length > 0 && (
                  <StatusPill tone="sky" size="md">{items.length}건</StatusPill>
                )}
              </div>
              {counts.pending > 0 && (
                <StatusPill tone="amber" size="md" dot pulse>{counts.pending}건 미결정</StatusPill>
              )}
            </div>

            {/* 빈 상태 */}
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                <div className="relative">
                  {/* 2026-08-19 · IconTile 2xl 확산 · Empty state */}
                  <IconTile icon={<Barcode size={28} className="text-zinc-300" />} tone="zinc" size="2xl" shape="rounded-2xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full
                    bg-sky-100 border-2 border-white flex items-center justify-center">
                    <Plus size={10} className="text-sky-500" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[17px] font-bold text-ink-soft">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-[15px] text-zinc-400 mt-1">바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : (
              /* 2026-08-18 · #상품입고 재설계 · 카드형 리스트 · 모바일/PC 통일 */
              <div className="flex-1 overflow-auto
                px-3 sm:px-4 py-3 flex flex-col gap-2 bg-zinc-50/30">
                {sortedItems.map((it) => (
                  <ArrivalRowCard
                    key={it.key}
                    item={it}
                    isRecent={it.key === lastAddedKey}
                    onUpdateQty={updateQty}
                    onSetQty={setQtyDirect}
                    onSetStatus={setStatus}
                    onRemove={removeItem}
                    onSetLocation={setLocation}
                    onSetUnitPrice={setUnitPrice}
                    onSetExpiryDate={setExpiryDate}
                    onSetExpiring={setExpiring}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · FinalDecisionCard */}
          <FinalDecisionCard
            items={items}
            allDecided={allDecided}
            pendingCount={counts.pending}
            finalDecision={finalDecision}
            mismatchMemo={mismatchMemo}
            saveStatus={saveStatus}
            saveError={saveError}
            savedId={savedId}
            setFinalDecision={setFinalDecision}
            setMismatchMemo={setMismatchMemo}
            onSave={async () => {
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
                    // it.product?.code = DB의 product_code (앞 0 제거된 정규화 버전)
                    // it.code = 바코드 원본 (앞 0 포함 가능) → DB 불일치 방지
                    product_code: it.product?.code ?? it.code,
                    product_name: it.product?.name ?? "",
                    supplier: it.product?.supplier ?? "",
                    qty: it.qty,
                    status: it.status,
                    expiring: it.expiring,
                    // 2026-09-01 · #92 · 입고 구역
                    location: it.location ?? null,
                    // 2026-09-03 · 사용자 지시 · 단가·유통기한 DB 저장 (매입 후 현재고 자동 반영)
                    unit_price: it.unitPrice != null ? Number(it.unitPrice) : null,
                    expiry_date: it.expiryDate ?? null,
                  })),
                });
                setSavedId(j?.id ?? null);
                setSaveStatus("done");
                window.dispatchEvent(new Event("product-mutated"));
                // 2026-09-07 · 사용자 지시 · 입고내역 자동 업데이트 · 저장 후 즉시 리로드
                void loadArrivals();
                showToast("DB에 저장 완료");
              } catch (e: unknown) {
                const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "저장 실패");
                setSaveError(msg);
                setSaveStatus("error");
              }
            }}
          />
        </div>}
        />
      </main>
      )}

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · ArrivalHistoryTab + ArrivalDetailModal */}
      {arrivalTab === "history" && (
        <ArrivalHistoryTab
          arrivals={arrivals}
          arrivalsLoading={arrivalsLoading}
          arrivalDays={arrivalDays}
          setArrivalDays={setArrivalDays}
          loadArrivals={loadArrivals}
          selectedArrivalId={selectedArrivalId}
          setSelectedArrivalId={setSelectedArrivalId}
          deleteArrival={deleteArrival}
        />
      )}
      {arrivalTab === "expiry" && <ExpiryListTab />}
      <ArrivalDetailModal
        selectedArrivalId={selectedArrivalId}
        arrivalDetail={arrivalDetail}
        arrivalDetailLoading={arrivalDetailLoading}
        onClose={() => setSelectedArrivalId(null)}
      />

      {/* 2026-09-07 · 상품등록 모달 · 상품정보 페이지의 ProductCreateModal 재사용 */}
      {canManageProducts && (
        <ProductCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          initialCode={notFoundCode ?? ""}
          initialBarcode={notFoundCode ?? ""}
          lockCode={!!notFoundCode}
          onCreated={async (code, product) => {
            setNotFoundCode(null);
            setCreateOpen(false);
            // 등록 직후 · 전체 필드 fresh fetch (purchase_price/category_code 등) · 자동 채움 회귀 방지
            try {
              const { data } = await api.get<any>(`/api/products/${encodeURIComponent(code)}`);
              if (data) {
                addCachedProduct(code, data);
                await handleScan(code, data);
                return;
              }
            } catch { /* fallback · 최소 필드 */ }
            addCachedProduct(code, {
              code,
              name: product?.product_name ?? "",
              spec: product?.spec ?? "",
              supplier: product?.supplier ?? null,
              location: product?.location ?? null,
            });
            void handleScan(code);
          }}
        />
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
