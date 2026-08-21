// 2026-08-20 · settingsTypography · [설정] 페이지 CSS 상수 검증
import { describe, it, expect } from "vitest";
import {
  SET_SECTION_TITLE,
  SET_SECTION_ICON,
  SET_SECTION_DESC,
  SET_LABEL,
  SET_INPUT,
  SET_INPUT_STRONG,
  SET_TEXTAREA,
  SET_HINT,
  SET_ERROR,
  SET_BADGE,
  SET_INFO_BADGE,
  SET_BTN_PRIMARY,
  SET_BTN_SECONDARY,
  SET_BTN_DANGER,
  SET_ACTION_BAR,
  SET_NOTICE_AMBER,
  SET_NOTICE_INDIGO,
  SET_NOTICE_ROSE,
  SET_NOTICE_EMERALD,
} from "./settingsTypography";

describe("SET_SECTION_TITLE", () => {
  it("text-[15px] · font-bold · text-zinc-800", () => {
    expect(SET_SECTION_TITLE).toContain("text-[15px]");
    expect(SET_SECTION_TITLE).toContain("font-bold");
    expect(SET_SECTION_TITLE).toContain("text-zinc-800");
  });
});

describe("SET_SECTION_DESC", () => {
  it("text-[11px] · text-zinc-500 · mt-1 leading-relaxed", () => {
    expect(SET_SECTION_DESC).toContain("text-[11px]");
    expect(SET_SECTION_DESC).toContain("text-zinc-500");
    expect(SET_SECTION_DESC).toContain("mt-1");
    expect(SET_SECTION_DESC).toContain("leading-relaxed");
  });
});

describe("SET_LABEL · 폼 라벨", () => {
  it("text-[10px] · font-bold · uppercase · tracking-wider", () => {
    expect(SET_LABEL).toContain("text-[10px]");
    expect(SET_LABEL).toContain("font-bold");
    expect(SET_LABEL).toContain("uppercase");
    expect(SET_LABEL).toContain("tracking-wider");
  });
});

describe("SET_INPUT · 폼 입력", () => {
  it("border · rounded-lg · focus:border-brand-deep · text-[13px]", () => {
    expect(SET_INPUT).toContain("border");
    expect(SET_INPUT).toContain("rounded-lg");
    expect(SET_INPUT).toContain("focus:border-brand-deep");
    expect(SET_INPUT).toContain("text-[13px]");
  });

  it("focus:ring-2 focus:ring-brand-tint", () => {
    expect(SET_INPUT).toContain("focus:ring-2");
    expect(SET_INPUT).toContain("focus:ring-brand-tint");
  });

  it("disabled:opacity-50", () => {
    expect(SET_INPUT).toContain("disabled:opacity-50");
  });
});

describe("SET_INPUT_STRONG · 강조 폼 입력", () => {
  it("font-semibold 추가", () => {
    expect(SET_INPUT_STRONG).toContain("font-semibold");
    expect(SET_INPUT_STRONG).toContain("text-[13px]");
  });
});

describe("SET_TEXTAREA", () => {
  it("resize-none", () => {
    expect(SET_TEXTAREA).toContain("resize-none");
    expect(SET_TEXTAREA).toContain("text-[13px]");
  });
});

describe("SET_HINT · SET_ERROR", () => {
  it("HINT · text-[10px] · text-zinc-400 · mt-1", () => {
    expect(SET_HINT).toContain("text-[10px]");
    expect(SET_HINT).toContain("text-zinc-400");
    expect(SET_HINT).toContain("mt-1");
  });

  it("ERROR · text-[10px] · text-rose-500 · font-semibold", () => {
    expect(SET_ERROR).toContain("text-[10px]");
    expect(SET_ERROR).toContain("text-rose-500");
    expect(SET_ERROR).toContain("font-semibold");
  });
});

describe("SET_BADGE · SET_INFO_BADGE", () => {
  it("SET_BADGE · rounded-full · border · text-[10px]", () => {
    expect(SET_BADGE).toContain("rounded-full");
    expect(SET_BADGE).toContain("border");
    expect(SET_BADGE).toContain("text-[10px]");
  });

  it("SET_INFO_BADGE · rounded-md · text-[11px]", () => {
    expect(SET_INFO_BADGE).toContain("rounded-md");
    expect(SET_INFO_BADGE).toContain("text-[11px]");
  });
});

describe("SET_BTN_* · 버튼", () => {
  it("PRIMARY · brand-deep · text-white · text-[13px]", () => {
    expect(SET_BTN_PRIMARY).toContain("bg-brand-deep");
    expect(SET_BTN_PRIMARY).toContain("text-white");
    expect(SET_BTN_PRIMARY).toContain("text-[13px]");
    expect(SET_BTN_PRIMARY).toContain("cursor-pointer");
  });

  it("SECONDARY · white border · text-[13px]", () => {
    expect(SET_BTN_SECONDARY).toContain("bg-white");
    expect(SET_BTN_SECONDARY).toContain("border");
    expect(SET_BTN_SECONDARY).toContain("text-[13px]");
  });

  it("DANGER · rose", () => {
    expect(SET_BTN_DANGER).toContain("bg-rose-600");
    expect(SET_BTN_DANGER).toContain("text-white");
  });
});

describe("SET_ACTION_BAR · 하단 sticky", () => {
  it("sticky bottom-0 · backdrop-blur", () => {
    expect(SET_ACTION_BAR).toContain("sticky");
    expect(SET_ACTION_BAR).toContain("bottom-0");
    expect(SET_ACTION_BAR).toContain("backdrop-blur");
  });
});

describe("SET_NOTICE_* · 안내 배너 (4가지 톤)", () => {
  it("AMBER · amber-200/50/800", () => {
    expect(SET_NOTICE_AMBER).toContain("border-amber-200");
    expect(SET_NOTICE_AMBER).toContain("bg-amber-50");
    expect(SET_NOTICE_AMBER).toContain("text-amber-800");
  });

  it("INDIGO · indigo-200/50/800", () => {
    expect(SET_NOTICE_INDIGO).toContain("border-indigo-200");
    expect(SET_NOTICE_INDIGO).toContain("bg-indigo-50");
    expect(SET_NOTICE_INDIGO).toContain("text-indigo-800");
  });

  it("ROSE · rose-200/50/700", () => {
    expect(SET_NOTICE_ROSE).toContain("border-rose-200");
    expect(SET_NOTICE_ROSE).toContain("bg-rose-50");
    expect(SET_NOTICE_ROSE).toContain("text-rose-700");
  });

  it("EMERALD · emerald-200/50/700", () => {
    expect(SET_NOTICE_EMERALD).toContain("border-emerald-200");
    expect(SET_NOTICE_EMERALD).toContain("bg-emerald-50");
    expect(SET_NOTICE_EMERALD).toContain("text-emerald-700");
  });
});

describe("SET_SECTION_ICON", () => {
  it("shrink-0", () => {
    expect(SET_SECTION_ICON).toBe("shrink-0");
  });
});
