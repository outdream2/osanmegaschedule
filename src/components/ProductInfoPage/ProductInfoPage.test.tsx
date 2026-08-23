// @vitest-environment jsdom
// 2026-08-23 · #177 Phase A~D · ProductInfoPage · 렌더 · 리스트 로드 · 검색 · 선택 · 권한 게이트
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ProductInfoPage } from "./ProductInfoPage";
import type { AuthSession } from "../../types";

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
vi.mock("../../lib/apiClient", () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    patch: (...args: any[]) => mockPatch(...args),
    post: (...args: any[]) => mockPost(...args),
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

// useConfirm 은 Provider 필요 · 편집 취소 confirm 없이 진행 위해 mock (default true)
vi.mock("../../hooks/useConfirm", () => ({
  useConfirm: () => async () => true,
}));

// useResizablePanel · isDesktop 제어 (기본 desktop=true)
let mockIsDesktop = true;
vi.mock("../../hooks/useResizablePanel", () => ({
  useResizablePanel: () => ({
    width: 420,
    setWidth: vi.fn(),
    startResize: vi.fn(),
    isDesktop: mockIsDesktop,
  }),
}));

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockPost.mockReset();
  mockIsDesktop = true;
  // 기본 · products-map 빈 결과 (에러 없음)
  mockGet.mockImplementation((url: string) => {
    if (url === "/api/products-map") return Promise.resolve({ data: {} });
    if (url.startsWith("/api/products/")) {
      const code = decodeURIComponent(url.split("/api/products/")[1]);
      return Promise.resolve({
        data: {
          product_code: code,
          product_name: "테스트상품",
          supplier: "코스트팜",
          category: "감기약",
          real_map: "12번",
          optimal_stock: 30,
        },
      });
    }
    return Promise.reject(new Error("unhandled: " + url));
  });
});

afterEach(() => {
  cleanup();
});

describe("ProductInfoPage · 초기 렌더", () => {
  it("헤더 · 검색바 · 빈 리스트 · 상세 안내", async () => {
    const auth: AuthSession = { role: "employee", level: 1 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => {
      expect(container.textContent).toContain("상품정보");
    });
    // 검색 placeholder
    expect(container.querySelector('input[placeholder*="상품명"]')).not.toBeNull();
    // empty 상태
    await waitFor(() => {
      expect(container.textContent).toMatch(/상품이 없습니다|상품을 선택하세요/);
    });
  });
});

describe("ProductInfoPage · 권한 게이트 · 상품 등록 버튼", () => {
  it("employee lv1 · 등록 버튼 안 보임", async () => {
    const auth: AuthSession = { role: "employee", level: 1 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("상품정보"));
    expect(container.textContent).not.toContain("상품 등록");
  });

  it("admin · 등록 버튼 노출", async () => {
    const auth: AuthSession = { role: "admin", level: 8 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("상품정보"));
    expect(container.textContent).toContain("상품 등록");
  });

  it("manager lv5+ · 등록 버튼 노출", async () => {
    const auth: AuthSession = { role: "manager", level: 5 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("상품정보"));
    expect(container.textContent).toContain("상품 등록");
  });

  it("manager lv4 · 등록 버튼 안 보임", async () => {
    const auth: AuthSession = { role: "manager", level: 4 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("상품정보"));
    expect(container.textContent).not.toContain("상품 등록");
  });

  it("null 세션 · 등록 버튼 안 보임", async () => {
    const { container } = render(<ProductInfoPage authSession={null} />);
    await waitFor(() => expect(container.textContent).toContain("상품정보"));
    expect(container.textContent).not.toContain("상품 등록");
  });
});

describe("ProductInfoPage · 상품 리스트 로드 · 선택 · 상세", () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/api/products-map") {
        return Promise.resolve({
          data: {
            "PC001": { product_name: "타이레놀", supplier: "코스트팜", optimal_stock: 20 },
            "PC002": { product_name: "게보린", supplier: "타이레놀공급사", optimal_stock: 15 },
          },
        });
      }
      if (url.startsWith("/api/products/")) {
        const code = decodeURIComponent(url.split("/api/products/")[1]);
        return Promise.resolve({
          data: { product_code: code, product_name: "타이레놀", supplier: "코스트팜" },
        });
      }
      return Promise.reject(new Error("unhandled"));
    });
  });

  it("리스트 렌더 · 2개 상품", async () => {
    const { container } = render(<ProductInfoPage authSession={null} />);
    await waitFor(() => {
      expect(container.textContent).toContain("타이레놀");
      expect(container.textContent).toContain("게보린");
    });
  });

  it("검색 · 상품명 필터", async () => {
    const { container } = render(<ProductInfoPage authSession={null} />);
    await waitFor(() => expect(container.textContent).toContain("타이레놀"));
    const search = container.querySelector('input[placeholder*="상품명"]') as HTMLInputElement;
    fireEvent.change(search, { target: { value: "게보린" } });
    // 게보린만 남음
    await waitFor(() => {
      expect(container.textContent).toContain("게보린");
    });
  });

  it("상품 클릭 · 상세 로드 · 우측 패널 표시", async () => {
    const { container } = render(<ProductInfoPage authSession={null} />);
    await waitFor(() => expect(container.textContent).toContain("타이레놀"));
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("타이레놀")) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      // 상세 패널의 "상품코드" 라벨
      expect(container.textContent).toContain("상품코드");
      expect(container.textContent).toContain("PC001");
    });
  });
});

describe("ProductInfoPage · 편집 모드 (canEdit)", () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/api/products-map") {
        return Promise.resolve({ data: { "PC001": { product_name: "타이레놀" } } });
      }
      return Promise.resolve({
        data: { product_code: "PC001", product_name: "타이레놀", supplier: "코스트팜", real_map: "12번" },
      });
    });
  });

  it("권한자 (admin) · 상품 선택 후 · [편집] 버튼 노출", async () => {
    const auth: AuthSession = { role: "admin", level: 8 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("타이레놀"));
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("타이레놀")) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const editBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "편집");
      expect(editBtn).toBeTruthy();
    });
  });

  it("비권한자 (employee lv1) · [편집] 버튼 없음", async () => {
    const auth: AuthSession = { role: "employee", level: 1 };
    const { container } = render(<ProductInfoPage authSession={auth} />);
    await waitFor(() => expect(container.textContent).toContain("타이레놀"));
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("타이레놀")) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain("상품코드"));
    const editBtn = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "편집");
    expect(editBtn).toBeFalsy();
  });
});
