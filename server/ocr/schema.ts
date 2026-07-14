export type GeminiResult = { ok: true; text: string } | { ok: false; quota: boolean; error: string };

// 2026-07-09 컬럼 순서 개편: 사용자 요청 표시 순서
//   품명 → 수량 → 단가 → 금액 → 규격 → 유통기한 → (기타)
// 공급사는 meta.supplier 로 별도 표시 (표 컬럼이 아님)
export const INVOICE_SCHEMA = [
  { name: "품명",     re: /^품$|^명$|^품목$|품\s*명|품\s*목|상품\s*명|제품\s*명/ },
  { name: "수량",     re: /수\s*량|매수/ },
  { name: "단가",     re: /단\s*가/ },
  { name: "금액",     re: /금\s*액|공급가액|총\s*매출\s*액|합계\s*금액/ },
  { name: "규격",     re: /규\s*격|사양/ },
  { name: "유통기한", re: /유통\s*기한|소비\s*기한|소지\s*[\/]?\s*사용\s*기한|소지\s*기한|사용\s*\(?\s*유효\s*\)?\s*기한|사용\s*기한|유효\s*기한|유효\s*기간|만료\s*일/ },
  { name: "단위",     re: /단\s*위/ },
  { name: "세액",     re: /세\s*액|부가세/ },
  { name: "비고",     re: /비고|적요/ },
  { name: "일자",     re: /발행\s*일자|전표\s*일자|월\s*일|거래\s*일자|발행\s*일|거래\s*일|^일자$|^날짜$/ },
  { name: "번호",     re: /^(번호|no\.?|순번)$/i },
] as const;

export const GEMINI_OCR_PROMPT = `당신은 한국 거래명세서·납품서·세금계산서 전문 OCR 분석 엔진입니다.
이미지에서 품목 표 데이터를 정확히 추출하여 JSON으로 반환하세요.

[문서 구조]
- 상단: 공급자/공급받는자 상호, 날짜, 사업자번호
- 중단: 품목 표 (번호·품명·규격·단위·수량·단가·금액·세액·비고 등)
- 하단: 공급가액 합계, 세액 합계, 총합계

[추출 규칙]
1. 헤더 아래 품목 행만 rows로 추출하세요 — **오직 상품 정보만** (품명·수량·단가·금액·규격·유통기한)
2. 합계·소계·총계·총합·계 등이 포함된 행은 rows에서 제외하세요
3. **배송·행정 정보는 절대 rows나 supplier에 넣지 마세요**:
   - 차량번호, 차람번호, 기사명, 배송기사, 운송차량
   - 배송처, 배송지, 배송일자, 배송일
   - 인수자, 인수확인, 담당자, 담당자명, 영업담당
   - 상호인란, 상호란, 성명란
   - TEL, FAX, 전화번호, 팩스, 주소, 사업장주소, 소재지
   - 업태, 종목, 업종, 거래처코드, 거래처번호
   - 페이지, 쪽 번호
4. 숫자는 쉼표 제거 후 숫자형으로 반환 (예: "1,500" → 1500, "3개" → 3)
5. 비거나 읽을 수 없는 셀은 null
6. 이미지가 흐리거나 기울어져 있어도 최선을 다해 판독하세요
7. 한글이 뭉개진 경우 문맥으로 추론하세요

[컬럼명 표준화 — 반드시 아래 표준명 사용]
- 품명/품목/상품명/제품명 → "품명"
- 규격/사양/스펙 → "규격"
- 금액/공급가액/총매출액/순매출액/매출액/합계금액 → "금액"
- 세액/부가세/VAT → "세액"
- 수량/매수/qty → "수량"
- 단가/단위가격/price → "단가"
- 단위/UOM → "단위"
- 비고/적요/메모 → "비고"
- 유통기한/소비기한/소지기한/사용기한/사용(유효)기한/유효기한/유효기간/만료일 → "유통기한"
- 일자/날짜/발행일/거래일 → "일자"

[출력 컬럼 순서 — 반드시 아래 순서 유지]
headers 를 반환할 때 반드시 다음 순서로 배열: ["품명", "수량", "단가", "금액", "규격", "유통기한", ...(추가 컬럼)]
rows 도 이 순서에 맞춰 각 셀 값을 배치.

[규격 분리 규칙 — 중요]
- 문서에 규격 컬럼이 없거나 품명에 규격이 붙어 있으면 분리하여 "규격" 컬럼에 기입하세요
- 규격 패턴: 숫자+단위 (mg·g·ml·L·IU·T·C·정·캡슐·포·EA 등), 분수형 (5/50mg), 크기 (50×70mm)
- 예) "비타민C 500mg" → 품명:"비타민C", 규격:"500mg"
- 예) "아모잘탄정 5/50mg" → 품명:"아모잘탄정", 규격:"5/50mg"
- 예) "포카리스웨트(500ml)" → 품명:"포카리스웨트", 규격:"500ml"
- 예) "홍삼정 60캡슐" → 품명:"홍삼정", 규격:"60캡슐"

[숫자 정합성 검증 규칙 — 매우 중요]
- 각 행은 "수량 × 단가 = 금액" 관계가 반드시 성립합니다
- 표에 라벨된 "수량" 컬럼과 "단가" 컬럼을 곱해서 "금액"과 일치하지 않으면 재판독 필요:
  a) 다른 숫자 컬럼 (단위·박스수·포장·개수 등) 중 (X × 단가 ≈ 금액) 을 만족하는 값을 실제 수량으로 사용
  b) "1.000" · "2.000" 같은 값은 점(.)이 천 단위 구분자로 오독된 것 → 1000 · 2000 으로 변환
  c) 5자리 이상의 큰 수(예 25044)가 "수량"에 있는데 단가·금액과 관계식이 안 맞으면 로트번호/제품코드일 가능성이 높으므로 수량이 아닌 "비고" 컬럼으로 이동
  d) 유통기한 형식(YYYY.MM.DD)이 "수량"이나 "단가"에 잘못 들어가지 않도록 주의
- 소계·총합계는 반드시 (모든 행의 금액 합) = meta.total 과 일치해야 함. 불일치하면 어느 행의 금액이 잘못 인식됐는지 재확인

[숫자 파싱 규칙]
- 쉼표 제거: "1,500" → 1500
- 점(.)을 천단위 구분자로 사용한 경우: "1.500" 이 값이 1500 이라면 그대로 1500. 진짜 소수점이면 (예 이익률 12.5%) 소수 유지
- 후행 단위 제거: "3개" → 3, "10정" → 10, "5EA" → 5
- 빈 셀은 null

[메타데이터]
- date: YYYY-MM-DD 형식 (찾을 수 없으면 null)
- supplier: 공급자(납품자/판매자/도매상/제조사) 상호명. 레이아웃에 따라 왼쪽 또는 오른쪽 박스에 위치할 수 있음. "공급자", "판매자", "공급처" 레이블 기준으로 식별. 약국·병원·의원 등 구매처(공급받는자)는 절대 입력 금지. (없으면 null)
- subtotal: "소계" 값 — 품목 소계 (없으면 null)
- discount: "에누리" or "에누리액" or "할인" or "할인액" 값 — 총 할인/에누리 금액 (없으면 null)
- supplyAmount: "공급가액" 값 — 부가세 제외 순매출액 (없으면 null)
- vat: "세액" or "부가세" 값 — VAT 총합 (없으면 null)
- total: "총합계" or "합계" or "합계금액" 값 — 부가세 포함 최종 총액 (없으면 null)
- balancePrev: "전잔액" 또는 "이월잔액" (없으면 null)
- balanceAfter: "잔액" — 이번 거래 후 누적 잔액 (없으면 null)

마크다운·설명 없이 JSON만 응답:
{"headers":["품명","수량","단가","금액","규격","유통기한","세액","단위"],"rows":[["비타민C",10,1500,15000,"500mg",null,1500,"EA"],["아모잘탄정",5,2000,10000,"5/50mg",null,1000,"정"]],"meta":{"supplier":"(주)공급사","date":"2024-01-15","subtotal":25000,"supplyAmount":25000,"vat":2500,"total":27500,"balancePrev":100000,"balanceAfter":127500}}`;

export function parseKoreanInvoice(text: string): {
  headers: string[]; rows: (string | number | null)[][]; meta: any; rawText?: string;
} {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 1);
  const meta: Record<string, any> = {};

  const dateM = text.match(/(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?/);
  if (dateM) meta.date = `${dateM[1]}-${dateM[2].padStart(2,"0")}-${dateM[3].padStart(2,"0")}`;

  const supM = text.match(/공\s*급\s*[자처사]\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (supM) meta.supplier = supM[1].trim().replace(/\s{2,}.*$/, "");
  const recM = text.match(/공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (recM) meta.recipient = recM[1].trim().replace(/\s{2,}.*$/, "");

  // ─── 각종 합계 금액 추출 (소계·에누리·할인·공급가액·세액·합계·총합계·잔액) ───
  // 쉼표(천단위 구분자)가 있는 숫자만 추출 (코드/일련번호 오인식 방지)
  const parseAmt = (s: string): number | null => {
    const n = parseInt(s.replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const findAmt = (patterns: RegExp[]): number | null => {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) { const n = parseAmt(m[1]); if (n) return n; }
    }
    return null;
  };
  const subtotalV = findAmt([/소\s*계[^\d]*(\d{1,3}(?:,\d{3})+)/]);
  const discountV = findAmt([
    /에누리\s*액?[^\d]*(\d{1,3}(?:,\d{3})+)/,
    /할\s*인\s*액?[^\d]*(\d{1,3}(?:,\d{3})+)/,
  ]);
  const supplyAmountV = findAmt([/공\s*급\s*가\s*액[^\d]*(\d{1,3}(?:,\d{3})+)/]);
  const vatV = findAmt([/세\s*액[^\d]*(\d{1,3}(?:,\d{3})+)/, /부\s*가\s*세[^\d]*(\d{1,3}(?:,\d{3})+)/]);
  const balancePrevV = findAmt([/전\s*잔\s*액[^\d]*(\d{1,3}(?:,\d{3})+)/, /이\s*월\s*잔\s*액[^\d]*(\d{1,3}(?:,\d{3})+)/]);
  const balanceAfterV = findAmt([/(?<!전\s*)(?<!이\s*월\s*)잔\s*액[^\d]*(\d{1,3}(?:,\d{3})+)/]);
  if (subtotalV) meta.subtotal = subtotalV;
  if (discountV) meta.discount = discountV;
  if (supplyAmountV) meta.supplyAmount = supplyAmountV;
  if (vatV) meta.vat = vatV;
  if (balancePrevV) meta.balancePrev = balancePrevV;
  if (balanceAfterV) meta.balanceAfter = balanceAfterV;

  // total 추출: 라벨 특정성 우선 · Math.max 금지 (잔액 오염 방지)
  const totalPatterns: RegExp[] = [
    /합\s*계\s*금\s*액[^\d]{0,20}(\d{1,3}(?:,\d{3})+)/,
    /총\s*합\s*계[^\d]{0,20}(\d{1,3}(?:,\d{3})+)/,
    /총\s*금\s*액[^\d]{0,20}(\d{1,3}(?:,\d{3})+)/,
    /합\s*계(?!\s*액)[^\d]{0,20}(\d{1,3}(?:,\d{3})+)/,
  ];
  for (const pat of totalPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseInt(m[1].replace(/,/g, ""), 10);
      if (val > 0) { meta.total = val; break; }
    }
  }
  // 잔고 오염 방지
  if (meta.total != null && (meta.total === meta.balancePrev || meta.total === meta.balanceAfter)) {
    delete meta.total;
  }

  const KW = ["품목","품명","상품명","수량","단가","금액","규격","단위","공급가액","세액","적요","번호","No"];
  let hIdx = -1;
  let headers: string[] = [];
  let useSingleSpaceSplit = false;

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    const hits = parts.filter(p => KW.some(k => p.includes(k))).length;
    if (hits >= 2 && parts.length >= 3) { hIdx = i; headers = parts; break; }
  }

  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      const hits = parts.filter(p => KW.some(k => p.includes(k))).length;
      if (hits >= 2 && parts.length >= 3) {
        hIdx = i; headers = parts; useSingleSpaceSplit = true; break;
      }
    }
  }

  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.some(p => KW.some(k => p.includes(k)))) {
        hIdx = i; headers = parts; break;
      }
    }
  }

  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.some(p => KW.some(k => p.includes(k)))) {
        hIdx = i; headers = parts; useSingleSpaceSplit = true; break;
      }
    }
  }

  if (hIdx === -1 || headers.length === 0) {
    return { headers: ["원문 텍스트"], rows: lines.map(l => [l]), meta, rawText: text };
  }

  const NUMERIC_KW = ["번호","수량","단가","금액","공급가액","세액"];
  const numericIdxs = headers.map((h, i) => NUMERIC_KW.some(k => h.includes(k)) ? i : -1).filter(i => i >= 0);
  const textIdxs    = headers.map((_, i) => i).filter(i => !numericIdxs.includes(i));

  const isNumToken = (t: string) => {
    const core = t.trim().replace(/[가-힣a-zA-Z]+$/, "").replace(/,/g, "");
    return core.length > 0 && /^\d+(\.\d+)?$/.test(core);
  };

  const toVal = (s: string): string | number | null => {
    if (!s) return null;
    const stripped = s.replace(/[가-힣a-zA-Z]+$/, "").trim();
    if (!stripped) return s;
    // 천 단위 쉼표를 마침표로 오독한 경우: "15.000" → 15000, "1.500.000" → 1500000
    const dotThousands = stripped.replace(/,/g, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(dotThousands)) {
      return parseInt(dotThousands.replace(/\./g, ""), 10);
    }
    const c = stripped.replace(/,/g, "");
    const n = parseFloat(c);
    return (c.length > 0 && !isNaN(n) && /^-?\d+(\.\d+)?$/.test(c)) ? n : s;
  };

  function smartAlign(tokens: string[], H: number): string[] {
    const result = new Array(H).fill("");
    if (tokens.length === 0) return result;
    const numToks = [...tokens].reverse().filter(isNumToken).slice(0, numericIdxs.length).reverse();
    const textToks = tokens.slice(0, tokens.length - numToks.length);
    const offset = numericIdxs.length - numToks.length;
    for (let j = 0; j < numToks.length; j++) {
      result[numericIdxs[offset + j]] = numToks[j];
    }
    if (textIdxs.length > 0) {
      if (textToks.length <= textIdxs.length) {
        textToks.forEach((t, j) => { result[textIdxs[j]] = t; });
      } else {
        const overflowCount = textToks.length - textIdxs.length;
        result[textIdxs[0]] = textToks.slice(0, overflowCount + 1).join(" ");
        for (let j = 1; j < textIdxs.length; j++) {
          result[textIdxs[j]] = textToks[overflowCount + j] ?? "";
        }
      }
    }
    return result;
  }

  const rows: (string | number | null)[][] = [];

  for (let i = hIdx + 1; i < lines.length; i++) {
    if (/^[-=*─━]+$/.test(lines[i].trim())) continue;
    if (/합계|소계|총계|합 계/.test(lines[i]) && !/품/.test(lines[i])) continue;

    let parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2 || useSingleSpaceSplit) {
      const loose = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      if (loose.length > parts.length) parts = loose;
    }
    if (parts.length < 1) continue;

    const H = headers.length;
    const P = parts.length;
    let alignedParts: string[];

    if (P === H) {
      alignedParts = parts;
    } else {
      alignedParts = smartAlign(parts, H);
    }

    const row = alignedParts.map(toVal);
    if (row.every(v => v === null || v === "")) continue;
    rows.push(row);
  }

  if (rows.length === 0) return { headers: ["원문 텍스트"], rows: lines.map(l => [l]), meta, rawText: text };
  return { headers, rows, meta };
}
