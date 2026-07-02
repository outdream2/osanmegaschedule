import { supabase } from "../../src/supabase/client";

export interface BarcodeProduct {
  barcode: string;
  code: string;
  name: string;
  spec: string | null;
  supplier: string | null;
  masterPrice: number | null;
  salePrice: number | null;
  profitRate: number | null;
  expiryDate: string | null;
}

/**
 * 바코드 목록을 DB products 테이블과 대조합니다.
 * product_code 컬럼이 EAN 형식인 상품이 있으면 직접 매칭됩니다.
 * 매칭되지 않는 바코드는 결과에 포함되지 않습니다.
 */
export async function lookupBarcodes(barcodes: string[]): Promise<BarcodeProduct[]> {
  if (barcodes.length === 0) return [];

  const { data, error } = await supabase
    .from("products")
    .select("product_code, product_name, spec, supplier, purchase_price, sale_price, profit_rate, expiry_date")
    .in("product_code", barcodes);

  if (error) { console.warn("[BarcodeService] lookupBarcodes 오류:", error.message); return []; }
  if (!data?.length) return [];

  // 어떤 바코드가 어느 상품에 매칭됐는지 맵 구성
  const codeMap = new Map(data.filter((p: any) => p.product_code).map((p: any) => [p.product_code, p]));

  return barcodes
    .filter(b => codeMap.has(b))
    .map(b => {
      const p = codeMap.get(b)!;
      return {
        barcode: b,
        code: p.product_code,
        name: p.product_name ?? "",
        spec: p.spec ?? null,
        supplier: p.supplier ?? null,
        masterPrice: p.purchase_price ?? null,
        salePrice: p.sale_price ?? null,
        profitRate: p.profit_rate ?? null,
        expiryDate: p.expiry_date ?? null,
      };
    });
}

/**
 * 바코드 목록을 Gemini 프롬프트 힌트 문자열로 변환합니다.
 * DB 매칭 여부에 상관없이 원시 바코드 값을 전달해 Gemini가 활용하도록 합니다.
 */
export function buildBarcodeHint(barcodes: string[], matched: BarcodeProduct[]): string {
  if (barcodes.length === 0) return "";

  const lines: string[] = ["[바코드 선스캔 결과 — 최우선 참고]"];
  lines.push(`이미지에서 ${barcodes.length}개의 바코드가 감지되었습니다:`);

  const matchedMap = new Map(matched.map(m => [m.barcode, m]));

  barcodes.forEach((bc, i) => {
    const m = matchedMap.get(bc);
    if (m) {
      lines.push(`  ${i + 1}. ${bc} → DB 확인됨: "${m.name}"${m.spec ? ` (${m.spec})` : ""}`);
    } else {
      lines.push(`  ${i + 1}. ${bc} (DB 미매칭)`);
    }
  });

  lines.push("위 바코드 순서는 표의 행 순서와 대응될 수 있으니 품명 추출 시 참고하세요.");
  return lines.join("\n");
}
