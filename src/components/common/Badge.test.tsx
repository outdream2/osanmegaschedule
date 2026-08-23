// @vitest-environment jsdom
// 2026-08-23 · Badge primitive · shape/variant/tone/size 조합 검증
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge · 기본 렌더", () => {
  it("children 표시", () => {
    const { container } = render(<Badge>완료</Badge>);
    expect(container.textContent).toContain("완료");
  });

  it("기본 shape · rounded-md", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("rounded-md");
  });

  it("기본 size · sm · text-[12px]", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("text-[12px]");
  });

  it("tone 없으면 · border 없음", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.firstElementChild!;
    // border class 는 tone 있을 때만 추가됨
    expect(el.className.includes("border ")).toBe(false);
  });
});

describe("Badge · shape", () => {
  it("pill · rounded-full", () => {
    const { container } = render(<Badge shape="pill">x</Badge>);
    expect(container.firstElementChild!.className).toContain("rounded-full");
  });

  it("rounded (기본) · rounded-md", () => {
    const { container } = render(<Badge shape="rounded">x</Badge>);
    expect(container.firstElementChild!.className).toContain("rounded-md");
  });

  it("square · rounded 없음", () => {
    const { container } = render(<Badge shape="square">x</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls.includes("rounded-full")).toBe(false);
    expect(cls.includes("rounded-md")).toBe(false);
  });
});

describe("Badge · size", () => {
  it("xs · text-[11px] · px-1.5 py-0.5", () => {
    const { container } = render(<Badge size="xs">x</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("text-[11px]");
    expect(cls).toContain("px-1.5");
  });

  it("md · text-[13px] · px-2.5 py-1", () => {
    const { container } = render(<Badge size="md">x</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("text-[13px]");
    expect(cls).toContain("px-2.5");
  });
});

describe("Badge · tone + variant", () => {
  it("emerald · soft (기본) · bg-emerald-50 · text-emerald-700 · border-emerald-200", () => {
    const { container } = render(<Badge tone="emerald">완료</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("bg-emerald-50");
    expect(cls).toContain("text-emerald-700");
    expect(cls).toContain("border-emerald-200");
    expect(cls).toContain("border"); // tone 있으면 border
  });

  it("rose · filled · bg-rose-600 · text-white", () => {
    const { container } = render(<Badge tone="rose" variant="filled">거절</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("bg-rose-600");
    expect(cls).toContain("text-white");
  });

  it("amber · outline · text-amber-700 · border-amber-300 · no bg", () => {
    const { container } = render(<Badge tone="amber" variant="outline">주의</Badge>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("text-amber-700");
    expect(cls).toContain("border-amber-300");
  });

  it("zinc · soft · bg-zinc-100", () => {
    const { container } = render(<Badge tone="zinc">중립</Badge>);
    expect(container.firstElementChild!.className).toContain("bg-zinc-100");
  });
});

describe("Badge · icon", () => {
  it("icon prop · svg 렌더", () => {
    const { container } = render(
      <Badge icon={<svg data-testid="icon" />}>완료</Badge>
    );
    expect(container.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(container.textContent).toContain("완료");
  });
});

describe("Badge · className override", () => {
  it("커스텀 className · tone 없이 사용 (positionColor 등)", () => {
    const { container } = render(
      <Badge className="bg-purple-100 text-purple-700 border-purple-200">
        커스텀
      </Badge>
    );
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("bg-purple-100");
    expect(cls).toContain("text-purple-700");
  });
});

describe("Badge · onClick", () => {
  it("onClick · cursor-pointer + role=button", () => {
    const onClick = vi.fn();
    const { container } = render(<Badge onClick={onClick}>클릭</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("cursor-pointer");
    expect(el.getAttribute("role")).toBe("button");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Badge · title (툴팁)", () => {
  it("title prop · HTML title attribute", () => {
    const { container } = render(<Badge title="툴팁 텍스트">배지</Badge>);
    expect(container.firstElementChild!.getAttribute("title")).toBe("툴팁 텍스트");
  });
});
