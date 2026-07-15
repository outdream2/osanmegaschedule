import XLSX from "xlsx";

const files = [
  { label: "재고현황", path: "src/재고현황_2026-0701_0715.xlsx" },
  { label: "상품리스트", path: "src/상품리스트_2026-07-15 11_07.xlsx" },
  { label: "공급사관리", path: "src/공급사관리_2026-07-08 17_44.xlsx" },
];

for (const { label, path } of files) {
  console.log(`\n============================================================`);
  console.log(`### ${label} · ${path}`);
  console.log(`============================================================`);
  const wb = XLSX.readFile(path);
  console.log("Sheets:", wb.SheetNames);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log("총 rows:", arr.length);
  console.log("Row 0:", JSON.stringify(arr[0]));
  console.log("Row 1:", JSON.stringify(arr[1]));
  console.log("Row 2:", JSON.stringify(arr[2]));
  console.log("Row 3:", JSON.stringify(arr[3]));

  const scoreHeaderRow = (row) => {
    const nonEmpty = (row || []).map((v) => String(v ?? "").trim()).filter(Boolean);
    return new Set(nonEmpty).size;
  };
  const row0Score = scoreHeaderRow(arr[0]);
  const row1Score = scoreHeaderRow(arr[1]);
  const headerRowIdx = row1Score > row0Score + 2 ? 1 : 0;
  console.log(`headerRowIdx=${headerRowIdx} (Row0 unique=${row0Score}, Row1 unique=${row1Score})`);
  const headers = (arr[headerRowIdx] || []).map((h) => String(h ?? "").trim());
  console.log("\n=== 선택된 헤더 목록 ===");
  headers.forEach((h, i) => console.log(`  [${i}] "${h}"`));

  // 재고현황이면 openI/stockI/saleI 매칭 테스트
  if (label === "재고현황") {
    const test = (name, pats) => {
      for (const p of pats) {
        const i = headers.findIndex((h) => p.test(h));
        if (i >= 0) return `  ${name}: [${i}] "${headers[i]}" (matched ${p})`;
      }
      return `  ${name}: NOT MATCHED (patterns: ${pats.map(String).join(", ")})`;
    };
    console.log("\n=== 매칭 테스트 (현재 코드 정규식) ===");
    console.log(test("codeI", [/^코드$/i, /상품\s*코드/i]));
    console.log(test("stockI", [/종료일\s*재고/i, /기말\s*재고/i, /^현재고$/i, /^재고$/i]));
    console.log(test("openI", [/시작일\s*재고/i, /기초\s*재고/i, /시작\s*재고/i, /전월\s*이월/i, /전기\s*이월/i, /opening[_ ]?stock/i]));
    console.log(test("purchI", [/입고\s*계/i, /^입고$/i]));
    console.log(test("saleI", [/판매\s*출고\s*계/i, /^판매$/i]));

    // 데이터 샘플 3행 · opening vs closing 실제 값 비교
    const dataRows = arr.slice(headerRowIdx + 1);
    const codeI = headers.findIndex((h) => /^코드$/i.test(h));
    const openI = headers.findIndex((h) => /시작일\s*재고/i.test(h));
    const stockI = headers.findIndex((h) => /종료일\s*재고/i.test(h));
    const saleI = headers.findIndex((h) => /판매\s*출고\s*계/i.test(h));
    const purchI = headers.findIndex((h) => /입고\s*계/i.test(h));
    console.log(`\n=== 데이터 샘플 (opening=${openI}, closing=${stockI}, sale=${saleI}, purch=${purchI}) ===`);
    let sameCount = 0;
    let saleWithSame = 0;
    let total = 0;
    for (const r of dataRows) {
      if (!Array.isArray(r)) continue;
      const code = String(r[codeI] ?? "").trim();
      if (!code) continue;
      total++;
      const open = Number(String(r[openI] ?? "0").replace(/,/g, "")) || 0;
      const close = Number(String(r[stockI] ?? "0").replace(/,/g, "")) || 0;
      const sale = Number(String(r[saleI] ?? "0").replace(/,/g, "")) || 0;
      const purch = Number(String(r[purchI] ?? "0").replace(/,/g, "")) || 0;
      if (open === close) sameCount++;
      if (sale > 0 && open === close) saleWithSame++;
      if (total <= 5) {
        console.log(`  code=${code} open=${open} purch=${purch} sale=${sale} close=${close} · flow ok? ${open + purch - sale === close ? "YES" : "NO(diff=" + (open + purch - sale - close) + ")"}`);
      }
    }
    console.log(`\n총 ${total}행 · opening==closing: ${sameCount}행 · 판매>0인데 opening==closing: ${saleWithSame}행`);
  }
}
