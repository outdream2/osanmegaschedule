// 2026-08-21 · pipeline stage 11 · learn-template · 성공 시 템플릿 자동 학습
//   조건 · supplier 매칭 · 헤더 있음 · 행 1+ · upsertOcrTemplate 호출 (fire-and-forget)
import { describe, it, expect, vi } from "vitest";
import { makeLearnStage } from "./11-learn";
import { makeInitialContext } from "../types";
import type { PageContext } from "../types";

function makeCtx(overrides: Partial<PageContext> = {}): PageContext {
  const base = makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });
  return { ...base, ...overrides };
}

describe("makeLearnStage · Stage 팩토리", () => {
  it("Stage · name='learn-template'", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    expect(stage.name).toBe("learn-template");
  });

  it("when · supplier 있음 + 행 1+ + 헤더 1+ · true", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: { supplier: "동아약품" } as any,
      headers: ["품명", "수량"],
      rows: [["타이레놀", 10]],
    });
    expect(stage.when?.(ctx)).toBe(true);
  });

  it("when · supplier 없음 · false", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: {} as any,
      headers: ["품명"],
      rows: [["a"]],
    });
    expect(stage.when?.(ctx)).toBe(false);
  });

  it("when · 헤더 없음 · false", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: { supplier: "동아" } as any,
      headers: [],
      rows: [["a"]],
    });
    expect(stage.when?.(ctx)).toBe(false);
  });

  it("when · 행 0개 · false", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: { supplier: "동아" } as any,
      headers: ["품명"],
      rows: [],
    });
    expect(stage.when?.(ctx)).toBe(false);
  });

  it("when · supplier 빈 문자열 · false (falsy)", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: { supplier: "" } as any,
      headers: ["h"],
      rows: [["a"]],
    });
    expect(stage.when?.(ctx)).toBe(false);
  });

  it("when · supplier null · false", () => {
    const stage = makeLearnStage({ upsertOcrTemplate: vi.fn() });
    const ctx = makeCtx({
      meta: { supplier: null } as any,
      headers: ["h"],
      rows: [["a"]],
    });
    expect(stage.when?.(ctx)).toBe(false);
  });
});

describe("makeLearnStage · run", () => {
  it("run · upsertOcrTemplate 호출 (supplier + headers)", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const stage = makeLearnStage({ upsertOcrTemplate: upsert });
    const ctx = makeCtx({
      meta: { supplier: "동아약품" } as any,
      headers: ["품명", "수량", "단가"],
      rows: [["a", 1, 100]],
    });
    await stage.run(ctx);
    expect(upsert).toHaveBeenCalledWith("동아약품", ["품명", "수량", "단가"]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("run · 빈 patch 반환 (side-effect only)", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const stage = makeLearnStage({ upsertOcrTemplate: upsert });
    const ctx = makeCtx({
      meta: { supplier: "s" } as any,
      headers: ["h"],
      rows: [["a"]],
    });
    const patch = await stage.run(ctx);
    expect(patch).toEqual({});
  });

  it("run · void deps (fire-and-forget) · run 은 즉시 resolve", async () => {
    // upsert 가 미해결 promise 라도 stage.run 은 대기하지 않음 (void 처리)
    let resolveUpsert!: () => void;
    const slowPromise = new Promise<void>(res => { resolveUpsert = res; });
    const upsert = vi.fn().mockReturnValue(slowPromise);
    const stage = makeLearnStage({ upsertOcrTemplate: upsert });
    const ctx = makeCtx({
      meta: { supplier: "s" } as any,
      headers: ["h"],
      rows: [["a"]],
    });
    const runPromise = stage.run(ctx);
    // 즉시 완료 (void → await 안 함)
    await expect(runPromise).resolves.toEqual({});
    // 원본 upsert 는 아직 미해결
    resolveUpsert();
  });
});
