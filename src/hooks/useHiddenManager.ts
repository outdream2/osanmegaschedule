// src/hooks/useHiddenManager.ts
// 상품 숨김 관리 공통 훅 (2026-07-15 · StockManagePage/SalesTrendPage 공유)
//
// 반환 · 사용법:
//   const { modalOpen, list, loading, unhideBusyCode, load, open, unhide } = useHiddenManager();
//   → 기존 각 페이지의 hiddenModalOpen/hiddenList/... 를 이걸로 대체
//
// 동작: 두 페이지에 있던 완전 동일한 로직 (fetch /api/products/hidden · PATCH hidden:false)
// 동작 변경 없음 · 리팩토링만 · 리로드 정책 (자동 리로드 안 함) 유지

import { useCallback, useState } from "react";

export interface HiddenProduct {
  product_code: string;
  product_name: string;
  spec?: string | null;
  supplier?: string | null;
  real_map?: string | null;
  current_stock?: number | null;
  sale_price?: number | null;
}

export interface HiddenManager {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  list: HiddenProduct[];
  loading: boolean;
  unhideBusyCode: string | null;
  load: () => Promise<void>;
  open: () => void;
  close: () => void;
  unhide: (code: string) => Promise<void>;
}

// 각 페이지 후속 처리 콜백 (해당 페이지 리스트만 갱신 · 다른 페이지 연동 없음)
//   기능은 같아도 동작은 각 페이지가 격리해서 구현 (2026-07-15 정책)
export interface UseHiddenManagerOptions {
  onUnhideSuccess?: (code: string) => void;
}

export function useHiddenManager(options?: UseHiddenManagerOptions): HiddenManager {
  const [modalOpen, setModalOpen] = useState(false);
  const [list, setList] = useState<HiddenProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [unhideBusyCode, setUnhideBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products/hidden");
      const data = res.ok ? await res.json() : [];
      setList(Array.isArray(data) ? data : []);
    } catch { setList([]); }
    finally { setLoading(false); }
  }, []);

  const open = useCallback(() => {
    setModalOpen(true);
    load();
  }, [load]);

  const close = useCallback(() => setModalOpen(false), []);

  const unhide = useCallback(async (code: string) => {
    if (!code) return;
    setUnhideBusyCode(code);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: false }),
      });
      if (res.ok) {
        setList(prev => prev.filter(p => String(p.product_code) !== code));
        // 페이지별 후속 처리 (해당 페이지 리스트만 · 다른 페이지 영향 없음)
        options?.onUnhideSuccess?.(code);
      }
    } catch { /* ignore */ }
    finally { setUnhideBusyCode(null); }
  }, [options]);

  return { modalOpen, setModalOpen, list, loading, unhideBusyCode, load, open, close, unhide };
}
