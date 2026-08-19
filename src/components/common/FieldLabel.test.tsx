// @vitest-environment jsdom
// 2026-08-19 · FieldLabel · children/icon/required/className
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FieldLabel } from "./FieldLabel";
import { User } from "lucide-react";

describe("FieldLabel · 기본", () => {
  it("children 표시 · label 태그", () => {
    const { container } = render(<FieldLabel>이름</FieldLabel>);
    const label = container.querySelector("label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("이름");
  });

  it("2026-08-17 v2 · text-[14px] font-bold text-ink-soft", () => {
    const { container } = render(<FieldLabel>x</FieldLabel>);
    const label = container.querySelector("label")!;
    expect(label.className).toContain("text-[14px]");
    expect(label.className).toContain("font-bold");
    expect(label.className).toContain("text-ink-soft");
  });

  it("flex + gap-1.5 + mb-1.5", () => {
    const { container } = render(<FieldLabel>x</FieldLabel>);
    const label = container.querySelector("label")!;
    expect(label.className).toContain("flex");
    expect(label.className).toContain("gap-1.5");
    expect(label.className).toContain("mb-1.5");
  });
});

describe("FieldLabel · icon", () => {
  it("icon prop · 렌더 (React node)", () => {
    const { container } = render(
      <FieldLabel icon={<User size={12} data-testid="icon" />}>x</FieldLabel>
    );
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it("icon 없을 때 · svg 없음", () => {
    const { container } = render(<FieldLabel>x</FieldLabel>);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("FieldLabel · required", () => {
  it("required=true · * 표시 · rose 색", () => {
    const { container } = render(<FieldLabel required>이름</FieldLabel>);
    const asterisk = container.querySelector(".text-rose-500");
    expect(asterisk).not.toBeNull();
    expect(asterisk!.textContent).toBe("*");
  });

  it("required=false (기본) · * 없음", () => {
    const { container } = render(<FieldLabel>이름</FieldLabel>);
    expect(container.querySelector(".text-rose-500")).toBeNull();
  });
});

describe("FieldLabel · className", () => {
  it("className 병합", () => {
    const { container } = render(<FieldLabel className="mt-2">x</FieldLabel>);
    expect(container.querySelector("label")!.className).toContain("mt-2");
  });
});
