// src/hooks/useProductInfoSearch.ts
// 상품 검색 debounce 공통 훅 (2026-07-15 · StockManage/SalesTrend 공유)
//
// 동작: /api/products-search 자동 debounce 검색 (250ms)
// 기존 로직 100% 동일 · JSX 변경 없이 사용
//
// 반환:
//   query · setQuery · results · setResults · selected · setSelected · runSearch

// 2026-08-16 · apiClient 마이그레이션
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { TIMING } from "../constants/timing";

export interface ProductSearchResult {
  product_code?: string;
  product_name?: string;
  spec?: string | null;
  supplier?: string | null;
  [key: string]: any;
}

export interface ProductInfoSearch {
  query: string;
  setQuery: (q: string) => void;
  results: ProductSearchResult[];
  setResults: (r: ProductSearchResult[]) => void;
  selected: ProductSearchResult | null;
  setSelected: (p: ProductSearchResult | null) => void;
  runSearch: () => Promise<void>;
}

// 2026-10-12 · 사용자 지시 · ScanPage 등 실재고 작업 시 판매중지·숨김 상품도 검색 가능하도록
//   · 기존 호출처 (SalesTrend, FlowTab 등) 는 default (false) 로 영향 없음
export interface UseProductInfoSearchOptions {
  /** 판매중지 상품도 포함 · default false */
  includeInactive?: boolean;
  /** 숨김 상품도 포함 · default false */
  includeHidden?: boolean;
}

export function useProductInfoSearch(options?: UseProductInfoSearchOptions): ProductInfoSearch {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const includeInactive = options?.includeInactive ?? false;
  const includeHidden = options?.includeHidden ?? false;

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    try {
      const params = new URLSearchParams({ q });
      if (includeInactive) params.set("include_inactive", "1");
      if (includeHidden) params.set("include_hidden", "1");
      const { data } = await api.get<unknown>(`/api/products-search?${params.toString()}`);
      setResults(Array.isArray(data) ? data as ProductSearchResult[] : []);
    } catch { setResults([]); }
  }, [query, includeInactive, includeHidden]);

  // 자동 검색 (250ms debounce · 이미 선택된 상품과 동일하면 재검색 안 함)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    if (selected?.product_name === q) return;
    const t = setTimeout(runSearch, TIMING.DEBOUNCE_SEARCH);
    return () => clearTimeout(t);
  }, [query, selected?.product_name, runSearch]);

  return { query, setQuery, results, setResults, selected, setSelected, runSearch };
}
