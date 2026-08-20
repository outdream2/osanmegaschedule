// 2026-08-20 · logsCleanup · 오래된 ocr-*.json 로그 파일 자동 정리
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => {
  const promises = {
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  };
  return {
    default: { promises },
    promises,
  };
});

import fs from "fs";
import { cleanupStaleLogs } from "./logsCleanup";

const mockReaddir = fs.promises.readdir as unknown as ReturnType<typeof vi.fn>;
const mockStat = fs.promises.stat as unknown as ReturnType<typeof vi.fn>;
const mockUnlink = fs.promises.unlink as unknown as ReturnType<typeof vi.fn>;

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockReaddir.mockReset();
  mockStat.mockReset();
  mockUnlink.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cleanupStaleLogs · 정상 흐름", () => {
  it("logs 디렉토리 없음 · readdir 실패 · silent noop", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    await expect(cleanupStaleLogs()).resolves.toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("빈 디렉토리 · 아무것도 하지 않음", async () => {
    mockReaddir.mockResolvedValue([]);
    await cleanupStaleLogs();
    expect(mockStat).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("패턴 매치 안 되는 파일 · skip (readme.txt 등)", async () => {
    mockReaddir.mockResolvedValue(["readme.txt", "app.log", "notes.md"]);
    await cleanupStaleLogs();
    expect(mockStat).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("최근 파일 (< 14일) · 삭제 안 함", async () => {
    mockReaddir.mockResolvedValue(["ocr-2026-08-19T00-00-00.json"]);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - 1000 } as any);
    await cleanupStaleLogs();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("오래된 파일 (> 14일) · unlink 호출", async () => {
    mockReaddir.mockResolvedValue(["ocr-2020-01-01T00-00-00.json"]);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - MAX_AGE_MS - 1000 } as any);
    mockUnlink.mockResolvedValue(undefined);
    await cleanupStaleLogs();
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("stat 실패 · 파일 스킵 · 다른 파일 계속 처리", async () => {
    mockReaddir.mockResolvedValue([
      "ocr-1-old.json",
      "ocr-2-broken.json",
    ]);
    mockStat
      .mockResolvedValueOnce({ mtimeMs: Date.now() - MAX_AGE_MS - 1000 } as any)
      .mockRejectedValueOnce(new Error("EACCES"));
    mockUnlink.mockResolvedValue(undefined);
    await cleanupStaleLogs();
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("여러 오래된 파일 · 모두 삭제 (개수 로그)", async () => {
    mockReaddir.mockResolvedValue([
      "ocr-1-old.json",
      "ocr-2-old.json",
      "ocr-3-old.json",
    ]);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - MAX_AGE_MS - 1000 } as any);
    mockUnlink.mockResolvedValue(undefined);
    await cleanupStaleLogs();
    expect(mockUnlink).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("3개"));
  });

  it("혼합 · 최근 + 오래된 · 오래된 것만 삭제", async () => {
    mockReaddir.mockResolvedValue(["ocr-1-old.json", "ocr-2-new.json"]);
    // 두 파일 모두 stat 호출됨 · 첫 번째만 오래된 것으로 응답
    mockStat.mockImplementation((async (p: string) => {
      const old = p.includes("ocr-1-old");
      return { mtimeMs: old ? Date.now() - MAX_AGE_MS - 1000 : Date.now() - 1000 } as any;
    }) as any);
    mockUnlink.mockResolvedValue(undefined);
    await cleanupStaleLogs();
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });

  it("unlink 실패 · silent · throw 안 함", async () => {
    mockReaddir.mockResolvedValue(["ocr-1-old.json"]);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - MAX_AGE_MS - 1000 } as any);
    mockUnlink.mockRejectedValue(new Error("EBUSY"));
    await expect(cleanupStaleLogs()).resolves.toBeUndefined();
  });
});

describe("cleanupStaleLogs · 패턴 검증", () => {
  it("ocr- 접두어 + 숫자 만 매치 (ocr-abc.json 은 skip)", async () => {
    mockReaddir.mockResolvedValue([
      "ocr-abc.json",       // 매치 X (뒤에 숫자 아님)
      "ocr-2026.json",      // 매치 O
      "log-2026.json",      // 매치 X (접두어 다름)
    ]);
    mockStat.mockResolvedValue({ mtimeMs: Date.now() - MAX_AGE_MS - 1000 } as any);
    mockUnlink.mockResolvedValue(undefined);
    await cleanupStaleLogs();
    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledTimes(1);
  });
});
