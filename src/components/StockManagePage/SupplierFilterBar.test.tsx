// @vitest-environment jsdom
// 2026-08-23 · #185 · SupplierFilterBar · PageToolbar 프리미티브 통일 회귀 방지 테스트
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { SupplierFilterBar } from "./SupplierTab.panels";

afterEach(() => cleanup());

const baseProps = {
  displayedCount: 42,
  supplierMonths: 1 as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  supplierSeason: null,
  supListLimit: 300,
  loading: false,
  setSupplierMonths: vi.fn(),
  setSupplierSeason: vi.fn(),
  setSupListLimit: vi.fn(),
  fetchData: vi.fn(),
};

describe("SupplierFilterBar · #185 PageToolbar 통일", () => {
  it("제목·개수·설명 · PageToolbar 좌측", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} />);
    expect(container.textContent).toContain("공급사현황");
    expect(container.textContent).toContain("42");
    expect(container.textContent).toContain("개 사");
  });

  it("기간 selector · PeriodSelector · 옵션 렌더", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} />);
    // 10일 · 1개월 · 2개월 · ... 6개월
    expect(container.textContent).toContain("10일");
    expect(container.textContent).toContain("1개월");
    expect(container.textContent).toContain("6개월");
  });

  // 2026-09 · Top N 옵션 UI 폐기 · props supListLimit/setSupListLimit 는 API 호환용 (void)
  it("Top N 옵션 UI · 폐기 (props 유지 · 렌더 안 함)", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} />);
    // 렌더 X · 100·300·1k·2k 라벨 없음
    const btns = Array.from(container.querySelectorAll("button")).map(b => b.textContent);
    expect(btns.filter(t => t === "100").length).toBe(0);
    expect(btns.filter(t => t === "1k").length).toBe(0);
  });

  it("새로고침 버튼 · fetchData 호출", () => {
    const fetchData = vi.fn();
    const { container } = render(<SupplierFilterBar {...baseProps} fetchData={fetchData} />);
    // 새로고침 아이콘 버튼 (title="새로고침")
    const refresh = container.querySelector('button[title="새로고침"]') as HTMLButtonElement;
    expect(refresh).toBeTruthy();
    fireEvent.click(refresh);
    expect(fetchData).toHaveBeenCalled();
  });

  it("loading=true · 새로고침 버튼 비활성 + animate-spin", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} loading />);
    const refresh = container.querySelector('button[title="새로고침"]') as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    // 아이콘 animate-spin
    const spinIcon = refresh.querySelector(".animate-spin");
    expect(spinIcon).not.toBeNull();
  });
});
