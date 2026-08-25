// @vitest-environment jsdom
// 2026-08-25 · OrderPdfPreview · 순수 렌더 컴포넌트 · A4 PDF 프리뷰
//   · html2canvas 캡처 대상 · 시맨틱 검증 (텍스트·수치)

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OrderPdfPreview } from "./OrderPdfPreview";
import type { OrderModalState } from "./OrderModal";

const makeModal = (overrides: Partial<OrderModalState> = {}): OrderModalState => ({
  orderNumber: "PO-2026-08-25-0001",
  orderDate: "2026-08-25",
  desiredArrival: "2026-08-28",
  memo: "",
  channels: { email: false, sms: false, kakao: false },
  suppliers: [
    {
      supplier: "동아제약",
      order_number: "PO-DA-001",
      supplier_contact: "김담당",
      supplier_phone: "010-1234-5678",
      supplier_email: null,
      items: [
        { order_request_id: "1", product_code: "PC001", product_name: "타이레놀",     current_stock: 0, optimal_stock: 30, order_qty: 30, unit_price: 300 },
        { order_request_id: "2", product_code: "PC002", product_name: "박카스",       current_stock: 5, optimal_stock: 50, order_qty: 45, unit_price: 200 },
      ],
    },
  ],
  ...overrides,
});

describe("OrderPdfPreview · 순수 렌더", () => {
  it("발주서 타이틀 · 발주번호 · 발신 (오산 메가타운 약국) 렌더", () => {
    const { container } = render(<OrderPdfPreview orderModal={makeModal()} />);
    expect(container.textContent).toContain("발주서");
    expect(container.textContent).toContain("PURCHASE ORDER");
    expect(container.textContent).toContain("PO-DA-001");
    expect(container.textContent).toContain("오산 메가타운 약국");
  });

  it("공급사·상품·수량·금액 KPI 요약 노출", () => {
    const { container } = render(<OrderPdfPreview orderModal={makeModal()} />);
    const t = container.textContent ?? "";
    // 공급사 1 · 상품 2종 · 수량 75 · 금액 = 30*300 + 45*200 = 18000
    expect(t).toContain("공급사");
    expect(t).toContain("상품");
    expect(t).toContain("수량");
    expect(t).toContain("금액");
    expect(t).toContain("75");   // 총 수량
    expect(t).toContain("18,000"); // 총 금액
  });

  it("상품 리스트 · 상품명 · 코드 · 단가 · 금액 노출", () => {
    const { container } = render(<OrderPdfPreview orderModal={makeModal()} />);
    const t = container.textContent ?? "";
    expect(t).toContain("타이레놀");
    expect(t).toContain("PC001");
    expect(t).toContain("박카스");
    expect(t).toContain("PC002");
    expect(t).toContain("300");   // 단가
    expect(t).toContain("9,000"); // 라인 금액 30*300
  });

  it("담당자·연락처 · 있으면 노출", () => {
    const { container } = render(<OrderPdfPreview orderModal={makeModal()} />);
    const t = container.textContent ?? "";
    expect(t).toContain("김담당");
    expect(t).toContain("010-1234-5678");
  });

  it("발주 메모 · 있을 때만 노출", () => {
    // 메모 있음
    const withMemo = render(<OrderPdfPreview orderModal={makeModal({ memo: "긴급 발주 요청" })} />);
    expect(withMemo.container.textContent).toContain("발주 메모");
    expect(withMemo.container.textContent).toContain("긴급 발주 요청");
    withMemo.unmount();
    // 메모 없음
    const noMemo = render(<OrderPdfPreview orderModal={makeModal({ memo: "" })} />);
    expect(noMemo.container.textContent).not.toContain("발주 메모");
  });

  it("아이템 메모 · 있으면 서브라인 · 비고 라벨 노출", () => {
    const modal = makeModal({
      suppliers: [
        {
          supplier: "신신제약", order_number: "PO-SS-001",
          items: [
            { order_request_id: "3", product_code: "P3", product_name: "감기약", current_stock: 0, optimal_stock: 20, order_qty: 20, unit_price: 500, memo: "빠른 배송 요청" },
          ],
        },
      ],
    });
    const { container } = render(<OrderPdfPreview orderModal={modal} />);
    const t = container.textContent ?? "";
    expect(t).toContain("비고");
    expect(t).toContain("빠른 배송 요청");
  });

  it("복수 공급사 · 공급사별 섹션 각각 렌더", () => {
    const modal = makeModal({
      suppliers: [
        { supplier: "동아제약",  order_number: "A-1", items: [{ order_request_id: "a", product_code: "A1", product_name: "타이레놀", current_stock: 0, optimal_stock: 10, order_qty: 10, unit_price: 100 }] },
        { supplier: "신신제약",  order_number: "B-1", items: [{ order_request_id: "b", product_code: "B1", product_name: "박카스",   current_stock: 0, optimal_stock: 20, order_qty: 20, unit_price: 200 }] },
      ],
    });
    const { container } = render(<OrderPdfPreview orderModal={modal} />);
    const t = container.textContent ?? "";
    expect(t).toContain("동아제약");
    expect(t).toContain("신신제약");
    expect(t).toContain("A-1");
    expect(t).toContain("B-1");
  });

  it("오프스크린 위치 · left: -99999 · html2canvas 캡처 전용", () => {
    const { container } = render(<OrderPdfPreview orderModal={makeModal()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.position).toBe("absolute");
    expect(root.style.left).toBe("-99999px");
    expect(root.style.width).toBe("794px");
  });
});
