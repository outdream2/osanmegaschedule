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
  /** 2026-08-26 · 사용자 지시 · 상세 설명 (긴 텍스트) · 매장구역도 셀 hover/click 표시 */
  description?: string;
}

export const ZONE_DEFS: ZoneDef[] = [
  // ── 중앙 진열대 (aisle) — 1~8 각 A/B 서브존, 22는 최상단 단독 ────────────
  // 2026-08-26 · zonecategory.png 반영 · 실제 매장 카테고리
  { num: 22, label: "진열대 22", category: "의료기기·냉각시트·찜질기", section: "aisle" },
  {
    num: 8, label: "진열대 8",
    category: "홍삼/인삼/녹용 · 경옥고/공진단/태반",
    subB: "홍삼·인삼·녹용·환·브랜드관",
    subA: "경옥고·공진단·태반·우황청심원·안정액·수면유도제",
    section: "aisle",
  },
  {
    num: 7, label: "진열대 7",
    category: "한방제제모음 · 질염/방광염/PMS/여성용품/금연",
    subB: "한방제제모음",
    subA: "질염·방광염·피임약·PMS·여성용품·금연·숙취해소품",
    section: "aisle",
  },
  {
    num: 6, label: "진열대 6",
    category: "피부관련제품 (미백·두피·티눈·취짓·모기기피제) · 연고 (상처/화상/멍/여드름/흉터)",
    subB: "피부관련제품 · 미백·두피·티눈·취짓·모기기피제",
    subA: "연고 · 상처·화상·멍·여드름·흉터·땀케어·보습",
    section: "aisle",
  },
  {
    num: 5, label: "진열대 5",
    category: "연고 (피부/구내염/무좀/진균) · 칫솔·치약·구강용품·가글·눈청결제·렌즈용품",
    subB: "연고 · 피부·구내염·무좀·진균",
    subA: "칫솔·치약·구강용품·가글·눈청결제·렌즈용품",
    section: "aisle",
  },
  {
    num: 4, label: "진열대 4",
    category: "해열진통소염·다래끼·염증약 · 치질약·붓기·허지정맥류·멀미약",
    subB: "해열진통소염제·다래끼·염증약",
    subA: "치질약·붓기·허지정맥류·멀미약",
    section: "aisle",
  },
  {
    num: 3, label: "진열대 3",
    category: "소화제·위염·복통·지사제·변비약·구충제 · 키즈소화제·키즈연고·키즈파스",
    subB: "소화제·위염·복통·지사제·변비약·구충제",
    subA: "키즈소화제·키즈연고·키즈파스·키즈용품",
    section: "aisle",
  },
  {
    num: 2, label: "진열대 2",
    category: "키즈종합감기약·키즈해열제·키즈알러지 · 한방감기약(대웅망)·비염·알러지",
    subB: "키즈종합감기약·키즈해열제·키즈알러지",
    subA: "한방감기약(대웅망)·비염·알러지",
    section: "aisle",
  },
  {
    num: 1, label: "진열대 1",
    category: "기침·가래·한방기침가래·코감기·한방코감기·비강세척 · 목감기·한방목감기·목캔디·인후스프레이·종합감기·면역증강",
    subB: "기침·가래·한방기침·코감기·한방코감기·비강세척(식염수소포장)",
    subA: "목감기·한방목감기·목캔디·인후스프레이·종합감기·한방종합감기·면역증강",
    section: "aisle",
  },

  // ── 상단 벽면 (top_wall) 21→9 좌→우 감소 ─────────────────────────────
  // 2026-08-26 · zonecategory.png 반영 · 우측 벽면 실제 카테고리
  { num: 23, label: "벽면 23", category: "관절건강 (콘드로이친/MSM) · 뼈건강 (칼슘/비타민D/K2)", section: "top_wall" },
  { num: 22, label: "벽면 22", category: "마그네슘·수면 · 피로회복 (간기능 개선제 1단계)",       section: "top_wall" },
  { num: 21, label: "벽면 21", category: "운동전후/체중관리/수액보충제 · 남성 라이프케어 (탈모·전립선·성건강)", section: "top_wall" },
  { num: 20, label: "벽면 20", category: "여성라이프케어 (생리·철분·엽산·PMS·갱년기) · 콜라겐 (콜라겐·글루타치온·먹는PDRN)", section: "top_wall" },
  { num: 19, label: "벽면 19", category: "비타민C · 항산화 (글루타치온·커큐민·케르세틴·피크노제놀·코엔자임Q10)", section: "top_wall" },
  { num: 18, label: "벽면 18", category: "항산화 · 면역조절제 (후코이단·베타글루칸·에키나시아·프로폴리스·아연)", section: "top_wall" },
  { num: 17, label: "벽면 17", category: "잇몸건강 · 눈건강 (루테인·간유·콘드로이신)",           section: "top_wall" },
  { num: 16, label: "벽면 16", category: "오메가3·6·7 · 뇌기능개선 (이명·포스파티딜세린·인지력개선)", section: "top_wall" },
  { num: 15, label: "벽면 15", category: "혈행건강 (은행잎·서양산사자·복합제) · 위건강 (매스틱·효소·한방위장약)", section: "top_wall" },
  { num: 14, label: "벽면 14", category: "유산균 (장건강·구강유산균·여성유산균·다이어트유산균) · 냉장유산균",  section: "top_wall" },
  { num: 13, label: "벽면 13", category: "철분·엽산 · 임신영양 (임시·수유기 영양)",              section: "top_wall" },
  { num: 12, label: "벽면 12", category: "어린이 영양 (키잠밥·수험생 집중력·지구력) · 피로회복 (아르기닌)", section: "top_wall" },
  { num: 11, label: "벽면 11", category: "피로회복 (알부민·아미노산) · 비타민B/부스터",           section: "top_wall" },
  { num: 10, label: "벽면 10", category: "피로회복 · 종합비타민",                                section: "top_wall" },
  { num: 9,  label: "벽면 9",  category: "(예비)",                                             section: "top_wall" },

  // ── 하단 벽면 (bottom_wall) 24→34 좌→우 증가 · 파스류·화장품·기타 ─────────
  // 2026-08-26 · zonecategory.png 반영 · 창고1 (파스/한방/경옥고) + 매장 하단
  { num: 24, label: "벽면 24", category: "파스 (제일·녹십자·한독)",       section: "bottom_wall" },
  { num: 25, label: "벽면 25", category: "파스 (신신·지오영)",           section: "bottom_wall" },
  { num: 26, label: "벽면 26", category: "뿌리는·바르는 파스 (지오영)",    section: "bottom_wall" },
  { num: 27, label: "벽면 27", category: "파스 (일동·조아)",             section: "bottom_wall" },
  { num: 28, label: "벽면 28", category: "의료기기·혈당체크·혈압계·체온계 · 보호대·스포츠테이핑", section: "bottom_wall" },
  { num: 29, label: "벽면 29", category: "반창고·거즈·붕대 · 응급·구급·소독약·살충제",         section: "bottom_wall" },
  { num: 30, label: "벽면 30", category: "화상·습윤밴드",                                   section: "bottom_wall" },
  { num: 31, label: "벽면 31", category: "염색약·제모기·립케어·생활편의",                     section: "bottom_wall" },
  { num: 32, label: "벽면 32", category: "화장품 (기미·미백·잡티·여드름·트러블·PDRN·리페어)",   section: "bottom_wall" },
  { num: 33, label: "벽면 33", category: "화장품 (기초·클린징·마스크팩·집중팩·헤어·바디케어)",   section: "bottom_wall" },
  { num: 34, label: "벽면 34", category: "기타 한방제제",                                   section: "bottom_wall" },

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
