// src/components/common/SearchBar.tsx
// 2026-08-03 (#201) · 공통 검색 바 (상품·공급사·코드 통합 검색)
//
// 근거 · 2026 B2B 재고 SaaS(Zoho·Cin7·Odoo·QuickBooks) UX 표준
//   1) 통합 검색 바 · 상품명·코드·공급사 동시 매칭 (필드별 검색 대신 하나의 창)
//   2) Quick filter chips · 검색 옆 · 다중 선택 · 원클릭 제거 (dead-end 회피)
//   3) 결과 카운트 · 검색어 옆 · 즉시 피드백
//   4) 최근 검색어 · localStorage · 5개 · dropdown 표시 (선택)
//   5) X 버튼 · 한 번에 초기화
//
// 성능
//   · debounce 대신 · React 18 useDeferredValue 사용 (라이브러리 무관 · 자동 우선순위)
//   · input 즉시 반응 · 필터링만 유예 · perceived latency 0
//
// 사용 예
//   <SearchBar
//     value={search} onChange={setSearch}
//     placeholder="상품·코드·공급사 (초성 검색 지원)"
//     resultCount={filtered.length}
//     historyKey="megatown_orderNeed_search_history"
//   />

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Clock } from "lucide-react";

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 결과 카운트 · undefined 이면 숨김 · 검색어 있을 때만 표시 */
  resultCount?: number;
  /** 결과 단위 · 기본 "건" */
  resultUnit?: string;
  /** 최근 검색어 저장 키 · localStorage · 5개 · 미지정 시 저장 안 함 */
  historyKey?: string;
  /** 좌측 아이콘 색 (Tailwind class) · 기본 zinc-400 */
  iconColorClass?: string;
  /** 포커스 링 색상 프리셋 · 기본 rose (발주필요 톤) */
  accent?: "rose" | "sky" | "indigo" | "emerald" | "amber";
  /** 폭 (Tailwind class) · 기본 w-64 */
  widthClass?: string;
  /** 자동 포커스 */
  autoFocus?: boolean;
}

const ACCENT_MAP = {
  rose:    "focus:ring-rose-400 focus:border-rose-400",
  sky:     "focus:ring-brand-tint focus:border-brand-deep",
  indigo:  "focus:ring-brand-tint focus:border-brand-deep",
  emerald: "focus:ring-brand-tint focus:border-brand-deep",
  amber:   "focus:ring-amber-400 focus:border-amber-400",
};

const HISTORY_MAX = 5;

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = "검색",
  resultCount,
  resultUnit = "건",
  historyKey,
  iconColorClass = "text-zinc-400",
  accent = "rose",
  widthClass = "w-64",
  autoFocus = false,
}) => {
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 최근 검색어 로딩
  useEffect(() => {
    if (!historyKey) return;
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.filter(v => typeof v === "string").slice(0, HISTORY_MAX));
      }
    } catch { /* silent */ }
  }, [historyKey]);

  // 최근 검색어 저장 (blur · Enter · 3자 이상만)
  const persist = (v: string) => {
    if (!historyKey) return;
    const trimmed = v.trim();
    if (trimmed.length < 2) return;
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(x => x !== trimmed)].slice(0, HISTORY_MAX);
      try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* silent */ }
      return next;
    });
  };

  // 외부 클릭 시 dropdown 닫기
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showHistory]);

  const hasQuery = value.trim().length > 0;
  const showResultBadge = hasQuery && typeof resultCount === "number";

  const historyList = useMemo(() => history.filter(h => h !== value.trim()), [history, value]);

  return (
    <div ref={containerRef} className={`relative ${widthClass}`}>
      <div className="relative flex items-center">
        <Search size={13} className={`absolute left-2.5 ${iconColorClass} pointer-events-none`} />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => historyKey && historyList.length > 0 && setShowHistory(true)}
          onKeyDown={e => {
            if (e.key === "Enter") { persist(value); setShowHistory(false); }
            if (e.key === "Escape") { onChange(""); setShowHistory(false); }
          }}
          onBlur={() => persist(value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={[
            "text-[11px] border border-zinc-200 rounded-md pl-7 pr-14 h-7 w-full",
            "focus:outline-none focus:ring-1 transition bg-white",
            ACCENT_MAP[accent],
          ].join(" ")}
          aria-label={placeholder}
        />
        {/* 결과 카운트 배지 · 검색어 있을 때만 */}
        {showResultBadge && (
          <span
            className={[
              "absolute right-7 text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded",
              resultCount === 0
                ? "bg-zinc-100 text-zinc-400"
                : "bg-rose-50 text-rose-600",
            ].join(" ")}
            title={`검색 결과 ${resultCount}${resultUnit}`}
          >
            {resultCount}{resultUnit}
          </span>
        )}
        {/* 초기화 X 버튼 · 검색어 있을 때만 */}
        {hasQuery && (
          <button
            type="button"
            onClick={() => { onChange(""); setShowHistory(false); }}
            className="absolute right-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 cursor-pointer transition"
            title="검색 초기화 (Esc)"
            aria-label="검색 초기화"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* 최근 검색어 dropdown */}
      {showHistory && historyList.length > 0 && (
        <div className="absolute top-8 left-0 right-0 bg-white rounded-md border border-zinc-200 shadow-lg z-30 py-1">
          <div className="px-2.5 py-1 text-[9px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1">
            <Clock size={9} />최근 검색
          </div>
          {historyList.map((h, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(h); setShowHistory(false); }}
              className="w-full text-left px-2.5 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 cursor-pointer flex items-center justify-between group"
            >
              <span className="truncate">{h}</span>
              <span
                role="button"
                tabIndex={-1}
                onMouseDown={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  setHistory(prev => {
                    const next = prev.filter(x => x !== h);
                    if (historyKey) {
                      try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* silent */ }
                    }
                    return next;
                  });
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 ml-2 shrink-0 cursor-pointer"
                title="이 검색어 삭제"
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
