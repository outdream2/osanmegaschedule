// src/components/SeasonSettingsPage/ProductSearchMultiAddModal.tsx
// 2026-09-24 · #353 · 계절별 추천 상품 · 다중 선택 상품 추가 모달
//   · 상품 검색 (debounce 250ms · /api/products-search)
//   · 체크박스 다중 선택 · 이미 매핑된 상품 비활성화
//   · 확인 → POST /api/events/{eventId}/products · onAdded 콜백
//   · 판매중지·숨김 상품 dim 처리 (sale_status !== "판매중")
//   · 프레임워크 준수 · Modal · Spinner · KO_INPUT_PROPS

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Package, Search, X } from "lucide-react";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { useToast } from "../../hooks/useToast";
import { KO_SEARCH_PROPS } from "../../lib/koreanInput";
import { TIMING } from "../../constants/timing";

// ── 타입 ─────────────────────────────────────────────
interface SearchProduct {
  product_code: string;
  product_name: string;
  supplier?: string | null;
  category?: string | null;
  sale_status?: string | null;
  hidden?: boolean | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
}

export interface ProductSearchMultiAddModalProps {
  open: boolean;
  onClose: () => void;
  /** 추가 대상 이벤트 ID */
  eventId: number;
  /** 모달 제목에 표시 · "{eventName} · 상품 추가" */
  eventName: string;
  /** 추가 완료 콜백 · 실제 추가된 코드 목록 전달 */
  onAdded: (codes: string[]) => void;
  /** 이미 매핑된 상품 코드 세트 · 비활성화 표시 */
  alreadyMappedCodes?: Set<string>;
}

// ── 상품 행 상태 분류 ─────────────────────────────────
function isInactive(p: SearchProduct): boolean {
  return p.hidden === true || (p.sale_status != null && p.sale_status !== "판매중");
}

// ── 컴포넌트 ─────────────────────────────────────────
export const ProductSearchMultiAddModal: React.FC<ProductSearchMultiAddModalProps> = ({
  open,
  onClose,
  eventId,
  eventName,
  onAdded,
  alreadyMappedCodes = new Set(),
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { showSuccess, showError } = useToast();

  // 모달 열릴 때 · 상태 초기화
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearching(false);
      setSelected(new Set());
      setAdding(false);
      // 약간의 delay 후 포커스 (Modal 애니메이션 이후)
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 검색 debounce (250ms)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<SearchProduct[]>(
          `/api/products-search?q=${encodeURIComponent(q)}`
        );
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, TIMING.DEBOUNCE_SEARCH);
    return () => clearTimeout(t);
  }, [query]);

  // 체크박스 토글
  const toggle = useCallback((code: string, inactive: boolean, mapped: boolean) => {
    if (inactive || mapped) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  // 전체 선택 · 활성+미매핑 대상만
  const selectableResults = useMemo(
    () => results.filter(p => !isInactive(p) && !alreadyMappedCodes.has(p.product_code)),
    [results, alreadyMappedCodes],
  );

  const allSelected = selectableResults.length > 0 && selectableResults.every(p => selected.has(p.product_code));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        selectableResults.forEach(p => next.delete(p.product_code));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        selectableResults.forEach(p => next.add(p.product_code));
        return next;
      });
    }
  }, [allSelected, selectableResults]);

  // 확인 · POST
  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) return;
    const codes = Array.from(selected);
    setAdding(true);
    try {
      await api.post(`/api/events/${eventId}/products`, { product_codes: codes });
      showSuccess(`${codes.length}개 추가 완료`);
      onAdded(codes);
      onClose();
    } catch (e) {
      showError(`추가 실패: ${getErrorMessage(e)}`);
    } finally {
      setAdding(false);
    }
  }, [selected, eventId, onAdded, onClose, showSuccess, showError]);

  const selectedCount = selected.size;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${eventName} · 상품 추가`}
      icon={<Package size={16} />}
      titleAccent
      size="lg-narrow"
      bodyPadding="none"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            className="h-9 px-4 text-[13px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 cursor-pointer transition disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedCount === 0 || adding}
            className="inline-flex items-center gap-1.5 h-9 px-5 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 text-white rounded-lg shadow-sm cursor-pointer transition"
          >
            {adding ? (
              <Spinner size={12} tone="white" />
            ) : (
              <Check size={12} strokeWidth={2.5} />
            )}
            {selectedCount > 0 ? `${selectedCount}건 추가` : "추가"}
          </button>
        </>
      }
    >
      {/* 검색바 */}
      <div className="px-4 pt-4 pb-3 border-b border-line shrink-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            {...KO_SEARCH_PROPS}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="상품명 · 코드 · 공급사 검색"
            className="w-full h-10 pl-9 pr-8 text-[14px] border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition placeholder:text-zinc-300"
          />
          {query && !searching && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              title="지우기"
            >
              <X size={11} />
            </button>
          )}
          {searching && (
            <Spinner
              size={12}
              tone="zinc"
              className="absolute right-3 top-1/2 -translate-y-1/2"
            />
          )}
        </div>

        {/* 선택 현황 + 전체선택 */}
        {results.length > 0 && (
          <div className="flex items-center justify-between mt-2.5 px-0.5">
            <span className="text-[12px] text-zinc-500">
              {selectedCount > 0 ? (
                <span className="font-bold text-brand-deep tabular-nums">{selectedCount}건 선택됨</span>
              ) : (
                <span className="tabular-nums">{results.length}건 결과</span>
              )}
            </span>
            {selectableResults.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-[12px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition"
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 결과 리스트 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
            <Search size={24} strokeWidth={1.5} className="text-zinc-300" />
            <span className="text-[13px]">상품명·코드·공급사를 입력해 검색하세요</span>
          </div>
        ) : searching && results.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Spinner tone="zinc" label="검색 중..." labelSize={13} />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
            <Package size={24} strokeWidth={1.5} className="text-zinc-300" />
            <span className="text-[13px]">검색 결과 없음</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {results.map(p => {
              const code = p.product_code;
              const mapped = alreadyMappedCodes.has(code);
              const inactive = isInactive(p);
              const disabled = mapped || inactive;
              const checked = selected.has(code);

              return (
                <ProductRow
                  key={code}
                  product={p}
                  checked={checked}
                  mapped={mapped}
                  inactive={inactive}
                  disabled={disabled}
                  onToggle={() => toggle(code, inactive, mapped)}
                />
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ── 상품 행 ──────────────────────────────────────────
interface ProductRowProps {
  product: SearchProduct;
  checked: boolean;
  mapped: boolean;
  inactive: boolean;
  disabled: boolean;
  onToggle: () => void;
}

const ProductRow: React.FC<ProductRowProps> = ({
  product, checked, mapped, inactive, disabled, onToggle,
}) => {
  const rowCls = [
    "flex items-start gap-3 px-4 py-2.5 transition-colors",
    disabled
      ? "opacity-40 cursor-not-allowed bg-zinc-50/50"
      : checked
        ? "bg-brand-tint/30 cursor-pointer hover:bg-brand-tint/50"
        : "cursor-pointer hover:bg-zinc-50",
  ].join(" ");

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={e => {
        if (!disabled && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={rowCls}
    >
      {/* 체크박스 */}
      <div className="shrink-0 mt-0.5">
        <div
          className={[
            "w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center transition-colors",
            disabled
              ? "border-zinc-300 bg-zinc-100"
              : checked
                ? "border-brand-deep bg-brand-deep"
                : "border-zinc-300 bg-white",
          ].join(" ")}
        >
          {checked && !disabled && (
            <Check size={11} strokeWidth={3} className="text-white" />
          )}
        </div>
      </div>

      {/* 상품 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-[14px] font-semibold text-zinc-900 break-words whitespace-normal leading-snug">
            {product.product_name}
          </span>
          {mapped && (
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">
              매핑됨
            </span>
          )}
          {inactive && !mapped && (
            <span className="inline-flex items-center text-[11px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5 shrink-0">
              {product.hidden ? "숨김" : product.sale_status ?? "비활성"}
            </span>
          )}
        </div>
        <div className="text-[12px] text-zinc-400 tabular-nums mt-0.5 break-words whitespace-normal">
          {product.product_code}
          {product.supplier && (
            <span className="ml-1.5 text-zinc-500">· {product.supplier}</span>
          )}
          {product.category && (
            <span className="ml-1.5 text-zinc-400">· {product.category}</span>
          )}
        </div>
      </div>

      {/* 재고 수치 */}
      {(product.current_stock != null || product.optimal_stock != null) && (
        <div className="shrink-0 text-right text-[12px] tabular-nums mt-0.5">
          <div className="font-bold text-zinc-700">{product.current_stock ?? "-"}</div>
          <div className="text-zinc-400">{product.optimal_stock != null ? `/ ${product.optimal_stock}` : ""}</div>
        </div>
      )}
    </div>
  );
};

export default ProductSearchMultiAddModal;
