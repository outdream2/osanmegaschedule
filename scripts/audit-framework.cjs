#!/usr/bin/env node
// 2026-08-21 · Framework Audit · Phase 1 (roadmap C)
//   · Raw pattern grep · 프리미티브 미사용 위치 조사
//   · 페이지별 준수도 점수 (0~100)
//   · 출력 · docs/FRAMEWORK_AUDIT.md (auto-generated)

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUTPUT = path.join(ROOT, "docs", "FRAMEWORK_AUDIT.md");

// ────────────────────────────────────────────────────────────
// Rule definitions · pattern + severity + fix hint
// ────────────────────────────────────────────────────────────
const RULES = [
  { id: "raw-fetch", severity: "high", weight: 3,
    pattern: /(?<!\/\*.*)\bfetch\s*\(\s*["`']\//g,
    fix: "apiClient (api.get/post/put)",
    // 예외 · errorReporter · window.error 핸들러 · apiClient 401 → SESSION_EXPIRED 무한 루프 위험
    // 예외 · cloudinaryUpload · 외부 res.cloudinary.com 은 apiClient 스코프 밖
    skip: /apiClient|test|errorReporter/ },
  { id: "raw-alert", severity: "high", weight: 3,
    pattern: /(?<!\/\/.*)\balert\s*\(/g,
    fix: "useToast (showError·showSuccess)",
    skip: /test|alert\?/ },
  { id: "raw-loader2", severity: "medium", weight: 2,
    pattern: /<Loader2\s+size=\{[^}]+\}\s+className="animate-spin"/g,
    fix: "Spinner 프리미티브",
    skip: /Spinner|Button|ListLoading|test/ },
  { id: "raw-card-wrapper", severity: "medium", weight: 2,
    pattern: /className="[^"]*bg-white\s+border\s+border-line\s+rounded-(xl|lg|2xl)[^"]*"/g,
    fix: "Card 프리미티브 (padding·variant·clip)",
    skip: /Card\.tsx|Panel\.tsx|Toolbar\.tsx|ImageUploadField|test/ },
  { id: "raw-confirm", severity: "medium", weight: 2,
    pattern: /(?<!\/\/.*)\b(?:window\.)?confirm\s*\(/g,
    fix: "useConfirm (ConfirmDialog 프리미티브)",
    skip: /useConfirm|test/ },
  { id: "large-file", severity: "high", weight: 5,
    pattern: null, // 특수 · 라인 수 기반
    fix: "500+라인 · 서브 컴포넌트 분리",
    skip: null,
    lineThreshold: 500 },
];

// ────────────────────────────────────────────────────────────
// File walker
// ────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git", "logs"].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Scan
// ────────────────────────────────────────────────────────────
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
  const violations = [];
  const lineCount = content.split("\n").length;

  for (const rule of RULES) {
    if (rule.skip && rule.skip.test(relPath)) continue;

    if (rule.id === "large-file") {
      if (lineCount > rule.lineThreshold) {
        violations.push({ ruleId: rule.id, count: 1, severity: rule.severity, weight: rule.weight * Math.ceil(lineCount / 1000) });
      }
      continue;
    }

    const matches = content.match(rule.pattern);
    if (matches && matches.length > 0) {
      violations.push({ ruleId: rule.id, count: matches.length, severity: rule.severity, weight: rule.weight * matches.length });
    }
  }

  return { relPath, lineCount, violations };
}

// ────────────────────────────────────────────────────────────
// Aggregate + score
// ────────────────────────────────────────────────────────────
function aggregate(results) {
  // per-file total weight
  const files = results.map(r => ({
    ...r,
    totalWeight: r.violations.reduce((s, v) => s + v.weight, 0),
  })).filter(r => r.totalWeight > 0);

  // sort by weight desc
  files.sort((a, b) => b.totalWeight - a.totalWeight);

  // rule totals
  const ruleTotals = {};
  for (const rule of RULES) {
    ruleTotals[rule.id] = { count: 0, files: 0, severity: rule.severity, fix: rule.fix };
  }
  for (const f of files) {
    for (const v of f.violations) {
      ruleTotals[v.ruleId].count += v.count;
      ruleTotals[v.ruleId].files += 1;
    }
  }

  return { files, ruleTotals };
}

// ────────────────────────────────────────────────────────────
// Markdown report
// ────────────────────────────────────────────────────────────
function renderReport(agg, totalFiles) {
  const now = new Date().toISOString().slice(0, 10);
  let md = `# Framework Audit Report (자동 생성)\n\n`;
  md += `> 생성 · ${now} · \`scripts/audit-framework.cjs\` · 매 세션 재실행\n>\n`;
  md += `> **로드맵 · \`docs/FRAMEWORK_ROADMAP.md\` Phase 1 (인벤토리)**\n\n`;

  const totalViolations = Object.values(agg.ruleTotals).reduce((s, r) => s + r.count, 0);
  const totalFilesWithViolations = agg.files.length;
  const cleanFiles = totalFiles - totalFilesWithViolations;
  const cleanPct = totalFiles > 0 ? Math.round(cleanFiles / totalFiles * 100) : 0;

  md += `## 📊 요약\n\n`;
  md += `| 지표 | 값 |\n|---|---:|\n`;
  md += `| 스캔 파일 | ${totalFiles} |\n`;
  md += `| 위반 파일 | ${totalFilesWithViolations} |\n`;
  md += `| 클린 파일 | ${cleanFiles} (${cleanPct}%) |\n`;
  md += `| 총 위반 개수 | ${totalViolations} |\n\n`;

  md += `## 🚨 규칙별 위반 현황\n\n`;
  md += `| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |\n|---|---:|---:|---|---|\n`;
  for (const [id, r] of Object.entries(agg.ruleTotals)) {
    if (r.count === 0) continue;
    md += `| \`${id}\` | ${r.count} | ${r.files} | ${r.severity} | ${r.fix} |\n`;
  }
  md += `\n`;

  md += `## 🔥 우선순위 파일 (weight 순 · TOP 30)\n\n`;
  md += `| # | 파일 | 라인 | 총 위반 | 위반 상세 |\n|---:|---|---:|---:|---|\n`;
  const top = agg.files.slice(0, 30);
  top.forEach((f, i) => {
    const detail = f.violations
      .sort((a, b) => b.weight - a.weight)
      .map(v => `${v.ruleId}(${v.count})`)
      .join(" · ");
    md += `| ${i + 1} | \`${f.relPath}\` | ${f.lineCount} | ${f.totalWeight} | ${detail} |\n`;
  });
  md += `\n`;

  md += `## 📝 모든 위반 파일 (${totalFilesWithViolations}개)\n\n`;
  md += `<details><summary>펼치기 · 파일 리스트</summary>\n\n`;
  md += `| 파일 | 라인 | 위반 |\n|---|---:|---:|\n`;
  for (const f of agg.files) {
    md += `| \`${f.relPath}\` | ${f.lineCount} | ${f.totalWeight} |\n`;
  }
  md += `\n</details>\n\n`;

  md += `## 🎯 다음 액션 (권장)\n\n`;
  md += `1. \`docs/FRAMEWORK_ROADMAP.md\` Phase 2 · ESLint 룰 도입 · pre-commit hook\n`;
  md += `2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)\n`;
  md += `3. 주간 재실행 · 진행률 트래킹\n`;

  return md;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
function main() {
  const files = walk(SRC);
  const results = files.map(scanFile);
  const agg = aggregate(results);
  const md = renderReport(agg, files.length);
  fs.writeFileSync(OUTPUT, md, "utf8");
  console.log(`✓ Audit complete · ${files.length} files scanned`);
  console.log(`  Violations · ${agg.files.length} files · ${Object.values(agg.ruleTotals).reduce((s, r) => s + r.count, 0)} total`);
  console.log(`  Report · ${path.relative(ROOT, OUTPUT)}`);
}

main();
