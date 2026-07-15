// src/hooks/useProductInfoSearch.ts
// 상품 검색 debounce 공통 훅 (2026-07-15 · StockManage/SalesTrend 공유)
//
// 동작: /api/products-search 자동 debounce 검색 (250ms)
// 기존 로직 100% 동일 · JSX 변경 없이 사용
//
// 반환:
//   query · setQuery · results · setResults · selected · setSelected · runSearch

import { useCallback, useEffect, useState } from "react";

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
      const res = await fetch(`/api/products-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const list = await res.json();
        setResults(Array.isArray(list) ? list : []);
      } else {
        setResults([]);
      }
    } catch { setResults([]); }
  }, [query]);

  // 자동 검색 (250ms debounce · 이미 선택된 상품과 동일하면 재검색 안 함)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    if (selected?.product_name === q) return;
    const t = setTimeout(runSearch, 250);
    return () => clearTimeout(t);
  }, [query, selected?.product_name, runSearch]);

  return { query, setQuery, results, setResults, selected, setSelected, runSearch };
}
