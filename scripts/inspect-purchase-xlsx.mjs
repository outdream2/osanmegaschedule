import XLSX from "xlsx";
const wb = XLSX.readFile("src/매입상세현황_2026-0701_07-15.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
console.log("Sheets:", wb.SheetNames);
console.log("총 rows:", arr.length);
for (let i = 0; i < Math.min(5, arr.length); i++) {
  console.log(`\nRow ${i}:`, JSON.stringify(arr[i]));
}

// unique score 확인
const scoreRow = (row) => new Set((row ?? []).map(v => String(v ?? "").trim()).filter(Boolean)).size;
console.log(`\nRow0 unique=${scoreRow(arr[0])}, Row1 unique=${scoreRow(arr[1] ?? [])}, Row2 unique=${scoreRow(arr[2] ?? [])}`);
