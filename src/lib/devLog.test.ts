// src/lib/devLog.test.ts
// 2026-09-18 · devLog 유틸 · DEV 모드 게이트 검증
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("devLog / devWarn", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    vi.resetModules();
  });

  it("import.meta.env.DEV=true 이면 · console.log/warn 호출됨 (vitest 기본)", async () => {
    // Vitest 는 기본적으로 DEV 모드 · import.meta.env.DEV = true
    const { devLog, devWarn } = await import("./devLog");
    devLog("hello", 1);
    devWarn("world", 2);
    expect(logSpy).toHaveBeenCalledWith("hello", 1);
    expect(warnSpy).toHaveBeenCalledWith("world", 2);
  });

  it("가변 인자 · 다중 파라미터 · 그대로 전달", async () => {
    const { devLog } = await import("./devLog");
    devLog("a", "b", "c", { d: 1 });
    expect(logSpy).toHaveBeenCalledWith("a", "b", "c", { d: 1 });
  });

  it("undefined·null 인자 · 그대로 전달", async () => {
    const { devWarn } = await import("./devLog");
    devWarn(undefined, null);
    expect(warnSpy).toHaveBeenCalledWith(undefined, null);
  });
});
