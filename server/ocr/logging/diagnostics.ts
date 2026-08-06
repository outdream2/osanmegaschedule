// server/ocr/diagnostics.ts
// OCR 통합 진단 로거 (2개 엔진 통일 포맷)
//
// 저장 위치:
//   logs/ocr-last.json               — 마지막 실행 결과 (엔진 무관, 항상 덮어씀)
//   logs/ocr-<engine>-last.json      — 엔진별 마지막 실행 (비교용)
//   logs/ocr-<timestamp>.json        — 히스토리 (최대 30개 유지)
//   logs/ocr-summary.txt             — 최근 실행 요약 (human-readable)

import fs from "fs/promises";
import path from "path";

export type EngineType = "gemini" | "onnx";

export type PageDiagnostic = {
  page: number;
  timeMs: number;
  supplier: string | null;
  supplierHintUsed: string | null;
  vendorMatched: string | null;    // vendors DB 매칭 결과
  templateApplied: string | null;  // ocr_templates 적용 여부
  date: string | null;
  total: number | null;
  headers: string[];
  rowCount: number;
  rowsPreview: any[][];  // 첫 5행만
  validationIssues: number;  // validateCellTypes 로 걸린 셀 수
  validationTop3: string[];  // 상위 3개 위반 룰
  // 파이프라인 단계별 상태
  pipeline?: {
    rawHeaders: string[];
    rawRowCount: number;
    afterClean?: { headers: string[]; rowCount: number };
    afterMerge?: { headers: string[]; rowCount: number };
    afterNormalize?: { headers: string[]; rowCount: number };
    afterHints?: { headers: string[]; rowCount: number };
    afterSpec?: { headers: string[]; rowCount: number };
    afterValidate?: { headers: string[]; rowCount: number; issues: number };
    final: { headers: string[]; rowCount: number };
  };
  rawTextPreview?: string;
  // 매칭 진단 (별도 API 호출 시)
  matches?: {
    total: number;
    matched: number;
    missed: number;
    lowScore: number;  // score < 70
    details?: Array<{ input: string; matched: string | null; score: number }>;
  };
};

export type OcrDiagnostic = {
  ts: string;
  engine: EngineType;
  pageCount: number;
  totalTimeMs: number;
  totals: {
    rowsExtracted: number;
    validationIssues: number;
    supplierMatched: number;
    templateApplied: number;
  };
  diagnostics: PageDiagnostic[];
};

/**
 * 인간 친화적 요약 텍스트 생성 (한 페이지 씩 한 눈에)
 */
function buildHumanSummary(diag: OcrDiagnostic): string {
  const lines: string[] = [];
  const dt = new Date(diag.ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`  OCR 실행 요약 · ${dt}`);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`엔진        : ${diag.engine === "gemini" ? "⚡ Gemini" : "🤖 AI 모델 (ONNX)"}`);
  lines.push(`페이지 수   : ${diag.pageCount}`);
  lines.push(`총 소요     : ${(diag.totalTimeMs / 1000).toFixed(2)}초`);
  lines.push(`추출 행 총합: ${diag.totals.rowsExtracted}`);
  lines.push(`검증 위반   : ${diag.totals.validationIssues}개 셀`);
  lines.push(`공급사 매칭 : ${diag.totals.supplierMatched}/${diag.pageCount}`);
  lines.push(`템플릿 적용 : ${diag.totals.templateApplied}/${diag.pageCount}`);
  lines.push(``);

  for (const p of diag.diagnostics) {
    lines.push(`─── 페이지 ${p.page} (${(p.timeMs / 1000).toFixed(2)}초) ───────────────────────`);
    lines.push(`공급사  : ${p.supplier ?? "(미추출)"}${p.vendorMatched ? ` → vendors DB "${p.vendorMatched}"` : ""}`);
    if (p.templateApplied) lines.push(`템플릿  : "${p.templateApplied}" 적용됨`);
    lines.push(`일자    : ${p.date ?? "(미추출)"}`);
    lines.push(`총계    : ${p.total?.toLocaleString() ?? "(미추출)"}`);
    lines.push(`헤더    : [${p.headers.join(" | ")}]`);
    lines.push(`행 수   : ${p.rowCount}`);
    if (p.validationIssues > 0) {
      lines.push(`셀 보정 : ${p.validationIssues}개 (${p.validationTop3.join(", ")}...)`);
    }
    if (p.rowsPreview.length > 0) {
      lines.push(``);
      lines.push(`  샘플 행 (최대 5개):`);
      for (let i = 0; i < Math.min(p.rowsPreview.length, 5); i++) {
        const row = p.rowsPreview[i];
        const cells = row.map(c => c == null ? "-" : String(c)).map(s => s.length > 20 ? s.slice(0, 18) + ".." : s);
        lines.push(`    ${i + 1}. ${cells.join(" | ")}`);
      }
    }
    if (p.matches) {
      lines.push(``);
      lines.push(`  DB 매칭 : ${p.matches.matched}/${p.matches.total} 성공 (누락 ${p.matches.missed}, 저점수 ${p.matches.lowScore})`);
    }
    lines.push(``);
  }

  lines.push(`═══════════════════════════════════════════════════════════════`);
  return lines.join("\n");
}

/**
 * OCR 진단 결과 저장 (JSON + human-readable txt)
 */
export async function saveOcrDiagnostic(diag: OcrDiagnostic): Promise<void> {
  try {
    const logsDir = path.join(process.cwd(), "logs");
    await fs.mkdir(logsDir, { recursive: true });
    const ts = diag.ts.replace(/[:.]/g, "-");
    const jsonPayload = JSON.stringify(diag, null, 2);
    const humanSummary = buildHumanSummary(diag);

    await Promise.all([
      fs.writeFile(path.join(logsDir, "ocr-last.json"), jsonPayload),
      fs.writeFile(path.join(logsDir, `ocr-${diag.engine}-last.json`), jsonPayload),
      fs.writeFile(path.join(logsDir, `ocr-${ts}.json`), jsonPayload),
      fs.writeFile(path.join(logsDir, "ocr-summary.txt"), humanSummary),
    ]);

    // 콘솔에도 요약 출력 (테스트 시 즉시 확인)
    console.log("\n" + humanSummary + "\n");

    // 오래된 파일 정리 (최대 30개 유지)
    const files = (await fs.readdir(logsDir)).filter(f => /^ocr-\d/.test(f)).sort();
    while (files.length > 30) {
      const f = files.shift();
      if (f) await fs.unlink(path.join(logsDir, f)).catch(() => {});
    }
  } catch (e: any) {
    console.warn(`[OCR/diag] 로그 저장 실패 (무시):`, e?.message);
  }
}

/**
 * validate 결과에서 상위 3개 룰 뽑기
 */
export function topValidationRules(issues: Array<{ rule: string }>): string[] {
  const counts = new Map<string, number>();
  for (const iss of issues) counts.set(iss.rule, (counts.get(iss.rule) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rule, n]) => `${rule}×${n}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 매칭 진단 (1차보정테이블 → DB 매칭)
// ─────────────────────────────────────────────────────────────────────────

export type RowMatchTrace = {
  rowIdx: number;
  ocrName: string;
  supplierHint: string | null;
  bestScore: number;
  bestCandidate: string | null;
  bestCode: string | null;
  matched: boolean;
  reason?: string;  // 실패 이유 ("score-too-low", "no-supplier-pool", "empty-name" 등)
  top3Candidates?: Array<{ name: string; code: string; score: number }>;
};

export type MatchDiagnostic = {
  ts: string;
  totalRows: number;
  matched: number;
  missed: number;
  lowScore: number;  // score >= 20 but < 70
  perfectMatch: number;  // score >= 95
  supplierHints: string[];
  rows: RowMatchTrace[];
};

/**
 * 매칭 진단 저장 (별도 파일 · human-readable summary 포함)
 */
export async function saveMatchDiagnostic(diag: MatchDiagnostic): Promise<void> {
  try {
    const logsDir = path.join(process.cwd(), "logs");
    await fs.mkdir(logsDir, { recursive: true });
    const jsonPayload = JSON.stringify(diag, null, 2);
    const summary = buildMatchSummary(diag);

    await Promise.all([
      fs.writeFile(path.join(logsDir, "ocr-match-last.json"), jsonPayload),
      fs.writeFile(path.join(logsDir, "ocr-match-summary.txt"), summary),
    ]);

    // 콘솔 요약
    console.log("\n" + summary + "\n");
  } catch (e: any) {
    console.warn(`[OCR/match-diag] 로그 저장 실패 (무시):`, e?.message);
  }
}

function buildMatchSummary(diag: MatchDiagnostic): string {
  const lines: string[] = [];
  const dt = new Date(diag.ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`  DB 매칭 결과 · ${dt}`);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`총 행 수      : ${diag.totalRows}`);
  lines.push(`매칭 성공     : ${diag.matched} (${(diag.matched / Math.max(1, diag.totalRows) * 100).toFixed(1)}%)`);
  lines.push(`  ├─ 완벽매칭 : ${diag.perfectMatch} (score ≥ 95)`);
  lines.push(`  ├─ 낮은점수 : ${diag.lowScore} (20 ≤ score < 70)`);
  lines.push(`  └─ 매칭실패 : ${diag.missed}`);
  lines.push(`공급사 힌트   : ${diag.supplierHints.length > 0 ? diag.supplierHints.join(", ") : "(없음)"}`);
  lines.push(``);
  lines.push(`─── 매칭 실패·저점수 행 상세 ─────────────────────────────────`);

  const failedOrLow = diag.rows.filter(r => !r.matched || r.bestScore < 70);
  if (failedOrLow.length === 0) {
    lines.push(`  (없음 · 모든 행이 70점 이상 매칭됨)`);
  } else {
    for (const row of failedOrLow) {
      lines.push(``);
      lines.push(`  #${row.rowIdx + 1}. "${row.ocrName}"`);
      lines.push(`     최고점수: ${row.bestScore} → ${row.matched ? `✅ "${row.bestCandidate}" (${row.bestCode})` : `❌ 실패`}`);
      if (row.reason) lines.push(`     이유: ${row.reason}`);
      if (row.top3Candidates && row.top3Candidates.length > 0) {
        lines.push(`     후보:`);
        for (const c of row.top3Candidates.slice(0, 3)) {
          lines.push(`       - ${c.score}점: "${c.name}" (${c.code})`);
        }
      }
    }
  }
  lines.push(``);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  return lines.join("\n");
}
