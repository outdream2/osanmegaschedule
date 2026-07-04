export type GeminiResult = { ok: true; text: string } | { ok: false; quota: boolean; error: string };

export const INVOICE_SCHEMA = [
  { name: "번호",  re: /^(번호|no\.?|순번)$/i },
  { name: "일자",  re: /발행\s*일자|전표\s*일자|월\s*일|거래\s*일자|발행\s*일|거래\s*일|^일자$|^날짜$/ },
  { name: "품명",  re: /^품$|^명$|^품목$|품\s*명|품\s*목|상품\s*명|제품\s*명/ },
  { name: "규격",  re: /규\s*격|사양/ },
  { name: "단위",  re: /단\s*위/ },
  { name: "수량",  re: /수\s*량|매수/ },
  { name: "단가",  re: /단\s*가/ },
  { name: "금액",  re: /금\s*액|공급가액|총\s*매출\s*액/ },
  { name: "세액",  re: /세\s*액|부가세/ },
  { name: "비고",  re: /비고|적요/ },
  { name: "유통기한", re: /유통\s*기한|소비\s*기한|소지\s*[\/]?\s*사용\s*기한|소지\s*기한|사용\s*\(?\s*유효\s*\)?\s*기한|사용\s*기한|유효\s*기한|유효\s*기간|만료\s*일/ },
] as const;

export const GEMINI_OCR_PROMPT = `당신은 한국 거래명세서·납품서·세금계산서 전문 OCR 분석 엔진입니다.
이미지에서 품목 표 데이터를 정확히 추출하여 JSON으로 반환하세요.

[문서 구조]
- 상단: 공급자/공급받는자 상호, 날짜, 사업자번호
- 중단: 품목 표 (번호·품명·규격·단위·수량·단가·금액·세액·비고 등)
- 하단: 공급가액 합계, 세액 합계, 총합계

[추출 규칙]
1. 헤더 아래 품목 행만 rows로 추출하세요
2. 합계·소계·총계·총합·계 등이 포함된 행은 rows에서 제외하세요
3. 숫자는 쉼표 제거 후 숫자형으로 반환 (예: "1,500" → 1500, "3개" → 3)
4. 비거나 읽을 수 없는 셀은 null
5. 이미지가 흐리거나 기울어져 있어도 최선을 다해 판독하세요
6. 한글이 뭉개진 경우 문맥으로 추론하세요

[컬럼명 표준화 — 반드시 아래 표준명 사용]
- 품명/품목/상품명/제품명 → "품명"
- 규격/사양/스펙 → "규격"
- 금액/공급가액/총매출액/순매출액/매출액 → "금액"
- 세액/부가세/VAT → "세액"
- 수량/매수/qty → "수량"
- 단가/단위가격/price → "단가"
- 단위/UOM → "단위"
- 비고/적요/메모 → "비고"
- 유통기한/소비기한/소지기한/사용기한/사용(유효)기한/유효기한/유효기간/만료일 → "유통기한"
- 일자/날짜/발행일/거래일 → "일자"

[규격 분리 규칙 — 중요]
- 문서에 규격 컬럼이 없거나 품명에 규격이 붙어 있으면 분리하여 "규격" 컬럼에 기입하세요
- 규격 패턴: 숫자+단위 (mg·g·ml·L·IU·T·C·정·캡슐·포·EA 등), 분수형 (5/50mg), 크기 (50×70mm)
- 예) "비타민C 500mg" → 품명:"비타민C", 규격:"500mg"
- 예) "아모잘탄정 5/50mg" → 품명:"아모잘탄정", 규격:"5/50mg"
- 예) "포카리스웨트(500ml)" → 품명:"포카리스웨트", 규격:"500ml"
- 예) "홍삼정 60캡슐" → 품명:"홍삼정", 규격:"60캡슐"

[메타데이터]
- date: YYYY-MM-DD 형식 (찾을 수 없으면 null)
- supplier: 공급자(납품자/판매자/도매상/제조사) 상호명. 레이아웃에 따라 왼쪽 또는 오른쪽 박스에 위치할 수 있음. "공급자", "판매자", "공급처" 레이블 기준으로 식별. 약국·병원·의원 등 구매처(공급받는자)는 절대 입력 금지. (없으면 null)
- total: 총합계 숫자 (없으면 null)

마크다운·설명 없이 JSON만 응답:
{"headers":["품명","규격","단위","수량","단가","금액","세액"],"rows":[["비타민C","500mg","EA",10,1500,15000,1500],["아모잘탄정","5/50mg","정",5,2000,10000,1000]],"meta":{"supplier":"(주)공급사","date":"2024-01-15","total":26500}}`;

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

  const totals: number[] = [];
  for (const pat of [/합\s*계[^\d]*(\d[\d,]+)/, /총\s*금\s*액[^\d]*(\d[\d,]+)/, /공\s*급\s*가\s*액[^\d]*(\d[\d,]+)/]) {
    const m = text.match(pat);
    if (m) totals.push(parseInt(m[1].replace(/,/g, "")));
  }
  if (totals.length > 0) meta.total = Math.max(...totals);

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
