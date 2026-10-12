// scripts/audit-zone-defs-category-2026-10-11.mjs
// 2026-10-11 · 사용자 요청 "빠진부분은 뭐야 zone db랑 매칭한거 맞아?" · zone_defs 전체 category 상태 리포트
//
// 출력:
//   · 전체 row 수
//   · num 별 category 유/무 (NULL, 빈 문자열, 값 있음)
//   · 미등록 매대 번호 리스트 (1~46 range 중 빠진 것)
//   · 매대 1~9 상비약 분류 상태

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━".repeat(70));
console.log("  zone_defs 전수 감사 · 2026-10-11");
console.log("━".repeat(70));
console.log();

const { data, error } = await supabase
  .from("zone_defs")
  .select("id, cell_id, location, zone, category, detailed_category, warehouse")
  .order("cell_id", { ascending: true });

if (error) { console.error("❌ 조회 실패:", error.message); process.exit(1); }

console.log(`전체 row: ${data.length}건\n`);

// cell_id 로 그룹 (매대 번호)
const byNum = new Map();
for (const r of data) {
  const num = r.cell_id;
  if (!byNum.has(num)) byNum.set(num, []);
  byNum.get(num).push(r);
}

// 매대 1~46 range · 빠진 매대 체크
const missing = [];
const empty = [];
const filled = [];
for (let n = 1; n <= 46; n += 1) {
  const rows = byNum.get(n);
  if (!rows || rows.length === 0) { missing.push(n); continue; }
  const cat = rows[0].category;
  if (!cat || String(cat).trim() === "") empty.push({ num: n, loc: rows[0].location, zone: rows[0].zone });
  else filled.push({ num: n, loc: rows[0].location, zone: rows[0].zone, category: cat });
}

console.log(`[요약]`);
console.log(`  · 매대 1~46 range`);
console.log(`  · DB 미등록: ${missing.length}건 → ${missing.join(", ") || "없음"}`);
console.log(`  · category 비어있음: ${empty.length}건`);
console.log(`  · category 채워짐: ${filled.length}건`);
console.log();

if (empty.length > 0) {
  console.log(`[category 비어있는 매대 전체 리스트]`);
  for (const e of empty) console.log(`  · 매대 ${String(e.num).padStart(2)} · location="${e.loc ?? ""}" · zone="${e.zone ?? ""}"`);
  console.log();
}

console.log(`[매대 1~9 상비약 분류 상태]`);
for (let n = 1; n <= 9; n += 1) {
  const rows = byNum.get(n) ?? [];
  if (rows.length === 0) { console.log(`  · 매대 ${n}: ❌ DB 미등록`); continue; }
  for (const r of rows) {
    const flag = (r.category || "").includes("상비약") ? "✓ 상비약" : (r.category ? `△ "${r.category}"` : "✗ 빈값");
    console.log(`  · 매대 ${n} · cell_id=${r.cell_id} · loc="${r.location}" · zone="${r.zone}" · ${flag}`);
  }
}
console.log();

console.log(`[category 채워진 매대 상위 샘플 10]`);
for (const f of filled.slice(0, 10)) {
  console.log(`  · 매대 ${String(f.num).padStart(2)} · "${f.category}"`);
}
