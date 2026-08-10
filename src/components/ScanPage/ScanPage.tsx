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

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSortableTable, type Comparator, type SortDir } from "../../hooks/useSortableTable";
import {
  ScanLine, Loader2, AlertCircle, Package,
  CheckCircle2, Trash2, RotateCcw, Warehouse, Store,
  Hash, Building2, Box, MapPin, ArrowUpDown, ArrowUp, ArrowDown,
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

// ─────────────────────────────────────────────────────────────
// StockRow · 우측 테이블 한 행
// ─────────────────────────────────────────────────────────────
interface StockRow {
  key: string;                    // code + timestamp
  code: string;
  product: ProductInfo;
  addedAt: number;
  warehouse1Qty: number | "";
  warehouse2Qty: number | "";
  store1Qty:     number | "";
  store2Qty:     number | "";
  store3Qty:     number | "";
  store1Zone:    string | null;   // 매장1 구역 (편집 가능)
  store2Zone:    string | null;   // 매장2 구역 (편집 가능)
  store3Zone:    string | null;   // 매장3 구역 (편집 가능)
  lastCheckedAt?: string | null;  // 최근 저장 시각 (같은날 여부 판정용)
  historyCount?: number;          // 이력 건수 (badge 표시)
  // 2026-08-10 · 사용자 요청 · 기존 저장 재고 (참조용 · read-only 표시)
  prevWarehouse1Qty?: number | null;
  prevWarehouse2Qty?: number | null;
  prevStore1Qty?:     number | null;
  prevStore2Qty?:     number | null;
  prevStore3Qty?:     number | null;
}

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
}) => {
  // 2026-08-04 · 사용자 요청 · +/- 스텝퍼 · 좌측 - · 우측 + · 가운데 입력
  const cur = value === "" ? 0 : Number(value) || 0;
  const dec = () => { if (disabled) return; const n = Math.max(0, cur - 1); onChange(n === 0 && value === "" ? "" : n); };
  const inc = () => { if (disabled) return; onChange(cur + 1); };
  return (
    <div className={`inline-flex items-stretch w-full h-9 bg-white border border-slate-200 rounded-lg overflow-hidden transition ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || cur <= 0}
        className="w-6 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-rose-600 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 text-[16px] font-black leading-none flex items-center justify-center cursor-pointer border-r border-slate-200"
        title="감소"
        tabIndex={-1}
      >−</button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={placeholder}
        className={`flex-1 min-w-0 h-full text-center px-1 bg-transparent border-0 text-[13px] font-black tabular-nums focus:outline-none disabled:text-slate-300 ${accent}`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        className="w-6 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-emerald-600 active:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 text-[16px] font-black leading-none flex items-center justify-center cursor-pointer border-l border-slate-200"
        title="증가"
        tabIndex={-1}
      >+</button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ZoneInput · 매장 구역 편집 · placeholder 로 auto 값 힌트
// ─────────────────────────────────────────────────────────────
interface ZoneInputProps {
  value: string | null;
  placeholder?: string;
  accentClass: string;                     // e.g. "text-emerald-600 focus:border-emerald-400"
  onChange: (v: string | null) => void;
}
const ZoneInput: React.FC<ZoneInputProps> = ({ value, placeholder = "-", accentClass, onChange }) => (
  <input
    type="text"
    value={value ?? ""}
    onChange={e => onChange(e.target.value.trim() === "" ? null : e.target.value)}
    placeholder={placeholder}
    className={`w-full h-5 text-center px-1 bg-transparent border-0 border-b border-dashed border-slate-200
      text-[10px] font-bold tabular-nums outline-none transition placeholder:text-slate-300
      ${accentClass}`}
    title="구역 편집"
  />
);

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
  const [toast, setToast]                       = useState<string | null>(null);

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
  //   · 닫아도 리스트 행은 유지 (실재고 입력 계속 가능)
  const [scanModal, setScanModal] = useState<StockRow | null>(null);

  // ── 전체 저장
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError]               = useState<string | null>(null);
  const [savedCount, setSavedCount]             = useState<number>(0);

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

  const showToast = useCallback((msg: string, ms = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  // ── T20/Phase 2 · 상품별 진열요청 · POST /api/display-requests
  // 2026-08-05 · 구역별 요청 지원 · zoneOverride 있으면 그 구역 · 없으면 배정구역
  const requestDisplay = useCallback(async (row: StockRow, zoneOverride?: string | null) => {
    const store1 = row.store1Qty === "" ? 0 : Number(row.store1Qty);
    const store2 = row.store2Qty === "" ? 0 : Number(row.store2Qty);
    const store3 = row.store3Qty === "" ? 0 : Number(row.store3Qty);
    const w1 = row.warehouse1Qty === "" ? 0 : Number(row.warehouse1Qty);
    const w2 = row.warehouse2Qty === "" ? 0 : Number(row.warehouse2Qty);
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
      const res = await fetch("/api/display-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: row.code,
          zone_id: targetZone,
          zone_label: targetZone,
          note: autoNote,
          requested_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? `요청 실패 (${res.status})`);
      }
      showToast(`[${row.product.name}] ${targetZone || "배정구역"} 진열요청 전송 완료`, 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "요청 실패";
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
      setLastAddedKey(rows[existingIdx].key);
      showToast("이미 등록된 상품 (기존 행 활성화)");
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
      warehouse1Qty: "",
      warehouse2Qty: "",
      store1Qty:     "",
      store2Qty:     "",
      store3Qty:     "",
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
              warehouse1Qty: w1 != null ? Number(w1) : "",
              warehouse2Qty: w2 != null ? Number(w2) : "",
              store1Qty:     s1 != null ? Number(s1) : "",
              store2Qty:     s2 != null ? Number(s2) : "",
              store3Qty:     s3 != null ? Number(s3) : "",
              // 2026-08-10 · 사용자 요청 · 이전 저장 재고 저장 (read-only 참조 UI 용)
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
  }, [rows, showToast]);

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
  };

  // ── 실재고 이력 모달 열기
  const openHistory = useCallback(async (code: string, name: string) => {
    setHistoryModal({ code, name });
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const r = await fetch(`/api/inventory-checks?product_code=${encodeURIComponent(code)}`);
      const list = r.ok ? await r.json() : [];
      setHistoryRows(Array.isArray(list) ? list : []);
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
      const res = await fetch("/api/inventory-checks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checked_by: authSession?.employeeName ?? "익명",
          items: rows.map(r => ({
            product_code:     r.code,
            product_name:     r.product.name,
            // 신규 5-분리 컬럼
            warehouse1_stock: r.warehouse1Qty !== "" ? Number(r.warehouse1Qty) : null,
            warehouse2_stock: r.warehouse2Qty !== "" ? Number(r.warehouse2Qty) : null,
            store_stock:      r.store1Qty     !== "" ? Number(r.store1Qty)     : null,   // 매장1
            store_stock_2:    r.store2Qty     !== "" ? Number(r.store2Qty)     : null,   // 매장2
            store3_stock:     r.store3Qty     !== "" ? Number(r.store3Qty)     : null,   // 매장3
            // 매장 구역 (편집된 값 · 없으면 auto 값 저장)
            store1_zone:      r.store1Zone,
            store2_zone:      r.store2Zone,
            store3_zone:      r.store3Zone,
            // 레거시 mirror (구 클라이언트 하위 호환용 · 서버가 warehouse1 우선 처리)
            warehouse_stock:  r.warehouse1Qty !== "" ? Number(r.warehouse1Qty) : null,
          })),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? `저장 실패 (${res.status})`);
      }
      const j = await res.json() as { saved?: number; failed?: number; downgraded?: boolean };
      setSavedCount(j.saved ?? rows.length);
      setSaveStatus("done");
      showToast(
        j.downgraded
          ? `${j.saved ?? rows.length}건 저장 완료 (DB 컬럼 확장 대기 · 레거시 모드)`
          : `${j.saved ?? rows.length}건 저장 완료`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장 실패";
      setSaveError(msg);
      setSaveStatus("error");
    }
  };

  // 합계 계산 헬퍼
  const total = (r: StockRow): number => {
    const w1 = r.warehouse1Qty !== "" ? Number(r.warehouse1Qty) : 0;
    const w2 = r.warehouse2Qty !== "" ? Number(r.warehouse2Qty) : 0;
    const s1 = r.store1Qty     !== "" ? Number(r.store1Qty)     : 0;
    const s2 = r.store2Qty     !== "" ? Number(r.store2Qty)     : 0;
    const s3 = r.store3Qty     !== "" ? Number(r.store3Qty)     : 0;
    return w1 + w2 + s1 + s2 + s3;
  };

  // 요약 카운트
  const warehouse1Total = rows.reduce((s, r) => s + (Number(r.warehouse1Qty) || 0), 0);
  const warehouse2Total = rows.reduce((s, r) => s + (Number(r.warehouse2Qty) || 0), 0);
  const store1Total     = rows.reduce((s, r) => s + (Number(r.store1Qty)     || 0), 0);
  const store2Total     = rows.reduce((s, r) => s + (Number(r.store2Qty)     || 0), 0);
  const store3Total     = rows.reduce((s, r) => s + (Number(r.store3Qty)     || 0), 0);
  const grandTotal      = warehouse1Total + warehouse2Total + store1Total + store2Total + store3Total;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col bg-[#f8f9fb]" : "min-h-screen bg-[#f8f9fb] flex flex-col"}>

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
      <div className="bg-white border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600
            flex items-center justify-center shadow-sm shrink-0">
            <ScanLine size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-[15px] sm:text-[17px] font-black text-slate-900 leading-none">실재고 입력</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-none">
              바코드 스캔 후 창고1·2 · 매장1·2·3 수량 입력 · 전체 저장
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
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5
        flex flex-col lg:flex-row gap-4 lg:gap-5">

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL · 스캐너 + 마지막 스캔 상품
        ══════════════════════════════════════════════════════ */}
        <aside className="lg:w-[300px] xl:w-[320px] lg:shrink-0 flex flex-col gap-4
          lg:sticky lg:top-4 lg:self-start">

          {/* ── 스캔 카드 ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">

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
              {/* 바코드 스캔 버튼 · 상단 (2026-08-09 사용자 요청 · 검색은 아래) */}
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

              {/* 2026-08-09 · 상품 검색 · 바코드 스캔 버튼 아래 (사용자 요청) */}
              <ProductSearchInput
                accent="teal"
                placeholder="상품명·코드 검색"
                onSelect={(code) => handleScan(code)}
              />

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

              {lastProduct && (
                <div className="flex flex-col rounded-2xl overflow-hidden
                  bg-white border border-teal-200/80
                  shadow-[0_2px_8px_rgba(20,184,166,0.08)]">

                  {/* ── 헤더 · 라벨 + 상품코드 ── */}
                  <div className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-teal-50 to-transparent border-b border-teal-100">
                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                    <span className="text-[10px] font-black text-teal-700 uppercase tracking-wider">최근 스캔</span>
                    {lastCode && (
                      <span className="ml-auto text-[10px] font-mono tabular-nums text-slate-500 truncate max-w-[140px]">
                        {lastCode}
                      </span>
                    )}
                  </div>

                  {/* ── 본문 · 상품명 옆에 구역·공급사 한 줄 (2026-08-10 사용자 요청) ── */}
                  <div className="px-3.5 py-3 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {/* 상품명 · 큰 글씨 */}
                      <p className="text-[15px] sm:text-[16px] font-black text-slate-900
                        break-words whitespace-normal leading-snug">
                        {lastProduct.name}
                      </p>
                      {/* 구역 · 공급사 · 텍스트 · 상품명 옆 */}
                      {(lastProduct as any).spec && (
                        <span className="inline-flex items-baseline gap-1 text-[12px]">
                          <span className="text-slate-400 font-semibold">구역</span>
                          <span className="text-violet-700 font-black">{(lastProduct as any).spec}</span>
                        </span>
                      )}
                      {(lastProduct as any).supplier && (
                        <span className="inline-flex items-baseline gap-1 text-[12px] min-w-0">
                          <span className="text-slate-400 font-semibold">공급사</span>
                          <span className="text-sky-700 font-black truncate">{(lastProduct as any).supplier}</span>
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
                      bg-gradient-to-r from-violet-500 to-violet-600
                      hover:from-violet-600 hover:to-violet-700
                      active:from-violet-700 active:to-violet-800
                      text-white text-[13px] sm:text-[14px] font-black shadow-inner
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
        </aside>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL · 스캔 리스트 테이블
        ══════════════════════════════════════════════════════ */}
        <section className="flex-1 min-w-0 flex flex-col gap-4">

          {/* 2026-08-10 · 사용자 요청 · 상품별 실재고 집계 카드 제거 */}

<div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col min-h-[320px] overflow-hidden">

            <div className="flex items-center justify-between
              px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-200/80
              bg-gradient-to-r from-slate-50/80 to-white rounded-t-2xl sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
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
                      {/* 2026-08-10 · 사용자 요청 · 시각 컬럼 제거 */}
                      {/* 상품명 */}
                      <th
                        className="text-left px-2 py-2.5 font-bold text-slate-400 min-w-[140px]
                          cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        상품명 <SortIcon active={sortKey === "name"} dir={sortDir} />
                      </th>
                      {/* 2026-08-10 · 구역 (real_map) 컬럼 제거 · 사용자 요청 */}
                      {/* 창고1 · 데스크탑만 · lg 이상 개별 표시 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[80px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-orange-400" /> 창고1
                        </span>
                      </th>
                      {/* 창고2 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[80px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-amber-400" /> 창고2
                        </span>
                      </th>
                      {/* 매장1 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-emerald-500" /> 매장1
                        </span>
                      </th>
                      {/* 매장2 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-sky-500" /> 매장2
                        </span>
                      </th>
                      {/* 매장3 */}
                      <th className="hidden lg:table-cell text-center px-1.5 py-2.5 w-[84px] font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Store size={11} className="text-violet-500" /> 매장3
                        </span>
                      </th>
                      {/* 모바일·태블릿 통합 재고 헤더 · lg 미만 (2026-08-05 · 사용자 요청 반응형 wrap) */}
                      <th className="lg:hidden text-center px-2 py-2.5 font-bold text-slate-400 whitespace-nowrap min-w-[240px]">
                        <span className="inline-flex items-center gap-1">
                          <Warehouse size={11} className="text-amber-500" /> 재고
                          <span className="text-[10px] text-slate-300 font-normal">(창고1·2 / 매장1·2·3)</span>
                        </span>
                      </th>
                      {/* 합계 */}
                      <th className="text-center px-2 py-2.5 w-[54px] font-bold text-slate-400 whitespace-nowrap">
                        합계
                      </th>
                      {/* 삭제 */}
                      <th className="px-2 py-2.5 w-9" />
                    </tr>
                  </thead>

                  <tbody>
                    {sortedRows.map((row, idx) => {
                      const isRecent = row.key === lastAddedKey;
                      // 2026-08-10 · 사용자 요청 · 시각 컬럼 제거 (addedAt 필드는 정렬용 유지)
                      const rm = (row.product as any).realMap ?? (row.product as any).real_map ?? null;
                      const rowTotal = total(row);
                      const hasAnyValue =
                        row.warehouse1Qty !== "" || row.warehouse2Qty !== "" ||
                        row.store1Qty !== "" || row.store2Qty !== "" || row.store3Qty !== "";

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
                          {/* 2026-08-10 · 시각 셀 제거 */}

                          {/* 상품명 · 규격 · 코드 */}
                          <td className="px-2 py-2 align-middle min-w-[140px]">
                            <p className="text-[12px] sm:text-[13px] font-black text-slate-800
                              break-words whitespace-normal leading-snug">
                              {row.product.name}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {(row.product as any).spec && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold
                                  text-slate-500 bg-slate-100/80 rounded px-1.5 py-0.5">
                                  <Box size={8} className="text-slate-400" />
                                  {(row.product as any).spec}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono
                                text-slate-400 bg-slate-100/60 rounded px-1.5 py-0.5">
                                <Hash size={8} className="text-slate-300" />
                                {row.code}
                              </span>
                            </div>
                          </td>

                          {/* 2026-08-10 · 구역 원본 (real_map) 셀 제거 · 사용자 요청 */}

                          {/* 창고1 · 데스크탑만 */}
                          <td className="hidden lg:table-cell px-1 py-2 align-middle">
                            <NumberInput
                              value={row.warehouse1Qty}
                              onChange={v => patchRow(row.key, { warehouse1Qty: v })}
                              accent="focus:border-orange-400"
                            />
                          </td>

                          {/* 창고2 · 데스크탑만 */}
                          <td className="hidden lg:table-cell px-1 py-2 align-middle">
                            <NumberInput
                              value={row.warehouse2Qty}
                              onChange={v => patchRow(row.key, { warehouse2Qty: v })}
                              accent="focus:border-amber-400"
                            />
                          </td>

                          {/* 매장1 · 데스크탑만 */}
                          <td className="hidden lg:table-cell px-1 py-2 align-middle">
                            <div className="flex flex-col gap-0.5">
                              <NumberInput
                                value={row.store1Qty}
                                onChange={v => patchRow(row.key, { store1Qty: v })}
                                accent="focus:border-emerald-400"
                              />
                              <ZoneInput
                                value={row.store1Zone}
                                placeholder="-"
                                accentClass="text-emerald-600 focus:border-emerald-400"
                                onChange={v => patchRow(row.key, { store1Zone: v })}
                              />
                            </div>
                          </td>

                          {/* 매장2 · 데스크탑만 */}
                          <td className="hidden lg:table-cell px-1 py-2 align-middle">
                            <div className="flex flex-col gap-0.5">
                              <NumberInput
                                value={row.store2Qty}
                                onChange={v => patchRow(row.key, { store2Qty: v })}
                                accent="focus:border-sky-400"
                              />
                              <ZoneInput
                                value={row.store2Zone}
                                placeholder="-"
                                accentClass="text-sky-600 focus:border-sky-400"
                                onChange={v => patchRow(row.key, { store2Zone: v })}
                              />
                            </div>
                          </td>

                          {/* 매장3 · 데스크탑만 */}
                          <td className="hidden lg:table-cell px-1 py-2 align-middle">
                            <div className="flex flex-col gap-0.5">
                              <NumberInput
                                value={row.store3Qty}
                                onChange={v => patchRow(row.key, { store3Qty: v })}
                                accent="focus:border-violet-400"
                              />
                              <ZoneInput
                                value={row.store3Zone}
                                placeholder="-"
                                accentClass="text-violet-600 focus:border-violet-400"
                                onChange={v => patchRow(row.key, { store3Zone: v })}
                              />
                            </div>
                          </td>

                          {/* 2026-08-10 · 사용자 요청 · 이전 저장 재고 표시 (참조) + 신규 입력 (편집)
                              모바일·태블릿 · 창고 첫 줄 · 매장 다음 줄 · 매장에 구역 표시 */}
                          <td className="lg:hidden px-1 py-2 align-middle">
                            <div className="flex flex-col gap-1.5">
                              {/* Row 1 · 창고1·2 */}
                              <div className="grid grid-cols-2 gap-1">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-orange-500 text-center leading-none">창1</span>
                                  <span className="text-[9px] text-slate-400 tabular-nums text-center leading-none">이전 {row.prevWarehouse1Qty ?? "-"}</span>
                                  <NumberInput value={row.warehouse1Qty}
                                    onChange={v => patchRow(row.key, { warehouse1Qty: v })}
                                    accent="focus:border-orange-400" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-amber-500 text-center leading-none">창2</span>
                                  <span className="text-[9px] text-slate-400 tabular-nums text-center leading-none">이전 {row.prevWarehouse2Qty ?? "-"}</span>
                                  <NumberInput value={row.warehouse2Qty}
                                    onChange={v => patchRow(row.key, { warehouse2Qty: v })}
                                    accent="focus:border-amber-400" />
                                </div>
                              </div>
                              {/* Row 2 · 매장1·2·3 · 구역 표시 */}
                              <div className="grid grid-cols-3 gap-1">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-emerald-500 text-center leading-none">매1</span>
                                  <span className="text-[9px] text-slate-400 tabular-nums text-center leading-none">이전 {row.prevStore1Qty ?? "-"}</span>
                                  <NumberInput value={row.store1Qty}
                                    onChange={v => patchRow(row.key, { store1Qty: v })}
                                    accent="focus:border-emerald-400" />
                                  <ZoneInput value={row.store1Zone} placeholder="구역"
                                    accentClass="text-emerald-600 focus:border-emerald-400"
                                    onChange={v => patchRow(row.key, { store1Zone: v })} />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-sky-500 text-center leading-none">매2</span>
                                  <span className="text-[9px] text-slate-400 tabular-nums text-center leading-none">이전 {row.prevStore2Qty ?? "-"}</span>
                                  <NumberInput value={row.store2Qty}
                                    onChange={v => patchRow(row.key, { store2Qty: v })}
                                    accent="focus:border-sky-400" />
                                  <ZoneInput value={row.store2Zone} placeholder="구역"
                                    accentClass="text-sky-600 focus:border-sky-400"
                                    onChange={v => patchRow(row.key, { store2Zone: v })} />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[9px] font-bold text-violet-500 text-center leading-none">매3</span>
                                  <span className="text-[9px] text-slate-400 tabular-nums text-center leading-none">이전 {row.prevStore3Qty ?? "-"}</span>
                                  <NumberInput value={row.store3Qty}
                                    onChange={v => patchRow(row.key, { store3Qty: v })}
                                    accent="focus:border-violet-400" />
                                  <ZoneInput value={row.store3Zone} placeholder="구역"
                                    accentClass="text-violet-600 focus:border-violet-400"
                                    onChange={v => patchRow(row.key, { store3Zone: v })} />
                                </div>
                              </div>
                            </div>
                          </td>

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

                          {/* 이력·진열요청·삭제 */}
                          <td className="px-2 py-2 text-center align-middle">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => openHistory(row.code, row.product.name)}
                                className="relative w-7 h-7 flex items-center justify-center rounded-lg
                                  text-slate-300 hover:text-teal-600 hover:bg-teal-50
                                  transition-all duration-150 cursor-pointer"
                                title="실재고 저장 이력"
                              >
                                <History size={13} />
                                {(row.historyCount ?? 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1
                                    text-[9px] font-black text-white bg-teal-500 rounded-full
                                    flex items-center justify-center leading-none tabular-nums">
                                    {row.historyCount}
                                  </span>
                                )}
                              </button>
                              {/* T20/Phase 2 · 진열요청 · 매장 재고 부족 시 amber 강조 */}
                              <button
                                onClick={() => requestDisplay(row)}
                                disabled={requestingKey === row.key}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                                  (row.store1Qty === "" || Number(row.store1Qty) === 0) &&
                                  (row.store2Qty === "" || Number(row.store2Qty) === 0) &&
                                  (row.store3Qty === "" || Number(row.store3Qty) === 0)
                                    ? "text-amber-500 bg-amber-50 hover:text-amber-700 hover:bg-amber-100 animate-pulse"
                                    : "text-slate-300 hover:text-violet-600 hover:bg-violet-50"
                                }`}
                                title="진열요청 전송 · 매장 재고 부족 시 강조"
                              >
                                {requestingKey === row.key
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <Megaphone size={13} />}
                              </button>
                              <button
                                onClick={() => removeRow(row.key)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg
                                  text-slate-300 hover:text-rose-500 hover:bg-rose-50
                                  transition-all duration-150 cursor-pointer"
                                title="삭제"
                              >
                                <Trash2 size={13} />
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

          {/* ── 전체 저장 카드 ── */}
          {rows.length > 0 && (
            <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
              saveStatus === "done"
                ? "border-emerald-300/80 shadow-[0_0_0_4px_rgba(16,185,129,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
                : "border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
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
                  창고1·2 · 매장1·2·3 수량과 구역을 확인한 뒤 아래 버튼을 누르세요.
                </p>

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
                      저장 완료. 재고관리 · 실재고 탭에서 차이 있는 상품을 확인할 수 있습니다.
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

      {/* ── T-SCAN-1 (2026-08-05) · 스캔 즉시 상품 실재고 정보 모달 · [진열요청] 진입점 ── */}
      {/* 창고1/2 + 매장1/2/3 5개 슬롯 · 한 화면에 flex-wrap 배치 · 실재고 편집 가능 · 하단 [진열요청] */}
      {scanModal && (() => {
        // 최신 row 참조 (rows state 에서 lookup · 히스토리 로드 반영)
        const liveRow = rows.find(r => r.key === scanModal.key) ?? scanModal;
        return (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9997] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setScanModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[90vh] bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 to-transparent flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2 flex-1">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Package size={16} className="text-violet-600" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9.5px] font-bold text-violet-600 uppercase tracking-widest">상품 실재고 정보</div>
                  <div className="text-[13.5px] font-black text-slate-800 break-keep line-clamp-2 leading-tight">{liveRow.product.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{liveRow.code}</div>
                </div>
              </div>
              <button
                onClick={() => setScanModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={16} />
              </button>
            </div>
            {/* 본문 · 컴팩트 · 한 화면 보장 · scroll 없이 5칸 */}
            <div className="px-3 py-2.5 flex flex-col gap-2">
              {/* 배정 구역 · 카테고리 · 공급처 · 규격 · 1줄 chip · 넘치면 truncate */}
              <div className="flex items-center gap-1 flex-wrap text-[10px]">
                {((liveRow.product as any).realMap ?? (liveRow.product as any).real_map) && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-black">
                    <MapPin size={9} /> {(liveRow.product as any).realMap ?? (liveRow.product as any).real_map}
                  </span>
                )}
                {(liveRow.product as any).category && (
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold">
                    {(liveRow.product as any).category}
                  </span>
                )}
                {(liveRow.product as any).supplier && (
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 font-semibold truncate max-w-[120px]">
                    {(liveRow.product as any).supplier}
                  </span>
                )}
                {(liveRow.product as any).spec && (
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500 font-medium truncate max-w-[80px]">
                    {(liveRow.product as any).spec}
                  </span>
                )}
              </div>
              {/* 창고1 · 창고2 · 매장1 · 매장2 · 매장3 · 항상 5열 (모바일도 5칸 강제) · 한 화면 보장 */}
              <div className="grid grid-cols-5 gap-1">
                {([
                  { key: "warehouse1Qty" as const, label: "창1", Icon: Warehouse, tone: "sky",   zone: null,               requestable: false },
                  { key: "warehouse2Qty" as const, label: "창2", Icon: Warehouse, tone: "sky",   zone: null,               requestable: false },
                  { key: "store1Qty"     as const, label: "매1", Icon: Store,     tone: "amber", zone: liveRow.store1Zone, requestable: true  },
                  { key: "store2Qty"     as const, label: "매2", Icon: Store,     tone: "amber", zone: liveRow.store2Zone, requestable: true  },
                  { key: "store3Qty"     as const, label: "매3", Icon: Store,     tone: "amber", zone: liveRow.store3Zone, requestable: true  },
                ]).map(({ key, label, Icon, tone, zone, requestable }) => {
                  const val = liveRow[key];
                  const toneCls = tone === "sky"
                    ? { chip: "bg-sky-50 border-sky-200",   label: "text-sky-700" }
                    : { chip: "bg-amber-50 border-amber-200", label: "text-amber-700" };
                  return (
                    <div key={key} className={`rounded-md border ${toneCls.chip} px-1 py-1 flex flex-col gap-0.5 min-w-0`}>
                      <div className={`flex items-center gap-0.5 text-[9px] font-black uppercase ${toneCls.label} leading-none`}>
                        <Icon size={8} className="shrink-0" />
                        <span className="tabular-nums">{label}</span>
                        {zone && <span className="ml-auto text-[8px] text-slate-500 font-bold tabular-nums truncate">{zone}</span>}
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={val}
                        onChange={e => patchRow(liveRow.key, { [key]: e.target.value === "" ? "" : Number(e.target.value) })}
                        placeholder="0"
                        className="w-full bg-white/70 border border-transparent rounded px-1 py-0.5 text-[12.5px] font-black text-slate-800 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-violet-400 min-w-0"
                      />
                      {requestable && (
                        <button
                          type="button"
                          onClick={async () => { await requestDisplay(liveRow, zone); }}
                          disabled={requestingKey === liveRow.key}
                          title={zone ? `${label} (${zone}) 진열요청` : `${label} 진열요청 · 구역 미지정`}
                          className="w-full h-5 rounded text-[8.5px] font-black text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-0.5"
                        >
                          {requestingKey === liveRow.key ? (
                            <Loader2 size={8} className="animate-spin" />
                          ) : (
                            <><Megaphone size={8} /> 요청</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 힌트 · 매우 컴팩트 */}
              <div className="text-[9.5px] text-slate-500 font-semibold text-center leading-tight">
                입력 · 리스트 자동반영 · 매장 슬롯 [요청] 은 해당 구역만 전송
              </div>
            </div>
            {/* 액션 버튼 · [닫기] (구역별 요청은 슬롯 안 미니 버튼에서 처리) */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScanModal(null)}
                className="w-full h-10 rounded-lg text-[12px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── 실재고 이력 조회 모달 ─────────────────────────────── */}
      {historyModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setHistoryModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[85vh] bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">실재고 저장 이력</div>
                <div className="text-sm font-black text-slate-800 truncate">{historyModal.name}</div>
                <div className="text-[10px] text-slate-400 font-mono">{historyModal.code}</div>
              </div>
              <button
                onClick={() => setHistoryModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
                title="닫기"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-xs font-semibold">
                  <Loader2 size={16} className="animate-spin mr-2" /> 이력 조회 중...
                </div>
              ) : historyRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs font-semibold">
                  <History size={22} className="mb-2 text-slate-300" />
                  저장 이력이 없습니다.
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
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
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map(h => {
                      const dt = h.checked_at ? new Date(h.checked_at) : null;
                      const dtLabel = dt
                        ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`
                        : "-";
                      const w1 = h.warehouse1_stock ?? h.warehouse_stock;
                      return (
                        <tr key={h.id} className="hover:bg-teal-50/40">
                          <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{dtLabel}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-700">{w1 ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-700">{h.warehouse2_stock ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-700">{h.store_stock ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-700">{h.store_stock_2 ?? "-"}</td>
                          <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-700">{h.store3_stock ?? "-"}</td>
                          <td className="px-3 py-2 text-slate-600 truncate max-w-[100px]">{h.checked_by ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 text-[10px] text-slate-400 font-semibold text-center">
              같은 날 저장은 덮어쓰고, 다른 날 저장은 이력으로 추가됩니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
