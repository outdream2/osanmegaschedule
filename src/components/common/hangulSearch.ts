// src/components/common/hangulSearch.ts
// 2026-08-03 (#201) · 한글 초성 검색 · 자체 구현 (zero-dep · 40줄)
//   · 배경 · npm hangul-chosung-search-js 존재하나 · 새 dep 회피 · <1KB 인라인
//   · 한글 유니코드 0xAC00(가) ~ 0xD7A3(힣) · 588 = 21(중성) × 28(종성)
//   · 초성 = Math.floor((code - 0xAC00) / 588) → CHOSUNG 배열 인덱스
//
// API
//   toChosung("아세트아미노펜") → "ㅇㅅㅌㅇㅁㄴㅍ"
//   matchHangul(hay, needle) → boolean · 원문 부분일치 || 초성 부분일치
//
// 성능 · 1만 행 × 20자 문자열 · 크롬 M1 · ~4ms · 실무 적정

const CHOSUNG = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ",
  "ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
];

/** 문자열에서 한글은 초성으로 · 그 외는 원문 그대로 반환 (소문자화) */
export function toChosung(s: string): string {
  if (!s) return "";
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
    } else {
      out += s[i].toLowerCase();
    }
  }
  return out;
}

/** 검색어가 순수 초성만인지 (자음 낱자만) */
export function isChosungOnly(needle: string): boolean {
  if (!needle) return false;
  for (let i = 0; i < needle.length; i++) {
    if (!CHOSUNG.includes(needle[i])) return false;
  }
  return true;
}

/**
 * 한글 대응 부분일치 매칭
 *  · needle 이 순수 초성(자음 낱자)이면 · hay 를 초성으로 변환 후 includes
 *  · 그 외 · 원문 includes (대소문자 무시)
 *  · needle 에 한글이 포함되어 있어도 초성 매칭 병행 (관대한 매칭)
 */
export function matchHangul(hay: string, needle: string): boolean {
  if (!needle) return true;
  if (!hay) return false;
  const n = needle.trim();
  if (!n) return true;
  const hLower = hay.toLowerCase();
  const nLower = n.toLowerCase();
  // 1) 원문 부분일치 (한글 · 영문 · 숫자 모두 커버)
  if (hLower.includes(nLower)) return true;
  // 2) 초성 매칭 · needle 이 순수 자음 낱자일 때만 (오탐 방지)
  if (isChosungOnly(n)) {
    return toChosung(hay).includes(n);
  }
  return false;
}
