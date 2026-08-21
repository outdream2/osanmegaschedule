// 2026-08-21 · BarcodeScanner types · FORMATS · VIDEO_CONSTRAINTS 상수 검증
import { describe, it, expect } from "vitest";
import { FORMATS, VIDEO_CONSTRAINTS } from "./types";

describe("FORMATS · BarcodeDetector 포맷 목록", () => {
  it("13개 포맷 정의", () => {
    expect(FORMATS).toHaveLength(13);
  });

  it("EAN 계열 · ean_13 + ean_8 포함", () => {
    expect(FORMATS).toContain("ean_13");
    expect(FORMATS).toContain("ean_8");
  });

  it("UPC 계열 · upc_a + upc_e 포함", () => {
    expect(FORMATS).toContain("upc_a");
    expect(FORMATS).toContain("upc_e");
  });

  it("Code 계열 · code_128 + code_39 + code_93 포함", () => {
    expect(FORMATS).toContain("code_128");
    expect(FORMATS).toContain("code_39");
    expect(FORMATS).toContain("code_93");
  });

  it("2D 계열 · qr_code + data_matrix + pdf417 + aztec 포함", () => {
    expect(FORMATS).toContain("qr_code");
    expect(FORMATS).toContain("data_matrix");
    expect(FORMATS).toContain("pdf417");
    expect(FORMATS).toContain("aztec");
  });

  it("기타 · itf + codabar 포함", () => {
    expect(FORMATS).toContain("itf");
    expect(FORMATS).toContain("codabar");
  });

  it("모든 포맷 · snake_case + lowercase", () => {
    FORMATS.forEach(f => {
      expect(f).toMatch(/^[a-z0-9_]+$/);
    });
  });
});

describe("VIDEO_CONSTRAINTS · getUserMedia 제약", () => {
  it("facingMode · environment (후면 카메라)", () => {
    expect(VIDEO_CONSTRAINTS.facingMode).toBe("environment");
  });

  it("width · ideal 1920", () => {
    expect((VIDEO_CONSTRAINTS.width as any).ideal).toBe(1920);
  });

  it("height · ideal 1080", () => {
    expect((VIDEO_CONSTRAINTS.height as any).ideal).toBe(1080);
  });

  it("aspectRatio · 16:9", () => {
    expect((VIDEO_CONSTRAINTS.aspectRatio as any).ideal).toBeCloseTo(16 / 9, 5);
  });

  it("focusMode · 정의 없음 (Android Chrome overconstrained 방지)", () => {
    expect((VIDEO_CONSTRAINTS as any).focusMode).toBeUndefined();
  });

  it("exposureMode · 정의 없음 (Android Chrome overconstrained 방지)", () => {
    expect((VIDEO_CONSTRAINTS as any).exposureMode).toBeUndefined();
  });
});
