// 2026-08-17 · 사용자 지시 · 매장 구역 프레임워크화
// 2026-08-30 · 사용자 지시 · KV blob → 정식 DB 테이블 (zone_defs) 이관
//   · 기본 · GET/PUT /api/zone-defs (정식 테이블) 사용
//   · 폴백 · 테이블 미존재 (_missing:true) 시 · settings.zone_defs KV 사용 (하위호환)
//   · 최종 폴백 · code ZONE_DEFS 기본값
//   · 원본 테이블 대원칙 준수 · JSON blob 지양

import { useCallback, useEffect, useState } from "react";
import { ZONE_DEFS, SECTION_LABEL, type ZoneDef, type ZoneSection } from "../constants/displayZones";
import { useKvSetting } from "./useKvSetting";
import { api, ApiError } from "../lib/apiClient";

export type { ZoneDef, ZoneSection };
export { SECTION_LABEL };

// 2026-08-26 · 사용자 지시 · 기본 서브 존재 zone 매핑 (num → hasA/B/C)
const DEFAULT_SUB_PRESENCE: Map<number, { hasA: boolean; hasB: boolean; hasC: boolean }> = (() => {
  const m = new Map<number, { hasA: boolean; hasB: boolean; hasC: boolean }>();
  for (const z of ZONE_DEFS) {
    m.set(z.num, { hasA: !!z.subA, hasB: !!z.subB, hasC: !!z.subC });
  }
  return m;
})();

function sanitize(raw: unknown): ZoneDef[] | null {
  if (!Array.isArray(raw)) return null;
  const validSections: ZoneSection[] = ["top_wall", "aisle", "left_wall", "bottom_wall", "wing", "event"];
  const cleaned = raw
    .filter((z): z is ZoneDef => {
      if (!z || typeof z !== "object") return false;
      const zone = z as Partial<ZoneDef>;
      return (
        typeof zone.num === "number" &&
        typeof zone.label === "string" &&
        typeof zone.category === "string" &&
        typeof zone.section === "string" &&
        validSections.includes(zone.section as ZoneSection)
      );
    })
    .map((z) => {
      const anyZ = z as any;
      const defaults = DEFAULT_SUB_PRESENCE.get(z.num);
      const useDefault = defaults !== undefined;
      const hasSubA = useDefault ? defaults!.hasA : typeof anyZ.subA === "string";
      const hasSubB = useDefault ? defaults!.hasB : typeof anyZ.subB === "string";
      const hasSubC = useDefault ? defaults!.hasC : typeof anyZ.subC === "string";
      return {
        ...z,
        subA: hasSubA ? (typeof anyZ.subA === "string" ? anyZ.subA : "") : undefined,
        subB: hasSubB ? (typeof anyZ.subB === "string" ? anyZ.subB : "") : undefined,
        subC: hasSubC ? (typeof anyZ.subC === "string" ? anyZ.subC : "") : undefined,
        description:  typeof anyZ.description  === "string" ? anyZ.description  : undefined,
        descriptionA: hasSubA ? (typeof anyZ.descriptionA === "string" ? anyZ.descriptionA : undefined) : undefined,
        descriptionB: hasSubB ? (typeof anyZ.descriptionB === "string" ? anyZ.descriptionB : undefined) : undefined,
        descriptionC: hasSubC ? (typeof anyZ.descriptionC === "string" ? anyZ.descriptionC : undefined) : undefined,
      } as ZoneDef;
    })
    .sort((a, b) => a.num - b.num);
  return cleaned.length > 0 ? cleaned : null;
}

/** 매장 구역 정의 훅 · DB 테이블 우선 · KV 폴백 · code 최종 폴백 */
export function useZoneDefs(): {
  zones: ZoneDef[];
  setZones: (next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => void;
  loading: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  saveNow: () => Promise<boolean>;
  /** 2026-08-30 · 사용자 지시 · 신규 zone 추가 · DB POST · 성공 시 zones 갱신 */
  addZone: (zone: ZoneDef) => Promise<boolean>;
  /** 2026-08-30 · 사용자 지시 · zone 삭제 · DB DELETE · 성공 시 zones 갱신 */
  deleteZone: (num: number) => Promise<boolean>;
} {
  // KV 폴백 · 정식 테이블 미존재 시 사용 (하위호환)
  const {
    value: kvValue,
    setValue: setKvValue,
    loaded: kvLoaded,
    saveState: kvSaveState,
    saveNow: kvSaveNow,
  } = useKvSetting<ZoneDef[]>({
    key: "zone_defs",
    defaultValue: ZONE_DEFS,
    sanitize,
  });

  const [dbZones, setDbZones] = useState<ZoneDef[] | null>(null);
  const [dbMissing, setDbMissing] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // 초기 로드 · DB 우선
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ zones: ZoneDef[]; _missing?: boolean }>("/api/zone-defs");
        if (cancelled) return;
        if (data?._missing || !data?.zones || data.zones.length === 0) {
          // 테이블 미존재 or 빈 데이터 · KV 폴백
          setDbMissing(true);
          setDbLoaded(true);
          return;
        }
        const cleaned = sanitize(data.zones) ?? ZONE_DEFS;
        setDbZones(cleaned);
        setDbLoaded(true);
      } catch (e) {
        if (cancelled) return;
        // 네트워크·서버 오류 · KV 폴백
        console.warn("[useZoneDefs] /api/zone-defs 실패 · KV 폴백:", e instanceof ApiError ? e.message : e);
        setDbMissing(true);
        setDbLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 저장 · DB 있으면 PUT · 없으면 KV
  const zones = dbMissing ? kvValue : (dbZones ?? kvValue);
  const setZones = useCallback((next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => {
    if (dbMissing) {
      setKvValue(next);
      return;
    }
    setDbZones(prev => (typeof next === "function" ? (next as any)(prev ?? []) : next));
  }, [dbMissing, setKvValue]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (dbMissing) return kvSaveNow();
    if (!dbZones || dbZones.length === 0) return false;
    setSaveState("saving");
    try {
      await api.put("/api/zone-defs", { zones: dbZones });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      return true;
    } catch (e) {
      console.error("[useZoneDefs] PUT /api/zone-defs 실패:", e);
      setSaveState("error");
      return false;
    }
  }, [dbMissing, dbZones, kvSaveNow]);

  // 신규 zone 추가 · DB POST · 응답으로 즉시 갱신
  const addZone = useCallback(async (zone: ZoneDef): Promise<boolean> => {
    if (dbMissing) {
      // KV 폴백 모드 · 로컬 추가 후 저장
      setKvValue(prev => [...prev.filter(z => z.num !== zone.num), zone].sort((a, b) => a.num - b.num));
      const ok = await kvSaveNow();
      return ok;
    }
    try {
      const { data } = await api.post<{ ok: boolean; zone: ZoneDef }>("/api/zone-defs", zone);
      if (data?.zone) {
        setDbZones(prev => [...(prev ?? []).filter(z => z.num !== data.zone.num), data.zone].sort((a, b) => a.num - b.num));
      }
      return true;
    } catch (e) {
      console.error("[useZoneDefs] addZone 실패:", e);
      return false;
    }
  }, [dbMissing, setKvValue, kvSaveNow]);

  // zone 삭제 · DB DELETE · 성공 시 로컬 제거
  const deleteZone = useCallback(async (num: number): Promise<boolean> => {
    if (dbMissing) {
      setKvValue(prev => prev.filter(z => z.num !== num));
      const ok = await kvSaveNow();
      return ok;
    }
    try {
      await api.del(`/api/zone-defs/${num}`);
      setDbZones(prev => (prev ?? []).filter(z => z.num !== num));
      return true;
    } catch (e) {
      console.error("[useZoneDefs] deleteZone 실패:", e);
      return false;
    }
  }, [dbMissing, setKvValue, kvSaveNow]);

  const loading = dbMissing ? !kvLoaded : !dbLoaded;
  const effectiveSaveState = dbMissing ? kvSaveState : saveState;

  return { zones, setZones, loading, saveState: effectiveSaveState, saveNow, addZone, deleteZone };
}

/** 특정 zone num 조회 */
export function findZone(zones: ZoneDef[], num: number): ZoneDef | undefined {
  return zones.find(z => z.num === num);
}

/** section 기준 그룹핑 */
export function groupZonesBySection(zones: ZoneDef[]): Record<ZoneSection, ZoneDef[]> {
  const map: Record<ZoneSection, ZoneDef[]> = {
    top_wall: [], aisle: [], left_wall: [], bottom_wall: [], wing: [], event: [],
  };
  for (const z of zones) map[z.section].push(z);
  return map;
}
