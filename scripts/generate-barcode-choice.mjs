// nedrug 신뢰 매칭 · 사용자 선택용 Markdown 리포트 생성
import { readFileSync, writeFileSync } from "node:fs";

const d = JSON.parse(readFileSync("docs/nedrug_crawl_B_2026-08-27.json", "utf8"));
const trusted = d.trusted ?? [];

const lines = [];
lines.push("# nedrug 신뢰 매칭 · barcode 선택 리스트 (204건)");
lines.push("");
lines.push("생성 · 2026-08-27 · B안 (상품별 barcode 선택)");
lines.push("");
lines.push("## 사용 방법");
lines.push("");
lines.push("각 상품의 `선택` 컬럼에 · 정답 barcode 번호 입력");
lines.push("- `1` · 첫 번째 barcode (기본값 · 가장 작은 포장)");
lines.push("- `2, 3, ...` · N번째 barcode");
lines.push("- `0` · 이 상품은 매칭하지 않음 (skip · 원본 유지)");
lines.push("- 편집 후 · `node scripts/apply-nedrug-choice.mjs --commit`");
lines.push("");
lines.push("## 선택 리스트");
lines.push("");
lines.push("| # | 원본 코드 | 원본 상품명 | nedrug 매칭 | 선택 | barcode 후보 |");
lines.push("|--:|-----------|------------|-------------|:----:|-------------|");

trusted.forEach((t, i) => {
  const bcs = t.barcodes.map((b, j) => `**${j + 1}**=\`${b}\``).join(" · ");
  const origCode = `\`${t.orig_code}\``;
  const origName = (t.orig_name || "").slice(0, 30).replace(/\|/g, "⏐");
  const nedrugName = (t.nedrug_name || "").slice(0, 30).replace(/\|/g, "⏐");
  lines.push(`| ${i + 1} | ${origCode} | ${origName} | ${nedrugName} | \`1\` | ${bcs} |`);
});

lines.push("");
lines.push("## 요약");
lines.push(`- 총 **${trusted.length}건** · 기본값 \`1\` (첫 번째 barcode)`);
lines.push("- 대상 상품은 각각 여러 포장 사이즈 (평균 5-8개 barcode)");
lines.push("- 검토 후 · 필요 시 다른 번호로 수정 · skip 은 `0`");
lines.push("");

writeFileSync("docs/BARCODE_CHOICE_2026-08-27.md", lines.join("\n"), "utf8");
console.log(`저장 · docs/BARCODE_CHOICE_2026-08-27.md · ${trusted.length}건`);
