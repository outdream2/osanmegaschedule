// scripts/check-stock-values-api.mjs
// 2026-09-10 · /api/supplier-stock-values-map 응답 확인
const url = process.env.API_URL || "http://localhost:4000";
try {
  const res = await fetch(`${url}/api/supplier-stock-values-map`);
  console.log(`Status · ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.log(`Body · ${text.slice(0, 500)}`);
    process.exit(1);
  }
  const j = await res.json();
  const values = j?.values ?? {};
  const keys = Object.keys(values);
  console.log(`✔ 공급사 수 · ${keys.length}`);
  console.log(`샘플 (상위 10):`);
  const sorted = keys.map(k => [k, values[k]]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.table(sorted.map(([k, v]) => ({ supplier: k, stock_value: v })));

  console.log("\n=== '테스' 관련 검색 ===");
  for (const k of keys) {
    if (k.includes("테스")) console.log(`  · ${k} · ${values[k]}`);
  }
} catch (e) {
  console.error(`fetch 실패 · dev 서버가 실행 중인지 확인 필요:`, e.message);
  process.exit(1);
}
