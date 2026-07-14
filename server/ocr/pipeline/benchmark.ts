// server/ocr/pipeline/benchmark.ts
// 매칭율 벤치마크 유틸 (2026-07-14 Phase 3)
//
// 목적: 사용자 목표 "100% 매칭" 도달까지 반복 개선 · 회귀 즉시 감지.
//   각 stage 별 성공률 · 놓친 필드 · 오탐 필드를 표로 리포트.

import type { Row, PageContext, OcrMeta } from "./types";

export interface ExpectedInvoice {
  page: number;
  supplier?: string;
  productCount: number;              // 상품 행 개수
  subtotal?: number;                 // 소계
  supplyAmount?: number;
  vat?: number;
  total?: number;
  discount?: number;                 // 할인/에누리
  discountLabel?: string;
  return_?: number;                  // 반품
  vatSeparate?: boolean;
  products?: Array<{
    name: string;
    qty?: number;
    price?: number;
    amt?: number;
    spec?: string | null;
    expiry?: string | null;
  }>;
}

export interface FieldCheck {
  field: string;
  expected: any;
  actual: any;
  match: boolean;
  reason?: string;
}

export interface PageBenchmarkResult {
  page: number;
  supplier: string;
  fields: FieldCheck[];
  productMatchRate: number;         // 상품 매칭율 (0-1)
  totalScore: number;               // 0-100
  duration: number;                 // ms
  errors: string[];
}

const norm = (s: string): string => String(s ?? "").replace(/[\s()\[\]{}·・.,+\-*/]/g, "").toLowerCase();

function approxEqual(a: number | undefined | null, b: number | undefined | null, tolerance = 0.01): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * tolerance);
}

function productNameSimilar(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  if (na.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function benchmarkPage(ctx: PageContext, expected: ExpectedInvoice): PageBenchmarkResult {
  const fields: FieldCheck[] = [];
  const meta: OcrMeta = ctx.meta ?? {};

  // 공급사
  fields.push({
    field: "supplier",
    expected: expected.supplier,
    actual: meta.supplier,
    match: !expected.supplier || norm(meta.supplier ?? "") === norm(expected.supplier),
  });

  // 총계 · 소계 · 부가세 · 공급가액
  fields.push({ field: "subtotal", expected: expected.subtotal, actual: meta.subtotal, match: approxEqual(meta.subtotal, expected.subtotal) });
  fields.push({ field: "supplyAmount", expected: expected.supplyAmount, actual: meta.supplyAmount, match: approxEqual(meta.supplyAmount, expected.supplyAmount) });
  fields.push({ field: "vat", expected: expected.vat, actual: meta.vat, match: approxEqual(meta.vat, expected.vat) });
  fields.push({ field: "total", expected: expected.total, actual: meta.total, match: approxEqual(meta.total, expected.total) });

  // 할인/에누리
  fields.push({ field: "discount", expected: expected.discount, actual: (meta as any).discount, match: approxEqual((meta as any).discount, expected.discount) });
  fields.push({ field: "return", expected: expected.return_, actual: (meta as any).returnAmount, match: approxEqual((meta as any).returnAmount, expected.return_) });
  fields.push({ field: "vatSeparate", expected: expected.vatSeparate, actual: (meta as any).vatSeparate, match: (expected.vatSeparate ?? false) === ((meta as any).vatSeparate ?? false) });

  // 상품 개수
  fields.push({ field: "productCount", expected: expected.productCount, actual: ctx.rows.length, match: expected.productCount === ctx.rows.length });

  // 상품 매칭율 (품명 유사도)
  let productMatchRate = 1;
  if (expected.products && expected.products.length > 0) {
    const nameIdx = ctx.headers.indexOf("품명");
    const qtyIdx  = ctx.headers.indexOf("수량");
    const priIdx  = ctx.headers.indexOf("단가");
    const amtIdx  = ctx.headers.indexOf("금액");
    let matched = 0;
    for (const exp of expected.products) {
      const found = ctx.rows.some((r: Row) => {
        if (!Array.isArray(r)) return false;
        const nameOk = nameIdx >= 0 && productNameSimilar(String(r[nameIdx] ?? ""), exp.name);
        if (!nameOk) return false;
        if (exp.qty  != null && qtyIdx >= 0 && !approxEqual(typeof r[qtyIdx] === "number" ? (r[qtyIdx] as number) : null, exp.qty)) return false;
        if (exp.price!= null && priIdx >= 0 && !approxEqual(typeof r[priIdx] === "number" ? (r[priIdx] as number) : null, exp.price)) return false;
        if (exp.amt  != null && amtIdx >= 0 && !approxEqual(typeof r[amtIdx] === "number" ? (r[amtIdx] as number) : null, exp.amt)) return false;
        return true;
      });
      if (found) matched++;
    }
    productMatchRate = matched / expected.products.length;
    fields.push({
      field: "products",
      expected: expected.products.length,
      actual: matched,
      match: matched === expected.products.length,
      reason: matched < expected.products.length ? `${matched}/${expected.products.length} 매칭` : undefined,
    });
  }

  const totalFields = fields.length;
  const passedFields = fields.filter(f => f.match).length;
  const totalScore = Math.round((passedFields / totalFields) * 100);

  return {
    page: ctx.page,
    supplier: meta.supplier ?? "미상",
    fields,
    productMatchRate,
    totalScore,
    duration: Date.now() - ctx.startTs,
    errors: ctx.errors,
  };
}

/** 여러 페이지 결과를 표로 정리 */
export function formatBenchmarkReport(results: PageBenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push("═══════ OCR 매칭율 벤치마크 리포트 ═══════");
  lines.push("");
  const overall = results.reduce((s, r) => s + r.totalScore, 0) / (results.length || 1);
  const totalDuration = results.reduce((s, r) => s + r.duration, 0);
  lines.push(`전체 페이지: ${results.length}`);
  lines.push(`평균 매칭 점수: ${overall.toFixed(1)}%`);
  lines.push(`총 소요: ${(totalDuration / 1000).toFixed(1)}초 (페이지당 평균 ${(totalDuration / results.length / 1000).toFixed(1)}초)`);
  lines.push("");
  lines.push("─── 페이지별 상세 ───");
  for (const r of results) {
    lines.push(`\n[페이지 ${r.page}] ${r.supplier} · ${r.totalScore}%`);
    for (const f of r.fields) {
      const mark = f.match ? "✓" : "✗";
      const line = `  ${mark} ${f.field}: 기대=${JSON.stringify(f.expected)} 실제=${JSON.stringify(f.actual)}${f.reason ? " · " + f.reason : ""}`;
      lines.push(line);
    }
    if (r.errors.length > 0) {
      lines.push(`  에러: ${r.errors.join("; ")}`);
    }
  }

  // 필드별 실패율 집계
  lines.push("");
  lines.push("─── 필드별 실패율 (100% 목표 항목 우선) ───");
  const fieldStats = new Map<string, { total: number; fails: number }>();
  for (const r of results) {
    for (const f of r.fields) {
      const s = fieldStats.get(f.field) ?? { total: 0, fails: 0 };
      s.total++;
      if (!f.match) s.fails++;
      fieldStats.set(f.field, s);
    }
  }
  for (const [field, s] of Array.from(fieldStats.entries()).sort((a, b) => b[1].fails - a[1].fails)) {
    const rate = ((s.total - s.fails) / s.total * 100).toFixed(1);
    const marker = s.fails === 0 ? "✅" : rate === "0.0" ? "🔴" : "⚠️ ";
    lines.push(`  ${marker} ${field.padEnd(15)} ${rate.padStart(5)}%  (${s.total - s.fails}/${s.total})`);
  }
  return lines.join("\n");
}
