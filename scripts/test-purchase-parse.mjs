// purchase.ts 파싱 로직 단위 테스트 (서버 없이 검증)
import XLSX from "xlsx";

const wb = XLSX.readFile("src/매입상세현황_2026-0701_07-15.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

// ─── purchase.ts 파싱 로직 재현 ───
const findCol = (headers, patterns) => {
  for (const p of patterns) {
    const i = headers.findIndex(h => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};
const parseNum = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const scoreRow = row => new Set((row ?? []).map(v => String(v ?? "").trim()).filter(Boolean)).size;
const row0S = scoreRow(arr[0]);
const row1S = scoreRow(arr[1] ?? []);
const row0Arr = arr[0] ?? [];
const row0HasDup = row0Arr.length > 0 && new Set(row0Arr.map(v => String(v ?? "").trim()).filter(Boolean)).size < row0Arr.filter(v => String(v ?? "").trim()).length;

console.log(`Row0 unique=${row0S}, Row1 unique=${row1S}, row0HasDup=${row0HasDup}`);

let headers, dataRows;
if (row0HasDup && arr.length >= 3) {
  const row1Arr = arr[1] ?? [];
  const labelCounts = new Map();
  row1Arr.forEach(h => {
    const l = String(h ?? "").trim();
    if (l) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1);
  });
  headers = row1Arr.map((h, i) => {
    const label = String(h ?? "").trim();
    const cat = String(row0Arr[i] ?? "").trim();
    const isDup = (labelCounts.get(label) ?? 0) > 1;
    if (isDup && cat && cat !== label) return `${cat}_${label}`;
    return label;
  });
  dataRows = arr.slice(2);
  console.log("→ Row0+Row1 결합 헤더 사용 (중복만 접두어)");
} else {
  const headerRowIdx = row1S > row0S ? 1 : 0;
  headers = (arr[headerRowIdx] ?? []).map(h => String(h ?? "").trim());
  dataRows = arr.slice(headerRowIdx + 1);
  console.log(`→ Row${headerRowIdx} 단독 헤더 사용`);
}

console.log(`\n결합 헤더:`, headers);

const dateI = findCol(headers, [/^매입\s*일자?$/, /^매입일$/, /^일자$/, /^날짜$/, /^발행일자?$/, /^입고\s*일자?$/, /purchase[_ ]?date/i]);
const codeI = findCol(headers, [/^상품\s*코드$/, /^코드$/, /^품목\s*코드$/, /product[_ ]?code/i]);
const nameI = findCol(headers, [/^상품\s*명$/, /^품명$/, /^품목명$/, /^명$/, /product[_ ]?name/i]);
const qtyI = findCol(headers, [/^매입합계[_ ]?수량$/, /^매입[_ ]?수량$/, /^수량$/, /quantity/i, /^qty$/i]);
const amountI = findCol(headers, [/^매입합계[_ ]?금액$/, /^매입[_ ]?금액$/, /^공급\s*가액?$/, /^금액$/, /amount/i]);
const returnQtyI = findCol(headers, [/^반품[_ ]?수량$/]);
const returnAmtI = findCol(headers, [/^반품[_ ]?금액$/]);
const priceI = findCol(headers, [/^매입합계[_ ]?평균매입단가$/, /^평균매입단가$/]);

console.log(`\n매핑 결과:`);
console.log(`  codeI=${codeI} "${headers[codeI] ?? "-"}"`);
console.log(`  nameI=${nameI} "${headers[nameI] ?? "-"}"`);
console.log(`  dateI=${dateI} "${headers[dateI] ?? "(없음)"}"`);
console.log(`  qtyI=${qtyI} "${headers[qtyI] ?? "-"}"`);
console.log(`  amountI=${amountI} "${headers[amountI] ?? "-"}"`);
console.log(`  priceI=${priceI} "${headers[priceI] ?? "-"}"`);
console.log(`  returnQtyI=${returnQtyI} "${headers[returnQtyI] ?? "-"}"`);
console.log(`  returnAmtI=${returnAmtI} "${headers[returnAmtI] ?? "-"}"`);

// 파일명에서 날짜 추출
const filename = "매입상세현황_2026-0701_07-15.xlsx";
const m = filename.match(/(\d{4})[-_]?(\d{2})(\d{2})[-_](\d{2})[-_]?(\d{2})/);
const inferredFrom = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
const inferredTo = m ? `${m[1]}-${m[4]}-${m[5]}` : null;
console.log(`\n파일명 날짜 파싱: from=${inferredFrom} to=${inferredTo}`);

// 데이터 파싱 (3행만 샘플)
console.log(`\n첫 3행 파싱 결과:`);
for (let i = 0; i < Math.min(3, dataRows.length); i++) {
  const r = dataRows[i];
  const code = String(r[codeI] ?? "").trim();
  if (!code) continue;
  const qty = parseNum(r[qtyI]);
  const amt = parseNum(r[amountI]);
  const returnQty = returnQtyI >= 0 ? parseNum(r[returnQtyI]) : 0;
  const returnAmt = returnAmtI >= 0 ? parseNum(r[returnAmtI]) : 0;
  console.log(`  code=${code} · qty=${qty}(반품${returnQty}) · amt=${amt}(반품${returnAmt}) · 순매입 qty=${qty-returnQty} amt=${amt-returnAmt}`);
}

console.log(`\n총 dataRows: ${dataRows.length}`);
