// src/hooks/useZoneDefs.ts
// 2026-08-30 · zone_defs 정식 DB 테이블 단일 소스
//   · 4개 컬럼 (id · cellId · zone · category · detailedCategory)
//   · KV 폴백 완전 제거 · DB 실패 시 · 명시적 에러 반환
//   · 매장구역도 · 매장구역편집 공용 훅

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/apiClient";

export interface ZoneDef {
  id: number;
  cellId: number;
  zone: string;
  category: string;
  detailedCategory?: string;
}

/** DB 응답 sanitize · 잘못된 row 필터 */
function sanitize(raw: unknown): ZoneDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((z): z is ZoneDef => {
      if (!z || typeof z !== "object") return false;
      const zz = z as Partial<ZoneDef>;
      return (
        typeof zz.id === "number" &&
        typeof zz.cellId === "number" &&
        typeof zz.zone === "string" &&
        typeof zz.category === "string"
      );
    })
    .sort((a, b) => a.cellId - b.cellId);
}

export interface UseZoneDefsResult {
  zones: ZoneDef[];
  loading: boolean;
  /** DB 조회 실패 시 · 사용자에게 표시할 에러 메시지 · null 이면 정상 */
  error: string | null;
  reload: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  /** 단건 업데이트 · id 지정 · PATCH */
  updateZone: (id: number, patch: Partial<Omit<ZoneDef, "id">>) => Promise<boolean>;
  /** 신규 zone 추가 · cell_id 유일 · POST */
  addZone: (zone: Omit<ZoneDef, "id">) => Promise<boolean>;
  /** zone 삭제 · id · DELETE */
  deleteZone: (id: number) => Promise<boolean>;
}

/**
 * 매장구역도·매장구역편집 · zone_defs 훅
 *   · DB 단일 소스 · KV 폴백 없음
 *   · 실패 시 · error 상태로 명시적 노출 · UI 에러 배너 렌더 필요
 */
export function useZoneDefs(): UseZoneDefsResult {
  const [zones, setZones] = useState<ZoneDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await api.get<{ zones: ZoneDef[]; count?: number }>("/api/zone-defs");
        if (cancelled) return;
        const clean = sanitize(data?.zones);
        setZones(clean);
        if (clean.length === 0) {
          setError("zone_defs 테이블에 데이터가 없습니다. sql/2026-08-30b-zone-defs-cell-num.sql 실행 확인 필요.");
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        console.error("[useZoneDefs] /api/zone-defs 조회 실패:", msg);
        setError(`매장구역 정보 조회 실패: ${msg}`);
        setZones([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadTick]);

  const reload = useCallback(() => setReloadTick(t => t + 1), []);

  const updateZone = useCallback(async (id: number, patch: Partial<Omit<ZoneDef, "id">>): Promise<boolean> => {
    setSaveState("saving");
    try {
      const { data } = await api.patch<{ ok: boolean; zone: ZoneDef }>(`/api/zone-defs/${id}`, patch);
      if (data?.zone) {
        setZones(prev => prev.map(z => z.id === id ? data.zone : z).sort((a, b) => a.cellId - b.cellId));
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("[useZoneDefs] updateZone 실패:", msg);
      setSaveState("error");
      setError(`저장 실패: ${msg}`);
      return false;
    }
  }, []);

  const addZone = useCallback(async (zone: Omit<ZoneDef, "id">): Promise<boolean> => {
    setSaveState("saving");
    try {
      const { data } = await api.post<{ ok: boolean; zone: ZoneDef }>("/api/zone-defs", zone);
      if (data?.zone) {
        setZones(prev => [...prev, data.zone].sort((a, b) => a.cellId - b.cellId));
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("[useZoneDefs] addZone 실패:", msg);
      setSaveState("error");
      setError(`추가 실패: ${msg}`);
      return false;
    }
  }, []);

  const deleteZone = useCallback(async (id: number): Promise<boolean> => {
    setSaveState("saving");
    try {
      await api.del(`/api/zone-defs/${id}`);
      setZones(prev => prev.filter(z => z.id !== id));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("[useZoneDefs] deleteZone 실패:", msg);
      setSaveState("error");
      setError(`삭제 실패: ${msg}`);
      return false;
    }
  }, []);

  return { zones, loading, error, reload, saveState, updateZone, addZone, deleteZone };
}

/** 특정 cellId zone 조회 */
export function findZoneByCellId(zones: ZoneDef[], cellId: number): ZoneDef | undefined {
  return zones.find(z => z.cellId === cellId);
}
