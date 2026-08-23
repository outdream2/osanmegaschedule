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

  it("Top N 옵션 · 100/300/1k/2k/전체", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} />);
    expect(container.textContent).toContain("100");
    expect(container.textContent).toContain("300");
    expect(container.textContent).toContain("1k");
    expect(container.textContent).toContain("2k");
    expect(container.textContent).toContain("전체");
  });

  it("Top N 300 선택 상태 · 강조 클래스", () => {
    const { container } = render(<SupplierFilterBar {...baseProps} supListLimit={300} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "300") as HTMLButtonElement;
    expect(btn.className).toContain("bg-brand-deep");
  });

  it("Top N 1000 클릭 · setSupListLimit 호출", () => {
    const setSupListLimit = vi.fn();
    const { container } = render(<SupplierFilterBar {...baseProps} setSupListLimit={setSupListLimit} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "1k") as HTMLButtonElement;
    fireEvent.click(btn);
    expect(setSupListLimit).toHaveBeenCalledWith(1000);
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
