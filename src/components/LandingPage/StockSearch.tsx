// 2026-08-17 · #130 · 대원칙 · code_slim · LandingPage 분리 (frame_principle · 재사용성)
// 비로그인 랜딩 · 상품·재고 실시간 검색 (300ms debounce · abort 지원)
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Package } from "@phosphor-icons/react";
import { api } from "../../lib/apiClient";

export interface StockItem {
  product_name: string;
  spec: string | null;
  current_stock: string | null;
  sale_status: string | null;
  category: string | null;
  supplier: string | null;
}

interface Badge {
  label: string;
  bg: string;
  text: string;
  dot: string;
}

/** 재고·판매 배지 · 재고있음/재고없음 + 판매중/판매중단 */
function getStockBadges(item: StockItem): Badge[] {
  const badges: Badge[] = [];
  const n = Number(item.current_stock ?? 0);
  if (Number.isFinite(n) && n > 0) {
    badges.push({ label: "재고있음", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" });
  } else {
    badges.push({ label: "재고없음", bg: "bg-red-100", text: "text-red-600", dot: "bg-red-500" });
  }
  const status = item.sale_status ?? "";
  if (/단종|판매중지|판매불가|판매\s*중단/.test(status)) {
    badges.push({ label: "판매중단", bg: "bg-zinc-200", text: "text-zinc-600", dot: "bg-zinc-400" });
  } else {
    badges.push({ label: "판매중", bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" });
  }
  return badges;
}

export function StockSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const { data } = await api.get<StockItem[]>(`/api/stock-check?q=${encodeURIComponent(val.trim())}`, { signal: ac.signal });
        setResults(data);
      } catch { /* silent · abort/network */ }
      finally { setSearching(false); }
    }, 300);
  };

  return (
    <div className="w-full rounded-3xl overflow-hidden shadow-xl border border-blue-100">
      {/* 헤더 · gradient bg */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-blue-400/30"
        style={{ background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.35)" }}>
          <Package size={18} className="text-white" weight="fill" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <div className="text-white font-bold text-base sm:text-lg tracking-tight leading-tight">재고 확인</div>
          <div className="text-blue-100 text-[11px] mt-0.5">약품·제품명 입력 시 실시간 재고 확인</div>
        </div>
      </div>
      {/* 검색바 */}
      <div className="px-4 pt-3 pb-1 bg-white">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="예: 타이레놀, 판콜에이…"
            className="w-full rounded-xl pl-10 pr-9 py-2.5 text-zinc-900 text-sm font-semibold placeholder:text-zinc-300 placeholder:font-normal focus:outline-none border-2 border-zinc-200 bg-zinc-50 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition-all"
          />
          {query && (
            <button type="button"
              onClick={() => { setQuery(""); setResults(null); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {/* 결과 리스트 */}
      <div className="bg-white px-4 pb-3 pt-1 max-h-80 overflow-y-auto">
        {query.trim() && searching && results === null && (
          <div className="text-center text-zinc-400 text-xs py-4">검색 중…</div>
        )}
        {results !== null && results.length === 0 && !searching && (
          <div className="text-center text-zinc-400 text-xs py-4">일치하는 상품이 없습니다.</div>
        )}
        {results !== null && results.length > 0 && (
          <div className="flex flex-col divide-y divide-zinc-100">
            {results.slice(0, 20).map((item, idx) => {
              const badges = getStockBadges(item);
              return (
                <div key={idx} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-800 font-bold text-xs truncate">{item.product_name}</div>
                    {item.supplier && (
                      <div className="text-[10px] text-zinc-400 truncate mt-0.5">{item.supplier}</div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {badges.map((badge, bi) => (
                      <div key={bi} className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${badge.bg} ${badge.text} text-[10px] font-bold`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {results.length > 20 && (
              <div className="text-center text-[10px] text-zinc-400 pt-2">
                외 {results.length - 20}건 · 더 자세히 보려면 로그인
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
