// 2026-10-06 · PHASE 1.5 · 보조 조사
// 조사: 현재 employees 테이블에 "박부장" 이름이 존재하는가? (정확 일치만, 유사도 X)
// 그리고 "테스트" 이름을 가진 record 가 있는가?

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  const { data: all, error } = await supabase.from("employees").select("id, name, phone, level").order("id", { ascending: true });
  if (error) throw new Error(error.message);
  console.log(`전체 employees 수: ${all.length}`);
  console.log("ID 분포:", all.map(e => e.id).sort((a, b) => a - b).join(", "));

  const bugjang = all.filter(e => String(e.name).includes("박부장"));
  console.log(`"박부장" 이름 정확/부분 일치: ${bugjang.length}건`);
  for (const e of bugjang) console.log(`  id=${e.id} name=${e.name} phone=${e.phone} level=${e.level}`);

  const test = all.filter(e => /테스트|test|더미/i.test(String(e.name)));
  console.log(`"테스트/test/더미" 패턴 일치: ${test.length}건`);
  for (const e of test) console.log(`  id=${e.id} name=${e.name}`);

  // id=3 과 id=999 가 "현재는 없지만 과거에 있었는지" 는 Supabase 로그 없이는 알 수 없음.
  console.log(`\n[참고] 현재 employees 에 id=3 존재: ${Boolean(all.find(e => e.id === 3))}`);
  console.log(`[참고] 현재 employees 에 id=999 존재: ${Boolean(all.find(e => e.id === 999))}`);
}

main().catch(err => {
  console.error(err?.message ?? err);
  process.exit(1);
});
