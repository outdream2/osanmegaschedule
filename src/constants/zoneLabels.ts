// src/constants/zoneLabels.ts
// 매장 구역 라벨 매핑 · 2026-07-31
//
// A단계(파일 매핑) + B단계(서버 DB 매핑) 하이브리드:
//   - 초기 렌더: 파일 기본값 (DEFAULT_MAPPINGS) 즉시 사용 · 첫 페인트 빠름
//   - mount 후: /api/zone-labels 서버 fetch → 매핑 override → "zone-labels-changed" 이벤트 발행
//   - 관리 UI 저장 시: PUT /api/zone-labels → 이벤트 발행 → 다른 페이지 자동 refresh
//
// DB(real_map) · 배정 로직 · 매핑 등은 원본 zone id 사용 → 안전.

export interface ZoneMapping {
  /** UI 표시 번호 (1~60) */
  number: number;
  /** 내부 원본 zone id · DB/로직에서 사용 (수정 금지) */
  zoneId: string;
  /** 선택적 · UI 상 표시할 부제 (없으면 storeMapLayout ZONE_DEFS 참조) */
  subLabel?: string;
}

// ─────────────────────────────────────────────────────────────
// 기본 매핑 · 파일 기반 fallback · 서버 응답 없을 때 사용
// ─────────────────────────────────────────────────────────────
export const DEFAULT_MAPPINGS: ZoneMapping[] = [
  // 진열대 (1~8 pair) · 1~16
  { number: 1,  zoneId: "1A" }, { number: 2,  zoneId: "1B" },
  { number: 3,  zoneId: "2A" }, { number: 4,  zoneId: "2B" },
  { number: 5,  zoneId: "3A" }, { number: 6,  zoneId: "3B" },
  { number: 7,  zoneId: "4A" }, { number: 8,  zoneId: "4B" },
  { number: 9,  zoneId: "5A" }, { number: 10, zoneId: "5B" },
  { number: 11, zoneId: "6A" }, { number: 12, zoneId: "6B" },
  { number: 13, zoneId: "7A" }, { number: 14, zoneId: "7B" },
  { number: 15, zoneId: "8A" }, { number: 16, zoneId: "8B" },
  // 상단 벽면 (9~21) · 17~29
  { number: 17, zoneId: "9"  }, { number: 18, zoneId: "10" },
  { number: 19, zoneId: "11" }, { number: 20, zoneId: "12" },
  { number: 21, zoneId: "13" }, { number: 22, zoneId: "14" },
  { number: 23, zoneId: "15" }, { number: 24, zoneId: "16" },
  { number: 25, zoneId: "17" }, { number: 26, zoneId: "18" },
  { number: 27, zoneId: "19" }, { number: 28, zoneId: "20" },
  { number: 29, zoneId: "21" },
  // 중앙 (22) · 30
  { number: 30, zoneId: "22" },
  // 하단 벽면 (23~34) · 31~42
  { number: 31, zoneId: "23" }, { number: 32, zoneId: "24" },
  { number: 33, zoneId: "25" }, { number: 34, zoneId: "26" },
  { number: 35, zoneId: "27" }, { number: 36, zoneId: "28" },
  { number: 37, zoneId: "29" }, { number: 38, zoneId: "30" },
  { number: 39, zoneId: "31" }, { number: 40, zoneId: "32" },
  { number: 41, zoneId: "33" }, { number: 42, zoneId: "34" },
  // 수직윙 (35~42) · 43~50
  { number: 43, zoneId: "35" }, { number: 44, zoneId: "36" },
  { number: 45, zoneId: "37" }, { number: 46, zoneId: "38" },
  { number: 47, zoneId: "39" }, { number: 48, zoneId: "40" },
  { number: 49, zoneId: "41" }, { number: 50, zoneId: "42" },
];

// ─────────────────────────────────────────────────────────────
// 활성 매핑 (mutable) · 서버 응답으로 override
// ─────────────────────────────────────────────────────────────
let _activeMappings: ZoneMapping[] = [...DEFAULT_MAPPINGS];
let _labelMap: Record<string, string> = buildLabelMap(_activeMappings);
let _numberToZone: Record<string, string> = buildNumberMap(_activeMappings);
let _subLabelMap: Record<string, string> = buildSubLabelMap(_activeMappings);
let _serverLoaded = false;
let _loadPromise: Promise<void> | null = null;

function buildLabelMap(list: ZoneMapping[]): Record<string, string> {
  return Object.fromEntries(list.map(m => [m.zoneId, String(m.number)]));
}
function buildNumberMap(list: ZoneMapping[]): Record<string, string> {
  return Object.fromEntries(list.map(m => [String(m.number), m.zoneId]));
}
function buildSubLabelMap(list: ZoneMapping[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const it of list) if (it.subLabel) m[it.zoneId] = it.subLabel;
  return m;
}

/** 매핑 교체 · 서버 fetch 이후 · 편집 저장 이후 호출 */
export function setZoneMappings(list: ZoneMapping[]): void {
  _activeMappings = [...list].sort((a, b) => a.number - b.number);
  _labelMap = buildLabelMap(_activeMappings);
  _numberToZone = buildNumberMap(_activeMappings);
  _subLabelMap = buildSubLabelMap(_activeMappings);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zone-labels-changed"));
  }
}

/** 현재 활성 매핑 반환 (관리 UI 편집용) */
export function getZoneMappings(): ZoneMapping[] {
  return [..._activeMappings];
}

/** 서버 매핑 로드 · 앱 mount 시 1회 · 이후 편집 저장 후 강제 refresh 가능 */
export async function loadZoneLabelsFromServer(force = false): Promise<void> {
  if (_serverLoaded && !force) return;
  if (_loadPromise && !force) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const res = await fetch("/api/zone-labels");
      if (!res.ok) return;
      const j = await res.json();
      const rows: Array<{ zone_id: string; number: number; sub_label?: string | null }> =
        Array.isArray(j?.mappings) ? j.mappings : [];
      if (rows.length === 0) return;
      const list: ZoneMapping[] = rows.map(r => ({
        zoneId: String(r.zone_id).trim(),
        number: Number(r.number),
        subLabel: r.sub_label ? String(r.sub_label).trim() : undefined,
      })).filter(m => m.zoneId && m.number > 0);
      setZoneMappings(list);
      _serverLoaded = true;
    } catch { /* 파일 fallback 사용 · silent */ }
    finally { _loadPromise = null; }
  })();
  return _loadPromise;
}

/**
 * zone id 를 UI 표시 라벨(번호)로 변환.
 * 매핑 없으면 원본 id 그대로 반환 (안전 fallback).
 */
export function getZoneLabel(zoneId: string | number | null | undefined): string {
  if (zoneId === null || zoneId === undefined) return "";
  const key = String(zoneId).trim();
  if (!key) return "";
  return _labelMap[key] ?? key;
}

/** UI 번호로 원본 zone id 조회 (역방향) */
export function getZoneIdByNumber(num: number | string | null | undefined): string | null {
  if (num === null || num === undefined) return null;
  return _numberToZone[String(num)] ?? null;
}

/** zone id 의 부제 라벨 (선택적 · 없으면 빈 문자열) */
export function getZoneSubLabel(zoneId: string | number | null | undefined): string {
  if (zoneId === null || zoneId === undefined) return "";
  const key = String(zoneId).trim();
  return _subLabelMap[key] ?? "";
}

// 하위 호환 · 옛 코드에서 ZONE_LABEL_MAP · ZONE_MAPPINGS 참조하던 경우 대응
export const ZONE_LABEL_MAP: Record<string, string> = new Proxy(_labelMap, {
  get: (_t, k) => _labelMap[k as string],
  ownKeys: () => Object.keys(_labelMap),
  getOwnPropertyDescriptor: (_t, k) =>
    Object.prototype.hasOwnProperty.call(_labelMap, k)
      ? { enumerable: true, configurable: true, value: _labelMap[k as string] }
      : undefined,
});
export const ZONE_MAPPINGS = DEFAULT_MAPPINGS; // deprecated · 편집은 getZoneMappings() / setZoneMappings() 사용
