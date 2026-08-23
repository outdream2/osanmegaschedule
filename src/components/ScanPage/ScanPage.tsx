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
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
import { SplitPanel } from "../common/SplitPanel";
import { StatusPill } from "../common/StatusPill";
import {
  ScanLine, Package,
  RotateCcw, Warehouse, Store,
  MapPin, ArrowUpDown, ArrowUp, ArrowDown, X,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { BarcodeScanner } from "../BarcodeScanner";
import { loadZBar } from "../BarcodeScanner/zbar";
import {
  getProductsMap, lookupProduct, isProductsLoaded,
  type ProductInfo,
} from "../../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { useConfirm } from "../../hooks/useConfirm";
import { IconTile } from "../common/IconTile";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
// ── 분리된 Row 컴포넌트 ──────────────────────────────────────
import { StockRowCard } from "./StockRowCard";
import type { StockRow } from "./stockRowTypes";
import { calcRowTotal, calcSlotTotal, calcTotalAdded } from "./stockRowTypes";
import { useToast } from "../../hooks/useToast";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import {
  parseRealMap, Toast, SortIcon, SCAN_SORT_CMP,
  type InventoryHistoryRow, type ScanSortKey,
} from "./helpers";
// 2026-08-22 · Framework Phase 4 · 4개 UI 섹션 이관 (ScanLeftPanel/SaveCard/HistoryModal/ReviewSheet)
import { ScanLeftPanel, SaveCard, HistoryModal, ReviewSheet } from "./ScanPage.panels";

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

// StockRow 타입은 stockRowTypes.ts 에서 import (위 참조)
// NumberInput·ZoneInput 은 StockRowDesktop / StockRowMobile 에서 로컬 정의
// (scanModal 은 직접 <input type="number"> 사용 · 별도 컴포넌트 불필요)

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

  // 2026-08-18 · 실재고입력 개선안 #1 · 필터 pill + 실시간 통계
  //   · empty  : 이번 세션 추가 입력 0 (=미입력)
  //   · diff   : 추가 입력 있음 (변경 예정)
  //   · warn   : 어떤 한 슬롯 add >= 100 (이상값 · 오탈자 방지)
  type ScanFilter = "all" | "empty" | "diff" | "warn";
  const [scanFilter, setScanFilter] = useState<ScanFilter>("all");

  const WARN_THRESHOLD = 100;
  const isWarnRow = useCallback((r: StockRow): boolean => {
    const a = (v: number | "") => v !== "" ? Number(v) : 0;
    return (
      a(r.warehouse1AddQty) >= WARN_THRESHOLD ||
      a(r.warehouse2AddQty) >= WARN_THRESHOLD ||
      a(r.store1AddQty)     >= WARN_THRESHOLD ||
      a(r.store2AddQty)     >= WARN_THRESHOLD ||
      a(r.store3AddQty)     >= WARN_THRESHOLD
    );
  }, []);

  const scanStats = React.useMemo(() => {
    let empty = 0, diff = 0, warn = 0;
    for (const r of rows) {
      const added = calcTotalAdded(r);
      if (added === 0) empty += 1;
      else diff += 1;
      if (isWarnRow(r)) warn += 1;
    }
    return { total: rows.length, empty, diff, warn };
  }, [rows, isWarnRow]);

  const filteredRows = React.useMemo(() => {
    if (scanFilter === "all") return sortedRows;
    return sortedRows.filter(r => {
      const added = calcTotalAdded(r);
      if (scanFilter === "empty") return added === 0;
      if (scanFilter === "diff")  return added !== 0;
      if (scanFilter === "warn")  return isWarnRow(r);
      return true;
    });
  }, [sortedRows, scanFilter, isWarnRow]);

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
      // 2026-08-18 · 진열 요청 배지 즉시 갱신
      dispatchApprovalChange("display");
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
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<InventoryHistoryRow[]>(`/api/inventory-checks?product_code=${encodeURIComponent(result)}`)
      .then(({ data }) => Array.isArray(data) ? data : [])
      .catch(() => [] as InventoryHistoryRow[])
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

      {/* ── Page header strip · 2026-08-17 · 최신 트렌드 · 좌측 accent bar + 딥네이비 통일 ── */}
      <div className="bg-white border-b border-line shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <AccentBar h={22} className="shrink-0" />
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-deep
            flex items-center justify-center shadow-sm shrink-0">
            <ScanLine size={17} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] sm:text-[19px] font-bold text-ink leading-tight tracking-tight">실재고 입력</h1>
            <p className="text-[13px] sm:text-[14px] text-ink-soft mt-0.5 leading-tight">
              바코드 스캔 후 창고1·2 · 매장1·2·3 수량 입력 · 전체 저장
            </p>
          </div>
          {rows.length > 0 && (
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <StatusPill tone="brand" size="md">{rows.length}건</StatusPill>
            </div>
          )}
        </div>
      </div>

      {/* ── A5 · Draft 복구 배너 ── */}
      {draftBanner && rows.length === 0 && (
        <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-6 pt-3">
          <Card variant="raw-sm" bg="bg-amber-50" borderColor="border-amber-200/80" className="flex items-center gap-3 px-4 py-3">
            {/* 2026-08-18 · IconTile 확산 */}
            <IconTile icon={<RotateCcw size={13} />} tone="amber" size="sm" />

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
          </Card>
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
            <ScanLeftPanel
              mapLoading={mapLoading}
              autoIncOn={autoIncOn}
              onToggleAutoInc={toggleAutoInc}
              notFoundCode={notFoundCode}
              lastProduct={lastProduct}
              lastCode={lastCode}
              requestingKey={requestingKey}
              rows={rows}
              onOpenScanner={() => setScannerOpen(true)}
              onScan={handleScan}
              onRequestDisplay={requestDisplay}
            />
          )}
          right={(
            <div className="flex flex-col gap-4">

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 스캔 리스트 테이블
        ══════════════════════════════════════════════════════ */}

          {/* 2026-08-10 · 사용자 요청 · 상품별 실재고 집계 카드 제거 */}

<div className="bg-white rounded-2xl border border-line/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">

            <div className="flex flex-col gap-3
              px-4 sm:px-5 py-3 sm:py-3.5 border-b border-line/80
              bg-zinc-50/80 rounded-t-2xl sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  {/* 2026-08-18 · IconTile 확산 */}
                  <IconTile icon={<Package size={14} />} tone="teal" size="md" />

                  <span className="text-[15px] font-bold text-ink tracking-tight">스캔한 상품 · 실재고 입력</span>
                </div>
              </div>
              {/* 2026-08-18 · 개선안 #1 v2 · 큰 KPI 필터 카드 (2×2 · 모바일 우선 · PC 동일 레이아웃) */}
              {rows.length > 0 && (
                <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="실재고 입력 필터">
                  {([
                    { key: "all",   label: "전체",   count: scanStats.total, dot: "bg-brand-deep",   activeBg: "bg-brand-deep",  activeText: "text-white", activeSub: "text-white/70" },
                    { key: "empty", label: "미입력", count: scanStats.empty, dot: "bg-zinc-400",     activeBg: "bg-zinc-800",    activeText: "text-white", activeSub: "text-white/70" },
                    { key: "diff",  label: "입력됨", count: scanStats.diff,  dot: "bg-emerald-500",  activeBg: "bg-emerald-600", activeText: "text-white", activeSub: "text-white/70" },
                    { key: "warn",  label: "이상값", count: scanStats.warn,  dot: "bg-amber-500",    activeBg: "bg-amber-600",   activeText: "text-white", activeSub: "text-white/70" },
                  ] as const).map(o => {
                    const active = scanFilter === o.key;
                    const isWarn = o.key === "warn" && o.count > 0;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setScanFilter(o.key)}
                        className={[
                          "flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border-2 transition-all duration-150 cursor-pointer text-left min-h-[56px]",
                          active
                            ? `${o.activeBg} border-transparent shadow-[0_2px_10px_-2px_rgba(10,46,74,0.30),inset_0_1px_0_rgba(255,255,255,0.15)] scale-[1.01]`
                            : isWarn
                              ? "bg-amber-50/60 border-amber-200 hover:border-amber-400 hover:bg-amber-50"
                              : "bg-white border-line hover:border-brand-deep/40 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-white/90" : o.dot} ${active || o.count > 0 ? "" : "opacity-40"}`}
                          />
                          <span className={`text-[13px] font-semibold tracking-tight truncate ${active ? o.activeText : "text-ink-soft"}`}>
                            {o.label}
                          </span>
                        </div>
                        <span
                          className={`text-[22px] font-bold tabular-nums leading-none tracking-tight ${
                            active
                              ? o.activeText
                              : isWarn
                                ? "text-amber-700"
                                : o.count > 0
                                  ? "text-ink"
                                  : "text-zinc-300"
                          }`}
                        >
                          {o.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 sm:py-24 select-none">
                {/* 2026-08-18 · IconTile 확산 · 2xl · Empty state */}
                <IconTile icon={<Package size={28} className="text-zinc-300" />} tone="zinc" size="2xl" shape="rounded-2xl" />

                <div className="text-center">
                  <p className="text-[15px] font-bold text-ink-soft">스캔한 상품이 여기에 표시됩니다</p>
                  <p className="text-[13px] text-zinc-400 mt-1">좌측 바코드 스캔 후 자동 등록</p>
                </div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 select-none">
                <p className="text-[14px] font-semibold text-ink-soft">필터 결과 없음</p>
                <button
                  type="button"
                  onClick={() => setScanFilter("all")}
                  className="text-[13px] font-semibold text-brand-deep hover:underline cursor-pointer"
                >전체 보기</button>
              </div>
            ) : (
              // 2026-08-18 · #95 재설계 · 카드형 리스트 · 모바일/PC 통일
              <div className="flex-1 overflow-auto max-h-[56vh] lg:max-h-[62vh]
                px-3 sm:px-4 py-3 flex flex-col gap-2 bg-zinc-50/30">
                {filteredRows.map((row) => (
                  <StockRowCard
                    key={row.key}
                    row={row}
                    isRecent={row.key === lastAddedKey}
                    requestingKey={requestingKey}
                    onPatch={patchRow}
                    onRemove={removeRow}
                    onHistory={openHistory}
                    onRequestDisplay={requestDisplay}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · SaveCard */}
          <SaveCard
            rows={rows}
            saveStatus={saveStatus}
            savedCount={savedCount}
            saveError={saveError}
            onReview={() => setReviewOpen(true)}
            onReset={() => {
              setRows([]);
              setLastAddedKey(null);
              setSaveStatus("idle");
              setSaveError(null);
            }}
          />
            </div>
          )}
        />
      </main>

      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · HistoryModal · ReviewSheet */}
      <HistoryModal
        historyModal={historyModal}
        historyRows={historyRows}
        historyLoading={historyLoading}
        onClose={() => setHistoryModal(null)}
      />
      <ReviewSheet
        reviewOpen={reviewOpen}
        rows={rows}
        saveStatus={saveStatus}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => { setReviewOpen(false); handleBulkSave(); }}
      />
    </div>
  );
};
