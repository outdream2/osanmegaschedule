// 상품리스트 xlsx "현재고" vs 재고현황 xlsx "종료일 재고" 직접 비교
// 두 값이 같으면 loss = 0 · 다르면 진짜 손실 계산 가능
import XLSX from "xlsx";

const parseNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// 상품리스트: "현재고" col
const prodWB = XLSX.readFile("src/상품리스트_2026-07-15 11_07.xlsx");
const prodArr = XLSX.utils.sheet_to_json(prodWB.Sheets[prodWB.SheetNames[0]], { header: 1, defval: "" });
const prodHeaders = prodArr[0].map(h => String(h ?? "").trim().replace(/\n/g, " "));
const pCodeI = prodHeaders.findIndex(h => /상품\s*코드/i.test(h));
const pStockI = prodHeaders.findIndex(h => /^현재고$/.test(h));

const prodStockMap = new Map();
for (const r of prodArr.slice(1)) {
  if (!Array.isArray(r)) continue;
  const code = String(r[pCodeI] ?? "").trim();
  if (!code) continue;
  prodStockMap.set(code, {
    name: String(r[1] ?? ""),
    xlsxCurrent: parseNum(r[pStockI]),
  });
}
console.log(`상품리스트 xlsx : ${prodStockMap.size}개 상품 (7/15 뽑음)`);

// 재고현황: "종료일 재고" col
const stockWB = XLSX.readFile("src/재고현황_2026-0711_0715.xlsx");
const stockArr = XLSX.utils.sheet_to_json(stockWB.Sheets[stockWB.SheetNames[0]], { header: 1, defval: "" });
const sHeaders = stockArr[1].map(h => String(h ?? "").trim());
const sCodeI = sHeaders.findIndex(h => /^코드$/i.test(h));
const sCloseI = sHeaders.findIndex(h => /종료일\s*재고/i.test(h));
const sOpenI = sHeaders.findIndex(h => /시작일\s*재고/i.test(h));
const sSaleI = sHeaders.findIndex(h => /판매\s*출고\s*계/i.test(h));

console.log(`재고현황 xlsx  : 07-11 → 07-15 스냅샷`);
console.log(`               헤더: 시작일재고=[${sOpenI}], 종료일재고=[${sCloseI}], 판매=[${sSaleI}]`);

let matched = 0, sameCount = 0, diffCount = 0, missingProd = 0;
const diffs = [];

for (const r of stockArr.slice(2)) {
  if (!Array.isArray(r)) continue;
  const code = String(r[sCodeI] ?? "").trim();
  if (!code) continue;
  const closing = parseNum(r[sCloseI]);
  const opening = parseNum(r[sOpenI]);
  const sale = parseNum(r[sSaleI]);
  const prod = prodStockMap.get(code);
  if (!prod) { missingProd++; continue; }
  matched++;
  if (prod.xlsxCurrent === closing) sameCount++;
  else {
    diffCount++;
    if (diffs.length < 20) {
      diffs.push({
        code, name: prod.name,
        current: prod.xlsxCurrent,
        closing, opening, sale,
        loss: closing - prod.xlsxCurrent,
      });
    }
  }
}

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`상품리스트 "현재고" vs 재고현황 "종료일 재고" 비교`);
console.log(`═══════════════════════════════════════════════════════════`);
console.log(`매칭된 상품          : ${matched}개`);
console.log(`  · 같은 값 (loss=0) : ${sameCount}개 (${(sameCount/matched*100).toFixed(1)}%)`);
console.log(`  · 다른 값 (loss≠0) : ${diffCount}개 (${(diffCount/matched*100).toFixed(1)}%)`);
console.log(`상품리스트 xlsx 에 없는 상품 : ${missingProd}개`);

if (diffs.length > 0) {
  console.log(`\n[차이 나는 상품 샘플 최대 20개]`);
  console.log(`  ${"code".padEnd(15)} ${"이름".padEnd(28)} ${"시작".padStart(6)} ${"판매".padStart(6)} ${"종료".padStart(6)} ${"현재".padStart(6)} ${"손실".padStart(6)}`);
  for (const d of diffs) {
    console.log(`  ${d.code.padEnd(15)} ${d.name.slice(0, 28).padEnd(28)} ${String(d.opening).padStart(6)} ${String(d.sale).padStart(6)} ${String(d.closing).padStart(6)} ${String(d.current).padStart(6)} ${String(d.loss).padStart(6)}`);
  }
}

// 손실 총합
const totalLoss = diffs.reduce((s, d) => s + Math.max(0, d.loss), 0);
console.log(`\n샘플 20개 손실 총합 : ${totalLoss}`);
