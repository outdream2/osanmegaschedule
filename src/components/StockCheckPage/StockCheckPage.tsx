import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Package, Search, X } from "lucide-react";

interface StockItem {
  product_name: string;
  spec: string | null;
  current_stock: string | null;
  sale_status: string | null;
  category: string | null;
  real_map: string | null;
  display_location: string | null;
  supplier: string | null;
}

interface StockCheckPageProps {
  onBack: () => void;
}

type StockState = "in" | "out" | "selling";

function getStockState(item: StockItem): StockState {
  const status = item.sale_status ?? "";
  if (/단종|판매중지|판매불가/.test(status)) return "out";
  const n = Number(item.current_stock);
  if (item.current_stock !== null && item.current_stock !== "") {
    return n > 0 ? "in" : "out";
  }
  return "selling";
}

const STATE_META: Record<StockState, { label: string; bg: string; text: string; dot: string }> = {
  in:      { label: "재고있음",  bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  selling: { label: "판매중",    bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-400"     },
  out:     { label: "재고없음",  bg: "bg-red-100",     text: "text-red-600",     dot: "bg-red-400"     },
};

export const StockCheckPage: React.FC<StockCheckPageProps> = ({ onBack }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) { setResults(null); setError(null); setLoading(false); return; }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stock-check?q=${encodeURIComponent(trimmed)}`, { signal: ac.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "오류");
      setResults(data);
    } catch (e: any) {
      if (e.name !== "AbortError") setError("검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults(null); setError(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const clear = () => {
    setQuery("");
    setResults(null);
    setError(null);
    setLoading(false);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-[#e2e8f0] h-14 px-4 sm:px-6 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer text-xs font-semibold shrink-0"
        >
          <ArrowLeft size={13} />
          <span className="hidden sm:inline">메인</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Package size={14} className="text-white" />
          </div>
          <div>
            <span className="font-black text-slate-800 text-xl leading-tight" style={{ color: "#ef4444" }}>OSAN</span>
            <span className="font-black text-gray-900 text-base leading-tight hidden sm:inline"> MEGATOWN</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">
          <Package size={11} />
          <span>재고 확인</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-xl mx-auto w-full px-4 pt-6 pb-20">
        {/* Search bar */}
        <div className="relative mb-2">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="약품·제품명 검색 (예: 타이레놀, 판콜에이…)"
            autoFocus
            className="w-full rounded-2xl pl-11 pr-10 py-3.5 text-slate-900 text-sm font-semibold placeholder:text-slate-300 placeholder:font-normal focus:outline-none border-2 border-slate-200 bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all"
          />
          {query && (
            <button type="button" onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition cursor-pointer">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Status legend */}
        <div className="flex items-center gap-3 mb-4 px-1">
          {(Object.entries(STATE_META) as [StockState, typeof STATE_META[StockState]][]).map(([, m]) => (
            <span key={m.label} className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <span className={`w-2 h-2 rounded-full ${m.dot}`} />
              {m.label}
            </span>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-4 px-1 text-slate-400 text-xs font-medium">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin shrink-0" />
            검색 중...
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-600 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && results?.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Package size={28} className="mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">검색 결과가 없습니다</p>
            <p className="text-xs mt-1">다른 이름으로 검색해 보세요</p>
          </div>
        )}

        {/* Results list */}
        {!loading && results && results.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">검색 결과 {results.length}건</span>
            </div>
            <div className="divide-y divide-slate-50">
              {results.map((item, i) => {
                const state = getStockState(item);
                const meta = STATE_META[state];
                const location = item.real_map || item.display_location || null;
                return (
                  <div key={`${item.product_name}-${item.spec ?? ""}-${i}`}
                    className="px-4 py-3 flex items-center gap-3">
                    {/* Status badge */}
                    <span className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-lg ${meta.bg} ${meta.text} whitespace-nowrap`}>
                      {meta.label}
                    </span>

                    {/* Name + spec */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{item.product_name}</div>
                      {item.spec && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.spec}</div>
                      )}
                    </div>

                    {/* Location tag */}
                    {location && (
                      <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                        {location}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t border-slate-50 text-[10px] text-slate-300 text-center">
              재고 정보는 실시간이 아닐 수 있습니다 · 정확한 재고는 약국에 직접 문의해 주세요
            </div>
          </div>
        )}

        {/* Initial hint */}
        {!loading && !error && results === null && (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-300">
            <Search size={32} />
            <p className="text-sm font-semibold text-slate-400">제품명을 입력하면 결과가 바로 나타납니다</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockCheckPage;
