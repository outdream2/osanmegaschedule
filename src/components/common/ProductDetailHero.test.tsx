// @vitest-environment jsdom
// 2026-08-29 · #186 A안 · ProductDetailHero 프리미티브 테스트
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProductDetailHero } from "./ProductDetailHero";

afterEach(() => cleanup());

describe("ProductDetailHero · 프리미티브", () => {
  const basic = { product_code: "PC001", product_name: "타이레놀", supplier: "코스트팜" };

  it("상품명 · 코드 · 공급사 렌더", () => {
    const { container } = render(<ProductDetailHero product={basic} />);
    expect(container.textContent).toContain("타이레놀");
    expect(container.textContent).toContain("PC001");
    expect(container.textContent).toContain("코스트팜");
  });

  it("product_name 없으면 '(이름 없음)' 표시", () => {
    const { container } = render(<ProductDetailHero product={{ product_code: "X1" }} />);
    expect(container.textContent).toContain("(이름 없음)");
  });

  it("sale_status='판매중' · emerald pill", () => {
    const { container } = render(<ProductDetailHero product={{ ...basic, sale_status: "판매중" }} />);
    const cls = container.innerHTML;
    expect(cls).toContain("판매중");
    expect(cls).toContain("emerald");
  });

  it("sale_status='판매중지' · zinc pill", () => {
    const { container } = render(<ProductDetailHero product={{ ...basic, sale_status: "판매중지" }} />);
    expect(container.textContent).toContain("판매중지");
  });

  it("category · 표시", () => {
    const { container } = render(<ProductDetailHero product={{ ...basic, category: "감기약" }} />);
    expect(container.textContent).toContain("감기약");
  });

  it("barcode · 표시", () => {
    const { container } = render(<ProductDetailHero product={{ ...basic, barcode: "8801234567890" }} />);
    expect(container.textContent).toContain("8801234567890");
  });

  it("actions 슬롯 · 렌더", () => {
    const { container } = render(
      <ProductDetailHero product={basic} actions={<button data-testid="edit">편집</button>} />
    );
    expect(container.querySelector('[data-testid="edit"]')?.textContent).toBe("편집");
  });

  it("sticky=true (기본) · sticky top-0 클래스", () => {
    const { container } = render(<ProductDetailHero product={basic} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("sticky");
    expect(root.className).toContain("top-0");
  });

  it("sticky=false · sticky 없음", () => {
    const { container } = render(<ProductDetailHero product={basic} sticky={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("sticky");
  });

  it("className 병합", () => {
    const { container } = render(<ProductDetailHero product={basic} className="custom-x" />);
    expect((container.firstElementChild as HTMLElement).className).toContain("custom-x");
  });
});
