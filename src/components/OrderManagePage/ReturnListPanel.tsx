// 2026-08-17 · apiClient 마이그레이션
// src/components/OrderManagePage/ReturnListPanel.tsx
// 반품필요 탭을 독립 컴포넌트로 추출 (2026-07-31 · 탭 스왑 · StockManagePage 이동용)
// 기존 OrderManagePage의 return 탭 state/fetch/JSX 를 그대로 캡슐화
// 2026-08-03 · 반품 요청서 모달 · 발주서 스타일로 재설계 (#188)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import { Package, Truck, ChevronRight, ChevronDown, CheckCircle2 } from "lucide-react";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { displayVendorName } from "../../utils/vendorNameNormalize";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { AccentBar } from "../common/AccentBar";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-26 · 프레임워크 · useConfirm 프리미티브 · window.confirm 대체
import { useConfirm } from "../../hooks/useConfirm";

// 2026-08-21 · Framework Phase 4 · large-file 분리 · types + helpers 이관
import type { ReturnReasonKey, ReturnLineItem } from "./ReturnListPanel.types";
import { buildReturnNumber, todayStr } from "./ReturnListPanel.types";
// 2026-08-21 · Framework Phase 4 · ReturnRequestModal 별도 파일 분리
import { ReturnRequestModal } from "./ReturnRequestModal";
// 2026-08-22 · Framework Phase 4 · ReturnFilterBar 별도 파일 이관
import { ReturnFilterBar } from "./ReturnListPanel.panels";

interface ReturnListPanelProps {
  /** 공급사명 클릭 시 공급사 상세 모달 열기 콜백 */
  onSupplierClick?: (name: string) => void;
}

// ── ReturnListPanel (메인 export) ────────────────────────────────────────
export const ReturnListPanel: React.FC<ReturnListPanelProps> = ({ onSupplierClick }) => {
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();
  // DB + 하드코딩 병합 reference 값
  const { vendorCategories: dbVendorCategories } = useReferenceValues();

  // ── state ──────────────────────────────────────────────────────────────
  // 2026-08-03 · 반품필요 컬럼 재편 · 실재고 컬럼 추가 · 1/2/3달 판매량 컬럼 (판매액 제거)
  type ReturnItem = {
    product_code: string;
    product_name: string;
    supplier: string | null;
    purchase_cycle: number | null;
    sale_qty_cycle: number;
    sale_qty_month: number | null;   // 최근 30일 (1달)
    sale_qty_60d: number | null;     // 최근 60일 (2달) · 2026-08-03 추가
    sale_qty_90d: number | null;     // 최근 90일 (3달) · 2026-08-03 추가
    last_purchase_date: string | null;
    last_purchase_qty: number | null;
    current_stock: number;
    actual_stock: number | null;     // 실재고 · inventory_checks 최신값 합계 · 2026-08-03 추가
    purchase_price: number;
  };
  const [returnList, setReturnList] = useState<ReturnItem[]>([]);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnCycleMin, setReturnCycleMin] = useState<number>(90);
  const [returnSalesMax, setReturnSalesMax] = useState<number>(5);
  // 2026-08-06 · 3개월 판매 조건 신규 (사용자 요청 · 반품필요 반응형 UI)
  const [returnSalesQuarterMax, setReturnSalesQuarterMax] = useState<number>(15);
  // 2026-07-31 · 사용자 요청 · 공급사 검색 필터 (부분일치 · 대소문자 무시)
  const [returnSupplierSearch, setReturnSupplierSearch] = useState<string>("");
  const [returnCategoryFilter, setReturnCategoryFilter] = useState<string>("전체");

  type ReturnSortKey = "product_name" | "supplier" | "current_stock" | "actual_stock" | "purchase_cycle" | "sale_qty_month" | "sale_qty_60d" | "sale_qty_90d" | "last_purchase_date" | "last_purchase_qty" | "stock_value";
  const [returnSortKey, setReturnSortKey] = useState<ReturnSortKey>("purchase_cycle");
  const [returnSortDir, setReturnSortDir] = useState<"asc" | "desc">("desc");
  const handleReturnSort = (k: ReturnSortKey) => {
    if (returnSortKey === k) setReturnSortDir(d => d === "asc" ? "desc" : "asc");
    else { setReturnSortKey(k); setReturnSortDir("asc"); }
  };
  const retArrow = (k: ReturnSortKey) => returnSortKey !== k ? " ⇅" : returnSortDir === "asc" ? " ▲" : " ▼";

  const loadReturnList = useCallback(async () => {
    setReturnLoading(true);
    try {
      // 2026-08-03 · 병렬 · top-sales (반품필요 원본) + inventory-checks (실재고 컬럼용)
      const [salesResult, invResult] = await Promise.allSettled([
        api.get<any>("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc"),
        api.get<any>("/api/inventory-checks"),
      ]);
      if (salesResult.status === "rejected") throw salesResult.reason;
      const data = salesResult.value.data;
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];

      // 실재고 맵 · product_code 별 최신 · warehouse1+warehouse2+store1+store2+store3
      //   레거시 fallback · warehouse_stock + store_stock + store_stock_2
      const actualByCode = new Map<string, number>();
      if (invResult.status === "fulfilled") {
        try {
          const invRaw: any[] = Array.isArray(invResult.value.data) ? invResult.value.data : [];
          const latestByCode = new Map<string, any>();
          for (const r of Array.isArray(invRaw) ? invRaw : []) {
            const code = String(r?.product_code ?? "").trim();
            if (!code) continue;
            if (!latestByCode.has(code)) latestByCode.set(code, r); // API 는 checked_at desc 로 이미 정렬
          }
          latestByCode.forEach((row, code) => {
            const num = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
            const w1 = row.warehouse1_stock ?? row.warehouse_stock ?? 0;
            const w2 = row.warehouse2_stock ?? 0;
            const s1 = row.store_stock ?? 0;         // store_stock == store1
            const s2 = row.store_stock_2 ?? 0;
            const s3 = row.store3_stock ?? 0;
            // hasAny · 아무 값도 없으면 skip (실재고 정보 없음 · null 유지)
            if (row.warehouse1_stock == null && row.warehouse2_stock == null &&
                row.warehouse_stock == null && row.store_stock == null &&
                row.store_stock_2 == null && row.store3_stock == null) {
              return;
            }
            actualByCode.set(code, num(w1) + num(w2) + num(s1) + num(s2) + num(s3));
          });
        } catch (e: any) {
          console.warn("[반품필요] 실재고 파싱 실패:", e?.message);
        }
      }

      const items: ReturnItem[] = rows.map(r => {
        const cnt = Number(r.purchase_count ?? 0);
        const first = String(r.first_purchase_date ?? "");
        const last = String(r.last_purchase_date ?? "");
        let cycle: number | null = null;
        if (cnt >= 2 && first && last && first !== last) {
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : null;
        }
        const code = String(r.product_code ?? "");
        // 실재고 조회 · 원본 code + stripped(앞자리 0 제거) 두 키 모두 시도
        const stripped = code.replace(/^0+/, "");
        const actual = actualByCode.has(code) ? (actualByCode.get(code) ?? null)
                     : actualByCode.has(stripped) ? (actualByCode.get(stripped) ?? null)
                     : null;
        return {
          product_code: code,
          product_name: String(r.product_name ?? ""),
          supplier: r.supplier ?? null,
          purchase_cycle: cycle,
          sale_qty_cycle: Number(r.sale_qty_cycle ?? 0),
          sale_qty_month: r.sale_qty_month != null ? Number(r.sale_qty_month) : (r.sale_qty_1m != null ? Number(r.sale_qty_1m) : null),
          sale_qty_60d:   r.sale_qty_60d   != null ? Number(r.sale_qty_60d)   : null,
          sale_qty_90d:   r.sale_qty_90d   != null ? Number(r.sale_qty_90d)   : null,
          last_purchase_date: r.last_purchase_date ?? null,
          last_purchase_qty: r.last_purchase_qty != null ? Number(r.last_purchase_qty) : (r.last_snapshot_qty != null ? Number(r.last_snapshot_qty) : null),
          current_stock: Number(r.current_stock ?? r.closing_stock ?? 0),
          actual_stock: actual,
          purchase_price: Number(r.purchase_price ?? 0),
        };
      });
      const filtered = items.filter(x => {
        if (x.current_stock <= 0) return false;
        if (x.purchase_cycle != null && x.purchase_cycle >= returnCycleMin && x.sale_qty_cycle <= returnSalesMax && (x.sale_qty_90d ?? 0) <= returnSalesQuarterMax) return true;
        return false;
      });
      filtered.sort((a, b) => (b.purchase_cycle ?? 0) - (a.purchase_cycle ?? 0));
      setReturnList(filtered);
      // 매입 탭 · 반품필요 서브탭 배지용 · 필터링 전 원본 갯수
      try { window.dispatchEvent(new CustomEvent("return-need-count", { detail: { count: filtered.length } })); } catch { /**/ }
    } catch (e: any) {
      console.warn("[반품필요] 로드 실패:", e?.message);
      setReturnList([]);
      showError(`반품필요 목록 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally {
      setReturnLoading(false);
    }
  }, [returnCycleMin, returnSalesMax]);

  // 마운트 시 자동 로드
  useEffect(() => { loadReturnList(); }, [loadReturnList]);

  // ── 공급사 카테고리 맵 (배지용) · 공용 훅 ──────────────────────────────
  const { vendorMap, vendorCategoryMap } = useVendors();

  // ── 우측 패널 (상품 상세) ───────────────────────────────────────────────
  const [returnSelectedProduct, setReturnSelectedProduct] = useState<{ code: string; name: string } | null>(null);
  const [returnPanelFull, setReturnPanelFull] = useState<Record<string, any> | null>(null);
  const [returnPanelLoading, setReturnPanelLoading] = useState(false);
  const [returnPanelError, setReturnPanelError] = useState<string | null>(null);
  const [returnDetailTab, setReturnDetailTab] = useState<"info" | "purchase" | "sales">("info");
  // 반품 패널 폭 (useResizablePanel 훅 · god-phase1)
  const { width: returnPanelWidth, startResize: onReturnResizeStart } = useResizablePanel({
    storageKey: "megatown_return_panel_w",
    defaultWidth: 560,
    minWidth: 320,
    maxWidth: 1000,
  });

  useEffect(() => {
    if (!returnSelectedProduct) { setReturnPanelFull(null); setReturnPanelError(null); return; }
    setReturnPanelLoading(true); setReturnPanelError(null);
    (async () => {
      try {
        const { data } = await api.get<any>(`/api/products/${encodeURIComponent(returnSelectedProduct.code)}`);
        setReturnPanelFull(data);
      } catch (e: any) {
        const msg = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
        setReturnPanelError(msg);
        showError(`상품 조회 실패: ${msg}`);
      }
      finally { setReturnPanelLoading(false); }
    })();
  }, [returnSelectedProduct]);

  // ── 그룹 접기 ──────────────────────────────────────────────────────────
  const [returnGroupCollapsed, setReturnGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleReturnGroup = (g: string) => setReturnGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isReturnGroupCollapsed = (g: string) => returnGroupCollapsed.has(g);

  // ── 반품요청 모달 ────────────────────────────────────────────────────────
  const [returnRequestItem, setReturnRequestItem] = useState<any | null>(null);
  // 일괄 반품 · 선택 상품 배열 (있으면 모달 items props 로 전달)
  const [returnRequestItems, setReturnRequestItems] = useState<any[] | null>(null);
  // 2026-08-25 · 사용자 지시 · 반품확정 (모달 없이 즉시 status='done' 저장) · row 스피너
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null);
  // 2026-08-27 · 감사 #1 · confirmReturn · silent 에러 처리 대신 · 실패 시 throw
  //   · 단일 호출 (row 액션) · try/catch 로 감싸 showError + rethrow
  //   · bulkConfirmReturn · Promise.allSettled · 성공/실패 정확 집계
  const confirmReturnRaw = React.useCallback(async (row: any): Promise<void> => {
    // 1) return_requests 생성 (POST 는 항상 pending)
    const reason = row.purchase_cycle != null && Number(row.purchase_cycle) >= 90 ? "저조 판매" : "재고 과다";
    const createRes = await api.post<{ ok: boolean; row: { id: number } }>("/api/return-requests", {
      product_code: row.product_code,
      product_name: row.product_name,
      supplier: row.supplier ?? null,
      qty: Number(row.current_stock ?? 0),
      current_stock: Number(row.current_stock ?? 0),
      purchase_price: Number(row.purchase_price ?? 0),
      reason,
    });
    const id = createRes?.data?.row?.id;
    if (!id) throw new Error("생성 응답에 id 없음");
    // 2) PATCH status='done' · 실패 시 상위로 throw (호출자가 성공/실패 판정)
    await api.patch(`/api/return-requests/${id}`, { status: "done" });
    // 3) 로컬 반품필요 리스트에서 제거
    setReturnList(prev => prev.filter(x => x.product_code !== row.product_code));
    setReturnSelected(prev => {
      if (!prev.has(row.product_code)) return prev;
      const n = new Set(prev); n.delete(row.product_code); return n;
    });
    dispatchApprovalChange("return");
  }, []);

  // 단일 · row 액션 · UI 스피너 + 오류 토스트 (외부 caller 는 결과 판단 필요 없음)
  const confirmReturn = React.useCallback(async (row: any): Promise<boolean> => {
    setConfirmingCode(String(row.product_code));
    try {
      await confirmReturnRaw(row);
      return true;
    } catch (e: any) {
      console.error("[반품확정] 실패:", e?.message ?? e);
      showError(`반품확정 실패: ${e?.message ?? "네트워크 오류"}`);
      return false;
    } finally {
      setConfirmingCode(null);
    }
  }, [showError, confirmReturnRaw]);

  // ── 일괄 반품 · 체크박스 선택 (세션 state · localStorage 없음) ───────────
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set());
  const toggleReturnRow = (code: string) => setReturnSelected(prev => {
    const n = new Set(prev);
    if (n.has(code)) n.delete(code); else n.add(code);
    return n;
  });

  // ── 필터+정렬 완료 rows · 헤더 전체선택과 body map 이 공유 ──────────────
  // 2026-08-25 · 사용자 지시 · 검색어 · 공급사·상품·상품코드 통합 매칭 (OR)
  const filteredSortedRows = useMemo(() => {
    const q = returnSupplierSearch.trim().toLowerCase();
    return [...returnList].filter(x => {
      if (q) {
        const supplier = String(x.supplier ?? "").toLowerCase();
        const name     = String(x.product_name ?? "").toLowerCase();
        const code     = String(x.product_code ?? "").toLowerCase();
        if (!supplier.includes(q) && !name.includes(q) && !code.includes(q)) return false;
      }
      if (returnCategoryFilter !== "전체") {
        const cat = vendorCategoryMap[String(x.supplier ?? "").trim()] ?? null;
        if (cat !== returnCategoryFilter) return false;
      }
      return true;
    }).sort((a, b) => {
      const dir = returnSortDir === "asc" ? 1 : -1;
      switch (returnSortKey) {
        case "product_name":       return dir * String(a.product_name).localeCompare(String(b.product_name), "ko");
        case "supplier":           return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
        case "current_stock":      return dir * (a.current_stock - b.current_stock);
        case "actual_stock":       return dir * ((a.actual_stock ?? -1) - (b.actual_stock ?? -1));
        case "purchase_cycle":     return dir * ((a.purchase_cycle ?? 0) - (b.purchase_cycle ?? 0));
        case "sale_qty_month":     return dir * ((a.sale_qty_month ?? 0) - (b.sale_qty_month ?? 0));
        case "sale_qty_60d":       return dir * ((a.sale_qty_60d ?? 0) - (b.sale_qty_60d ?? 0));
        case "sale_qty_90d":       return dir * ((a.sale_qty_90d ?? 0) - (b.sale_qty_90d ?? 0));
        case "last_purchase_date": return dir * String(a.last_purchase_date ?? "").localeCompare(String(b.last_purchase_date ?? ""));
        case "last_purchase_qty":  return dir * ((a.last_purchase_qty ?? 0) - (b.last_purchase_qty ?? 0));
        case "stock_value":        return dir * ((a.current_stock * a.purchase_price) - (b.current_stock * b.purchase_price));
        default:                   return 0;
      }
    });
  }, [returnList, returnSupplierSearch, returnCategoryFilter, vendorCategoryMap, returnSortKey, returnSortDir]);

  // 전체 선택 · 필터 후 rows 기준
  const visibleCodes = useMemo(() => filteredSortedRows.map(x => x.product_code), [filteredSortedRows]);
  const allChecked = visibleCodes.length > 0 && visibleCodes.every(c => returnSelected.has(c));
  const someChecked = visibleCodes.some(c => returnSelected.has(c)) && !allChecked;
  const toggleAllReturn = () => setReturnSelected(prev => {
    if (allChecked) {
      // 전부 선택된 상태 → 화면에 보이는 것만 해제
      const n = new Set(prev);
      visibleCodes.forEach(c => n.delete(c));
      return n;
    }
    // 하나라도 미선택 → 화면에 보이는 것 전부 추가
    const n = new Set(prev);
    visibleCodes.forEach(c => n.add(c));
    return n;
  });

  // 필터/데이터 바뀔 때 · 사라진 code 는 선택에서 제거 (stale 방지)
  useEffect(() => {
    setReturnSelected(prev => {
      if (prev.size === 0) return prev;
      const codes = new Set(returnList.map(x => x.product_code));
      let changed = false;
      const n = new Set<string>();
      prev.forEach(c => { if (codes.has(c)) n.add(c); else changed = true; });
      return changed ? n : prev;
    });
  }, [returnList]);

  // 일괄 반품 버튼 · 선택된 상품들을 모달로 전달
  const openBulkReturnModal = () => {
    if (returnSelected.size === 0) return;
    const selectedItems = returnList
      .filter(x => returnSelected.has(x.product_code))
      .map(x => ({
        ...x,
        vendorCategory: x.supplier ? (vendorCategoryMap[x.supplier.trim()] ?? null) : null,
      }));
    if (selectedItems.length === 0) return;
    setReturnRequestItems(selectedItems);
    // 대표 아이템 (모달의 item props 는 여전히 필수 · 첫번째 사용)
    setReturnRequestItem(selectedItems[0]);
  };

  // 2026-08-26 · 사용자 지시 · 일괄 확정 · 선택된 상품 모두 즉시 done 처리
  const [bulkConfirming, setBulkConfirming] = useState(false);
  // 2026-08-27 · 감사 #1 · Promise.allSettled · 정확한 성공/실패 집계
  const bulkConfirmReturn = React.useCallback(async () => {
    if (returnSelected.size === 0 || bulkConfirming) return;
    const selectedItems = returnList.filter(x => returnSelected.has(x.product_code));
    if (selectedItems.length === 0) return;
    const ok = await confirm({
      title: "반품확정 일괄 처리",
      message: `${selectedItems.length}개 상품을 반품확정 처리합니다.\n진행하시겠습니까?`,
    });
    if (!ok) return;
    setBulkConfirming(true);
    const results = await Promise.allSettled(selectedItems.map(row => confirmReturnRaw(row)));
    setBulkConfirming(false);
    const successCount = results.filter(r => r.status === "fulfilled").length;
    const failures = results
      .map((r, i) => ({ r, item: selectedItems[i] }))
      .filter(x => x.r.status === "rejected") as { r: PromiseRejectedResult; item: any }[];
    if (failures.length === 0) {
      showSuccess(`${successCount}개 반품확정 완료`);
    } else {
      // 실패 상세 로그 + 사용자 알림 (성공/실패 정확 집계)
      failures.forEach(f => console.error("[일괄확정] 실패:", f.item.product_code, f.r.reason?.message ?? f.r.reason));
      const sampleErr = failures[0]?.r.reason?.message ?? "네트워크 오류";
      showError(`성공 ${successCount}건 · 실패 ${failures.length}건 (예: ${sampleErr})`);
    }
  }, [returnSelected, returnList, confirmReturnRaw, bulkConfirming, showSuccess, showError, confirm]);

  // ── 컬럼 리사이저 (메인 반품필요 리스트 테이블) ─────────────────────────
  // 2026-08-06 · v3 · 현재고·실재고 제거 · 판매 3컬럼 통합 · localStorage 캐시 무효화
  const { getWidth, resizerProps: colResizerProps } = useColumnResize("returnList_v4", {
    num:          { default: 28,  min: 24, max: 60  },
    name:         { default: 300, min: 160, max: 480 },
    supplier:     { default: 120, min: 70, max: 240 },
    stock_value:  { default: 100, min: 60, max: 180 },
    purchase_cycle:{ default: 120, min: 80, max: 220 },
    sales_qty:    { default: 140, min: 90, max: 240 },
    action:       { default: 130, min: 110, max: 180 },
  });

  // ── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · ReturnFilterBar */}
      <ReturnFilterBar
        returnList={returnList}
        returnSupplierSearch={returnSupplierSearch}
        setReturnSupplierSearch={setReturnSupplierSearch}
        returnCategoryFilter={returnCategoryFilter}
        setReturnCategoryFilter={setReturnCategoryFilter}
        vendorCategoryMap={vendorCategoryMap}
        dbVendorCategories={dbVendorCategories}
        returnCycleMin={returnCycleMin}
        setReturnCycleMin={setReturnCycleMin}
        returnSalesMax={returnSalesMax}
        setReturnSalesMax={setReturnSalesMax}
        returnSalesQuarterMax={returnSalesQuarterMax}
        setReturnSalesQuarterMax={setReturnSalesQuarterMax}
        returnSelectedSize={returnSelected.size}
        onOpenBulkReturnModal={openBulkReturnModal}
        onBulkConfirm={bulkConfirmReturn}
        bulkConfirming={bulkConfirming}
      />

      {/* ── 좌우 split 레이아웃 · 2026-08-17 · items-stretch · 좌우 높이 매칭 ── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:min-h-[720px] gap-0">

        {/* 좌측: 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? returnPanelWidth : undefined }}
        >
          <section className={`${CARD_BASE} overflow-hidden flex flex-col min-h-0`}>
            {/* 로딩 / 빈 상태 */}
            {returnLoading && returnList.length === 0 ? (
              <div className="flex items-center justify-center py-12"><Spinner tone="zinc" label="불러오는 중..." labelSize={12} /></div>
            ) : returnList.length === 0 ? (
              <div className="py-12 text-center text-[15px] text-zinc-300">
                조건에 맞는 반품필요 상품 없음
              </div>
            ) : (
              <div className={`overflow-auto flex-1 min-h-0 ${returnLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
                  {/* 2026-08-24 · v3 확산 · 카테고리 그룹 헤더 제거 · 서브헤더만 · Attio 톤 */}
                  <thead className="sticky top-0 bg-zinc-100/70 z-10 border-b border-line">
                    <tr className="text-[13px] sm:text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
                      {/* 2026-08-25 · 사용자 지시 · # 컬럼 → 체크박스 (전체 선택) */}
                      <th className="relative text-center px-0.5 py-1.5 bg-zinc-50/60"
                        style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked; }}
                          onChange={toggleAllReturn}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                          title={allChecked ? "전체 선택 해제" : "화면 표시 항목 전체 선택"}
                        />
                        <span {...colResizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                      {isReturnGroupCollapsed("info") ? (
                        <th className="bg-sky-50/20 w-4"></th>
                      ) : (
                        <>
                          <th onClick={() => handleReturnSort("product_name")} title="상품명 정렬"
                            className="relative text-left px-1 py-1.5 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30"
                            style={{ width: getWidth("name"), minWidth: getWidth("name") }}>
                            상품{retArrow("product_name")}
                            <span {...colResizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                          </th>
                          <th onClick={() => handleReturnSort("supplier")} title="공급사 정렬"
                            className="relative text-left px-0.5 py-1.5 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30"
                            style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}>
                            공급사{retArrow("supplier")}
                            <span {...colResizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                          </th>
                        </>
                      )}
                      {/* 재고 서브 · 재고금액만 (2026-08-06 · 현재고·실재고 제거) */}
                      {isReturnGroupCollapsed("stock") ? (
                        <th className="bg-amber-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("stock_value")} title="재고금액 정렬"
                          className="relative text-right px-1 py-1.5 bg-amber-50/40 text-indigo-700 cursor-pointer hover:bg-amber-100 select-none"
                          style={{ width: getWidth("stock_value"), minWidth: getWidth("stock_value") }}>
                          재고금액{retArrow("stock_value")}
                          <span {...colResizerProps("stock_value")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      {isReturnGroupCollapsed("purchase") ? (
                        <th className="bg-emerald-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("purchase_cycle")} title="매입주기 정렬"
                          className="relative text-right px-1 py-1.5 bg-emerald-50/40 text-emerald-700 cursor-pointer hover:bg-emerald-100 select-none"
                          style={{ width: getWidth("purchase_cycle"), minWidth: getWidth("purchase_cycle") }}>
                          <span className="flex flex-col items-end leading-none gap-0.5">
                            <span>매입주기{retArrow("purchase_cycle")}</span>
                            <span className="text-[15px] text-zinc-400 font-normal">최근매입일·량</span>
                          </span>
                          <span {...colResizerProps("purchase_cycle")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      {/* 판매 서브 · 1/2/3 달 판매량 통합 · 클릭 시 1달 기준 정렬 (2026-08-06) */}
                      {isReturnGroupCollapsed("sales") ? (
                        <th className="bg-rose-50/20 w-4"></th>
                      ) : (
                        <th onClick={() => handleReturnSort("sale_qty_month")} title="1달 / 2달 / 3달 판매량 · 클릭 시 1달 기준 정렬"
                          className="relative text-right px-1 py-1.5 bg-rose-50/40 text-rose-600 cursor-pointer hover:bg-rose-100 select-none tabular-nums"
                          style={{ width: getWidth("sales_qty"), minWidth: getWidth("sales_qty") }}>
                          1/2/3달{retArrow("sale_qty_month")}
                          <span {...colResizerProps("sales_qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                        </th>
                      )}
                      <th className="relative text-center px-0.5 py-1.5 bg-zinc-50/60 text-zinc-500 cursor-default select-none"
                        style={{ width: getWidth("action"), minWidth: getWidth("action") }}>
                        반품
                        <span {...colResizerProps("action")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {/* 2026-08-25 · 사용자 지시 · 인라인 filter+sort 제거 · useMemo filteredSortedRows 사용 · 공급사/상품 통합 검색 지원 */}
                    {filteredSortedRows.map((x, i) => {
                      const isSelected = returnSelectedProduct?.code === x.product_code;
                      const isChecked = returnSelected.has(x.product_code);
                      const toggleOne = () => setReturnSelected(prev => {
                        const n = new Set(prev);
                        if (n.has(x.product_code)) n.delete(x.product_code);
                        else n.add(x.product_code);
                        return n;
                      });
                      return (
                        <tr
                          key={x.product_code}
                          className={`transition cursor-pointer ${isSelected ? "bg-rose-50/60 ring-1 ring-inset ring-rose-200" : isChecked ? "bg-rose-50/30" : "hover:bg-orange-50/30"}`}
                          onClick={() => { setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                        >
                          {/* 2026-08-25 · 사용자 지시 · # → 체크박스 · 반품요청 대상 선택 */}
                          <td className="px-0.5 py-1.5 text-center bg-zinc-50/60 align-top">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={toggleOne}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                              title={`${x.product_name} · 반품요청 대상 ${isChecked ? "해제" : "선택"}`}
                            />
                            <div className="text-[11px] text-zinc-300 tabular-nums mt-0.5">{i + 1}</div>
                          </td>
                          {isReturnGroupCollapsed("info") ? (
                            <td className="bg-sky-50/10 w-4"></td>
                          ) : (
                            <>
                              <td className="px-1 py-1.5 align-top bg-sky-50/20">
                                <div className="flex flex-col leading-tight">
                                  <button
                                    type="button"
                                    className="text-[14px] font-semibold text-zinc-900 hover:underline text-left break-words whitespace-normal cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("info"); }}
                                    title="상품정보 보기"
                                  >{x.product_name}</button>
                                  <span className="text-[14px] text-zinc-400 tabular-nums">{x.product_code}</span>
                                </div>
                              </td>
                              <td className="px-0.5 py-1.5 align-top bg-sky-50/10">
                                <div className="flex flex-col leading-tight">
                                  {x.supplier && <VendorCategoryBadge category={vendorCategoryMap[x.supplier.trim()] ?? null} />}
                                  {onSupplierClick && x.supplier ? (
                                    <button
                                      type="button"
                                      className="text-[14px] font-normal text-sky-700 hover:underline text-left whitespace-nowrap cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); onSupplierClick(x.supplier!); }}
                                      title={`공급사 정보 조회·수정 (${x.supplier})`}
                                    >{displayVendorName(x.supplier)}</button>
                                  ) : (
                                    <span className="text-[14px] font-normal text-sky-700 whitespace-nowrap">{x.supplier ? displayVendorName(x.supplier) : "-"}</span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                          {/* 재고 그룹 · 재고금액만 (2026-08-06 · 현재고·실재고 제거) */}
                          {isReturnGroupCollapsed("stock") ? (
                            <td className="bg-amber-50/20 w-4"></td>
                          ) : (
                            <td className="text-right px-1 py-1.5 tabular-nums font-normal text-[14px] text-indigo-700 bg-amber-50/20 align-top">
                              {x.current_stock > 0 && x.purchase_price > 0 ? `${(x.current_stock * x.purchase_price).toLocaleString()}` : "-"}
                            </td>
                          )}
                          {isReturnGroupCollapsed("purchase") ? (
                            <td className="bg-emerald-50/20 w-4"></td>
                          ) : (
                            <td
                              className="text-right px-1 py-1.5 tabular-nums bg-emerald-50/30 align-top cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("purchase"); }}
                              title="매입이력 보기"
                            >
                              <span className="font-normal text-[14px] text-emerald-700 hover:underline tabular-nums">
                                {x.purchase_cycle != null ? `${x.purchase_cycle}일` : "-"}
                              </span>
                              {/* 2026-08-06 · 최근 매입일 · M/D 짧은 포맷 · 최근 매입량 함께 */}
                              <span className="block text-[14px] text-zinc-500 leading-snug mt-0.5 font-normal tabular-nums">
                                {x.last_purchase_date ? (() => {
                                  const [_, m, d] = x.last_purchase_date.split("-");
                                  return `${Number(m)}/${Number(d)}`;
                                })() : "-"}
                                {x.last_purchase_qty != null && (
                                  <> · <span>{x.last_purchase_qty}개</span></>
                                )}
                              </span>
                            </td>
                          )}
                          {/* 판매 그룹 · 1/2/3 달 판매량 · 통합 셀 (2026-08-06) */}
                          {isReturnGroupCollapsed("sales") ? (
                            <td className="bg-rose-50/20 w-4"></td>
                          ) : (
                            <td
                              className="text-right px-1 py-1.5 tabular-nums bg-rose-50/20 align-top cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setReturnSelectedProduct({ code: x.product_code, name: x.product_name }); setReturnDetailTab("sales"); }}
                              title="1달 / 2달 / 3달 판매량"
                            >
                              <span className="font-normal text-[14px] text-rose-700 hover:underline tabular-nums">
                                {x.sale_qty_month != null ? x.sale_qty_month.toLocaleString() : "-"}
                                <span className="text-zinc-300"> / </span>
                                {x.sale_qty_60d != null ? x.sale_qty_60d.toLocaleString() : "-"}
                                <span className="text-zinc-300"> / </span>
                                {x.sale_qty_90d != null ? x.sale_qty_90d.toLocaleString() : "-"}
                              </span>
                            </td>
                          )}
                          <td className="text-center px-1 py-1.5 align-top bg-zinc-50/30">
                            {/* 2026-08-25 · 사용자 지시 · 반품 (요청) + 반품확정 (즉시 done) · 2버튼 */}
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setReturnRequestItem({ ...x, vendorCategory: x.supplier ? (vendorCategoryMap[x.supplier.trim()] ?? null) : null }); }}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[14px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
                                title="반품요청 (모달 열기)"
                              >
                                <Truck size={11} strokeWidth={2} />반품
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); confirmReturn(x); }}
                                disabled={confirmingCode === x.product_code}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[14px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 transition-colors cursor-pointer active:scale-95 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                                title="바로 반품확정 (모달 없이 · done 상태 저장)"
                              >
                                {confirmingCode === x.product_code
                                  ? <Spinner size={11} tone="white" />
                                  : <CheckCircle2 size={11} strokeWidth={2} />}
                                확정
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {returnList.length === 0 && (
                      <tr><td colSpan={11} className="text-center text-[15px] text-zinc-300 py-6">검색 결과 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onReturnResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-rose-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 패널 · 탭 전환 */}
        {returnPanelLoading ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState title="불러오는 중..." size="normal" />
            </div>
          </div>
        ) : returnPanelError ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <Card padding="md" rounded="xl" className="text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[15px] font-mono">{returnPanelError}</div>
            </Card>
          </div>
        ) : returnPanelFull ? (
          /* 2026-08-24 · 사용자 지시 · 외부 3탭 (상품정보/매입이력/판매정보) 제거 ·
             모두 같은 ProductDetailRightPanel 렌더 · 실제 라우팅 안 됨 · 탭메뉴와 내용 안 맞음
             ProductDetailRightPanel 내부 자체 5탭 (기간별상품흐름·매입이력·발주내역·재고관리·상품정보) 사용 */
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto">
            <ProductDetailRightPanel
              selected={({
                code: (returnPanelFull as any).product_code ?? (returnPanelFull as any).code ?? (returnSelectedProduct?.code ?? ""),
                name: (returnPanelFull as any).product_name ?? (returnPanelFull as any).name ?? (returnSelectedProduct?.name ?? ""),
                spec: (returnPanelFull as any).spec ?? "",
                ...returnPanelFull,
                realMap: (returnPanelFull as any).realMap ?? (returnPanelFull as any).real_map ?? null,
              } as ProductInfoType)}
              onClose={() => { setReturnSelectedProduct(null); setReturnPanelFull(null); }}
              onProductUpdate={(u) => setReturnPanelFull(prev => prev ? { ...prev, ...u } : prev)}
              onRealMapUpdate={(v) => setReturnPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
              showChart
              context="order-manage"
              editable={true}
              emptySub="상세 정보가 표시됩니다"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Package} title="상품을 클릭하세요" hint="상품명 → 상품정보 · 매입주기 → 매입이력 · 판매량 → 판매정보" />
            </div>
          </div>
        )}
      </div>

      {/* 반품 요청서 모달 · 2026-08-03 · 발주서 스타일 재설계 */}
      {/* 2026-08-25 · 사용자 지시 · 다중 선택 시 · items 배열도 함께 전달 · 모달에서 전체 라인 렌더 */}
      {returnRequestItem && (() => {
        const supKey = String(returnRequestItem.supplier ?? "").trim();
        const vendor = supKey ? vendorMap[supKey] : undefined;
        const supplierInfo = vendor
          ? { contact_name: vendor.contact_name, phone: vendor.phone, email: vendor.email, category: vendor.category }
          : { contact_name: null, phone: null, email: null, category: returnRequestItem.vendorCategory ?? null };
        return (
          <ReturnRequestModal
            item={returnRequestItem}
            items={returnRequestItems ?? undefined}
            supplierInfo={supplierInfo}
            onClose={() => { setReturnRequestItem(null); setReturnRequestItems(null); }}
          />
        );
      })()}
    </div>
    </>
  );
};

export default ReturnListPanel;
