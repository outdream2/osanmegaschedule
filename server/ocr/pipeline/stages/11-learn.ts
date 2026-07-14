import type { Stage } from "../types";

// Stage 11: 성공 시 템플릿 자동 학습 (ONNX 전용)
//   조건: 표준 헤더 3개+ · 공급사 매칭됨 · 행 1개 이상
//   → 다음 스캔에서 이 공급사 명세서 정확도 급상승
export function makeLearnStage(deps: {
  upsertOcrTemplate: (supplier: string | null | undefined, headers: string[]) => Promise<void>;
}): Stage {
  return {
    name: "learn-template",
    when: (ctx) => !!ctx.meta?.supplier && ctx.rows.length >= 1 && ctx.headers.length > 0,
    async run(ctx) {
      void deps.upsertOcrTemplate(ctx.meta.supplier, ctx.headers);
      return {};
    },
  };
}
