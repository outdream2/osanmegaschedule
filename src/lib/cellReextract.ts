// src/lib/cellReextract.ts
// 셀 단위 재추출 로직 (2026-07-14 Phase 8 · A안)
//
// 로직 1: rawText 로컬 정밀 스캔 — 품명 근처의 숫자 후보
// 로직 2: 컬럼 데이터 지문 — 같은 페이지 다른 유효 행 범위로 필터
// (로직 3 크로스 페이지 참조 — 2026-07-16 제거: 개별 명세표 스코프 정책)
//
// 반환: 신뢰도 정렬된 후보 5개
//
// 2026-07-16: reextractTextCellCandidates() 추가
//   — 품명·규격·공급처·사업자번호 등 텍스트 셀 셀별 후보 순환 (옵션 A)

export type Cell = string | number | null;
export type Row = Cell[];

export interface CellReextractPage {
  page: number;
  headers: string[];
  rows: Row[];
  rawText?: string;
}

export type ColumnKind = "수량" | "단가" | "금액";
export type TextColumnKind = "품명" | "규격" | "공급처" | "사업자번호" | string;

export interface Candidate {
  value: number;
  source: string;
  confidence: number;
}

export interface TextCandidate {
  value: string;
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
  const { currentPage, otherPages: _otherPages, rowIndex, columnKind } = args;
  void _otherPages; // backward compat — cross-page 참조 제거 (2026-07-16)
  const headers = currentPage.headers;
  const rows = currentPage.rows;
  const nameIdx = headers.indexOf("품명");
  const targetIdx = headers.indexOf(columnKind);
  if (nameIdx < 0 || targetIdx < 0) return [];

  const currentRow = rows[rowIndex];
  if (!Array.isArray(currentRow)) return [];
  const productName = String(currentRow[nameIdx] ?? "").trim();
  if (!productName) return [];

  // 현재 셀 값 · 형태 근접도 기준 (2026-07-16 · "원본과 근접한 형태부터")
  const currentCellVal = parseNum(currentRow[targetIdx]);
  const currentDigits = currentCellVal > 0 ? String(Math.floor(currentCellVal)).length : 0;

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
        // 요청 3: 연도 시작 패턴 (20YY...) → 수량/단가/금액 재추출에서 제외
        //   20YY 로 시작하는 4자리~8자리는 유통기한으로 분류 (오분류 방지)
        if (/^20\d{2}/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 8) continue;
        // 사업자번호 · 배치번호 배제 (10자리 순수 숫자)
        if (cleaned.length >= 10) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        // 컬럼 kind 별 우선순위 (단가·금액은 쉼표 포함 우선 — 기능 1)
        let bonus = 0;
        if ((columnKind === "금액" || columnKind === "단가") && raw.includes(",")) bonus += 0.2;
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

  // ───── 형태 근접도 부스트 (2026-07-16 · "원본과 근접한 형태부터") ─────
  //   자릿수 일치 → +0.25 (강한 부스트)
  //   자릿수 ±1 → +0.10
  //   현재값 자체와 절대차 |diff|/max(current,cand) < 0.1 → +0.15 (거의 같은 값)
  if (currentDigits > 0) {
    for (const c of candidates) {
      const cDigits = String(Math.floor(c.value)).length;
      if (cDigits === currentDigits) {
        c.confidence += 0.25;
        c.source = `${c.source} · 자릿수일치(${currentDigits})`;
      } else if (Math.abs(cDigits - currentDigits) === 1) {
        c.confidence += 0.10;
      }
      // 값 근접도 (현재값 자체와 얼마나 가까운지)
      if (currentCellVal > 0) {
        const ratio = Math.abs(c.value - currentCellVal) / Math.max(currentCellVal, c.value);
        if (ratio < 0.1 && c.value !== currentCellVal) {
          c.confidence += 0.15;
          c.source = `${c.source} · 값근접`;
        }
      }
      if (c.confidence > 1.0) c.confidence = 1.0;
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

  // 요청 1: top 10 반환 (순환 클릭 시 더 많은 후보 탐색 가능)
  const result = Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
  return result.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 텍스트 셀 재추출 (품명 · 규격 · 공급처 · 사업자번호 · 기타)
// 2026-07-16 · 옵션 A 셀별 후보 순환
// ─────────────────────────────────────────────────────────────────────────────

// 상호 접미어 패턴 (공급처 추출용)
const SUPPLIER_SUFFIX_RE = /(?:주식회사|유한회사|합자회사|합명회사|협동조합|㈜|\(주\)|\(유\))[가-힣\w\s]*|[가-힣\w\s]*(?:주식회사|유한회사|합자회사|합명회사|협동조합|㈜|\(주\)|\(유\))/g;
// 규격 패턴: 숫자+단위 (예: 500mg, 10ml, 100정, 30캡슐 등)
const SPEC_RE = /\d+(?:\.\d+)?(?:mg|mL|ml|g|kg|정|캡슐|cap|Tab|tab|개|박스|EA|ea|포|매|장|병|튜브|앰플|vial|u|IU|iu|mcg|μg|L|L|cc)/g;
// 사업자번호 패턴
const BIZ_NUM_RE = /\d{3}-\d{2}-\d{5}/g;
// 한글 토큰 (품명 후보: 한글 4자 이상 연속)
const KOREAN_WORD_RE = /[가-힣]{4,}/g;

// 2026-07-16 · 포맷 시그니처 추출 · 문자열의 대략 형식 패턴 (D=숫자, K=한글, A=영문, u=단위, -/=구분자)
//   목적: "12345" vs "12-34-56789" 를 다른 포맷으로 판별 · 컬럼 형식 매칭 부스트
const formatSignature = (s: string): string => {
  return s
    .replace(/\d+/g, "D")
    .replace(/[가-힣]+/g, "K")
    .replace(/[A-Za-z]+/g, "A")
    .replace(/[.\s]/g, "");
};

// 컬럼의 지배적 포맷 시그니처 (같은 컬럼 값들 중 최빈 형식)
const dominantFormat = (values: string[]): string | null => {
  const sigs = values.filter(v => v).map(formatSignature);
  if (sigs.length === 0) return null;
  const freq = new Map<string, number>();
  for (const s of sigs) freq.set(s, (freq.get(s) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [sig, count] of freq) {
    if (count > max) { max = count; best = sig; }
  }
  return best;
};

/**
 * 텍스트 셀 재추출 · 3가지 로직 앙상블
 *
 * 반환: confidence 내림차순 후보 최대 6개
 */
export function reextractTextCellCandidates(args: {
  currentPage: CellReextractPage;
  otherPages: CellReextractPage[];
  rowIndex: number;          // currentPage.rows 내 인덱스 (page-local)
  columnName: TextColumnKind;
  currentValue: string;      // 현재 셀에 표시된 값 (원본 · 편집 포함)
}): TextCandidate[] {
  const { currentPage, otherPages: _otherPages2, rowIndex, columnName, currentValue } = args;
  void _otherPages2; // backward compat — cross-page 참조 제거 (2026-07-16)
  const { headers, rows, rawText = "" } = currentPage;
  const nameIdx = headers.indexOf("품명");
  const targetIdx = headers.indexOf(columnName);

  const currentRow = rows[rowIndex];
  if (!Array.isArray(currentRow)) return [];

  // 품명으로 rawText 앵커 위치 계산
  const anchorName = nameIdx >= 0 ? String(currentRow[nameIdx] ?? "").trim() : "";
  const korFirst3 = (anchorName.match(/[가-힣]/g) ?? []).slice(0, 3).join("");
  const anchorIdx = korFirst3.length >= 2 ? rawText.indexOf(korFirst3) : -1;
  const windowText = anchorIdx >= 0
    ? rawText.slice(Math.max(0, anchorIdx - 80), Math.min(rawText.length, anchorIdx + 500))
    : rawText.slice(0, 1000);

  const candidates: TextCandidate[] = [];
  const seenValues = new Set<string>();

  const addCand = (value: string, source: string, confidence: number) => {
    const v = value.trim();
    if (!v || v === currentValue.trim()) return;
    if (seenValues.has(v)) return;
    seenValues.add(v);
    candidates.push({ value: v, source, confidence });
  };

  // ───── 로직 1: rawText 로컬 스캔 (컬럼 타입별 정규식) ─────
  if (columnName === "사업자번호") {
    const re = new RegExp(BIZ_NUM_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      addCand(m[0], "rawText 사업자번호 패턴", anchorIdx >= 0 && Math.abs(m.index - anchorIdx) < 500 ? 0.8 : 0.6);
    }
  } else if (columnName === "공급처") {
    const re = new RegExp(SUPPLIER_SUFFIX_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(windowText)) !== null) {
      addCand(m[0], "rawText 상호 패턴", 0.75);
    }
    // 추가: rawText 전체에서도 상호 추출
    const reAll = new RegExp(SUPPLIER_SUFFIX_RE.source, "g");
    while ((m = reAll.exec(rawText)) !== null) {
      addCand(m[0], "rawText 상호 전체", 0.55);
    }
  } else if (columnName === "규격") {
    const re = new RegExp(SPEC_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(windowText)) !== null) {
      addCand(m[0], "rawText 규격 패턴", 0.75);
    }
  } else if (columnName === "품명") {
    // 한글 4자 이상 토큰 — 품명 앵커 근처
    const re = new RegExp(KOREAN_WORD_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(windowText)) !== null) {
      if (m[0] === anchorName) continue; // 현재 값 skip
      addCand(m[0], "rawText 한글 토큰", 0.65);
    }
  } else {
    // 기타 컬럼: 윈도우에서 짧은 토큰 (20자 이하 비공백 연속)
    const re = /[^\s]{2,20}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(windowText)) !== null) {
      addCand(m[0], "rawText 근처 토큰", 0.45);
    }
  }

  // ───── 로직 2: 컬럼 지문 (같은 페이지 동 컬럼 값) ─────
  if (targetIdx >= 0) {
    for (let i = 0; i < rows.length; i++) {
      if (i === rowIndex) continue;
      const v = String(rows[i]?.[targetIdx] ?? "").trim();
      if (!v) continue;
      // 형식 유사도: 공급처·사업자번호는 전체 재사용 가능, 품명·규격은 참고만
      const conf = columnName === "사업자번호" || columnName === "공급처" ? 0.6 : 0.45;
      addCand(v, `같은 페이지 ${columnName} 컬럼`, conf);
    }
  }

  // (로직 3 크로스 페이지 참조 — 2026-07-16 제거: 개별 명세표 스코프 정책)

  // ───── 포맷 매칭 부스트 (2026-07-16) ─────
  // 사용자 요청: "포멧에 맞는거 우선으로 재추출"
  //   1) 현재 값과 같은 포맷 시그니처 → +0.20
  //   2) 컬럼 지배적 포맷과 일치 → +0.15
  //   3) 컬럼별 고정 패턴 (사업자번호/규격 등) 정규식 재검증 통과 → +0.15
  //   포맷 불일치는 감점하지 않음 (후보 자체는 유지, 순위만 조정)
  const currentSig = currentValue ? formatSignature(currentValue) : null;
  const colValues = targetIdx >= 0
    ? rows.map((r, i) => i === rowIndex ? "" : String(r?.[targetIdx] ?? "").trim()).filter(Boolean)
    : [];
  const domFormat = dominantFormat(colValues);

  const fixedPatterns: Record<string, RegExp> = {
    "사업자번호": /^\d{3}-\d{2}-\d{5}$/,
    "규격": /^\d+(?:\.\d+)?(?:mg|mL|ml|g|kg|정|캡슐|cap|Tab|tab|개|박스|EA|ea|포|매|장|병|튜브|앰플|vial|u|IU|iu|mcg|μg|L|cc)$/i,
  };
  const fixedRe = fixedPatterns[columnName];

  for (const c of candidates) {
    const cSig = formatSignature(c.value);
    if (currentSig && cSig === currentSig) {
      c.confidence += 0.20;
      c.source = `${c.source} · 포맷일치(원본)`;
    }
    if (domFormat && cSig === domFormat) {
      c.confidence += 0.15;
      c.source = `${c.source} · 컬럼지배포맷`;
    }
    if (fixedRe && fixedRe.test(c.value)) {
      c.confidence += 0.15;
      c.source = `${c.source} · 고정패턴OK`;
    }
    if (c.confidence > 1.0) c.confidence = 1.0;
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}
