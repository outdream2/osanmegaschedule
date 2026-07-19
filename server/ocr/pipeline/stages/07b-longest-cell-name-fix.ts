// server/ocr/pipeline/stages/07b-longest-cell-name-fix.ts
// 품명 컬럼 보정 스테이지 (2026-07-19)
//
// 목적:
//   X-anchor 오배정 또는 컬럼 정규화 실패로 품명 컬럼 값이 잘못됐을 때
//   두 가지 휴리스틱으로 복구.
//
//   [A] 최장 셀 휴리스틱
//       각 행에서 "가장 긴 문자열 셀" 을 찾아, 그 셀이 품명 컬럼에 없으면 스왑.
//       근거: 거래명세서에서 품명은 숫자/날짜/규격보다 길이가 긴 경우가 압도적.
//
//   [B] 빈 품명 폴백
//       품명 셀이 비어있는 행에서, 다른 컬럼 중 "품명처럼 보이는 셀" 을 꺼내 품명에 배정.
//       조건: 한글 2자+ 포함 · 순수 숫자/날짜/코드 아님 · 길이 3자 이상
//
// 최소 침습:
//   - 기존 X-anchor · SLANet · Gemini 파싱 결과 모두 유지
//   - 두 조건 모두 안전 조건 충족 시에만 스왑 (잘못된 스왑 방지)
//   - 실패 시 원본 그대로 반환
//
// 파이프라인 위치: Stage 07(filter) 바로 뒤 → Stage 08(verify) 전

import type { Stage } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// 상수 · 정규식
// ─────────────────────────────────────────────────────────────────────────────

const HAS_KOREAN = /[가-힣]/;
const PURE_NUMBER = /^[\d,.\s\-]+$/;
// 날짜 패턴: YYYY-MM-DD / YYYYMMDD / YYYY.MM.DD 등
const DATE_PAT = /^20\d{2}[-.\/]?\d{2}[-.\/]?\d{2}$/;
// 순수 알파+숫자 코드: A200893, B12345, GP01234 등
const CODE_PAT = /^[A-Za-z]{1,3}\d{3,}$/;
// 규격 단위 패턴 (전체가 규격이면 품명 아님)
const SPEC_ONLY = /^\d+\s*(mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea|BOX|박스)\b.*$/i;
// 숫자 열 (수량/단가/금액에 들어가야 할 값)
const NUMERIC_CELL_RE = /^[\d,.\s]{2,}$/;

// 품명처럼 보이는 조건 (모든 기준 충족해야 함)
function looksLikeName(val: string | number | null): boolean {
  if (val == null) return false;
  const s = typeof val === "number" ? String(val) : String(val).trim();
  if (s.length < 3) return false;
  if (PURE_NUMBER.test(s)) return false;
  if (DATE_PAT.test(s.replace(/\s/g, ""))) return false;
  if (CODE_PAT.test(s)) return false;
  if (SPEC_ONLY.test(s)) return false;
  // 한글 2자 이상 포함 필수
  const koreanChars = s.match(/[가-힣]/g) ?? [];
  if (koreanChars.length < 2) return false;
  return true;
}

// 순수 숫자/날짜/코드 셀인지 (품명 컬럼에서 다른 컬럼으로 옮겨야 하는 경우)
function isNumericOrCode(val: string | number | null): boolean {
  if (val == null) return false;
  if (typeof val === "number") return true;
  const s = String(val).trim();
  if (NUMERIC_CELL_RE.test(s)) return true;
  if (DATE_PAT.test(s.replace(/\s/g, ""))) return true;
  if (CODE_PAT.test(s)) return true;
  return false;
}

// 숫자 전용 컬럼 인덱스 집합 (스왑 후보에서 제외)
const NUMERIC_COLS = new Set(["수량", "단가", "금액", "세액", "번호"]);
// 스왑 금지 컬럼 (날짜/키 컬럼)
const SKIP_SWAP_COLS = new Set(["유통기한", "일자", "번호"]);

// ─────────────────────────────────────────────────────────────────────────────
// [A] 최장 셀 휴리스틱
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 각 행에서 가장 긴 비-코드 문자열 셀을 찾아, 그 셀이 품명 컬럼에 없으면 스왑.
 *
 * 안전 조건:
 *   1. 현재 품명 셀이 비어있거나 숫자/코드 인 경우에만 스왑
 *   2. 최장 셀이 "품명처럼 보임" 조건 충족 (한글 2자+, 길이 3자+, 숫자/날짜/코드 아님)
 *   3. 최장 셀의 컬럼이 SKIP_SWAP_COLS 아닌 경우에만 스왑
 *   4. 스왑할 컬럼이 NUMERIC_COLS 가 아닌 경우 (수량/단가/금액은 스왑 불가)
 */
function applyLongestCellHeuristic(
  headers: string[],
  rows: (string | number | null)[][],
): { rows: (string | number | null)[][]; swapCount: number } {
  const nameIdx = headers.indexOf("품명");
  if (nameIdx < 0) return { rows, swapCount: 0 };

  let swapCount = 0;
  const outRows = rows.map(row => {
    if (!Array.isArray(row)) return row;

    const currentName = row[nameIdx];
    const nameStr = currentName == null ? "" : String(currentName).trim();

    // 이미 품명 컬럼에 정상 품명이 있으면 스킵
    if (looksLikeName(currentName)) return row;

    // 현재 품명이 비거나 숫자/코드인 경우에만 진행
    const nameIsEmpty = nameStr.length === 0;
    const nameIsCode = !nameIsEmpty && isNumericOrCode(currentName);
    if (!nameIsEmpty && !nameIsCode) return row;

    // 행 내 모든 셀 중 가장 긴 "품명 후보" 찾기
    let bestIdx = -1;
    let bestLen = 0;

    for (let c = 0; c < headers.length; c++) {
      if (c === nameIdx) continue;
      const h = headers[c] ?? "";
      if (SKIP_SWAP_COLS.has(h)) continue;
      if (NUMERIC_COLS.has(h)) continue;

      const v = row[c];
      if (!looksLikeName(v)) continue;

      const s = String(v).trim();
      if (s.length > bestLen) {
        bestLen = s.length;
        bestIdx = c;
      }
    }

    if (bestIdx < 0 || bestLen < 3) return row;

    // 스왑 실행
    const next = [...row];
    next[nameIdx] = row[bestIdx];
    // 원래 품명 자리에 있던 값이 코드/숫자였으면 스왑 대상 컬럼에 넣음
    // 그 컬럼이 숫자 컬럼 아니면 교환 (숫자 컬럼이면 그냥 null)
    next[bestIdx] = nameIsCode ? currentName : null;

    swapCount++;
    return next;
  });

  return { rows: outRows, swapCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// [B] 빈 품명 폴백
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 품명 셀이 완전히 비어있는 행에서, 비-숫자 컬럼 중 "품명처럼 보이는" 셀을 찾아
 * 품명으로 배정.
 *
 * 안전 조건:
 *   1. 수량·단가·금액 중 최소 1개가 있는 행 (상품 행일 확률 높음)
 *   2. 찾은 셀이 looksLikeName 조건 충족
 *   3. 현재 품명이 null 또는 빈 문자열인 경우만 적용
 */
function applyEmptyNameFallback(
  headers: string[],
  rows: (string | number | null)[][],
): { rows: (string | number | null)[][]; fallbackCount: number } {
  const nameIdx = headers.indexOf("품명");
  const qIdx = headers.indexOf("수량");
  const pIdx = headers.indexOf("단가");
  const aIdx = headers.indexOf("금액");
  if (nameIdx < 0) return { rows, fallbackCount: 0 };

  let fallbackCount = 0;
  const outRows = rows.map(row => {
    if (!Array.isArray(row)) return row;

    const currentName = row[nameIdx];
    const nameStr = currentName == null ? "" : String(currentName).trim();
    if (nameStr.length > 0) return row; // 이미 품명 있음

    // 상품 행 확인: 수량/단가/금액 중 최소 1개 있어야
    const hasQty = qIdx >= 0 && typeof row[qIdx] === "number" && (row[qIdx] as number) > 0;
    const hasPrice = pIdx >= 0 && typeof row[pIdx] === "number" && (row[pIdx] as number) > 0;
    const hasAmt = aIdx >= 0 && typeof row[aIdx] === "number" && (row[aIdx] as number) > 0;
    if (!hasQty && !hasPrice && !hasAmt) return row;

    // 다른 컬럼 중 품명 후보 찾기 (길이 내림차순 우선)
    const candidates: Array<{ colIdx: number; val: string | number | null; len: number }> = [];
    for (let c = 0; c < headers.length; c++) {
      if (c === nameIdx) continue;
      const h = headers[c] ?? "";
      if (NUMERIC_COLS.has(h)) continue;
      if (SKIP_SWAP_COLS.has(h)) continue;

      const v = row[c];
      if (!looksLikeName(v)) continue;
      candidates.push({ colIdx: c, val: v, len: String(v).trim().length });
    }

    if (candidates.length === 0) return row;

    // 가장 긴 후보 선택
    candidates.sort((a, b) => b.len - a.len);
    const best = candidates[0];

    const next = [...row];
    next[nameIdx] = best.val;
    next[best.colIdx] = null; // 원래 컬럼은 비움
    fallbackCount++;
    return next;
  });

  return { rows: outRows, fallbackCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 래퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 07b: 최장 셀 + 빈 품명 폴백
 *
 * 실행 조건:
 *   - headers 에 "품명" 이 있을 것
 *   - rows 가 1개 이상 있을 것
 *
 * 실패해도 예외 던지지 않고 원본 ctx 반환.
 */
export const longestCellNameFixStage: Stage = {
  name: "longest-cell-name-fix",

  when(ctx) {
    return ctx.headers.indexOf("품명") >= 0 && ctx.rows.length > 0;
  },

  run(ctx) {
    try {
      let rows = ctx.rows;
      const headers = ctx.headers;

      // [A] 최장 셀 휴리스틱
      const afterLongest = applyLongestCellHeuristic(headers, rows);
      if (afterLongest.swapCount > 0) {
        console.log(
          `[longest-cell-name-fix] page ${ctx.page}: ` +
          `최장셀 스왑 ${afterLongest.swapCount}행`
        );
      }
      rows = afterLongest.rows;

      // [B] 빈 품명 폴백
      const afterFallback = applyEmptyNameFallback(headers, rows);
      if (afterFallback.fallbackCount > 0) {
        console.log(
          `[longest-cell-name-fix] page ${ctx.page}: ` +
          `빈품명 폴백 ${afterFallback.fallbackCount}행`
        );
      }
      rows = afterFallback.rows;

      return { rows };
    } catch (e: any) {
      console.warn(`[longest-cell-name-fix] page ${ctx.page}: 실패 → 원본 유지 (${e?.message})`);
      return {};
    }
  },
};
