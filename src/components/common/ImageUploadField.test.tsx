// @vitest-environment jsdom
// 2026-08-19 · ImageUploadField · UI 부분 만 (upload · Supabase 는 mocking 대신 통합만)
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ImageUploadField } from "./ImageUploadField";

// Supabase client mock · storage upload 는 실제 호출 안 함
vi.mock("../../supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "test.png" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://x/test.png" } }),
      }),
    },
  },
}));

describe("ImageUploadField · 기본", () => {
  it("label 표시", () => {
    const { container } = render(
      <ImageUploadField label="로고 URL" value="" onChange={() => {}} />
    );
    expect(container.textContent).toContain("로고 URL");
  });

  it("URL input · value/placeholder 반영", () => {
    const { container } = render(
      <ImageUploadField label="x" value="https://a.com/1.png" onChange={() => {}} placeholder="URL 입력" />
    );
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input.value).toBe("https://a.com/1.png");
    expect(input.getAttribute("placeholder")).toBe("URL 입력");
  });

  it("URL input · onChange", () => {
    const onChange = vi.fn();
    const { container } = render(<ImageUploadField label="x" value="" onChange={onChange} />);
    const input = container.querySelector('input[type="url"]')!;
    fireEvent.change(input, { target: { value: "https://a.com/2.png" } });
    expect(onChange).toHaveBeenCalledWith("https://a.com/2.png");
  });

  it("파일 버튼 렌더", () => {
    const { container } = render(<ImageUploadField label="x" value="" onChange={() => {}} />);
    const fileBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("파일")
    );
    expect(fileBtn).toBeTruthy();
  });

  it("hidden file input · accept 반영", () => {
    const { container } = render(
      <ImageUploadField label="x" value="" onChange={() => {}} accept="image/png" />
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.getAttribute("accept")).toBe("image/png");
  });

  it("accept 기본 · image/*", () => {
    const { container } = render(<ImageUploadField label="x" value="" onChange={() => {}} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.getAttribute("accept")).toBe("image/*");
  });
});

describe("ImageUploadField · Trash 버튼", () => {
  it("value 있을 때 · Trash 버튼 렌더", () => {
    const { container } = render(
      <ImageUploadField label="x" value="https://x.com/1.png" onChange={() => {}} />
    );
    const trashBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "URL 지우기 (기본 이미지 사용)"
    );
    expect(trashBtn).toBeTruthy();
  });

  it("value 없으면 · Trash 버튼 없음", () => {
    const { container } = render(<ImageUploadField label="x" value="" onChange={() => {}} />);
    const trashBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "URL 지우기 (기본 이미지 사용)"
    );
    expect(trashBtn).toBeUndefined();
  });

  it("Trash 클릭 · onChange('')", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ImageUploadField label="x" value="https://x.com/1.png" onChange={onChange} />
    );
    const trashBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("title") === "URL 지우기 (기본 이미지 사용)"
    )!;
    fireEvent.click(trashBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("ImageUploadField · 미리보기", () => {
  it("value 있을 때 · img 태그 렌더", () => {
    const { container } = render(
      <ImageUploadField label="x" value="https://x.com/1.png" onChange={() => {}} />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://x.com/1.png");
  });

  it("value 없으면 · img 미렌더", () => {
    const { container } = render(<ImageUploadField label="x" value="" onChange={() => {}} />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("ImageUploadField · hint", () => {
  it("hint 있고 error 없으면 · hint 표시", () => {
    const { container } = render(
      <ImageUploadField label="x" value="" onChange={() => {}} hint="PNG · 512KB 이하" />
    );
    expect(container.textContent).toContain("PNG · 512KB 이하");
  });

  it("hint 없으면 · 표시 안 함", () => {
    const { container } = render(<ImageUploadField label="x" value="" onChange={() => {}} />);
    const hintEl = container.querySelector(".text-\\[10px\\].text-zinc-400");
    expect(hintEl).toBeNull();
  });
});
