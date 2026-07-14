// src/lib/cellReextract.ts
// 셀 단위 재추출 로직 (2026-07-14 Phase 8 · A안)
//
// 로직 1: rawText 로컬 정밀 스캔 — 품명 근처의 숫자 후보
// 로직 2: 컬럼 데이터 지문 — 같은 페이지 다른 유효 행 범위로 필터
// 로직 3: 크로스 페이지 참조 — 다른 페이지에 같은 상품 있으면 그 값
//
// 반환: 신뢰도 정렬된 후보 5개

export type Cell = string | number | null;
export type Row = Cell[];

export interface CellReextractPage {
  page: number;
  headers: string[];
  rows: Row[];
  rawText?: string;
}

export type ColumnKind = "수량" | "단가" | "금액";

export interface Candidate {
  value: number;
  source: string;
  confidence: number;
}

const parseNum = (v: Cell): number => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const clean = String(v).replace(/[^0-9.-]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
};

// 컬럼별 유효 range (사용자 도메인 기반)
const RANGE_FOR: Record<ColumnKind, { min: number; max: number }> = {
  수량: { min: 1,    max: 99999 },
  단가: { min: 50,   max: 9999999 },
  금액: { min: 100,  max: 999999999 },
};

/**
 * 셀 재추출 · 3가지 로직 앙상블
 */
export function reextractCellCandidates(args: {
  currentPage: CellReextractPage;
  otherPages: CellReextractPage[];
  rowIndex: number;         // currentPage.rows 내 인덱스 (page-local)
  columnKind: ColumnKind;
}): Candidate[] {
  const { currentPage, otherPages, rowIndex, columnKind } = args;
  const headers = currentPage.headers;
  const rows = currentPage.rows;
  const nameIdx = headers.indexOf("품명");
  const targetIdx = headers.indexOf(columnKind);
  if (nameIdx < 0 || targetIdx < 0) return [];

  const currentRow = rows[rowIndex];
  if (!Array.isArray(currentRow)) return [];
  const productName = String(currentRow[nameIdx] ?? "").trim();
  if (!productName) return [];

  const range = RANGE_FOR[columnKind];
  const rawText = currentPage.rawText ?? "";
  const candidates: Candidate[] = [];

  // ───── 로직 1: rawText 로컬 정밀 스캔 ─────
  //   품명 첫 3자(한글) 을 rawText 에서 찾음 → 그 위치 앞뒤 400자 스캔
  const koreanFirst3 = (productName.match(/[가-힣]/g) ?? []).slice(0, 3).join("");
  if (koreanFirst3.length >= 2 && rawText) {
    const idx = rawText.indexOf(koreanFirst3);
    if (idx >= 0) {
      const from = Math.max(0, idx - 50);
      const to = Math.min(rawText.length, idx + 400);
      const window = rawText.slice(from, to);
      // 숫자 토큰 (쉼표/마침표 포함)
      const NUM_RE = /\d{1,3}(?:[,.]\d{3})+|\d{4,}|\d+/g;
      const seen = new Set<number>();
      let m: RegExpExecArray | null;
      while ((m = NUM_RE.exec(window))) {
        const raw = m[0];
        const cleaned = raw.replace(/[,.]/g, "");
        const n = parseInt(cleaned, 10);
        if (!Number.isFinite(n) || n < range.min || n > range.max) continue;
        // 유통기한 YYYYMMDD 배제
        if (cleaned.length === 8 && /^20\d{6}$/.test(cleaned)) continue;
        // 사업자번호 · 배치번호 배제 (10자리 순수 숫자)
        if (cleaned.length >= 10) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        // 컬럼 kind 별 우선순위 (금액은 쉼표 포함 우선)
        let bonus = 0;
        if (columnKind === "금액" && raw.includes(",")) bonus += 0.1;
        if (columnKind === "수량" && n <= 999) bonus += 0.1;
        candidates.push({
          value: n,
          source: `rawText 근처 (${koreanFirst3}...)`,
          confidence: 0.65 + bonus,
        });
      }
    }
  }

  // ───── 로직 2: 컬럼 데이터 지문 (같은 페이지 다른 유효 행 기준) ─────
  const validValues = rows
    .map((r, i) => i === rowIndex ? 0 : parseNum(r[targetIdx]))
    .filter(v => v >= range.min && v <= range.max);
  if (validValues.length >= 2) {
    validValues.sort((a, b) => a - b);
    const median = validValues[Math.floor(validValues.length / 2)];
    const p10 = validValues[Math.floor(validValues.length * 0.1)];
    const p90 = validValues[Math.floor(validValues.length * 0.9)];
    const orderMagnitude = Math.round(Math.log10(median || 1));
    // 후보 필터: 자릿수 ±1, p10/p90 범위 내
    candidates.forEach(c => {
      const cMag = Math.round(Math.log10(c.value));
      if (Math.abs(cMag - orderMagnitude) <= 1) c.confidence += 0.15;
      if (c.value >= p10 * 0.5 && c.value <= p90 * 2) c.confidence += 0.1;
    });
  }

  // ───── 로직 3: 크로스 페이지 참조 (다른 페이지에 같은 상품) ─────
  const productNorm = productName.replace(/\s+/g, "").toLowerCase();
  for (const p of otherPages) {
    const pNameIdx = p.headers.indexOf("품명");
    const pTargetIdx = p.headers.indexOf(columnKind);
    if (pNameIdx < 0 || pTargetIdx < 0) continue;
    for (const r of p.rows) {
      if (!Array.isArray(r)) continue;
      const otherName = String(r[pNameIdx] ?? "").replace(/\s+/g, "").toLowerCase();
      if (otherName.length < 4) continue;
      // 품명 substring 매칭 (양방향)
      const isMatch = productNorm.length >= 4 && (otherName.includes(productNorm) || productNorm.includes(otherName));
      if (!isMatch) continue;
      const val = parseNum(r[pTargetIdx]);
      if (val < range.min || val > range.max) continue;
      candidates.push({
        value: val,
        source: `${p.page}번 페이지 동일 상품`,
        confidence: 0.9,   // 최고 신뢰도 (같은 상품 정확 매칭)
      });
    }
  }

  // 중복 값 병합 (같은 값이 여러 소스에서 나오면 confidence 상승)
  const merged = new Map<number, Candidate>();
  for (const c of candidates) {
    const ex = merged.get(c.value);
    if (!ex) merged.set(c.value, c);
    else {
      ex.confidence = Math.min(1.0, ex.confidence + 0.1);
      if (!ex.source.includes(c.source)) ex.source = `${ex.source} · ${c.source}`;
    }
  }

  const result = Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
  return result.slice(0, 5);
}
