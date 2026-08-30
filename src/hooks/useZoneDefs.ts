// src/hooks/useZoneDefs.ts
// 2026-08-30 · zone_defs 정식 DB 테이블 단일 소스 · KV 폴백 제거
//   · DB 스키마 v3 (2026-08-30b): id, zone, category, detailed_category, cell_id
//   · 하위호환 · 기존 소비처가 사용하던 ZoneDef (num, label, subA/B, description...) 형태로 변환 제공
//   · 신규 소비처는 zonesRaw (new shape · id, cellId, zone, category, detailedCategory) 사용
//   · 편집 · updateZoneByRowId (신규 · PATCH by id) + setZones/saveNow (하위호환 · legacy bulk)

import { useCallback, useEffect, useState, useMemo } from "react";
import { api, ApiError } from "../lib/apiClient";
import { SECTION_LABEL, type ZoneDef, type ZoneSection } from "../constants/displayZones";

export type { ZoneDef, ZoneSection };
export { SECTION_LABEL };

/** DB 새 스키마 row · 응답 형태 (rowToDto 결과)
 *  2026-08-30 · 사용자 지시 · location 추가 (products.location 매칭 · short 코드)
 *  · zone · category · optional (DB NOT NULL 제거) · UI 에서 4대 존 자동 분류 or 사용자 편집
 */
export interface ZoneDefRaw {
  id: number;
  cellId: number;
  location?: string;
  zone?: string;
  category?: string;
  detailedCategory?: string;
}

/** 2026-08-30 · location (예: "1A", "22", "35") 에서 num/side/section 파생 */
export function parseLocation(loc: string | null | undefined): { num: number; side: "A" | "B" | "C" | null; section: ZoneSection } | null {
  const s = String(loc ?? "").trim().toUpperCase();
  if (!s) return null;
  // 1A · 1B · 8A · 8B
  const mPair = /^([1-8])([ABC])$/.exec(s);
  if (mPair) {
    return { num: Number(mPair[1]), side: mPair[2] as "A" | "B" | "C", section: "aisle" };
  }
  // 22 · 진열대 22 단독
  if (s === "22") return { num: 22, side: null, section: "aisle" };
  // 숫자만 · 벽면 or wing
  const mNum = /^(\d+)$/.exec(s);
  if (mNum) {
    const num = Number(mNum[1]);
    let section: ZoneSection = "top_wall";
    if (num >= 23 && num <= 34) section = "bottom_wall";
    else if (num >= 35 && num <= 46) section = "wing";
    return { num, side: null, section };
  }
  return null;
}

/** 2026-08-30 · location 에서 4대 존 (major zone) 자동 분류
 *  중앙상비약존: 1A~8B · 22
 *  상담존: 9~21 · 23~27
 *  뷰티식품존: 28~40
 *  카운터테마존: 41~46
 */
export function classifyMajorZone(loc: string | null | undefined): "중앙상비약존" | "상담존" | "뷰티식품존" | "카운터테마존" | "(미분류)" {
  const s = String(loc ?? "").trim().toUpperCase();
  if (!s) return "(미분류)";
  if (/^([1-8])[AB]$/.test(s) || s === "22") return "중앙상비약존";
  const mNum = /^(\d+)$/.exec(s);
  if (mNum) {
    const num = Number(mNum[1]);
    if (num >= 9 && num <= 21) return "상담존";
    if (num >= 23 && num <= 27) return "상담존";
    if (num >= 28 && num <= 40) return "뷰티식품존";
    if (num >= 41 && num <= 46) return "카운터테마존";
  }
  return "(미분류)";
}

/** 확장 · ZoneDef 에 DB row id 매핑 (편집 시 사용) */
interface ZoneDefWithRowIds extends ZoneDef {
  __rowId?: number;
  __rowIdA?: number;
  __rowIdB?: number;
  __rowIdC?: number;
}

// 벽면 라벨 · 미니 매핑 (wing 셀 · 라벨 → num 복원)
const WING_LABEL_TO_NUM: Record<string, number> = {
  "프로모션": 36,
  "기능성화장품": 37,
  "조제실": 38,
  "화장실": 39,
  "계산대": 40,
  "정수기": 41,
  "이벤트존": 42,
};

/** 새 스키마 zone 라벨 파싱 · 하위 num/side 복원 */
function parseZone(zoneLabel: string): { num: number; side: "A" | "B" | "C" | null; section: ZoneSection } | null {
  const s = String(zoneLabel ?? "").trim();
  if (!s) return null;
  // 진열대 1A · 진열대 1B · 진열대 22
  const mAisle = /^진열대\s+(\d+)([ABC]?)$/.exec(s);
  if (mAisle) {
    const num = Number(mAisle[1]);
    const side = (mAisle[2] || null) as "A" | "B" | "C" | null;
    return { num, side, section: "aisle" };
  }
  // 벽면 9 · 벽면 21 · 벽면 23 · 벽면 34 · 벽면 35
  const mWall = /^벽면\s+(\d+)$/.exec(s);
  if (mWall) {
    const num = Number(mWall[1]);
    const section: ZoneSection = num >= 23 && num <= 34 ? "bottom_wall" : "top_wall";
    return { num, side: null, section };
  }
  // wing 라벨 · 프로모션·기능성화장품·조제실 등 (36-42)
  if (WING_LABEL_TO_NUM[s] != null) {
    const num = WING_LABEL_TO_NUM[s];
    return { num, side: null, section: num === 42 ? "event" : "wing" };
  }
  // 카운터테마 43·44·45·46
  const mCounter = /^카운터테마\s+(\d+)$/.exec(s);
  if (mCounter) {
    const num = Number(mCounter[1]);
    return { num, side: null, section: "wing" };
  }
  return null;
}

/** raw DB 배열 → 하위호환 ZoneDef[] (num·label·subA/B 병합)
 *  2026-08-30 · 사용자 지시 · location 우선 파싱 · zone (label) 폴백
 */
function transformToLegacy(raws: ZoneDefRaw[]): ZoneDefWithRowIds[] {
  const grouped = new Map<number, {
    section: ZoneSection;
    base?: ZoneDefRaw;
    A?: ZoneDefRaw;
    B?: ZoneDefRaw;
    C?: ZoneDefRaw;
  }>();
  for (const r of raws) {
    // location 우선 · 없으면 zone 라벨 폴백
    const p = parseLocation(r.location) ?? parseZone(r.zone ?? "");
    if (!p) continue;
    if (!grouped.has(p.num)) grouped.set(p.num, { section: p.section });
    const g = grouped.get(p.num)!;
    if (p.side === "A") g.A = r;
    else if (p.side === "B") g.B = r;
    else if (p.side === "C") g.C = r;
    else g.base = r;
  }
  const result: ZoneDefWithRowIds[] = [];
  for (const [num, g] of grouped) {
    const primary = g.base ?? g.A ?? g.B ?? g.C;
    if (!primary) continue;
    const zone: ZoneDefWithRowIds = {
      num,
      label: g.base?.zone ?? (g.A?.zone ? g.A.zone.replace(/\s*A$/, "") : g.B?.zone ? g.B.zone.replace(/\s*B$/, "") : (primary.zone ?? primary.location ?? String(num))),
      category: g.base?.category ?? primary.category ?? "",
      section: g.section,
      subA: g.A?.category,
      subB: g.B?.category,
      subC: g.C?.category,
      description: g.base?.detailedCategory,
      descriptionA: g.A?.detailedCategory,
      descriptionB: g.B?.detailedCategory,
      descriptionC: g.C?.detailedCategory,
      __rowId: g.base?.id,
      __rowIdA: g.A?.id,
      __rowIdB: g.B?.id,
      __rowIdC: g.C?.id,
    };
    result.push(zone);
  }
  return result.sort((a, b) => a.num - b.num);
}

/**
 * useZoneDefs · 매장구역도·매장구역편집 공용
 *   · DB 단일 소스 · KV 폴백 없음 · 실패 시 error 상태
 *   · zones · 하위호환 ZoneDef[] (num·label·subA/B) · 기존 소비처 유지
 *   · zonesRaw · 새 스키마 ZoneDefRaw[] (id·cellId·zone) · 신규 소비처용
 *   · setZones/saveNow · 하위호환 API · 내부에서 rowId 기반 PATCH/POST 호출
 */
export function useZoneDefs(): {
  zones: ZoneDefWithRowIds[];
  zonesRaw: ZoneDefRaw[];
  loading: boolean;
  error: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  reload: () => void;
  setZones: (next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => void;
  saveNow: () => Promise<boolean>;
  updateZoneRaw: (rawId: number, patch: Partial<Omit<ZoneDefRaw, "id">>) => Promise<boolean>;
} {
  const [zonesRaw, setZonesRaw] = useState<ZoneDefRaw[]>([]);
  const [dirtyZones, setDirtyZones] = useState<ZoneDefWithRowIds[] | null>(null);
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
        const { data } = await api.get<{ zones: ZoneDefRaw[]; count?: number }>("/api/zone-defs");
        if (cancelled) return;
        const clean = Array.isArray(data?.zones) ? data.zones.filter(z => z && typeof z.id === "number" && typeof z.cellId === "number") : [];
        setZonesRaw(clean);
        if (clean.length === 0) {
          setError("zone_defs 테이블에 데이터가 없습니다.");
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        console.error("[useZoneDefs] /api/zone-defs 실패:", msg);
        setError(`매장구역 조회 실패: ${msg}`);
        setZonesRaw([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadTick]);

  // 하위호환 zones · dirty 편집 중이면 dirty · 아니면 raw 에서 변환
  const zones = useMemo<ZoneDefWithRowIds[]>(() => {
    if (dirtyZones) return dirtyZones;
    return transformToLegacy(zonesRaw);
  }, [zonesRaw, dirtyZones]);

  const setZones = useCallback((next: ZoneDef[] | ((prev: ZoneDef[]) => ZoneDef[])) => {
    setDirtyZones(prev => {
      const base = prev ?? transformToLegacy(zonesRaw);
      const val = typeof next === "function" ? (next as any)(base) : next;
      return val as ZoneDefWithRowIds[];
    });
  }, [zonesRaw]);

  const reload = useCallback(() => {
    setDirtyZones(null);
    setReloadTick(t => t + 1);
  }, []);

  // 하위호환 saveNow · dirty zones 를 raw 로 역변환 후 · 각 row 별 PATCH
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!dirtyZones) return true;
    setSaveState("saving");
    try {
      const patches: Array<{ id: number; body: Partial<Omit<ZoneDefRaw, "id">> }> = [];
      for (const z of dirtyZones) {
        const zz = z as ZoneDefWithRowIds;
        // base row (subA/B 없거나 · aisle 22 · wall · wing)
        if (zz.__rowId) {
          patches.push({
            id: zz.__rowId,
            body: {
              zone: zz.label,
              category: zz.category,
              detailedCategory: zz.description,
            },
          });
        }
        // A / B / C 서브 row
        if (zz.__rowIdA) patches.push({ id: zz.__rowIdA, body: { category: zz.subA ?? "", detailedCategory: zz.descriptionA } });
        if (zz.__rowIdB) patches.push({ id: zz.__rowIdB, body: { category: zz.subB ?? "", detailedCategory: zz.descriptionB } });
        if (zz.__rowIdC) patches.push({ id: zz.__rowIdC, body: { category: zz.subC ?? "", detailedCategory: zz.descriptionC } });
      }
      // 병렬 PATCH
      const results = await Promise.allSettled(
        patches.map(p => api.patch<{ ok: boolean; zone: ZoneDefRaw }>(`/api/zone-defs/${p.id}`, p.body))
      );
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed}개 저장 실패`);
      // 갱신된 zonesRaw · reload 로 리페치
      setDirtyZones(null);
      setReloadTick(t => t + 1);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("[useZoneDefs] saveNow 실패:", msg);
      setSaveState("error");
      setError(`저장 실패: ${msg}`);
      return false;
    }
  }, [dirtyZones]);

  const updateZoneRaw = useCallback(async (rawId: number, patch: Partial<Omit<ZoneDefRaw, "id">>): Promise<boolean> => {
    setSaveState("saving");
    try {
      const { data } = await api.patch<{ ok: boolean; zone: ZoneDefRaw }>(`/api/zone-defs/${rawId}`, patch);
      if (data?.zone) {
        setZonesRaw(prev => prev.map(z => z.id === rawId ? data.zone : z));
        setDirtyZones(null); // 저장 후 · dirty 해제
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      console.error("[useZoneDefs] updateZoneRaw 실패:", msg);
      setSaveState("error");
      setError(`저장 실패: ${msg}`);
      return false;
    }
  }, []);

  return { zones, zonesRaw, loading, error, saveState, reload, setZones, saveNow, updateZoneRaw };
}

/** 특정 zone num 조회 · 하위호환 */
export function findZone(zones: ZoneDef[], num: number): ZoneDef | undefined {
  return zones.find(z => z.num === num);
}

/** section 기준 그룹핑 · 하위호환 */
export function groupZonesBySection(zones: ZoneDef[]): Record<ZoneSection, ZoneDef[]> {
  const map: Record<ZoneSection, ZoneDef[]> = {
    top_wall: [], aisle: [], left_wall: [], bottom_wall: [], wing: [], event: [],
  };
  for (const z of zones) map[z.section].push(z);
  return map;
}
