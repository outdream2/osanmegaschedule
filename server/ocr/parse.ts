import { INVOICE_SCHEMA } from "./schema";
import { isDeliveryOrAdminInfo } from "./invoice-vocab";

const OCR_RECIPIENTS: string[] = (process.env.OCR_RECIPIENT ?? "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export function sanitizeOcrMeta(meta: any): any {
  if (!meta || !meta.supplier) return meta;
  const sup = String(meta.supplier).trim();
  // 1) 배송·행정 정보 라벨은 supplier 로 부적합 → null
  if (isDeliveryOrAdminInfo(sup)) return { ...meta, supplier: null };
  // 2) 사용자 수신처 (약국 체인) → null
  const supLC = sup.toLowerCase();
  const isRecipient = OCR_RECIPIENTS.some(r => supLC.includes(r));
  return isRecipient ? { ...meta, supplier: null } : meta;
}

export function cleanCellValues(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows    = Array.isArray(rows) ? rows : [];
  const clean = (v: string | number | null): string | number | null => {
    if (typeof v !== "string") return v;
    return v.replace(/[\x00-\x1F\x7F]+/g, "").trim() || null;
  };
  return {
    headers: safeHeaders.map(h => String(h ?? "").replace(/[\x00-\x1F\x7F]+/g, "").trim()),
    rows: safeRows.filter(row => Array.isArray(row)).map(row => row.map(clean)),
  };
}

/**
 * 인접 헤더 셀 병합 (2-token + 노이즈 셀 흡수)
 *
 * 2026-07-09 확장:
 *   - 노이즈 셀(단독 한글 1자 중 사전에 없는 것) 제거 → EasyOCR/ONNX 가 "숲", "@" 등 뽑아낸 것 흡수
 *   - COMPOUNDS 확장 (일자·부가·공급 관련 다수 추가)
 *   - 오독 대응 헤더 매핑: "품로명" → "품명", "품로", "품 로" 등
 */
export function mergeAdjacentHeaders(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const COMPOUNDS: [string, string, string][] = [
    ["품", "명", "품명"], ["품", "목", "품목"], ["상품", "명", "상품명"], ["제품", "명", "제품명"],
    ["수", "량", "수량"], ["단", "가", "단가"], ["금", "액", "금액"], ["가", "액", "가액"],
    ["세", "액", "세액"], ["규", "격", "규격"], ["단", "위", "단위"], ["포", "장", "포장"],
    ["비", "고", "비고"], ["적", "요", "적요"], ["번", "호", "번호"],
    ["발행", "일자", "발행일자"], ["전표", "일자", "전표일자"], ["월", "일", "월일"],
    ["거래", "일자", "거래일자"], ["발행", "일", "발행일"], ["일", "자", "일자"],
    ["총매출", "액", "총매출액"], ["공급", "가액", "공급가액"], ["공급", "가", "공급가"],
    ["부가", "세", "부가세"], ["합계", "금액", "합계금액"],
    ["유통", "기한", "유통기한"], ["소비", "기한", "소비기한"], ["유효", "기한", "유효기한"],
    ["상품", "코드", "상품코드"], ["품목", "코드", "품목코드"], ["바", "코드", "바코드"],
  ];

  // 오독 → 표준 헤더 매핑 (한 칸으로 병합된 상태의 오탈자)
  const MISREAD_MAP: [RegExp, string][] = [
    [/^품\s*로\s*명$/, "품명"], [/^품\s*로$/, "품명"], [/^품\s*목\s*명$/, "품목명"],
    [/^공\s*급\s*가\s*역$/, "공급가액"], [/^부\s*가\s*세$/, "부가세"],
    [/^수\s*량\s*\([단개]?$/, "수량"], [/^인\s*지$/, "번호"],
  ];

  // 노이즈 셀 판정: 단독 특수문자, 단독 자모/한글 1자 중 헤더 어휘와 무관한 것
  const NOISE_SINGLES = new Set(["숲", "@", "*", "※", "~", "+", "-", "·", "•", "▪", "■", "□"]);
  const isNoise = (s: string): boolean => {
    const t = s.trim();
    if (!t) return true;
    if (t.length === 1 && NOISE_SINGLES.has(t)) return true;
    // 한글 1자인데 헤더 COMPOUND 첫 글자 후보에 없으면 노이즈
    if (t.length === 1 && /[가-힣]/.test(t)) {
      const compoundFirsts = new Set(COMPOUNDS.map(c => c[0]));
      const compoundSeconds = new Set(COMPOUNDS.map(c => c[1]));
      if (!compoundFirsts.has(t) && !compoundSeconds.has(t)) return true;
    }
    return false;
  };

  // 1단계: 오독 매핑 적용
  let merged = headers.map(h => {
    const t = (h ?? "").trim();
    for (const [re, std] of MISREAD_MAP) if (re.test(t)) return std;
    return t;
  });

  // 2단계: 노이즈 셀 인덱스 수집 (삭제 대상)
  const dropIdx = new Set<number>();
  for (let i = 0; i < merged.length; i++) {
    if (isNoise(merged[i])) dropIdx.add(i);
  }

  // 3단계: 노이즈 제거된 헤더/행으로 재구성
  const kept = merged.map((_, i) => i).filter(i => !dropIdx.has(i));
  let workHeaders = kept.map(i => merged[i]);
  let workRows = rows.filter(row => Array.isArray(row)).map(row => kept.map(i => row[i]));

  // 4단계: 2-token 인접 병합
  const mergeAt = new Set<number>();
  for (let i = 0; i < workHeaders.length - 1; i++) {
    const a = workHeaders[i], b = workHeaders[i + 1];
    for (const [p1, p2, result] of COMPOUNDS) {
      if (a === p1 && b === p2) { workHeaders[i] = result; mergeAt.add(i + 1); break; }
    }
  }
  if (mergeAt.size > 0) {
    const keep2 = workHeaders.map((_, i) => i).filter(i => !mergeAt.has(i));
    const pairs = new Map<number, number>();
    for (const mi of mergeAt) pairs.set(mi - 1, mi);
    workRows = workRows.map(row => {
      const r = [...row];
      for (const [ai, bi] of pairs) {
        if (bi < row.length && row[bi] != null && String(row[bi]).trim()) {
          r[ai] = r[ai] != null ? `${String(r[ai])} ${String(row[bi])}`.trim() : row[bi];
        }
      }
      return keep2.map(i => r[i]);
    });
    workHeaders = keep2.map(i => workHeaders[i]);
  }

  return { headers: workHeaders, rows: workRows };
}

export function normalizeInvoiceCols(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const mapping = INVOICE_SCHEMA
    .map(s => ({ std: s.name, oi: headers.findIndex(h => s.re.test(h.trim().replace(/\s+/g, ""))) }))
    .filter(m => m.oi >= 0);

  const usedIdx = new Set(mapping.map(m => m.oi));
  const extra = headers.map((h, i) => ({ h, i })).filter(({ i }) => !usedIdx.has(i));

  const outHeaders = [...mapping.map(m => m.std), ...extra.map(e => e.h)];
  const outRows    = rows.filter(row => Array.isArray(row)).map(row => [
    ...mapping.map(m => row[m.oi]),
    ...extra.map(e => row[e.i]),
  ]);

  // ── 컬럼 데이터 지문 (fingerprint) — 헤더 정규식 실패해도 데이터 패턴으로 보정 (2026-07-10) ──
  //   예) "수강" (OCR 오독) → 컬럼 값이 모두 1~99 정수 → "수량" 으로 자동 승격
  //   예) 헤더가 "단 가" 라도 매칭 실패 시 → 값이 500~99999 정수쌍 → "단가" 로 승격
  const stdSet: Set<string> = new Set(INVOICE_SCHEMA.map(s => s.name));
  const alreadyStd: Set<string> = new Set(outHeaders.filter(h => stdSet.has(h)));
  const inferred = inferColumnTypesByData(outHeaders, outRows, alreadyStd);
  if (inferred.length > 0) {
    const finalHeaders = outHeaders.map((h, i) => inferred.find(x => x.idx === i)?.std ?? h);
    return { headers: finalHeaders, rows: outRows };
  }
  return { headers: outHeaders, rows: outRows };
}

/**
 * 컬럼 데이터 지문 (2026-07-10)
 *
 * 헤더 이름 매칭 실패해도 데이터 패턴으로 컬럼 종류 추정.
 *
 * 시그널:
 *   · 수량: 값 대부분 1~999 정수 + 셀 60% 이상 채워짐
 *   · 단가: 값 대부분 100~999999 정수 + 셀 60% 이상 채워짐 + 평균이 수량보다 큰 컬럼
 *   · 금액: 값 대부분 1000~9999999 정수 + 평균이 단가보다 큰 컬럼
 *   · 유통기한: 날짜 패턴 (YYYY-MM-DD · YYYY.MM.DD · YYYYMMDD · YYMM 등)
 *   · 규격: mg/ml/g/T/C/EA 패턴
 *   · 품명: 문자열 대부분 + 평균 길이 5자 이상 + 순수 숫자 아님
 *
 * 이미 표준 헤더로 매핑된 컬럼은 건드리지 않음.
 * 여러 컬럼이 같은 후보로 나오면 스코어 최상단 하나만 채택.
 */
export function inferColumnTypesByData(
  headers: string[],
  rows: (string | number | null)[][],
  alreadyStd: Set<string> = new Set(),
): Array<{ idx: number; std: string; score: number }> {
  if (rows.length === 0 || headers.length === 0) return [];

  type ColStat = {
    idx: number;
    header: string;
    total: number;
    numeric: number;         // 숫자로 파싱 되는 셀 수
    strLen: number;          // 문자열 총 길이
    strCount: number;        // 문자열 셀 수
    ints: number[];          // 파싱된 정수 값
    hasDate: number;         // 날짜 패턴 매치 수
    hasSpec: number;         // mg/ml/T/C 등 매치 수
    hasKorean: number;       // 한글 포함 셀 수
    alphaPrefix: number;     // 알파벳 접두어 (A100582 · B12345 · GP01234) — 상품/배치 코드
    commaFmt: number;        // 쉼표 포맷 숫자 (12,345) — 금액/단가 힌트
  };

  //   날짜: YYYY-MM-DD · YYYY.MM.DD · YYYY/MM/DD · YYYYMMDD (20XX 시작) · YYYY.MM · YYYY-MM
  //   ⚠ 순수 6~7자리 숫자는 상품/배치 코드일 확률 큰 → 제외
  const DATE_RE = /^20\d{2}[-.\/]\d{1,2}(?:[-.\/]\d{1,2})?$|^20\d{6}$/;
  const SPEC_RE_LOCAL = /^\d+\s*(mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea|ML|MG|G)\b/i;
  const ALPHA_CODE_RE = /^[A-Z]{1,3}\d{3,}/i;
  const COMMA_NUM_RE = /^\d{1,3}(,\d{3})+$/;
  const KOREAN_RE = /[가-힣]/;

  const stats: ColStat[] = headers.map((h, idx) => ({
    idx, header: h, total: 0, numeric: 0, strLen: 0, strCount: 0, ints: [], hasDate: 0, hasSpec: 0, hasKorean: 0, alphaPrefix: 0, commaFmt: 0,
  }));

  // 사용자 통찰 (2026-07-10): "각 행에서 가장 긴 셀 = 상품명일 확률 매우 높음"
  //   → 행마다 가장 긴 셀 이 어느 컬럼인지 카운트 → 승률 가장 높은 컬럼 = 품명
  const rowLongestWinsPerCol = new Array(headers.length).fill(0);

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    let rowMaxLen = 0;
    let rowMaxIdx = -1;
    for (let c = 0; c < headers.length; c++) {
      const v = row[c];
      if (v == null || v === "") continue;
      const st = stats[c]; st.total++;
      const s = typeof v === "number" ? String(v) : String(v).trim();
      // 행 내 최장 셀 감지 (숫자 코드 · 8자리 이상 · 순수 숫자는 제외 → 상품명 후보만 카운트)
      const isPureCode = /^\d{4,}$/.test(s) || /^[A-Z]\d{3,}$/i.test(s);
      if (!isPureCode && s.length > rowMaxLen) {
        rowMaxLen = s.length;
        rowMaxIdx = c;
      }
      if (typeof v === "number" && Number.isFinite(v)) {
        st.numeric++;
        if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.001) st.ints.push(Math.round(v));
      } else {
        st.strCount++; st.strLen += s.length;
        if (DATE_RE.test(s)) st.hasDate++;
        if (SPEC_RE_LOCAL.test(s)) st.hasSpec++;
        if (KOREAN_RE.test(s)) st.hasKorean++;
        if (ALPHA_CODE_RE.test(s)) st.alphaPrefix++;
        if (COMMA_NUM_RE.test(s)) st.commaFmt++;
        // 문자열 안에 숫자 있어도 숫자 컬럼으로 인정 (쉼표·마침표 오독)
        const cleaned = s.replace(/[^0-9]/g, "");
        if (/^\d+$/.test(cleaned) && cleaned.length >= 1 && cleaned.length <= 10) {
          const n = parseInt(cleaned, 10);
          if (Number.isFinite(n)) { st.numeric++; st.ints.push(n); }
        }
      }
    }
    // 행 내 최장 셀이 4자 이상이면 해당 컬럼에 승 (짧은 건 무의미)
    if (rowMaxIdx >= 0 && rowMaxLen >= 4) rowLongestWinsPerCol[rowMaxIdx]++;
  }

  const results: Array<{ idx: number; std: string; score: number }> = [];
  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // 각 표준 헤더에 대해 최적 컬럼 후보 산출
  const candidates: Record<string, { idx: number; score: number }[]> = {
    수량: [], 단가: [], 금액: [], 유통기한: [], 규격: [], 품명: [],
  };

  for (const st of stats) {
    if (st.total === 0) continue;
    if (alreadyStd.has(st.header)) continue;   // 이미 표준화 된 컬럼 스킵
    // 이미 std 이름이면 스킵
    const fillRatio = st.total / rows.length;
    if (fillRatio < 0.3) continue;              // 30% 미만 채워짐 → 후보 제외

    const numRatio = st.total > 0 ? st.numeric / st.total : 0;
    const dateRatio = st.total > 0 ? st.hasDate / st.total : 0;
    const specRatio = st.total > 0 ? st.hasSpec / st.total : 0;
    const koreanRatio = st.total > 0 ? st.hasKorean / st.total : 0;
    const alphaCodeRatio = st.total > 0 ? st.alphaPrefix / st.total : 0;
    const commaFmtRatio = st.total > 0 ? st.commaFmt / st.total : 0;
    const med = median(st.ints);
    const avgLen = st.strCount > 0 ? st.strLen / st.strCount : 0;

    // 유통기한: 날짜 패턴 50% 이상
    if (dateRatio >= 0.5) {
      candidates.유통기한.push({ idx: st.idx, score: dateRatio * 100 + fillRatio * 20 });
    }
    // 규격: mg/ml/T 등 30% 이상
    if (specRatio >= 0.3) {
      candidates.규격.push({ idx: st.idx, score: specRatio * 100 + fillRatio * 20 });
    }
    // 알파벳 접두어 우세(A100582·B12345·GP01234) = 상품/배치 코드 → 금액/단가 후보 제외
    const isLikelyCode = alphaCodeRatio >= 0.3;
    // 수량: 숫자 60%+ · 중앙값 1~999 · 코드 컬럼 아님
    if (numRatio >= 0.6 && med >= 1 && med <= 999 && !isLikelyCode) {
      candidates.수량.push({ idx: st.idx, score: numRatio * 50 + fillRatio * 30 + (med >= 1 && med <= 100 ? 20 : 10) });
    }
    // 단가: 숫자 60%+ · 중앙값 100~99999 (좁힘) · 코드 아님
    if (numRatio >= 0.6 && med >= 100 && med <= 99999 && !isLikelyCode) {
      candidates.단가.push({ idx: st.idx, score: numRatio * 40 + fillRatio * 30 + (med >= 500 && med <= 50000 ? 25 : 5) + commaFmtRatio * 15 });
    }
    // 금액: 숫자 60%+ · 중앙값 1000~9999999 · 쉼표포맷 우세 (금액은 대개 쉼표 있음) · 코드 아님
    if (numRatio >= 0.6 && med >= 1000 && med <= 99999999 && !isLikelyCode) {
      candidates.금액.push({ idx: st.idx, score: numRatio * 40 + fillRatio * 30 + (med >= 5000 ? 15 : 5) + commaFmtRatio * 20 });
    }
    // 품명: 한글 필수 · 문자열 우세 · 길이 4자+
    //   사용자 통찰: "품명에 한글은 꼭 있고 각 행에서 가장 긴 셀"
    //   → 한글 30% 이상 + rowLongestWins 승률 가중치
    if (numRatio < 0.5 && avgLen >= 4 && koreanRatio >= 0.3) {
      const winRatio = rows.length > 0 ? rowLongestWinsPerCol[st.idx] / rows.length : 0;
      candidates.품명.push({
        idx: st.idx,
        score: koreanRatio * 40 + Math.min(avgLen, 30) * 4 + fillRatio * 15 + winRatio * 80,
      });
    }
  }

  // 수량 < 단가 < 금액 순서 강제 (중앙값 기준)
  //   → 잘못된 후보 정렬 방지
  // 이미 다른 컬럼이 이 std 이름 차지 (alreadyStd) → 중복 배정 방지
  const chosen: Record<string, number> = {};
  const usedIdx = new Set<number>();
  const stdTaken = new Set(alreadyStd);
  // 유통기한/규격/품명은 먼저 확정 (기존에 없는 경우만)
  for (const std of ["유통기한", "규격", "품명"] as const) {
    if (stdTaken.has(std)) continue;
    const list = candidates[std].filter(c => !usedIdx.has(c.idx)).sort((a, b) => b.score - a.score);
    if (list.length > 0) {
      chosen[std] = list[0].idx;
      usedIdx.add(list[0].idx);
      stdTaken.add(std);
    }
  }
  // 수량 · 단가 · 금액 처리 (기존에 없는 것만)
  const qtyList = candidates.수량.filter(c => !usedIdx.has(c.idx)).sort((a, b) => b.score - a.score);
  const priList = candidates.단가.filter(c => !usedIdx.has(c.idx)).sort((a, b) => b.score - a.score);
  const amtList = candidates.금액.filter(c => !usedIdx.has(c.idx)).sort((a, b) => b.score - a.score);

  if (!stdTaken.has("수량") && qtyList.length > 0) {
    chosen["수량"] = qtyList[0].idx; usedIdx.add(qtyList[0].idx); stdTaken.add("수량");
  }
  if (!stdTaken.has("단가")) {
    const priBest = priList.find(c => !usedIdx.has(c.idx));
    if (priBest) { chosen["단가"] = priBest.idx; usedIdx.add(priBest.idx); stdTaken.add("단가"); }
  }
  if (!stdTaken.has("금액")) {
    const amtBest = amtList.find(c => !usedIdx.has(c.idx));
    if (amtBest) { chosen["금액"] = amtBest.idx; usedIdx.add(amtBest.idx); stdTaken.add("금액"); }
  }

  for (const [std, idx] of Object.entries(chosen)) {
    const cand = candidates[std as keyof typeof candidates]?.find(c => c.idx === idx);
    results.push({ idx, std, score: cand?.score ?? 0 });
  }
  return results;
}

const SPEC_UNIT_RE =
  /^(\d+(?:[./]\d+)*)\s*(mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?$/i;

export function parseSpecFromName(raw: string): { name: string; spec: string | null } {
  const s = raw.trim();

  const bracketM = s.match(/^(.*?)\s*[(\[]([\d\w./×xX\s%μ]+)[)\]]\s*$/);
  if (bracketM) {
    const cand = bracketM[2].trim();
    if (SPEC_UNIT_RE.test(cand))
      return { name: bracketM[1].trim(), spec: cand };
  }

  const spaceM = s.match(/^(.+?)\s+(\d[\d./]*\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?)$/i);
  if (spaceM) {
    const cand = spaceM[2].trim();
    if (SPEC_UNIT_RE.test(cand))
      return { name: spaceM[1].trim(), spec: cand };
  }

  const glueM = s.match(/^(.+?)(\d+(?:[./]\d+)?\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea))$/i);
  if (glueM && /\D$/.test(glueM[1])) {
    return { name: glueM[1].trim(), spec: glueM[2].trim() };
  }

  return { name: s, spec: null };
}

export function extractSpecFromName(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  const nameI = headers.indexOf("품명");
  if (nameI < 0) return { headers, rows };

  let specI = headers.indexOf("규격");
  let outHeaders = headers;
  const specWasAdded = specI < 0;

  if (specI < 0) {
    outHeaders = [...headers.slice(0, nameI + 1), "규격", ...headers.slice(nameI + 1)];
    specI = nameI + 1;
  }

  const outRows = rows.filter(row => Array.isArray(row)).map(row => {
    const r = [...row];
    // 규격 컬럼이 새로 추가된 경우 모든 행에 null을 삽입해 컬럼 정렬 유지
    if (specWasAdded && r.length < outHeaders.length) {
      r.splice(specI, 0, null);
    }

    const nameCellRaw = r[nameI];
    if (typeof nameCellRaw !== "string" || !nameCellRaw.trim()) return r;

    const existing = r[specI];
    if (existing != null && String(existing).trim()) return r;

    const { name, spec } = parseSpecFromName(nameCellRaw);
    if (!spec) return r;

    r[nameI] = name;
    r[specI] = spec;
    return r;
  });

  return { headers: outHeaders, rows: outRows };
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i);
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function safeParseNumber(val: any): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val).trim();
  const clean = s.replace(/[^0-9.,]/g, "");
  if (!clean) return null;
  // "15.000" → 15000 (OCR이 천 단위 쉼표를 마침표로 오독한 경우)
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/\./g, ""), 10);
  }
  const num = parseFloat(clean.replace(/,/g, ""));
  return isNaN(num) ? null : num;
}

/**
 * 컬럼 시프트 복원: 수량 × 단가 ≠ 금액인 행의 숫자 컬럼 값을 재배치합니다.
 *
 * 같은 이미지(페이지) 내에서 다른 행의 배치 패턴을 참고해 올바른 순서를 먼저 시도하고,
 * 그래도 실패하면 순열 탐색으로 수식이 맞는 배치를 찾아 반환합니다.
 */
export function repairColumnShift(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  const tI = headers.indexOf("세액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  const numCols = [qI, pI, aI, ...(tI >= 0 ? [tI] : [])];

  const mathOk = (row: (string | number | null)[]): boolean => {
    const q = safeParseNumber(row[qI]);
    const p = safeParseNumber(row[pI]);
    const a = safeParseNumber(row[aI]);
    if (q == null || p == null || a == null) return true;
    if (q <= 0 || p <= 0 || a <= 0) return true;
    const exp = Math.round(q * p);
    return Math.abs(exp - a) <= Math.max(1, exp * 0.01);
  };

  const numericVal = (row: (string | number | null)[], ci: number): number | null =>
    safeParseNumber(row[ci]);

  // 같은 이미지 내 유효 행들의 숫자 크기 순위 패턴 집계
  // (예: 금액이 가장 크고 단가가 그다음, 수량이 가장 작은 경우 → 순위=[2,1,0,...])
  const patternCounts = new Map<string, number>();
  for (const row of rows) {
    if (!Array.isArray(row) || !mathOk(row)) continue;
    const vals = numCols.map(ci => numericVal(row, ci));
    const nonNull = vals.filter(v => v !== null) as number[];
    if (nonNull.length < 3) continue;
    const sorted = [...nonNull].sort((a, b) => b - a);
    const pattern = vals.map(v => (v === null ? -1 : sorted.indexOf(v))).join(",");
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }
  const bestPattern: number[] | null =
    patternCounts.size > 0
      ? [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number)
      : null;

  return rows.filter(row => Array.isArray(row)).map(row => {
    if (mathOk(row)) return row;

    const vals = numCols.map(ci => numericVal(row, ci));
    const nonNull = vals.filter(v => v !== null) as number[];
    if (nonNull.length < 3) return row;

    // 1순위: 같은 이미지의 다른 유효 행 패턴으로 재배치
    if (bestPattern && bestPattern.length === numCols.length) {
      const sortedDesc = [...nonNull].sort((a, b) => b - a);
      const testRow = [...row];
      numCols.forEach((ci, j) => {
        if (bestPattern![j] >= 0 && bestPattern![j] < sortedDesc.length)
          testRow[ci] = sortedDesc[bestPattern![j]];
      });
      if (mathOk(testRow)) return testRow;
    }

    // 2순위: 순열 탐색 (최대 4개 숫자 = 최대 24가지)
    for (const perm of permutations(nonNull.slice(0, numCols.length))) {
      const testRow = [...row];
      numCols.slice(0, perm.length).forEach((ci, j) => { testRow[ci] = perm[j]; });
      if (mathOk(testRow)) return testRow;
    }

    // 3순위: 다른 컬럼(단위·박스수·개수·포장·순번 등)의 숫자 값도 후보로 포함
    // 예: 광동제약 명세서에서 "단위" 컬럼(1000, 2000)이 실제 수량이고 라벨된 "수량"(25044)이 로트번호
    // → 다른 컬럼 값 중 (X × 단가 ≈ 금액) 을 만족하는 값을 수량으로 사용
    const currentPrice = safeParseNumber(row[pI]);
    const currentAmount = safeParseNumber(row[aI]);
    if (currentPrice && currentAmount && currentPrice > 0 && currentAmount > 0) {
      const targetQty = currentAmount / currentPrice;
      if (Number.isFinite(targetQty) && targetQty > 0) {
        // 모든 셀을 훑어서 targetQty와 근접한 값을 찾음 (허용오차 1%)
        for (let ci = 0; ci < row.length; ci++) {
          if (ci === qI || ci === pI || ci === aI || ci === tI) continue;  // 이미 시도된 컬럼 제외
          const v = safeParseNumber(row[ci]);
          if (v == null || v <= 0) continue;
          if (Math.abs(v - targetQty) <= Math.max(1, targetQty * 0.01)) {
            const testRow = [...row];
            testRow[qI] = v;
            if (mathOk(testRow)) {
              // 원래 수량 위치에 있던 값(로트번호 등)은 비고로 이동 시도
              const bI = headers.indexOf("비고");
              const origQty = row[qI];
              if (bI >= 0 && (row[bI] == null || row[bI] === "") && origQty != null) {
                testRow[bI] = String(origQty);
              }
              return testRow;
            }
          }
        }
      }
    }

    return row;
  });
}

/**
 * 분리된 상품 행 병합 (OCR/표 구조 인식 실패로 품명 행 · 수치 행이 나뉜 경우)
 *
 * 실측 케이스 (유한양행):
 *   Row A: 유한양행 · "마그비역스연질캡슬" · — · — · — · 120C   ← 품명 있음, 수치 없음
 *   Row B: 유한양행 · —                    · 36 · 25,000 · — · 120c ← 품명 없음, 수치 있음
 *
 * → 병합:
 *   Row: 유한양행 · "마그비역스연질캡슬" · 36 · 25,000 · — · 120C
 *
 * 규칙:
 *   - 현재 행: 품명 존재 + (수량·단가·금액 셋 다 없음)
 *   - 다음 행: 품명 없음/공백 + (수량·단가·금액 중 하나 이상 있음)
 *   → 두 행 병합 · 다음 행은 스킵
 */
export function mergeSplitProductRows(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const nI = headers.indexOf("품명");
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (nI < 0) return rows;

  const isEmptyCell = (v: string | number | null): boolean => {
    if (v == null) return true;
    if (typeof v === "number") return v <= 0;
    const s = v.trim();
    return s === "" || s === "—" || s === "-";
  };

  const hasNumericFields = (row: (string | number | null)[]): boolean => {
    if (qI >= 0 && !isEmptyCell(row[qI])) return true;
    if (pI >= 0 && !isEmptyCell(row[pI])) return true;
    if (aI >= 0 && !isEmptyCell(row[aI])) return true;
    return false;
  };

  const hasName = (row: (string | number | null)[]): boolean => {
    return !isEmptyCell(row[nI]);
  };

  const merged: (string | number | null)[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    if (!Array.isArray(cur)) { merged.push(cur); continue; }

    const next = rows[i + 1];
    const canMerge =
      Array.isArray(next) &&
      hasName(cur) && !hasNumericFields(cur) &&
      !hasName(next) && hasNumericFields(next);

    if (canMerge) {
      // 두 행의 셀 개수 맞추기 · cur 을 기준으로 복사
      const combined: (string | number | null)[] = [...cur];
      // next 의 non-empty 셀로 combined 채우기 (품명은 cur 유지)
      const len = Math.max(cur.length, next.length);
      for (let ci = 0; ci < len; ci++) {
        if (ci === nI) continue; // 품명은 cur 유지
        const nv = ci < next.length ? next[ci] : null;
        if (isEmptyCell(nv)) continue;
        const cv = ci < combined.length ? combined[ci] : null;
        // combined 가 비어있을 때만 next 값으로 채움
        if (isEmptyCell(cv)) combined[ci] = nv;
      }
      merged.push(combined);
      i++; // next 스킵
      continue;
    }
    merged.push(cur);
  }
  return merged;
}

/**
 * 합계금액 기반 보정 (1순위 보정 수단):
 * 명세서 합계(statedTotal)를 절대 기준으로 삼아 행 금액을 보정합니다.
 * 전략 순서: ① 수량×단가 역산 ② 단일 행 자릿수 ③ 두 행 조합 자릿수
 */
export function fixAmountsBySubtotal(
  headers: string[],
  rows: (string | number | null)[][],
  statedTotal: number | null
): (string | number | null)[][] {
  if (statedTotal == null || statedTotal <= 0) return rows;

  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (aI < 0) return rows;

  rows = rows.filter(row => Array.isArray(row));

  const getAmt = (row: (string | number | null)[]) =>
    typeof row[aI] === "number" ? (row[aI] as number) : 0;
  const sumRows = (r: (string | number | null)[][]) => r.reduce((s, row) => s + getAmt(row), 0);

  const currentTotal = sumRows(rows);
  if (Math.abs(currentTotal - statedTotal) <= 1) return rows;

  // 전략 1: 수량×단가로 금액 역산 (합계가 맞아지는 행만 교체)
  if (qI >= 0 && pI >= 0) {
    const candidate = rows.map(row => {
      const q = safeParseNumber(row[qI]);
      const p = safeParseNumber(row[pI]);
      const a = getAmt(row);
      if (q == null || p == null || q <= 0 || p <= 0) return row;
      const calc = Math.round(q * p);
      if (calc > 0 && Math.abs(calc - a) > Math.max(1, a * 0.01)) {
        const r = [...row]; r[aI] = calc; return r;
      }
      return row;
    });
    if (Math.abs(sumRows(candidate) - statedTotal) <= 1) return candidate;
  }

  // 전략 2: 단일 행 자릿수 오독 보정 (×10, ×100, ×1000, ÷10, ÷100, ÷1000)
  const scales = [10, 100, 1000, 0.1, 0.01, 0.001];
  for (let ri = 0; ri < rows.length; ri++) {
    const a = getAmt(rows[ri]);
    if (a <= 0) continue;
    for (const scale of scales) {
      const na = Math.round(a * scale);
      if (na <= 0) continue;
      if (Math.abs(currentTotal - a + na - statedTotal) <= 1) {
        const r = [...rows[ri]]; r[aI] = na;
        return [...rows.slice(0, ri), r, ...rows.slice(ri + 1)];
      }
    }
  }

  // 전략 3: 두 행 조합 자릿수 보정
  const scales2 = [10, 100, 0.1, 0.01];
  for (let ri = 0; ri < rows.length; ri++) {
    const a1 = getAmt(rows[ri]);
    if (a1 <= 0) continue;
    for (const s1 of scales2) {
      const na1 = Math.round(a1 * s1);
      if (na1 <= 0) continue;
      const partial = currentTotal - a1 + na1;
      for (let rj = ri + 1; rj < rows.length; rj++) {
        const a2 = getAmt(rows[rj]);
        if (a2 <= 0) continue;
        for (const s2 of scales2) {
          const na2 = Math.round(a2 * s2);
          if (na2 <= 0) continue;
          if (Math.abs(partial - a2 + na2 - statedTotal) <= 1) {
            const r1 = [...rows[ri]]; r1[aI] = na1;
            const r2 = [...rows[rj]]; r2[aI] = na2;
            return rows.map((row, i) => i === ri ? r1 : i === rj ? r2 : row);
          }
        }
      }
    }
  }

  return rows;
}

/**
 * 페이지 내 교차 검증 (intra-page cross-validation):
 * 같은 이미지 내에서 수량×단가=금액이 성립하는 "신뢰 행"들의 자릿수 분포를 기준으로
 * 나머지 행의 수치 이상 여부를 감지하고 자동 보정합니다.
 *
 * 거래명세서 한 장은 같은 공급사·같은 일자이므로 수량/단가/금액의 자릿수 범위가
 * 행마다 유사하다는 특성을 활용합니다.
 */
// ─────────────────────────────────────────────────────────────────────────
// 컬럼 위치 힌트 (2026-07-09 · 사용자 도메인 규칙)
//
// "보통 수량 옆이 단가" — 거래명세표 관습.
// 헤더가 부분적으로만 인식됐을 때 (예: 수량 O, 단가 X) 위치로 라벨 복구.
//
// 규칙:
//   1) "수량" 헤더 존재 & 다음 컬럼(i+1)이 미확인(빈 라벨 or 알수없는 라벨) & 데이터 다수가 숫자
//      → i+1 을 "단가" 로 라벨링
//   2) "단가" 헤더 존재 & 다음 컬럼이 미확인 & 데이터 다수가 큰 숫자 (>1000)
//      → i+1 을 "금액" 으로 라벨링
//   3) 이미 "단가"/"금액" 라벨이 있으면 건드리지 않음
// ─────────────────────────────────────────────────────────────────────────

const STD_HEADERS = new Set(["품명", "수량", "단가", "금액", "규격", "유통기한", "단위", "세액", "비고", "일자", "번호"]);

export function applyPositionalHints(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][] } {
  if (headers.length < 2) return { headers, rows };

  const outHeaders = [...headers];
  const isUnknown = (h: string) => !h || !STD_HEADERS.has(h.trim());

  const numericRatio = (colIdx: number): number => {
    if (rows.length === 0) return 0;
    let numCount = 0;
    let nonNull = 0;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v == null || String(v).trim() === "") continue;
      nonNull++;
      const s = String(v).replace(/[,\s]/g, "");
      if (/^-?\d+(\.\d+)?$/.test(s)) numCount++;
    }
    return nonNull === 0 ? 0 : numCount / nonNull;
  };

  const avgNumericValue = (colIdx: number): number => {
    const vals: number[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v == null) continue;
      const s = String(v).replace(/[,\s]/g, "");
      const n = parseFloat(s);
      if (Number.isFinite(n) && n > 0) vals.push(n);
    }
    return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const 수량Idx = outHeaders.indexOf("수량");
  const 단가Idx = outHeaders.indexOf("단가");
  const 금액Idx = outHeaders.indexOf("금액");

  // 규칙 1: 수량 옆이 단가
  if (수량Idx >= 0 && 단가Idx < 0 && 수량Idx + 1 < outHeaders.length) {
    const nextIdx = 수량Idx + 1;
    if (isUnknown(outHeaders[nextIdx]) && numericRatio(nextIdx) >= 0.5) {
      console.log(`[parse] 위치 힌트: 컬럼[${nextIdx}] "${outHeaders[nextIdx]}" → "단가" (수량 옆)`);
      outHeaders[nextIdx] = "단가";
    }
  }

  // 규칙 2: 단가 옆이 금액 (수량 힌트로 단가가 방금 복구됐다면 그 다음 자리)
  const 단가Idx2 = outHeaders.indexOf("단가");
  if (단가Idx2 >= 0 && outHeaders.indexOf("금액") < 0 && 단가Idx2 + 1 < outHeaders.length) {
    const nextIdx = 단가Idx2 + 1;
    if (isUnknown(outHeaders[nextIdx]) && numericRatio(nextIdx) >= 0.5 && avgNumericValue(nextIdx) > 1000) {
      console.log(`[parse] 위치 힌트: 컬럼[${nextIdx}] "${outHeaders[nextIdx]}" → "금액" (단가 옆 · 평균 1000+)`);
      outHeaders[nextIdx] = "금액";
    }
  }

  return { headers: outHeaders, rows };
}

// ─────────────────────────────────────────────────────────────────────────
// 셀 타입 검증 (2026-07-09 · 에이전트 조사 반영)
//
// 컬럼별 최소 도메인 규칙:
//   품명   — 한글/영문 최소 2자 · @ * ※ prefix 제거 · 코드/날짜/단독단위면 null
//   수량   — 정수 1~99999 · 한글 있으면 null · "5개"/"10정" → 5/10 auto-clean
//   단가/금액/세액 — 양수 · 한글 있으면 null · p→0/l→1/o→0 OCR char 보정
//   규격   — 반드시 숫자+단위 조합 포함 · "TEA"→"1EA" · 한글 3자+단위없음이면 null
//   유통기한 — YYYY-MM-DD 정규화 · 년도 범위 검증
// ─────────────────────────────────────────────────────────────────────────

type CellIssue = { rowIdx: number; col: string; before: any; after: any; rule: string };

const V_KOREAN = /[가-힣]/;
const V_HAS_LETTER = /[가-힣A-Za-z]/;
const V_CODE_PAT = /^[A-Z]\d{5,7}(\s+\S+)?$/;
const V_DATE_PAT = /^(20\d{2})[-./ ]?(0?[1-9]|1[0-2])[-./ ]?(0?[1-9]|[12]\d|3[01])$/;
const V_UNIT_ONLY = /^(mg|mcg|ug|μg|g|kg|ml|mL|L|IU|mEq|%|T|C|V|정|캡슐|포|개|EA|ea|BOX|박스|호)$/i;
const V_SPEC_PAT = /\d+\s*(mg|mcg|ug|μg|g|kg|ml|mL|L|IU|mEq|%|T|C|V|정|캡슐|포|개|EA|ea|BOX|박스|호)/i;

// OCR 이 숫자를 영문으로 오독하는 경우 (0↔o, 1↔l, 0↔p, 8↔B)
const V_OCR_CHAR_FIX = (s: string) =>
  s.replace(/[pP](?=\d)|(?<=\d)[pP]/g, "0")
   .replace(/[oO](?=\d)|(?<=\d)[oO]/g, "0")
   .replace(/[Il](?=\d)|(?<=\d)[Il]/g, "1")
   .replace(/(?<=\d)B(?=\d)/g, "8");

function vParseInt(v: any): number | null {
  if (v == null) return null;
  // 공백도 남겨서 "26 197" 같은 스페이스 구분자 처리
  let s = String(v).trim().replace(/[^\d.,\s]/g, "");
  if (!s) return null;
  // "26 197" → "26197" (스페이스 천단위)
  s = s.replace(/\s+/g, "");
  if (!s) return null;
  // 닷 + 콤마 혼재 → 둘 다 천단위 오독으로 취급 (예: "1.800,000" → 1800000)
  if (s.includes(".") && s.includes(",")) {
    const n = parseInt(s.replace(/[.,]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  // "1.000", "1.980.000" 같은 마침표 천단위 오독
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ""), 10);
  // 정상 쉼표 천단위 or 순수 정수
  if (/^\d{1,3}(,\d{3})+$/.test(s) || /^\d+$/.test(s)) {
    return parseInt(s.replace(/,/g, ""), 10);
  }
  // 폴백: 모든 구분자 제거
  const num = parseInt(s.replace(/[.,]/g, ""), 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * 각 셀을 컬럼 도메인 규칙으로 검증 · 정리 · null 화
 * 파이프라인 위치: extractSpecFromName 뒤 · fixAmountsBySubtotal 앞
 */
export function validateCellTypes(
  headers: string[],
  rows: (string | number | null)[][]
): { headers: string[]; rows: (string | number | null)[][]; issues: CellIssue[] } {
  const idxOf = (h: string) => headers.indexOf(h);
  const iN = idxOf("품명"), iQ = idxOf("수량"), iP = idxOf("단가"),
        iA = idxOf("금액"), iS = idxOf("규격"), iE = idxOf("유통기한"), iT = idxOf("세액");
  const issues: CellIssue[] = [];

  const outRows = rows.filter(Array.isArray).map((row, r) => {
    const out = [...row];
    const put = (i: number, col: string, v: any, rule: string) => {
      if (i < 0) return;
      if (out[i] !== v) { issues.push({ rowIdx: r, col, before: out[i], after: v, rule }); out[i] = v; }
    };

    // ── 품명 ──
    if (iN >= 0 && typeof out[iN] === "string") {
      let s = String(out[iN]).replace(/^[@※*·•]+/, "").replace(/\s+/g, " ").trim();
      if (!V_HAS_LETTER.test(s) || V_CODE_PAT.test(s) || V_DATE_PAT.test(s) || V_UNIT_ONLY.test(s) || s.length < 2) {
        put(iN, "품명", null, "name-invalid");
      } else if (s !== out[iN]) {
        put(iN, "품명", s, "name-clean");
      }
    }

    // ── 수량 (정수 1~99999) ──
    if (iQ >= 0 && out[iQ] != null) {
      const raw = String(out[iQ]).trim();
      if (V_KOREAN.test(raw) && !/^\d/.test(raw)) {
        put(iQ, "수량", null, "qty-korean");
      } else {
        const n = vParseInt(raw);
        if (n == null || n <= 0 || n > 99999) put(iQ, "수량", null, "qty-range");
        else put(iQ, "수량", n, "qty-normalize");
      }
    }

    // ── 단가·금액·세액 (숫자 정제 + 상한 검증) ──
    const numChecks: [number, string, number][] = [
      [iP, "단가", 99_999_999],
      [iA, "금액", 999_999_999],
      [iT, "세액", 99_999_999],
    ];
    for (const [i, label, max] of numChecks) {
      if (i < 0 || out[i] == null) continue;
      let raw = String(out[i]).trim();
      if (V_KOREAN.test(raw)) { put(i, label, null, `${label}-korean`); continue; }
      if (/[a-zA-Z]/.test(raw)) raw = V_OCR_CHAR_FIX(raw);  // p→0 l→1 O→0 B→8
      // "1,000 2,000" 같은 복수 콤마 숫자 (진짜 이중값) 만 reject
      // "26 197" (스페이스 천단위 오독) 은 vParseInt 가 처리하므로 유지
      const commaBlocks = raw.match(/\d+(?:,\d{3})+/g) ?? [];
      if (commaBlocks.length >= 2) { put(i, label, null, `${label}-split`); continue; }
      const n = vParseInt(raw);
      if (n == null || n <= 0 || n > max) put(i, label, null, `${label}-range`);
      else put(i, label, n, `${label}-normalize`);
    }

    // ── 규격 (반드시 숫자+단위 조합) ──
    if (iS >= 0 && typeof out[iS] === "string") {
      const s = String(out[iS]).trim();
      if (V_DATE_PAT.test(s)) put(iS, "규격", null, "spec-is-date");
      else if (/^(TEA|TC|TV)$/i.test(s)) put(iS, "규격", "1" + s.slice(1), "spec-leading-1"); // TEA→1EA
      else if (V_KOREAN.test(s) && s.length >= 3 && !V_SPEC_PAT.test(s)) put(iS, "규격", null, "spec-name-bleed");
      else if (/^\d+$/.test(s)) put(iS, "규격", null, "spec-pure-int");
    }

    // ── 유통기한 (YYYY-MM-DD 정규화) ──
    if (iE >= 0 && out[iE] != null) {
      const s = String(out[iE]).replace(/\s+/g, "").trim();
      const m = s.match(V_DATE_PAT);
      if (!m) put(iE, "유통기한", null, "exp-format");
      else {
        const y = +m[1];
        if (y < 2020 || y > 2035) put(iE, "유통기한", null, "exp-range");
        else put(iE, "유통기한", `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, "exp-normalize");
      }
    }

    return out;
  });

  // ── 세액 vs 금액 부가세 10% 관계 검증 ──
  if (iA >= 0 && iT >= 0) outRows.forEach((row, r) => {
    const a = row[iA], t = row[iT];
    if (typeof a === "number" && typeof t === "number" && a > 0) {
      if (Math.abs(t - a * 0.1) / a > 0.02) {
        issues.push({ rowIdx: r, col: "세액", before: t, after: null, rule: "tax-vs-amount" });
        row[iT] = null;
      }
    }
  });

  return { headers, rows: outRows, issues };
}

export function crossValidateIntraPage(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  rows = rows.filter(row => Array.isArray(row));

  const pos = (row: (string | number | null)[], i: number): number | null => {
    const v = row[i];
    return typeof v === "number" && v > 0 ? v : null;
  };

  const mathOk = (q: number, p: number, a: number) => {
    const exp = Math.round(q * p);
    return Math.abs(exp - a) <= Math.max(1, exp * 0.01);
  };

  // 신뢰 행: 수량×단가=금액이 성립하는 행
  const trusted = rows.filter(row => {
    const q = pos(row, qI), p = pos(row, pI), a = pos(row, aI);
    return q != null && p != null && a != null && mathOk(q, p, a);
  });

  if (trusted.length < 2) return rows; // 기준 행 부족

  // 자릿수(order of magnitude) 계산
  const magOf = (v: number) => (v > 0 ? Math.floor(Math.log10(v)) : 0);

  // 최빈 자릿수 반환
  const magMode = (vals: number[]): number => {
    const cnt = new Map<number, number>();
    for (const v of vals) { const m = magOf(v); cnt.set(m, (cnt.get(m) ?? 0) + 1); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };

  const qMag = magMode(trusted.map(r => pos(r, qI)!));
  const pMag = magMode(trusted.map(r => pos(r, pI)!));
  const aMag = magMode(trusted.map(r => pos(r, aI)!));

  // 허용 자릿수 범위: 최빈값 ±1 자릿수
  const inRange = (v: number, mag: number) => Math.abs(magOf(v) - mag) <= 1;

  const scales = [10, 100, 0.1, 0.01];

  return rows.map(row => {
    const q = pos(row, qI), p = pos(row, pI), a = pos(row, aI);
    if (q == null || p == null || a == null) return row;
    if (mathOk(q, p, a)) return row; // 이미 유효

    const qBad = !inRange(q, qMag);
    const pBad = !inRange(p, pMag);
    const aBad = !inRange(a, aMag);

    // 전략 A: 자릿수 이상 컬럼만 스케일 보정 시도
    for (const [ci, bad, mag] of [
      [qI, qBad, qMag], [pI, pBad, pMag], [aI, aBad, aMag],
    ] as [number, boolean, number][]) {
      if (!bad) continue;
      const orig = row[ci] as number;
      for (const s of scales) {
        const nv = Math.round(orig * s);
        if (!inRange(nv, mag)) continue;
        const nq = ci === qI ? nv : q;
        const np = ci === pI ? nv : p;
        const na = ci === aI ? nv : a;
        if (nq > 0 && np > 0 && na > 0 && mathOk(nq, np, na)) {
          const r = [...row]; r[ci] = nv; return r;
        }
      }
    }

    // 전략 B: 자릿수는 정상이나 수식이 안 맞는 경우 → 각 컬럼 스케일 후 범위+수식 이중 검증
    if (!qBad && !pBad && !aBad) {
      for (const [ci, orig] of [[qI, q], [pI, p], [aI, a]] as [number, number][]) {
        for (const s of scales) {
          const nv = Math.round(orig * s);
          const nq = ci === qI ? nv : q;
          const np = ci === pI ? nv : p;
          const na = ci === aI ? nv : a;
          if (
            nq > 0 && np > 0 && na > 0 &&
            inRange(nq, qMag) && inRange(np, pMag) && inRange(na, aMag) &&
            mathOk(nq, np, na)
          ) {
            const r = [...row]; r[ci] = nv; return r;
          }
        }
      }
    }

    return row;
  });
}

/**
 * 상품코드로 보이는 좁은 패턴만 제거 (예: A200893, A201913, 1234567).
 * 영문 상품명(IBUPROFEN 400 등)은 제외하지 않도록 매우 좁게 매칭.
 */
export function filterCodeOnlyRows(
  headers: string[],
  rows: (string | number | null)[][]
): (string | number | null)[][] {
  const nI = headers.indexOf("품명");
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (nI < 0) return rows;
  const filtered = rows.filter(row => {
    if (!Array.isArray(row)) return false;
    const raw = row[nI];
    const name = raw == null ? "" : String(raw).trim();

    // ⚠ 품명 없거나 짧은 코드성 문자열 → 상품 필드 유무로 판정
    if (name.length === 0 || /^\d{4,8}$/.test(name) || /^[A-Z]\d{1,3}\s*\d{0,4}$/i.test(name)) {
      const hasQty   = qI >= 0 && typeof row[qI] === "number" && (row[qI] as number) > 0;
      const hasPrice = pI >= 0 && typeof row[pI] === "number" && (row[pI] as number) > 0;
      const hasAmt   = aI >= 0 && typeof row[aI] === "number" && (row[aI] as number) > 0;
      // 상품 필드 3개 중 2개 이상 있어야 상품 행으로 간주
      const hits = [hasQty, hasPrice, hasAmt].filter(Boolean).length;
      return hits >= 2;
    }
    // 1글자 대문자 + 5~7자리 숫자 (A200893, B12345 등)
    if (/^[A-Z]\d{5,7}$/.test(name)) return false;
    // 순수 숫자 7자리 이상 (SKU/바코드)
    if (/^\d{7,}$/.test(name)) return false;
    // 짧은 코드성 문자열 (A2, B3, A20, C123, A20 1302 등) — 상품명 아님
    if (/^[A-Z]\d{1,4}(\s+\d{1,5})?$/i.test(name) && name.length <= 10) return false;
    // 명세서 제목·라벨 텍스트 (거래명세표, 세금계산서 등 · 상품명 아님)
    const nameCompact = name.replace(/\s+/g, "");
    const INVOICE_TITLES = /^(거래명세표|거래명세서|명세표|명세서|납품서|발주서|세금계산서|영수증|인수증|출고증|입고증|반품서|반품표|매출전표|매입전표|입금표|출금표|전표|배송처|배송지|배송기사|기사명|차량번호|차람번호)$/;
    if (INVOICE_TITLES.test(nameCompact)) return false;
    return true;
  });
  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────
// rawText 기반 검증 · 보정 (Phase 2 · OCR 오독 자동 교정)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rawText 에서 발견되는 모든 쉼표 있는 금액 (예: 156,000 · 31,200) 추출.
 * OCR 이 숫자 셀에서 O↔0, l↔1, 자릿수 오독을 하면 rawText 에는 정답 있고
 * 표에는 오답 있는 상황이 자주 발생. 이 함수로 정답 후보군을 확보.
 */
function extractCommaAmountsFromRawText(rawText: string): Set<number> {
  const set = new Set<number>();
  if (!rawText) return set;
  // 쉼표 있는 3자리 그룹 숫자 · 최소 1,000 이상
  const matches = rawText.match(/\d{1,3}(?:,\d{3})+/g) ?? [];
  for (const m of matches) {
    const n = parseInt(m.replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n >= 100) set.add(n);
  }
  return set;
}

/**
 * OCR 오독 숫자 → rawText 실측 후보로 자동 보정.
 *
 * 규칙:
 *   1. 셀 값이 rawText 에 정확히 있으면 → 통과
 *   2. 없으면 rawText 후보 중 편집거리 1~2 이내 값 검색
 *   3. 있으면 그 값으로 교체 (예: "l56,000" → "156,000", "31,2OO" → "31,200")
 *   4. 자릿수 밀림 오독도 잡음 (0 하나 빠짐/추가)
 */
function correctNumberByRawText(current: number, rawCandidates: Set<number>): number | null {
  if (rawCandidates.has(current)) return current; // 이미 정답

  // 2026-07-14: 자릿수 밀림 특화 감지 (예: 508 → 508,508,000 → rawSet has 508000)
  //   현재 값의 뒤 6자리 · 뒤 5자리 · 앞 3자리 등이 rawCandidates 에 있으면 그것으로 교정
  //   현재 값 %와 정확 매칭도 확인
  const curStr = String(current);
  if (curStr.length >= 6) {
    // 뒤 절반이 rawSet 에 있으면 그걸 정답으로 (예: 508508000 → 508000)
    for (let take = curStr.length - 1; take >= 3; take--) {
      const suffix = parseInt(curStr.slice(curStr.length - take), 10);
      if (rawCandidates.has(suffix)) return suffix;
      const prefix = parseInt(curStr.slice(0, take), 10);
      if (rawCandidates.has(prefix)) return prefix;
    }
  }

  // 편집거리 1~2 이내 유사값 찾기 (문자열 레벨)
  let bestDist = Infinity;
  let bestCand: number | null = null;
  for (const cand of rawCandidates) {
    const cs = String(cand);
    // 자릿수 차이 ±1 이내만 후보 (자릿수 밀림 대응)
    if (Math.abs(cs.length - curStr.length) > 1) continue;
    // 문자열 편집거리 (간이)
    let dist = 0;
    const [longer, shorter] = cs.length >= curStr.length ? [cs, curStr] : [curStr, cs];
    dist += longer.length - shorter.length;
    for (let i = 0, j = 0; i < shorter.length; i++, j++) {
      if (shorter[i] !== longer[j]) { dist++; if (dist > 2) break; }
    }
    if (dist <= 2 && dist < bestDist) { bestDist = dist; bestCand = cand; }
  }
  return bestCand;
}

/**
 * rows 의 금액·단가 셀을 rawText 정답 후보로 검증·보정
 *
 * @returns 보정된 행 + 진단 (보정 개수)
 */
export function verifyRowsAgainstRawText(
  headers: string[],
  rows: (string | number | null)[][],
  rawText: string,
): { rows: (string | number | null)[][]; correctedCount: number } {
  if (!rawText) return { rows, correctedCount: 0 };
  const rawSet = extractCommaAmountsFromRawText(rawText);
  if (rawSet.size === 0) return { rows, correctedCount: 0 };

  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  const qI = headers.indexOf("수량");
  if (pI < 0 && aI < 0) return { rows, correctedCount: 0 };

  let corrected = 0;
  const newRows = rows.map(row => {
    if (!Array.isArray(row)) return row;
    const next = [...row];
    for (const ci of [pI, aI].filter(i => i >= 0)) {
      const v = next[ci];
      if (typeof v !== "number" || v <= 0) continue;
      // rawText 정답 후보 중에서 검증
      if (rawSet.has(v)) continue; // 쉼표 있는 정답
      // 2026-07-14 Fix: 원본 값이 rawText 에 문자로 존재하면 정답 (유저가 그렇게 썼음)
      //   예) rawText="A 10 500 5,000" 에서 단가 500 은 그대로 유지 (5000 으로 오교정 방지)
      const vStr = String(v);
      const literalInRaw = new RegExp(`(?:^|[^\\d])${vStr}(?:$|[^\\d])`).test(rawText);
      if (literalInRaw) continue;
      const fixed = correctNumberByRawText(v, rawSet);
      if (fixed != null && fixed !== v) {
        next[ci] = fixed;
        corrected++;
      }
    }
    // 수량 × 단가 = 금액 검증 (셋 다 있는 경우)
    if (qI >= 0 && pI >= 0 && aI >= 0) {
      const q = typeof next[qI] === "number" ? (next[qI] as number) : null;
      const p = typeof next[pI] === "number" ? (next[pI] as number) : null;
      const a = typeof next[aI] === "number" ? (next[aI] as number) : null;
      if (q != null && p != null && a != null && q > 0 && p > 0 && a > 0) {
        const expected = Math.round(q * p);
        // 2026-07-14 Fix: 1원 이상 차이 & rawText 에 정답 있으면 무조건 교정
        //   기존 max(1, a*0.01) 는 소액 오독(1원~1500원) 못 잡음 → 정확한 값 우선
        if (Math.abs(expected - a) >= 1 && rawSet.has(expected)) {
          next[aI] = expected;
          corrected++;
        }
      }
    }
    return next;
  });

  return { rows: newRows, correctedCount: corrected };
}

/**
 * 수량 × 단가 = 금액 관계에서 누락된 필드 자동 계산.
 *
 * 케이스 (모두 rawText 정답 후보 검증 병행):
 *   A) 수량 & 단가 있음, 금액 없음/0 → 금액 = 수량 × 단가
 *      · 계산값이 rawText 후보와 근사(±1) 하면 확신 · 아니어도 계산값 채움
 *   B) 수량 & 금액 있음, 단가 없음 → 단가 = 금액 / 수량 (정수로 나누어 떨어질 때만)
 *   C) 단가 & 금액 있음, 수량 없음 → 수량 = 금액 / 단가 (정수로 나누어 떨어질 때만)
 *
 * 파싱 검증:
 *   D) 셋 다 있는데 수량×단가 ≠ 금액 이고, rawText 에 정답 후보군에 계산값 존재 → 금액을 계산값으로 교체
 */
export function autoFillMissingMathField(
  headers: string[],
  rows: (string | number | null)[][],
  rawText: string = "",
): { rows: (string | number | null)[][]; filledCount: number; fixedCount: number } {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (qI < 0 || pI < 0 || aI < 0) return { rows, filledCount: 0, fixedCount: 0 };

  const rawSet = rawText ? extractCommaAmountsFromRawText(rawText) : new Set<number>();

  let filled = 0;
  let fixed = 0;
  const newRows = rows.map(row => {
    if (!Array.isArray(row)) return row;
    const next = [...row];
    const q = typeof next[qI] === "number" && (next[qI] as number) > 0 ? (next[qI] as number) : null;
    const p = typeof next[pI] === "number" && (next[pI] as number) > 0 ? (next[pI] as number) : null;
    const a = typeof next[aI] === "number" && (next[aI] as number) > 0 ? (next[aI] as number) : null;

    // A) 수량 & 단가 있음, 금액 없음
    if (q != null && p != null && a == null) {
      const expected = Math.round(q * p);
      if (expected > 0 && expected <= 999_999_999) {
        next[aI] = expected;
        filled++;
        return next;
      }
    }
    // B) 수량 & 금액 있음, 단가 없음
    if (q != null && a != null && p == null) {
      const calc = a / q;
      if (Number.isFinite(calc) && calc > 0) {
        const rounded = Math.round(calc);
        // 나누어 떨어지는지 (오차 0.01% 이내)
        if (Math.abs(rounded - calc) / calc < 0.0001) {
          next[pI] = rounded;
          filled++;
          return next;
        }
      }
    }
    // C) 단가 & 금액 있음, 수량 없음
    if (p != null && a != null && q == null) {
      const calc = a / p;
      if (Number.isFinite(calc) && calc > 0 && calc <= 99999) {
        const rounded = Math.round(calc);
        if (Math.abs(rounded - calc) / calc < 0.01) {
          next[qI] = rounded;
          filled++;
          return next;
        }
      }
    }
    // D) 셋 다 있는데 수식 불일치 → rawText 정답에 계산값 있으면 교체
    if (q != null && p != null && a != null) {
      const expected = Math.round(q * p);
      if (expected !== a && rawSet.has(expected)) {
        // rawText 에 계산값이 실존 → 금액 오독 확정
        next[aI] = expected;
        fixed++;
        return next;
      }
    }
    return next;
  });

  return { rows: newRows, filledCount: filled, fixedCount: fixed };
}

/**
 * rawText 라인 기반 상품 폴백 파서 (2026-07-10 v4).
 *
 * 배경:
 *   페이지 2 (광동): OCR 이 광동원탕 은 뽑고 광동쌍화탕(신형) 은 놓침 · rawText 엔 둘 다 있음
 *   페이지 3 (대웅): OCR 이 상품 행을 아예 못 잡음 · rawText 엔 완전한 상품 라인 있음
 *
 * 로직:
 *   각 라인을 스캔 → 아래 패턴 매칭:
 *     · 선택적 앞자리: 순번(1자리) 또는 상품코드 (5+자리 숫자)
 *     · 한글 포함 품명 (2자+)
 *     · 규격 (100ML, 500mg 등) 선택
 *     · 수량 (정수) · 단가 (숫자,숫자) · 금액 (숫자,숫자)
 *
 * 매칭된 라인 → { 품명, 수량, 단가, 금액, 규격 } 행으로 반환.
 * 기존 rows 와 병합 시: 품명 중복 제거 (유사도 검사).
 */
export function fallbackParseRowsFromRawText(
  rawText: string,
): { rows: (string | number | null)[][]; headers: string[]; matchedLines: string[] } {
  const headers = ["품명", "수량", "단가", "금액", "규격", "유통기한"];
  if (!rawText) return { rows: [], headers, matchedLines: [] };

  const rows: (string | number | null)[][] = [];
  const matchedLines: string[] = [];

  const parseNum = (s: string): number => {
    // "508,000" · "1.000" · "23,100" → 정수
    const clean = s.replace(/[,.]/g, "");
    return parseInt(clean, 10);
  };

  // 8자리 숫자가 유효한 날짜(YYYYMMDD)인지 검증 (2026-07-10 v4 · 유통기한 판정)
  //   조건: 20200101 ~ 20401231 범위 · 월 1~12 · 일 1~31
  const isValidDateYYYYMMDD = (n: number): boolean => {
    if (!Number.isInteger(n) || n < 20200101 || n > 20401231) return false;
    const yr = Math.floor(n / 10000);
    const mo = Math.floor((n % 10000) / 100);
    const dy = n % 100;
    if (mo < 1 || mo > 12) return false;
    if (dy < 1 || dy > 31) return false;
    // 실제 존재하는 날짜인지 (30/31일, 윤년 등) 대충 검증
    const d = new Date(yr, mo - 1, dy);
    return d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === dy;
  };

  // 라인에서 숫자 토큰 추출 (쉼표·마침표 있는 것 포함 · 순서 유지)
  //   · 유효 날짜(YYYYMMDD)로 판단되면 isDate 표시
  //   · 사용자 통찰(v4): "쉼표=금액, 마침표=수량/기타" 구분 → hasComma 표시
  //   → 금액 후보 선정 시 쉼표 포맷 우선
  const extractNumTokens = (line: string): { value: number; start: number; end: number; isDate: boolean; hasComma: boolean }[] => {
    // 2026-07-14 Fix: 8자리 YYYYMMDD 지원 (기존 최대 7자리)
    const NUM_TOKEN = /(\d{1,3}(?:[,.]\d{3})+|\d{1,8})/g;
    const tokens: { value: number; start: number; end: number; isDate: boolean; hasComma: boolean }[] = [];
    let m: RegExpExecArray | null;
    while ((m = NUM_TOKEN.exec(line))) {
      const raw = m[1];
      const v = parseNum(raw);
      if (!Number.isFinite(v) || v <= 0) continue;
      const cleanLen = raw.replace(/[,.]/g, "").length;
      const isDate = cleanLen === 8 && isValidDateYYYYMMDD(v);
      const hasComma = raw.includes(",");
      tokens.push({ value: v, start: m.index, end: m.index + raw.length, isDate, hasComma });
    }
    return tokens;
  };

  const HAS_KOREAN = /[가-힣]/;
  const lines = rawText.split(/\r?\n/);
  // Phase 2c (2026-07-14): 앞선 라인이 한글만 있고 다음 라인이 이어지는 상품명 감지용
  //   예: "더리를스 비타D부스터 200IU활성형비타" (line N)
  //       "민D3 칼슘골다공증뼈건강1BOX2개월 30 7,000 210,000" (line N+1)
  //   → 병합된 품명: "더리를스 비타D부스터 200IU활성형비타 민D3 칼슘골다공증뼈건강1BOX2개월"
  const isNameContinuationLine = (s: string): boolean => {
    if (s.length < 3) return false;
    const kcount = (s.match(/[가-힣]/g) ?? []).length;
    if (kcount < 2) return false;
    // 라인에 큰 숫자 없음 (수량·단가·금액 없음)
    const bigNumMatches = (s.match(/\d{2,}/g) ?? []).length;
    if (bigNumMatches >= 2) return false;
    // 헤더·합계 라인 스킵
    const compact = s.replace(/\s+/g, "");
    if (/^(품명|수량|단가|금액|합계|소계|공급가액|부가세|번호|NO)/i.test(compact)) return false;
    if (/^(합\s*계|소\s*계|총\s*합|총\s*계)/.test(s)) return false;
    return true;
  };
  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    const line = rawLine.trim();
    if (line.length < 6) continue;
    // 한글 최소 2자 포함해야 상품 라인 후보
    const koreanCount = (line.match(/[가-힣]/g) ?? []).length;
    if (koreanCount < 2) continue;
    // 헤더/합계 라인 skip
    const compact = line.replace(/\s+/g, "");
    if (/^(품명|수량|단가|금액|합계|소계|공급가액|부가세|번호|NO)/i.test(compact)) continue;
    if (/^(합\s*계|소\s*계|총\s*합|총\s*계)/.test(line)) continue;
    // 라인에서 모든 숫자 토큰 추출
    const allTokens = extractNumTokens(line);
    // 유통기한(YYYYMMDD 유효 날짜)은 별도로 저장 · 수량/단가/금액 후보에서 제외
    const dateTokens = allTokens.filter(t => t.isDate);
    const tokens = allTokens.filter(t => !t.isDate);
    if (tokens.length < 3) continue;
    // 임의의 3개 토큰 조합 중 X * Y = Z 만족하는 것 탐색
    //   페이지 2 광동: "1.000 25044 2028. 12.21 508 508,000" → (1000, 508, 508000) 매칭
    //   페이지 3 대웅: "100 23,100 2,310,000" → (100, 23100, 2310000) 매칭
    // 후보 우선순위: 금액(Z)은 쉼표 포맷 · 큰 값 우선 (사용자 통찰 v4)
    //   → 마침표만 있는 큰 숫자(예: 5.790)는 금액 아닐 확률 큼
    let matched: { qty: number; price: number; amt: number; nameEnd: number } | null = null;
    for (let a = 0; a < tokens.length - 2 && !matched; a++) {
      for (let b = a + 1; b < tokens.length - 1 && !matched; b++) {
        for (let c = b + 1; c < tokens.length && !matched; c++) {
          const [Q, P, A] = [tokens[a].value, tokens[b].value, tokens[c].value];
          // 수량은 1~99999, 단가는 100~999999, 금액은 단가보다 커야 함
          if (Q < 1 || Q > 99999) continue;
          if (P < 50 || P > 9999999) continue;
          if (A < P) continue;
          // 금액(A)이 큰 값(≥ 1만원)인데 쉼표 없이 마침표만 있으면 스킵 (사용자 통찰)
          //   예) "5.790" 이 금액 후보로 잡히는 것 방지
          if (A >= 10000 && !tokens[c].hasComma && !/\d{4,}$/.test(String(A))) continue;
          const expected = Q * P;
          if (Math.abs(expected - A) <= Math.max(1, A * 0.05)) {
            matched = { qty: Q, price: P, amt: A, nameEnd: tokens[a].start };
          }
        }
      }
    }
    if (!matched) continue;
    // 유통기한 문자열: 첫 유효 날짜 토큰 사용
    const expiryStr = dateTokens.length > 0
      ? (() => {
          const s = String(dateTokens[0].value);
          return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
        })()
      : null;
    // 첫 매칭 숫자 앞의 텍스트 = 품명 후보
    let namePart = line.slice(0, matched.nameEnd).trim();
    // 앞선 순번·상품코드 제거 (예: "1 모바렌캡슐..." · "10024 광동원탕...")
    namePart = namePart.replace(/^\d{1,7}\s+/, "");

    // Phase 2c (2026-07-14): 이전 라인이 상품명 연속(한글 있고 숫자 없음)이면 prepend
    //   페이지 6 앤바이오: "더리를스 비타D부스터 200IU활성형비타" + "민D3 칼슘..."
    if (li > 0) {
      const prevLine = lines[li - 1].trim();
      if (isNameContinuationLine(prevLine)) {
        namePart = `${prevLine} ${namePart}`.replace(/\s+/g, " ").trim();
        matchedLines.push(prevLine);   // 진단용
      }
    }
    // 한글이 실제로 있는지 확인
    if (!HAS_KOREAN.test(namePart)) continue;
    // 규격 추출 (100ML · 30V · 500mg 등 · 짧은 단위 패턴)
    const specM = namePart.match(/(\d+(?:[.,]\d+)?\s*(?:mg|ml|MG|ML|g|G|IU|mcg|정|캡슐|포|T|C|EA|V|BOX))/i);
    const spec = specM ? specM[1] : null;
    const cleanName = spec ? namePart.replace(specM![0], "").trim().replace(/\s+/g, " ") : namePart.replace(/\s+/g, " ");
    if (!HAS_KOREAN.test(cleanName)) continue;
    rows.push([cleanName, matched.qty, matched.price, matched.amt, spec, expiryStr]);
    matchedLines.push(line);
  }
  return { rows, headers, matchedLines };
}

/**
 * rawText 에서 헤더 라인 감지 (2026-07-14 Phase 2a).
 *
 * 배경: OCR 이 셀 단위로 헤더를 못 뽑을 때 (분리·오독), rawText 라인에는 종종
 *   "품 명 규 격 수량 단가 금 액 비 고" 같은 헤더 라인이 통째로 남아있음.
 *   이걸 감지해서 헤더 컨텍스트로 복구.
 *
 * 로직:
 *   1) 각 라인에서 표준 헤더 키워드(품명·규격·수량·단가·금액·유통기한·비고·번호) 매칭
 *   2) 3개 이상 매칭되면 헤더 라인 후보
 *   3) 최다 매칭 라인 선택 → 표준 필드 리스트 반환
 *
 * 반환: 매칭된 표준 필드 리스트 + 라인 인덱스
 */
export function detectHeaderLineInRawText(rawText: string): {
  headers: string[];
  linePosition: number;
  matchedTokens: string[];
} | null {
  if (!rawText) return null;
  // 표준 헤더 → 별칭 리스트 (짧은 것부터 순서 · OCR 오독 관대)
  const STD: Array<{ std: string; aliases: string[] }> = [
    { std: "번호",     aliases: ["번호", "순번", "no.", "no", "항번"] },
    { std: "품명",     aliases: ["품명", "품 명", "품로명", "제 품 명", "제품명", "품목", "품목명", "상품명"] },
    { std: "규격",     aliases: ["규격", "규 격", "사양"] },
    { std: "수량",     aliases: ["수량", "수 량", "수강", "수량량", "매수"] },
    { std: "단가",     aliases: ["단가", "단 가", "닌가", "가격", "unit price"] },
    { std: "금액",     aliases: ["금액", "금 액", "가액", "합계금액", "amount"] },
    { std: "유통기한", aliases: ["유통기한", "유효기한", "유효기간", "소비기한", "사용기한", "사용(유효)기한", "만료일"] },
    { std: "비고",     aliases: ["비고", "비 고", "적요", "메모"] },
    { std: "세액",     aliases: ["세액", "세 액", "부가세", "vat"] },
    { std: "단위",     aliases: ["단위", "단 위"] },
    { std: "일자",     aliases: ["일자", "날짜", "거래일자"] },
  ];
  const lines = rawText.split(/\r?\n/);
  let bestLineIdx = -1;
  let bestScore = 0;
  let bestFound: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (line.length < 4 || line.length > 200) continue;
    // 상품 라인(한글 이름 + 여러 숫자) 은 헤더가 아님
    const bigNums = (line.match(/\d{2,}/g) ?? []).length;
    if (bigNums >= 3) continue;
    // 각 표준 헤더 별칭 매칭
    const found: string[] = [];
    const compact = line.replace(/\s+/g, "");
    for (const { std, aliases } of STD) {
      if (found.includes(std)) continue;
      for (const a of aliases) {
        const an = a.replace(/\s+/g, "").toLowerCase();
        if (compact.includes(an)) { found.push(std); break; }
      }
    }
    if (found.length >= 3 && found.length > bestScore) {
      bestScore = found.length;
      bestLineIdx = i;
      bestFound = found;
    }
  }
  if (bestScore < 3) return null;
  return { headers: bestFound, linePosition: bestLineIdx, matchedTokens: bestFound };
}

/**
 * 인접 2행 병합 (2026-07-10 v4): 품명만 있는 행 + 숫자만 있는 행 → 하나로.
 *
 * 배경: 페이지 4 유한양행
 *   행 A: [라라올라액 20mL 30V (N), null, null, 25000, ..., null]
 *   행 B: [null (또는 —), 36, 55000, 20281130, null, null]
 *   → 이 두 행은 원래 한 상품이 여러 라인에 걸친 것
 *
 * 판정:
 *   · 행 A: 품명 있음 (한글 포함) + 수량/단가 없음 (또는 하나만 있음)
 *   · 행 B: 품명 없음/짧음 + 수량+단가+금액 있음
 *   → 병합: 품명 A + 값 B
 */
export function mergeAdjacentSplitRows(
  headers: string[],
  rows: (string | number | null)[][],
): { rows: (string | number | null)[][]; mergedCount: number } {
  const nI = headers.indexOf("품명");
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (nI < 0) return { rows, mergedCount: 0 };
  const HAS_KOREAN = /[가-힣]/;
  const hasNum = (v: any): boolean => typeof v === "number" && v > 0;
  const isNameOnly = (row: (string | number | null)[]): boolean => {
    const nm = row[nI] == null ? "" : String(row[nI]).trim();
    if (nm.length < 3 || !HAS_KOREAN.test(nm)) return false;
    const nq = qI >= 0 ? hasNum(row[qI]) : false;
    const np = pI >= 0 ? hasNum(row[pI]) : false;
    const na = aI >= 0 ? hasNum(row[aI]) : false;
    // 품명은 있는데 수량/단가/금액 중 2개 이상 비어있음
    const numCount = [nq, np, na].filter(Boolean).length;
    return numCount <= 1;
  };
  const isNumOnly = (row: (string | number | null)[]): boolean => {
    const nm = row[nI] == null ? "" : String(row[nI]).trim();
    if (nm.length > 2 && HAS_KOREAN.test(nm)) return false;
    const nq = qI >= 0 ? hasNum(row[qI]) : false;
    const np = pI >= 0 ? hasNum(row[pI]) : false;
    const na = aI >= 0 ? hasNum(row[aI]) : false;
    // 수량+단가+금액 3개 다 있음
    return nq && np && na;
  };
  // 수식 검증: 수량 × 단가 ≈ 금액 (5% 오차)
  const mathValid = (row: (string | number | null)[]): boolean => {
    if (qI < 0 || pI < 0 || aI < 0) return false;
    const q = typeof row[qI] === "number" ? (row[qI] as number) : null;
    const p = typeof row[pI] === "number" ? (row[pI] as number) : null;
    const a = typeof row[aI] === "number" ? (row[aI] as number) : null;
    if (q == null || p == null || a == null || q <= 0 || p <= 0 || a <= 0) return false;
    return Math.abs(q * p - a) <= Math.max(1, a * 0.05);
  };

  const out: (string | number | null)[][] = [];
  let merged = 0;
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const nxt = rows[i + 1];
    if (Array.isArray(cur) && Array.isArray(nxt) && isNameOnly(cur) && isNumOnly(nxt)) {
      // 병합 v4b: nxt 수량×단가=금액 성립 시 → 숫자 필드는 nxt 우선 (cur 의 오독 금액/단가 무시)
      //   예) 유한양행: cur=[품명, null, null, 26197(잘못된 Batch), ...] + nxt=[—, 50, 50000, 525000, ...]
      //       → 병합 후 [품명, 50, 50000, 525000, ...] (26197 버림)
      const nxtMathOk = mathValid(nxt);
      const combined = cur.map((v, c) => {
        // 수량/단가/금액: nxt 수식 정상이면 nxt 값 우선 (cur 값 무시)
        if (nxtMathOk && (c === qI || c === pI || c === aI)) {
          return nxt[c];
        }
        return v != null && v !== "" ? v : nxt[c];
      });
      combined[nI] = cur[nI];
      out.push(combined);
      merged++;
      i++;
    } else {
      out.push(cur);
    }
  }
  return { rows: out, mergedCount: merged };
}

/**
 * 유통기한(YYYYMMDD 8자리) 이 단가/금액 컬럼으로 오배정된 케이스 감지·복구 (2026-07-10 v3).
 *
 * 배경: 페이지 4 유한양행 케이스
 *   행: `— | 36 | 55,000 | 20,281,130 | —`   (20281130 = 2028-01-30 유통기한)
 *   OCR 이 유통기한을 금액 컬럼으로 배정 → 크로스검증 완전 실패
 *
 * 로직:
 *   1) 단가/금액 셀의 정수 값이 20200101 ~ 20401231 범위이면 → 유통기한 오배정 의심
 *   2) 그 값을 유통기한 컬럼으로 이동 (컬럼 있으면), 원본 셀은 null 처리
 *   3) 유통기한 컬럼 없으면 그냥 null 처리 (오배정 값 제거)
 */
export function fixDateInAmountColumns(
  headers: string[],
  rows: (string | number | null)[][],
): { rows: (string | number | null)[][]; fixedCount: number } {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  const eI = headers.indexOf("유통기한");
  if (qI < 0 && pI < 0 && aI < 0) return { rows, fixedCount: 0 };
  // 2026-07-14 확장: 수량 컬럼까지 검사 (페이지 2 광동원탕: 단가=20281221 케이스)
  //   유효한 날짜만 감지 (Date 객체 왕복 검증)
  const looksLikeYYYYMMDD = (v: any): boolean => {
    if (typeof v !== "number") return false;
    if (!Number.isInteger(v) || v < 20200101 || v > 20401231) return false;
    const yr = Math.floor(v / 10000);
    const mo = Math.floor((v % 10000) / 100);
    const dy = v % 100;
    if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return false;
    const d = new Date(yr, mo - 1, dy);
    return d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === dy;
  };
  const yyyymmddToStr = (n: number): string => {
    const s = String(n);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  };
  let fixed = 0;
  const newRows = rows.map(row => {
    if (!Array.isArray(row)) return row;
    const next = [...row];
    for (const ci of [qI, pI, aI].filter(i => i >= 0)) {
      const v = next[ci];
      if (!looksLikeYYYYMMDD(v)) continue;
      if (eI >= 0 && (next[eI] == null || next[eI] === "")) {
        next[eI] = yyyymmddToStr(v as number);
      }
      next[ci] = null;
      fixed++;
    }
    return next;
  });
  return { rows: newRows, fixedCount: fixed };
}

/**
 * 잔액 오염 감지·수정 (2026-07-10 v3).
 *
 * 배경: 페이지 7 댕기머리 케이스
 *   meta.total = 53,411,540  (실제로는 이월잔액/누적잔액)
 *   행합 = 542,160  (실제 상품 합)
 *   → total 이 행합의 98배 → 잔액이 total 로 오분류
 *
 * 로직: meta.total 이 (subtotal 또는 행합) 의 20배 이상이면 잔액 오염으로 판정 → total 무효화
 */
export function sanitizeBalanceContamination(
  meta: any,
  rowsSum: number,
): { meta: any; contaminated: boolean } {
  if (!meta || typeof meta.total !== "number") return { meta, contaminated: false };
  const reference = (typeof meta.subtotal === "number" && meta.subtotal > 0)
    ? meta.subtotal
    : rowsSum;
  if (reference <= 0) return { meta, contaminated: false };
  if (meta.total >= reference * 20) {
    const cleaned = { ...meta };
    // 잔액 필드로 이동 (진단용)
    if (cleaned.balanceAfter == null) cleaned.balanceAfter = cleaned.total;
    delete cleaned.total;
    return { meta: cleaned, contaminated: true };
  }
  return { meta, contaminated: false };
}

/**
 * OCR rawText 에서 공급자 상호 직접 추출 (2026-07-14 Phase 8).
 *
 * 접근: DB 매칭 하지 않고 명세서 원본에서 직접 상호를 뽑는다.
 *   1) "공급자" 라벨 위치 감지
 *   2) 그 뒤 300자 안에서 "상호" 라벨 옆 값 추출
 *   3) 실패 시 "공급자" 영역의 회사명 패턴 (제약·바이오·팜 등 접미어) 매칭
 *   4) 사업자번호도 함께 추출 (같은 영역에서)
 *
 * 반환: { supplier, supplierBizNum, source }
 *   source: "sho-label" | "company-pattern" | null
 */
export interface DirectSupplierExtract {
  supplier: string | null;
  supplierBizNum: string | null;
  source: "sho-label" | "company-pattern" | null;
}

export function extractSupplierFromRawText(rawText: string): DirectSupplierExtract {
  const result: DirectSupplierExtract = { supplier: null, supplierBizNum: null, source: null };
  if (!rawText || rawText.length < 10) return result;

  // "공급자" 라벨 위치 (수신처 라벨 배제)
  //   공급하는자 / 공급자 · 판매자 / 매출자
  //   ⚠ "공급받는자" 는 제외 (음수 lookahead)
  const SUPPLIER_LABEL_RE = /(?:공\s*급\s*자(?!\s*하?\s*는?\s*자|받)|판\s*매\s*자|매\s*출\s*자|공급업체|공급회사|판매업체)/;
  const RECIPIENT_LABEL_RE = /(?:공\s*급\s*받\s*는?\s*자|매\s*입\s*자|매\s*입\s*처|매\s*출\s*처|수신처|구매자|납품처|고객)/;

  const suppMatch = rawText.match(SUPPLIER_LABEL_RE);
  const recMatch = rawText.match(RECIPIENT_LABEL_RE);
  const suppPos = suppMatch ? rawText.indexOf(suppMatch[0]) : -1;
  const recPos = recMatch ? rawText.indexOf(recMatch[0]) : -1;

  // 공급자 영역 정의:
  //   공급자 라벨부터 · 수신처 라벨 전까지 (있으면) · 없으면 250자
  const zoneStart = suppPos >= 0 ? suppPos : 0;
  let zoneEnd: number;
  if (recPos >= 0 && recPos > zoneStart) {
    zoneEnd = recPos;
  } else if (suppPos >= 0) {
    zoneEnd = Math.min(rawText.length, suppPos + 250);
  } else {
    // 공급자 라벨 없으면 상단 400자만 사용 (헤더 영역 · 상품 라인 오탐 방지)
    zoneEnd = Math.min(rawText.length, 400);
  }
  const zone = rawText.slice(zoneStart, zoneEnd);

  // 1) 상호 라벨 옆 값 추출
  //    "상호  부광약품" · "상호: 부광약품" · "상 호 | 부광약품"
  //    값은 최대 30자 · 공백 포함 · 특수문자 관대
  const SHO_RE = /상\s*호[\s:：|\-]*([가-힣A-Za-z0-9()（）·・.\s]{2,30}?)(?=\s*(?:성명|성 명|대표|대표자|사업장|주소|업태|종목|담당|전화|팩스|공급받는자|매입자|수신처|$|[\r\n]))/;
  const shoMatch = zone.match(SHO_RE);
  if (shoMatch) {
    let candidate = shoMatch[1].trim();
    candidate = candidate.replace(/\s+/g, " ").trim();
    // 노이즈 배제: 순수 숫자 · 너무 짧음 · 한글 없음
    if (candidate.length >= 2 && /[가-힣]/.test(candidate) && !/^\d+$/.test(candidate)) {
      result.supplier = candidate;
      result.source = "sho-label";
    }
  }

  // 2) 상호 실패 시 회사명 접미어 패턴 매칭 (더 엄격 · 접미어 필수)
  //    XX제약 · XX바이오 · XX팜 · XX양행 · XX주식회사 등
  //    라벨 텍스트("등록번호", "성명", "사업장" 등) 배제
  const LABEL_BLACKLIST = /등록|번호|성명|사업장|사업자|대표|주소|업태|종목|담당|전화|팩스|공급|매입|수신/;
  if (!result.supplier) {
    const COMPANY_PATTERNS: RegExp[] = [
      /([가-힣][가-힣A-Za-z0-9]{1,12}주식회사)/g,
      /([가-힣][가-힣A-Za-z0-9]{1,12}(?:제약|바이오|팜|양행|메디|헬스|케어|화학|테크|랩|코리아|코퍼레이션|컴퍼니|엔지니어링)(?:\s*\(주\))?)/g,
      /\(\s*주\s*\)\s*([가-힣][가-힣0-9]{1,12}(?:제약|바이오|팜|양행|메디|헬스|케어|화학|테크|랩)?)/g,
    ];
    for (const pat of COMPANY_PATTERNS) {
      let m: RegExpExecArray | null;
      let best: string | null = null;
      let bestLen = 0;
      while ((m = pat.exec(zone))) {
        const cand = (m[1] ?? m[0]).trim();
        if (cand.length < 3 || cand.length > 25) continue;
        if (/^\d/.test(cand)) continue;
        if (LABEL_BLACKLIST.test(cand)) continue;   // 라벨 텍스트 배제
        if (cand.length > bestLen) { bestLen = cand.length; best = cand; }
      }
      if (best) {
        result.supplier = best;
        result.source = "company-pattern";
        break;
      }
    }
  }

  // 3) 사업자번호 추출 (공급자 영역 내)
  const BIZNUM_RE = /(\d{3}[\s\-.]?\d{2}[\s\-.]?\d{5})/;
  const bnMatch = zone.match(BIZNUM_RE);
  if (bnMatch) {
    const digits = bnMatch[1].replace(/[^0-9]/g, "");
    if (digits.length === 10 && digits[0] !== "0" && !/^20\d{2}/.test(digits) && !digits.startsWith("010")) {
      result.supplierBizNum = digits;
    }
  }

  return result;
}

/**
 * rawText 에서 사업자번호 추출 (2026-07-14 Phase 7 v2 · 공급자/수신처 분리).
 *
 * 사업자번호 형식: 3-2-5 (예: 310-18-05493) · 하이픈/공백/OCR 오독 관대
 * 반환: 각 번호마다 role 태깅 (supplier/recipient/unknown)
 *
 * 판정 로직:
 *   - "공급자|공급하는자|공급업체" 근처 = supplier
 *   - "공급받는자|받는자|수신처|매입처|매출처" 근처 = recipient
 *   - "구매자|고객|사업장" 근처 = recipient (약국·병원 컨텍스트)
 *   - 판단 불가 = unknown (학습 저장 대상 아님)
 */
export interface BusinessNumberMatch {
  bizNum: string;                              // 10자리 정규화
  role: "supplier" | "recipient" | "unknown"; // 공급자 or 수신처 or 미확정
  context: string;                             // 감지 위치 앞뒤 30자
}

export function extractBusinessNumbersFromRawText(rawText: string): BusinessNumberMatch[] {
  if (!rawText) return [];
  const results: BusinessNumberMatch[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\d{3}[\s\-.]\d{2}[\s\-.]\d{5}/g,   // 표준 3-2-5
    /(?<![\d\-])\d{10}(?![\d\-])/g,      // 하이픈 없는 10자리
  ];

  const SUPPLIER_LABELS = /(?:공\s*급\s*자|공\s*급\s*하?\s*는?\s*자|공급업체|공급회사|판\s*매\s*자|매출자|판매업체)/;
  const RECIPIENT_LABELS = /(?:공\s*급\s*받\s*는\s*자|받는자|매입자|매입처|매출처|수신처|구매자|고객|사업장|납품처)/;

  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(rawText))) {
      const digits = m[0].replace(/[^0-9]/g, "");
      if (digits.length !== 10) continue;
      if (digits[0] === "0") continue;
      if (/^0+$/.test(digits)) continue;
      if (digits.startsWith("010") || digits.startsWith("011") || digits.startsWith("016") || digits.startsWith("017")) continue;
      if (seen.has(digits)) continue;

      // 유통기한 YYYYMMDD 배제: 유효한 년월일 조합만 (year 20XX + valid month 01-12 + valid day 01-31)
      const yyyy = parseInt(digits.slice(0, 4), 10);
      const mmVal = parseInt(digits.slice(4, 6), 10);
      const ddVal = parseInt(digits.slice(6, 8), 10);
      if (yyyy >= 2020 && yyyy <= 2040 && mmVal >= 1 && mmVal <= 12 && ddVal >= 1 && ddVal <= 31) {
        continue;  // 유통기한 (사업자번호에서 배제)
      }
      seen.add(digits);

      // 컨텍스트 · 앞뒤 60자 스캔
      const start = Math.max(0, m.index - 60);
      const end = Math.min(rawText.length, m.index + m[0].length + 60);
      const contextStr = rawText.slice(start, end);

      // Role 판정: 라벨의 위치가 사업자번호에 얼마나 가까운지
      const beforeText = rawText.slice(start, m.index);
      const afterText = rawText.slice(m.index + m[0].length, end);

      let role: BusinessNumberMatch["role"] = "unknown";
      // 우선순위: 사업자번호 앞쪽 30자 내 라벨 > 뒤쪽 라벨 > 전체 컨텍스트 라벨
      const beforeSup = SUPPLIER_LABELS.test(beforeText.slice(-30));
      const beforeRec = RECIPIENT_LABELS.test(beforeText.slice(-30));
      const afterSup = SUPPLIER_LABELS.test(afterText.slice(0, 30));
      const afterRec = RECIPIENT_LABELS.test(afterText.slice(0, 30));

      if (beforeSup && !beforeRec) role = "supplier";
      else if (beforeRec && !beforeSup) role = "recipient";
      else if (afterSup && !afterRec) role = "supplier";
      else if (afterRec && !afterSup) role = "recipient";
      else if (SUPPLIER_LABELS.test(contextStr) && !RECIPIENT_LABELS.test(contextStr)) role = "supplier";
      else if (RECIPIENT_LABELS.test(contextStr) && !SUPPLIER_LABELS.test(contextStr)) role = "recipient";

      results.push({ bizNum: digits, role, context: contextStr.trim() });
    }
  }
  return results;
}

/**
 * 할인·에누리·차액 자동 감지 (2026-07-14 · Phase 1a).
 *
 * 목표: 사용자 지정 100% 매칭 대상 4개 중 가장 취약했던 항목 (~30% → 90%+).
 *
 * 감지 대상 (라벨 별칭):
 *   에누리     · 에누리액 · 에누리금액 · 총에누리 · 특별에누리 · 판매에누리
 *   할인       · 할인액 · 할인금액 · 총할인 · 특판할인 · 매출할인 · DC · D.C
 *   차액       · 차액조정 · 조정액
 *   반품       · 반품액 · 반품금액 (마이너스로 처리)
 *
 * 로직:
 *   1) rawText 에서 각 라벨 정규식 매칭
 *   2) 라벨 옆 · 다음 라인의 첫 번째 쉼표 있는 숫자 (마이너스 부호 허용)
 *   3) 여러 개 감지 시 종류별 합산 반환
 *   4) meta.total 과 상품 행합의 차이로 역산 후보 계산 (검증용)
 */
export function extractDiscount(rawText: string, rowsSum: number, meta: any): {
  discount?: number;      // 할인/에누리 합계 (양수 · 소계에서 빼야 함)
  discountLabel?: string; // 감지된 라벨 (예: "에누리액" · "할인" · "차액")
  return_?: number;       // 반품액 (양수 · 별도)
  vatSeparate?: boolean;  // 부가세 별도 명세서 여부 (총계 ≈ 상품합 × 1.10)
  inferred: string[];
} {
  const result: { discount?: number; discountLabel?: string; return_?: number; vatSeparate?: boolean; inferred: string[] } = { inferred: [] };

  // 2026-07-14 Fix: vatSeparate 감지는 rawText 무관 · 조기 실행
  if (typeof meta?.total === "number" && meta.total > 0 && rowsSum > 0) {
    const ratio = meta.total / rowsSum;
    if (Math.abs(ratio - 1.10) < 0.005) {
      result.vatSeparate = true;
      result.inferred.push(`부가세별도(비율=${ratio.toFixed(3)})`);
    }
  }
  if (!rawText) return result;

  // 쉼표 포함 정수 (마이너스 부호 허용) 추출 정규식
  //   - "에누리액 500,000" 매칭
  //   - "에누리액 -500,000" 매칭
  //   - "에누리액 : 500,000" 매칭 (콜론 · 공백 관대)
  //   - 라벨과 숫자 사이 최대 20자 허용 (다른 라벨이 있어도 스킵)
  const AMT = "\\-?\\d{1,3}(?:,\\d{3})+";
  const findAmt = (labelPatterns: Array<{ label: string; pat: RegExp }>): { value: number; label: string } | null => {
    for (const { label, pat } of labelPatterns) {
      const m = rawText.match(pat);
      if (m) {
        const raw = m[1].replace(/,/g, "");
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && Math.abs(n) > 0) return { value: Math.abs(n), label };
      }
    }
    return null;
  };

  // 에누리 계열
  const eunuri = findAmt([
    { label: "총에누리",   pat: new RegExp(`총\\s*에\\s*누\\s*리(?:\\s*액|\\s*금액)?[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "특별에누리", pat: new RegExp(`특별\\s*에누리[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "판매에누리", pat: new RegExp(`판매\\s*에누리[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "에누리액",   pat: new RegExp(`에\\s*누\\s*리\\s*액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "에누리",     pat: new RegExp(`에\\s*누\\s*리[^\\d\\-]{0,15}(${AMT})`, "i") },
  ]);
  if (eunuri) {
    result.discount = (result.discount ?? 0) + eunuri.value;
    result.discountLabel = eunuri.label;
    result.inferred.push(`${eunuri.label}=${eunuri.value.toLocaleString()}`);
  }

  // 할인 계열
  const halin = findAmt([
    { label: "매출할인",  pat: new RegExp(`매출\\s*할\\s*인[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "특판할인",  pat: new RegExp(`특판\\s*할\\s*인[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "할인액",    pat: new RegExp(`할\\s*인\\s*액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "할인금액",  pat: new RegExp(`할\\s*인\\s*금액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "총할인",    pat: new RegExp(`총\\s*할\\s*인[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "할인",      pat: new RegExp(`(?<![가-힣])할\\s*인(?![가-힣])[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "DC",        pat: new RegExp(`(?:^|[^A-Za-z])DC[^\\d\\-]{0,15}(${AMT})`) },
    { label: "D.C",       pat: new RegExp(`(?:^|[^A-Za-z])D\\.C[^\\d\\-]{0,15}(${AMT})`) },
  ]);
  if (halin) {
    result.discount = (result.discount ?? 0) + halin.value;
    result.discountLabel = result.discountLabel ? `${result.discountLabel}·${halin.label}` : halin.label;
    result.inferred.push(`${halin.label}=${halin.value.toLocaleString()}`);
  }

  // 차액·조정 계열
  const chaak = findAmt([
    { label: "차액조정", pat: new RegExp(`차\\s*액\\s*조정[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "조정액",   pat: new RegExp(`조\\s*정\\s*액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "차액",     pat: new RegExp(`차\\s*액[^\\d\\-]{0,15}(${AMT})`, "i") },
  ]);
  if (chaak) {
    result.discount = (result.discount ?? 0) + chaak.value;
    result.discountLabel = result.discountLabel ? `${result.discountLabel}·${chaak.label}` : chaak.label;
    result.inferred.push(`${chaak.label}=${chaak.value.toLocaleString()}`);
  }

  // 반품 (별도 필드)
  const banpum = findAmt([
    { label: "반품액",   pat: new RegExp(`반\\s*품\\s*액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "반품금액", pat: new RegExp(`반\\s*품\\s*금액[^\\d\\-]{0,15}(${AMT})`, "i") },
    { label: "반품",     pat: new RegExp(`반\\s*품[^\\d\\-]{0,15}(${AMT})`, "i") },
  ]);
  if (banpum) {
    result.return_ = banpum.value;
    result.inferred.push(`${banpum.label}=${banpum.value.toLocaleString()}`);
  }

  // supplyAmount 와 vat 로도 검증
  if (typeof meta?.supplyAmount === "number" && typeof meta?.vat === "number") {
    if (meta.vat > 0 && Math.abs(meta.supplyAmount / meta.vat - 10) < 0.5) {
      // 10:1 관계는 이미 부가세 포함 명세서의 정상 관계 · 하지만 총계도 봐야 함
      // 이건 그냥 확인용 · 여기선 별도 처리 안 함
    }
  }

  return result;
}

/**
 * 여러 거래명세서 페이지에서 공통 라인 추출 (2026-07-10).
 *
 * 아이디어: 여러 페이지에 걸쳐 반복 등장하는 텍스트 = 공급처/수신처/발행자 정보일 확률 매우 높음
 *   · 상품 행은 페이지마다 다름
 *   · 공급처 상호, 수신처 상호, 주소, 사업자번호, 담당자 이름 등은 공통
 *
 * 절차:
 *   1) 각 페이지 rawText 를 라인 단위 분해
 *   2) 라인 정규화 (숫자·날짜·공백 제거)
 *   3) 페이지의 ≥ threshold 비율 (기본 50%) 에 등장하는 라인 = 공통 라인
 *   4) 공통 라인 중 의미 있는 것 (2자 이상 · 순수 숫자 아님) 만 반환
 *
 * 반환: filterMetadataBleedRows 가 "메타 시그널" 로 활용
 */
export function extractCommonMetadataLines(rawTexts: string[], threshold: number = 0.5): string[] {
  if (rawTexts.length < 2) return [];
  const normLine = (s: string): string =>
    s.replace(/\d+/g, "")           // 숫자 제거
     .replace(/[.,·:;\-\/()（）\[\]]/g, " ") // 구두점 제거
     .replace(/\s+/g, " ")          // 공백 정규화
     .trim()
     .toLowerCase();

  const pageLineSets: Set<string>[] = rawTexts.map(text => {
    const lines = String(text ?? "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length >= 2);
    const set = new Set<string>();
    for (const line of lines) {
      const norm = normLine(line);
      if (norm.length < 2) continue;
      if (/^[a-z\s]{0,3}$/.test(norm)) continue; // 짧은 영문 노이즈
      set.add(norm);
    }
    return set;
  });

  const freq = new Map<string, number>();
  for (const set of pageLineSets) {
    for (const line of set) freq.set(line, (freq.get(line) ?? 0) + 1);
  }

  const minCount = Math.max(2, Math.ceil(rawTexts.length * threshold));
  const common: string[] = [];
  for (const [line, cnt] of freq) {
    if (cnt >= minCount && line.length >= 2 && line.length <= 40) common.push(line);
  }
  return common;
}

/**
 * 라벨 없어도 소계·공급가액·부가세·합계 추정 (2026-07-10).
 *
 * 배경: OCR 이 "소계", "공급가액", "부가세", "합계" 라벨을 놓치면 라벨 기반 파서 실패
 *       → meta.subtotal/supplyAmount/vat/total 모두 null 상태로 남음
 *       → 그러나 rawText 하단엔 숫자만 나열되어 있는 경우가 많음
 *
 * 전략:
 *   1) rawText 하단 1/3 에서 쉼표 있는 큰 숫자(≥ 4자리) 모두 추출
 *   2) 페어 스캔: X:Y 비율이 10±1 이면 (공급가액 : 부가세) 후보
 *   3) 공급가액 + 부가세 = 합계 (오차 1원 이내) 후보 찾음 → total 확정
 *   4) 그 외 큰 값 = 소계 후보 (없으면 상품 행합으로 대체)
 *
 * 결과: 채워진 필드만 반환 (기존 meta 값은 손대지 않고 caller 가 병합)
 */
export function inferMissingTotals(
  rawText: string,
  rowsSum: number,
  existing: { subtotal?: number | null; supplyAmount?: number | null; vat?: number | null; total?: number | null }
): { subtotal?: number; supplyAmount?: number; vat?: number; total?: number; inferred: string[] } {
  const filled: { subtotal?: number; supplyAmount?: number; vat?: number; total?: number; inferred: string[] } = { inferred: [] };

  // 2026-07-14 Fix: rowsSum 으로 subtotal 백필 (rawText 유무·짧음 무관하게 항상 시도)
  const backfillSubtotalFromRowsSum = () => {
    if (existing.subtotal == null && rowsSum > 0) {
      filled.subtotal = rowsSum;
      filled.inferred.push(`subtotal=${rowsSum.toLocaleString()} (행합)`);
    }
  };
  if (!rawText) { backfillSubtotalFromRowsSum(); return filled; }

  // 2026-07-14 Fix: 짧은 명세서(< 200자) 는 전체 스캔 · 긴 명세서만 tail 컷
  //   기존: 0.6 컷 → 3~5줄 짧은 명세서에서 숫자 잘림
  const tailStart = rawText.length < 200 ? 0 : Math.floor(rawText.length * 0.6);
  const tail = rawText.slice(tailStart);

  // 쉼표·마침표(오독) 포함 숫자 추출: 1,234,567 · 1.234.567 · 1,234.567 모두 허용
  const NUM_RE = /(\d{1,3}(?:[,.]\d{3})+(?:[,.]\d+)?)/g;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(tail))) {
    const s = m[1].replace(/[,.]/g, "");
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n >= 1000) nums.push(n);
  }
  if (nums.length === 0) { backfillSubtotalFromRowsSum(); return filled; }

  // 중복 제거하되 순서 유지
  const uniq: number[] = [];
  const seen = new Set<number>();
  for (const n of nums) { if (!seen.has(n)) { uniq.push(n); seen.add(n); } }

  // 1) (공급가액 : 부가세) 페어 스캔
  //    · X > Y · Y*10 ≈ X (오차 5% 이내) · X + Y 값도 uniq 안에 있으면 확정
  let supplyAmount: number | undefined;
  let vat: number | undefined;
  let total: number | undefined;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = 0; j < uniq.length; j++) {
      if (i === j) continue;
      const X = uniq[i], Y = uniq[j];
      if (X <= Y) continue;
      const ratio = X / Y;
      if (ratio < 9.5 || ratio > 10.5) continue;
      const sumXY = X + Y;
      // sumXY 가 uniq 안에 있으면 (X, Y, sumXY) = (공급가액, 부가세, 합계)
      if (seen.has(sumXY) || uniq.some(v => Math.abs(v - sumXY) <= 1)) {
        supplyAmount = X;
        vat = Y;
        total = sumXY;
        break;
      }
    }
    if (supplyAmount != null) break;
  }
  // 페어 못 찾았지만 X ≈ Y*10 인 페어라도 찾으면 (공급가액, 부가세) 만 확정
  if (supplyAmount == null) {
    for (let i = 0; i < uniq.length; i++) {
      for (let j = 0; j < uniq.length; j++) {
        if (i === j) continue;
        const X = uniq[i], Y = uniq[j];
        if (X <= Y) continue;
        const ratio = X / Y;
        if (ratio >= 9.8 && ratio <= 10.2) {
          supplyAmount = X;
          vat = Y;
          break;
        }
      }
      if (supplyAmount != null) break;
    }
  }

  // 채우기 (기존 값 있으면 건드리지 않음)
  if (existing.supplyAmount == null && supplyAmount != null) {
    filled.supplyAmount = supplyAmount;
    filled.inferred.push(`supplyAmount=${supplyAmount.toLocaleString()}`);
  }
  if (existing.vat == null && vat != null) {
    filled.vat = vat;
    filled.inferred.push(`vat=${vat.toLocaleString()}`);
  }
  if (existing.total == null && total != null) {
    filled.total = total;
    filled.inferred.push(`total=${total.toLocaleString()}`);
  }
  // 소계: 상품 행합이 있고 기존 subtotal 이 없으면 상품 행합으로
  if (existing.subtotal == null && rowsSum > 0) {
    filled.subtotal = rowsSum;
    filled.inferred.push(`subtotal=${rowsSum.toLocaleString()} (행합)`);
  }

  return filled;
}

/**
 * 행합 vs meta.total 대조 (rawText 기반).
 * 행합이 total 과 크게 다르고, rawText 에 정답 후보군 있으면 진단 로그.
 * 실제 보정은 안 함 (fixAmountsBySubtotal 이 담당).
 */
export function auditRowSumVsTotal(
  headers: string[],
  rows: (string | number | null)[][],
  rawText: string,
  statedTotal: number | null,
): { rowSum: number; stated: number | null; delta: number; withinTolerance: boolean } {
  const aI = headers.indexOf("금액");
  if (aI < 0) return { rowSum: 0, stated: statedTotal, delta: 0, withinTolerance: false };
  const rowSum = rows.reduce((s, r) => s + (typeof r[aI] === "number" ? (r[aI] as number) : 0), 0);
  const delta = statedTotal != null ? Math.abs(rowSum - statedTotal) : 0;
  const withinTolerance = statedTotal != null && delta <= Math.max(1, statedTotal * 0.02);
  return { rowSum, stated: statedTotal, delta, withinTolerance };
}

/**
 * 메타데이터 노이즈 필터 · 명세서 헤더/푸터 텍스트가 상품 행으로 오인식된 것을 제거.
 *
 * 실측 오류 예시 (경방신약 명세서):
 *   품명="경방신약(주)" · 수량=null · 단가=14,182 · 금액=156,000  ← 공급사명 반복
 *   품명="김충환" · 금액=156,000                                    ← 담당자 이름
 *   품명="코스트팜약국" · 금액=156,000                              ← 수신처(약국)
 *   품명="인천남동구남동대로394..." · 금액=156,000                 ← 공급사 주소
 *   품명="제조업" · 금액=156,000                                    ← 업종
 *
 * 필터 원칙: **오탐 최소화**를 위해 다음 조건을 **동시에** 만족할 때만 제거
 *   1) 품명이 메타 패턴 (공급사명/수신처/주소/업종/사람이름)
 *   2) AND 수량이 없거나 (수량×단가 ≠ 금액) OR 금액이 페이지 소계/총계와 동일
 */
export function filterMetadataBleedRows(
  headers: string[],
  rows: (string | number | null)[][],
  meta: any = {},
  commonMetaLines: string[] = [],
): (string | number | null)[][] {
  const nI = headers.indexOf("품명");
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (nI < 0) return rows;

  // 페이지 총계·소계·공급가액·부가세 → "이 값이 금액에 들어가면 메타 노이즈 가능성"
  //   ⚠ balancePrev/balanceAfter (잔액/이월잔액) 는 제외:
  //     상품 금액과 우연히 일치할 확률이 높아 정상 상품 행을 삭제함
  const metaTotals = new Set<number>();
  for (const k of ["total", "subtotal", "supplyAmount", "vat"]) {
    const v = meta?.[k];
    if (typeof v === "number" && v > 0) metaTotals.add(v);
  }

  const supplier: string = String(meta?.supplier ?? "").trim();
  // 공급사명 정규화 (비교용): 공백/괄호/(주)/주식회사 제거
  const cleanCompanyName = (s: string) =>
    s.replace(/\s+/g, "").replace(/\(주\)|주식회사|㈜|\(株\)|（주）/g, "").toLowerCase();
  const supplierNorm = cleanCompanyName(supplier);

  // 주소 키워드 (하나라도 있고 여러 개 겹치면 주소 가능성 높음)
  const ADDR_KEYS = ["시", "도", "구", "군", "동", "로", "길", "번지", "층", "호"];
  // 업종
  const BUSINESS_TYPES = new Set([
    "제조업", "도매업", "소매업", "도소매업", "서비스업", "의약품", "무역업",
    "제조", "도매", "소매", "도소매", "의약품제조업", "의약품도매업",
  ]);

  const mathOk = (row: (string | number | null)[]): boolean | null => {
    if (qI < 0 || pI < 0 || aI < 0) return null;
    const q = typeof row[qI] === "number" ? (row[qI] as number) : null;
    const p = typeof row[pI] === "number" ? (row[pI] as number) : null;
    const a = typeof row[aI] === "number" ? (row[aI] as number) : null;
    if (q == null || p == null || a == null) return null;
    if (q <= 0 || p <= 0 || a <= 0) return null;
    const exp = Math.round(q * p);
    return Math.abs(exp - a) <= Math.max(1, exp * 0.01);
  };

  const isRecipientName = (nameNoSpace: string): boolean => {
    if (!nameNoSpace) return false;
    // OCR_RECIPIENTS (예: "코스트팜") 부분일치
    for (const r of OCR_RECIPIENTS) {
      if (!r) continue;
      const rn = r.replace(/\s+/g, "").toLowerCase();
      if (rn.length >= 3 && nameNoSpace.includes(rn)) return true;
    }
    // 흔한 약국 체인 접미사 (수신처일 가능성)
    if (/약국$/.test(nameNoSpace) && nameNoSpace.length <= 10) return true;
    return false;
  };

  const isAddressLike = (name: string): boolean => {
    if (name.length < 8) return false;
    const hits = ADDR_KEYS.filter(k => name.includes(k)).length;
    // 3개 이상 주소 키워드 + 숫자 포함
    return hits >= 3 && /\d/.test(name);
  };

  const isPersonNameLike = (name: string): boolean => {
    // 순수 한글 3~4자 (담당자 이름 흔한 패턴)
    //   ⚠ 2자 제외: "비타민"·"갈근" 같은 짧은 약품명 오탐 방지
    return /^[가-힣]{3,4}$/.test(name);
  };

  const isBusinessType = (nameNoSpace: string): boolean => {
    return BUSINESS_TYPES.has(nameNoSpace);
  };

  const looksLikeCompanyOnly = (name: string, nameNoSpace: string): boolean => {
    // (주) 또는 주식회사 포함하고, 상품 단위(정/캡슐/포/mg/ml 등)가 없는 경우
    const hasCompanySuffix = /\(주\)|주식회사|㈜|\(株\)|（주）/.test(name);
    if (!hasCompanySuffix) return false;
    const hasProductUnit = /(정|캡슐|포|병|앰플|시럽|과립|산제|정제|알약)|(\d+\s*(mg|ml|MG|ML|g|G))|(\d+\s*(포|정|캡슐))/.test(name);
    if (hasProductUnit) return false;
    // 공급사명과 정확히 일치하면 100% 노이즈
    if (supplierNorm && cleanCompanyName(name) === supplierNorm) return true;
    // 그 외에도 짧고(<= 15자) 상품 단위 없으면 회사명 노이즈로 처리
    return nameNoSpace.length <= 15;
  };

  // ─── 스코어링 방식 (2026-07-10 v2 강화) ────────────────────────────────
  //   경방신약 케이스: 회사명·인명·수신처 행이 "총계 라인 오염" 으로 상품처럼 보임.
  //   → 단가/금액이 meta 값과 정확히 일치할 때 강한 penalty · shared amount 그룹 감지.
  const PRODUCT_UNIT_RE =
    /(정|캡슐|포|병|앰플|시럽|과립|산제|정제|알약|연고|크림|겔|젤|로션|패치|스프레이|점안액|주사|필름)|(\d+\s*(mg|ml|MG|ML|g|G|IU|mcg|μg|정|캡슐|포|T\b|C\b|EA\b))|(\/(PTP|SP|BOX|박스))/i;

  // 여러 행이 공유하는 금액값 감지 (총계 라인 오염 시그널)
  //   → 같은 금액값이 3+회 등장하면 그 값은 meta.total 이 흩어진 것
  const amountFreq = new Map<number, number>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const a = aI >= 0 && typeof row[aI] === "number" ? (row[aI] as number) : null;
    if (a != null && a > 0) amountFreq.set(a, (amountFreq.get(a) ?? 0) + 1);
  }
  const bleedAmounts = new Set<number>();
  for (const [amt, cnt] of amountFreq) {
    if (cnt >= 3) bleedAmounts.add(amt);      // 3+회 반복 = 오염 확정
  }

  // 사용자 통찰 (2026-07-10): "가장 긴 행을 기준으로 판단 · 품명에 한글 포함"
  //   → 페이지 최장행 길이 대비 각 행의 상대적 길이로 상품/노이즈 구분
  //   메타 노이즈: 셀 1~2개만 짧게 · 상품 행: 여러 컬럼 채워져 길이 김
  const rowTotalLens = rows.map(row => {
    if (!Array.isArray(row)) return 0;
    let sum = 0;
    for (const v of row) {
      if (v == null) continue;
      sum += String(v).length;
    }
    return sum;
  });
  const maxRowLen = rowTotalLens.reduce((m, n) => Math.max(m, n), 0);
  const HAS_KOREAN = /[가-힣]/;

  const scoreRow = (row: (string | number | null)[], rowIdx: number): { score: number; reasons: string[] } => {
    const reasons: string[] = [];
    let score = 0;
    const rawName = nI >= 0 ? row[nI] : null;
    const name = rawName == null ? "" : String(rawName).trim();
    const nameNoSpace = name.replace(/\s+/g, "");
    const okMath = mathOk(row);
    const aVal = aI >= 0 && typeof row[aI] === "number" ? (row[aI] as number) : null;
    const qVal = qI >= 0 && typeof row[qI] === "number" ? (row[qI] as number) : null;
    const pVal = pI >= 0 && typeof row[pI] === "number" ? (row[pI] as number) : null;
    const rowLen = rowTotalLens[rowIdx] ?? 0;
    const hasKoreanName = HAS_KOREAN.test(name);

    // + 시그널 (상품일 가능성)
    if (okMath === true) { score += 5; reasons.push("+5 수량×단가=금액"); }
    if (PRODUCT_UNIT_RE.test(name)) { score += 3; reasons.push("+3 상품단위"); }
    if (qVal != null && pVal != null && aVal != null) { score += 2; reasons.push("+2 수량·단가·금액 3개"); }
    if (nameNoSpace.length >= 5) { score += 1; reasons.push("+1 품명5자+"); }
    // 사용자 통찰 v3 (핵심): 가장 긴 행 = 상품 · 짧은 행 = 노이즈
    //   최장행 대비 비율로 상품/노이즈 구분:
    //     >= 70%: +5 상품 (가장 긴 행에 가까움)
    //     >= 50%: +2 상품 (준상품)
    //     <  30%: -5 노이즈 (너무 짧음)
    if (maxRowLen > 0) {
      const ratio = rowLen / maxRowLen;
      if (ratio >= 0.7) { score += 5; reasons.push(`+5 최장행 ${(ratio * 100).toFixed(0)}%`); }
      else if (ratio >= 0.5) { score += 2; reasons.push(`+2 준장행 ${(ratio * 100).toFixed(0)}%`); }
      else if (ratio < 0.3) { score -= 5; reasons.push(`-5 짧은행 ${(ratio * 100).toFixed(0)}%`); }
    }
    // 품명에 한글 포함 → 상품명 확률 매우 높음 (거래명세서 특성)
    if (hasKoreanName && nameNoSpace.length >= 3) { score += 3; reasons.push("+3 품명한글"); }

    // - 시그널 (메타일 가능성) — v3 (2026-07-14 라벨/안내문 강화)
    if (name && looksLikeCompanyOnly(name, nameNoSpace)) { score -= 8; reasons.push("-8 회사명"); }
    if (name && isAddressLike(name))                    { score -= 10; reasons.push("-10 주소"); }
    if (name && isBusinessType(nameNoSpace))            { score -= 8; reasons.push("-8 업종"); }
    if (aVal != null && metaTotals.has(aVal))           { score -= 5; reasons.push("-5 금액=총계"); }
    if (name && isRecipientName(nameNoSpace))           { score -= 5; reasons.push("-5 수신처"); }
    if (name && isPersonNameLike(name))                 { score -= 3; reasons.push("-3 인명패턴"); }

    // 라벨/안내문 강한 penalty (page 3·4 케이스 · "남품번호", "본 거래명세표와", "배송처:")
    const LABEL_NOISE_RE = /(?:본\s*거래|본\s*명세|본\s*계산서|본\s*영수증|본\s*문서)/;
    const DELIVERY_RE = /(?:배송처|배송지|배송기사|기사명|기사연락처|기사번호|남품번호|납품번호|차량번호|차람번호|배송인|수취인)/;
    const INQUIRY_RE = /(?:문의|연락\s*주십시오|연락바랍|전화\s*주십시오|고객센터|1566|1588)/;
    const NOTICE_RE = /(?:공지|안내|주의|경고|반품\s*요청|반품\s*시)/;
    if (name && LABEL_NOISE_RE.test(name))     { score -= 10; reasons.push("-10 안내문"); }
    if (name && DELIVERY_RE.test(name))        { score -= 10; reasons.push("-10 배송정보"); }
    if (name && INQUIRY_RE.test(name))         { score -= 10; reasons.push("-10 문의연락"); }
    if (name && NOTICE_RE.test(name))          { score -= 8;  reasons.push("-8 공지문"); }
    // 콜론(:)으로 시작하거나 포함 (예: "배송처: 코스트팜") → 라벨 스러움
    if (name && /^[가-힣]{2,10}\s*[:：]/.test(name)) { score -= 5; reasons.push("-5 라벨콜론"); }

    // 단가/금액이 meta 값과 정확 일치 → 총계 라인 흩뿌림 (매우 강력)
    //   예) 단가=14182 (=meta.vat) → 이 행은 명백히 "부가세 14,182" 라인이 새어들어옴
    if (pVal != null && metaTotals.has(pVal)) { score -= 8; reasons.push("-8 단가=meta"); }
    // shared amount 그룹: 여러 행이 같은 금액 → 총계 값 흩어짐
    if (aVal != null && bleedAmounts.has(aVal) && metaTotals.has(aVal)) {
      score -= 6; reasons.push(`-6 shared_amount(${amountFreq.get(aVal)}회)`);
    }

    // 여러 페이지에 반복 등장하는 라인 → 공급처/수신처/발행자 확률 매우 높음
    if (name && commonMetaLines.length > 0) {
      const nameNorm = name.replace(/\d+/g, "").replace(/[.,·:;\-\/()（）\[\]]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      if (nameNorm.length >= 2) {
        for (const cm of commonMetaLines) {
          if (cm.length >= 2 && (cm.includes(nameNorm) || nameNorm.includes(cm))) {
            score -= 5;
            reasons.push("-5 다중페이지 공통라인");
            break;
          }
        }
      }
    }

    return { score, reasons };
  };

  const dropped: { name: string; score: number; reasons: string[] }[] = [];
  const kept: { name: string; score: number; reasons: string[] }[] = [];
  const filtered = rows.filter((row, ri) => {
    if (!Array.isArray(row)) return true;
    const { score, reasons } = scoreRow(row, ri);
    const nm = String(row[nI] ?? "").slice(0, 30);
    if (score < 0) {
      dropped.push({ name: nm, score, reasons });
      return false;
    }
    kept.push({ name: nm, score, reasons });
    return true;
  });

  // 🛡 안전 가드 (2026-07-10):
  //   ① 필터 결과 0행 → 무조건 미적용 (컬럼 매핑 오탐 · 상품 유실 방지)
  //   ② 필터가 90% 이상 지우고 남은 행에 "강한 상품 시그널" 이 하나도 없으면 미적용
  //      → 애매한 경우 사용자 판단으로 넘김
  //   그 외엔 스코어링 결과 신뢰 (다수 메타 + 소수 상품 = 정상 케이스)
  if (rows.length >= 2) {
    if (filtered.length === 0) {
      if (dropped.length > 0) {
        console.log(`[filterMetadataBleedRows] 🛡 안전가드① · 0행 남음 → 필터 미적용`);
        dropped.slice(0, 5).forEach(d => console.log(`   · "${d.name}" (score=${d.score}) ${d.reasons.join(", ")}`));
      }
      return rows;
    }
    const hasStrongProduct = kept.some(k => k.reasons.some(r => r.startsWith("+5")));
    const dropRatio = dropped.length / rows.length;
    if (dropRatio >= 0.9 && !hasStrongProduct) {
      console.log(`[filterMetadataBleedRows] 🛡 안전가드② · ${(dropRatio * 100).toFixed(0)}% 제거 + 강한 상품 시그널 없음 → 필터 미적용`);
      dropped.slice(0, 5).forEach(d => console.log(`   · "${d.name}" (score=${d.score}) ${d.reasons.join(", ")}`));
      return rows;
    }
  }
  // 진단 로그
  if (dropped.length > 0) {
    console.log(`[filterMetadataBleedRows] 메타 노이즈 ${dropped.length}행 제거:`);
    dropped.slice(0, 8).forEach(d => console.log(`   · "${d.name}" (score=${d.score}) ${d.reasons.join(", ")}`));
  }
  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────
// 진단: 단가 == 금액 이지만 페이지 통계상 컬럼 shift 의심되는 행
//
// 파이프라인 뒤 (파이널 rows 확정 후) 순수 감지만. 보정 X — 오탐 위험 때문.
// 실측 데이터로 오탐률/진짜 shift 비율 파악 후 자동 보정 도입 판단용.
export type SuspiciousEqualPriceAmount = {
  rowIdx: number;
  quantity: number | null;
  price: number;
  amount: number;
  priceMedian: number;
  amountMedian: number;
  priceGapRatio: number;    // 이 행의 단가 / 페이지 단가 중앙값
  amountGapRatio: number;   // 이 행의 금액 / 페이지 금액 중앙값
  reason: string;
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function detectSuspiciousEqualPriceAmount(
  headers: string[],
  rows: (string | number | null)[][],
): SuspiciousEqualPriceAmount[] {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (pI < 0 || aI < 0) return [];

  const safeNum = (v: any): number | null => {
    if (typeof v === "number" && v > 0) return v;
    return null;
  };

  // mathOk 통과하는 신뢰 행에서 단가·금액 중앙값 산출
  const trustedPrices: number[] = [];
  const trustedAmounts: number[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const q = qI >= 0 ? safeNum(row[qI]) : null;
    const p = safeNum(row[pI]);
    const a = safeNum(row[aI]);
    if (p == null || a == null) continue;
    // 수량 있으면 수식 검증, 없으면 그냥 유효값 취급
    if (q != null && q > 0) {
      const exp = Math.round(q * p);
      if (Math.abs(exp - a) > Math.max(1, exp * 0.01)) continue;
    }
    trustedPrices.push(p);
    trustedAmounts.push(a);
  }

  // 통계 근거 부족 시 감지 스킵 (게이팅: 최소 3행)
  if (trustedPrices.length < 3) return [];

  const pMed = median(trustedPrices);
  const aMed = median(trustedAmounts);
  if (pMed <= 0 || aMed <= 0) return [];

  const out: SuspiciousEqualPriceAmount[] = [];
  rows.forEach((row, idx) => {
    if (!Array.isArray(row)) return;
    const q = qI >= 0 ? safeNum(row[qI]) : null;
    const p = safeNum(row[pI]);
    const a = safeNum(row[aI]);
    if (p == null || a == null) return;
    // 단가 == 금액 (허용오차 1%)
    if (Math.abs(p - a) > Math.max(1, p * 0.01)) return;

    // 수량이 1이면 정상 (단품 발주) — 제외
    if (q === 1) return;

    // 값이 페이지 단가 중앙값의 5배 이상 큰지 (금액 스케일 의심)
    const priceGap = p / pMed;
    const amountGap = a / aMed;
    const isPriceLooksLikeAmount = priceGap >= 5;
    const isAmountLooksLikePrice = amountGap <= 0.2;

    if (!isPriceLooksLikeAmount && !isAmountLooksLikePrice) return;

    const reasons: string[] = [];
    reasons.push(`단가=금액=${p.toLocaleString()}`);
    if (q != null) reasons.push(`수량=${q}`);
    else reasons.push(`수량=(없음)`);
    if (isPriceLooksLikeAmount) reasons.push(`단가가 페이지 중앙값의 ${priceGap.toFixed(1)}배 → 금액 값 오인식 의심`);
    if (isAmountLooksLikePrice) reasons.push(`금액이 페이지 중앙값의 ${amountGap.toFixed(2)}배 → 단가 값 오인식 의심`);

    out.push({
      rowIdx: idx,
      quantity: q,
      price: p,
      amount: a,
      priceMedian: pMed,
      amountMedian: aMed,
      priceGapRatio: Number(priceGap.toFixed(2)),
      amountGapRatio: Number(amountGap.toFixed(2)),
      reason: reasons.join(" · "),
    });
  });

  return out;
}
