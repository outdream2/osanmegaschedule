// 2026-08-20 · tenantConfig · isSensitive · maskValue · 파일 IO는 통합 테스트 대상
import { describe, it, expect } from "vitest";
import { isSensitive, maskValue } from "./tenantConfig";

describe("isSensitive · 민감 키 판정", () => {
  it("SUPABASE_KEY · true", () => {
    expect(isSensitive("SUPABASE_KEY")).toBe(true);
  });

  it("JWT_SECRET · true", () => {
    expect(isSensitive("JWT_SECRET")).toBe(true);
  });

  it("GEMINI_API_KEY / GEMINI_API_KEYS · true", () => {
    expect(isSensitive("GEMINI_API_KEY")).toBe(true);
    expect(isSensitive("GEMINI_API_KEYS")).toBe(true);
  });

  it("SOLAPI_API_KEY / SECRET · true", () => {
    expect(isSensitive("SOLAPI_API_KEY")).toBe(true);
    expect(isSensitive("SOLAPI_API_SECRET")).toBe(true);
  });

  it("CLOUDINARY_API_KEY / SECRET · true", () => {
    expect(isSensitive("CLOUDINARY_API_KEY")).toBe(true);
    expect(isSensitive("CLOUDINARY_API_SECRET")).toBe(true);
  });

  it("WEB_PUSH_VAPID_PRIVATE · true", () => {
    expect(isSensitive("WEB_PUSH_VAPID_PRIVATE")).toBe(true);
  });

  it("KAKAO_TOKEN · true", () => {
    expect(isSensitive("KAKAO_TOKEN")).toBe(true);
  });

  it("SUPABASE_URL (비민감) · false", () => {
    expect(isSensitive("SUPABASE_URL")).toBe(false);
  });

  it("VAPID_PUBLIC_KEY (공개키) · false", () => {
    expect(isSensitive("VAPID_PUBLIC_KEY")).toBe(false);
  });

  it("대소문자 무관 · toUpperCase 후 판정", () => {
    expect(isSensitive("supabase_key")).toBe(true);
    expect(isSensitive("Jwt_Secret")).toBe(true);
  });

  it("존재하지 않는 키 · false", () => {
    expect(isSensitive("SOMETHING_ELSE")).toBe(false);
  });
});

describe("maskValue · 마스킹", () => {
  it("빈 값 · 빈 문자열", () => {
    expect(maskValue("")).toBe("");
  });

  it("4자 이하 · '****'", () => {
    expect(maskValue("a")).toBe("****");
    expect(maskValue("abc")).toBe("****");
    expect(maskValue("abcd")).toBe("****");
  });

  it("5자 이상 · '****' + 마지막 4자", () => {
    expect(maskValue("abcde")).toBe("****bcde");
    expect(maskValue("1234567890")).toBe("****7890");
  });

  it("긴 API 키 · 마지막 4자만 노출", () => {
    const key = "sk-1234567890abcdefghijklmnop";
    expect(maskValue(key)).toBe("****mnop");
  });
});
