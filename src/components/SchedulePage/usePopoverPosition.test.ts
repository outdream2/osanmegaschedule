// @vitest-environment jsdom
// 2026-09-23 · B-4 · usePopoverPosition 직접 단위 테스트
// 대상: src/components/SchedulePage/usePopoverPosition.ts (42줄)
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePopoverPosition } from "./usePopoverPosition";
import type { RefObject } from "react";

// ---- helpers -----------------------------------------------------------------
function makeRef(rect: Partial<DOMRect> = {}): RefObject<HTMLElement | null> {
  const el = {
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    })),
  } as unknown as HTMLElement;
  return { current: el };
}

/** jsdom 에서 window.innerWidth 는 getter-only 이므로 defineProperty 로 override */
function setInnerWidth(value: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value,
  });
}

beforeEach(() => {
  setInnerWidth(1024); // 기본 초기화
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- 1. forceRight=true · 항상 "right" --------------------------------------
describe("usePopoverPosition · forceRight=true", () => {
  it("isOpen=false 에서도 'right' 반환", () => {
    const anchorRef = makeRef();
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef, isOpen: false, forceRight: true }),
    );
    expect(result.current).toBe("right");
  });

  it("isOpen=true 에서도 'right' 유지", () => {
    const anchorRef = makeRef({ left: 0 }); // 화면 왼쪽이어도
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef, isOpen: true, forceRight: true }),
    );
    expect(result.current).toBe("right");
  });
});

// ---- 2. forceRight=false · isOpen=false · 초기값 ----------------------------
describe("usePopoverPosition · forceRight=false · isOpen=false", () => {
  it("초기값 'left' 반환", () => {
    const anchorRef = makeRef();
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef, isOpen: false }),
    );
    expect(result.current).toBe("left");
  });
});

// ---- 3. 뷰포트 경계 계산 · isOpen=true -------------------------------------
describe("usePopoverPosition · 뷰포트 경계 계산", () => {
  it("rect.left + popoverWidth > threshold · 'right' 반환", () => {
    // window.innerWidth = 1000, threshold = 0.72 → 720
    // rect.left = 500, popoverWidth = 288 → 788 > 720 → right
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 });
    const { result } = renderHook(() =>
      usePopoverPosition({
        anchorRef,
        isOpen: true,
        popoverWidth: 288,
        viewportRightThreshold: 0.72,
      }),
    );
    expect(result.current).toBe("right");
  });

  it("rect.left + popoverWidth < threshold · 'left' 반환", () => {
    // window.innerWidth = 1000, threshold = 0.72 → 720
    // rect.left = 100, popoverWidth = 288 → 388 < 720 → left
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 100 });
    const { result } = renderHook(() =>
      usePopoverPosition({
        anchorRef,
        isOpen: true,
        popoverWidth: 288,
        viewportRightThreshold: 0.72,
      }),
    );
    expect(result.current).toBe("left");
  });

  it("경계값 · rect.left + popoverWidth === threshold · 'left' 반환 (> 조건)", () => {
    // window.innerWidth = 1000, threshold = 0.72 → 720
    // rect.left = 432, popoverWidth = 288 → 720 === 720 → left (> 아님)
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 432 });
    const { result } = renderHook(() =>
      usePopoverPosition({
        anchorRef,
        isOpen: true,
        popoverWidth: 288,
        viewportRightThreshold: 0.72,
      }),
    );
    expect(result.current).toBe("left");
  });
});

// ---- 4. popoverWidth 기본값 288 / 커스텀 값 ---------------------------------
describe("usePopoverPosition · popoverWidth", () => {
  it("기본값 288 적용 · rect.left=500 · width=1000 · 'right'", () => {
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 });
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef, isOpen: true }),
    );
    // 500 + 288 = 788 > 720 → right
    expect(result.current).toBe("right");
  });

  it("커스텀 popoverWidth=100 · rect.left=500 · width=1000 · 'left'", () => {
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 });
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef, isOpen: true, popoverWidth: 100 }),
    );
    // 500 + 100 = 600 < 720 → left
    expect(result.current).toBe("left");
  });
});

// ---- 5. viewportRightThreshold 기본값 / 커스텀 값 ---------------------------
describe("usePopoverPosition · viewportRightThreshold", () => {
  it("커스텀 threshold=0.5 · rect.left=400 · width=1000 · 'right'", () => {
    // threshold = 0.5 → 500; rect.left=400, width=288 → 688 > 500 → right
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 400 });
    const { result } = renderHook(() =>
      usePopoverPosition({
        anchorRef,
        isOpen: true,
        viewportRightThreshold: 0.5,
        popoverWidth: 288,
      }),
    );
    expect(result.current).toBe("right");
  });

  it("threshold=0.9 · rect.left=500 · width=1000 · 'left'", () => {
    // threshold = 0.9 → 900; 500+288=788 < 900 → left
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 });
    const { result } = renderHook(() =>
      usePopoverPosition({
        anchorRef,
        isOpen: true,
        viewportRightThreshold: 0.9,
        popoverWidth: 288,
      }),
    );
    expect(result.current).toBe("left");
  });
});

// ---- 6. anchorRef.current=null · 안전 (crash 없음) --------------------------
describe("usePopoverPosition · anchorRef null", () => {
  it("anchorRef.current = null · crash 없이 초기값 유지", () => {
    const nullRef: RefObject<HTMLElement | null> = { current: null };
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef: nullRef, isOpen: true }),
    );
    // getBoundingClientRect 호출 없이 초기값 "left"
    expect(result.current).toBe("left");
  });

  it("forceRight=true + anchorRef null · 'right' 유지", () => {
    const nullRef: RefObject<HTMLElement | null> = { current: null };
    const { result } = renderHook(() =>
      usePopoverPosition({ anchorRef: nullRef, isOpen: true, forceRight: true }),
    );
    expect(result.current).toBe("right");
  });
});

// ---- 7. isOpen false→true · useEffect 재계산 트리거 -------------------------
describe("usePopoverPosition · isOpen 변경 시 재계산", () => {
  it("isOpen false→true · getBoundingClientRect 호출 · align 재계산", () => {
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 }); // 500+288=788 > 720 → right
    const getBCR = anchorRef.current!.getBoundingClientRect as ReturnType<typeof vi.fn>;

    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        usePopoverPosition({ anchorRef, isOpen, popoverWidth: 288, viewportRightThreshold: 0.72 }),
      { initialProps: { isOpen: false } },
    );
    expect(result.current).toBe("left");
    expect(getBCR).not.toHaveBeenCalled();

    rerender({ isOpen: true });
    expect(getBCR).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("right");
  });

  it("isOpen true→false · 재계산 없음 · align 유지", () => {
    setInnerWidth(1000);
    const anchorRef = makeRef({ left: 500 });
    const getBCR = anchorRef.current!.getBoundingClientRect as ReturnType<typeof vi.fn>;

    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        usePopoverPosition({ anchorRef, isOpen }),
      { initialProps: { isOpen: true } },
    );
    const callCountAfterOpen = getBCR.mock.calls.length;

    rerender({ isOpen: false });
    // 닫힐 때 추가 호출 없음
    expect(getBCR.mock.calls.length).toBe(callCountAfterOpen);
    // align 은 right 유지 (닫혀도 리셋 안 됨)
    expect(result.current).toBe("right");
  });
});
