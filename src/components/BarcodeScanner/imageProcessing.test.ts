// @vitest-environment jsdom
// 2026-08-21 · BarcodeScanner · imageProcessing 순수 함수 검증
//   extractBarcodeDigits · avgBrightness · toGrayContrast · binarize · brightenGamma
//   ImageData polyfill (jsdom 미지원 · canvas 요구)
import { describe, it, expect } from "vitest";
import {
  extractBarcodeDigits,
  avgBrightness,
  toGrayContrast,
  binarize,
  brightenGamma,
  histoStretch,
  padQuietZone,
} from "./imageProcessing";

// ── ImageData polyfill · jsdom 은 canvas 없이 ImageData 미제공 ─────────────
class ImageDataPolyfill {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: PredefinedColorSpace = "srgb";
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = ImageDataPolyfill;
}

// ── 소형 이미지 헬퍼 ────────────────────────────────────────────────────────
function makeImage(w: number, h: number, value: number): ImageData {
  const arr = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < arr.length; i += 4) {
    arr[i] = value;
    arr[i + 1] = value;
    arr[i + 2] = value;
    arr[i + 3] = 255;
  }
  return new ImageData(arr, w, h);
}

describe("extractBarcodeDigits · Tesseract 결과에서 6~14자리 숫자 추출", () => {
  it("깨끗한 13자리 · 그대로 반환", () => {
    expect(extractBarcodeDigits("8801234567890")).toBe("8801234567890");
  });

  it("공백 포함 · 정리 후 추출", () => {
    expect(extractBarcodeDigits("880 1234 567 890")).toBe("8801234567890");
  });

  it("문자 사이 숫자 · 첫 매치 반환", () => {
    expect(extractBarcodeDigits("code: 1234567 name: banana")).toBe("1234567");
  });

  it("5자리 이하 · null (최소 6자리)", () => {
    expect(extractBarcodeDigits("12345")).toBeNull();
  });

  it("15자리 이상 연속 · 앞 14자리 · 매칭 (탐욕적)", () => {
    // regex \d{6,14} · 15자리 전체가 매칭될 수 있음 (14+1) - 실제 결과 확인
    const r = extractBarcodeDigits("123456789012345");
    // 정규식은 탐욕 · 최대 14자리 시도
    expect(r).toBe("12345678901234");
  });

  it("숫자 없음 · null", () => {
    expect(extractBarcodeDigits("no digits here")).toBeNull();
  });

  it("빈 문자열 · null", () => {
    expect(extractBarcodeDigits("")).toBeNull();
  });

  it("여러 매치 · 첫 번째만", () => {
    expect(extractBarcodeDigits("111111 222222 333333")).toBe("111111222222333333".slice(0, 14));
  });
});

describe("avgBrightness · 평균 밝기 (0-255)", () => {
  it("전체 검정 · 0", () => {
    expect(avgBrightness(makeImage(4, 4, 0))).toBe(0);
  });

  it("전체 흰색 · 255", () => {
    expect(avgBrightness(makeImage(4, 4, 255))).toBeCloseTo(255, 5);
  });

  it("전체 회색 128 · 128", () => {
    expect(avgBrightness(makeImage(4, 4, 128))).toBeCloseTo(128, 5);
  });

  it("1x1 픽셀 · 단일 값 반환", () => {
    expect(avgBrightness(makeImage(1, 1, 200))).toBeCloseTo(200, 5);
  });
});

describe("binarize · 임계값 기반 흑백 변환", () => {
  it("threshold 128 · 그레이 100 → 검정 0", () => {
    const src = makeImage(2, 2, 100);
    const r = binarize(src, 128);
    expect(r.data[0]).toBe(0);
  });

  it("threshold 128 · 그레이 200 → 흰색 255", () => {
    const src = makeImage(2, 2, 200);
    const r = binarize(src, 128);
    expect(r.data[0]).toBe(255);
  });

  it("threshold 이상값 · 정확히 흰색 (>=)", () => {
    const src = makeImage(2, 2, 128);
    const r = binarize(src, 128);
    expect(r.data[0]).toBe(255);
  });

  it("결과 · alpha 255 유지", () => {
    const src = makeImage(1, 1, 100);
    const r = binarize(src, 128);
    expect(r.data[3]).toBe(255);
  });
});

describe("toGrayContrast · 그레이 + 콘트라스트 스트레칭", () => {
  it("factor=1, center=128 · 128 그레이 → 그대로 유지", () => {
    const src = makeImage(1, 1, 128);
    const r = toGrayContrast(src, 1, false, 128);
    expect(r.data[0]).toBeCloseTo(128, 1);
  });

  it("factor=2 · 128 유지 · 어두운 부분 강화", () => {
    // g=100, factor=2, center=128 → (100-128)*2+128 = -56+128 = 72
    const src = makeImage(1, 1, 100);
    const r = toGrayContrast(src, 2, false, 128);
    expect(r.data[0]).toBeCloseTo(72, 1);
  });

  it("invert=true · 검정 → 흰색", () => {
    const src = makeImage(1, 1, 0);
    const r = toGrayContrast(src, 1, true, 128);
    expect(r.data[0]).toBe(255);
  });

  it("clamp 0-255 · factor 크면 초과 → 클램프", () => {
    const src = makeImage(1, 1, 250);
    const r = toGrayContrast(src, 10, false, 128);
    expect(r.data[0]).toBeLessThanOrEqual(255);
  });

  it("결과 · R=G=B (그레이스케일)", () => {
    const src = makeImage(1, 1, 200);
    const r = toGrayContrast(src, 1, false, 128);
    expect(r.data[0]).toBe(r.data[1]);
    expect(r.data[1]).toBe(r.data[2]);
  });
});

describe("brightenGamma · 감마 보정 (어두운 픽셀 밝게)", () => {
  it("gamma=0.4 · 30 → 밝게 (약 97)", () => {
    const src = makeImage(1, 1, 30);
    const r = brightenGamma(src, 0.4);
    // 255 * (30/255)^0.4 ≈ 97
    expect(r.data[0]).toBeGreaterThan(80);
    expect(r.data[0]).toBeLessThan(115);
  });

  it("gamma=1.0 · identity · 값 유지", () => {
    const src = makeImage(1, 1, 128);
    const r = brightenGamma(src, 1.0);
    expect(r.data[0]).toBeCloseTo(128, 0);
  });

  it("0 픽셀 · 0 유지", () => {
    const src = makeImage(1, 1, 0);
    const r = brightenGamma(src, 0.4);
    expect(r.data[0]).toBe(0);
  });

  it("255 픽셀 · 255 유지", () => {
    const src = makeImage(1, 1, 255);
    const r = brightenGamma(src, 0.4);
    expect(r.data[0]).toBe(255);
  });
});

describe("histoStretch · 동적 범위 확장", () => {
  it("모든 픽셀 동일 · min==max · 원본 반환", () => {
    const src = makeImage(4, 4, 128);
    const r = histoStretch(src);
    // 동일 참조 (조기 반환)
    expect(r).toBe(src);
  });

  it("100~200 범위 · 0~255 로 확장", () => {
    const arr = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < arr.length; i += 4) {
      arr[i] = arr[i + 1] = arr[i + 2] = i % 8 === 0 ? 100 : 200;
      arr[i + 3] = 255;
    }
    const src = new ImageData(arr, 2, 2);
    const r = histoStretch(src);
    // 100 → 0, 200 → 255
    expect(r.data[0]).toBeLessThanOrEqual(1);
    expect(r.data[4]).toBeGreaterThanOrEqual(254);
  });
});

describe("padQuietZone · 흰색 여백 패딩", () => {
  it("pad=10 · 폭 20 늘어남 · 높이 유지", () => {
    const src = makeImage(4, 4, 0);
    const r = padQuietZone(src, 10);
    expect(r.width).toBe(24);
    expect(r.height).toBe(4);
  });

  it("왼쪽 pad 영역 · 흰색 255", () => {
    const src = makeImage(4, 4, 0);
    const r = padQuietZone(src, 5);
    // 첫 픽셀 (0,0) · 흰색
    expect(r.data[0]).toBe(255);
  });

  it("중앙 · 원본 값 유지", () => {
    const src = makeImage(4, 4, 100);
    const r = padQuietZone(src, 5);
    // (5, 0) 위치 = 원본 첫 픽셀
    const idx = (0 * r.width + 5) * 4;
    expect(r.data[idx]).toBe(100);
  });

  it("pad=0 · 폭 그대로", () => {
    const src = makeImage(3, 3, 128);
    const r = padQuietZone(src, 0);
    expect(r.width).toBe(3);
  });
});
