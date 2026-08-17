// 2026-08-17 · 사용자 지시 · 매장 구역 프레임워크화
//   · 공통 훅 · 모든 구역 소비자 (ZoneAssignTab · DisplayPage · StoreZoneMap 등) 통일
//   · useKvSetting 활용 · settings 테이블 key="zone_defs" · label/category/description 편집 + DB 저장
//   · 기존 constants/displayZones.ts ZONE_DEFS 를 defaultValue 로 · 서버 값 없을 때 fallback
//   · 확장 (Phase 2) · 1~100 번 지원 · A/B/C split · 매장구역도 매핑 유지
import { useCallback } from "react";
import { ZONE_DEFS, SECTION_LABEL, type ZoneDef, type ZoneSection } from "../constants/displayZones";
import { useKvSetting } from "./useKvSetting";

export type { ZoneDef, ZoneSection };
export { SECTION_LABEL };

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
    .sort((a, b) => a.num - b.num);
  return cleaned.length > 0 ? cleaned : null;
}

/** 매장 구역 정의 훅 · 모든 소비자 통일 · settings.zone_defs 서버 저장 · 편집 · fallback */
export function useZoneDefs(): {
  zones: ZoneDef[];
  setZones: (next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => void;
  loading: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  saveNow: () => Promise<boolean>;
} {
  const { value, setValue, loaded, saveState, saveNow } = useKvSetting<ZoneDef[]>({
    key: "zone_defs",
    defaultValue: ZONE_DEFS,
    sanitize,
  });
  const setZones = useCallback((next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => {
    setValue(next);
  }, [setValue]);
  return { zones: value, setZones, loading: !loaded, saveState, saveNow };
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
