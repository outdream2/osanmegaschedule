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
const SERVER = path.join(ROOT, "server");
const OUTPUT = path.join(ROOT, "docs", "FRAMEWORK_AUDIT.md");
const BASELINE = path.join(ROOT, "docs", ".framework-baseline.json");

// ────────────────────────────────────────────────────────────
// Rule definitions · pattern + severity + fix hint
// ────────────────────────────────────────────────────────────
//
// scope 옵션 (2026-09-23 · P3-4)
//   · "src"    · src/**/*.{ts,tsx}  (기본값 · 클라이언트 컴포넌트)
//   · "server" · server/**/*.ts     (Node 백엔드)
//   · "all"    · 양쪽 모두
// ────────────────────────────────────────────────────────────
const RULES = [
  { id: "raw-fetch", severity: "high", weight: 3, scope: "src",
    // 2026-08-21 · JSDoc/주석 라인 안 매칭 · pattern 개선 (line-start 공백 뒤 * 이면 skip)
    pattern: /^(?!\s*[*/]).*\bfetch\s*\(\s*["`']\//gm,
    fix: "apiClient (api.get/post/put)",
    // 예외 · 인프라 파일 · apiClient 스코프 밖 (SSE·초기화·정적파일·401 loop 방지)
    //  - apiClient.ts   · 자체 refresh
    //  - errorReporter  · window.error · apiClient 401 loop 위험
    //  - App.tsx        · logout · apiClient 401 loop 위험
    //  - main.tsx       · 앱 초기화 (apiClient 준비 전)
    //  - productsCache  · 정적 /products.json
    //  - zoneLabels     · 모듈 초기 로드
    //  - geminiEngine   · Gemini 전용 · OCR SSE 관련
    //  - OcrPage.tsx    · /api/ocr?stream=1 · SSE 스트리밍
    skip: /apiClient|test|errorReporter|App\.tsx|main\.tsx|productsCache|zoneLabels|geminiEngine|OcrPage\/OcrPage/ },
  { id: "raw-alert", severity: "high", weight: 3, scope: "src",
    pattern: /(?<!\/\/.*)\balert\s*\(/g,
    fix: "useToast (showError·showSuccess)",
    skip: /test|alert\?/ },
  { id: "raw-loader2", severity: "medium", weight: 2, scope: "src",
    pattern: /<Loader2\s+size=\{[^}]+\}\s+className="animate-spin"/g,
    fix: "Spinner 프리미티브",
    skip: /Spinner|Button|ListLoading|test/ },
  { id: "raw-card-wrapper", severity: "medium", weight: 2, scope: "src",
    // 2026-08-21 · 정확도 개선 · <div|<section|<article|<aside 만 · <input/<select/<textarea 제외
    //   (form input 은 Card wrapper 대상 아님 · false positive 방지)
    pattern: /<(?:div|section|article|aside)\b[^>]*className="[^"]*bg-white\s+border\s+border-line\s+rounded-(xl|lg|2xl)[^"]*"/g,
    fix: "Card 프리미티브 (padding·variant·clip)",
    skip: /Card\.tsx|Panel\.tsx|Toolbar\.tsx|ImageUploadField|test/ },
  { id: "raw-confirm", severity: "medium", weight: 2, scope: "src",
    pattern: /(?<!\/\/.*)\bwindow\.confirm\s*\(/g,
    fix: "useConfirm (ConfirmDialog 프리미티브)",
    // 2026-08-21 · window.confirm 만 잡음 · 로컬 `const confirm = useConfirm()` 은 정상 사용
    skip: /useConfirm|test/ },
  // 2026-08-21 · tier 화 · 500-라인 borderline · 800+ 실질 문제 · 2000+ 시급
  { id: "large-file-critical", severity: "high", weight: 8, scope: "src",
    pattern: null,
    fix: "2000+라인 · 시급 · 서브 컴포넌트/훅 분리 필수",
    skip: null,
    lineThreshold: 2000 },
  { id: "large-file-warn", severity: "medium", weight: 3, scope: "src",
    pattern: null,
    fix: "800-2000라인 · 서브 컴포넌트 분리 권장",
    skip: null,
    lineThreshold: 800,
    lineCeiling: 2000 },
  // ────────────────────────────────────────────────────────────
  // 2026-09-23 · P3-4 · ESLint 룰 확장 (audit 통합)
  // ────────────────────────────────────────────────────────────
  // 1. no-raw-console-server
  //   · 서버 라우트·서비스 · console.log/warn/error 금지 · logger.* 사용
  //   · 예외 · logger.ts (자체 구현) · envValidation.ts (부팅 시)
  //   · scope: server
  { id: "no-raw-console-server", severity: "medium", weight: 2, scope: "server",
    pattern: /(?<!\/\/[^\n]*)(?<!\*[^\n]*)\bconsole\.(?:log|warn|error|info|debug)\s*\(/g,
    fix: "logger.info / logger.warn / logger.error (server/lib/logger.ts)",
    // 예외:
    //  - logger.ts        · 자체 구현
    //  - envValidation.ts · 부팅 · logger 초기화 전
    //  - test / test.ts   · 테스트 파일
    skip: /server[\\/]lib[\\/]logger\.ts$|server[\\/]lib[\\/]envValidation\.ts$|\.test\.ts$/ },
  // 2. no-any-server (완화)
  //   · 서버 코드 · 명시적 `: any` 사용 금지 · catch (err: any) 는 허용
  //   · scope: server
  { id: "no-any-server", severity: "medium", weight: 1, scope: "server",
    // ": any" 매치 · but catch(err: any) 및 // eslint-disable-next-line 인접 라인 제외 · 주석 라인 제외
    // 주석 안 (//... : any) 매칭 방지 · 라인 시작 공백 뒤 // 또는 * 은 skip
    pattern: /^(?!\s*(?:\/\/|\*)).*?(?<!catch\s*\([^)]{0,50}):\s*any\b(?![^\n]*eslint-disable)/gm,
    fix: "구체 타입 · unknown + type guard · zod 스키마 추론",
    skip: /\.test\.ts$|\.d\.ts$/ },
  // 3. prefer-modal-primitive
  //   · src/**/*.tsx · raw <div className="fixed inset-0 ... bg-black/..."> 인라인 모달 금지
  //   · Modal 프리미티브 (src/components/common/Modal.tsx) 사용
  //   · scope: src
  { id: "prefer-modal-primitive", severity: "medium", weight: 2, scope: "src",
    // <div ... fixed inset-0 ... bg-black/ ... > 매치 · 한 줄 안에서 검색
    // false positive 방지: image viewer / camera overlay / sheet primitive 등 skip
    pattern: /<(?:div|section)\b[^>]{0,200}\bfixed\s+inset-0\b[^>]{0,200}\bbg-black\/(?:\d+)/g,
    fix: "Modal 프리미티브 (src/components/common/Modal.tsx)",
    // 예외:
    //  - Modal.tsx        · 자체 구현
    //  - ui/sheet.tsx     · Radix Sheet primitive
    //  - BarcodeScanner   · 카메라 오버레이
    //  - PanZoomImage     · 이미지 뷰어
    //  - PageImageViewer  · OCR 페이지 이미지
    //  - ImageZoomModal   · 이미지 확대 (자체 dialog)
    skip: /components[\\/]common[\\/]Modal\.tsx$|ui[\\/]sheet\.tsx$|BarcodeScanner|PanZoomImage|PageImageViewer|ImageZoomModal|test/ },
];

// ────────────────────────────────────────────────────────────
// File walker
// ────────────────────────────────────────────────────────────
// 2026-09-23 · P3-4 · scope 지원 · file 마다 어느 root(src|server) 소속인지 태그
function walk(dir, scope, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git", "logs"].includes(e.name)) continue;
      walk(p, scope, out);
    } else if (/\.(tsx|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push({ path: p, scope });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Scan
// ────────────────────────────────────────────────────────────
function scanFile(fileEntry) {
  const filePath = fileEntry.path;
  const fileScope = fileEntry.scope; // "src" | "server"
  const content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
  const violations = [];
  const lineCount = content.split("\n").length;

  for (const rule of RULES) {
    // scope 필터 (2026-09-23 · P3-4)
    const ruleScope = rule.scope || "src";
    if (ruleScope !== "all" && ruleScope !== fileScope) continue;
    if (rule.skip && rule.skip.test(relPath)) continue;

    if (rule.id === "large-file-critical" || rule.id === "large-file-warn") {
      const above = lineCount > rule.lineThreshold;
      const below = rule.lineCeiling ? lineCount <= rule.lineCeiling : true;
      if (above && below) {
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
// Baseline (Phase 2 · pre-commit 가드레일)
// ────────────────────────────────────────────────────────────
function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  try { return JSON.parse(fs.readFileSync(BASELINE, "utf8")); }
  catch { return null; }
}

function saveBaseline(agg) {
  const files = {};
  for (const f of agg.files) {
    files[f.relPath] = {
      lines: f.lineCount,
      violations: f.violations.map(v => ({ ruleId: v.ruleId, count: v.count })),
      totalWeight: f.totalWeight,
    };
  }
  const totalViolations = Object.values(agg.ruleTotals).reduce((s, r) => s + r.count, 0);
  const payload = {
    created: new Date().toISOString().slice(0, 10),
    version: 1,
    totalViolations,
    files,
  };
  fs.writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

// Compare current agg vs baseline · returns array of "new/worsened" 위반 문자열
function diffAgainstBaseline(agg, baseline) {
  const diffs = [];
  const baseFiles = baseline.files || {};
  const currFiles = {};
  for (const f of agg.files) currFiles[f.relPath] = f;

  for (const [relPath, f] of Object.entries(currFiles)) {
    const base = baseFiles[relPath];
    if (!base) {
      diffs.push(`  ⊕ NEW · ${relPath} (${f.lineCount} lines · weight ${f.totalWeight})`);
      continue;
    }
    // per-rule count · 신규 or 증가만 잡음
    const baseCounts = {};
    for (const v of base.violations || []) baseCounts[v.ruleId] = v.count;
    for (const v of f.violations) {
      const baseC = baseCounts[v.ruleId] ?? 0;
      if (v.count > baseC) {
        diffs.push(`  ↑ WORSE · ${relPath} · ${v.ruleId} · ${baseC} → ${v.count}`);
      }
    }
  }
  return diffs;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = { check: false, checkNew: false, updateBaseline: false, quiet: false, help: false };
  for (const a of argv.slice(2)) {
    if (a === "--check") flags.check = true;
    else if (a === "--check-new") flags.checkNew = true;
    else if (a === "--update-baseline") flags.updateBaseline = true;
    else if (a === "--quiet" || a === "-q") flags.quiet = true;
    else if (a === "--help" || a === "-h") flags.help = true;
  }
  return flags;
}

function printHelp() {
  console.log(`Framework Audit · scripts/audit-framework.cjs

기본 · docs/FRAMEWORK_AUDIT.md 리포트 생성 · exit 0

옵션:
  --check              위반 1개라도 있으면 exit 1 (strict · 신규 프로젝트용)
  --check-new          baseline 대비 신규/증가된 위반만 exit 1 (pre-commit 권장)
  --update-baseline    현재 상태를 baseline (docs/.framework-baseline.json) 로 저장
  --quiet, -q          리포트 파일 미생성 · 콘솔 최소 출력
  --help, -h           도움말
`);
}

function main() {
  const flags = parseArgs(process.argv);
  if (flags.help) { printHelp(); process.exit(0); }

  // 2026-09-23 · P3-4 · src (기존) + server (신규) · scope 태그 유지
  const files = [
    ...walk(SRC, "src"),
    ...walk(SERVER, "server"),
  ];
  const results = files.map(scanFile);
  const agg = aggregate(results);
  const totalViolations = Object.values(agg.ruleTotals).reduce((s, r) => s + r.count, 0);

  if (!flags.quiet) {
    const md = renderReport(agg, files.length);
    fs.writeFileSync(OUTPUT, md, "utf8");
  }

  if (flags.updateBaseline) {
    const bp = saveBaseline(agg);
    console.log(`✓ Baseline 저장 · ${path.relative(ROOT, BASELINE)}`);
    console.log(`  ${bp.totalViolations} 위반 · ${Object.keys(bp.files).length} 파일`);
    process.exit(0);
  }

  if (flags.check) {
    if (totalViolations > 0) {
      console.error(`✗ Framework audit FAILED (strict) · ${totalViolations} 위반 · ${agg.files.length} 파일`);
      console.error(`  리포트 · ${path.relative(ROOT, OUTPUT)}`);
      process.exit(1);
    }
    console.log(`✓ Framework audit PASS (strict) · ${files.length} files clean`);
    process.exit(0);
  }

  if (flags.checkNew) {
    const baseline = loadBaseline();
    if (!baseline) {
      console.error(`✗ Baseline 파일 없음 · ${path.relative(ROOT, BASELINE)}`);
      console.error(`  먼저 실행 · node scripts/audit-framework.cjs --update-baseline`);
      process.exit(1);
    }
    const diffs = diffAgainstBaseline(agg, baseline);
    if (diffs.length > 0) {
      console.error(`✗ Framework audit FAILED · 신규/증가 위반 ${diffs.length}건 (baseline: ${baseline.totalViolations} · 현재: ${totalViolations})`);
      for (const d of diffs) console.error(d);
      console.error(``);
      console.error(`  → 프레임워크 프리미티브 사용 (Card·useToast·apiClient·useConfirm·Spinner) 또는 large-file 분리`);
      console.error(`  → 의도적 증가 시 · node scripts/audit-framework.cjs --update-baseline 로 갱신`);
      process.exit(1);
    }
    if (!flags.quiet) {
      console.log(`✓ Framework audit PASS (baseline) · ${totalViolations} 위반 (baseline ${baseline.totalViolations}) · 신규 증가 없음`);
    }
    process.exit(0);
  }

  // 기본 모드 · 기존 동작 유지
  console.log(`✓ Audit complete · ${files.length} files scanned`);
  console.log(`  Violations · ${agg.files.length} files · ${totalViolations} total`);
  console.log(`  Report · ${path.relative(ROOT, OUTPUT)}`);
}

main();
