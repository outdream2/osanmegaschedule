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
import { Search, Check, Package, Clock, X } from "lucide-react";
import { Spinner } from "../Spinner";
import { useProductInfoSearch } from "../../../hooks/useProductInfoSearch";
// 2026-09-10 · #48 · 사용자 지시 · 최근 검색어 3개 · 통일 프레임워크
import { useRecentSearches } from "../../../hooks/useRecentSearches";

interface ProductSearchInputProps {
  /** 확인 시 콜백 · product_code 전달 (없으면 product_name) */
  onSelect: (codeOrName: string, product: any) => void;
  /** placeholder */
  placeholder?: string;
  /** 색상 accent (teal · sky · emerald 등) · 기본 teal */
  accent?: "teal" | "sky" | "emerald" | "amber" | "indigo";
  /** className */
  className?: string;
  /** 최근 검색어 scope · 페이지별 격리 · 기본 "productSearch" */
  recentScope?: string;
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
  recentScope = "productSearch",
}: ProductSearchInputProps) {
  const { query, setQuery, results, setResults, selected, setSelected } = useProductInfoSearch();
  const [loading, setLoading] = useState(false);
  // 2026-08-09 · 사용자 요청 · 리스트 숨김 flag · 선택 or 확인 시 true · 다시 타이핑 시 false
  const [hideList, setHideList] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cls = ACCENT_MAP[accent];
  // 2026-09-10 · #48 · 사용자 지시 · 최근 검색어 3개 · 통일
  const { recents, push: pushRecent, remove: removeRecent } = useRecentSearches(recentScope);

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
    // 2026-09-10 · #48 · 검색어 저장 · onSelect 전 push
    if (query.trim()) pushRecent(query.trim());
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
            lang="ko" ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setHideList(false); // 다시 타이핑 시 리스트 보이기
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={placeholder}
            className={`w-full h-9 pl-8 pr-3 text-[15px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 ${cls.ring} transition placeholder:text-zinc-300`}
          />
          {loading && (
            <Spinner size={11} tone="zinc" className="absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`h-9 px-3 rounded-lg text-white text-[14px] font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer inline-flex items-center gap-1 shrink-0 ${cls.btn}`}
          title={canConfirm ? "선택 상품 등록" : "리스트에서 상품 선택"}
        >
          <Check size={12} strokeWidth={3} />
          확인
        </button>
      </div>

      {/* 2026-09-10 · #48 · 최근 검색어 · focus + empty 시 표시 · 최대 3개 */}
      {focused && !query.trim() && recents.length > 0 && (
        <div className="border border-line rounded-lg bg-white shadow-sm">
          <div className="px-2.5 py-1 text-[12px] font-bold text-zinc-500 flex items-center gap-1 border-b border-zinc-100">
            <Clock size={11} strokeWidth={2.2} />
            최근 검색어
          </div>
          <div className="divide-y divide-zinc-100">
            {recents.map((r) => (
              <div key={r} className="flex items-center hover:bg-zinc-50 group">
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setQuery(r); setHideList(false); }}
                  className="flex-1 text-left px-2.5 py-1.5 text-[14px] text-zinc-700 cursor-pointer"
                >
                  {r}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); removeRecent(r); }}
                  className="px-2 opacity-50 group-hover:opacity-100 cursor-pointer text-zinc-400 hover:text-rose-500"
                  title="삭제"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 결과 리스트 · 2026-09-11 · #102 · Linear/Vercel 2026 톤 · 재디자인
          - 클린 카드 · divide 대신 · gap-1 카드 · hover ring
          - 이니셜 아이콘 · 상품 이미지 대체 · 브랜드 톤 배경
          - 상품명 (14px bold) + 코드 / 공급사 (12px muted)
          - 그림자 강화 · 팝오버 느낌 */}
      {query.trim() && !hideList && (
        <div className="max-h-[240px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12),0_2px_6px_-2px_rgba(0,0,0,0.06)] p-1">
          {results.length === 0 && !loading ? (
            <div className="px-3 py-6 text-center text-[13px] text-zinc-400 flex flex-col items-center gap-1.5">
              <Package size={16} className="text-zinc-300" />
              <span>검색 결과 없음</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.slice(0, 20).map((p, i) => {
                const isActive = selected?.product_code === p.product_code && selected?.product_name === p.product_name;
                const code = String(p.product_code ?? "");
                const name = String(p.product_name ?? "-");
                const sup = String(p.supplier ?? "");
                const initial = (name || "?").charAt(0);
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
                        // 2026-09-10 · #48 · 최근 검색어 저장 · onSelect 전
                        if (query.trim()) pushRecent(query.trim());
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
                    className={`w-full text-left px-2 py-1.5 flex items-center gap-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
                      isActive
                        ? "bg-brand-tint ring-1 ring-brand-deep/30"
                        : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-[13px] ${
                      isActive ? "bg-brand-deep text-white" : "bg-zinc-100 text-zinc-600"
                    }`}>
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[14px] font-bold truncate ${isActive ? "text-zinc-900" : "text-zinc-800"}`}>
                        {name}
                      </div>
                      <div className="text-[12px] text-zinc-400 truncate tabular-nums">
                        {code || "-"} {sup && <span className="text-zinc-300">·</span>} {sup && <span className="text-zinc-500">{sup}</span>}
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
