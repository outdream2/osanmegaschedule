// 2026-08-20 · constants/index · DEFAULT_SCHEDULE_TYPES · COLOR_PRESETS · helpers
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCHEDULE_TYPES,
  COLOR_PRESETS,
  findPresetByBg,
  derivePresetTones,
  SCHEDULE_TYPES,
  SCHEDULE_COLORS,
  DEFAULT_COLOR,
  SCHEDULE_HEX_COLORS,
  getTypeHex,
  isLightHex,
} from "./index";

describe("DEFAULT_SCHEDULE_TYPES", () => {
  it("9개 기본 타입", () => {
    expect(DEFAULT_SCHEDULE_TYPES).toHaveLength(9);
  });

  it("각 항목 · type + color 존재", () => {
    DEFAULT_SCHEDULE_TYPES.forEach((e) => {
      expect(e.type).toBeTruthy();
      expect(e.color).toMatch(/^#[a-f0-9]{6}$/i);
    });
  });

  it("오픈/미들/마감/오픈마감/오전반차/오후반차/휴무/월차/결근 포함", () => {
    const types = DEFAULT_SCHEDULE_TYPES.map(e => e.type);
    expect(types).toContain("오픈");
    expect(types).toContain("미들");
    expect(types).toContain("마감");
    expect(types).toContain("월차");
  });
});

describe("COLOR_PRESETS", () => {
  it("11 개 프리셋", () => {
    expect(COLOR_PRESETS).toHaveLength(11);
  });

  it("각 프리셋 · label/bg/chip/text/dot 모두 존재", () => {
    COLOR_PRESETS.forEach((p) => {
      expect(p.label).toBeTruthy();
      expect(p.bg).toMatch(/^#[a-f0-9]{6}$/i);
      expect(p.chip).toMatch(/^#[a-f0-9]{6}$/i);
      expect(p.text).toMatch(/^#[a-f0-9]{6}$/i);
      expect(p.dot).toMatch(/^#[a-f0-9]{6}$/i);
    });
  });

  it("한국어 라벨 · 파랑/인디고/하늘/초록 등", () => {
    const labels = COLOR_PRESETS.map(p => p.label);
    expect(labels).toContain("파랑");
    expect(labels).toContain("빨강");
    expect(labels).toContain("보라");
  });
});

describe("findPresetByBg", () => {
  it("정확 매칭 · preset 반환", () => {
    const preset = findPresetByBg("#dbeafe");
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe("파랑");
  });

  it("대소문자 무관", () => {
    const preset = findPresetByBg("#DBEAFE");
    expect(preset).not.toBeNull();
  });

  it("공백 · trim 후 매칭", () => {
    const preset = findPresetByBg("  #dbeafe  ");
    expect(preset).not.toBeNull();
  });

  it("매칭 안 됨 · null", () => {
    expect(findPresetByBg("#000000")).toBeNull();
    expect(findPresetByBg("#ffffff")).toBeNull();
  });
});

describe("derivePresetTones", () => {
  it("preset 매칭 · preset 그대로 반환", () => {
    const tones = derivePresetTones("#dbeafe");
    expect(tones.bg).toBe("#dbeafe");
    expect(tones.chip).toBe("#bfdbfe");
    expect(tones.text).toBe("#1e3a8a");
    expect(tones.dot).toBe("#60a5fa");
  });

  it("preset 없음 · fallback · 밝은 배경 · 어두운 텍스트", () => {
    const tones = derivePresetTones("#ffffff");
    expect(tones.bg).toBe("#ffffff");
    expect(tones.text).toBe("#0f172a");
  });

  it("preset 없음 · 어두운 배경 · 밝은 텍스트", () => {
    const tones = derivePresetTones("#000000");
    expect(tones.text).toBe("#f8fafc");
  });
});

describe("SCHEDULE_TYPES · value+label", () => {
  it("DEFAULT_SCHEDULE_TYPES 와 개수 동일", () => {
    expect(SCHEDULE_TYPES).toHaveLength(DEFAULT_SCHEDULE_TYPES.length);
  });

  it("각 항목 · value === label", () => {
    SCHEDULE_TYPES.forEach((s) => {
      expect(s.value).toBe(s.label);
    });
  });
});

describe("SCHEDULE_COLORS · Tailwind 클래스", () => {
  it("오픈/미들/마감/휴무/월차/오전반차/오후반차 정의", () => {
    ["오픈", "미들", "마감", "휴무", "월차", "오전반차", "오후반차"].forEach((t) => {
      expect(SCHEDULE_COLORS[t]).toBeDefined();
      expect(SCHEDULE_COLORS[t].bg).toContain("bg-");
      expect(SCHEDULE_COLORS[t].text).toContain("text-");
      expect(SCHEDULE_COLORS[t].border).toContain("border-");
    });
  });
});

describe("DEFAULT_COLOR", () => {
  it("기본 · 미지정 · zinc 톤", () => {
    expect(DEFAULT_COLOR.label).toBe("미지정");
    expect(DEFAULT_COLOR.bg).toContain("zinc");
    expect(DEFAULT_COLOR.text).toContain("zinc");
  });
});

describe("SCHEDULE_HEX_COLORS", () => {
  it("DEFAULT_SCHEDULE_TYPES 의 type → color 매핑", () => {
    DEFAULT_SCHEDULE_TYPES.forEach((e) => {
      if (e.color) expect(SCHEDULE_HEX_COLORS[e.type]).toBe(e.color);
    });
  });
});

describe("getTypeHex", () => {
  it("entries 지정 · 커스텀 색상 우선", () => {
    const entries = [{ type: "오픈", hours: "", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#ff0000" }];
    expect(getTypeHex("오픈", entries)).toBe("#ff0000");
  });

  it("entries 없음 · SCHEDULE_HEX_COLORS 사용", () => {
    expect(getTypeHex("오픈")).toBe("#dbeafe");
  });

  it("매핑 없는 type · fallback #f1f5f9", () => {
    expect(getTypeHex("존재안함")).toBe("#f1f5f9");
  });
});

describe("isLightHex", () => {
  it("흰색 · true", () => {
    expect(isLightHex("#ffffff")).toBe(true);
  });

  it("검정 · false", () => {
    expect(isLightHex("#000000")).toBe(false);
  });

  it("라이트 파스텔 · true (#dbeafe)", () => {
    expect(isLightHex("#dbeafe")).toBe(true);
  });

  it("다크 네이비 · false (#1e3a8a)", () => {
    expect(isLightHex("#1e3a8a")).toBe(false);
  });

  it("# 없어도 처리", () => {
    expect(isLightHex("ffffff")).toBe(true);
  });
});
