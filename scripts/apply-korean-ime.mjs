#!/usr/bin/env node
// scripts/apply-korean-ime.mjs
// 2026-09-21 · #329 · 한글 IME 우선 · 전수 적용 배치 스크립트
//
// 동작:
//   1. src/components/**/*.tsx 스캔 · `lang="ko" type="text"` 패턴 찾기
//   2. 각 매칭 · `type="text" {...KO_INPUT_PROPS}` 로 치환
//   3. `lang="ko" type={...}` 패턴은 · `type={...} {...KO_INPUT_PROPS}` 로 (dynamic type)
//   4. 파일 첫 import 이후 · `import { KO_INPUT_PROPS } from ".../lib/koreanInput"` 삽입
//      (이미 있으면 skip)
//   5. `<textarea` · `lang="ko"` 만 있고 KO_INPUT_PROPS 미적용이면 · 유사 치환
//
// 예외 · type="number/tel/email/date/password/url/search" 는 건드리지 않음 (검색은 별도 KO_SEARCH_PROPS · 이 스크립트 대상 아님)
//
// 실행:
//   node scripts/apply-korean-ime.mjs [--dry]

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src", "components");
const DRY = process.argv.includes("--dry");

/** 재귀 파일 스캔 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** 상대 import 경로 계산 · file → src/lib/koreanInput */
function importPath(file) {
  const dir = dirname(file);
  const target = join(ROOT, "src", "lib", "koreanInput");
  let rel = relative(dir, target).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

/** import 문 삽입 · 마지막 import 다음 줄 */
function insertImport(source, importLine) {
  if (source.includes("koreanInput")) return source; // 이미 있음
  // 마지막 import 문 위치 찾기
  const importRe = /^import\s.+?from\s+["'][^"']+["'];?$/gm;
  let last = null;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    last = m;
  }
  if (!last) {
    // import 없음 · 파일 시작에 삽입
    return importLine + "\n" + source;
  }
  const insertAt = last.index + last[0].length;
  return source.slice(0, insertAt) + "\n" + importLine + source.slice(insertAt);
}

/** 치환 · 사용된 실제 파일별 카운트 반환 */
function processFile(file) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  let src = readFileSync(file, "utf8");
  const before = src;
  let inputCount = 0;
  let textareaCount = 0;

  // 1) `lang="ko" type="text"` → `type="text" {...KO_INPUT_PROPS}`
  src = src.replace(
    /\blang="ko"\s+type="text"/g,
    () => {
      inputCount += 1;
      return 'type="text" {...KO_INPUT_PROPS}';
    },
  );

  // 2) `lang="ko" type={...}` (dynamic type)
  //    · 예외 · type={"number"} · type={"tel"} 등은 안전 (KO_INPUT_PROPS 는 spread 라 override 가능)
  //    · 안전을 위해 · 매칭 자체 skip (dynamic 은 개별 검토 필요)
  //    → 이번 스크립트에서는 안전을 위해 skip · 수동 처리
  // 필요 시 별도 pass 로 추가

  // 3) `type="text" lang="ko"` (반대 순서)
  src = src.replace(
    /\btype="text"\s+lang="ko"/g,
    () => {
      inputCount += 1;
      return 'type="text" {...KO_INPUT_PROPS}';
    },
  );

  // 4) `<textarea\s+lang="ko"` → `<textarea {...KO_INPUT_PROPS}`
  src = src.replace(
    /<textarea\s+lang="ko"/g,
    () => {
      textareaCount += 1;
      return "<textarea {...KO_INPUT_PROPS}";
    },
  );

  const changed = src !== before;
  if (changed) {
    // import 삽입
    const ip = importPath(file);
    const importLine = `// 2026-09-21 · #329 · 한글 IME 우선\nimport { KO_INPUT_PROPS } from "${ip}";`;
    src = insertImport(src, importLine);
    if (!DRY) writeFileSync(file, src, "utf8");
    console.log(
      `${DRY ? "[dry] " : ""}${rel} · input=${inputCount} · textarea=${textareaCount}`,
    );
    return { file: rel, inputCount, textareaCount };
  }
  return null;
}

// ─── main ───
const files = walk(SRC);
console.log(`Scanning ${files.length} tsx files in ${relative(ROOT, SRC)}`);

let total = 0;
let inputSum = 0;
let textareaSum = 0;
const results = [];
for (const f of files) {
  const r = processFile(f);
  if (r) {
    results.push(r);
    total += 1;
    inputSum += r.inputCount;
    textareaSum += r.textareaCount;
  }
}

console.log("─────────────────────────────────────");
console.log(`Total files changed: ${total}`);
console.log(`Total <input> replacements: ${inputSum}`);
console.log(`Total <textarea> replacements: ${textareaSum}`);
if (DRY) console.log("(dry run · no files written)");
