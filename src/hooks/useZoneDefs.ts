// src/hooks/useZoneDefs.ts
// 2026-08-30 · zone_defs 정식 DB 테이블 단일 소스 · KV 폴백 제거
//   · DB 스키마 v3 (2026-08-30b): id, zone, category, detailed_category, cell_id
//   · 하위호환 · 기존 소비처가 사용하던 ZoneDef (num, label, subA/B, description...) 형태로 변환 제공
//   · 신규 소비처는 zonesRaw (new shape · id, cellId, zone, category, detailedCategory) 사용
//   · 편집 · updateZoneByRowId (신규 · PATCH by id) + setZones/saveNow (하위호환 · legacy bulk)

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { api, ApiError } from "../lib/apiClient";
import { getErrorMessage } from "../lib/errorMessage";
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
  /** 2026-08-30 · 담당자 배지 · JSONB 배열 · AssigneePicker */
  assignee?: string[];
  /** 2026-09-02 · #74 · 창고 소속 (창고1/창고2/null) · zone_defs.warehouse 컬럼 */
  warehouse?: "창고1" | "창고2" | null;
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

/** 확장 · ZoneDef 에 DB row id + 담당자 + location 매핑 (편집 시 사용) */
export interface ZoneDefWithRowIds extends ZoneDef {
  __rowId?: number;
  __rowIdA?: number;
  __rowIdB?: number;
  __rowIdC?: number;
  __assignee?: string[];
  __assigneeA?: string[];
  __assigneeB?: string[];
  __assigneeC?: string[];
  /** 2026-08-30 · DB 원본 location 값 · 구역 코드 표시용 */
  __location?: string;
  __locationA?: string;
  __locationB?: string;
  __locationC?: string;
  /** 2026-08-30 · DB zone 컬럼 · 대분류 존 (중앙상비약존/상담존/뷰티식품존/카운터테마존) */
  __majorZone?: string;
  __majorZoneA?: string;
  __majorZoneB?: string;
  __majorZoneC?: string;
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
      __assignee: g.base?.assignee ?? [],
      __assigneeA: g.A?.assignee ?? [],
      __assigneeB: g.B?.assignee ?? [],
      __assigneeC: g.C?.assignee ?? [],
      __location: g.base?.location,
      __locationA: g.A?.location,
      __locationB: g.B?.location,
      __locationC: g.C?.location,
      __majorZone: g.base?.zone,
      __majorZoneA: g.A?.zone,
      __majorZoneB: g.B?.zone,
      __majorZoneC: g.C?.zone,
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
  // 2026-08-30 · 각 훅 인스턴스 고유 ID · CustomEvent detail.source 로 자기 자신 refetch 스킵
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2, 9));
  // 2026-08-30 · 이후 refetch (초기 로드 아님) 은 silent · loading 스피너 표시 안 함
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    // 초기 로드만 loading=true · 이후 refetch 는 silent (사용자 지시 · 로딩 스피너 방해)
    if (isInitialLoadRef.current) setLoading(true);
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
        const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "네트워크 오류");
        console.error("[useZoneDefs] /api/zone-defs 실패:", msg);
        setError(`매장구역 조회 실패: ${msg}`);
        setZonesRaw([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [reloadTick]);

  // 2026-08-30 · 사용자 지시 · 저장 즉시 좌측 매장구역도 반영
  //   · 다른 useZoneDefs 인스턴스가 편집 성공 시 broadcast → 이 인스턴스 refetch
  // 2026-08-31 · #63 · 사용자 리포트 · "매장구역편집 저장 → 매장구역도 자동 업데이트 X"
  //   · 이전: source 스킵 로직 · 자기 자신은 refetch 안 함 (setZonesRaw 로 로컬 갱신 됨)
  //   · 문제: 부모 (DisplayPage) 훅 인스턴스가 자식 (ZoneEditPanel) 이 dispatch 한 이벤트를 받아도
  //           탭 전환 (zoneEdit → map) 시점에 이미 zonesRaw 는 갱신 되어 있어야 하는데 · 미갱신 리포트
  //   · 수정: source 스킵 제거 · 모든 인스턴스 항상 refetch · 안전성 우선 (미미한 중복 fetch 감내)
  //           자기 자신도 refetch → server round-trip 으로 DB 반영값 재확인 · 일관성 보장
  useEffect(() => {
    const onUpdate = () => {
      setReloadTick(t => t + 1);
    };
    window.addEventListener("zone-defs-updated", onUpdate as EventListener);
    return () => window.removeEventListener("zone-defs-updated", onUpdate as EventListener);
  }, []);

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
      // 2026-08-30 · 다른 useZoneDefs 인스턴스 (좌측 매장구역도) 실시간 반영 · 자기 자신 제외
      try { window.dispatchEvent(new CustomEvent("zone-defs-updated", { detail: { source: instanceIdRef.current } })); } catch {}
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
        // 2026-08-30 · 다른 useZoneDefs 인스턴스 (좌측 매장구역도) 실시간 반영 · 자기 자신 제외
        try { window.dispatchEvent(new CustomEvent("zone-defs-updated", { detail: { id: rawId, source: instanceIdRef.current } })); } catch {}
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
