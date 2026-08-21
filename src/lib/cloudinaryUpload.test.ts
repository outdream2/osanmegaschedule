// @vitest-environment jsdom
// 2026-08-20 · cloudinaryUpload · fetch mock 로 uploadImageToLocal · uploadImageToCloudinary
// 2026-08-21 · Framework Phase 3 · 내부 API (upload-image·cloudinary-signature) 는 apiClient mock
// 2026-08-21 · Cloudinary 외부 API (res.cloudinary.com) 는 fetch mock 유지
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// apiClient mock (module 레벨) · 내부 서버 요청 처리
vi.mock("./apiClient", () => {
  class ApiError extends Error {
    status: number;
    data?: unknown;
    constructor(status: number, message: string, code?: string, data?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.data = data;
      void code;
    }
  }
  return {
    ApiError,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { uploadImageToLocal, uploadImageToCloudinary, uploadImagesToCloudinary } from "./cloudinaryUpload";
import { api, ApiError } from "./apiClient";

const mockPost = api.post as ReturnType<typeof vi.fn>;

// jsdom 미지원 · canvas + FileReader + Image mock
beforeEach(() => {
  mockPost.mockReset();
  (globalThis as any).HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
  });
  (globalThis as any).HTMLCanvasElement.prototype.toBlob = function (cb: (blob: Blob | null) => void) {
    cb(new Blob(["fake"], { type: "image/webp" }));
  };
  (globalThis as any).FileReader = class {
    result: string | null = null;
    onload: any = null;
    onerror: any = null;
    readAsDataURL(_blob: Blob) {
      this.result = "data:image/webp;base64,ZmFrZQ==";
      queueMicrotask(() => this.onload?.());
    }
  };
  (globalThis as any).Image = class {
    width = 800;
    height = 600;
    onload: any = null;
    onerror: any = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const makeFile = () => new File(["fake"], "test.jpg", { type: "image/jpeg" });

describe("uploadImageToLocal", () => {
  it("POST /api/board/upload-image · data_url + filename", async () => {
    mockPost.mockResolvedValue({
      data: {
        image_url: "/uploads/board/xyz.webp",
        public_id: "board/xyz",
        width: 800, height: 600,
      },
      status: 200, headers: {},
    });

    const result = await uploadImageToLocal(makeFile());

    expect(mockPost).toHaveBeenCalledWith("/api/board/upload-image", expect.objectContaining({
      data_url: expect.stringContaining("data:image/webp;base64,"),
      filename: "test",
    }));
    expect(result.image_url).toBe("/uploads/board/xyz.webp");
    expect(result.public_id).toBe("board/xyz");
  });

  it("서버 에러 (ApiError with data.error) · throw · error 메시지", async () => {
    mockPost.mockRejectedValue(new ApiError(500, "Internal", undefined, { error: "저장 실패" }));
    await expect(uploadImageToLocal(makeFile())).rejects.toThrow("저장 실패");
  });

  it("에러 · body 없음 · 기본 메시지 + status", async () => {
    mockPost.mockRejectedValue(new ApiError(502, "Bad Gateway"));
    await expect(uploadImageToLocal(makeFile())).rejects.toThrow(/502/);
  });

  it("width/height 없는 응답 · 0 fallback", async () => {
    mockPost.mockResolvedValue({
      data: { image_url: "u", public_id: "p" },
      status: 200, headers: {},
    });
    const r = await uploadImageToLocal(makeFile());
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe("uploadImageToCloudinary · 서명 발급 실패 fallback", () => {
  it("signature 401 (ApiError) · uploadImageToLocal fallback", async () => {
    mockPost
      .mockRejectedValueOnce(new ApiError(401, "Unauthorized")) // signature 실패
      .mockResolvedValueOnce({
        data: { image_url: "/local/x.webp", public_id: "l", width: 100, height: 100 },
        status: 200, headers: {},
      });

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("/local/x.webp");
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0][0]).toBe("/api/board/cloudinary-signature");
    expect(mockPost.mock.calls[1][0]).toBe("/api/board/upload-image");
  });
});

describe("uploadImageToCloudinary · 정상 흐름", () => {
  it("서명 · Cloudinary POST · secure_url 반환", async () => {
    const sig = {
      api_key: "k", timestamp: 1234, folder: "board",
      signature: "sig", cloud_name: "cloud1",
    };
    const cloudResp = {
      secure_url: "https://res.cloudinary.com/cloud1/x.webp",
      public_id: "board/x",
      width: 1200, height: 800,
    };
    mockPost.mockResolvedValueOnce({ data: sig, status: 200, headers: {} });
    // Cloudinary 외부 API 는 fetch 유지 · mock
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => cloudResp });
    (globalThis as any).fetch = mockFetch;

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("https://res.cloudinary.com/cloud1/x.webp");
    expect(r.public_id).toBe("board/x");
    expect(r.width).toBe(1200);
    expect(mockFetch.mock.calls[0][0]).toContain("cloudinary.com/v1_1/cloud1/image/upload");
    expect(mockFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it("Cloudinary 업로드 실패 · uploadImageToLocal fallback", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    mockPost
      .mockResolvedValueOnce({ data: sig, status: 200, headers: {} })
      .mockResolvedValueOnce({
        data: { image_url: "/fallback.webp", public_id: "f", width: 1, height: 1 },
        status: 200, headers: {},
      });
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("/fallback.webp");
    expect(mockPost).toHaveBeenCalledTimes(2); // signature + upload-image fallback
  });
});

describe("uploadImagesToCloudinary · 병렬", () => {
  it("여러 파일 · 병렬 업로드 · onProgress 콜백", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    const cloudResp = { secure_url: "u", public_id: "p", width: 100, height: 100 };
    mockPost.mockImplementation((url: string) => {
      if (url.includes("cloudinary-signature")) return Promise.resolve({ data: sig, status: 200, headers: {} });
      return Promise.resolve({ data: {}, status: 200, headers: {} });
    });
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => cloudResp });

    const onProgress = vi.fn();
    const files = [makeFile(), makeFile(), makeFile()];
    const r = await uploadImagesToCloudinary(files, onProgress);

    expect(r).toHaveLength(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it("progress · onProgress optional", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    const cloudResp = { secure_url: "u", public_id: "p", width: 100, height: 100 };
    mockPost.mockImplementation((url: string) => {
      if (url.includes("cloudinary-signature")) return Promise.resolve({ data: sig, status: 200, headers: {} });
      return Promise.resolve({ data: {}, status: 200, headers: {} });
    });
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => cloudResp });
    const r = await uploadImagesToCloudinary([makeFile()]);
    expect(r).toHaveLength(1);
  });
});
