// src/hooks/useShelfPositionsMap.ts
// 2026-09-08 · 진열위치 표시 32개 파일 공통 데이터 소스
//   · GET /api/products/shelf-positions-map · { [product_code]: shelf_positions }
//   · 모듈 캐시 + 30초 TTL · 여러 컴포넌트 동시 사용 시 · 중복 요청 방지
//   · inventory-checks-updated 이벤트 리스닝 · 자동 refresh
//
// 사용 예:
//   const shelfMap = useShelfPositionsMap();
//   const shelfPos = shelfMap[product_code];
//   <ShelfPositionsBadge positions={shelfPos} />

import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import type { ShelfPositions } from "../lib/shelfPositions";

type ShelfMap = Record<string, ShelfPositions>;

const TTL_MS = 30_000;
let cache: { data: ShelfMap; expiresAt: number } | null = null;
let inflight: Promise<ShelfMap> | null = null;
const subscribers = new Set<(m: ShelfMap) => void>();

async function fetchMap(): Promise<ShelfMap> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  if (inflight) return inflight;
  inflight = api.get<ShelfMap>("/api/products/shelf-positions-map")
    .then(res => {
      const map = (res.data && typeof res.data === "object") ? res.data : {};
      cache = { data: map, expiresAt: Date.now() + TTL_MS };
      subscribers.forEach(fn => { try { fn(map); } catch { /* silent */ } });
      return map;
    })
    .catch(() => {
      const empty: ShelfMap = {};
      cache = { data: empty, expiresAt: Date.now() + TTL_MS };
      return empty;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function invalidateShelfPositionsMap(): void {
  cache = null;
}

/** 2026-09-09 · 저장 직후 · 즉시 캐시 반영 · UI 반영 지연 방지 · 사용자 지시 */
export function patchShelfPositionsCache(productCode: string, shelfPositions: ShelfPositions): void {
  const nextData = { ...(cache?.data ?? {}) };
  nextData[productCode] = shelfPositions;
  cache = { data: nextData, expiresAt: Date.now() + TTL_MS };
  subscribers.forEach(fn => { try { fn(nextData); } catch { /* silent */ } });
}

export function useShelfPositionsMap(): ShelfMap {
  const [map, setMap] = useState<ShelfMap>(cache?.data ?? {});
  useEffect(() => {
    let mounted = true;
    fetchMap().then(next => { if (mounted) setMap(next); });
    subscribers.add(setMap);
    // 실재고 저장 이벤트 · 자동 invalidate + refresh
    const onUpdate = () => {
      invalidateShelfPositionsMap();
      fetchMap().then(next => { if (mounted) setMap(next); });
    };
    window.addEventListener("inventory-checks-updated", onUpdate);
    return () => {
      mounted = false;
      subscribers.delete(setMap);
      window.removeEventListener("inventory-checks-updated", onUpdate);
    };
  }, []);
  return map;
}
