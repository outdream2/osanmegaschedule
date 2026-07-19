// src 아래 모든 xlsx 에서 "최소발주" 컬럼 & 값 검색
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

function scanDir(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && !f.name.startsWith("node_modules") && !f.name.startsWith(".")) {
      results.push(...scanDir(p));
    } else if (f.name.toLowerCase().endsWith(".xlsx")) {
      results.push(p);
    }
  }
  return results;
}

const files = scanDir("src").concat(scanDir("uploads").filter(() => fs.existsSync("uploads")));
console.log(`xlsx 파일 총 ${files.length}개 스캔`);

for (const file of files) {
  try {
    const wb = XLSX.readFile(file, { cellText: true });
    for (const sname of wb.SheetNames) {
      const sheet = wb.Sheets[sname];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) continue;
      const headers = rows[0] ?? [];
      // 최소/발주/주문 관련 컬럼 찾기
      const cols = [];
      headers.forEach((h, i) => {
        if (typeof h === "string" && (h.includes("최소") || h.includes("발주") || h.includes("주문"))) {
          cols.push({ ci: i, name: h });
        }
      });
      if (cols.length === 0) continue;
      console.log(`\n📄 ${file} [${sname}] · ${rows.length - 1}행`);
      for (const { ci, name } of cols) {
        let nonZero = 0, total = 0;
        const samples = [];
        for (let i = 1; i < rows.length; i++) {
          const v = rows[i]?.[ci];
          total++;
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            nonZero++;
            if (samples.length < 5) samples.push({ code: rows[i][0], name: rows[i][1] ?? rows[i][0], val: v });
          }
        }
        const stat = nonZero > 0 ? `✅ nonZero=${nonZero}/${total}` : `❌ 전부 0`;
        console.log(`  col ${ci} "${name}": ${stat}`);
        for (const s of samples) console.log(`    - ${s.code} · ${s.name} → ${s.val}`);
      }
    }
  } catch (e) {
    console.error(`  ${file} 파싱 실패: ${e.message}`);
  }
}
