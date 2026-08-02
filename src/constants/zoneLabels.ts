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
// 2026-08-03 · 사용자 요청 · 원본 zoneId (1A/1B/...) 그대로 표시 · 매핑 비움
// getZoneLabel · 매핑 없으면 원본 zoneId fallback 반환 → 1A · 1B · 9 등 그대로
// ─────────────────────────────────────────────────────────────
export const DEFAULT_MAPPINGS: ZoneMapping[] = [];

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
