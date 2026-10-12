// 2026-10-04 · READ-ONLY · ERP Product_List 102 col 각 col 별 샘플 + non-empty count
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync("D:/antigravity_projects/megatown-staff-scheduler/data/snapshots/product-list-2026-10-03.json", "utf8"));
const cols = d.columns;
const rows = d.rows;
const total = rows.length;
const result = cols.map((c) => {
  const name = c.name;
  const type = c.type;
  let nonEmpty = 0;
  const samples = [];
  const uniq = new Set();
  for (const r of rows) {
    const v = r[name];
    const empty = v === null || v === undefined || v === "" || (typeof v === "string" && v.trim() === "");
    if (!empty) {
      nonEmpty++;
      if (uniq.size < 3 && !uniq.has(String(v))) {
        uniq.add(String(v));
        samples.push(v);
      }
    }
  }
  return { col: name, type, nonEmpty, total, pct: ((nonEmpty / total) * 100).toFixed(1), samples };
});
console.log(JSON.stringify(result, null, 2));
