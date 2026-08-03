// src/hooks/useVendors.ts
// 공급사 목록 공용 훅 · 모듈 레벨 캐시 (5분 TTL) + vendors-changed 이벤트 구독
// 사용처: OrderManagePage · ReturnListPanel · LowStockPanel · FlowTab · SupplierTab

import { useState, useEffect, useCallback, useMemo } from "react";
import { displayVendorName, stripVendorAnnotation } from "../utils/vendorNameNormalize";

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

  // company_name → category 맵 (배지 표시 전용) · 2026-08-03 (#242)
  //   다중 key 정규화 · findVendor 와 동일 정책 확장
  //   · trim · trim+공백제거 · trim+lowercase
  //   · displayVendorName (법인접두어+vat 부가정보 제거)
  //   · displayVendorName + 공백제거 · displayVendorName + lowercase
  //   → 이름 표기 차이 (예 "(주)대웅제약" vs "대웅제약") 로 인한 miss 방지
  const vendorCategoryMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    const put = (key: string, val: string | null) => {
      const k = String(key ?? "").trim();
      if (k && !(k in m)) m[k] = val;
    };
    for (const v of vendors) {
      if (!v.company_name) continue;
      const cat = v.category ?? null;
      const raw = v.company_name.trim();
      put(raw, cat);
      put(raw.replace(/\s+/g, ""), cat);
      put(raw.toLowerCase(), cat);
      const stripped = stripVendorAnnotation(raw);
      if (stripped && stripped !== raw) {
        put(stripped, cat);
        put(stripped.replace(/\s+/g, ""), cat);
      }
      const clean = displayVendorName(raw);
      if (clean && clean !== raw) {
        put(clean, cat);
        put(clean.replace(/\s+/g, ""), cat);
        put(clean.toLowerCase(), cat);
      }
    }
    return m;
  }, [vendors]);

  // vendor 조회 헬퍼 · 여러 정규화 시도 후 category 반환 (#242)
  const getVendorCategory = useCallback((name: string | null | undefined): string | null => {
    if (!name) return null;
    const raw = String(name).trim();
    if (!raw) return null;
    return vendorCategoryMap[raw]
      ?? vendorCategoryMap[stripVendorAnnotation(raw)]
      ?? vendorCategoryMap[displayVendorName(raw)]
      ?? vendorCategoryMap[raw.replace(/\s+/g, "")]
      ?? vendorCategoryMap[raw.toLowerCase()]
      ?? vendorCategoryMap[displayVendorName(raw).replace(/\s+/g, "")]
      ?? vendorCategoryMap[displayVendorName(raw).toLowerCase()]
      ?? null;
  }, [vendorCategoryMap]);

  return { vendors, vendorMap, vendorCategoryMap, getVendorCategory, loading, reload };
}
