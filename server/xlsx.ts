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

export function xlsxToRows(buf: Buffer): Record<string, any>[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) as any[][];
  const result: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const obj: Record<string, any> = {};
    for (let c = 0; c < COL_KEYS.length; c++) {
      const v = row[c];
      obj[COL_KEYS[c]] = (v !== undefined && v !== null && String(v).trim() !== "") ? String(v).trim() : null;
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
