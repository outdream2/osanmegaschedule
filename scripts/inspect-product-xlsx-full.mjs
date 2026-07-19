// 상품리스트 xlsx 전체 컬럼 확인 · 최소발주 위치와 실제 값 조사
import XLSX from "xlsx";
import fs from "fs";

const files = fs.readdirSync("src").filter(f => f.startsWith("상품리스트_") && f.endsWith(".xlsx"));
const file = "src/" + files.sort().pop();
console.log(`파일: ${file}`);
const wb = XLSX.readFile(file, { cellText: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// 헤더 row (row 0) 모든 컬럼 나열
const headers = rows[0] ?? [];
console.log(`\n총 컬럼: ${headers.length}`);
headers.forEach((h, i) => console.log(`  col ${String(i).padStart(2)}: "${h}"`));

// "최소" 또는 "발주" 포함 컬럼 위치
console.log(`\n── "최소" 또는 "발주" 포함 컬럼 ──`);
const targetCols = [];
headers.forEach((h, i) => {
  if (typeof h === "string" && (h.includes("최소") || h.includes("발주") || h.includes("주문"))) {
    console.log(`  col ${i}: "${h}"`);
    targetCols.push(i);
  }
});

// 해당 컬럼의 데이터 통계 · 0/null 아닌 값 개수
console.log(`\n── 최소발주 컬럼의 실제 데이터 (0/빈값 아닌 값) ──`);
for (const ci of targetCols) {
  let nonZero = 0, empty = 0, zero = 0, total = 0;
  const samples = [];
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i]?.[ci];
    total++;
    if (v === "" || v == null) { empty++; continue; }
    const n = Number(v);
    if (n === 0) { zero++; continue; }
    if (Number.isFinite(n) && n > 0) {
      nonZero++;
      if (samples.length < 10) samples.push({ row: i, code: rows[i][0], name: rows[i][1], val: v });
    }
  }
  console.log(`  col ${ci} "${headers[ci]}": total=${total} · empty=${empty} · zero=${zero} · nonZero=${nonZero}`);
  if (samples.length > 0) {
    console.log(`  샘플 (첫 ${samples.length}건):`);
    for (const s of samples) console.log(`    ${s.code} ${s.name} → ${s.val}`);
  }
}
