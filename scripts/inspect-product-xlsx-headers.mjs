// 상품리스트 xlsx 파일 헤더 확인 (min_order 매칭 여부)
import XLSX from "xlsx";
import fs from "fs";

const files = fs.readdirSync("src").filter(f => f.startsWith("상품리스트_") && f.endsWith(".xlsx"));
if (files.length === 0) { console.log("상품리스트 xlsx 없음"); process.exit(0); }
const file = "src/" + files.sort().pop();
console.log(`파일: ${file}`);
const wb = XLSX.readFile(file, { cellText: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
console.log(`행수: ${rows.length}`);
console.log(`\n── 처음 5행 헤더 후보 ──`);
for (let i = 0; i < 5 && i < rows.length; i++) {
  console.log(`row ${i}: ${JSON.stringify(rows[i]).slice(0, 300)}`);
}
console.log(`\n── 헤더로 예상되는 row에서 "최소" 포함 셀 찾기 ──`);
for (let i = 0; i < 5; i++) {
  const r = rows[i] ?? [];
  r.forEach((cell, ci) => {
    if (typeof cell === "string" && cell.includes("최소")) {
      console.log(`  row ${i} col ${ci}: "${cell}"`);
    }
  });
}
console.log(`\n── 헤더 row에서 발주/최소 관련 셀 전부 ──`);
for (let i = 0; i < 5; i++) {
  const r = rows[i] ?? [];
  r.forEach((cell, ci) => {
    if (typeof cell === "string" && (cell.includes("발주") || cell.includes("최소") || cell.includes("주문"))) {
      console.log(`  row ${i} col ${ci}: "${cell}"`);
    }
  });
}
