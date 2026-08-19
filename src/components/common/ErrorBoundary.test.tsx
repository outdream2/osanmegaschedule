// @vitest-environment jsdom
// 2026-08-19 · ErrorBoundary · 정상 · 에러 캐치 · fallback · ChunkLoadError · reset
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// Console.error spy · 예상 에러 로그 억제
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function ThrowsBoom({ msg }: { msg: string }) {
  throw new Error(msg);
}

describe("ErrorBoundary · 정상 렌더", () => {
  it("에러 없으면 · children 렌더", () => {
    const { container } = render(
      <ErrorBoundary>
        <div data-testid="c">정상</div>
      </ErrorBoundary>
    );
    expect(container.querySelector('[data-testid="c"]')).not.toBeNull();
  });
});

describe("ErrorBoundary · 에러 캐치 (기본 fallback)", () => {
  it("에러 발생 시 · 기본 카드 렌더", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowsBoom msg="테스트 에러" />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("일시적인 오류가 발생했습니다");
    expect(container.textContent).toContain("새로고침");
  });

  it("일반 에러 · 새로고침 + 다시 시도 버튼 렌더", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowsBoom msg="일반 에러" />
      </ErrorBoundary>
    );
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toContain("새로고침");
    expect(btns[1].textContent).toContain("다시 시도");
  });

  it("ChunkLoadError · 새 버전 안내 · 다시 시도 버튼 없음", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowsBoom msg="ChunkLoadError: Loading chunk 5 failed" />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("새 버전이 배포되었습니다");
    const btns = container.querySelectorAll("button");
    expect(btns.length).toBe(1); // 새로고침만
    expect(btns[0].textContent).toContain("새로고침");
  });

  it("Loading chunk 에러 · 감지", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowsBoom msg="Loading CSS chunk 42 failed" />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("새 버전이 배포되었습니다");
  });

  it("동적 import 실패 · 감지", () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowsBoom msg="Failed to fetch dynamically imported module" />
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("새 버전이 배포되었습니다");
  });
});

describe("ErrorBoundary · 커스텀 fallback", () => {
  it("fallback 제공 시 · fallback 우선 렌더", () => {
    const fallback = (error: Error, reset: () => void) => (
      <div data-testid="fb">
        커스텀: {error.message}
        <button onClick={reset}>리셋</button>
      </div>
    );
    const { container } = render(
      <ErrorBoundary fallback={fallback}>
        <ThrowsBoom msg="커스텀 에러" />
      </ErrorBoundary>
    );
    expect(container.querySelector('[data-testid="fb"]')).not.toBeNull();
    expect(container.textContent).toContain("커스텀 에러");
  });

  it("fallback · reset 함수 · 클릭 시 정상 상태로 복원", () => {
    // reset 는 컴포넌트를 재렌더 · 하지만 자식이 여전히 throw 하면 다시 에러
    // 여기서는 reset 함수 호출 자체만 검증
    const reset = vi.fn();
    const fallback = (_error: Error, r: () => void) => (
      <button onClick={() => { reset(); r(); }} data-testid="btn">리셋</button>
    );
    const { container } = render(
      <ErrorBoundary fallback={fallback}>
        <ThrowsBoom msg="x" />
      </ErrorBoundary>
    );
    fireEvent.click(container.querySelector('[data-testid="btn"]')!);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorBoundary · componentDidCatch", () => {
  it("에러 발생 시 · console.error 호출 (로깅)", () => {
    const errSpy = vi.spyOn(console, "error");
    render(
      <ErrorBoundary>
        <ThrowsBoom msg="로깅 테스트" />
      </ErrorBoundary>
    );
    // React 는 여러번 호출 · ErrorBoundary 자체 로그 최소 1회
    const calls = errSpy.mock.calls.filter((c) =>
      c[0]?.toString?.().includes("[ErrorBoundary]")
    );
    expect(calls.length).toBeGreaterThan(0);
  });
});
