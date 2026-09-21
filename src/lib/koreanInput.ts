// src/lib/koreanInput.ts
// 2026-09-21 · #329 · 한글 IME 우선 입력 · SSOT
//
// 사용:
//   import { KO_INPUT_PROPS } from "../../lib/koreanInput";
//   <input type="text" {...KO_INPUT_PROPS} value={v} onChange={...} />
//   <textarea {...KO_INPUT_PROPS} value={v} onChange={...} />
//
// 원칙:
//   - 한글 IME (Input Method Editor) 를 기본으로 · 모바일 SW 자동으로 한글 배열 노출
//   - 자동 대문자화·자동 교정·맞춤법 검사 비활성 · 오타·잘못된 자동 치환 방지
//   - inputMode="text" · 모바일 · 일반 텍스트 (문자 · 한글) 키패드
//
// 예외 (적용 금지):
//   - type="number" · "tel" · "email" · "date" · "password" · "url" · "search"
//   - 코드·바코드 등 · 순수 영문·숫자 입력 (별도 스캐너·바코드 로직)
//
// 회귀:
//   - 기존 handler / value / onChange · 절대 변경 X
//   - 이미 lang="ko" 만 있는 input 은 · spread 로 나머지 prop 추가

export const KO_INPUT_PROPS = {
  lang: "ko",
  inputMode: "text" as const,
  autoCapitalize: "off" as const,
  autoCorrect: "off" as const,
  spellCheck: false,
} as const;

/** 검색·필터 등 · 좁은 폭 필드용 · 별칭 (구조 동일) */
export const KO_SEARCH_PROPS = KO_INPUT_PROPS;
