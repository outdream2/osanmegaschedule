// src/components/SeasonSettingsPage/EventProductPanel.tsx
// 2026-09-18 · 이벤트 매핑 상품 관리 우측 패널
//   · 좌측 이벤트 선택 시 · 우측에서 매핑 상품 CRUD
//   · ProductSearchInput 로 추가 · 클릭 즉시 매핑
//   · 삭제 · 즉시 API · optimistic
//   · Phase 2 · 다른 이벤트에서 복사 · 붙여넣기 임포트 · 분류 일괄 추가

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, Trash2, Search, Copy, ClipboardPaste, Tags, RefreshCw, Check, AlertCircle, X, Sparkle,
} from "lucide-react";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { Modal } from "../common/Modal";
import { ProductSearchInput } from "../common/features/ProductSearchInput";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useSortableTable } from "../../hooks/useSortableTable";
import { matchesProductQuery } from "../../lib/productMatch";
import { displayVendorName } from "../../utils/vendorNameNormalize";

export interface EventLite {
  id: number;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  recurring: boolean;
}

interface MappedProduct {
  product_code: string;
  product_name: string;
  category: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  supplier: string | null;
  sale_status: string | null;
  purchase_price: number | null;
  sale_price: number | null;
}

interface EventProductPanelProps {
  event: EventLite | null;
  /** 이벤트 목록 (다른 이벤트에서 복사용) */
  events: EventLite[];
  /** 상품 매핑 개수 변경 시 · 부모의 이벤트 카드 배지 갱신 콜백 */
  onCountChange?: (eventId: number, count: number) => void;
  /** 모바일 모달 닫기 (모바일 SplitPanel 에서만) */
  onCloseMobile?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  spring: "봄", summer: "여름", fall: "가을", winter: "겨울",
  holiday: "명절", school: "수험생", custom: "이벤트",
};

const TYPE_PILL: Record<string, "sky" | "amber" | "rose" | "emerald" | "violet" | "indigo" | "brand"> = {
  spring: "brand", summer: "sky", fall: "amber", winter: "indigo",
  holiday: "rose", school: "emerald", custom: "violet",
};

type SortKey = "name" | "supplier" | "current" | "optimal";

export const EventProductPanel: React.FC<EventProductPanelProps> = ({
  event,
  events,
  onCountChange,
  onCloseMobile,
}) => {
  const [products, setProducts] = useState<MappedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (!event) { setProducts([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get<{ products?: MappedProduct[] }>(`/api/events/${event.id}/products`);
      const rows = Array.isArray(data?.products) ? data.products : [];
      setProducts(rows);
      onCountChange?.(event.id, rows.length);
    } catch (e) {
      showError(`매핑 상품 로드 실패: ${getErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [event, onCountChange, showError]);

  useEffect(() => { void load(); }, [load]);

  // 매핑 추가 (single or bulk)
  const addProducts = useCallback(async (codes: string[]) => {
    if (!event || codes.length === 0) return { added: 0, duplicated: 0 };
    const existing = new Set(products.map(p => p.product_code));
    const unique = Array.from(new Set(codes.filter(Boolean)));
    const newOnes = unique.filter(c => !existing.has(c));
    const duplicated = unique.length - newOnes.length;
    if (newOnes.length === 0) return { added: 0, duplicated };
    try {
      await api.post(`/api/events/${event.id}/products`, { product_codes: newOnes });
      await load();
      return { added: newOnes.length, duplicated };
    } catch (e) {
      showError(`매핑 실패: ${getErrorMessage(e)}`);
      return { added: 0, duplicated };
    }
  }, [event, products, load, showError]);

  const handleAddOne = useCallback(async (code: string, product: any) => {
    if (!event) return;
    if (products.some(p => p.product_code === code)) {
      showError(`이미 매핑된 상품: ${product?.product_name ?? code}`);
      return;
    }
    const { added } = await addProducts([code]);
    if (added > 0) showSuccess(`매핑 완료: ${product?.product_name ?? code}`);
  }, [event, products, addProducts, showSuccess, showError]);

  const handleRemove = useCallback(async (p: MappedProduct) => {
    if (!event) return;
    const ok = await confirm({
      message: `"${p.product_name}" 매핑을 제거할까요?`,
      danger: true,
    });
    if (!ok) return;
    setRemovingCode(p.product_code);
    // optimistic
    const prev = products;
    const next = products.filter(x => x.product_code !== p.product_code);
    setProducts(next);
    onCountChange?.(event.id, next.length);
    try {
      await api.del(`/api/events/${event.id}/products/${encodeURIComponent(p.product_code)}`);
      showSuccess("매핑 제거 완료");
    } catch (e) {
      // rollback
      setProducts(prev);
      onCountChange?.(event.id, prev.length);
      showError(`제거 실패: ${getErrorMessage(e)}`);
    } finally {
      setRemovingCode(null);
    }
  }, [event, products, onCountChange, confirm, showSuccess, showError]);

  // 정렬 (comparators · useMemo 로 안정된 참조)
  const comparators = useMemo(() => ({
    name:     (a: MappedProduct, b: MappedProduct) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ko"),
    supplier: (a: MappedProduct, b: MappedProduct) => (displayVendorName(a.supplier) ?? "").localeCompare(displayVendorName(b.supplier) ?? "", "ko"),
    current:  (a: MappedProduct, b: MappedProduct) => (a.current_stock ?? 0) - (b.current_stock ?? 0),
    optimal:  (a: MappedProduct, b: MappedProduct) => (a.optimal_stock ?? 0) - (b.optimal_stock ?? 0),
  }), []);

  const filtered = useMemo(
    () => products.filter(p => matchesProductQuery(p, filter)),
    [products, filter],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<MappedProduct, SortKey>(
    filtered, "name", comparators, "asc",
  );

  // ── 이벤트 미선택 시 empty ─────────────────────────
  if (!event) {
    return (
      <div className="h-full flex items-center justify-center px-6 py-10">
        <EmptyState
          icon={Sparkle}
          title="이벤트를 선택하세요"
          hint="좌측 목록에서 이벤트를 클릭하면 · 매핑 상품을 관리할 수 있어요"
          size="normal"
        />
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[event.type] ?? event.type;
  const pillTone = TYPE_PILL[event.type] ?? "violet";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <div className="shrink-0 px-4 py-3 border-b border-line bg-zinc-50/40">
        <div className="flex items-start gap-2 flex-wrap">
          <StatusPill tone={pillTone} size="sm">{typeLabel}</StatusPill>
          <span className="text-[15px] font-extrabold text-zinc-900 break-words whitespace-normal leading-tight">
            {event.name}
          </span>
          {event.recurring && <StatusPill tone="emerald" size="sm">매년</StatusPill>}
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-zinc-600 tabular-nums">
            <Package size={12} className="text-zinc-400" />
            {products.length}개 매핑
          </span>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-white transition cursor-pointer lg:hidden"
              title="닫기"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {(event.start_date || event.end_date) && (
          <div className="mt-1.5 text-[12px] text-zinc-600 tabular-nums">
            {event.start_date ?? "?"}
            {event.end_date && event.end_date !== event.start_date && ` ~ ${event.end_date}`}
          </div>
        )}
      </div>

      {/* 액션 영역 · 상품 검색 · 기타 액션 */}
      <div className="shrink-0 px-4 py-3 border-b border-line flex flex-col gap-2">
        <ProductSearchInput
          onSelect={handleAddOne}
          placeholder="상품 검색 → 클릭 시 즉시 매핑"
          accent="indigo"
          recentScope={`eventProducts.${event.id}`}
        />
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setShowCopyModal(true)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold bg-white border border-zinc-200 hover:border-brand-deep hover:bg-brand-tint/40 text-zinc-700 cursor-pointer transition"
            title="다른 이벤트 상품을 복사"
          >
            <Copy size={11} />
            다른 이벤트 복사
          </button>
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold bg-white border border-zinc-200 hover:border-brand-deep hover:bg-brand-tint/40 text-zinc-700 cursor-pointer transition"
            title="분류(카테고리) 기반 일괄 매핑"
          >
            <Tags size={11} />
            분류 일괄 추가
          </button>
          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold bg-white border border-zinc-200 hover:border-brand-deep hover:bg-brand-tint/40 text-zinc-700 cursor-pointer transition"
            title="상품코드 붙여넣기 · 일괄 임포트"
          >
            <ClipboardPaste size={11} />
            붙여넣기 임포트
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 리스트 헤더 · 필터 */}
      {products.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-line flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              lang="ko"
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="매핑 상품 내 검색 (상품명·공급사·코드)"
              className="w-full h-8 pl-7 pr-2 text-[13px] border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition placeholder:text-zinc-300"
            />
          </div>
          <span className="text-[12px] font-bold text-zinc-500 tabular-nums shrink-0">
            {sorted.length}/{products.length}
          </span>
        </div>
      )}

      {/* 정렬 헤더 (테이블 헤더) */}
      {products.length > 0 && (
        <div className="shrink-0 grid grid-cols-[1fr_120px_60px_60px_36px] gap-2 px-4 py-2 border-b border-line bg-zinc-50/50 text-[11px] font-bold text-zinc-500 uppercase tracking-wide">
          <SortHead label="상품명" k="name" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead label="공급사" k="supplier" active={sortKey} dir={sortDir} onClick={toggleSort} />
          <SortHead label="현재고" k="current" active={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
          <SortHead label="적정" k="optimal" active={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
          <span></span>
        </div>
      )}

      {/* 매핑 상품 리스트 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && products.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Spinner tone="zinc" label="로딩 중..." labelSize={13} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="매핑된 상품 없음"
            hint="상단에서 상품을 검색·추가하거나 · 다른 이벤트에서 복사할 수 있어요"
            size="compact"
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Search}
            title="검색 결과 없음"
            hint={`"${filter}" 에 해당하는 매핑 상품이 없어요`}
            size="compact"
          />
        ) : (
          <div className="divide-y divide-zinc-100">
            {sorted.map(p => {
              const vendor = displayVendorName(p.supplier) || "-";
              const isRemoving = removingCode === p.product_code;
              const stockShort = p.optimal_stock != null && p.current_stock != null && p.current_stock < p.optimal_stock;
              return (
                <div
                  key={p.product_code}
                  className="grid grid-cols-[1fr_120px_60px_60px_36px] gap-2 px-4 py-2 items-center hover:bg-brand-tint/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-zinc-900 break-words whitespace-normal leading-snug">
                      {p.product_name}
                    </div>
                    <div className="text-[11px] text-zinc-400 tabular-nums break-words whitespace-normal">
                      {p.product_code}
                      {p.category && <span className="ml-1 text-zinc-500">· {p.category}</span>}
                    </div>
                  </div>
                  <div className="text-[12px] text-zinc-700 break-words whitespace-normal">
                    {vendor}
                  </div>
                  <div className={`text-[13px] font-bold tabular-nums text-right ${stockShort ? "text-rose-600" : "text-zinc-800"}`}>
                    {p.current_stock ?? "-"}
                  </div>
                  <div className="text-[13px] font-bold tabular-nums text-right text-zinc-600">
                    {p.optimal_stock ?? "-"}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(p)}
                    disabled={isRemoving}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-rose-600 hover:bg-white transition cursor-pointer disabled:opacity-40"
                    title="매핑 제거"
                  >
                    <Trash2 size={13} className={isRemoving ? "animate-pulse" : ""} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 모달들 */}
      <CopyFromEventModal
        open={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        currentEventId={event.id}
        allEvents={events}
        onCopy={async (srcId) => {
          try {
            const { data } = await api.get<{ products?: MappedProduct[] }>(`/api/events/${srcId}/products`);
            const codes = (data?.products ?? []).map(p => p.product_code);
            if (codes.length === 0) {
              showError("복사할 상품이 없습니다");
              return;
            }
            const { added, duplicated } = await addProducts(codes);
            if (added > 0) {
              showSuccess(`${added}개 매핑 완료${duplicated > 0 ? ` (중복 ${duplicated}건 스킵)` : ""}`);
              setShowCopyModal(false);
            } else if (duplicated > 0) {
              showError(`이미 모두 매핑됨 (중복 ${duplicated}건)`);
            }
          } catch (e) {
            showError(`복사 실패: ${getErrorMessage(e)}`);
          }
        }}
      />

      <PasteImportModal
        open={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onImport={async (codes) => {
          const { added, duplicated } = await addProducts(codes);
          if (added > 0) {
            showSuccess(`${added}개 매핑 완료${duplicated > 0 ? ` (중복 ${duplicated}건 스킵)` : ""}`);
            setShowPasteModal(false);
            return true;
          } else if (duplicated > 0) {
            showError(`이미 모두 매핑됨 (중복 ${duplicated}건)`);
            return false;
          }
          return false;
        }}
      />

      <CategoryBulkAddModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onAdd={async (category) => {
          try {
            const data = await api.get<any[]>(`/api/products-by-category?category=${encodeURIComponent(category)}`);
            const rows = Array.isArray(data.data) ? data.data : [];
            const codes = rows.map((r: any) => String(r.product_code ?? "").trim()).filter(Boolean);
            if (codes.length === 0) {
              showError(`분류 "${category}" 에 해당하는 상품이 없습니다`);
              return false;
            }
            const { added, duplicated } = await addProducts(codes);
            if (added > 0) {
              showSuccess(`분류 "${category}" · ${added}개 매핑 완료${duplicated > 0 ? ` (중복 ${duplicated}건 스킵)` : ""}`);
              setShowCategoryModal(false);
              return true;
            } else {
              showError(`분류 "${category}" · 이미 모두 매핑됨 (중복 ${duplicated}건)`);
              return false;
            }
          } catch (e) {
            showError(`분류 매핑 실패: ${getErrorMessage(e)}`);
            return false;
          }
        }}
      />
    </div>
  );
};

// ── 정렬 헤더 셀 ─────────────────────────────────────
function SortHead({
  label, k, active, dir, onClick, className = "",
}: {
  label: string;
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active === k;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`inline-flex items-center gap-0.5 hover:text-zinc-800 transition cursor-pointer ${isActive ? "text-brand-deep" : ""} ${className}`}
      title={`${label} 기준 정렬`}
    >
      <span>{label}</span>
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 서브 모달 · 다른 이벤트에서 상품 복사
// ═══════════════════════════════════════════════════════════
interface CopyFromEventModalProps {
  open: boolean;
  onClose: () => void;
  currentEventId: number;
  allEvents: EventLite[];
  onCopy: (srcEventId: number) => Promise<void>;
}

const CopyFromEventModal: React.FC<CopyFromEventModalProps> = ({
  open, onClose, currentEventId, allEvents, onCopy,
}) => {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  const candidates = useMemo(
    () => allEvents.filter(e => e.id !== currentEventId),
    [allEvents, currentEventId],
  );

  // 각 이벤트의 상품 개수 로드 (열릴 때 한 번)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          candidates.map(async e => {
            try {
              const { data } = await api.get<{ products?: any[] }>(`/api/events/${e.id}/products`);
              return [e.id, (data?.products ?? []).length] as const;
            } catch {
              return [e.id, 0] as const;
            }
          }),
        );
        if (cancelled) return;
        const map: Record<number, number> = {};
        for (const [id, n] of results) map[id] = n;
        setCounts(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, candidates]);

  const handleCopy = async () => {
    if (!selectedId) return;
    setCopying(true);
    try {
      await onCopy(selectedId);
    } finally {
      setCopying(false);
      setSelectedId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="다른 이벤트에서 상품 복사"
      icon={<Copy size={16} />}
      titleAccent
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-[13px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 cursor-pointer transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!selectedId || copying}
            className="inline-flex items-center gap-1.5 h-9 px-5 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 text-white rounded-lg shadow-sm cursor-pointer transition"
          >
            {copying ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
            선택 이벤트 복사
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner tone="zinc" label="이벤트 목록 로드 중..." labelSize={13} />
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="복사할 이벤트 없음"
          hint="다른 이벤트를 먼저 등록하세요"
          size="compact"
        />
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          <div className="text-[12px] text-zinc-500 mb-1">
            복사할 원본 이벤트를 선택하세요. 매핑된 상품이 이 이벤트에 추가됩니다 (중복 자동 스킵).
          </div>
          {candidates.map(e => {
            const typeLabel = TYPE_LABELS[e.type] ?? e.type;
            const cnt = counts[e.id] ?? 0;
            const isActive = selectedId === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition cursor-pointer text-left ${
                  isActive
                    ? "border-brand-deep bg-brand-tint/40"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <StatusPill tone={TYPE_PILL[e.type] ?? "violet"} size="sm">{typeLabel}</StatusPill>
                <span className="text-[14px] font-bold text-zinc-900 break-words whitespace-normal leading-tight flex-1 min-w-0">
                  {e.name}
                </span>
                {e.recurring && <StatusPill tone="emerald" size="sm">매년</StatusPill>}
                <span className="text-[12px] font-bold text-zinc-600 tabular-nums shrink-0">
                  {cnt}개
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════
// 서브 모달 · 상품코드 붙여넣기 임포트
// ═══════════════════════════════════════════════════════════
interface PasteImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (codes: string[]) => Promise<boolean>;
}

const PasteImportModal: React.FC<PasteImportModalProps> = ({ open, onClose, onImport }) => {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  const parsed = useMemo(() => {
    return text
      .split(/[\s,;\n\r\t]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }, [text]);

  const unique = useMemo(() => Array.from(new Set(parsed)), [parsed]);

  useEffect(() => { if (!open) setText(""); }, [open]);

  const handleImport = async () => {
    if (unique.length === 0) return;
    setImporting(true);
    try {
      await onImport(unique);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="상품코드 붙여넣기 임포트"
      icon={<ClipboardPaste size={16} />}
      titleAccent
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-[13px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 cursor-pointer transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={unique.length === 0 || importing}
            className="inline-flex items-center gap-1.5 h-9 px-5 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 text-white rounded-lg shadow-sm cursor-pointer transition"
          >
            {importing ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
            {unique.length > 0 ? `${unique.length}개 임포트` : "임포트"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="text-[12px] text-zinc-500">
          상품코드를 붙여넣으세요. 개행·쉼표·공백·탭 모두 구분자로 인식합니다.
          <br />
          <span className="text-zinc-400">
            (등록되지 않은 코드는 서버에서 자동 무시되지 않습니다 — DB 제약. 필요 시 사전에 유효 코드만 남기세요.)
          </span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"예:\n8801234567890\n8801234567891, 8801234567892\n8801234567893"}
          rows={10}
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-[13px] font-mono outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-y"
        />
        {unique.length > 0 && (
          <div className="text-[12px] text-zinc-600">
            파싱: <span className="font-bold text-zinc-800 tabular-nums">{unique.length}개</span>
            {parsed.length !== unique.length && (
              <span className="text-zinc-400"> (중복 {parsed.length - unique.length}건 자동 제거)</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════
// 서브 모달 · 분류(카테고리) 기반 일괄 매핑
// ═══════════════════════════════════════════════════════════
interface CategoryBulkAddModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (category: string) => Promise<boolean>;
}

const CategoryBulkAddModal: React.FC<CategoryBulkAddModalProps> = ({ open, onClose, onAdd }) => {
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (!open) setCategory(""); }, [open]);

  const handleAdd = async () => {
    const c = category.trim();
    if (!c) return;
    setAdding(true);
    try {
      await onAdd(c);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="분류 일괄 추가"
      icon={<Tags size={16} />}
      titleAccent
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-[13px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 cursor-pointer transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!category.trim() || adding}
            className="inline-flex items-center gap-1.5 h-9 px-5 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 text-white rounded-lg shadow-sm cursor-pointer transition"
          >
            {adding ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
            분류 상품 일괄 매핑
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="text-[12px] text-zinc-500">
          입력한 분류(카테고리) 이름을 부분일치 검색해 · 해당하는 상품을 최대 100개까지 일괄 매핑합니다.
          <br />
          예: <span className="text-zinc-700 font-semibold">감기</span> · <span className="text-zinc-700 font-semibold">비타민</span> · <span className="text-zinc-700 font-semibold">진통제</span>
        </div>
        <input
          lang="ko"
          type="text"
          value={category}
          onChange={e => setCategory(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && category.trim()) void handleAdd();
          }}
          placeholder="분류 이름 입력 (부분일치)"
          className="h-10 px-3 rounded-lg border border-zinc-200 bg-white text-[14px] outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
          autoFocus
        />
      </div>
    </Modal>
  );
};

export default EventProductPanel;
