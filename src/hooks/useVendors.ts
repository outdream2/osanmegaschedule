// src/hooks/useVendors.ts
// 공급사 목록 공용 훅 · 모듈 레벨 캐시 (5분 TTL) + vendors-changed 이벤트 구독
// 사용처: OrderManagePage · ReturnListPanel · LowStockPanel · FlowTab · SupplierTab

import { useState, useEffect, useCallback, useMemo } from "react";

export interface Vendor {
  id: number;
  company_name: string;
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  business_number: string | null;
  [key: string]: unknown;
}

// ── 모듈 레벨 캐시 · TTL 5분 ──────────────────────────────────────────────
const TTL = 5 * 60 * 1000;
let _cache: { vendors: Vendor[]; time: number } | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach(l => l());
}

async function _fetchVendors(force = false): Promise<Vendor[]> {
  if (!force && _cache && Date.now() - _cache.time < TTL) return _cache.vendors;
  const res = await fetch("/api/vendors?withBalances=1");
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  _cache = { vendors: Array.isArray(data) ? data : [], time: Date.now() };
  _notify();
  return _cache.vendors;
}

// ── 훅 ────────────────────────────────────────────────────────────────────
export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>(_cache?.vendors ?? []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let cancelled = false;

    // 초기 로드
    _fetchVendors()
      .then(v => { if (!cancelled) { setVendors(v); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });

    // 캐시 업데이트 구독 (다른 훅 인스턴스가 새로 fetch 했을 때)
    const onCacheUpdate = () => { if (!cancelled) setVendors(_cache?.vendors ?? []); };
    _listeners.add(onCacheUpdate);

    // vendors-changed CustomEvent → 강제 재fetch
    const onChanged = () => { _fetchVendors(true).catch(() => {}); };
    window.addEventListener("vendors-changed", onChanged);

    return () => {
      cancelled = true;
      _listeners.delete(onCacheUpdate);
      window.removeEventListener("vendors-changed", onChanged);
    };
  }, []);

  // 강제 재로드
  const reload = useCallback(() => _fetchVendors(true), []);

  // company_name(trim) → Vendor 전체 객체 맵
  const vendorMap = useMemo(() => {
    const m: Record<string, Vendor> = {};
    for (const v of vendors) {
      if (v.company_name) m[v.company_name.trim()] = v;
    }
    return m;
  }, [vendors]);

  // company_name(trim) → category 맵 (배지 표시 전용)
  const vendorCategoryMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const v of vendors) {
      if (v.company_name) m[v.company_name.trim()] = v.category ?? null;
    }
    return m;
  }, [vendors]);

  return { vendors, vendorMap, vendorCategoryMap, loading, reload };
}
