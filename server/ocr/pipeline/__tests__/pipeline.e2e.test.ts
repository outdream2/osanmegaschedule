// server/ocr/pipeline/__tests__/pipeline.e2e.test.ts
// 파이프라인 E2E 회귀 테스트 (Phase 5 · 2026-07-14)
// OCR 엔진 stage 는 fixture 로 대체 · 나머지 stage 만 실행하여 최종 결과 검증

import { describe, it, expect } from "vitest";
import { runPipeline } from "../runner";
import { makeInitialContext } from "../types";
import type { PageContext, Row, Stage } from "../types";
import { normalizeStage } from "../stages/05-normalize";
import { mathFillStage } from "../stages/06-math-fill";
import { filterStage } from "../stages/07-filter";
import { verifyStage } from "../stages/08-verify";
import { totalsStage } from "../stages/09-totals";
import { fallbackStage } from "../stages/10-fallback";
import { ALL_FIXTURES, PipelineFixture } from "./fixtures";

// Fixture 기반 OCR 엔진 stage · 실제 PP-OCRv5 대신 fixture raw 삽입
function makeFixtureOcrStage(fixture: PipelineFixture): Stage {
  return {
    name: "ocr-engine-fixture",
    run(_ctx) {
      return {
        raw: fixture.raw,
        rawText: fixture.raw.rawText ?? "",
        headers: fixture.raw.headers ?? [],
        rows: fixture.raw.rows ?? [],
        meta: fixture.raw.meta ?? {},
        rawOcrHeaders: fixture.raw.headers ?? [],
        rawOcrSample: (fixture.raw.rows ?? []).slice(0, 5),
      };
    },
  };
}

// vendor-match 와 template stage 는 목 (DB 접근 없이)
const mockVendorMatchStage: Stage = {
  name: "vendor-match-mock",
  run(ctx) {
    return { vendorMatched: ctx.meta.supplier ?? undefined };
  },
};

const mockTemplateStage: Stage = {
  name: "template-mock",
  run() {
    return { template: undefined };
  },
};

// 나머지는 실제 stage 그대로 사용
function buildTestPipeline(fixture: PipelineFixture): Stage[] {
  return [
    makeFixtureOcrStage(fixture),
    mockVendorMatchStage,
    mockTemplateStage,
    normalizeStage,
    mathFillStage,
    filterStage,
    verifyStage,
    totalsStage,
    fallbackStage,
  ];
}

async function runFixture(fixture: PipelineFixture): Promise<PageContext> {
  const ctx = makeInitialContext({
    page: 1,
    rawB64: "",  // fixture 에서 대체됨
    rawMime: "image/jpeg",
    supplierHint: fixture.supplier,
  });
  const pipeline = buildTestPipeline(fixture);
  return runPipeline(pipeline, ctx, { page: 1, verbose: false });
}

function findRowByName(rows: Row[], headers: string[], name: string): Row | undefined {
  const nameIdx = headers.indexOf("품명");
  if (nameIdx < 0) return undefined;
  const norm = (s: any) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
  const target = norm(name);
  return rows.find(r => norm(r[nameIdx]).includes(target.slice(0, Math.min(target.length, 6))));
}

describe("파이프라인 E2E · fixture 기반", () => {
  for (const fixture of ALL_FIXTURES) {
    it(`${fixture.name}`, async () => {
      const ctx = await runFixture(fixture);
      const exp = fixture.expected;

      // 1) 상품 개수 검증
      if (exp.productCount !== undefined) {
        expect(ctx.rows.length, `상품 개수 · 기대 ${exp.productCount}`).toBe(exp.productCount);
      }

      // 2) 공급사 검증
      if (exp.supplier) {
        expect(ctx.meta.supplier, "공급사").toBe(exp.supplier);
      }

      // 3) 총계·소계 검증
      if (exp.total !== undefined) {
        expect(ctx.meta.total, "총계").toBe(exp.total);
      }
      if (exp.subtotal !== undefined) {
        expect(ctx.meta.subtotal, "소계").toBe(exp.subtotal);
      }
      if (exp.supplyAmount !== undefined) {
        expect(ctx.meta.supplyAmount, "공급가액").toBe(exp.supplyAmount);
      }
      if (exp.vat !== undefined) {
        expect(ctx.meta.vat, "부가세").toBe(exp.vat);
      }

      // 4) 부가세 별도 감지
      if (exp.vatSeparate !== undefined) {
        expect((ctx.meta as any).vatSeparate, "부가세별도").toBe(exp.vatSeparate);
      }

      // 5) 할인 감지
      if (exp.discount !== undefined) {
        expect((ctx.meta as any).discount, "할인").toBe(exp.discount);
      }

      // 6) 첫 상품 확인 (품명 기반 검색)
      if (exp.firstProductName) {
        const row = findRowByName(ctx.rows, ctx.headers, exp.firstProductName);
        expect(row, `상품 "${exp.firstProductName}" 존재`).toBeDefined();
        if (row) {
          const qtyIdx = ctx.headers.indexOf("수량");
          const priIdx = ctx.headers.indexOf("단가");
          const amtIdx = ctx.headers.indexOf("금액");
          if (exp.firstProductQty !== undefined && qtyIdx >= 0) {
            expect(row[qtyIdx], `${exp.firstProductName} 수량`).toBe(exp.firstProductQty);
          }
          if (exp.firstProductPrice !== undefined && priIdx >= 0) {
            expect(row[priIdx], `${exp.firstProductName} 단가`).toBe(exp.firstProductPrice);
          }
          if (exp.firstProductAmt !== undefined && amtIdx >= 0) {
            expect(row[amtIdx], `${exp.firstProductName} 금액`).toBe(exp.firstProductAmt);
          }
        }
      }
    });
  }

  it("파이프라인 실행 후 에러 없음 (전체 fixture)", async () => {
    const errors: string[] = [];
    for (const fixture of ALL_FIXTURES) {
      const ctx = await runFixture(fixture);
      if (ctx.errors.length > 0) {
        errors.push(`[${fixture.name}] ${ctx.errors.join(", ")}`);
      }
    }
    expect(errors, `파이프라인 에러 발생: ${errors.join(" | ")}`).toEqual([]);
  });
});
