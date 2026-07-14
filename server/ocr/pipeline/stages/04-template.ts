import type { OcrTemplate, Row, Stage } from "../types";

export function makeTemplateStage(deps: {
  findOcrTemplate: (hint: string | null | undefined, rawText?: string) => Promise<OcrTemplate | null>;
  applyColumnMapping: (headers: string[], rows: Row[], mapping: string[]) => { headers: string[]; rows: Row[] };
  applyTemplateHeaders: (detected: string[], template: string[]) => string[];
}): Stage {
  return {
    name: "template-apply",
    async run(ctx) {
      const hint = (ctx.supplierHint ?? "").trim() || ctx.vendorMatched || undefined;
      const tmpl = await deps.findOcrTemplate(hint, ctx.rawText);
      if (!tmpl) return { template: undefined };
      console.log(`[template] page ${ctx.page}: 발견 "${tmpl.supplier}" · rawHeaders=${ctx.headers.length}개 · mapping=${tmpl.column_mapping?.length ?? "없음"}개`);

      let headers = ctx.headers;
      let rows = ctx.rows;

      if (tmpl.column_mapping && Array.isArray(tmpl.column_mapping) && tmpl.column_mapping.some(v => v && v !== "제외")) {
        if (tmpl.column_mapping.length !== headers.length) {
          console.warn(`[template] page ${ctx.page}: ⚠ 매핑(${tmpl.column_mapping.length}) ≠ 원본(${headers.length}) · 그래도 적용`);
        }
        const mapped = deps.applyColumnMapping(headers, rows, tmpl.column_mapping);
        headers = mapped.headers;
        rows = mapped.rows;
        console.log(`[template] page ${ctx.page}: column_mapping 적용 → ${JSON.stringify(headers)}`);
      } else if (headers.length > 0) {
        const newHeaders = deps.applyTemplateHeaders(headers, tmpl.headers);
        if (newHeaders !== headers) {
          console.log(`[template] page ${ctx.page}: 헤더 적용 → ${JSON.stringify(newHeaders)}`);
          headers = newHeaders;
        }
      }
      return { headers, rows, template: tmpl };
    },
  };
}
