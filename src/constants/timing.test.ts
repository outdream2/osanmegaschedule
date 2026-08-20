// 2026-08-20 · timing · 상수 검증
import { describe, it, expect } from "vitest";
import { TIMING } from "./timing";

describe("TIMING · Debounce", () => {
  it("DEBOUNCE_SEARCH · 250ms", () => {
    expect(TIMING.DEBOUNCE_SEARCH).toBe(250);
  });

  it("DEBOUNCE_INPUT · 200ms", () => {
    expect(TIMING.DEBOUNCE_INPUT).toBe(200);
  });

  it("DEBOUNCE_SETTINGS · 500ms", () => {
    expect(TIMING.DEBOUNCE_SETTINGS).toBe(500);
  });
});

describe("TIMING · Toast", () => {
  it("SHORT < MEDIUM < LONG < EXTRA_LONG", () => {
    expect(TIMING.TOAST_SHORT).toBeLessThan(TIMING.TOAST_MEDIUM);
    expect(TIMING.TOAST_MEDIUM).toBeLessThan(TIMING.TOAST_LONG);
    expect(TIMING.TOAST_LONG).toBeLessThan(TIMING.TOAST_EXTRA_LONG);
  });

  it("TOAST_SHORT · 2500ms", () => {
    expect(TIMING.TOAST_SHORT).toBe(2500);
  });

  it("TOAST_EXTRA_LONG · 5000ms", () => {
    expect(TIMING.TOAST_EXTRA_LONG).toBe(5000);
  });
});

describe("TIMING · 기능별", () => {
  it("CAMERA_READY · 1500ms", () => {
    expect(TIMING.CAMERA_READY).toBe(1500);
  });

  it("AUTOSAVE · 1500ms", () => {
    expect(TIMING.AUTOSAVE).toBe(1500);
  });

  it("POLL_FAST < POLL_MEDIUM", () => {
    expect(TIMING.POLL_FAST).toBeLessThan(TIMING.POLL_MEDIUM);
  });

  it("PRESS_LONG · 500ms (long-press)", () => {
    expect(TIMING.PRESS_LONG).toBe(500);
  });
});

describe("TIMING · 모든 값 양수", () => {
  it("모든 값 > 0", () => {
    Object.values(TIMING).forEach((v) => {
      expect(v).toBeGreaterThan(0);
    });
  });
});
