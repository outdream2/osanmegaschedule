// 2026-08-21 · styles/tokens · 디자인 토큰 상수 검증
//   TEXT · COLOR · BUTTON_* · STATUS_COLOR · STATUS_LABEL 등 UI 통일 상수
//   프레임워크 · 통일 · 회귀 방지 · 모든 컴포넌트가 참조
import { describe, it, expect } from "vitest";
import {
  TEXT,
  COLOR,
  CARD_BASE,
  CARD_HOVER,
  TOOLBAR_BASE,
  INPUT_BASE,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  BUTTON_DANGER,
  BUTTON_SUCCESS,
  BUTTON_GHOST,
  MODAL_BACKDROP,
  MODAL_CONTENT,
  PAGE_WRAPPER,
  KPI_GRID,
  SECTION_TITLE,
  DIVIDER,
  STATUS_COLOR,
  STATUS_LABEL,
} from "./tokens";

describe("TEXT · 타이포그래피 스케일 (8단계)", () => {
  it("8개 크기 + num · 총 9키", () => {
    const keys = Object.keys(TEXT);
    expect(keys.sort()).toEqual(
      ["body", "caption", "hero", "label", "micro", "num", "section", "tab", "title"],
    );
  });

  // 2026-08-31 · Phase A · 스케일 +2 반영 · 17→19 · 13→15 · 9→11
  it("hero · text-[19px] + font-black", () => {
    expect(TEXT.hero).toContain("text-[19px]");
    expect(TEXT.hero).toContain("font-black");
  });

  it("body · text-[15px] + font-semibold", () => {
    expect(TEXT.body).toContain("text-[15px]");
    expect(TEXT.body).toContain("font-semibold");
  });

  it("micro · text-[11px] + uppercase + tracking-widest", () => {
    expect(TEXT.micro).toContain("text-[11px]");
    expect(TEXT.micro).toContain("uppercase");
    expect(TEXT.micro).toContain("tracking-widest");
  });

  it("num · tabular-nums + font-black", () => {
    expect(TEXT.num).toBe("tabular-nums font-black");
  });
});

describe("COLOR · 역할 기반 팔레트 (6팔레트)", () => {
  it("6팔레트 정의 · primary·success·warning·danger·info·neutral", () => {
    expect(Object.keys(COLOR).sort()).toEqual(
      ["danger", "info", "neutral", "primary", "success", "warning"],
    );
  });

  it("각 팔레트 · 7 fields (50/100/500/600/text/border/ring)", () => {
    for (const key of Object.keys(COLOR) as Array<keyof typeof COLOR>) {
      expect(Object.keys(COLOR[key]).sort()).toEqual(
        ["100", "50", "500", "600", "border", "ring", "text"],
      );
    }
  });

  it("primary · indigo 계열", () => {
    expect(COLOR.primary[600]).toBe("bg-indigo-600");
    expect(COLOR.primary.text).toBe("text-indigo-700");
  });

  it("danger · rose 계열", () => {
    expect(COLOR.danger[600]).toBe("bg-rose-600");
    expect(COLOR.danger.border).toBe("border-rose-200");
  });

  it("neutral · zinc 계열 (2025 뉴트럴 · slate → zinc)", () => {
    expect(COLOR.neutral[600]).toBe("bg-zinc-600");
    expect(COLOR.neutral.text).toBe("text-zinc-700");
  });
});

describe("공통 className 조합 상수", () => {
  it("CARD_BASE · bg-white + rounded + border + shadow", () => {
    expect(CARD_BASE).toContain("bg-white");
    expect(CARD_BASE).toContain("rounded-xl");
    expect(CARD_BASE).toContain("border-zinc-200");
    expect(CARD_BASE).toContain("shadow-sm");
  });

  it("CARD_HOVER · hover 상승 + transition", () => {
    expect(CARD_HOVER).toContain("hover:shadow-md");
    expect(CARD_HOVER).toContain("transition-all");
  });

  it("TOOLBAR_BASE · h-8 인라인 배지형", () => {
    expect(TOOLBAR_BASE).toContain("h-8");
    expect(TOOLBAR_BASE).toContain("border-zinc-200");
  });

  it("INPUT_BASE · indigo focus ring", () => {
    expect(INPUT_BASE).toContain("focus:ring-indigo-400/60");
    expect(INPUT_BASE).toContain("placeholder:text-zinc-400");
  });

  it("MODAL_BACKDROP · z-index 9997 + backdrop-blur", () => {
    expect(MODAL_BACKDROP).toContain("z-[9997]");
    expect(MODAL_BACKDROP).toContain("backdrop-blur-sm");
  });

  it("MODAL_CONTENT · 모바일 하단 시트 + 데스크탑 센터", () => {
    expect(MODAL_CONTENT).toContain("max-h-[90vh]");
    expect(MODAL_CONTENT).toContain("sm:rounded-2xl");
    expect(MODAL_CONTENT).toContain("rounded-t-2xl");
  });

  it("PAGE_WRAPPER · max-w 1360 + mx-auto", () => {
    expect(PAGE_WRAPPER).toContain("max-w-[1360px]");
    expect(PAGE_WRAPPER).toContain("mx-auto");
  });

  it("KPI_GRID · 2/3/4/5칸 반응형", () => {
    expect(KPI_GRID).toContain("grid-cols-2");
    expect(KPI_GRID).toContain("sm:grid-cols-3");
    expect(KPI_GRID).toContain("lg:grid-cols-4");
    expect(KPI_GRID).toContain("xl:grid-cols-5");
  });

  it("SECTION_TITLE · uppercase + tracking-wider", () => {
    expect(SECTION_TITLE).toContain("uppercase");
    expect(SECTION_TITLE).toContain("tracking-wider");
  });

  it("DIVIDER · border-t", () => {
    expect(DIVIDER).toBe("border-t border-zinc-100");
  });
});

describe("BUTTON_* · 5개 버튼 스타일 (Linear/Vercel 2025 톤)", () => {
  it("BUTTON_PRIMARY · indigo-600 filled + focus-visible outline", () => {
    expect(BUTTON_PRIMARY).toContain("bg-indigo-600");
    expect(BUTTON_PRIMARY).toContain("text-white");
    expect(BUTTON_PRIMARY).toContain("focus-visible:outline");
    expect(BUTTON_PRIMARY).toContain("disabled:opacity-40");
  });

  it("BUTTON_SECONDARY · white + border-zinc-300 outline", () => {
    expect(BUTTON_SECONDARY).toContain("bg-white");
    expect(BUTTON_SECONDARY).toContain("border-zinc-300");
    expect(BUTTON_SECONDARY).toContain("text-zinc-700");
  });

  it("BUTTON_DANGER · rose-600 filled", () => {
    expect(BUTTON_DANGER).toContain("bg-rose-600");
    expect(BUTTON_DANGER).toContain("text-white");
    expect(BUTTON_DANGER).toContain("hover:bg-rose-700");
  });

  it("BUTTON_SUCCESS · emerald-600 filled", () => {
    expect(BUTTON_SUCCESS).toContain("bg-emerald-600");
    expect(BUTTON_SUCCESS).toContain("text-white");
    expect(BUTTON_SUCCESS).toContain("active:bg-emerald-800");
  });

  it("BUTTON_GHOST · 배경 없음 · hover 시만 bg-zinc-100", () => {
    expect(BUTTON_GHOST).toContain("text-zinc-500");
    expect(BUTTON_GHOST).toContain("hover:bg-zinc-100");
    expect(BUTTON_GHOST).not.toContain("bg-white");
  });

  it("모든 버튼 · focus-visible:outline + disabled:opacity-40 + cursor-pointer", () => {
    const btns = [BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_DANGER, BUTTON_SUCCESS, BUTTON_GHOST];
    btns.forEach(b => {
      expect(b).toContain("focus-visible:outline");
      expect(b).toContain("disabled:opacity-40");
      expect(b).toContain("cursor-pointer");
    });
  });
});

describe("STATUS_COLOR · 상태별 색상 매핑", () => {
  it("8개 상태 키 · pending/prepared/done/success/warning/danger/info/neutral", () => {
    const keys = Object.keys(STATUS_COLOR).sort();
    expect(keys).toEqual(
      ["danger", "done", "info", "neutral", "pending", "prepared", "success", "warning"],
    );
  });

  it("pending · amber", () => {
    expect(STATUS_COLOR.pending.bg).toBe("bg-amber-50");
    expect(STATUS_COLOR.pending.text).toBe("text-amber-700");
    expect(STATUS_COLOR.pending.border).toBe("border-amber-200");
  });

  it("done · emerald (success 와 동일 매핑)", () => {
    expect(STATUS_COLOR.done).toEqual(STATUS_COLOR.success);
  });

  it("warning · amber (pending 과 동일 매핑)", () => {
    expect(STATUS_COLOR.warning).toEqual(STATUS_COLOR.pending);
  });

  it("neutral · zinc (2026 slate → zinc)", () => {
    expect(STATUS_COLOR.neutral.bg).toBe("bg-zinc-50");
    expect(STATUS_COLOR.neutral.text).toBe("text-zinc-600");
  });

  it("각 상태 · bg/text/border 3필드", () => {
    for (const key of Object.keys(STATUS_COLOR) as Array<keyof typeof STATUS_COLOR>) {
      expect(STATUS_COLOR[key]).toHaveProperty("bg");
      expect(STATUS_COLOR[key]).toHaveProperty("text");
      expect(STATUS_COLOR[key]).toHaveProperty("border");
    }
  });
});

describe("STATUS_LABEL · 한국어 라벨", () => {
  it("8개 상태 · STATUS_COLOR 와 키 일치", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(Object.keys(STATUS_COLOR).sort());
  });

  it("한국어 라벨 매핑", () => {
    expect(STATUS_LABEL.pending).toBe("대기");
    expect(STATUS_LABEL.prepared).toBe("준비");
    expect(STATUS_LABEL.done).toBe("완료");
    expect(STATUS_LABEL.success).toBe("성공");
    expect(STATUS_LABEL.warning).toBe("경고");
    expect(STATUS_LABEL.danger).toBe("오류");
    expect(STATUS_LABEL.info).toBe("정보");
    expect(STATUS_LABEL.neutral).toBe("일반");
  });
});
