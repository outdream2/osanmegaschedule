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

export function useProductInfoSearch(): ProductInfoSearch {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    try {
      const { data } = await api.get<unknown>(`/api/products-search?q=${encodeURIComponent(q)}`);
      setResults(Array.isArray(data) ? data as ProductSearchResult[] : []);
    } catch { setResults([]); }
  }, [query]);

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
