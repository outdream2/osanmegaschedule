// 2026-08-20 · ocrConfig · OCR 파이프라인 통합 설정 검증
import { describe, it, expect } from "vitest";
import { ocrConfig, type OcrConfig } from "./ocrConfig";

describe("ocrConfig · 이미지 전처리", () => {
  it("maxImageLongSide · 2200", () => {
    expect(ocrConfig.maxImageLongSide).toBe(2200);
  });

  it("jpegQuality · 95 (고품질)", () => {
    expect(ocrConfig.jpegQuality).toBe(95);
    expect(ocrConfig.jpegQuality).toBeGreaterThanOrEqual(1);
    expect(ocrConfig.jpegQuality).toBeLessThanOrEqual(100);
  });

  it("upscaleSmallImages · true (짧은 변 1200 미만 업스케일)", () => {
    expect(ocrConfig.upscaleSmallImages).toBe(true);
  });
});

describe("ocrConfig · OCR 엔진", () => {
  it("SLANet · 활성 · TATR · 비활성", () => {
    expect(ocrConfig.useSlanet).toBe(true);
    expect(ocrConfig.useTatr).toBe(false);
  });

  it("useLayout · true (DocLayout-YOLO)", () => {
    expect(ocrConfig.useLayout).toBe(true);
  });

  it("ocrModel · v5_korean_mobile", () => {
    expect(ocrConfig.ocrModel).toBe("v5_korean_mobile");
  });
});

describe("ocrConfig · 재시도 방법", () => {
  it("retryAttempts · 4방법 (대비강화·90°·180°·270°)", () => {
    expect(ocrConfig.retryAttempts).toEqual(["대비강화", "90°", "180°", "270°"]);
  });
});

describe("ocrConfig · 세션 관리", () => {
  it("disposeSessionsPerPage · true (Render OOM 방지)", () => {
    expect(ocrConfig.disposeSessionsPerPage).toBe(true);
  });

  it("forceGcAfterDispose · true", () => {
    expect(ocrConfig.forceGcAfterDispose).toBe(true);
  });
});

describe("ocrConfig · 진단 로그", () => {
  it("logRawTextPreviewLength · 800", () => {
    expect(ocrConfig.logRawTextPreviewLength).toBe(800);
  });

  it("logRowsPreviewCount · 5", () => {
    expect(ocrConfig.logRowsPreviewCount).toBe(5);
  });

  it("logStageDiagnostics · true", () => {
    expect(ocrConfig.logStageDiagnostics).toBe(true);
  });
});

describe("ocrConfig · rawText 캐시", () => {
  it("rawCacheMax · 20", () => {
    expect(ocrConfig.rawCacheMax).toBe(20);
  });

  it("rawCacheTextCap · Infinity (무제한)", () => {
    expect(ocrConfig.rawCacheTextCap).toBe(Infinity);
  });
});

describe("ocrConfig · ONNX Runtime", () => {
  it("intraOpNumThreads · 2", () => {
    expect(ocrConfig.onnxIntraOpThreads).toBe(2);
  });

  it("graphOptimizationLevel · all/basic/extended/disabled 중 하나", () => {
    const valid = ["all", "basic", "extended", "disabled"];
    expect(valid).toContain(ocrConfig.onnxGraphOptimizationLevel);
  });
});

describe("OcrConfig 타입", () => {
  it("타입 · typeof ocrConfig", () => {
    // 타입 체크 · 값이 있으면 타입 유효
    const c: OcrConfig = ocrConfig;
    expect(c).toBeDefined();
  });
});
