// 2026-08-20 · systemConfig · SUPPORTED_KEYS 화이트리스트 검증
import { describe, it, expect } from "vitest";
import { SUPPORTED_KEYS } from "./systemConfig";

describe("SUPPORTED_KEYS · 편집 화이트리스트", () => {
  it("배열 · 20개 이상", () => {
    expect(Array.isArray(SUPPORTED_KEYS)).toBe(true);
    expect(SUPPORTED_KEYS.length).toBeGreaterThanOrEqual(20);
  });

  it("중복 없음", () => {
    const set = new Set(SUPPORTED_KEYS);
    expect(set.size).toBe(SUPPORTED_KEYS.length);
  });

  it("필수 DB/Auth 키 포함", () => {
    expect(SUPPORTED_KEYS).toContain("SUPABASE_URL");
    expect(SUPPORTED_KEYS).toContain("SUPABASE_KEY");
    expect(SUPPORTED_KEYS).toContain("JWT_SECRET");
  });

  it("AI/OCR 키 포함", () => {
    expect(SUPPORTED_KEYS).toContain("GEMINI_API_KEY");
    expect(SUPPORTED_KEYS).toContain("GEMINI_API_KEYS");
  });

  it("SMS/알림톡 키 포함", () => {
    expect(SUPPORTED_KEYS).toContain("SOLAPI_API_KEY");
    expect(SUPPORTED_KEYS).toContain("SOLAPI_API_SECRET");
    expect(SUPPORTED_KEYS).toContain("SOLAPI_SENDER");
    expect(SUPPORTED_KEYS).toContain("KAKAO_TOKEN");
    expect(SUPPORTED_KEYS).toContain("KAKAO_PFID");
  });

  it("Cloudinary 3종 포함", () => {
    expect(SUPPORTED_KEYS).toContain("CLOUDINARY_CLOUD_NAME");
    expect(SUPPORTED_KEYS).toContain("CLOUDINARY_API_KEY");
    expect(SUPPORTED_KEYS).toContain("CLOUDINARY_API_SECRET");
  });

  it("Web Push 3종 포함", () => {
    expect(SUPPORTED_KEYS).toContain("WEB_PUSH_VAPID_PUBLIC");
    expect(SUPPORTED_KEYS).toContain("WEB_PUSH_VAPID_PRIVATE");
    expect(SUPPORTED_KEYS).toContain("WEB_PUSH_SUBJECT");
  });

  it("OCR 수신처 프레임워크 키 포함", () => {
    expect(SUPPORTED_KEYS).toContain("OCR_RECIPIENT_COMPANY");
    expect(SUPPORTED_KEYS).toContain("OCR_RECIPIENT_NAMES");
    expect(SUPPORTED_KEYS).toContain("OCR_EXCLUDED_LOGISTICS");
  });

  it("모든 키 · 대문자 스네이크케이스", () => {
    SUPPORTED_KEYS.forEach((k) => {
      expect(k).toMatch(/^[A-Z][A-Z0-9_]*$/);
    });
  });
});
