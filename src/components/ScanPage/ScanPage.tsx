// 실재고입력 (ScanPage) · 2026-08-03 리팩터 (Phase 3+4)
// 좌: 바코드 스캐너 + 최근 스캔 상품 + notFoundCode
// 우: 스캔한 상품 테이블 · 창고1/창고2/매장1/매장2/매장3 (5분리) · 매장별 구역 표시·편집 · 전체 등록
// real_map "/" 분할 → 매장1·매장2·매장3 구역 자동 배정 · 사용자 편집 가능
//
// 하위 호환:
//   - 서버 : warehouse_stock ← warehouse1Qty · store_stock ← store1Qty · store_stock_2 ← store2Qty (미러)
//   - 로드 : 새 컬럼 있으면 그대로 · 없으면 warehouse_stock → warehouse1Qty fallback
//
// DB 스키마 확장 필요 (사용자 실행):
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS warehouse1_stock INT;
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS warehouse2_stock INT;
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store3_stock INT;
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store1_zone TEXT;
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store2_zone TEXT;
//   ALTER TABLE inventory_checks ADD COLUMN IF NOT EXISTS store3_zone TEXT;

// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useRef, useState, useCallback } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
import { SplitPanel } from "../common/SplitPanel";
import {
  ScanLine, Loader2, AlertCircle, Package,
  CheckCircle2, RotateCcw, Warehouse, Store,
  MapPin, ArrowUpDown, ArrowUp, ArrowDown,
  SaveAll, Sparkles, History, X, Megaphone,
} from "lucide-react";
import { BarcodeScanner } from "../BarcodeScanner";
import { loadZBar } from "../BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  type ProductInfo,
} from "../../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-09 · 사용자 요청 · 상품 검색·확인 · 리스트 등록 (공통)
import { ProductSearchInput } from "../common/ProductSearchInput";
// ── 분리된 Row 컴포넌트 ──────────────────────────────────────
import { StockRowDesktop } from "./StockRowDesktop";
import type { StockRow } from "./stockRowTypes";
import { calcRowTotal, calcSlotTotal } from "./stockRowTypes";
import { useToast } from "../../hooks/useToast";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface ScanPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** 2026-08-03 · true 이면 AppNavHeader 및 min-h-screen 컨테이너 skip · 부모 서브탭 임베드 모드 */
  embedded?: boolean;
}

// ─────────────────────────────────────────────────────────────
// real_map 파싱 · "/" 기준 분할 → 매장1 · 매장2 · 매장3
// 예: "8A/냉/2B" → ["8A", "냉", "2B"]
//     "8A/냉"    → ["8A", "냉", null]
//     "9B"       → ["9B", null, null]
// ─────────────────────────────────────────────────────────────
function parseRealMap(realMap: string | null | undefined): [string | null, string | null, string | null] {
  if (!realMap) return [null, null, null];
  const parts = String(realMap).split("/").map(s => s.trim()).filter(Boolean);
  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
}

// StockRow 타입은 stockRowTypes.ts 에서 import (위 참조)

// 실재고 이력 · /api/inventory-checks 응답 요소 (부분)
interface InventoryHistoryRow {
  id: number;
  product_code: string;
  product_name?: string | null;
  warehouse_stock?: number | null;
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;
  store_stock?: number | null;
  store_stock_2?: number | null;
  store3_stock?: number | null;
  store1_zone?: string | null;
  store2_zone?: string | null;
  store3_zone?: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
  note?: string | null;
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
      bg-zinc-900/95 backdrop-blur-sm text-white text-xs font-bold
      shadow-[0_8px_32px_rgba(0,0,0,0.32)] border border-white/10"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
    {message}
  </div>
);

// ─────────────────────────────────────────────────────────────
// SortIcon
// ─────────────────────────────────────────────────────────────
const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown size={10} className="text-zinc-300 ml-0.5 inline" />;
  return dir === "asc"
    ? <ArrowUp size={10} className="text-teal-500 ml-0.5 inline" />
    : <ArrowDown size={10} className="text-teal-500 ml-0.5 inline" />;
};

// NumberInput·ZoneInput 은 StockRowDesktop / StockRowMobile 에서 로컬 정의
// (scanModal 은 직접 <input type="number"> 사용 · 별도 컴포넌트 불필요)

// ─────────────────────────────────────────────────────────────
// 정렬 비교 함수 (컴포넌트 외부 · 안정 참조)
// ─────────────────────────────────────────────────────────────
type ScanSortKey = "addedAt" | "name" | "supplier" | "realMap";
const SCAN_SORT_CMP: Record<ScanSortKey, Comparator<any>> = {
  addedAt:  (a, b) => a.addedAt - b.addedAt,
  name:     (a, b) => a.product.name.localeCompare(b.product.name, "ko"),
  supplier: (a, b) => ((a.product as any).supplier ?? "").localeCompare(((b.product as any).supplier ?? ""), "ko"),
  realMap:  (a, b) => {
    const ra = (a.product as any).realMap ?? (a.product as any).real_map ?? "";
    const rb = (b.product as any).realMap ?? (b.product as any).real_map ?? "";
    return String(ra).localeCompare(String(rb), "ko");
  },
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const ScanPage: React.FC<ScanPageProps> = ({
  onBack, authSession, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();
  // ── scanner
  const [scannerOpen, setScannerOpen]           = useState(false);
  const [mapLoading, setMapLoading]             = useState(false);
  // 2026-08-16 · useToast 프레임워크 · setTimeout 자동 관리
  const { toast: _toastObj, show: _showRawToast } = useToast(2200);
  const toast = _toastObj?.message ?? null;

  // ── 좌측 마지막 스캔 상태
  const [lastProduct, setLastProduct]           = useState<ProductInfo | null>(null);
  const [lastCode, setLastCode]                 = useState<string | null>(null);
  const [notFoundCode, setNotFoundCode]         = useState<string | null>(null);

  // ── 우측 테이블
  const [rows, setRows]                         = useState<StockRow[]>([]);
  const [lastAddedKey, setLastAddedKey]         = useState<string | null>(null);

  // ── 실재고 이력 조회 모달 · 상품별 과거 저장 내역
  const [historyModal, setHistoryModal]         = useState<{ code: string; name: string } | null>(null);
  const [historyRows, setHistoryRows]           = useState<InventoryHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading]     = useState(false);

  // ── T20/Phase 2 · 상품별 진열요청 · 각 행 [📢 요청] state (핸들러는 showToast 아래)
  const [requestingKey, setRequestingKey]       = useState<string | null>(null);

  // ── T-SCAN-1 (2026-08-05) · 바코드 스캔 즉시 상품정보 모달 팝업
  //   · 스캔 → 리스트 행 추가 (기존) + 이 모달 팝업 (신규)
  //   · 모달 안 [진열요청] 버튼 · [닫기] 버튼
  //   · 2026-08-10 · scanModal dead code 제거 (자동 open 로직 미사용 · 렌더 코드도 함께 삭제)

  // ── 전체 저장
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving" | "done" | "error">("idle");

  // 2026-08-10 · G · B1 · Cin7 3단 상태머신 · 검토 시트 (오입력 방지)
  const [reviewOpen, setReviewOpen] = useState(false);

  // 2026-08-10 · G · A4 · 스캔 자동 +1 (opt-in · localStorage · 기본 off)
  // 이미 리스트에 있는 상품 스캔 시 · 매장1 addQty +1 자동
  const AUTO_INC_KEY = "scanPage_autoIncrement";
  const [autoIncOn, setAutoIncOn] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_INC_KEY) === "1"; } catch { return false; }
  });
  const toggleAutoInc = () => {
    setAutoIncOn(v => {
      const next = !v;
      try { localStorage.setItem(AUTO_INC_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };
  const [saveError, setSaveError]               = useState<string | null>(null);
  const [savedCount, setSavedCount]             = useState<number>(0);

  // ── A5 · localStorage draft 복구 배너 표시 여부
  const [draftBanner, setDraftBanner]           = useState<boolean>(false);

  // ── 정렬 (T30-followup · useSortableTable)
  const { sorted: sortedRows, sortKey, sortDir, toggleSort: _toggleSort, setSort: _setSort } =
    useSortableTable<any, ScanSortKey>(rows, "addedAt", SCAN_SORT_CMP, "desc");
  const handleSort = (k: ScanSortKey) => {
    if (sortKey === k) _toggleSort(k);
    else _setSort(k, "desc");
  };

  useEffect(() => { loadZBar(); }, []);
  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
  }, []);

  // ── A5 · 마운트 시 localStorage draft 감지 (저장된 내용 있으면 복구 배너)
  const DRAFT_KEY = "scan_page_draft_rows";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDraftBanner(true);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── A5 · rows 변경 시 debounce 800ms 후 localStorage 저장
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        if (rows.length > 0) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(rows));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch { /* storage quota 등 무시 */ }
    }, 800);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [rows]);

  const showToast = useCallback((msg: string, ms = 2200) => _showRawToast(msg, ms), [_showRawToast]);

  // ── A5 · draft 복구 · 배너 [복구] 버튼 핸들러
  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed: StockRow[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 구 버전 draft 호환 · add*Qty 필드 없으면 빈값으로 초기화
        const migrated = parsed.map(r => ({
          ...r,
          warehouse1AddQty: r.warehouse1AddQty ?? "",
          warehouse2AddQty: r.warehouse2AddQty ?? "",
          store1AddQty:     r.store1AddQty     ?? "",
          store2AddQty:     r.store2AddQty     ?? "",
          store3AddQty:     r.store3AddQty     ?? "",
        }));
        setRows(migrated);
        setDraftBanner(false);
        showToast(`임시저장 ${migrated.length}건 복구 완료`, 2500);
      }
    } catch { /* ignore */ }
  }, [showToast]);

  // ── A5 · draft 무시 · 배너 닫기
  const dismissDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setDraftBanner(false);
  }, []);

  // ── T20/Phase 2 · 상품별 진열요청 · POST /api/display-requests
  // 2026-08-05 · 구역별 요청 지원 · zoneOverride 있으면 그 구역 · 없으면 배정구역
  const requestDisplay = useCallback(async (row: StockRow, zoneOverride?: string | null) => {
    const store1 = calcSlotTotal(row.prevStore1Qty, row.store1AddQty);
    const store2 = calcSlotTotal(row.prevStore2Qty, row.store2AddQty);
    const store3 = calcSlotTotal(row.prevStore3Qty, row.store3AddQty);
    const w1 = calcSlotTotal(row.prevWarehouse1Qty, row.warehouse1AddQty);
    const w2 = calcSlotTotal(row.prevWarehouse2Qty, row.warehouse2AddQty);
    const storeSum = store1 + store2 + store3;
    const warehouseSum = w1 + w2;
    const rm = (row.product as any).realMap ?? (row.product as any).real_map ?? "";
    const targetZone = (zoneOverride && zoneOverride.trim()) ? zoneOverride.trim() : rm;
    const autoNote = storeSum === 0
      ? (warehouseSum > 0 ? `매장 전량 부족 · 창고 ${warehouseSum}개 대기` : "매장·창고 모두 부족")
      : `매장 ${storeSum}개 · 진열 보충 요청`;
    // 구역별 요청 시 confirm 생략 (모달 안 직접 클릭 · 이중 확인 제거)
    if (!zoneOverride) {
      const confirmMsg = `[${row.product.name}] 진열요청?\n· 배정 구역: ${rm || "미지정"}\n· 현재 매장: ${storeSum}개 · 창고: ${warehouseSum}개\n· 노트: ${autoNote}`;
      if (!await confirm({ message: confirmMsg })) return;
    }
    setRequestingKey(row.key);
    try {
      await api.post("/api/display-requests", {
        product_code: row.code,
        zone_id: targetZone,
        zone_label: targetZone,
        note: autoNote,
        requested_at: new Date().toISOString(),
      });
      showToast(`[${row.product.name}] ${targetZone || "배정구역"} 진열요청 전송 완료`, 3000);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "요청 실패");
      showToast(`요청 실패 · ${msg}`, 3000);
    } finally {
      setRequestingKey(null);
    }
  }, [showToast]);

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
      const existing = rows[existingIdx];
      setLastAddedKey(existing.key);
      // 2026-08-10 · G · A4 · 자동 +1 옵션 활성 시 · 매장1 addQty +1
      if (autoIncOn) {
        const cur = existing.store1AddQty === "" ? 0 : Number(existing.store1AddQty) || 0;
        setRows(prev => prev.map(r => r.key === existing.key ? { ...r, store1AddQty: cur + 1 } : r));
        showToast(`이미 등록 · 매1 +1 (${cur + 1})`);
      } else {
        showToast("이미 등록된 상품 (기존 행 활성화)");
      }
      return;
    }

    // real_map 파싱 → 매장1·2·3 구역 자동 배정
    const rm = (found as any).realMap ?? (found as any).real_map ?? null;
    const [z1, z2, z3] = parseRealMap(rm);

    const newRow: StockRow = {
      key: `${result}-${Date.now()}`,
      code: result,
      product: found,
      addedAt: Date.now(),
      warehouse1AddQty: "",
      warehouse2AddQty: "",
      store1AddQty:     "",
      store2AddQty:     "",
      store3AddQty:     "",
      store1Zone:    z1,
      store2Zone:    z2,
      store3Zone:    z3,
    };

    setRows(prev => [newRow, ...prev]);
    setLastAddedKey(newRow.key);
    setSaveStatus("idle");
    // 2026-08-09 · 사용자 요청 · 스캔 후 중간 팝업(창고1/2·매장1/2/3) 제거
    // 기존: setScanModal(newRow) · 스캔 즉시 모달 auto-open
    // 신규: 우측 리스트에 바로 행 추가만 · 사용자가 필요 시 행 클릭으로 상세 보기

    // 기존 실재고 자동 로드 · 신규 컬럼 우선 · 없으면 레거시 fallback
    // 이력 건수/최근 저장 시각도 함께 저장 (덮어쓰기 confirm · 이력 배지에 사용)
    fetch(`/api/inventory-checks?product_code=${encodeURIComponent(result)}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: InventoryHistoryRow[]) => {
        const last = list[0];
        if (!last) return;
        const w1 = last.warehouse1_stock ?? last.warehouse_stock;
        const w2 = last.warehouse2_stock ?? null;
        const s1 = last.store_stock ?? null;              // 매장1 = store_stock
        const s2 = last.store_stock_2 ?? null;
        const s3 = last.store3_stock ?? null;
        setRows(prev => prev.map(r => r.key === newRow.key
          ? {
              ...r,
              // 증분 방식 · prev*Qty 에만 이전값 저장 · add*Qty 는 빈 값 유지 (사용자가 신규 입고 수량 입력)
              prevWarehouse1Qty: w1 != null ? Number(w1) : null,
              prevWarehouse2Qty: w2 != null ? Number(w2) : null,
              prevStore1Qty:     s1 != null ? Number(s1) : null,
              prevStore2Qty:     s2 != null ? Number(s2) : null,
              prevStore3Qty:     s3 != null ? Number(s3) : null,
              // 저장된 구역 우선 · 없으면 real_map 기반 유지
              store1Zone: (last.store1_zone ?? r.store1Zone) || null,
              store2Zone: (last.store2_zone ?? r.store2Zone) || null,
              store3Zone: (last.store3_zone ?? r.store3Zone) || null,
              lastCheckedAt: last.checked_at ?? null,
              historyCount:  list.length,
            }
          : r
        ));
      })
      .catch(() => {});
  }, [rows, showToast, autoIncOn]);

  // ── 행 필드 업데이트
  const patchRow = useCallback((key: string, patch: Partial<StockRow>) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const resetAll = async () => {
    if (rows.length === 0) return;
    if (!await confirm({ message: `등록된 ${rows.length}개 항목을 모두 초기화할까요?`, danger: true })) return;
    setRows([]);
    setLastAddedKey(null);
    setLastProduct(null);
    setLastCode(null);
    setNotFoundCode(null);
    setSaveStatus("idle");
    setSaveError(null);
    // A5 · 초기화 시 draft 삭제
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setDraftBanner(false);
  };

  // ── 실재고 이력 모달 열기
  const openHistory = useCallback(async (code: string, name: string) => {
    setHistoryModal({ code, name });
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const { data } = await api.get<any[]>(`/api/inventory-checks?product_code=${encodeURIComponent(code)}`);
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch { /* noop */ } finally { setHistoryLoading(false); }
  }, []);

  // ── 전체 저장
  const handleBulkSave = async () => {
    if (rows.length === 0) return;
    if (saveStatus === "saving") return;
    // 오늘 이미 저장된 상품 · 덮어쓰기 확인 (서버가 같은날 UPDATE · 다른날 INSERT)
    const todayYmd = new Date().toISOString().slice(0, 10);
    const sameDayRows = rows.filter(r => r.lastCheckedAt && String(r.lastCheckedAt).slice(0, 10) === todayYmd);
    if (sameDayRows.length > 0) {
      const preview = sameDayRows.slice(0, 5).map(r => `· ${r.product.name}`).join("\n");
      const more = sameDayRows.length > 5 ? `\n외 ${sameDayRows.length - 5}건` : "";
      const ok = await confirm({
        message: `오늘(${todayYmd}) 이미 저장된 상품이 ${sameDayRows.length}건 있습니다.\n덮어쓰시겠습니까?\n\n${preview}${more}`,
      });
      if (!ok) return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const { data: j } = await api.post<{ saved?: number; failed?: number; downgraded?: boolean }>("/api/inventory-checks/bulk", {
        checked_by: authSession?.employeeName ?? "익명",
        items: rows.map(r => {
            // 증분 방식 · 저장값 = prev + add 합산
            const w1 = calcSlotTotal(r.prevWarehouse1Qty, r.warehouse1AddQty);
            const w2 = calcSlotTotal(r.prevWarehouse2Qty, r.warehouse2AddQty);
            const s1 = calcSlotTotal(r.prevStore1Qty,     r.store1AddQty);
            const s2 = calcSlotTotal(r.prevStore2Qty,     r.store2AddQty);
            const s3 = calcSlotTotal(r.prevStore3Qty,     r.store3AddQty);
            // prev·add 모두 빈 경우 null 전송 (미입력 구분)
            const hasW1 = r.prevWarehouse1Qty != null || r.warehouse1AddQty !== "";
            const hasW2 = r.prevWarehouse2Qty != null || r.warehouse2AddQty !== "";
            const hasS1 = r.prevStore1Qty != null || r.store1AddQty !== "";
            const hasS2 = r.prevStore2Qty != null || r.store2AddQty !== "";
            const hasS3 = r.prevStore3Qty != null || r.store3AddQty !== "";
            return {
              product_code:     r.code,
              product_name:     r.product.name,
              // 신규 5-분리 컬럼 · prev + add 합산값
              warehouse1_stock: hasW1 ? w1 : null,
              warehouse2_stock: hasW2 ? w2 : null,
              store_stock:      hasS1 ? s1 : null,   // 매장1
              store_stock_2:    hasS2 ? s2 : null,   // 매장2
              store3_stock:     hasS3 ? s3 : null,   // 매장3
              // 매장 구역 (편집된 값 · 없으면 auto 값 저장)
              store1_zone:      r.store1Zone,
              store2_zone:      r.store2Zone,
              store3_zone:      r.store3Zone,
              // 레거시 mirror (구 클라이언트 하위 호환용 · 서버가 warehouse1 우선 처리)
              warehouse_stock:  hasW1 ? w1 : null,
            };
          }),
      });
      setSavedCount(j.saved ?? rows.length);
      setSaveStatus("done");
      // A5 · 서버 저장 성공 시 draft 삭제
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      setDraftBanner(false);
      showToast(
        j.downgraded
          ? `${j.saved ?? rows.length}건 저장 완료 (DB 컬럼 확장 대기 · 레거시 모드)`
          : `${j.saved ?? rows.length}건 저장 완료`,
      );
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "저장 실패");
      setSaveError(msg);
      setSaveStatus("error");
    }
  };

  // 요약 카운트 (전체 저장 카드 · 합계 표시용)
  // calcRowTotal 은 stockRowTypes.ts 에서 import

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col bg-[#F4F7FA]" : "min-h-screen bg-[#F4F7FA] flex flex-col"}>

      {/* ── AppNavHeader (embedded 모드에선 부모가 헤더 렌더 · skip) ── */}
      {!embedded && (
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
          title="실재고 바코드 스캔"
        />
      )}

      {/* ── Page header strip ── */}
      <div className="bg-white border-b border-line/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-600
            flex items-center justify-center shadow-sm shrink-0">
            <ScanLine size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-[15px] sm:text-[17px] font-bold text-zinc-900 leading-none">실재고 입력</h1>
            <p className="text-[15px] sm:text-xs text-zinc-400 mt-0.5 leading-none">
              바코드 스캔 후 창고1·2 · 매장1·2·3 수량 입력 · 전체 저장
            </p>
          </div>
          {rows.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[15px] sm:text-xs font-bold text-zinc-400">{rows.length}건</span>
            </div>
          )}
        </div>
      </div>

      {/* ── A5 · Draft 복구 배너 ── */}
      {draftBanner && rows.length === 0 && (
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-6 pt-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl
            bg-amber-50 border border-amber-200/80 shadow-sm">
            <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <RotateCcw size={13} className="text-amber-600" />
            </div>
            <p className="flex-1 text-[14px] font-semibold text-amber-800 leading-snug">
              이전 세션의 임시저장 데이터가 있습니다. 복구하시겠습니까?
            </p>
            <button
              onClick={restoreDraft}
              className="px-3 py-1.5 rounded-lg text-[14px] font-bold text-white
                bg-amber-500 hover:bg-amber-600 active:bg-amber-700
                transition-colors cursor-pointer shrink-0"
            >
              복구
            </button>
            <button
              onClick={dismissDraft}
              className="w-7 h-7 flex items-center justify-center rounded-lg
                text-amber-500 hover:text-amber-700 hover:bg-amber-100
                transition-colors cursor-pointer shrink-0"
              title="무시"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5 flex flex-col">
        <SplitPanel
          storageKey="scanPage.leftWidth"
          defaultWidth={300}
          minWidth={220}
          maxWidth={500}
          dividerColor="teal"
          wrapLeft={false}
          wrapRight={false}
          leftClassName="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start max-h-none"
          mobileRightAsModal={false}
          left={(
            <>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL · 스캐너 + 마지막 스캔 상품
        ══════════════════════════════════════════════════════ */}

          {/* 2026-08-10 · 사용자 요청 · 스캔 카드 · 그라데이션 제거 · 장식 원 제거 · 깔끔한 UI */}
          <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
            {/* 헤더 · 아이콘 + 제목 · 그라데이션·장식 없이 */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100">
              <ScanLine size={18} className="text-teal-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-zinc-800 leading-tight">바코드 스캔</p>
                <p className="text-[15px] text-zinc-400 leading-tight">스캔 시 우측 리스트에 자동 등록</p>
              </div>
            </div>

            <div className="px-4 py-4 flex flex-col gap-3">
              {/* 바코드 스캔 버튼 · solid · 그라데이션 제거 */}
              <button
                onClick={() => setScannerOpen(true)}
                disabled={mapLoading}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-md font-bold text-[14px] text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {mapLoading
                  ? <><Loader2 size={16} className="animate-spin" /> 상품 정보 로딩...</>
                  : <><ScanLine size={16} /> 바코드 스캔</>
                }
              </button>

              {/* 2026-08-09 · 상품 검색 · 바코드 스캔 버튼 아래 (사용자 요청) */}
              <ProductSearchInput
                accent="teal"
                placeholder="상품명·코드 검색"
                onSelect={(code) => handleScan(code)}
              />

              {/* 2026-08-10 · G · A4 · 자동 +1 opt-in 토글 */}
              <label className="flex items-center gap-2 text-[15px] text-zinc-600 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoIncOn}
                  onChange={toggleAutoInc}
                  className="w-3.5 h-3.5 accent-teal-500"
                />
                <span>중복 스캔 시 매1 자동 +1</span>
              </label>

              {notFoundCode && !lastProduct && (
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

              {lastProduct && (
                <div className="flex flex-col rounded-2xl overflow-hidden
                  bg-white border border-teal-200/80
                  shadow-[0_2px_8px_rgba(20,184,166,0.08)]">

                  {/* ── 헤더 · 라벨 + 상품코드 ── */}
                  <div className="flex items-center gap-2 px-3.5 py-2 bg-teal-50/80 border-b border-teal-100">
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-[14px] font-bold text-teal-700 uppercase tracking-wider">최근 스캔</span>
                    {lastCode && (
                      <span className="ml-auto text-[14px] font-mono tabular-nums text-zinc-500 truncate max-w-[140px]">
                        {lastCode}
                      </span>
                    )}
                  </div>

                  {/* ── 본문 · 상품명 옆에 구역·공급사 한 줄 (2026-08-10 사용자 요청) ── */}
                  <div className="px-3.5 py-3 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {/* 상품명 · 큰 글씨 */}
                      <p className="text-[15px] sm:text-[16px] font-bold text-zinc-900
                        break-words whitespace-normal leading-snug">
                        {lastProduct.name}
                      </p>
                      {/* 구역 · 공급사 · 텍스트 · 상품명 옆 */}
                      {(lastProduct as any).spec && (
                        <span className="inline-flex items-baseline gap-1 text-[14px]">
                          <span className="text-zinc-400 font-semibold">구역</span>
                          <span className="text-violet-700 font-bold">{(lastProduct as any).spec}</span>
                        </span>
                      )}
                      {(lastProduct as any).supplier && (
                        <span className="inline-flex items-baseline gap-1 text-[14px] min-w-0">
                          <span className="text-zinc-400 font-semibold">공급사</span>
                          <span className="text-sky-700 font-bold truncate">{(lastProduct as any).supplier}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── 진열요청 버튼 · 풀너비 · 시인성 강조 (violet 그라디언트) ── */}
                  <button
                    type="button"
                    onClick={() => {
                      const target = rows.find(r => r.code === lastCode);
                      if (target) requestDisplay(target);
                    }}
                    disabled={!lastCode || requestingKey === (rows.find(r => r.code === lastCode)?.key ?? "")}
                    className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5
                      bg-violet-500 hover:bg-violet-600 active:bg-violet-700
                      text-white text-[15px] sm:text-[14px] font-bold shadow-inner
                      disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer
                      border-t border-violet-400"
                    title="이 상품 진열요청 · 구역 담당자·관리자 알림 · 요청 목록에 표시"
                  >
                    <Megaphone size={15} strokeWidth={2.5} />
                    진열요청 전송
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2026-08-10 · 사용자 요청 · 전체 합계 카드 제거 · 상품별 집계는 아래 리스트 위쪽으로 이동 */}
            </>
          )}
          right={(
            <div className="flex flex-col gap-4">

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 스캔 리스트 테이블
        ══════════════════════════════════════════════════════ */}

          {/* 2026-08-10 · 사용자 요청 · 상품별 실재고 집계 카드 제거 */}

<div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">

            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5 border-b border-line/80
              bg-zinc-50/80 rounded-t-2xl sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Package size={14} className="text-teal-600" />
                </div>
                <span className="text-sm font-bold text-zinc-800">스캔한 상품 · 실재고 입력</span>
                {rows.length > 0 && (
                  <span className="text-[15px] font-bold text-teal-700
                    bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5 tabular-nums">
                    {rows.length}건
                  </span>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                <div className="w-16 h-16 rounded-xl bg-zinc-100 flex items-center justify-center">
                  <Package size={28} className="text-zinc-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-zinc-400">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-xs text-zinc-300 mt-1">좌측 바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto max-h-[56vh] lg:max-h-[62vh]">
                <table className="w-full border-collapse text-[14px] sm:text-[15px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-zinc-50/95 backdrop-blur-sm border-b border-line/60">
                      {/* 2026-08-10 · 사용자 요청 · 시각 컬럼 제거 */}
                      {/* 상품명 */}
                      <th
                        className="text-left px-2 py-2.5 font-bold text-zinc-400 min-w-[140px]
                          cursor-pointer select-none hover:text-zinc-600 hover:bg-zinc-100/60 transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        상품명 <SortIcon active={sortKey === "name"} dir={sortDir} />
                      </th>
                      {/* 2026-08-10 · 구역 (real_map) 컬럼 제거 · 사용자 요청 */}
                      {/* 창고1 · 데스크탑만 · lg 이상 개별 표시 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[80px] font-bold text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-orange-400" /> 창고1
                        </span>
                      </th>
                      {/* 창고2 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[80px] font-bold text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-amber-400" /> 창고2
                        </span>
                      </th>
                      {/* 매장1 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-emerald-500" /> 매장1
                        </span>
                      </th>
                      {/* 매장2 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-sky-500" /> 매장2
                        </span>
                      </th>
                      {/* 매장3 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-violet-500" /> 매장3
                        </span>
                      </th>
                      {/* 모바일·태블릿 통합 재고 헤더 · lg 미만 (2026-08-05 · 사용자 요청 반응형 wrap) */}
                      <th className="lg:hidden text-center px-2 py-2.5 font-bold text-zinc-400 whitespace-nowrap min-w-[240px]">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-amber-500" /> 재고
                          <span className="text-[14px] text-zinc-300 font-normal">(창고1·2 / 매장1·2·3)</span>
                        </span>
                      </th>
                      {/* 합계 */}
                      <th className="text-center px-2 py-2.5 w-[54px] font-bold text-zinc-400 whitespace-nowrap">
                        합계
                      </th>
                      {/* 삭제 */}
                      <th className="px-2 py-2.5 w-9" />
                    </tr>
                  </thead>

                  <tbody>
                    {sortedRows.map((row, idx) => (
                      <StockRowDesktop
                        key={row.key}
                        row={row}
                        idx={idx}
                        isRecent={row.key === lastAddedKey}
                        requestingKey={requestingKey}
                        onPatch={patchRow}
                        onRemove={removeRow}
                        onHistory={openHistory}
                        onRequestDisplay={requestDisplay}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 전체 저장 카드 ── */}
          {rows.length > 0 && (
            <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-colors duration-150 ${
              saveStatus === "done"
                ? "border-emerald-300/80 shadow-[0_0_0_4px_rgba(16,185,129,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
                : "border-line/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            }`}>
              <div className={`px-5 py-3.5 border-b border-zinc-100/80 flex items-center justify-between gap-2 ${
                saveStatus === "done" ? "bg-emerald-50/60" : "bg-zinc-50/40"
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    saveStatus === "done" ? "bg-emerald-100" : "bg-zinc-100"
                  }`}>
                    <SaveAll size={14} className={saveStatus === "done" ? "text-emerald-600" : "text-zinc-400"} />
                  </div>
                  <span className="text-sm font-bold text-zinc-800">전체 등록</span>
                </div>
                <span className="text-[15px] font-bold text-zinc-400 tabular-nums">
                  {rows.length}건 · 총 {rows.reduce((acc, r) => acc + calcRowTotal(r), 0)}개
                </span>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">
                <p className="text-[14px] text-zinc-500 leading-relaxed">
                  리스트의 모든 항목을 한 번에 저장합니다.
                  창고1·2 · 매장1·2·3 수량과 구역을 확인한 뒤 아래 버튼을 누르세요.
                </p>

                <button
                  onClick={() => setReviewOpen(true)}
                  disabled={saveStatus === "saving" || saveStatus === "done" || rows.length === 0}
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
                          : "bg-teal-600 hover:bg-teal-700 shadow-md hover:shadow-lg",
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
                  <p className="text-[14px] text-rose-600 font-semibold px-1">{saveError}</p>
                )}

                {saveStatus === "done" && (
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] text-emerald-600 font-semibold flex-1">
                      저장 완료. 재고관리 · 실재고 탭에서 차이 있는 상품을 확인할 수 있습니다.
                    </p>
                    <button
                      onClick={() => {
                        setRows([]);
                        setLastAddedKey(null);
                        setSaveStatus("idle");
                        setSaveError(null);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[15px] font-bold
                        text-zinc-500 bg-white border border-line hover:bg-zinc-50
                        transition cursor-pointer shrink-0"
                    >
                      <RotateCcw size={11} /> 목록 초기화
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
            </div>
          )}
        />
      </main>

      {/* ── 실재고 이력 조회 모달 ─────────────────────────────── */}
      {historyModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-900/50 backdrop-blur-sm"
          onClick={() => setHistoryModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[85vh] bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-line overflow-hidden flex flex-col"
          >
            <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-teal-600 uppercase tracking-widest">실재고 저장 이력</div>
                <div className="text-sm font-bold text-zinc-800 truncate">{historyModal.name}</div>
                <div className="text-[14px] text-zinc-400 font-mono">{historyModal.code}</div>
              </div>
              <button
                onClick={() => setHistoryModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-zinc-400 text-xs font-semibold">
                  <Loader2 size={16} className="animate-spin mr-2" /> 이력 조회 중...
                </div>
              ) : historyRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-xs font-semibold">
                  <History size={22} className="mb-2 text-zinc-300" />
                  저장 이력이 없습니다.
                </div>
              ) : (
                <table className="w-full text-[15px]">
                  <thead className="bg-zinc-50 border-b border-line text-[14px] uppercase tracking-widest text-zinc-500 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">일시</th>
                      <th className="px-2 py-2 text-center">창1</th>
                      <th className="px-2 py-2 text-center">창2</th>
                      <th className="px-2 py-2 text-center">매1</th>
                      <th className="px-2 py-2 text-center">매2</th>
                      <th className="px-2 py-2 text-center">매3</th>
                      <th className="px-3 py-2 text-left">담당</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {historyRows.map(h => {
                      const dt = h.checked_at ? new Date(h.checked_at) : null;
                      const dtLabel = dt
                        ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`
                        : "-";
                      const w1 = h.warehouse1_stock ?? h.warehouse_stock;
                      return (
                        <tr key={h.id} className="hover:bg-teal-50/40">
                          <td className="px-3 py-2 font-mono text-zinc-700 whitespace-nowrap">{dtLabel}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{w1 ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.warehouse2_stock ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store_stock ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store_stock_2 ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store3_stock ?? "-"}</td>
                          <td className="px-3 py-2 text-zinc-600 truncate max-w-[100px]">{h.checked_by ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-2.5 border-t border-zinc-100 bg-zinc-50/60 text-[14px] text-zinc-400 font-semibold text-center">
              같은 날 저장은 덮어쓰고, 다른 날 저장은 이력으로 추가됩니다.
            </div>
          </div>
        </div>
      )}

      {/* 2026-08-10 · G · B1 · 검토 시트 (오입력 방지 · [전체 등록] → 요약 확인 → [확정]) */}
      {reviewOpen && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setReviewOpen(false)}
        >
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-line bg-teal-50 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-zinc-900">등록 전 검토</div>
                <div className="text-[15px] font-semibold text-zinc-500 mt-0.5">
                  {rows.length}건 · 총 {rows.reduce((acc, r) => acc + calcRowTotal(r), 0)}개
                </div>
              </div>
              <button
                onClick={() => setReviewOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/70 hover:text-zinc-700 cursor-pointer"
                title="닫기"
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
              {rows.map(r => {
                const total = calcRowTotal(r);
                const added =
                  (Number(r.warehouse1AddQty) || 0) +
                  (Number(r.warehouse2AddQty) || 0) +
                  (Number(r.store1AddQty) || 0) +
                  (Number(r.store2AddQty) || 0) +
                  (Number(r.store3AddQty) || 0);
                return (
                  <div key={r.key} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-zinc-800 truncate">{r.product.name}</div>
                      <div className="text-[14px] text-zinc-400 font-mono tabular-nums truncate">{r.code}</div>
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0">
                      {added > 0 ? (
                        <span className="text-[15px] font-bold text-emerald-700 tabular-nums">+{added}</span>
                      ) : (
                        <span className="text-[15px] text-zinc-300">변화 없음</span>
                      )}
                      <span className="text-[14px] font-bold text-zinc-800 tabular-nums">= {total}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-line bg-zinc-50 flex items-center gap-2">
              <button
                onClick={() => setReviewOpen(false)}
                className="flex-1 h-10 rounded-lg bg-white border border-zinc-300 text-zinc-600 text-[14px] font-bold hover:bg-zinc-100 transition cursor-pointer"
              >취소</button>
              <button
                onClick={() => { setReviewOpen(false); handleBulkSave(); }}
                disabled={saveStatus === "saving" || rows.length === 0}
                className="flex-[2] h-10 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[15px] font-bold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
              >
                확정 · {rows.length}건 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
