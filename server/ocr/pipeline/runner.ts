// server/ocr/pipeline/runner.ts
// 파이프라인 실행기 (2026-07-14)
// - 각 stage 순차 실행 · 실패해도 다음 stage 진행 (안전 우선)
// - 진단 로그 자동 축적 · 회귀 발견에 활용
// - 성능 측정 · 매칭율 개선 실험 시 병목 파악용

import type { PageContext, Stage, StageLog } from "./types";

export interface RunOptions {
  verbose?: boolean;            // 각 stage 로그 출력 (기본 true)
  stopOnError?: boolean;        // 에러 시 즉시 중단 (기본 false)
  page?: number;                // 로그 접두어용
}

export async function runPipeline(
  stages: Stage[],
  ctx: PageContext,
  opts: RunOptions = {},
): Promise<PageContext> {
  const verbose = opts.verbose !== false;
  const prefix = `[Pipeline p${opts.page ?? ctx.page}]`;

  for (const stage of stages) {
    // 조건부 실행
    if (stage.when && !stage.when(ctx)) {
      const log: StageLog = { stage: stage.name, skipped: true };
      ctx.diagnostics.push(log);
      if (verbose) console.log(`${prefix} ⊘ ${stage.name} (skip)`);
      continue;
    }

    const t0 = Date.now();
    const prevRowCount = ctx.rows.length;
    try {
      const patch = await stage.run(ctx);
      // patch 를 ctx 에 얕은 병합
      if (patch) Object.assign(ctx, patch);
      const timeMs = Date.now() - t0;
      const delta = ctx.rows.length - prevRowCount;
      const log: StageLog = {
        stage: stage.name,
        timeMs,
        rowCount: ctx.rows.length,
        headers: ctx.headers.slice(),
      };
      ctx.diagnostics.push(log);
      if (verbose) {
        const deltaStr = delta === 0 ? "" : delta > 0 ? ` (+${delta}행)` : ` (${delta}행)`;
        console.log(`${prefix} ✓ ${stage.name} · ${timeMs}ms · 행=${ctx.rows.length}${deltaStr}`);
      }
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      ctx.errors.push(`${stage.name}: ${errMsg}`);
      ctx.diagnostics.push({ stage: stage.name, timeMs: Date.now() - t0, error: errMsg });
      console.error(`${prefix} ✗ ${stage.name}:`, errMsg);
      if (e?.stack) console.error(`  stack:`, e.stack);
      if (opts.stopOnError) throw e;
      // 기본: 다음 stage 로 계속 (안전 우선)
    }
  }
  return ctx;
}

/** 진단 로그 요약 · 매칭율 개선 실험용 */
export function summarizePipelineRun(ctx: PageContext): string {
  const lines: string[] = [];
  lines.push(`═════ Page ${ctx.page} 파이프라인 요약 ═════`);
  lines.push(`총 stage: ${ctx.diagnostics.length} · 성공: ${ctx.diagnostics.filter(d => !d.error && !d.skipped).length} · 스킵: ${ctx.diagnostics.filter(d => d.skipped).length} · 실패: ${ctx.errors.length}`);
  lines.push(`최종 헤더: ${JSON.stringify(ctx.headers)}`);
  lines.push(`최종 행 수: ${ctx.rows.length}`);
  lines.push(`총 소요: ${Date.now() - ctx.startTs}ms`);
  if (ctx.errors.length > 0) {
    lines.push(`─── 에러 ───`);
    ctx.errors.forEach(e => lines.push(`  · ${e}`));
  }
  return lines.join("\n");
}
