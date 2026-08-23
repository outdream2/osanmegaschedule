// @vitest-environment jsdom
// 2026-08-23 · #179 · ScanLeftPanel · notFoundCode 카드 · 등록 버튼 (canManageProducts + onOpenCreate)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ScanLeftPanel } from "./ScanPage.panels";
import type { StockRow } from "./stockRowTypes";

afterEach(() => cleanup());

const baseProps = {
  mapLoading: false,
  autoIncOn: false,
  onToggleAutoInc: vi.fn(),
  lastProduct: null,
  lastCode: null,
  requestingKey: null,
  rows: [] as StockRow[],
  onOpenScanner: vi.fn(),
  onScan: vi.fn(),
  onRequestDisplay: vi.fn(),
};

describe("ScanLeftPanel · 기본 렌더", () => {
  it("스캐너 버튼 · 상품 검색 렌더", () => {
    const { container } = render(<ScanLeftPanel {...baseProps} notFoundCode={null} />);
    expect(container.textContent).toContain("바코드 스캔");
    expect(container.querySelector('input[placeholder*="상품"]')).not.toBeNull();
  });

  it("notFoundCode 없음 · 등록 버튼 안 보임", () => {
    const { container } = render(<ScanLeftPanel {...baseProps} notFoundCode={null} canManageProducts onOpenCreate={vi.fn()} />);
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });
});

describe("ScanLeftPanel · #179 · notFoundCode 카드", () => {
  it("notFoundCode 있음 · '미등록 상품 코드' 카드 노출", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="8801234567890" />,
    );
    expect(container.textContent).toContain("미등록 상품 코드");
    expect(container.textContent).toContain("8801234567890");
  });

  it("canManageProducts=false · 등록 버튼 없음", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts={false} onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });

  it("onOpenCreate 없음 · 등록 버튼 없음", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });

  it("canManageProducts=true + onOpenCreate · 등록 버튼 노출", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).toContain("이 코드로 상품 등록");
  });

  it("등록 버튼 클릭 · onOpenCreate 호출 · notFoundCode 인자 전달", () => {
    const onOpenCreate = vi.fn();
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="8801234567890" canManageProducts onOpenCreate={onOpenCreate} />,
    );
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("이 코드로 상품 등록")) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpenCreate).toHaveBeenCalledTimes(1);
    expect(onOpenCreate).toHaveBeenCalledWith("8801234567890");
  });

  it("lastProduct 있음 · notFoundCode 무시 · 등록 버튼 안 보임", () => {
    const lastProduct = { code: "PC001", name: "타이레놀", spec: "10정" };
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" lastProduct={lastProduct} canManageProducts onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
    expect(container.textContent).not.toContain("미등록 상품 코드");
  });
});
