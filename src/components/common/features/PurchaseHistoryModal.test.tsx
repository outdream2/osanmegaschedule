// @vitest-environment jsdom
// 2026-08-20 · PurchaseHistoryModal · 상품 매입이력 모달
// 2026-08-23 · Framework Phase 3 · fetch → apiClient 마이그레이션 반영 · mock 갱신
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { PurchaseHistoryModal } from "./PurchaseHistoryModal";

let mockGet: ReturnType<typeof vi.fn>;

const sampleRows = [
  { id: 1, purchase_date: "2026-08-15", supplier_name: "대웅", product_name: "타이", quantity: 10, unit_price: 1000, amount: 10000 },
  { id: 2, purchase_date: "2026-08-08", supplier_name: "한독", product_name: "타이", quantity: 5, unit_price: 800, amount: 4000 },
  { id: 3, purchase_date: "2026-08-01", supplier_name: "삼성", product_name: "타이", quantity: 20, unit_price: 500, amount: 10000 },
];

// 2026-08-23 · apiClient mock · fetch mock 대체
vi.mock("../../../lib/apiClient", () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
  },
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

beforeEach(() => {
  mockGet = vi.fn().mockResolvedValue({ data: { rows: sampleRows } });
  localStorage.clear();
});

describe("PurchaseHistoryModal · 렌더", () => {
  it("productCode·productName 표시", async () => {
    const { container } = render(
      <PurchaseHistoryModal productCode="TY-100" productName="타이레놀 500mg" onClose={() => {}} />
    );
    expect(container.textContent).toContain("TY-100");
    expect(container.textContent).toContain("타이레놀");
    expect(container.textContent).toContain("매입 이력");
  });

  it("mount · /api/purchase-details 조회", async () => {
    render(<PurchaseHistoryModal productCode="TY-100" onClose={() => {}} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toContain("/api/purchase-details");
    expect(mockGet.mock.calls[0][0]).toContain("product_code=TY-100");
  });

  it("rows 3개 · '3건' 배지 · 총계·평균·주기 표시", async () => {
    const { container } = render(
      <PurchaseHistoryModal productCode="TY-100" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toContain("3건"));
    expect(container.textContent).toContain("총");
    expect(container.textContent).toContain("평균");
    expect(container.textContent).toContain("주기");
  });
});

describe("PurchaseHistoryModal · 통계 계산", () => {
  it("총 수량 · 35개 (10+5+20)", async () => {
    const { container } = render(
      <PurchaseHistoryModal productCode="TY-100" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toContain("3건"));
    expect(container.textContent).toContain("35");
  });

  it("총 금액 · 24000 → 2.4만 (fmtWon 만 단위)", async () => {
    const { container } = render(
      <PurchaseHistoryModal productCode="TY-100" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toContain("3건"));
    expect(container.textContent).toContain("2.4만");
  });

  it("평균 주기 · 최소 2건 이상 · 일수 표시", async () => {
    const { container } = render(
      <PurchaseHistoryModal productCode="TY-100" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toContain("3건"));
    expect(container.textContent).toMatch(/\d+일/);
  });
});

describe("PurchaseHistoryModal · edge cases", () => {
  it("빈 rows · 배지 X · 통계 X", async () => {
    mockGet.mockResolvedValue({ data: { rows: [] } });
    const { container } = render(
      <PurchaseHistoryModal productCode="X" onClose={() => {}} />
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // 안내 없음
    expect(container.textContent).not.toContain("주기");
  });

  it("fetch 실패 · error 표시", async () => {
    // ApiError · 500 · fetch 실패 시뮬레이션
    const { ApiError } = await import("../../../lib/apiClient");
    mockGet.mockRejectedValue(new ApiError("HTTP 500", 500, null));
    const { container } = render(
      <PurchaseHistoryModal productCode="X" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toMatch(/HTTP 500|로드 실패/));
  });

  it("1건 · 주기 계산 없음 (2건 미만)", async () => {
    mockGet.mockResolvedValue({ data: { rows: [sampleRows[0]] } });
    const { container } = render(
      <PurchaseHistoryModal productCode="X" onClose={() => {}} />
    );
    await waitFor(() => expect(container.textContent).toContain("1건"));
    expect(container.textContent).not.toContain("주기");
  });
});
