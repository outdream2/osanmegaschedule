// 2026-08-17 · #130 · 대원칙 · code_slim · LandingPage 분리 (frame_principle · 재사용성)
// 비로그인 랜딩 · 상품·재고 실시간 검색 (300ms debounce · abort 지원)
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Package } from "@phosphor-icons/react";
import { api } from "../../lib/apiClient";
import { StatusPill, type PillTone } from "../common/StatusPill";

export interface StockItem {
  product_name: string;
  spec: string | null;
  current_stock: string | null;
  sale_status: string | null;
  category: string | null;
  supplier: string | null;
}

interface StockBadge { label: string; tone: PillTone; }

/** 재고·판매 배지 · 재고있음/재고없음 + 판매중/판매중단 */
function getStockBadges(item: StockItem): StockBadge[] {
  const n = Number(item.current_stock ?? 0);
  const stockBadge: StockBadge = Number.isFinite(n) && n > 0
    ? { label: "재고있음", tone: "emerald" }
    : { label: "재고없음", tone: "rose" };
  const status = item.sale_status ?? "";
  const saleBadge: StockBadge = /단종|판매중지|판매불가|판매\s*중단/.test(status)
    ? { label: "판매중단", tone: "zinc" }
    : { label: "판매중", tone: "sky" };
  return [stockBadge, saleBadge];
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
    /* 2026-08-17 · 세련 · 딥네이비 브랜드 · 상단 gradient hero · 그림자 심화 */
    <div className="w-full rounded-3xl overflow-hidden shadow-[0_4px_24px_-4px_rgba(10,46,74,0.15),0_20px_40px_-16px_rgba(10,46,74,0.2)] border border-line bg-white">
      {/* 헤더 · 딥네이비 gradient · 목업 톤 통일 */}
      <div className="relative overflow-hidden px-5 py-4 flex items-center gap-3"
        style={{ background: "linear-gradient(120deg, #0A2E4A 0%, #1E5C8E 62%, #3E7CB1 100%)" }}>
        {/* Decorative blobs · Hero 톤 */}
        <div className="absolute rounded-full w-[160px] h-[160px] -right-[50px] -top-[70px] pointer-events-none" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute rounded-full w-[100px] h-[100px] right-[90px] -bottom-[50px] pointer-events-none" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)", backdropFilter: "blur(8px)" }}>
          <Package size={20} className="text-white" weight="fill" />
        </div>
        <div className="relative text-left flex-1 min-w-0">
          <div className="text-[13px] font-bold uppercase tracking-[0.08em] mb-0.5" style={{ color: "#B9D6EA" }}>Realtime Stock</div>
          <div className="text-white font-extrabold text-[20px] sm:text-[22px] tracking-tight leading-tight">재고 확인</div>
          <div className="text-[14px] mt-1 leading-tight" style={{ color: "#DCE8F3" }}>약품·제품명 입력 시 실시간 재고 확인</div>
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
            className="w-full rounded-xl pl-10 pr-9 py-2.5 text-zinc-900 text-sm font-semibold placeholder:text-zinc-300 placeholder:font-normal focus:outline-none border-2 border-line bg-zinc-50 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition-all"
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
          <div className="text-center text-zinc-400 text-sm py-4">검색 중…</div>
        )}
        {results !== null && results.length === 0 && !searching && (
          <div className="text-center text-zinc-400 text-sm py-4">일치하는 상품이 없습니다.</div>
        )}
        {results !== null && results.length > 0 && (
          <div className="flex flex-col divide-y divide-zinc-100">
            {results.slice(0, 20).map((item, idx) => {
              const badges = getStockBadges(item);
              return (
                <div key={idx} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-800 font-bold text-sm truncate">{item.product_name}</div>
                    {item.supplier && (
                      <div className="text-[12px] text-zinc-400 truncate mt-0.5">{item.supplier}</div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {badges.map((badge, bi) => (
                      <StatusPill key={bi} tone={badge.tone} size="xs" dot>
                        {badge.label}
                      </StatusPill>
                    ))}
                  </div>
                </div>
              );
            })}
            {results.length > 20 && (
              <div className="text-center text-[12px] text-zinc-400 pt-2">
                외 {results.length - 20}건 · 더 자세히 보려면 로그인
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
