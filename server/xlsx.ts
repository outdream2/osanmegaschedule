import XLSX from "xlsx";

// 기존 컨슈머(server/routes/products.ts) 가 헤더 개수 검증에 사용
export const COL_KEYS = [
  "product_code","product_name","col_i","product_type","origin","spec",
  "purchase_price","sale_price","profit_rate","delivery_price","delivery_profit_rate",
  "sale_status","app_registered","image_registered","preset_registered","preset_group",
  "promotion_name","promotion_priority","promotion_purchase_price","promotion_sale_price",
  "promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type",
  "current_stock","stock_amount","optimal_stock","last_purchase_date","last_sale_date",
  "category_code","category","operator","last_modified_at","registered_at",
  "min_order","point_rate","sales_commission","delivery_margin_rate","search_keywords",
  "unit","total_volume","unit_volume","unit_price","connection_type","individual_code","individual_quantity",
] as const;

// ── 헤더 텍스트 → DB 필드 매핑 ──────────────────────────────────────────────
// ERP 엑셀 헤더 순서는 버전마다 다르므로 헤더 이름으로 컬럼을 식별한다.
// 하나의 필드에 대해 여러 헤더 후보를 정규식으로 등록 (한글/영문/공백/줄바꿈 관용)
const HEADER_MATCHERS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "product_code",             patterns: [/^상품\s*코드$/, /^코드$/, /^product[_ ]?code$/i] },
  { key: "product_name",             patterns: [/^상품\s*명$/, /^명$/, /^product[_ ]?name$/i] },
  { key: "col_i",                    patterns: [/^i$/i] },
  { key: "product_type",             patterns: [/^상품\s*유형$/] },
  { key: "origin",                   patterns: [/^원산지$/] },
  { key: "spec",                     patterns: [/^규격$/, /^spec$/i] },
  { key: "purchase_price",           patterns: [/^매입\s*단가$/, /^매입가$/] },
  { key: "sale_price",               patterns: [/^판매\s*단가$/, /^판매가$/] },
  { key: "profit_rate",              patterns: [/^이익률$/, /^마진율$/] },
  { key: "delivery_price",           patterns: [/^출고\s*단가$/, /^배송\s*단가$/] },
  { key: "delivery_profit_rate",     patterns: [/^출고\s*이익률$/, /^배송\s*이익률$/, /^배송\s*마진율$/] },
  { key: "sale_status",              patterns: [/^판매\s*상태$/] },
  { key: "app_registered",           patterns: [/^APP\s*등록\s*상품$/i, /^APP\s*등록$/i, /^앱\s*등록$/] },
  { key: "image_registered",         patterns: [/^이미지\s*등록\s*여부$/, /^이미지\s*등록$/] },
  { key: "preset_registered",        patterns: [/^프리셋\s*등록\s*상품$/, /^프리셋\s*등록$/] },
  { key: "preset_group",             patterns: [/^프리셋\s*그룹$/] },
  { key: "promotion_name",           patterns: [/^행사명$/, /^프로모션\s*명$/] },
  { key: "promotion_priority",       patterns: [/^행사\s*우선순위$/, /^프로모션\s*우선순위$/] },
  { key: "promotion_purchase_price", patterns: [/^행사\s*매입가$/, /^프로모션\s*매입가$/] },
  { key: "promotion_sale_price",     patterns: [/^행사\s*판매가$/, /^프로모션\s*판매가$/] },
  { key: "promotion_profit_rate",    patterns: [/^행사\s*매익률$/, /^행사\s*이익률$/, /^프로모션\s*이익률$/] },
  { key: "promotion_discount_rate",  patterns: [/^행사\s*할인율$/, /^프로모션\s*할인율$/] },
  { key: "wholesale_price1",         patterns: [/^도매\s*단가\s*1$/, /^도매\s*가\s*1$/, /^도매\s*가1$/] },
  { key: "supplier_code",            patterns: [/^공급사\s*코드$/, /^supplier[_ ]?code$/i] },
  { key: "supplier",                 patterns: [/^공급사$/, /^공급사명$/, /^supplier$/i] },
  { key: "supplier_type",            patterns: [/^공급사\s*구분$/, /^공급사\s*유형$/] },
  { key: "expiry_date",              patterns: [/^유통기한$/, /^유효기간$/, /^expiry[_ ]?date$/i] },
  { key: "display_location",         patterns: [/^진열\s*위치$/, /^진열\s*구역$/, /^display[_ ]?location$/i] },
  { key: "management_group",         patterns: [/^관리\s*그룹$/, /^관리군$/] },
  { key: "unit_type",                patterns: [/^단위\s*유형$/, /^단위\s*타입$/] },
  { key: "current_stock",            patterns: [/^현재고$/, /^재고$/, /^current[_ ]?stock$/i, /^수량$/] },
  { key: "stock_amount",             patterns: [/^재고\s*금액$/, /^재고금액$/, /^stock[_ ]?amount$/i] },
  { key: "optimal_stock",            patterns: [/^적정\s*재고$/, /^적정재고$/, /^optimal[_ ]?stock$/i] },
  { key: "last_purchase_date",       patterns: [/^최근\s*매입일$/, /^최근매입일$/, /^last[_ ]?purchase[_ ]?date$/i] },
  { key: "last_sale_date",           patterns: [/^최근\s*매출일$/, /^최근매출일$/, /^최근\s*판매일$/, /^last[_ ]?sale[_ ]?date$/i] },
  { key: "category_code",            patterns: [/^분류\s*코드$/, /^분류코드$/, /^category[_ ]?code$/i] },
  { key: "category",                 patterns: [/^분류$/, /^category$/i] },
  { key: "operator",                 patterns: [/^작업자$/, /^operator$/i] },
  { key: "last_modified_at",         patterns: [/^최종\s*작업\s*일시$/, /^최종작업일시$/, /^최종\s*수정일$/] },
  { key: "registered_at",            patterns: [/^상품\s*등록\s*일시$/, /^상품등록일시$/, /^등록일시$/, /^등록일$/] },
  { key: "min_order",                patterns: [/^최소\s*발주$/, /^최소발주$/] },
  { key: "point_rate",               patterns: [/^포인트\s*적립률$/, /^적립률$/] },
  { key: "sales_commission",         patterns: [/^판매\s*분\s*\/\s*수수료$/, /^판매분\/수수료$/, /^수수료$/] },
  { key: "delivery_margin_rate",     patterns: [/^출고\s*마진율$/, /^배송\s*마진율$/] },
  { key: "search_keywords",          patterns: [/^검색어$/, /^검색\s*키워드$/, /^search[_ ]?keywords$/i] },
  { key: "unit",                     patterns: [/^단위$/, /^unit$/i] },
  { key: "total_volume",             patterns: [/^총\s*용량$/, /^총용량$/] },
  { key: "unit_volume",              patterns: [/^단위\s*용량$/] },
  { key: "unit_price",               patterns: [/^단위\s*가격$/] },
  { key: "connection_type",          patterns: [/^연결\s*구분$/, /^연결구분$/] },
  { key: "individual_code",          patterns: [/^낱개\s*코드$/] },
  { key: "individual_quantity",      patterns: [/^낱개\s*수량$/] },
];

// 날짜형 컬럼: Excel 시리얼 넘버·다양한 형식을 YYYY-MM-DD로 표준화
const DATE_KEYS = new Set([
  "expiry_date", "last_purchase_date", "last_sale_date",
  "last_modified_at", "registered_at",
]);

// 숫자형 컬럼: 항상 number|null 로 저장 (콤마·통화기호 안전 처리)
const NUMERIC_KEYS = new Set([
  "purchase_price", "sale_price", "profit_rate",
  "delivery_price", "delivery_profit_rate",
  "promotion_purchase_price", "promotion_sale_price",
  "promotion_profit_rate", "promotion_discount_rate",
  "wholesale_price1",
  "current_stock", "stock_amount", "optimal_stock",
  "min_order", "point_rate", "sales_commission", "delivery_margin_rate",
  "total_volume", "unit_volume", "unit_price", "individual_quantity",
  "promotion_priority",
]);

function normalizeNumber(v: any): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "null" || s.toLowerCase() === "nan") return null;
  const cleaned = s.replace(/[,\s₩원]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(v: any): string | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS cellDates:true 는 시리얼→Date 변환 시 부동소수점으로 자정 직전(예 23:59:08)이 될 수 있음.
    // 한국(UTC+9) 등 동시간대에서 .getDate() 가 하루 밀리는 것을 방지하기 위해 12h 버퍼 후 로컬 성분 추출.
    const shifted = new Date(v.getTime() + 12 * 3600 * 1000);
    const yyyy = shifted.getFullYear();
    const mm = String(shifted.getMonth() + 1).padStart(2, "0");
    const dd = String(shifted.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 100000) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y) {
      return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}[-.\/]\d{2}[-.\/]\d{2}/.test(s)) {
    const m = /^(\d{4})[-.\/](\d{2})[-.\/](\d{2})/.exec(s)!;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 100000) {
    const parsed = XLSX.SSF.parse_date_code(n);
    if (parsed && parsed.y) {
      return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
    }
  }
  return s;
}

// 헤더 텍스트 정규화: 줄바꿈/양끝 공백 제거 (내부 공백은 유지 · 패턴에서 \s* 로 처리)
function normalizeHeader(v: any): string {
  return String(v ?? "").replace(/\r?\n/g, " ").trim();
}

// 헤더 행 → { fieldKey: colIndex } 매핑 생성
// 중복 헤더가 있으면 첫 매칭만 사용 (뒤 컬럼은 무시)
function buildHeaderIndex(headerRow: any[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (let c = 0; c < headerRow.length; c++) {
    const h = normalizeHeader(headerRow[c]);
    if (!h) continue;
    for (const { key, patterns } of HEADER_MATCHERS) {
      if (idx[key] !== undefined) continue; // 이미 매핑된 필드 skip
      if (patterns.some(p => p.test(h))) {
        idx[key] = c;
        break;
      }
    }
  }
  return idx;
}

export function xlsxToRows(buf: Buffer): Record<string, any>[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true }) as any[][];
  if (rows.length === 0) return [];

  // 첫 행을 헤더로 사용 · 이름 기반으로 컬럼 인덱스 구성
  const headerIdx = buildHeaderIndex(rows[0] ?? []);
  const codeCol = headerIdx["product_code"];
  if (codeCol === undefined) {
    throw new Error("상품코드 컬럼을 헤더에서 찾지 못했습니다. 엑셀 첫 행에 '상품코드' 헤더가 있어야 합니다.");
  }

  const result: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const code = String(row[codeCol] ?? "").trim();
    if (!code) continue;

    const obj: Record<string, any> = {};
    // COL_KEYS 전체 순회하면서 헤더 인덱스에 있는 필드만 값 배치
    for (const key of COL_KEYS) {
      const c = headerIdx[key];
      const v = c !== undefined ? row[c] : undefined;
      if (DATE_KEYS.has(key)) {
        obj[key] = normalizeDate(v);
      } else if (NUMERIC_KEYS.has(key)) {
        obj[key] = normalizeNumber(v);
      } else if (v !== undefined && v !== null && String(v).trim() !== "") {
        obj[key] = String(v).trim();
      } else {
        obj[key] = null;
      }
    }
    result.push(obj);
  }
  return result;
}

export function rowsToCSV(rows: Record<string, any>[]): string {
  const headers = [...COL_KEYS];
  const esc = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))];
  return lines.join("\n");
}
