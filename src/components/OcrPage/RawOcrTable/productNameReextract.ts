// 2026-07-24 · 품명 재추출 관련 순수 헬퍼 함수 (RawOcrTable.tsx 에서 분리)
//   원본: reextractProductName 내부에 인라인으로 있던 로직들
//   장점: 순수 함수 · 테스트 가능 · RawOcrTable 파일 라인 감소

import { isValidProductName } from "../../../lib/ocrRowFilter";

const NAME_HEADER_VARIANTS = ["품명", "상품명", "품 명", "상 품 명", "품목명", "제품명", "명칭"];
const NAME_RE = /[가-힣][가-힣A-Za-z0-9·+\-]{1,}/g;
const COMMA_NUM = /\d{1,3}(?:,\d{3})+/;

/** rawText 에서 "품명" 헤더 (또는 변형) 위치 찾음 · 없으면 -1 */
export function findNameHeaderIdx(rawText: string): number {
  for (const hv of NAME_HEADER_VARIANTS) {
    const i = rawText.indexOf(hv);
    if (i >= 0) return i;
  }
  return -1;
}

/** 이 행의 rawText 위치 정확 매치 · 수량+금액 조합으로 · 정확히 1개만 반환 */
export function findRowPositionInRawText(
  rawText: string,
  qty: number,
  amt: number,
  headerIdx: number,
): { pos: number; localScanText: string } | null {
  const qtyStr = qty > 0 ? String(Math.round(qty)) : "";
  const amtStr = amt > 0 ? Math.round(amt).toLocaleString() : "";
  const amtStrPlain = amt > 0 ? String(Math.round(amt)) : "";
  if (!qtyStr || (!amtStr && !amtStrPlain)) return null;
  const searchStart = headerIdx >= 0 ? headerIdx : 0;
  const searchArea = rawText.slice(searchStart);
  const qtyRe = new RegExp(`(?<!\\d)${qtyStr}(?!\\d)`, "g");
  let m: RegExpExecArray | null;
  const positions: number[] = [];
  while ((m = qtyRe.exec(searchArea)) !== null) {
    const pos = m.index;
    const window = searchArea.slice(Math.max(0, pos - 30), Math.min(searchArea.length, pos + 250));
    if ((amtStr && window.includes(amtStr)) || (amtStrPlain && window.includes(amtStrPlain))) {
      positions.push(searchStart + pos);
    }
  }
  if (positions.length !== 1) return null;
  const rowPos = positions[0];
  const localScanText = rawText.slice(Math.max(0, rowPos - 30), Math.min(rawText.length, rowPos + 200));
  return { pos: rowPos, localScanText };
}

/** 스캔 영역 확정 · 우선순위: local > 헤더 이후 > 앵커 근처 > 전체 */
export function computeScanText(
  rawText: string,
  headerIdx: number,
  currentName: string,
  localScanText: string,
): string {
  if (localScanText) return localScanText;
  if (headerIdx >= 0) return rawText.slice(headerIdx);
  // 폴백: currentName 한글 첫 3자 앵커 ±100~300자
  const anchorKor = (currentName.match(/[가-힣]/g) ?? []).slice(0, 3).join("");
  if (anchorKor.length >= 2 && rawText.includes(anchorKor)) {
    const idx = rawText.indexOf(anchorKor);
    return rawText.slice(Math.max(0, idx - 100), Math.min(rawText.length, idx + 300));
  }
  return rawText;
}

/** 한글 토큰 후보 수집 · 필터링 · currentName 포함 */
export function collectNameCandidates(scanText: string, currentName: string): string[] {
  const rawTokens = (scanText.match(NAME_RE) ?? []).filter(t => {
    const korCnt = (t.match(/[가-힣]/g) ?? []).length;
    if (korCnt < 2) return false;
    if (COMMA_NUM.test(t)) return false;  // 금액형 제외
    if (!isValidProductName(t)) return false;
    return true;
  });
  const uniq: string[] = Array.from(new Set<string>(rawTokens));
  if (currentName && isValidProductName(currentName) && !COMMA_NUM.test(currentName)) {
    if (!uniq.includes(currentName)) uniq.push(currentName);
  }
  return uniq;
}

/** 후보 스코어링 · 길이 + 한글비율 + 근처 숫자 동반 */
export function scoreProductNameToken(tok: string, scanText: string): number {
  let s = tok.length * 8;
  const korCnt = (tok.match(/[가-힣]/g) ?? []).length;
  s += korCnt * 4;
  const idx = scanText.indexOf(tok);
  if (idx >= 0) {
    const window = scanText.slice(Math.max(0, idx - 60), Math.min(scanText.length, idx + tok.length + 60));
    const nums = window.match(/\b\d{2,7}(?:[,.]\d{3})*\b/g) ?? [];
    if (nums.length >= 2) s += 15;
    else if (nums.length >= 1) s += 5;
  }
  return s;
}

/** 한글 문자 Jaccard 유사도 (교집합 / 합집합) */
export function koreanJaccardSimilarity(a: string, b: string): number {
  const setA = new Set((a.match(/[가-힣]/g) ?? []));
  const setB = new Set((b.match(/[가-힣]/g) ?? []));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  setA.forEach(c => { if (setB.has(c)) inter++; });
  return inter / (setA.size + setB.size - inter);
}
