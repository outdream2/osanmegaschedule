// server/ocr/metadataKV.ts
// 거래명세서 메타데이터 (공급사·소계·부가세·합계·잔액·담당자·날짜) 추출
//
// 핵심 관찰:
//   거래명세서는 대부분 "상품 표(다중컬럼)" + "주변 메타(좌우 페어 · 라벨|값)" 구조.
//   좌측 셀 = 항목명, 우측 셀 = 데이터값 을 물리적 인접 관계로 추출.
//   → regex 로 rawText 뒤지는 것보다 정확도 훨씬 높음 (사업자번호/전화번호 오탐 없음)
//
// 파이프라인:
//   1) detectProductTableRegion(cells) → 상품 표 Y범위 검출
//   2) extractKeyValuePairs(cells, tableRegion) → 표 밖 영역에서 좌우 페어링
//   3) mapLabelToField(label) → 어휘 매칭 → 표준 필드명
//   4) parseFieldValue(field, valueText) → 필드별 값 파싱 (숫자·날짜·문자)

export type Cell = {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence?: number;
};

export type Region = { y1: number; y2: number };

export type KVPair = {
  label: string;
  value: string;
  labelBox: Cell["box"];
  valueBox: Cell["box"];
};

export type ExtractedMeta = {
  supplier?: string;
  recipient?: string;
  subtotal?: number;         // 소계
  supplyAmount?: number;     // 공급가액
  vat?: number;              // 부가세·세액
  discount?: number;         // 에누리·할인
  salesAmount?: number;      // 매출액
  total?: number;            // 합계·합계액·총합계·총합계금액·총계·차액·총금액
  supplierBalance?: number;  // 공급사잔고 (= 잔액/이월잔액/누계잔고 · 총계와 완전 분리)
  balancePrev?: number;      // 전잔액 (참고용 · supplierBalance 상세 세부)
  balanceAfter?: number;     // 누적잔액 (참고용 · supplierBalance 상세 세부)
  salesRep?: string;
  date?: string;
  // 매칭 안 된 원본 페어들 (디버깅용)
  extraPairs?: Array<{ label: string; value: string }>;
};

// ── env: 수신처(우리 약국) 상호 리스트 (공급사와 구별용) ────────────────────
const OCR_RECIPIENTS: string[] = (process.env.OCR_RECIPIENT ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

// 상호값이 우리(수신처) 이름과 일치하는지
function isRecipientBusinessName(value: string): boolean {
  if (!value) return false;
  const norm = value.replace(/\s+/g, "").toLowerCase();
  for (const r of OCR_RECIPIENTS) {
    const rn = r.replace(/\s+/g, "").toLowerCase();
    if (rn.length >= 3 && norm.includes(rn)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1단계: 상품 표 영역 검출
// ─────────────────────────────────────────────────────────────────────────────

/** 상품 표 헤더에 나타나는 어휘 (동시 등장 검증용) */
const PRODUCT_HEADER_KW = {
  name:   ["품명", "품목", "품 명", "상품명", "제품명"],
  qty:    ["수량", "매수", "발주수량", "매입수량"],
  price:  ["단가", "매입단가", "판매단가", "단위가격"],
  amount: ["금액", "공급가액", "총매출액", "매출액", "합계금액"],
};

/**
 * 셀들에서 상품 표 헤더 행을 찾아 표의 Y 범위 반환.
 * @param cells PP-OCRv5 검출 전체 셀
 * @param imageHeight 이미지 높이 (표 하단 fallback 용)
 * @returns 표 밴드 Y범위. 못 찾으면 null.
 */
export function detectProductTableRegion(
  cells: Cell[],
  imageHeight?: number,
): Region | null {
  if (!Array.isArray(cells) || cells.length === 0) return null;

  // Y좌표로 그룹핑 (같은 행 = Y 편차 < 평균 셀 높이 × 0.6)
  const rowGroups = groupCellsByRow(cells);

  // 헤더 행 후보: 4개 카테고리(품명/수량/단가/금액) 중 3개 이상 어휘 포함
  const stripSpace = (s: string) => s.replace(/\s+/g, "");
  const rowContainsCategory = (row: Cell[], keys: string[]): boolean => {
    const flat = stripSpace(row.map(c => c.text).join(""));
    return keys.some(k => flat.includes(stripSpace(k)));
  };

  let headerRow: Cell[] | null = null;
  let headerScore = 0;
  for (const row of rowGroups) {
    if (row.length < 3) continue;
    let score = 0;
    for (const category of Object.values(PRODUCT_HEADER_KW)) {
      if (rowContainsCategory(row, category)) score++;
    }
    if (score >= 3 && score > headerScore) {
      headerScore = score;
      headerRow = row;
    }
  }

  if (!headerRow) return null;

  const headerY = Math.min(...headerRow.map(c => c.box.y));
  const headerBottom = Math.max(...headerRow.map(c => c.box.y + c.box.height));

  // 표 하단 검출: 헤더 아래 행들 중 "합계/소계/총계/누계" 같은 종결 어휘가 나오는 Y
  const TERMINAL_KW = /합\s*계|소\s*계|총\s*계|총\s*합|누\s*계|공\s*급\s*가\s*액|부\s*가\s*세|세\s*액/;
  let tableBottom = imageHeight ?? Number.MAX_SAFE_INTEGER;

  const rowsBelowHeader = rowGroups.filter(r => {
    const y = Math.min(...r.map(c => c.box.y));
    return y > headerBottom;
  });

  for (const row of rowsBelowHeader) {
    const flat = row.map(c => c.text).join(" ");
    if (TERMINAL_KW.test(flat)) {
      // 이 행의 상단이 표의 하단 경계
      tableBottom = Math.min(...row.map(c => c.box.y));
      break;
    }
  }

  return { y1: headerY, y2: tableBottom };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2단계: 좌우 페어링 (표 밖 영역)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 같은 행에 속한 셀들끼리 그룹핑 (Y좌표 편차 기반)
 * 정렬: 각 행 내부 X좌표 오름차순
 */
function groupCellsByRow(cells: Cell[]): Cell[][] {
  if (cells.length === 0) return [];
  const sorted = [...cells].sort((a, b) => a.box.y - b.box.y);
  const rows: Cell[][] = [];
  const avgH = cells.reduce((s, c) => s + c.box.height, 0) / cells.length;
  const rowTol = avgH * 0.6;

  for (const cell of sorted) {
    const cy = cell.box.y + cell.box.height / 2;
    const last = rows[rows.length - 1];
    if (last) {
      const lastCy = last.reduce((s, c) => s + c.box.y + c.box.height / 2, 0) / last.length;
      if (Math.abs(cy - lastCy) < rowTol) { last.push(cell); continue; }
    }
    rows.push([cell]);
  }
  return rows.map(r => r.sort((a, b) => a.box.x - b.box.x));
}

/**
 * 표 밴드 밖 영역에서 좌우 페어 (label|value) 추출.
 *
 * 페어링 규칙:
 *   - 같은 행 (Y 근접) 내에서 X좌표 순서로 배치
 *   - 셀 2개 : label = 왼쪽, value = 오른쪽
 *   - 셀 3개 이상: 좌측부터 [1,2], [3,4] ... 페어링 (라벨-값-라벨-값 패턴)
 *   - 셀 1개: 스킵 (라벨 없이 값만 있거나 그 반대)
 *   - 라벨 셀 텍스트가 콜론(:) 을 포함하면 콜론 앞 = label
 *
 * @param cells 전체 셀
 * @param tableRegion 상품 표 밴드 (이 영역 셀은 제외)
 */
export function extractKeyValuePairs(cells: Cell[], tableRegion: Region | null): KVPair[] {
  if (!Array.isArray(cells)) return [];

  // 표 밖 셀만 추출
  const outsideCells = tableRegion
    ? cells.filter(c => {
        const cy = c.box.y + c.box.height / 2;
        return cy < tableRegion.y1 || cy > tableRegion.y2;
      })
    : cells;

  const rowGroups = groupCellsByRow(outsideCells);
  const pairs: KVPair[] = [];

  for (const row of rowGroups) {
    if (row.length === 0) continue;

    // 한 셀 안에 "라벨: 값" 형태로 들어있는 경우
    if (row.length === 1) {
      const cell = row[0];
      const m = cell.text.match(/^([가-힣A-Za-z\s]{1,10})\s*[:：]\s*(.+)$/);
      if (m) {
        pairs.push({
          label: m[1].trim(),
          value: m[2].trim(),
          labelBox: cell.box,
          valueBox: cell.box,
        });
      }
      continue;
    }

    // 여러 셀: 좌측부터 쌍으로 처리
    for (let i = 0; i + 1 < row.length; i += 2) {
      const left = row[i];
      const right = row[i + 1];

      // 좌우 간격이 너무 멀면 (같은 페어 아닐 수도) 스킵 · 화면폭의 절반 이상
      const gap = right.box.x - (left.box.x + left.box.width);
      const rowSpan = row[row.length - 1].box.x - row[0].box.x;
      if (rowSpan > 0 && gap > rowSpan * 0.7) continue;

      // 좌측 셀 자체에 콜론이 있으면 그 앞을 라벨로
      const colonSplit = left.text.split(/[:：]/);
      const label = colonSplit[0].trim();
      const value = colonSplit.length > 1
        ? [colonSplit.slice(1).join(":").trim(), right.text.trim()].filter(Boolean).join(" ")
        : right.text.trim();

      if (!label || !value) continue;
      pairs.push({ label, value, labelBox: left.box, valueBox: right.box });
    }
  }

  return pairs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3단계: 라벨 → 필드 매핑
// ─────────────────────────────────────────────────────────────────────────────

type FieldKey = keyof Omit<ExtractedMeta, "extraPairs">;

/**
 * 라벨 어휘 사전.
 * 각 필드에 대해 매칭 후보 어휘 리스트 (공백 제거 · 부분 문자열 매치).
 * 우선순위: 특정성이 높은 어휘 먼저 매칭 (예: "이월잔액" → "잔액" 보다 먼저 · "합계액" → "합계" 보다 먼저)
 *
 * 잔액 계열은 total 과 완전 분리 → supplierBalance/balancePrev/balanceAfter 로
 */
const LABEL_VOCAB: Array<[FieldKey, RegExp]> = [
  // ── recipient (공급받는자) 는 supplier 보다 먼저 ─────────────────────────
  ["recipient",       /(공급받는자|공급받는|공급받은|공\s*급\s*받|수신처|수령인|구매자|매입처|매입자|받는자|받은자)/],

  // ── supplier (공급자) — "상호" · "회사명" 도 supplier 후보 (값 필터에서 recipient 는 제외) ─
  ["supplier",        /(공급자|공급사|공급처|판매자|판매처|납품자|납품처|거래처|상\s*호|회\s*사\s*명|업체\s*명)/],

  // ── 잔액 계열 (specific 먼저 → generic 나중) ─────────────────────────────
  ["balancePrev",     /(전\s*잔|이월\s*잔|이월\s*잔\s*액|전월\s*잔|이전\s*잔|기초\s*잔)/],
  ["balanceAfter",    /(누적\s*잔|누계\s*잔|누계\s*잔\s*고|당월\s*잔|기말\s*잔)/],
  ["supplierBalance", /(공급\s*사\s*잔|미\s*수\s*금|미\s*지급|잔\s*액|잔\s*고)/],

  // ── total 계열: 특정성 → 일반성 ──────────────────────────────────────────
  ["subtotal",        /(소\s*계|중간\s*합|중간\s*계)/],
  ["supplyAmount",    /(공\s*급\s*가\s*액|공급가|과세\s*표준|과표)/],
  ["vat",             /(부\s*가\s*세\s*액|부\s*가\s*세|세\s*액|VAT|vat)/],
  ["discount",        /(에누리\s*액|에누리|할\s*인\s*액|할인)/],
  ["salesAmount",     /(매출\s*액|매출\s*금\s*액|판매\s*액)/],
  ["total",           /(총\s*합\s*계\s*금\s*액|총\s*합\s*계|총\s*합|합\s*계\s*액|총\s*금\s*액|총\s*액|차\s*액|합\s*계|계\s*금|총\s*계)/],

  ["salesRep",        /(영업\s*담당|담당자|담\s*당|영업\s*사원)/],
  ["date",            /(발행\s*일|거래\s*일|거래\s*일자|일\s*자|날\s*짜|작성\s*일)/],
];

/**
 * 라벨 텍스트 → 표준 필드명
 * 못 찾으면 null
 */
export function mapLabelToField(labelText: string): FieldKey | null {
  const t = labelText.replace(/[\s()（）]/g, "");
  if (!t) return null;
  for (const [field, re] of LABEL_VOCAB) {
    if (re.test(t)) return field;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4단계: 값 파싱 (필드별 타입 변환)
// ─────────────────────────────────────────────────────────────────────────────

/** 숫자값 파싱: 통화 금액으로 인정되는 최소 조건 게이팅
 *   - 쉼표 있는 숫자 (1,000+) 우선
 *   - 없으면 최소 4자리 (1000 이상)
 *   → "2"·"5" 같은 노이즈 숫자가 total 로 잡히는 것 방지
 */
function parseAmount(s: string): number | null {
  const raw = s.replace(/\s+|원/g, "");
  // 쉼표 포함 우선
  const comma = raw.match(/\d{1,3}(?:,\d{3})+/);
  if (comma) {
    const n = parseInt(comma[0].replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 쉼표 없으면 최소 4자리
  const plain = raw.match(/\d{4,}/);
  if (!plain) return null;
  const n = parseInt(plain[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 날짜 파싱 (YYYY-MM-DD) */
function parseDate(s: string): string | null {
  const m = s.match(/(\d{4})[년.\-\/\s]\s*(\d{1,2})[월.\-\/\s]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 문자값 정리 (앞뒤 공백·특수문자 제거) */
function cleanText(s: string): string {
  return s.replace(/^[:\s\-·]+|[:\s\-·]+$/g, "").trim();
}

const NUMERIC_FIELDS = new Set<FieldKey>([
  "subtotal", "supplyAmount", "vat", "total",
  "discount", "salesAmount",
  "balancePrev", "balanceAfter", "supplierBalance",
]);

const DATE_FIELDS = new Set<FieldKey>(["date"]);

/**
 * 필드별 값 파싱
 * @returns 파싱 성공한 값 or null (매칭 실패 · 재확인 필요)
 */
export function parseFieldValue(field: FieldKey, valueText: string): any {
  if (NUMERIC_FIELDS.has(field)) return parseAmount(valueText);
  if (DATE_FIELDS.has(field))    return parseDate(valueText);
  return cleanText(valueText);
}

// ─────────────────────────────────────────────────────────────────────────────
// 통합 진입점: 셀들 → 메타데이터 추출
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 셀 전체를 받아 상품 표 검출 · KV 페어 추출 · 필드 매핑을 한번에.
 * ppuPaddle.ts / gemini.ts 등에서 후처리 단계로 호출.
 *
 * @param cells PP-OCRv5 검출 셀 리스트
 * @param imageSize 이미지 크기 (표 영역 하단 fallback 용)
 * @param existingMeta 기존 regex 기반 추출 결과 (덮어쓸지 판단용)
 */
export function extractInvoiceMetadata(
  cells: Cell[],
  imageSize?: { width: number; height: number },
  existingMeta: Partial<ExtractedMeta> = {},
): ExtractedMeta {
  const tableRegion = detectProductTableRegion(cells, imageSize?.height);
  const pairs = extractKeyValuePairs(cells, tableRegion);

  const meta: ExtractedMeta = { ...existingMeta };
  const extras: Array<{ label: string; value: string }> = [];

  for (const pair of pairs) {
    const field = mapLabelToField(pair.label);
    if (!field) {
      extras.push({ label: pair.label, value: pair.value });
      continue;
    }

    // ── supplier 값 필터: 수신처(우리 약국) 상호와 일치하면 supplier 로 채택 X ─
    //   상호 라벨 옆에 두 상호가 있을 때 recipient 인 걸 supplier 로 오인 방지
    if (field === "supplier" && isRecipientBusinessName(pair.value)) {
      if (!meta.recipient) meta.recipient = cleanText(pair.value);
      continue;
    }

    const parsed = parseFieldValue(field, pair.value);
    if (parsed == null || parsed === "") continue;

    // 기존 값 우선 (regex 로 잡힌 게 있으면 유지 · KV 는 보완용)
    // ⚠ 이전 정책 (KV 가 무조건 덮어쓰기) → 정상 total 이 노이즈로 오염됨
    // 새 정책: 기존 값 없으면 KV 채택. 있으면 KV 값이 100배 이상 작을 때 무시 (오탐 방지)
    const existing = (meta as any)[field];
    if (NUMERIC_FIELDS.has(field)) {
      if (existing != null && typeof existing === "number" && existing > 0) {
        // KV 값이 기존의 1% 미만이면 노이즈로 판정 · 스킵
        if (typeof parsed === "number" && parsed * 100 < existing) continue;
      }
      (meta as any)[field] = parsed;
    } else if (!existing) {
      (meta as any)[field] = parsed;
    }
  }

  // ── supplierBalance 통합 (KV 에서 명시 안 됐으면 balanceAfter → balancePrev fallback) ─
  if (meta.supplierBalance == null) {
    if (meta.balanceAfter != null) meta.supplierBalance = meta.balanceAfter;
    else if (meta.balancePrev != null) meta.supplierBalance = meta.balancePrev;
  }

  // ── total 이 supplierBalance 와 동일하면 total 오염 (잔고를 총계로 오인) → 무효화 ──
  if (meta.total != null && meta.supplierBalance != null && meta.total === meta.supplierBalance) {
    delete meta.total;
  }

  if (extras.length > 0) meta.extraPairs = extras;
  return meta;
}
