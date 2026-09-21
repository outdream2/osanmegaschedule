// src/lib/salesRecommendation/eventCategoryRules.ts
// 2026-09-21 · #326 · 판매추천 자동화 · SSOT (Single Source of Truth)
//   · eventType 별 · 추천 카테고리 + 트리거 D-days + 사용자 안내 문구
//   · 리서치 근거 (약사공론·데일리팜) · 명절·계절·수험생 매출 패턴
//   · 사용자 지시 (2026-09-21) · Q5=B · 풀 스펙
//
// **원본 카테고리 우선 원칙**
//   · products.category 는 자유 문자열 · 정규화되지 않음
//   · 매칭 시 · ILIKE '%키워드%' · 부분 매칭 (한글 카테고리 다양성 대응)
//   · 예 · "감기약" 룰 · "종합감기약"·"기침감기약"·"키즈종합감기약" 모두 매칭
//
// **저수기 (off-season) 배너**
//   · 2월·8월 초 · 발주량 감축 권장 (전년 대비 참고)
//   · 근거 · 리서치 · 약국 매출 저점 시기 (설·명절 이후 · 여름 휴가철 초입)

export type SalesRecoEventType =
  | "spring"
  | "summer"
  | "fall"
  | "winter"
  | "holiday"
  | "school"
  | "custom";

export interface EventCategoryRule {
  /** events.type 매칭 · custom 은 규칙 없음 · 폴백 처리 */
  eventType: SalesRecoEventType;
  /** D-N (일) · 이 시점부터 활성화 · 예 7 = D-7 이내 진입 시 배너 표시 */
  triggerBefore: number;
  /** 매칭 대상 카테고리 · products.category ILIKE '%키워드%' */
  categories: string[];
  /** 카테고리별 가중치 · 기본 1.0 (지정된 것만 부스트) */
  weights?: Record<string, number>;
  /** 사용자 안내 문구 · UI 배너 · reason 필드 */
  reason: string;
}

/**
 * 이벤트 타입별 · 추천 카테고리 매핑 규칙
 * 리서치 반영 (약사공론·데일리팜 2024~2025 기사 기준)
 *
 * 참고 · custom 이벤트는 · event_products 수동 매핑 사용 (규칙 없음)
 */
export const EVENT_CATEGORY_RULES: EventCategoryRule[] = [
  // 명절 (holiday) · 여행·상비약·감기약·타이레놀
  {
    eventType: "holiday",
    triggerBefore: 7,
    categories: [
      "일반의약품",
      "해열",       // 해열진통제·해열진통소염
      "감기",       // 감기약·종합감기약·기침감기약
      "소화",       // 소화제·소화기·위장관
      "지사",       // 지사제·설사
      "멀미",       // 멀미약
    ],
    weights: {
      "해열": 1.3,   // 명절 · 타이레놀 수요 급증
      "감기": 1.2,
      "멀미": 1.4,   // 명절 이동 · 멀미약 필수
    },
    reason: "명절/황금연휴 · 여행 상비약 수요 급증 · 재고 확보 권장",
  },
  // 겨울 (winter) · 감기·소화제·손소독제
  {
    eventType: "winter",
    triggerBefore: 14,
    categories: [
      "감기",
      "종합감기",
      "기침",
      "코감기",
      "목감기",
      "소화",
      "위장관",
      "지사",
      "손소독",
      "면역",       // 면역증강
    ],
    weights: {
      "감기": 1.3,
      "종합감기": 1.4,
      "위장관": 1.2,
    },
    reason: "겨울철 · 감기 시즌 + 위장관 감염증 · 판매 증가 대비",
  },
  // 가을 (fall) · 감기 시즌 진입
  {
    eventType: "fall",
    triggerBefore: 14,
    categories: [
      "감기",
      "종합감기",
      "기침",
      "코감기",
      "비염",       // 환절기 알러지
      "알러지",
    ],
    weights: {
      "감기": 1.2,
      "비염": 1.3,   // 환절기
    },
    reason: "가을 감기 시즌 진입 · 환절기 비염·알러지 매출 반등 예상",
  },
  // 여름 (summer) · 소화제·지사제·모기·무좀
  {
    eventType: "summer",
    triggerBefore: 14,
    categories: [
      "소화",
      "지사",
      "위장관",
      "모기",
      "무좀",
      "벌레",       // 벌레물림·해충기피
      "일광",       // 일광화상·자외선
      "냉장의약품", // 여름 · 냉장 필수 (예 · 인슐린 등)
    ],
    weights: {
      "지사": 1.3,
      "모기": 1.4,
      "무좀": 1.2,
    },
    reason: "여름철 · 위장관 불편 + 계절 상품 (모기·무좀) 수요 증가",
  },
  // 봄 (spring) · 영양제·비타민
  {
    eventType: "spring",
    triggerBefore: 14,
    categories: [
      "영양제",
      "비타민",
      "종합영양",
      "종합비타민",
      "면역",
      "피로",       // 피로회복
    ],
    weights: {
      "영양제": 1.2,
      "비타민": 1.2,
    },
    reason: "봄철 · 피로 증가 · 고함량 영양제·비타민 수요 증가",
  },
  // 학생·수험생 (school) · 영양제·수험생세트
  {
    eventType: "school",
    triggerBefore: 21,
    categories: [
      "영양제",
      "수험생",
      "비타민",
      "기억력",     // 기억력·집중력
      "홍삼",       // 홍삼·건강기능식품
    ],
    weights: {
      "수험생": 1.5,
      "홍삼": 1.3,
    },
    reason: "학생·수험생 · 학기 시작·수능 대비 영양제 수요",
  },
  // custom · 규칙 없음 · event_products 수동 매핑 사용 (폴백)
  //   · 서버 · custom 이벤트 스킵 (event_products 로 처리)
];

/**
 * 저수기 · 약국 매출 저점 시기 (경고 배너 대상)
 *   · 2월 · 설 명절 이후 · 매출 급락
 *   · 8월 · 여름 휴가철 초입 · 이동 감소
 *   · 근거 · 리서치 (약사공론 매출 분석)
 */
export interface OffSeasonRange {
  monthStart: number;   // 1~12
  monthEnd: number;     // 1~12 (inclusive)
  dayEnd?: number;      // 월 초 (특정일까지만) · 예 8월 1~10일
  label: string;
  reason: string;
}

export const OFF_SEASON_RANGES: OffSeasonRange[] = [
  {
    monthStart: 2,
    monthEnd: 2,
    label: "2월 저수기",
    reason: "설 명절 이후 · 약국 매출 저점 · 발주량 감축 권장 (전년 대비 -20% 참고)",
  },
  {
    monthStart: 8,
    monthEnd: 8,
    dayEnd: 10,
    label: "8월 초 저수기",
    reason: "여름 휴가철 초입 · 이동 감소 · 발주량 감축 권장 (전년 대비 -20% 참고)",
  },
];

/**
 * 오늘 (또는 임의 날짜) 이 저수기 구간에 속하는지 판정
 */
export function isOffSeason(date: Date = new Date()): OffSeasonRange | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const range of OFF_SEASON_RANGES) {
    if (month < range.monthStart || month > range.monthEnd) continue;
    if (range.dayEnd != null && day > range.dayEnd) continue;
    return range;
  }
  return null;
}

/**
 * eventType 로 규칙 조회 · 없으면 null (custom · 규칙 없음 폴백)
 */
export function getRuleForEventType(type: string): EventCategoryRule | null {
  const t = String(type ?? "").trim().toLowerCase() as SalesRecoEventType;
  return EVENT_CATEGORY_RULES.find(r => r.eventType === t) ?? null;
}

/**
 * 카테고리 문자열 · 규칙의 categories 키워드와 부분 매칭
 *   · category 가 키워드를 포함하면 · 해당 키워드의 weight 반환 (기본 1.0)
 *   · 매칭 안되면 · 0 (제외)
 */
export function matchCategoryWeight(category: string | null | undefined, rule: EventCategoryRule): number {
  const cat = String(category ?? "").trim();
  if (!cat) return 0;
  let best = 0;
  for (const kw of rule.categories) {
    if (cat.includes(kw)) {
      const w = rule.weights?.[kw] ?? 1.0;
      if (w > best) best = w;
    }
  }
  return best;
}
