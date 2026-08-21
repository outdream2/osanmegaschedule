// @vitest-environment jsdom
// 2026-08-21 · usePagesSnapshot · props.pages 변화 · 신규 페이지만 append · 기존 유지
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePagesSnapshot } from "./usePagesSnapshot";
import type { RawPage } from "./types";

function makePage(page: number, overrides: Partial<RawPage> = {}): RawPage {
  return {
    page,
    headers: ["품명"],
    rows: [["item"]],
    meta: {},
    ...overrides,
  };
}

// console 로그 잡음 억제
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => { /* noop */ });
  vi.spyOn(console, "warn").mockImplementation(() => { /* noop */ });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePagesSnapshot · 신규 페이지 append · 기존 유지", () => {
  it("초기 마운트 · props 페이지 그대로 반환", () => {
    const p1 = makePage(1);
    const p2 = makePage(2);
    const { result } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [p1, p2] },
    });
    expect(result.current).toHaveLength(2);
    expect(result.current.map(p => p.page)).toEqual([1, 2]);
  });

  it("빈 props · 빈 snapshot", () => {
    const { result } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [] as RawPage[] },
    });
    expect(result.current).toEqual([]);
  });

  it("새 페이지 추가 시 · append (기존 유지)", () => {
    const p1 = makePage(1);
    const p2 = makePage(2);
    const p3 = makePage(3);
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [p1, p2] },
    });
    rerender({ pages: [p1, p2, p3] });
    expect(result.current).toHaveLength(3);
    expect(result.current.map(p => p.page)).toEqual([1, 2, 3]);
  });

  it("기존 페이지 · 절대 교체 X (사용자 편집 보존)", () => {
    const editedP1 = makePage(1, { rows: [["편집됨"]] });
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [editedP1] },
    });
    // props 에서 p1 이 다른 rows 로 갱신됨 (예: 서버 SSE)
    const serverP1 = makePage(1, { rows: [["서버값"]] });
    rerender({ pages: [serverP1] });
    // snapshot 은 여전히 편집된 값 유지
    expect(result.current[0].rows).toEqual([["편집됨"]]);
  });

  it("props · 완전 리셋 (0장) · snapshot 도 리셋", () => {
    const p1 = makePage(1);
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [p1] },
    });
    expect(result.current).toHaveLength(1);
    rerender({ pages: [] });
    expect(result.current).toEqual([]);
  });

  it("동일 개수 · 신규 없음 · 리렌더만 (early return)", () => {
    const p1 = makePage(1);
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [p1] },
    });
    const before = result.current;
    // 새 객체 · 같은 page 번호
    rerender({ pages: [makePage(1)] });
    // snapshot 은 초기 참조 유지 (변경 없음 · setState 호출 안됨)
    expect(result.current).toBe(before);
  });

  it("여러 페이지 순차 append", () => {
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [makePage(1)] },
    });
    rerender({ pages: [makePage(1), makePage(2)] });
    rerender({ pages: [makePage(1), makePage(2), makePage(3)] });
    rerender({ pages: [makePage(1), makePage(2), makePage(3), makePage(5)] });
    expect(result.current.map(p => p.page)).toEqual([1, 2, 3, 5]);
  });

  it("페이지 번호 · 중간 삭제 시 · append 만 (재정렬 X)", () => {
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [makePage(1), makePage(2), makePage(3)] },
    });
    // props 에서 page 2 사라짐 (서버 삭제) · 하지만 snapshot 은 유지 · 신규 4만 추가
    rerender({ pages: [makePage(1), makePage(3), makePage(4)] });
    // page 2 는 유지 · page 4 만 추가
    expect(result.current.map(p => p.page).sort()).toEqual([1, 2, 3, 4]);
  });

  it("리셋 후 다시 append · 정상 동작", () => {
    const { result, rerender } = renderHook(({ pages }) => usePagesSnapshot(pages), {
      initialProps: { pages: [makePage(1), makePage(2)] },
    });
    rerender({ pages: [] });
    rerender({ pages: [makePage(3)] });
    expect(result.current.map(p => p.page)).toEqual([3]);
  });
});
