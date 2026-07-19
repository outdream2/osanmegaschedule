// server/ocr/pipeline/stages/04b-column-anchor.ts
// 헤더 X-anchor 강제 매칭 — SLANet 셀 경계 오독 우회
//
// 목적: 인쇄된 거래명세서에서 "품명·수량·단가·금액" 헤더 텍스트의
//        X-center 를 컬럼 기준점(anchor) 으로 삼고, 데이터 행 각 OCR 박스를
//        가장 가까운 anchor 에 강제 배정한다.
//        SLANet 이 셀 경계를 잘못 감지할 때도 헤더 위치 기반으로 정확히 정렬 가능.
//
// 파이프라인 위치: Stage 02(OCR 엔진) 이후, Stage 04(template) 이전
//   → raw.rows 가 비거나 수식 검증 점수가 SLANet 보다 높을 때 ctx 를 override
//
// 절대 수정 금지:
//   - 엔진 파라미터 (ppuPaddle.ts)
//   - 파싱 후처리 (parse.ts)
//   - 프론트 UI

import { isDeliveryOrAdminInfo } from "../../invoice-vocab";
import type { Stage } from "../types";

// ─────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────

/** PP-OCR 원본 박스 (ppuPaddle.ts Cell.box 와 동일 좌표계) */
export interface OcrBox {
  text: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf?: number;
}

export interface ColumnAnchor {
  label: string;    // 정규화된 표준 헤더명 (예: "수량")
  rawText: string;  // 원본 헤더 텍스트
  x: number;        // x-center 픽셀
  y: number;        // y-center 픽셀 (헤더 행 y 필터링용)
}

export interface AnchorInput {
  ocrBoxes: OcrBox[];
}

export interface AnchorResult {
  headers: string[];
  rows: (string | number | null)[][];
  anchors: ColumnAnchor[];
  mathScore: number; // 수식 검증 통과 행 비율 (0~1)
}

// ─────────────────────────────────────────────────────────────────────────
// 헤더 키워드 → 표준명 매핑
// ─────────────────────────────────────────────────────────────────────────

const HEADER_MAP: Array<{ std: string; patterns: RegExp }> = [
  { std: "번호",     patterns: /번\s*호|순\s*번|항\s*번|^no\.?$/i },
  { std: "일자",     patterns: /일\s*자|발행\s*일|거래\s*일|전표\s*일|월\s*일|날\s*짜/ },
  { std: "품명",     patterns: /품\s*명|품\s*목|상품\s*명|제품\s*명/ },
  { std: "규격",     patterns: /규\s*격|사\s*양/ },
  { std: "단위",     patterns: /단\s*위|포\s*장/ },
  { std: "수량",     patterns: /수\s*량|매\s*수|qty/i },
  { std: "단가",     patterns: /단\s*가|unit\s*price/i },
  { std: "금액",     patterns: /금\s*액|공급\s*가\s*액|합계\s*금액|총매출액/ },
  { std: "세액",     patterns: /세\s*액|부\s*가\s*세|vat/i },
  { std: "유통기한", patterns: /유통\s*기한|소비\s*기한|유효\s*기한|유효\s*기간|사용\s*기한|만료\s*일/ },
  { std: "비고",     patterns: /비\s*고|적\s*요|메\s*모/ },
];

/** 텍스트에서 표준 헤더명 반환. 매칭 안되면 null */
function normalizeHeader(text: string): string | null {
  const t = text.replace(/\s+/g, "").toLowerCase();
  for (const { std, patterns } of HEADER_MAP) {
    if (patterns.test(t)) return std;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 수식 검증
// ─────────────────────────────────────────────────────────────────────────

/** rows 에서 수량×단가=금액 성립 비율 계산 */
function calcMathScore(
  headers: string[],
  rows: (string | number | null)[][],
): number {
  const qIdx  = headers.indexOf("수량");
  const pIdx  = headers.indexOf("단가");
  const aIdx  = headers.indexOf("금액");
  if (qIdx < 0 || pIdx < 0 || aIdx < 0) return 0;

  let valid = 0;
  let total = 0;
  for (const row of rows) {
    const q = toNum(row[qIdx]);
    const p = toNum(row[pIdx]);
    const a = toNum(row[aIdx]);
    if (q == null || p == null || a == null) continue;
    total++;
    if (Math.abs(q * p - a) <= Math.max(1, a * 0.02)) valid++;
  }
  return total === 0 ? 0 : valid / total;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** 셀 값 → 숫자 or 문자열 · 순수 정수/소수만 숫자형으로 */
function parseCell(raw: string): string | number | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim().replace(/,/g, "");
  // 쉼표를 마침표로 오독한 천단위 구분 패턴: "1.500" → 1500
  if (/^\d{1,3}(\.\d{3})+$/.test(s.replace(/,/g, ""))) {
    return parseInt(s.replace(/\./g, ""), 10);
  }
  const n = parseFloat(s);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s)) return n;
  return raw.trim();
}

// ─────────────────────────────────────────────────────────────────────────
// 헤더 행 탐지
// ─────────────────────────────────────────────────────────────────────────

/**
 * 모든 OCR 박스 중 헤더 키워드를 가진 박스를 찾는다.
 * 헤더 행: 같은 y-대역에서 표준 헤더 키워드 3개 이상 발견되는 y-그룹
 *
 * @returns 헤더 박스 배열 (없으면 [])
 */
function detectHeaderBoxes(boxes: OcrBox[]): OcrBox[] {
  // 각 박스에 표준 헤더명 매핑 (없으면 null)
  const tagged = boxes.map(b => ({
    box: b,
    std: normalizeHeader(b.text),
    cy: (b.y1 + b.y2) / 2,
  }));

  const headerCandidates = tagged.filter(t => t.std !== null);
  if (headerCandidates.length < 2) return [];

  // y-클러스터링: 헤더들이 같은 행에 모여있는 그룹 찾기
  // 임계: 평균 박스 높이의 1배 이내
  const avgH = boxes.reduce((s, b) => s + (b.y2 - b.y1), 0) / Math.max(boxes.length, 1);
  const yThreshold = Math.max(avgH * 1.2, 12);

  // y 오름차순 정렬 후 그룹핑
  const sorted = [...headerCandidates].sort((a, b) => a.cy - b.cy);
  const groups: typeof sorted[] = [];
  for (const item of sorted) {
    let placed = false;
    for (const g of groups) {
      const groupCy = g.reduce((s, t) => s + t.cy, 0) / g.length;
      if (Math.abs(item.cy - groupCy) <= yThreshold) {
        g.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([item]);
  }

  // 가장 많은 표준 헤더를 가진 그룹 선택 (최소 3개 이상)
  let bestGroup: typeof sorted = [];
  let bestScore = 0;
  for (const g of groups) {
    const uniqueStd = new Set(g.map(t => t.std)).size;
    if (uniqueStd > bestScore) {
      bestScore = uniqueStd;
      bestGroup = g;
    }
  }

  if (bestScore < 3) return [];

  return bestGroup.map(t => t.box);
}

// ─────────────────────────────────────────────────────────────────────────
// 메인 함수: X-anchor 매칭
// ─────────────────────────────────────────────────────────────────────────

/**
 * OCR 박스 배열에서 헤더 X-anchor 기반 컬럼 배정을 수행한다.
 *
 * 알고리즘:
 *   1. 헤더 행 탐지 (y-클러스터링)
 *   2. 헤더 텍스트별 x-center → anchor 배열
 *   3. 헤더 아래 모든 박스 → 가장 가까운 anchor 에 배정
 *   4. 같은 (row_y, anchor) 에 여러 박스 → 공백 join
 *   5. 수식 검증 점수 계산 후 반환
 *
 * @returns AnchorResult (헤더 감지 실패 → null)
 */
export function anchorByHeader(input: AnchorInput): AnchorResult | null {
  const { ocrBoxes } = input;
  if (!ocrBoxes || ocrBoxes.length === 0) return null;

  // confidence 0.3 미만 제거
  const boxes = ocrBoxes.filter(b => b.text && b.text.trim() && (b.conf == null || b.conf > 0.3));
  if (boxes.length < 4) return null;

  // ── Step 1: 헤더 박스 탐지 ──────────────────────────────────────────
  const headerBoxes = detectHeaderBoxes(boxes);
  if (headerBoxes.length < 3) return null;

  // 헤더 행의 y-range 계산
  const headerMinY = Math.min(...headerBoxes.map(b => b.y1));
  const headerMaxY = Math.max(...headerBoxes.map(b => b.y2));
  const headerCy   = (headerMinY + headerMaxY) / 2;

  // ── Step 2: anchor 배열 생성 ─────────────────────────────────────────
  const anchors: ColumnAnchor[] = [];
  for (const hb of headerBoxes) {
    const std = normalizeHeader(hb.text);
    if (!std) continue;
    const cx = (hb.x1 + hb.x2) / 2;
    // 중복 헤더: 더 왼쪽 것 우선 유지 (번호·일자 중복 방어)
    const existing = anchors.find(a => a.label === std);
    if (existing) {
      if (cx < existing.x) existing.x = cx;
      continue;
    }
    anchors.push({
      label: std,
      rawText: hb.text.trim(),
      x: cx,
      y: headerCy,
    });
  }
  if (anchors.length < 3) return null;

  // x 오름차순 정렬 (좌→우)
  anchors.sort((a, b) => a.x - b.x);

  // ── Step 3: 데이터 박스 필터링 (헤더 아래만) ────────────────────────
  // 헤더 행 높이를 기준으로 아래로 여백 추가
  const headerH    = headerMaxY - headerMinY;
  const dataMinY   = headerMaxY + headerH * 0.1;  // 헤더 아래 살짝 여유
  const anchorXs   = anchors.map(a => a.x);

  // x 범위 threshold: 컬럼 간 최소 간격의 절반 · 최소 60px
  const colGaps: number[] = [];
  for (let i = 1; i < anchorXs.length; i++) {
    colGaps.push(anchorXs[i] - anchorXs[i - 1]);
  }
  const minGap      = colGaps.length > 0 ? Math.min(...colGaps) : 120;
  const xThreshold  = Math.max(minGap * 0.6, 60);

  const dataBoxes = boxes.filter(b => {
    const cy = (b.y1 + b.y2) / 2;
    if (cy < dataMinY) return false;
    // 배달/행정 정보 제외
    if (isDeliveryOrAdminInfo(b.text)) return false;
    return true;
  });

  if (dataBoxes.length === 0) return null;

  // ── Step 4: 데이터 박스 → y-행 클러스터링 ──────────────────────────
  const avgBoxH = dataBoxes.reduce((s, b) => s + (b.y2 - b.y1), 0) / dataBoxes.length;
  const rowYThreshold = Math.max(avgBoxH * 0.6, 8);

  // y-center 기준으로 그룹핑
  interface DataRow {
    centerY: number;
    cells: Map<number, string[]>;  // anchorIdx → texts[]
  }
  const dataRows: DataRow[] = [];

  const sortedData = [...dataBoxes].sort((a, b) => (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2);

  for (const box of sortedData) {
    const cy = (box.y1 + box.y2) / 2;
    const cx = (box.x1 + box.x2) / 2;
    const text = box.text.trim();
    if (!text) continue;

    // 가장 가까운 anchor 찾기
    let bestAnchorIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < anchorXs.length; i++) {
      const d = Math.abs(cx - anchorXs[i]);
      if (d < bestDist) { bestDist = d; bestAnchorIdx = i; }
    }
    // threshold 초과 시 스킵 (표 밖 텍스트)
    if (bestDist > xThreshold || bestAnchorIdx < 0) continue;

    // 행 그룹 찾기
    let targetRow: DataRow | undefined;
    for (const dr of dataRows) {
      if (Math.abs(cy - dr.centerY) <= rowYThreshold) {
        targetRow = dr;
        // centerY 는 평균으로 업데이트 (정확도 향상)
        dr.centerY = (dr.centerY + cy) / 2;
        break;
      }
    }
    if (!targetRow) {
      targetRow = { centerY: cy, cells: new Map() };
      dataRows.push(targetRow);
    }

    // 해당 anchor 에 텍스트 추가
    const existing = targetRow.cells.get(bestAnchorIdx);
    if (existing) {
      existing.push(text);
    } else {
      targetRow.cells.set(bestAnchorIdx, [text]);
    }
  }

  if (dataRows.length === 0) return null;

  // y 오름차순 정렬
  dataRows.sort((a, b) => a.centerY - b.centerY);

  // ── Step 5: 매트릭스 → rows 변환 ────────────────────────────────────
  const headers = anchors.map(a => a.label);

  const TOTAL_RE = /합\s*계|소\s*계|총\s*계|합\s*금|총\s*금|누\s*계|잔\s*액|공\s*급\s*가\s*액|부\s*가\s*세|이\s*월/;

  const resultRows: (string | number | null)[][] = [];
  for (const dr of dataRows) {
    const row: (string | number | null)[] = anchors.map((_, i) => {
      const texts = dr.cells.get(i);
      if (!texts || texts.length === 0) return null;
      // 품명 컬럼처럼 여러 텍스트가 같은 컬럼에 배정되면 공백으로 join (x순 정렬)
      const joined = texts.join(" ");
      return parseCell(joined);
    });

    // 빈 행 제거
    const nonNull = row.filter(c => c != null && String(c).trim() !== "");
    if (nonNull.length < 2) continue;

    // 소계/합계 행 제거
    const rowStr = row.map(c => String(c ?? "")).join(" ");
    if (TOTAL_RE.test(rowStr)) continue;

    // 전체 셀이 숫자만인 행 제거 (헤더 오하단 경계선 등)
    const nonNullStrs = row.filter((c): c is string | number => c != null && String(c).trim() !== "");
    const numCount = nonNullStrs.filter(c => typeof c === "number" || /^[\d,.\s]+$/.test(String(c))).length;
    if (nonNullStrs.length > 0 && numCount / nonNullStrs.length >= 0.9) continue;

    resultRows.push(row);
  }

  if (resultRows.length === 0) return null;

  // ── Step 6: 수식 검증 점수 계산 ─────────────────────────────────────
  const mathScore = calcMathScore(headers, resultRows);

  return {
    headers,
    rows: resultRows,
    anchors,
    mathScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Stage 래퍼
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stage 04b: 헤더 X-anchor 강제 매칭
 *
 * ctx.raw.ocrBoxes 가 있는 경우에만 실행.
 * X-anchor 결과의 수식 검증 점수가 현재 rows 보다 높으면 override.
 *
 * 활성화 조건:
 *   - ctx.raw 에 ocrBoxes 속성이 있어야 함
 *     (ppuPaddle.ts 가 ocrBoxes 를 raw 에 포함시키는 경우)
 *   - 또는 ctx.rawOcrBoxes 에 데이터가 있어야 함 (아래 확장 지점)
 */
export const columnAnchorStage: Stage = {
  name: "column-anchor",

  when(ctx) {
    // ocrBoxes 가 ctx 에 있을 때만 실행
    const boxes = getRawBoxes(ctx);
    return boxes != null && boxes.length >= 4;
  },

  run(ctx) {
    const boxes = getRawBoxes(ctx);
    if (!boxes || boxes.length < 4) return {};

    try {
      const anchorResult = anchorByHeader({ ocrBoxes: boxes });
      if (!anchorResult) {
        console.log(`[column-anchor] page ${ctx.page}: 헤더 감지 실패 → 기존 결과 유지`);
        return {};
      }

      // 현재 rows 의 수식 점수
      const currentScore = calcMathScore(ctx.headers, ctx.rows);
      const anchorScore  = anchorResult.mathScore;

      console.log(
        `[column-anchor] page ${ctx.page}: ` +
        `anchor 헤더=${JSON.stringify(anchorResult.headers)} · 행=${anchorResult.rows.length} · ` +
        `수식점수 anchor=${anchorScore.toFixed(2)} vs 현재=${currentScore.toFixed(2)}`
      );

      // anchor 결과가 더 좋거나 현재 결과가 없으면 채택
      const shouldOverride =
        anchorResult.rows.length > 0 && (
          ctx.rows.length === 0 ||
          anchorScore > currentScore + 0.1  // 10% 이상 개선될 때만 override
        );

      if (shouldOverride) {
        console.log(`[column-anchor] page ${ctx.page}: X-anchor 결과 채택 (점수 ${currentScore.toFixed(2)} → ${anchorScore.toFixed(2)})`);
        return {
          headers: anchorResult.headers,
          rows: anchorResult.rows,
        };
      }

      console.log(`[column-anchor] page ${ctx.page}: 기존 결과 유지 (anchor 점수 미달)`);
      return {};
    } catch (e: any) {
      console.warn(`[column-anchor] page ${ctx.page}: 실패, fallback 유지: ${e?.message}`);
      return {};
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 헬퍼: ctx 에서 ocrBoxes 추출
// ─────────────────────────────────────────────────────────────────────────

/**
 * PageContext 에서 OCR 박스 배열을 추출한다.
 *
 * ppuPaddle.ts 가 raw 에 ocrBoxes 를 포함하면 그것을 사용.
 * 없으면 ctx.rawOcrBoxes (확장 지점) 를 사용.
 *
 * 현재 ppuPaddle.ts 는 ocrBoxes 를 직접 노출하지 않으므로
 * raw.meta._ocrBoxes 또는 ctx 의 확장 필드를 통해 전달받는다.
 *
 * 통합 담당 엔지니어 주의:
 *   ppuPaddle.ts 의 _callPpuOcrInner 에서 OcrPageRaw.meta._ocrBoxes 에
 *   allCellsForMeta 를 x1/y1/x2/y2 형태로 담아두면 이 함수가 자동으로 활용한다.
 */
function getRawBoxes(ctx: any): OcrBox[] | null {
  // 1순위: ctx.rawOcrBoxes (파이프라인 확장 필드)
  if (Array.isArray(ctx.rawOcrBoxes) && ctx.rawOcrBoxes.length > 0) {
    return ctx.rawOcrBoxes as OcrBox[];
  }
  // 2순위: ctx.raw?.meta?._ocrBoxes (ppuPaddle 주입)
  const metaBoxes = ctx.raw?.meta?._ocrBoxes;
  if (Array.isArray(metaBoxes) && metaBoxes.length > 0) {
    return metaBoxes as OcrBox[];
  }
  return null;
}
