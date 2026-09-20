// @vitest-environment jsdom
// 2026-08-23 · #177 Phase C · ProductCreateModal · 렌더 · 폼 입력 · 사전 채움 · lockCode · submit(mock)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ProductCreateModal } from "./ProductCreateModal";

const mockPost = vi.fn();
// 2026-09-18 · useStorageLocations · api.get 필요 · shelf 5-slot 추가로 (373eaf78)
//   · unhandled rejection 방지 · 빈 배열 fallback (DEFAULT_STORAGE_LOCATIONS)
const mockGet = vi.fn().mockResolvedValue({ data: [] });
const mockPatch = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock("../../lib/apiClient", () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
    patch: (...args: any[]) => mockPatch(...args),
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

  it("open=true · 헤더 · 필수/분류 섹션 · 등록 버튼", () => {
    // 2026-09-20 · 사용자 지시 · 필수정보 재배치 · 판매가·매입가·공급사·판매상태 · 필수 섹션 이동
    //   · '가격' 별도 섹션 → '필수 정보' 안으로 통합 · 그래서 '가격' 텍스트 X
    //   · 등록 버튼 · 항상 enabled · 필수 미입력 시 · toast 로 알림 (submit handler 내부 validation)
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    expect(container.textContent).toContain("상품 신규 등록");
    expect(container.textContent).toContain("필수 정보");
    expect(container.textContent).toContain("판매가");
    expect(container.textContent).toContain("매입가");
    expect(container.textContent).toContain("분류");
    const submit = container.querySelector('button[type="submit"]');
    expect(submit).not.toBeNull();
    // 등록 버튼 · 항상 enabled (submitting 시만 disabled)
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ProductCreateModal · initialCode / initialBarcode / lockCode (#179)", () => {
  it("initialCode 사전 채움 · product_code 필드", () => {
    // 2026-08-24 · 바코드 필드 제거 · 상품코드 = 바코드 · submit 시 자동 세팅
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialCode="8801234567890" />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    expect(codeInput?.value).toBe("8801234567890");
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

  it("initialBarcode 별도 · form 초기값 세팅 (바코드 UI 제거됨)", () => {
    // 2026-08-24 · 바코드 필드 UI 제거 · form.barcode 는 initialBarcode 로 여전히 세팅 (submit 시 사용)
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialBarcode="4901234567891" />,
    );
    // 바코드 input · UI 미렌더 · form state 는 여전히 유지 (submit 시 상품코드로 덮음)
    const barcodeInput = container.querySelector('input[placeholder="스캔 or 수동"]');
    expect(barcodeInput).toBeNull();
  });

  it("initialName 사전 채움", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()}
        initialName="아세트아미노펜 500mg" />,
    );
    const nameInput = container.querySelector('input[placeholder*="타이레놀"]') as HTMLInputElement;
    expect(nameInput?.value).toBe("아세트아미노펜 500mg");
  });
});

describe("ProductCreateModal · 폼 입력 · 필수 검증", () => {
  // 2026-09-20 · 사용자 지시 · 등록 버튼 · 항상 enabled · 필수 미입력 시 · handleSubmit 에서 toast 안내
  it("상품코드+상품명 입력 시 · 등록 버튼 활성 (항상 enabled)", () => {
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    const nameInput = container.querySelector('input[placeholder*="타이레놀"]') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "PC001" } });
    fireEvent.change(nameInput, { target: { value: "테스트상품" } });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("아무 입력 없음 · 등록 버튼 항상 enabled · submit 시 validation 처리", () => {
    // 이전 · disabled 로 검증 · 신규 · submit 시 · toast 로 필수 필드 안내
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe("ProductCreateModal · submit (mock)", () => {
  it("필수 필드 미입력 · api.post 호출 안됨 · error 안내", async () => {
    // 2026-09-20 · 사용자 지시 · 신규 · 필수 미입력 · submit early return · toast/에러 표시
    mockPost.mockResolvedValue({ data: { ok: true } });
    const { container } = render(
      <ProductCreateModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );
    const codeInput = container.querySelector('input[placeholder*="20250823001"]') as HTMLInputElement;
    const nameInput = container.querySelector('input[placeholder*="타이레놀"]') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "PC002" } });
    fireEvent.change(nameInput, { target: { value: "테스트상품" } });
    // 공급사·판매가·매입가·판매상태 · 미입력 · submit
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await new Promise(r => setTimeout(r, 30));
    // api.post 호출 안 됨 (필수 미입력)
    expect(mockPost).not.toHaveBeenCalled();
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
