// 상품리스트 xlsx "현재고" 컬럼 vs 재고현황 xlsx "종료일 재고" 컬럼 심층 비교
// - 모든 상품 대상 · 차이 나는 상품 전체 노출
// - 통계 (평균 차이 · 최대 차이 · 절대값 총합)
import XLSX from "xlsx";

const parseNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// 상품리스트 로드
const prodWB = XLSX.readFile("src/상품리스트_2026-07-15 11_07.xlsx");
const prodArr = XLSX.utils.sheet_to_json(prodWB.Sheets[prodWB.SheetNames[0]], { header: 1, defval: "" });
const prodHeaders = prodArr[0].map(h => String(h ?? "").trim().replace(/\n/g, " "));
const pCodeI = prodHeaders.findIndex(h => /상품\s*코드/i.test(h));
const pStockI = prodHeaders.findIndex(h => /^현재고$/.test(h));
const pNameI = prodHeaders.findIndex(h => /^상품명$/.test(h));

const prodMap = new Map();
for (const r of prodArr.slice(1)) {
  if (!Array.isArray(r)) continue;
  const code = String(r[pCodeI] ?? "").trim();
  if (!code) continue;
  prodMap.set(code, {
    name: String(r[pNameI] ?? ""),
    xlsxCurrent: parseNum(r[pStockI]),
  });
}

// 재고현황 로드
const stockWB = XLSX.readFile("src/재고현황_2026-0711_0715.xlsx");
const stockArr = XLSX.utils.sheet_to_json(stockWB.Sheets[stockWB.SheetNames[0]], { header: 1, defval: "" });
const sHeaders = stockArr[1].map(h => String(h ?? "").trim());
const sCodeI = sHeaders.findIndex(h => /^코드$/i.test(h));
const sCloseI = sHeaders.findIndex(h => /종료일\s*재고/i.test(h));
const sSaleI = sHeaders.findIndex(h => /판매\s*출고\s*계/i.test(h));
const sOpenI = sHeaders.findIndex(h => /시작일\s*재고/i.test(h));

console.log("═════════════════════════════════════════════════════════════════");
console.log("상품리스트 '현재고' vs 재고현황 '종료일 재고' 심층 비교");
console.log("(상품리스트 07-15 11:07 · 재고현황 07-11 → 07-15)");
console.log("═════════════════════════════════════════════════════════════════");

let matched = 0, same = 0, diff = 0, missing = 0;
const diffs = [];

for (const r of stockArr.slice(2)) {
  if (!Array.isArray(r)) continue;
  const code = String(r[sCodeI] ?? "").trim();
  if (!code) continue;
  const closing = parseNum(r[sCloseI]);
  const opening = parseNum(r[sOpenI]);
  const sale = parseNum(r[sSaleI]);
  const prod = prodMap.get(code);
  if (!prod) { missing++; continue; }
  matched++;
  if (prod.xlsxCurrent === closing) same++;
  else {
    diff++;
    diffs.push({
      code,
      name: prod.name,
      xlsxCurrent: prod.xlsxCurrent,
      closing,
      opening,
      sale,
      delta: prod.xlsxCurrent - closing,
    });
  }
}

console.log(`\n[요약]`);
console.log(`  매칭 상품 : ${matched}개`);
console.log(`  · 완전 일치 (현재고 == 종료일재고) : ${same}개 (${(same/matched*100).toFixed(2)}%)`);
console.log(`  · 값 다름                          : ${diff}개 (${(diff/matched*100).toFixed(2)}%)`);
console.log(`  · 재고현황엔 있지만 상품리스트에 없는 상품 : ${missing}개`);
console.log(`  · 상품리스트에 있는 상품 중 재고현황에 없는 상품 : ${prodMap.size - matched - 0}개 (근사)`);

if (diffs.length > 0) {
  console.log(`\n[차이 나는 상품 전체 ${diffs.length}개]`);
  console.log(`  ${"code".padEnd(18)} ${"이름".padEnd(35)} ${"현재고".padStart(8)} ${"종료".padStart(8)} ${"차이".padStart(8)} ${"시작".padStart(6)} ${"판매".padStart(6)}`);
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const d of diffs) {
    console.log(`  ${d.code.padEnd(18)} ${d.name.slice(0, 35).padEnd(35)} ${String(d.xlsxCurrent).padStart(8)} ${String(d.closing).padStart(8)} ${String(d.delta).padStart(8)} ${String(d.opening).padStart(6)} ${String(d.sale).padStart(6)}`);
  }
  const absSum = diffs.reduce((s, d) => s + Math.abs(d.delta), 0);
  const maxAbs = diffs.reduce((m, d) => Math.max(m, Math.abs(d.delta)), 0);
  console.log(`\n  차이 절대값 합계 : ${absSum}`);
  console.log(`  최대 차이        : ${maxAbs}`);
  console.log(`  평균 차이        : ${(absSum / diffs.length).toFixed(2)}`);
} else {
  console.log(`\n  차이 나는 상품 없음 · 두 컬럼 100% 일치`);
}
