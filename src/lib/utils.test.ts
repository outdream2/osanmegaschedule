// 2026-08-19 · utils · cn · tailwind-merge + clsx
import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn · tailwind-merge + clsx", () => {
  it("단순 문자열 병합", () => {
    expect(cn("p-4", "text-red-500")).toBe("p-4 text-red-500");
  });

  it("undefined/null/false · 제외", () => {
    expect(cn("p-4", undefined, null, false, "text-blue")).toBe("p-4 text-blue");
  });

  it("배열 · 병합", () => {
    expect(cn(["p-4", "m-2"])).toBe("p-4 m-2");
  });

  it("객체 · truthy 키만", () => {
    expect(cn({ "text-red": true, "text-blue": false, "p-4": true })).toBe("text-red p-4");
  });

  it("Tailwind 충돌 · 뒤 값 우선 (twMerge)", () => {
    expect(cn("p-4", "p-6")).toBe("p-6");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("중복 없는 클래스 · 그대로", () => {
    expect(cn("flex items-center gap-2")).toBe("flex items-center gap-2");
  });

  it("빈 입력 · 빈 문자열", () => {
    expect(cn()).toBe("");
  });

  it("혼합 · 문자열/배열/객체", () => {
    const cls = cn("p-4", ["m-2"], { rounded: true });
    expect(cls).toContain("p-4");
    expect(cls).toContain("m-2");
    expect(cls).toContain("rounded");
  });

  it("조건부 클래스", () => {
    const active = true;
    const disabled = false;
    expect(cn(active && "bg-blue", disabled && "bg-gray")).toBe("bg-blue");
  });
});
