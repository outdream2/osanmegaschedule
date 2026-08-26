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

// 2026-08-26 · 사용자 지시 · 기본 서브 존재 zone 매핑 (num → hasA/B/C)
//   · 이전 저장에서 undefined 로 지워진 subA/subB/subC 복원용
//   · DEFAULT ZONE_DEFS 로 부터 자동 계산
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
    // 2026-08-26 · description + 서브존별 descriptionA/B/C · optional string
    // 2026-08-26 · 서브존 구조 · DEFAULT 기준 엄격 준수
    //   · DEFAULT 에 서브 있는 zone (aisle 1-8) · 저장값 없으면 "" 로 복원 · 있으면 유지
    //   · DEFAULT 에 서브 없는 zone (num=40 계산대 등) · 저장값 있어도 strip · 단일 구역 유지
    //   · DEFAULT 에 없는 unknown num · 저장값 그대로 통과
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
