// 2026-08-19 · urlSafe · XSS·프로토콜 어택 방어 화이트리스트
import { describe, it, expect } from "vitest";
import { safeUrl, safeLinkUrl } from "./urlSafe";

describe("safeUrl · 통합 (http/https + data:image + 상대 경로)", () => {
  it("https:// 허용", () => {
    expect(safeUrl("https://example.com/x.png")).toBe("https://example.com/x.png");
  });

  it("http:// 허용", () => {
    expect(safeUrl("http://example.com/x")).toBe("http://example.com/x");
  });

  it("HTTPS · 대소문자 무관", () => {
    expect(safeUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
  });

  it("data:image/png;base64 허용", () => {
    const url = "data:image/png;base64,iVBORw0KGgo=";
    expect(safeUrl(url)).toBe(url);
  });

  it("data:image/jpeg;base64 허용", () => {
    const url = "data:image/jpeg;base64,/9j/4AAQ";
    expect(safeUrl(url)).toBe(url);
  });

  it("data:image/svg+xml;base64 허용 (special char in type)", () => {
    const url = "data:image/svg+xml;base64,PHN2Zw==";
    expect(safeUrl(url)).toBe(url);
  });

  it("앞 슬래시 상대 경로 허용", () => {
    expect(safeUrl("/api/x")).toBe("/api/x");
    expect(safeUrl("/logo.png")).toBe("/logo.png");
  });

  it("./ 상대 경로 허용", () => {
    expect(safeUrl("./img.png")).toBe("./img.png");
  });

  it("javascript: 차단 · fallback", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("javascript:alert(1)", "/default")).toBe("/default");
  });

  it("vbscript: 차단", () => {
    expect(safeUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("file: 차단", () => {
    expect(safeUrl("file:///etc/passwd")).toBe("");
  });

  it("about:blank 차단", () => {
    expect(safeUrl("about:blank")).toBe("");
  });

  it("blob: 차단", () => {
    expect(safeUrl("blob:https://a.com/x")).toBe("");
  });

  it("ftp: 차단", () => {
    expect(safeUrl("ftp://x.com/f")).toBe("");
  });

  it("data:text/html;base64 차단 (image 만 허용)", () => {
    expect(safeUrl("data:text/html;base64,PGh0bWw=")).toBe("");
  });

  it("data:image · base64 없으면 차단", () => {
    expect(safeUrl("data:image/png,plain")).toBe("");
  });

  it("string 아님 · fallback", () => {
    expect(safeUrl(null)).toBe("");
    expect(safeUrl(undefined)).toBe("");
    expect(safeUrl(123)).toBe("");
    expect(safeUrl({})).toBe("");
  });

  it("빈 문자열 · fallback", () => {
    expect(safeUrl("")).toBe("");
    expect(safeUrl("   ")).toBe("");
  });

  it("앞뒤 공백 · trim 후 검증", () => {
    expect(safeUrl("  https://x.com  ")).toBe("https://x.com");
  });

  it("fallback 커스텀", () => {
    expect(safeUrl("javascript:x", "/safe")).toBe("/safe");
  });
});

describe("safeLinkUrl · 링크 전용 (data: 제외)", () => {
  it("https:// 허용", () => {
    expect(safeLinkUrl("https://example.com")).toBe("https://example.com");
  });

  it("http:// 허용", () => {
    expect(safeLinkUrl("http://example.com")).toBe("http://example.com");
  });

  it("상대 경로 허용", () => {
    expect(safeLinkUrl("/api/x")).toBe("/api/x");
    expect(safeLinkUrl("./page")).toBe("./page");
  });

  it("data:image · 링크에서는 차단 (data 제외)", () => {
    expect(safeLinkUrl("data:image/png;base64,xxx")).toBe("");
  });

  it("javascript: · 차단", () => {
    expect(safeLinkUrl("javascript:alert(1)")).toBe("");
  });

  it("string 아님 · fallback", () => {
    expect(safeLinkUrl(null)).toBe("");
  });

  it("fallback 커스텀", () => {
    expect(safeLinkUrl("javascript:", "/home")).toBe("/home");
  });
});
