// 2026-08-20 · pharmacistMenuItems · 순수 유틸 검증
//   원본 파일: server/routes/board/pharmacistMenuItems.ts
//   ALLOWED_TABS · safeFilename · parseDataUrl · safePublicIdPart · resourceTypeFromMime
//   module-scoped · 로직 사본 검증 (source 파일 변경 없음)
import { describe, it, expect } from "vitest";

// ── 원본 로직 사본 (server/routes/board/pharmacistMenuItems.ts) ─────

const ALLOWED_TABS = new Set(["education", "reference", "video", "docs"]);

function safeFilename(name: string, maxLen = 80): string {
  const trimmed = String(name ?? "").trim() || "material";
  const cleaned = trimmed.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_");
  return cleaned.slice(0, maxLen);
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { mime, buffer };
}

function safePublicIdPart(s: string, maxLen = 40): string {
  const cleaned = String(s ?? "").replace(/[^A-Za-z0-9_-]+/g, "_");
  return cleaned.slice(0, maxLen) || "x";
}

function resourceTypeFromMime(mime: string | null | undefined): "image" | "video" | "raw" {
  const m = String(mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "raw";
}

// ─── tests ───────────────────────────────────────────────────────────

describe("ALLOWED_TABS", () => {
  it("4개 탭", () => {
    expect(ALLOWED_TABS.size).toBe(4);
  });

  it("education · reference · video · docs 모두 포함", () => {
    expect(ALLOWED_TABS.has("education")).toBe(true);
    expect(ALLOWED_TABS.has("reference")).toBe(true);
    expect(ALLOWED_TABS.has("video")).toBe(true);
    expect(ALLOWED_TABS.has("docs")).toBe(true);
  });

  it("알 수 없는 탭 · false", () => {
    expect(ALLOWED_TABS.has("news")).toBe(false);
    expect(ALLOWED_TABS.has("")).toBe(false);
  });
});

describe("safeFilename", () => {
  it("일반 파일명 · 그대로", () => {
    expect(safeFilename("report.pdf")).toBe("report.pdf");
  });

  it("빈 이름 · material default", () => {
    expect(safeFilename("")).toBe("material");
    expect(safeFilename("   ")).toBe("material");
  });

  it("Windows 금지 문자 제거", () => {
    expect(safeFilename('bad\\name/with:*?"<>|.pdf')).toBe("bad_name_with_.pdf");
  });

  it("연속 금지 문자 · 하나의 _", () => {
    expect(safeFilename("a\\\\/:b")).toBe("a_b");
  });

  it("제어문자 (0x00-0x1f) · _ 치환", () => {
    expect(safeFilename("a\x00b\x1fc")).toBe("a_b_c");
  });

  it("연속 제어문자 · 하나의 _", () => {
    expect(safeFilename("a\x00\x01\x02b")).toBe("a_b");
  });

  it("maxLen · 자름 (기본 80)", () => {
    const long = "x".repeat(200);
    expect(safeFilename(long).length).toBe(80);
  });

  it("maxLen · 커스텀 10", () => {
    expect(safeFilename("abcdefghijklmno", 10).length).toBe(10);
  });

  it("한글 이름 유지", () => {
    expect(safeFilename("의약품_안내.pdf")).toBe("의약품_안내.pdf");
  });
});

describe("parseDataUrl · 정상", () => {
  it("PNG base64 · 파싱 성공", () => {
    const data = "data:image/png;base64,iVBORw0KGgo=";
    const r = parseDataUrl(data);
    expect(r).not.toBe(null);
    expect(r!.mime).toBe("image/png");
    expect(Buffer.isBuffer(r!.buffer)).toBe(true);
    expect(r!.buffer.length).toBeGreaterThan(0);
  });

  it("PDF base64 · 파싱 성공", () => {
    const data = "data:application/pdf;base64,JVBERi0=";
    const r = parseDataUrl(data);
    expect(r).not.toBe(null);
    expect(r!.mime).toBe("application/pdf");
  });

  it("JPEG · mime 정확", () => {
    const r = parseDataUrl("data:image/jpeg;base64,/9j/4AAQ=");
    expect(r?.mime).toBe("image/jpeg");
  });
});

describe("parseDataUrl · 실패", () => {
  it("빈 문자열 · null", () => expect(parseDataUrl("")).toBe(null));
  it("null · null", () => expect(parseDataUrl(null as any)).toBe(null));
  it("undefined · null", () => expect(parseDataUrl(undefined as any)).toBe(null));
  it("data: 접두어 없음 · null", () => {
    expect(parseDataUrl("http://example.com/x.png")).toBe(null);
  });
  it("base64 표기 없음 · null", () => {
    expect(parseDataUrl("data:image/png,iVBORw0=")).toBe(null);
  });
  it("객체 전달 · null", () => {
    expect(parseDataUrl({ foo: 1 } as any)).toBe(null);
  });
});

describe("safePublicIdPart", () => {
  it("영숫자 · 그대로", () => {
    expect(safePublicIdPart("abc123")).toBe("abc123");
  });

  it("허용 문자 (_ · -) · 유지", () => {
    expect(safePublicIdPart("a_b-c")).toBe("a_b-c");
  });

  it("공백·특수문자 · _ 로 치환", () => {
    expect(safePublicIdPart("hello world!")).toBe("hello_world_");
  });

  it("한글·기호 → _", () => {
    expect(safePublicIdPart("타이레놀 500mg")).toBe("_500mg");
  });

  it("빈 문자열 · x fallback", () => {
    expect(safePublicIdPart("")).toBe("x");
  });

  it("특수문자만 · _ fallback", () => {
    expect(safePublicIdPart("!!!")).toBe("_");
  });

  it("maxLen · 자름 (기본 40)", () => {
    const long = "a".repeat(100);
    expect(safePublicIdPart(long).length).toBe(40);
  });

  it("maxLen · 커스텀 5", () => {
    expect(safePublicIdPart("abcdefghij", 5).length).toBe(5);
  });
});

describe("resourceTypeFromMime", () => {
  it("image/* · image", () => {
    expect(resourceTypeFromMime("image/png")).toBe("image");
    expect(resourceTypeFromMime("image/jpeg")).toBe("image");
    expect(resourceTypeFromMime("image/webp")).toBe("image");
  });

  it("video/* · video", () => {
    expect(resourceTypeFromMime("video/mp4")).toBe("video");
    expect(resourceTypeFromMime("video/webm")).toBe("video");
  });

  it("문서/기타 · raw", () => {
    expect(resourceTypeFromMime("application/pdf")).toBe("raw");
    expect(resourceTypeFromMime("application/vnd.ms-excel")).toBe("raw");
    expect(resourceTypeFromMime("text/plain")).toBe("raw");
    expect(resourceTypeFromMime("application/zip")).toBe("raw");
  });

  it("null/undefined · raw", () => {
    expect(resourceTypeFromMime(null)).toBe("raw");
    expect(resourceTypeFromMime(undefined)).toBe("raw");
    expect(resourceTypeFromMime("")).toBe("raw");
  });

  it("대문자 mime · 소문자 처리", () => {
    expect(resourceTypeFromMime("IMAGE/PNG")).toBe("image");
    expect(resourceTypeFromMime("Video/MP4")).toBe("video");
  });
});
