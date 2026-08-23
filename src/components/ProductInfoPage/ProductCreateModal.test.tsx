// @vitest-environment jsdom
// 2026-08-23 · #177 Phase C · ProductCreateModal · 렌더 · 폼 입력 · 사전 채움 · lockCode · submit(mock)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ProductCreateModal } from "./ProductCreateModal";

const mockPost = vi.fn();
vi.mock("../../lib/apiClient", () => ({
  api: { post: (...args: any[]) => mockPost(...args) },
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
  mockPost.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ProductCreateModal · 렌더", () => {
  it("open=false · 렌더 없음", () => {
    const { container } = render(
      <ProductCreateModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.textContent).not.toContain("상품 신규 등록");
  });

  it("open=true · 헤더 · 4개 섹션 · 등록 버튼", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.textContent).toContain("상품 신규 등록");
    expect(container.textContent).toContain("필수 정보");
    expect(container.textContent).toContain("분류·공급");
    expect(container.textContent).toContain("가격·재고");
    expect(container.textContent).toContain("기타");
    const submit = container.querySelector('button[type="submit"]');
    expect(submit).not.toBeNull();
    // 필수 입력 없으면 disabled
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ProductCreateModal · initialCode / initialBarcode / lockCode (#179)", () => {
  it("initialCode 사전 채움 · barcode 도 자동 채움", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialCode="8801234567890" />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    expect(codeInput?.value).toBe("8801234567890");
    const barcodeInput = container.querySelector('input[placeholder="스캔 or 수동"]') as HTMLInputElement;
    expect(barcodeInput?.value).toBe("8801234567890");
  });

  it("lockCode · product_code readonly", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialCode="8801234567890" lockCode />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    expect(codeInput?.readOnly).toBe(true);
    expect(container.textContent).toContain("스캔 고정");
  });

  it("initialBarcode 별도 · barcode 만 사전 채움", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialBarcode="4901234567891" />,
    );
    const barcodeInput = container.querySelector('input[placeholder="스캔 or 수동"]') as HTMLInputElement;
    expect(barcodeInput?.value).toBe("4901234567891");
  });

  it("initialName 사전 채움", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialName="아세트아미노펜 500mg" />,
    );
    const nameInput = container.querySelector('input[placeholder="상품명 입력"]') as HTMLInputElement;
    expect(nameInput?.value).toBe("아세트아미노펜 500mg");
  });
});

describe("ProductCreateModal · 폼 입력 · 필수 검증", () => {
  it("상품코드+상품명 입력 시 · 등록 버튼 활성", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    const nameInput = container.querySelector('input[placeholder="상품명 입력"]') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "PC001" } });
    fireEvent.change(nameInput, { target: { value: "테스트상품" } });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("상품명만 입력 시 · 여전히 disabled", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const nameInput = container.querySelector('input[placeholder="상품명 입력"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "테스트" } });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe("ProductCreateModal · submit (mock)", () => {
  it("등록 성공 · onCreated 콜백 · api.post 호출 · product_code 트림", async () => {
    mockPost.mockResolvedValue({ data: { ok: true, product_code: "PC002" } });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <ProductCreateModal open onClose={onClose} onCreated={onCreated} />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    const nameInput = container.querySelector('input[placeholder="상품명 입력"]') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "  PC002  " } });
    fireEvent.change(nameInput, { target: { value: "테스트상품" } });
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await new Promise(r => setTimeout(r, 30));
    expect(mockPost).toHaveBeenCalledWith("/api/products", expect.objectContaining({
      product_code: "PC002",
      product_name: "테스트상품",
    }));
    // 2026-08-23 · v2 signature · (code, product) 확장 · product 정보 포함
    expect(onCreated).toHaveBeenCalledWith("PC002", expect.objectContaining({
      product_name: "테스트상품",
    }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ProductCreateModal · 초기화 버튼", () => {
  it("초기화 클릭 · 모든 입력 클리어", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "TEST" } });
    expect(codeInput.value).toBe("TEST");
    const resetBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "초기화") as HTMLButtonElement;
    fireEvent.click(resetBtn);
    expect(codeInput.value).toBe("");
  });
});
