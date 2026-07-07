// src/constants/displayZones.ts
// Shared zone definitions — used by both DisplayPage and SchedulePage (logistics zone assignment)
//
// ── 매장 수평윙 배치 (2026 개편) ────────────────────────────
// [상단 벽면]  21 20 19 18 17 16 15 14 13 12 11 10  9     (좌→우 감소)
// [중앙 진열대] 22 · 8B|8A · 7B|7A · ... · 2B|2A · 1B|1A  (좌측 22, 각 진열대 B좌 A우)
// [하단 벽면]  23 24 25 26 27 28 29 30 31 32 33 34        (좌→우 증가)
// [수직윙]     35 냉장의약품 · 36 프로모션 · 37 기능성화장품 · 38 조제실 ·
//              39 화장실 · 40 계산대 · 41 정수기 · 42 이벤트존

export type ZoneSection = "aisle" | "bottom_wall" | "top_wall" | "left_wall" | "wing" | "event";

export interface ZoneDef {
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
  /** aisle 1-8 좌측면 카테고리 (B side) */
  subB?: string;
  /** aisle 1-8 우측면 카테고리 (A side) */
  subA?: string;
  /** 3분할 서브존 (계산대 40 등) — subA/subB/subC 모두 있으면 3-way split */
  subC?: string;
}

export const ZONE_DEFS: ZoneDef[] = [
  // ── 중앙 진열대 (aisle) — 1~8 각 A/B 서브존, 22는 최상단 단독 ────────────
  { num: 22, label: "진열대 22", category: "의료기기·냉각시트·찜질기", section: "aisle" },
  {
    num: 8, label: "진열대 8",
    category: "칫솔·치약·구강용품 / 반창고·거즈·붕대·마스크",
    subB: "반창고·거즈·붕대·마스크",
    subA: "칫솔·치약·구강용품",
    section: "aisle",
  },
  {
    num: 7, label: "진열대 7",
    category: "파스 / 보호대·벌레기피제·살충제",
    subB: "보호대·벌레기피제·살충제",
    subA: "파스",
    section: "aisle",
  },
  {
    num: 6, label: "진열대 6",
    category: "여성용품·미용·립밤 / 남성용품·금연·모발",
    subB: "남성용품·금연·모발",
    subA: "여성용품·미용·립밤",
    section: "aisle",
  },
  {
    num: 5, label: "진열대 5",
    category: "구내염 연고·피부·무좀·와상·멍·외용제 / 피부관련제품·다한증·여드름·기미",
    subB: "피부관련제품·다한증·여드름·기미",
    subA: "구내염 연고·피부·무좀·와상·멍·외용제",
    section: "aisle",
  },
  {
    num: 4, label: "진열대 4",
    category: "멀미약·구충제·다래끼·염증약 / 경옥고·공진단·우황청심원",
    subB: "경옥고·공진단·우황청심원",
    subA: "멀미약·구충제·다래끼·염증약",
    section: "aisle",
  },
  {
    num: 3, label: "진열대 3",
    category: "변비약·치질약·붓기·수면유도제 / 해열진통제·다래끼·염증약·안약",
    subB: "해열진통제·다래끼·염증약·안약",
    subA: "변비약·치질약·붓기·수면유도제",
    section: "aisle",
  },
  {
    num: 2, label: "진열대 2",
    category: "어린이감기약·키즈용품 / 소화제·지사제·위염·복통",
    subB: "소화제·지사제·위염·복통",
    subA: "어린이감기약·키즈용품",
    section: "aisle",
  },
  {
    num: 1, label: "진열대 1",
    category: "종합감기·목감기·트로키·목스프레이·코감기·비강스프레이 / 기침·가래·알러지·안약·한방감기약",
    subB: "기침·가래·알러지·안약·한방감기약",
    subA: "종합감기·목감기·트로키·목스프레이·코감기·비강스프레이",
    section: "aisle",
  },

  // ── 상단 벽면 (top_wall) 21→9 좌→우 감소 ─────────────────────────────
  { num: 21, label: "벽면 21", category: "콜라겐",              section: "top_wall" },
  { num: 20, label: "벽면 20", category: "비타민C",             section: "top_wall" },
  { num: 19, label: "벽면 19", category: "철분제",              section: "top_wall" },
  { num: 18, label: "벽면 18", category: "임산부·갱년기영양제",   section: "top_wall" },
  { num: 17, label: "벽면 17", category: "잇몸건강",            section: "top_wall" },
  { num: 16, label: "벽면 16", category: "혈액순환·혈당개선",    section: "top_wall" },
  { num: 15, label: "벽면 15", category: "뇌기능개선",          section: "top_wall" },
  { num: 14, label: "벽면 14", category: "눈영양제",            section: "top_wall" },
  { num: 13, label: "벽면 13", category: "ORS·부스터",         section: "top_wall" },
  { num: 12, label: "벽면 12", category: "아르기닌",            section: "top_wall" },
  { num: 11, label: "벽면 11", category: "알부민·아미노산",      section: "top_wall" },
  { num: 10, label: "벽면 10", category: "간기능개선제",        section: "top_wall" },
  { num: 9,  label: "벽면 9",  category: "종합비타민",          section: "top_wall" },

  // ── 하단 벽면 (bottom_wall) 23→34 좌→우 증가 ─────────────────────────
  { num: 23, label: "벽면 23", category: "동물의약품",           section: "bottom_wall" },
  { num: 24, label: "벽면 24", category: "마그네슘·수면",        section: "bottom_wall" },
  { num: 25, label: "벽면 25", category: "탈모·전립선",         section: "bottom_wall" },
  { num: 26, label: "벽면 26", category: "화장품",              section: "bottom_wall" },
  { num: 27, label: "벽면 27", category: "항산화제",            section: "bottom_wall" },
  { num: 28, label: "벽면 28", category: "칼슘·비타민",         section: "bottom_wall" },
  { num: 29, label: "벽면 29", category: "콘드로이친·MSM",      section: "bottom_wall" },
  { num: 30, label: "벽면 30", category: "오메가3",             section: "bottom_wall" },
  { num: 31, label: "벽면 31", category: "유산균",              section: "bottom_wall" },
  { num: 32, label: "벽면 32", category: "어린이영양제",        section: "bottom_wall" },
  { num: 33, label: "벽면 33", category: "면역증강",            section: "bottom_wall" },
  { num: 34, label: "벽면 34", category: "한방제품",            section: "bottom_wall" },

  // ── 수직윙 (기존 유지, 35~42) ─────────────────────────────
  { num: 35, label: "벽면 35",     category: "냉장의약품",          section: "top_wall" },
  { num: 36, label: "프로모션",    category: "프로모션·이벤트 상품", section: "wing" },
  { num: 37, label: "기능성화장품", category: "기능성화장품·미용",   section: "wing" },
  { num: 38, label: "조제실",      category: "조제실 (약사 전용)",  section: "wing" },
  { num: 39, label: "화장실",      category: "(시설)",             section: "wing" },
  {
    num: 40, label: "계산대", category: "계산대 (POS) · 3구역",
    subA: "카운터 1",
    subB: "카운터 2",
    subC: "카운터 3",
    section: "wing",
  },
  { num: 41, label: "정수기",      category: "(시설)",             section: "wing" },
  { num: 42, label: "이벤트존",    category: "이벤트·프로모션 상품", section: "event" },
];

/**
 * 진열대 aisle 좌우 서브존 라벨 조회 유틸.
 * - "1번 진열대 1A" 형식의 저장값과 하위 호환.
 * - side가 없거나 알 수 없는 값은 zone.category (통합 카테고리) 반환.
 */
export function getZoneCategoryBySide(zone: ZoneDef, side?: "A" | "B" | null): string {
  if (side === "A" && zone.subA) return zone.subA;
  if (side === "B" && zone.subB) return zone.subB;
  return zone.category;
}

/**
 * 저장값에서 aisle 서브존 (A/B) 추출.
 * "1번 진열대 1A" → { num: 1, side: "A" }
 * "1번 진열대 1"  → { num: 1, side: null }  (레거시)
 * 파싱 실패 시 null 반환.
 */
export function parseRealMapValue(v: string | null | undefined): { num: number; side: "A" | "B" | null } | null {
  if (!v) return null;
  const m = /^(\d+)번\s*.*?([AB])?$/.exec(String(v).trim());
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const side = (m[2] === "A" || m[2] === "B") ? m[2] : null;
  return { num, side };
}

// v4: 계산대 40 3-way 분할 (40A/40B/40C 추가) — 옛 v3 캐시 자동 폐기
export const ZONES_STORAGE_KEY = "megatown_display_zones_v4";

export const SECTION_LABEL: Record<ZoneSection, string> = {
  top_wall: "상단 벽면",
  aisle: "중앙 진열대",
  left_wall: "좌측 벽면",
  bottom_wall: "하단 벽면",
  wing: "우측 윙",
  event: "이벤트존",
};
