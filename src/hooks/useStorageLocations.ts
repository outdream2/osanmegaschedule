// src/hooks/useStorageLocations.ts
// 2026-09-08 · 매장·창고 마스터 조회 훅 (KV settings.storage_locations)
//   · 모듈 캐시 + 인메모리 · 세션 내 한번만 fetch
//   · fallback · DEFAULT_STORAGE_LOCATIONS · 서버 미배포/조회 실패 시
//   · ShelfPositionsBadge · ShelfPositionInput 등에서 사용

import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { DEFAULT_STORAGE_LOCATIONS, type StorageLocation } from "../shared/schemas/settings";

let cache: StorageLocation[] | null = null;
let inflight: Promise<StorageLocation[]> | null = null;

async function fetchLocations(): Promise<StorageLocation[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api.get<StorageLocation[]>("/api/settings/storage-locations")
    .then(res => {
      const list = Array.isArray(res.data) && res.data.length > 0 ? res.data : DEFAULT_STORAGE_LOCATIONS;
      cache = list;
      return list;
    })
    .catch(() => DEFAULT_STORAGE_LOCATIONS)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 관리자 설정 편집 후 · 캐시 무효화 */
export function invalidateStorageLocationsCache(): void {
  cache = null;
}

export function useStorageLocations(): StorageLocation[] {
  const [list, setList] = useState<StorageLocation[]>(cache ?? DEFAULT_STORAGE_LOCATIONS);
  useEffect(() => {
    let mounted = true;
    fetchLocations().then(next => {
      if (mounted) setList(next);
    });
    return () => { mounted = false; };
  }, []);
  return list;
}
