// @vitest-environment jsdom
// 2026-08-29 · #122 Phase 1 · SectionCard 프리미티브 테스트
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

afterEach(() => cleanup());

describe("SectionCard · 프리미티브", () => {
  it("title 렌더 + body children 표시", () => {
    const { container } = render(
      <SectionCard title="일반 설정"><div>필드1</div></SectionCard>
    );
    expect(container.textContent).toContain("일반 설정");
    expect(container.textContent).toContain("필드1");
  });

  it("icon · description · actions 슬롯", () => {
    const { container } = render(
      <SectionCard
        title="Title"
        icon={<span data-testid="ico">I</span>}
        description="desc"
        actions={<button>Save</button>}
      >
        <div>body</div>
      </SectionCard>
    );
    expect(container.querySelector('[data-testid="ico"]')).toBeTruthy();
    expect(container.textContent).toContain("desc");
    expect(container.querySelector("button")?.textContent).toBe("Save");
  });

  it("tone='danger' · 아이콘 rose", () => {
    const { container } = render(
      <SectionCard title="위험" tone="danger" icon={<span>D</span>}>
        body
      </SectionCard>
    );
    const iconSpan = Array.from(container.querySelectorAll("span")).find(el => el.className.includes("text-rose-600"));
    expect(iconSpan).toBeTruthy();
  });

  it("bodyPadding='none' · p-0", () => {
    const { container } = render(
      <SectionCard title="T" bodyPadding="none">body</SectionCard>
    );
    const bodyDiv = container.querySelector("section > div");
    expect(bodyDiv?.className).toContain("p-0");
  });

  it("bodyPadding 기본 · md · p-[18px]", () => {
    const { container } = render(
      <SectionCard title="T">body</SectionCard>
    );
    const bodyDiv = container.querySelector("section > div");
    expect(bodyDiv?.className).toContain("p-[18px]");
  });

  it("className prop · section 에 병합", () => {
    const { container } = render(
      <SectionCard title="T" className="my-extra">body</SectionCard>
    );
    expect(container.querySelector("section")?.className).toContain("my-extra");
  });
});
