#!/usr/bin/env node
// 2026-08-27 · 감사 #6 · Server Framework Audit (Phase 1)
//   · server/routes/**/*.ts · POST/PATCH/DELETE 라우트 스캔
//   · 규칙:
//     1) 변경 API (POST/PATCH/DELETE) 에 authorize() 존재
//     2) 요청 본문 있는 API (POST/PATCH) 에 validateBody() 존재
//     3) 모든 라우트 · asyncHandler() 감쌈
//   · 출력 · docs/SERVER_AUDIT.md
//   · exit code 0 · 위반 없음 · 1 · high severity 위반 있음
//   · 실행 · node scripts/audit-server.cjs
//
// 사용:
//   npm run audit:server (package.json 등록 필요)

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SERVER_ROUTES = path.join(ROOT, "server", "routes");
const OUTPUT = path.join(ROOT, "docs", "SERVER_AUDIT.md");

// 예외 · GET 만 있는 파일 · 변경 API 없어도 정상
const EXEMPT_PATTERNS = [
  /auth\.ts$/,        // 로그인 자체 · 다른 규칙 적용
  /public/,           // /public 경로
];

// 라우트 매치 · router.<method>("/path", middleware..., handler)
const ROUTE_RE = /router\.(post|patch|delete|put|get)\s*\(\s*["'`]([^"'`]+)["'`]\s*,([^)]*)\)/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function analyzeFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (EXEMPT_PATTERNS.some(re => re.test(rel))) return { rel, routes: [], violations: [] };
  const src = fs.readFileSync(filePath, "utf8");
  const routes = [];
  const violations = [];

  // router.<method>("/api/...", ... 매치 · router 정의 헤더 파싱
  const lines = src.split("\n");
  const routeStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /router\.(post|patch|delete|put|get)\s*\(\s*["'`]([^"'`]+)["'`]/.exec(lines[i]);
    if (m) routeStarts.push({ line: i + 1, method: m[1].toUpperCase(), path: m[2] });
  }
  for (const rt of routeStarts) {
    // 해당 라우트 · 다음 router.xxx( 까지 · 본문 스캔
    const startLine = rt.line - 1;
    const nextIdx = routeStarts.findIndex(r => r.line > rt.line);
    const endLine = nextIdx === -1 ? lines.length : routeStarts[nextIdx].line - 1;
    const body = lines.slice(startLine, endLine).join("\n");

    const hasAuthorize = /\bauthorize\s*\(/.test(body);
    const hasValidateBody = /\bvalidateBody\s*\(/.test(body);
    const hasAsyncHandler = /\basyncHandler\s*\(/.test(body);
    // multer · binary upload · SSE streaming · 의도적 예외 주석 검출
    const isBinaryUpload = /\bmulter\b|\bexpress\.raw\s*\(|\bmemoryStorage\s*\(|\bdiskStorage\s*\(|\b\w+Upload\s*\.\s*(single|array|fields)\s*\(|\b\w+Upload\s*\.none\s*\(/.test(body);
    const isAnonRoute = /audit:no-authorize|anon.push.subscribe|client.error|pre.?login/.test(body);
    const isSseOrGemini = /SSE|text\/event-stream|sessionDeadKeys|callGeminiOcr/.test(body);

    const info = { ...rt, hasAuthorize, hasValidateBody, hasAsyncHandler };
    routes.push(info);

    // 규칙 1 · 변경 API (POST·PATCH·DELETE·PUT) · authorize 필수
    // 예외: 의도적 익명 엔드포인트 (audit:no-authorize 주석 또는 anon 패턴 또는 SSE/Gemini raw-fetch 전용)
    if (["POST", "PATCH", "DELETE", "PUT"].includes(rt.method) && !hasAuthorize && !isAnonRoute && !isSseOrGemini) {
      violations.push({ severity: "high", rule: "no-authorize", ...info,
        msg: `${rt.method} ${rt.path} · authorize() 미적용 · 권한 우회 가능` });
    }
    // 규칙 2 · POST·PATCH · validateBody 필수 (body 있음)
    // 예외: multer/binary upload (raw bytes) · SSE · Gemini (validateBody 적용 불가)
    if (["POST", "PATCH", "PUT"].includes(rt.method) && !hasValidateBody && !isBinaryUpload && !isSseOrGemini) {
      violations.push({ severity: "medium", rule: "no-validate-body", ...info,
        msg: `${rt.method} ${rt.path} · validateBody() 미적용 · Zod 검증 없음` });
    }
    // 규칙 3 · asyncHandler 필수
    // 예외: SSE/Gemini (자체 에러 핸들링)
    if (!hasAsyncHandler && !isSseOrGemini) {
      violations.push({ severity: "medium", rule: "no-async-handler", ...info,
        msg: `${rt.method} ${rt.path} · asyncHandler() 미적용 · 에러 핸들링 표준 아님` });
    }
  }
  return { rel, routes, violations };
}

const files = walk(SERVER_ROUTES);
let totalRoutes = 0, totalViolations = 0, totalHigh = 0;
const perFile = [];
for (const f of files) {
  const r = analyzeFile(f);
  totalRoutes += r.routes.length;
  totalViolations += r.violations.length;
  totalHigh += r.violations.filter(v => v.severity === "high").length;
  perFile.push(r);
}

// 마크다운 출력
const lines = [];
lines.push("# 서버 프레임워크 감사 (Phase 1)");
lines.push("");
lines.push(`- 생성 · ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
lines.push(`- 스캔 파일 · ${files.length}개`);
lines.push(`- 총 라우트 · ${totalRoutes}개`);
lines.push(`- 위반 · ${totalViolations}건 (high ${totalHigh})`);
lines.push("");
lines.push("## 규칙");
lines.push("- **no-authorize** (high) · POST/PATCH/DELETE/PUT · authorize() 미적용");
lines.push("- **no-validate-body** (medium) · POST/PATCH/PUT · validateBody() 미적용");
lines.push("- **no-async-handler** (medium) · asyncHandler() 미적용");
lines.push("");
lines.push("## 위반 상세");
const filesWithViolations = perFile.filter(x => x.violations.length > 0);
if (filesWithViolations.length === 0) {
  lines.push("_없음 · 모든 라우트 준수_");
} else {
  for (const f of filesWithViolations) {
    lines.push(`### ${f.rel} (${f.violations.length}건)`);
    for (const v of f.violations) {
      const emoji = v.severity === "high" ? "🔴" : "🟡";
      lines.push(`- ${emoji} L${v.line} · **${v.rule}** · ${v.msg}`);
    }
    lines.push("");
  }
}
lines.push("## 라우트별 준수 현황");
for (const f of perFile.sort((a, b) => b.violations.length - a.violations.length).slice(0, 30)) {
  if (f.routes.length === 0) continue;
  const clean = f.violations.length === 0 ? "✅" : `⚠ ${f.violations.length}`;
  lines.push(`- ${clean} · ${f.rel} · ${f.routes.length} 라우트`);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, lines.join("\n"), "utf8");

console.log(`[audit-server] 완료 · ${files.length} 파일 · ${totalRoutes} 라우트 · ${totalViolations} 위반 (high ${totalHigh})`);
console.log(`[audit-server] 상세 · ${path.relative(ROOT, OUTPUT)}`);

// exit 1 · high severity 위반 있으면 CI 실패
if (totalHigh > 0) process.exit(1);
