import XLSX from "xlsx";

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

// 날짜형 컬럼: Excel 시리얼 넘버·다양한 형식을 YYYY-MM-DD로 표준화
const DATE_KEYS = new Set([
  "expiry_date", "last_purchase_date", "last_sale_date",
  "last_modified_at", "registered_at",
]);

// 값을 YYYY-MM-DD 로 정규화. 인식 실패 시 원본 반환 (혹은 null).
function normalizeDate(v: any): string | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  // Date 객체 (cellDates: true 로 파싱된 경우)
  if (v instanceof Date && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  // 숫자 → Excel 날짜 시리얼 (1900 epoch, ~30_000 ~ 100_000 범위)
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 100000) {
    // XLSX 유틸: 시리얼 → date-fields
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y) {
      return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
    }
  }
  // 문자열 — 이미 YYYY-MM-DD 형식이면 그대로. 숫자 문자열이면 시리얼 변환.
  const s = String(v).trim();
  if (/^\d{4}[-.\/]\d{2}[-.\/]\d{2}/.test(s)) {
    const m = /^(\d{4})[-.\/](\d{2})[-.\/](\d{2})/.exec(s)!;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  // 숫자 문자열 (예: "46190") → Excel 시리얼로 재시도
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 100000) {
    const parsed = XLSX.SSF.parse_date_code(n);
    if (parsed && parsed.y) {
      return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
    }
  }
  return s;
}

export function xlsxToRows(buf: Buffer): Record<string, any>[] {
  // cellDates:true 로 날짜 셀은 Date 객체로 파싱 (Excel 시리얼 넘버 자동 변환)
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true }) as any[][];
  const result: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const obj: Record<string, any> = {};
    for (let c = 0; c < COL_KEYS.length; c++) {
      const v = row[c];
      const key = COL_KEYS[c];
      if (DATE_KEYS.has(key)) {
        obj[key] = normalizeDate(v);
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
