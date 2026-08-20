// src/components/common/features/ProductSearchInput.tsx
// 2026-08-09 · 사용자 요청 · 상품 검색 · 리스트 · 확인 → 상품정보 등록
//
// 사용처:
//   - ScanPage (실재고 입력) · 상품명 검색 → 확인 시 실재고 리스트에 추가
//   - ProductArrivalPage (상품 입고) · 동일
//
// 동작:
//   1. 입력 → useProductInfoSearch (250ms debounce) 자동 검색
//   2. 결과 리스트 · 클릭으로 선택 (activeId 강조)
//   3. [확인] 클릭 → onSelect(product) 호출 (product_code 전달)
//   4. 입력·결과·선택 초기화
//
// 특징:
//   - onSelect(code) 만 콜백 · 이후 액션 (스캔·입고 로직) 은 호출측 담당
//   - 결과 리스트 · 최대 20건 표시 (스크롤)

import { useEffect, useRef, useState } from "react";
import { Search, Check, Package } from "lucide-react";
import { Spinner } from "../Spinner";
import { useProductInfoSearch } from "../../../hooks/useProductInfoSearch";

interface ProductSearchInputProps {
  /** 확인 시 콜백 · product_code 전달 (없으면 product_name) */
  onSelect: (codeOrName: string, product: any) => void;
  /** placeholder */
  placeholder?: string;
  /** 색상 accent (teal · sky · emerald 등) · 기본 teal */
  accent?: "teal" | "sky" | "emerald" | "amber" | "indigo";
  /** className */
  className?: string;
}

const ACCENT_MAP = {
  teal:    { ring: "focus:ring-brand-tint focus:border-brand-deep", btn: "bg-teal-600 hover:bg-teal-700", active: "bg-teal-50 border-l-2 border-teal-500" },
  sky:     { ring: "focus:ring-brand-tint focus:border-brand-deep", btn: "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a]", active: "bg-sky-50 border-l-2 border-sky-500" },
  emerald: { ring: "focus:ring-brand-tint focus:border-brand-deep", btn: "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a]", active: "bg-emerald-50 border-l-2 border-emerald-500" },
  amber:   { ring: "focus:ring-brand-tint focus:border-brand-deep", btn: "bg-amber-600 hover:bg-amber-700", active: "bg-amber-50 border-l-2 border-amber-500" },
  indigo:  { ring: "focus:ring-brand-tint focus:border-brand-deep", btn: "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a]", active: "bg-indigo-50 border-l-2 border-indigo-500" },
};

export function ProductSearchInput({
  onSelect,
  placeholder = "상품명 · 코드 검색",
  accent = "teal",
  className = "",
}: ProductSearchInputProps) {
  const { query, setQuery, results, setResults, selected, setSelected } = useProductInfoSearch();
  const [loading, setLoading] = useState(false);
  // 2026-08-09 · 사용자 요청 · 리스트 숨김 flag · 선택 or 확인 시 true · 다시 타이핑 시 false
  const [hideList, setHideList] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cls = ACCENT_MAP[accent];

  // 로딩 상태 · debounce fire 감지
  useEffect(() => {
    const q = query.trim();
    if (!q) { setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 260);
    return () => clearTimeout(t);
  }, [query, results]);

  const handleConfirm = () => {
    if (!selected) return;
    const code = String(selected.product_code ?? selected.product_name ?? "").trim();
    if (!code) return;
    onSelect(code, selected);
    // 리셋 · 다음 검색 준비
    setQuery("");
    setSelected(null);
    setResults([]);
    setHideList(false);
    inputRef.current?.focus();
  };

  const canConfirm = selected != null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* 검색 입력 + 확인 버튼 */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setHideList(false); // 다시 타이핑 시 리스트 보이기
            }}
            placeholder={placeholder}
            className={`w-full h-9 pl-8 pr-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 ${cls.ring} transition placeholder:text-zinc-300`}
          />
          {loading && (
            <Spinner size={11} tone="zinc" className="absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`h-9 px-3 rounded-lg text-white text-[12px] font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer inline-flex items-center gap-1 shrink-0 ${cls.btn}`}
          title={canConfirm ? "선택 상품 등록" : "리스트에서 상품 선택"}
        >
          <Check size={12} strokeWidth={3} />
          확인
        </button>
      </div>

      {/* 결과 리스트 · 2026-08-09 · hideList true 면 숨김 (선택·확인 후) */}
      {query.trim() && !hideList && (
        <div className="max-h-[180px] overflow-y-auto border border-line rounded-lg bg-white shadow-sm">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-3 text-center text-[11px] text-zinc-400">
              검색 결과 없음
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {results.slice(0, 20).map((p, i) => {
                const isActive = selected?.product_code === p.product_code && selected?.product_name === p.product_name;
                const code = String(p.product_code ?? "");
                const name = String(p.product_name ?? "-");
                const sup = String(p.supplier ?? "");
                return (
                  <button
                    key={`${code}-${i}`}
                    type="button"
                    onClick={() => {
                      // 2026-08-10 · 사용자 요청 · 리스트 선택 시 · 확인 버튼 없이 자동 onSelect 호출
                      setSelected(p);
                      setQuery(name);
                      setHideList(true);
                      const codeStr = String(p.product_code ?? p.product_name ?? "").trim();
                      if (codeStr) {
                        onSelect(codeStr, p);
                        // 리셋 · handleConfirm 동일 동작
                        setTimeout(() => {
                          setQuery("");
                          setSelected(null);
                          setResults([]);
                          setHideList(false);
                          inputRef.current?.focus();
                        }, 100);
                      }
                    }}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition cursor-pointer ${
                      isActive ? cls.active : "hover:bg-zinc-50 border-l-2 border-transparent"
                    }`}
                  >
                    <Package size={11} className="text-zinc-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-bold truncate ${isActive ? "text-zinc-900" : "text-zinc-700"}`}>
                        {name}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {code || "-"} · {sup || "-"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductSearchInput;
