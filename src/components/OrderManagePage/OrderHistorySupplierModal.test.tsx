// @vitest-environment jsdom
// 2026-08-23 · #182 · OrderHistorySupplierModal · 공급사 클릭 발주이력 조회 모달
//   렌더 · loading · empty · 기간 선택 · 필터링 · 확장 토글
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { OrderHistorySupplierModal } from "./OrderHistorySupplierModal";

const mockGet = vi.fn();
vi.mock("../../lib/apiClient", () => ({
  api: { get: (...args: any[]) => mockGet(...args) },
  ApiError: class MockApiError extends Error {
    status: number;
    data: unknown;
    constructor(message: string, status = 500, data: unknown = null) {
      super(message);
      this.status = status;
      this.data = data;
      this.name = "ApiError";
    }
  },
}));

// displayVendorName mock · 그대로 반환
vi.mock("../../utils/vendorNameNormalize", () => ({
  displayVendorName: (s: string) => s,
}));

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { orders: [] } });
});

afterEach(() => cleanup());

describe("OrderHistorySupplierModal · 렌더", () => {
  it("open · 헤더 · 공급사명 · 기간 selector", async () => {
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    expect(container.textContent).toContain("발주이력");
    expect(container.textContent).toContain("코스트팜");
    // PeriodSelector · 30/90/180/1년
    expect(container.textContent).toMatch(/30일|90일|1년/);
  });

  it("초기 · loading · Spinner 노출", () => {
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    expect(container.textContent).toMatch(/불러오는 중|Loading/);
  });

  it("빈 결과 · EmptyState 표시", async () => {
    const { container } = render(<OrderHistorySupplierModal supplier="없는공급사" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(container.textContent).toContain("발주 이력 없음");
    });
  });
});

describe("OrderHistorySupplierModal · 필터링 · 공급사 매칭", () => {
  it("API 응답 · 공급사 일치 항목만 필터", async () => {
    mockGet.mockResolvedValue({
      data: {
        orders: [
          {
            order_number: 100,
            sent_at: "2026-08-20T09:00:00Z",
            supplier: "코스트팜",
            supplier_contact: null,
            supplier_email: null,
            supplier_phone: null,
            hope_arrival_date: null,
            total_amount: 50000,
            items: [
              { id: 1, product_code: "P1", product_name: "타이레놀", order_qty: 5, unit_price: 5000, line_amount: 25000, current_stock: null, optimal_stock: null },
            ],
          },
          {
            order_number: 101,
            sent_at: "2026-08-19T09:00:00Z",
            supplier: "다른공급사",
            supplier_contact: null,
            supplier_email: null,
            supplier_phone: null,
            hope_arrival_date: null,
            total_amount: 30000,
            items: [],
          },
        ],
      },
    });
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    await waitFor(() => {
      // 코스트팜 매칭 · 1건 · 다른공급사 제외
      expect(container.textContent).toContain("1건");
      expect(container.textContent).toContain("50,000원");
      expect(container.textContent).not.toContain("30,000원");
    });
  });

  it("총 합계 · 여러 발주 합산 표시", async () => {
    mockGet.mockResolvedValue({
      data: {
        orders: [
          {
            order_number: 200, sent_at: "2026-08-20T09:00:00Z", supplier: "코스트팜",
            supplier_contact: null, supplier_email: null, supplier_phone: null, hope_arrival_date: null,
            total_amount: 20000, items: [{ id: 1, product_code: "P1", product_name: "A", order_qty: 2, unit_price: 10000, line_amount: 20000, current_stock: null, optimal_stock: null }],
          },
          {
            order_number: 201, sent_at: "2026-08-21T09:00:00Z", supplier: "코스트팜",
            supplier_contact: null, supplier_email: null, supplier_phone: null, hope_arrival_date: null,
            total_amount: 30000, items: [{ id: 2, product_code: "P2", product_name: "B", order_qty: 3, unit_price: 10000, line_amount: 30000, current_stock: null, optimal_stock: null }],
          },
        ],
      },
    });
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    await waitFor(() => {
      // 2건 · 합계 50,000
      expect(container.textContent).toContain("2건");
      expect(container.textContent).toContain("50,000원");
    });
  });
});

describe("OrderHistorySupplierModal · 확장/접기", () => {
  it("발주 항목 클릭 · 상품 상세 테이블 노출/숨김", async () => {
    mockGet.mockResolvedValue({
      data: {
        orders: [{
          order_number: 300, sent_at: "2026-08-20T09:00:00Z", supplier: "코스트팜",
          supplier_contact: null, supplier_email: null, supplier_phone: null, hope_arrival_date: null,
          total_amount: 10000,
          items: [{ id: 1, product_code: "P1", product_name: "특별상품", order_qty: 2, unit_price: 5000, line_amount: 10000, current_stock: null, optimal_stock: null }],
        }],
      },
    });
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    await waitFor(() => expect(container.textContent).toContain("1건"));
    // 초기 · 접혀있음 · 상품명 안 보임
    expect(container.textContent).not.toContain("특별상품");
    // 발주 항목 클릭 · 확장
    const orderRow = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("2026-08-20")) as HTMLButtonElement;
    expect(orderRow).toBeTruthy();
    fireEvent.click(orderRow);
    await waitFor(() => {
      expect(container.textContent).toContain("특별상품");
    });
  });
});

describe("OrderHistorySupplierModal · 기간 변경", () => {
  it("기간 선택 시 · API 재호출 · days 쿼리 반영", async () => {
    const { container } = render(<OrderHistorySupplierModal supplier="코스트팜" onClose={vi.fn()} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/order-history?days=90"));
    // 30일 버튼 클릭
    const btn30 = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "30일") as HTMLButtonElement;
    expect(btn30).toBeTruthy();
    fireEvent.click(btn30);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/order-history?days=30"));
  });
});
