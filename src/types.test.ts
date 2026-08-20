// 2026-08-20 · types · DEFAULT_* 상수 · formatBrandDisplay
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_COMPANY_INFO,
  DEFAULT_PAYMENT_DAY_TEXT,
  DEFAULT_BRAND_IDENTITY,
  DEFAULT_CONTACT_INFO,
  DEFAULT_STAMPS_MAP,
  DEFAULT_MOBILE_VISIBILITY,
  DEFAULT_MOBILE_MIN_LEVEL,
  formatBrandDisplay,
} from "./types";

describe("DEFAULT_PERMISSIONS", () => {
  it("기본 페이지 · 정의됨", () => {
    expect(DEFAULT_PERMISSIONS.schedule).toEqual({ read: 1, write: 1 });
    expect(DEFAULT_PERMISSIONS.display).toEqual({ read: 2, write: 2 });
    expect(DEFAULT_PERMISSIONS.pharmacist).toEqual({ read: 3, write: 8 });
  });

  it("관리자 전용 · lv 9 잠금", () => {
    expect(DEFAULT_PERMISSIONS.permissions).toEqual({ read: 9, write: 9 });
    expect(DEFAULT_PERMISSIONS.branding).toEqual({ read: 9, write: 9 });
    expect(DEFAULT_PERMISSIONS["company-info"]).toEqual({ read: 9, write: 9 });
    expect(DEFAULT_PERMISSIONS["season-settings"]).toEqual({ read: 9, write: 9 });
  });

  it("모든 페이지 · read/write 존재 · 0~9 범위", () => {
    for (const [key, perm] of Object.entries(DEFAULT_PERMISSIONS)) {
      if (typeof perm !== "object" || !perm) continue;
      const p = perm as { read: number; write: number };
      expect(typeof p.read).toBe("number");
      expect(typeof p.write).toBe("number");
      expect(p.read).toBeGreaterThanOrEqual(0);
      expect(p.read).toBeLessThanOrEqual(9);
      expect(p.write).toBeGreaterThanOrEqual(0);
      expect(p.write).toBeLessThanOrEqual(9);
    }
  });
});

describe("DEFAULT_COMPANY_INFO", () => {
  it("사업장 이름·주소·대표", () => {
    expect(DEFAULT_COMPANY_INFO.name).toBe("오산 메가타운 약국");
    expect(DEFAULT_COMPANY_INFO.address).toContain("오산");
    expect(DEFAULT_COMPANY_INFO.representativeName).toBe("강남성");
  });

  it("regNo · 빈 문자열 (사용자 편집 필수)", () => {
    expect(DEFAULT_COMPANY_INFO.regNo).toBe("");
  });
});

describe("DEFAULT_PAYMENT_DAY_TEXT", () => {
  it("당월 · 통장 · 지급 표현 포함", () => {
    expect(DEFAULT_PAYMENT_DAY_TEXT).toContain("당월");
    expect(DEFAULT_PAYMENT_DAY_TEXT).toContain("통장");
    expect(DEFAULT_PAYMENT_DAY_TEXT).toContain("지급");
  });
});

describe("DEFAULT_BRAND_IDENTITY", () => {
  it("region·shortName·brandNameEn 정의", () => {
    expect(DEFAULT_BRAND_IDENTITY.region).toBe("오산");
    expect(DEFAULT_BRAND_IDENTITY.shortName).toContain("메가타운");
    expect(DEFAULT_BRAND_IDENTITY.brandNameEn).toBe("OSAN MEGATOWN");
    expect(DEFAULT_BRAND_IDENTITY.brandAccentWord).toBe("MEGATOWN");
  });
});

describe("formatBrandDisplay", () => {
  it("region 있음 · 'region\\nshortName' 2줄", () => {
    const s = formatBrandDisplay({ region: "오산", shortName: "메가타운" });
    expect(s).toBe("오산\n메가타운");
  });

  it("region 없음 · shortName 만", () => {
    expect(formatBrandDisplay({ region: undefined, shortName: "메가타운" })).toBe("메가타운");
    expect(formatBrandDisplay({ shortName: "메가타운" } as any)).toBe("메가타운");
  });

  it("region · 공백만 · trim 후 빈 → shortName 만", () => {
    expect(formatBrandDisplay({ region: "   ", shortName: "메가" })).toBe("메가");
  });

  it("region · 앞뒤 공백 · trim", () => {
    expect(formatBrandDisplay({ region: "  오산  ", shortName: "메가" })).toBe("오산\n메가");
  });
});

describe("DEFAULT_CONTACT_INFO", () => {
  it("businessHours · '09:00 - 22:00'", () => {
    expect(DEFAULT_CONTACT_INFO.businessHours).toBe("09:00 - 22:00");
  });

  it("copyrightText · (주)이룸즈(IRUMS)", () => {
    expect(DEFAULT_CONTACT_INFO.copyrightText).toContain("이룸즈");
  });

  it("kakaoChannelUrl · pf.kakao.com", () => {
    expect(DEFAULT_CONTACT_INFO.kakaoChannelUrl).toContain("pf.kakao.com");
  });
});

describe("DEFAULT_STAMPS_MAP", () => {
  it("2개 · 강남성·강남규", () => {
    expect(DEFAULT_STAMPS_MAP).toHaveLength(2);
    expect(DEFAULT_STAMPS_MAP[0].name).toBe("강남성");
    expect(DEFAULT_STAMPS_MAP[1].name).toBe("강남규");
  });

  it("bundledFallback · sungstamp/kyustamp", () => {
    expect(DEFAULT_STAMPS_MAP[0].bundledFallback).toBe("sungstamp");
    expect(DEFAULT_STAMPS_MAP[1].bundledFallback).toBe("kyustamp");
  });
});

describe("DEFAULT_MOBILE_VISIBILITY / DEFAULT_MOBILE_MIN_LEVEL", () => {
  it("MOBILE_VISIBILITY · 빈 객체 (기본 허용)", () => {
    expect(DEFAULT_MOBILE_VISIBILITY).toEqual({});
  });

  it("MOBILE_MIN_LEVEL · 빈 객체 (모두 허용)", () => {
    expect(DEFAULT_MOBILE_MIN_LEVEL).toEqual({});
  });
});
