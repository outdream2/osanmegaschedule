// 2026-08-20 · pipeline runner · sequential stage 실행 · when · 에러 격리
import { describe, it, expect, vi } from "vitest";
import { runPipeline, summarizePipelineRun } from "./runner";
import { makeInitialContext } from "./types";
import type { Stage, PageContext } from "./types";

const mkCtx = (): PageContext =>
  makeInitialContext({ page: 1, rawB64: "", rawMime: "image/jpeg" });

describe("runPipeline · 순차 실행", () => {
  it("모든 stage · 순서대로 실행", async () => {
    const order: string[] = [];
    const stages: Stage[] = [
      { name: "A", run: () => { order.push("A"); return {}; } },
      { name: "B", run: () => { order.push("B"); return {}; } },
      { name: "C", run: () => { order.push("C"); return {}; } },
    ];
    await runPipeline(stages, mkCtx(), { verbose: false });
    expect(order).toEqual(["A", "B", "C"]);
  });

  it("patch · ctx 에 얕은 병합", async () => {
    const stages: Stage[] = [
      { name: "A", run: () => ({ headers: ["품명", "수량"] }) },
      { name: "B", run: () => ({ rows: [["타이레놀", 10]] }) },
    ];
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.headers).toEqual(["품명", "수량"]);
    expect(ctx.rows).toEqual([["타이레놀", 10]]);
  });

  it("async stage · await 대기 · 순서 유지", async () => {
    const order: string[] = [];
    const stages: Stage[] = [
      { name: "async-A", run: async () => {
        await new Promise(r => setTimeout(r, 10));
        order.push("A"); return {};
      }},
      { name: "B", run: () => { order.push("B"); return {}; } },
    ];
    await runPipeline(stages, mkCtx(), { verbose: false });
    expect(order).toEqual(["A", "B"]);
  });

  it("diagnostics · 각 stage 별 log 축적", async () => {
    const stages: Stage[] = [
      { name: "A", run: () => ({ rows: [[1]] }) },
      { name: "B", run: () => ({ rows: [[1], [2]] }) },
    ];
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.diagnostics).toHaveLength(2);
    expect(ctx.diagnostics[0].stage).toBe("A");
    expect(ctx.diagnostics[0].rowCount).toBe(1);
    expect(ctx.diagnostics[1].rowCount).toBe(2);
    expect(typeof ctx.diagnostics[0].timeMs).toBe("number");
  });
});

describe("runPipeline · when · 조건부 스킵", () => {
  it("when=false · 스킵 · skipped=true", async () => {
    const stages: Stage[] = [
      { name: "skipMe", when: () => false, run: () => ({ rows: [[1]] }) },
      { name: "always", run: () => ({ headers: ["h"] }) },
    ];
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.diagnostics[0].skipped).toBe(true);
    expect(ctx.rows).toEqual([]); // skipped stage 는 반영 X
    expect(ctx.headers).toEqual(["h"]);
  });

  it("when=true · 실행", async () => {
    const stages: Stage[] = [
      { name: "run-me", when: () => true, run: () => ({ headers: ["ok"] }) },
    ];
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.diagnostics[0].skipped).toBeUndefined();
    expect(ctx.headers).toEqual(["ok"]);
  });
});

describe("runPipeline · 에러 처리", () => {
  it("stage throw · errors 축적 · 다음 stage 계속 진행", async () => {
    const stages: Stage[] = [
      { name: "fail", run: () => { throw new Error("boom"); } },
      { name: "recover", run: () => ({ headers: ["ok"] }) },
    ];
    // console.error 억제
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0]).toContain("fail:");
    expect(ctx.errors[0]).toContain("boom");
    expect(ctx.headers).toEqual(["ok"]); // 다음 stage 실행됨
    errSpy.mockRestore();
  });

  it("stopOnError=true · 즉시 throw", async () => {
    const stages: Stage[] = [
      { name: "fail", run: () => { throw new Error("boom"); } },
      { name: "unreachable", run: () => ({ headers: ["never"] }) },
    ];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runPipeline(stages, mkCtx(), { verbose: false, stopOnError: true })).rejects.toThrow("boom");
    errSpy.mockRestore();
  });

  it("에러 stage · diagnostics 에 error 필드", async () => {
    const stages: Stage[] = [
      { name: "fail", run: () => { throw new Error("test-err"); } },
    ];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    expect(ctx.diagnostics[0].error).toBe("test-err");
    errSpy.mockRestore();
  });
});

describe("makeInitialContext", () => {
  it("기본 값 초기화", () => {
    const ctx = makeInitialContext({ page: 5, rawB64: "abc", rawMime: "image/png" });
    expect(ctx.page).toBe(5);
    expect(ctx.rawB64).toBe("abc");
    expect(ctx.rawMime).toBe("image/png");
    expect(ctx.approach).toBe("default");
    expect(ctx.headers).toEqual([]);
    expect(ctx.rows).toEqual([]);
    expect(ctx.meta).toEqual({});
    expect(ctx.diagnostics).toEqual([]);
    expect(ctx.errors).toEqual([]);
    expect(typeof ctx.startTs).toBe("number");
  });

  it("supplierHint · approach 옵션 반영", () => {
    const ctx = makeInitialContext({
      page: 1, rawB64: "", rawMime: "",
      supplierHint: "대웅", approach: "high-contrast", cachedRawText: "prev",
    });
    expect(ctx.supplierHint).toBe("대웅");
    expect(ctx.approach).toBe("high-contrast");
    expect(ctx.cachedRawText).toBe("prev");
  });
});

describe("summarizePipelineRun", () => {
  it("성공/스킵/실패 카운트 · 요약 문자열", async () => {
    const stages: Stage[] = [
      { name: "ok", run: () => ({ headers: ["h"] }) },
      { name: "skip", when: () => false, run: () => ({}) },
      { name: "fail", run: () => { throw new Error("x"); } },
    ];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    const summary = summarizePipelineRun(ctx);
    expect(summary).toContain("성공: 1");
    expect(summary).toContain("스킵: 1");
    expect(summary).toContain("실패: 1");
    expect(summary).toContain("에러");
    errSpy.mockRestore();
  });

  it("에러 없음 · 에러 섹션 미포함", async () => {
    const stages: Stage[] = [{ name: "ok", run: () => ({}) }];
    const ctx = await runPipeline(stages, mkCtx(), { verbose: false });
    const summary = summarizePipelineRun(ctx);
    expect(summary).not.toContain("─── 에러 ───");
  });
});
