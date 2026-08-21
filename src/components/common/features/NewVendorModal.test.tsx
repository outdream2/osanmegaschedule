// @vitest-environment jsdom
// 2026-08-19 · NewVendorModal · 폼 입력 · 카테고리 선택 · 저장 (mock api) · disabled · onClose
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NewVendorModal } from "./NewVendorModal";

const mockPost = vi.fn();
vi.mock("../../../lib/apiClient", () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
  },
}));

beforeEach(() => {
  mockPost.mockReset();
});

describe("NewVendorModal · 렌더", () => {
  it("헤더 · 신규 공급사 / 공급사 등록", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    expect(container.textContent).toContain("신규 공급사");
    expect(container.textContent).toContain("공급사 등록");
  });

  it("role=dialog + aria-modal", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
  });

  it("모든 입력 필드 · 회사명/담당자/전화/이메일/사업자번호/비고", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const inputs = container.querySelectorAll("input, textarea");
    // 회사명(text), 담당자(text), 전화(tel), 이메일(email), 사업자번호(text), 비고(textarea) = 6
    expect(inputs.length).toBe(6);
  });

  it("6 카테고리 버튼 · 미분류/위탁/선결제/60회전/90회전/기타", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const catBtns = Array.from(container.querySelectorAll("button")).filter((b) =>
      ["미분류", "위탁", "선결제", "60회전", "90회전", "기타"].includes(b.textContent?.trim() || "")
    );
    expect(catBtns.length).toBe(6);
  });
});

describe("NewVendorModal · 회사명 입력 · 저장 disabled 상태", () => {
  it("초기 · 저장 버튼 disabled (회사명 없음)", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "등록"
    )! as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("회사명 입력 후 · 저장 활성화", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const companyInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: "메가헬스케어" } });
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "등록"
    )! as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("회사명 공백만 · 저장 비활성 (trim 검증)", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const companyInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: "   " } });
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "등록"
    )! as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});

describe("NewVendorModal · 카테고리 선택", () => {
  it("카테고리 클릭 · 스타일 변경 (active 표시)", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const wittakBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "위탁"
    )!;
    expect(wittakBtn.className).not.toContain("bg-violet-500");
    fireEvent.click(wittakBtn);
    expect(wittakBtn.className).toContain("bg-violet-500");
  });

  it("다른 카테고리 클릭 · 이전 선택 해제", () => {
    const { container } = render(<NewVendorModal onClose={vi.fn()} />);
    const btns = container.querySelectorAll("button");
    const wittakBtn = Array.from(btns).find((b) => b.textContent?.trim() === "위탁")!;
    const priceBtn = Array.from(btns).find((b) => b.textContent?.trim() === "선결제")!;
    fireEvent.click(wittakBtn);
    fireEvent.click(priceBtn);
    expect(wittakBtn.className).not.toContain("bg-violet-500");
    expect(priceBtn.className).toContain("bg-rose-500");
  });
});

describe("NewVendorModal · onClose", () => {
  it("취소 버튼 클릭 · onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<NewVendorModal onClose={onClose} />);
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "취소"
    )!;
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("X 버튼 클릭 · onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<NewVendorModal onClose={onClose} />);
    const xBtn = container.querySelector('button[aria-label="닫기"]')!;
    fireEvent.click(xBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop 클릭 · onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<NewVendorModal onClose={onClose} />);
    const backdrop = container.querySelector('[role="dialog"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("NewVendorModal · 저장 (API mock)", () => {
  it("저장 성공 · api.post 호출 · onSaved 콜백 + onClose", async () => {
    mockPost.mockResolvedValue({ data: { id: 42, company_name: "테스트" } });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<NewVendorModal onClose={onClose} onSaved={onSaved} />);
    const companyInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: "테스트" } });
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "등록"
    )!;
    fireEvent.click(saveBtn);
    // async wait
    await new Promise((r) => setTimeout(r, 20));
    expect(mockPost).toHaveBeenCalledWith("/api/vendors", expect.objectContaining({
      company_name: "테스트",
    }));
    expect(onSaved).toHaveBeenCalledWith({ id: 42, company_name: "테스트" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("저장 실패 · 에러 메시지 표시 · onClose 안 함", async () => {
    mockPost.mockRejectedValue(new Error("서버 오류"));
    const onClose = vi.fn();
    const { container } = render(<NewVendorModal onClose={onClose} />);
    const companyInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: "테스트" } });
    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "등록"
    )!;
    fireEvent.click(saveBtn);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toContain("서버 오류");
    expect(onClose).not.toHaveBeenCalled();
  });
});
