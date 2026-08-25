// @vitest-environment jsdom
// 2026-08-25 · ReturnPdfPreview · 순수 렌더 · A4 반품요청서 PDF 프리뷰

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReturnPdfPreview } from "./ReturnPdfPreview";
import type { ReturnLineItem } from "./ReturnListPanel.types";

const line = (overrides: Partial<ReturnLineItem> = {}): ReturnLineItem => ({
  product_code: "PC001",
  product_name: "타이레놀",
  current_stock: 10,
  actual_stock: 10,
  return_qty: 5,
  purchase_price: 300,
  memo: "",
  purchase_cycle: null,
  sale_qty_month: null,
  sale_qty_60d: null,
  sale_qty_90d: null,
  ...overrides,
});

const baseProps = {
  returnNumber: "REQ-20260825-100",
  requestDate: "2026-08-25",
  expectedDate: "2026-08-28",
  reason: "재고 과다" as const,
  supplierName: "동아제약",
  supplierContact: "김담당",
  supplierPhone: "010-1234-5678",
  supplierEmail: null,
  lines: [line(), line({ product_code: "PC002", product_name: "박카스", return_qty: 3, purchase_price: 200 })],
  memo: "",
};

describe("ReturnPdfPreview · 순수 렌더", () => {
  it("반품 요청서 타이틀 · 번호 · 발신 · 수신", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} />);
    const t = container.textContent ?? "";
    expect(t).toContain("반 품 요 청 서");
    expect(t).toContain("REQ-20260825-100");
    expect(t).toContain("동아제약");
    expect(t).toContain("오산 메가타운 약국");
    expect(t).toContain("재고 과다");
  });

  it("상품 라인 · 코드 · 이름 · 수량 · 금액", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} />);
    const t = container.textContent ?? "";
    expect(t).toContain("PC001");
    expect(t).toContain("타이레놀");
    expect(t).toContain("PC002");
    expect(t).toContain("박카스");
    expect(t).toContain("1,500"); // 5*300
    expect(t).toContain("600");   // 3*200
  });

  it("합계 (수량 · 종수 · 금액) 노출", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} />);
    const t = container.textContent ?? "";
    // 총 수량 8 · 종수 2 · 금액 2100
    expect(t).toContain("8");
    expect(t).toContain("2종");
    expect(t).toContain("2,100");
  });

  it("공급사 연락처 · 있으면 노출", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} />);
    expect(container.textContent).toContain("김담당");
    expect(container.textContent).toContain("010-1234-5678");
  });

  it("특이사항 메모 · 있을 때만 노출", () => {
    const withMemo = render(<ReturnPdfPreview {...baseProps} memo="빠른 처리 요청" />);
    expect(withMemo.container.textContent).toContain("특이사항");
    expect(withMemo.container.textContent).toContain("빠른 처리 요청");
    withMemo.unmount();
    const noMemo = render(<ReturnPdfPreview {...baseProps} memo="" />);
    expect(noMemo.container.textContent).not.toContain("특이사항");
  });

  it("아이템 별 메모 · 상품 비고 섹션 노출", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} lines={[
      line({ memo: "포장 파손" }),
      line({ product_code: "PC003", product_name: "감기약", memo: "" }),
    ]} />);
    const t = container.textContent ?? "";
    expect(t).toContain("상품 비고");
    expect(t).toContain("포장 파손");
  });

  it("오프스크린 위치 · A4 폭 794px", () => {
    const { container } = render(<ReturnPdfPreview {...baseProps} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe("absolute");
    expect(root.style.left).toBe("-99999px");
    expect(root.style.width).toBe("794px");
  });

  it("반품 사유 · 4가지 모두 렌더 가능", () => {
    (["재고 과다", "유통기한 임박", "저조 판매", "기타"] as const).forEach(reason => {
      const { container, unmount } = render(<ReturnPdfPreview {...baseProps} reason={reason} />);
      expect(container.textContent).toContain(reason);
      unmount();
    });
  });
});
