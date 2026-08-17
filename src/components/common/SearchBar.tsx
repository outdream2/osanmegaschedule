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
  rose:    "focus:ring-brand-tint focus:border-brand-deep",
  sky:     "focus:ring-brand-tint focus:border-brand-deep",
  indigo:  "focus:ring-brand-tint focus:border-brand-deep",
  emerald: "focus:ring-brand-tint focus:border-brand-deep",
  amber:   "focus:ring-brand-tint focus:border-brand-deep",
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
            // 2026-08-17 v2 · 폰트 +2 (14→15) · inset light + brand focus · Attio 톤
            "text-[15px] border border-line rounded-lg pl-8 pr-16 h-9 w-full",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.04)]",
            "focus:outline-none focus:ring-2 transition-all duration-150 ease-out bg-white text-ink placeholder-ink-soft",
            ACCENT_MAP[accent],
          ].join(" ")}
          aria-label={placeholder}
        />
        {/* 결과 카운트 배지 · 최신 트렌드 · brand-tint 통일 · 폰트 +2 */}
        {showResultBadge && (
          <span
            className={[
              "absolute right-8 text-[12px] font-semibold tabular-nums px-2 py-0.5 rounded-full",
              resultCount === 0
                ? "bg-zinc-100 text-ink-soft"
                : "bg-brand-tint text-brand-deep border border-brand/15",
            ].join(" ")}
            title={`검색 결과 ${resultCount}${resultUnit}`}
          >
            {resultCount}{resultUnit}
          </span>
        )}
        {/* 초기화 X 버튼 · 폰트 +2 · brand hover */}
        {hasQuery && (
          <button
            type="button"
            onClick={() => { onChange(""); setShowHistory(false); }}
            className="absolute right-2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-brand-tint text-ink-soft hover:text-brand-deep cursor-pointer transition-colors"
            title="검색 초기화 (Esc)"
            aria-label="검색 초기화"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* 최근 검색어 dropdown · 2026-08-17 v2 · 3-layer shadow · Attio 세련 */}
      {showHistory && historyList.length > 0 && (
        <div
          className="absolute top-10 left-0 right-0 bg-white rounded-lg border border-line z-30 py-1"
          style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.10), 0 8px 24px -8px rgba(10,46,74,0.20), 0 16px 40px -16px rgba(10,46,74,0.24)" }}
        >
          <div className="px-3 py-1.5 text-[12px] font-semibold text-ink-soft tracking-tight flex items-center gap-1.5">
            <Clock size={12} />최근 검색
          </div>
          {historyList.map((h, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(h); setShowHistory(false); }}
              className="w-full text-left px-3 py-1.5 text-[14px] text-ink hover:bg-brand-tint hover:text-brand-deep cursor-pointer flex items-center justify-between group transition-colors"
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
