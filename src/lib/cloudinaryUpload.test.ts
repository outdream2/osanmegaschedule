// @vitest-environment jsdom
// 2026-08-20 · cloudinaryUpload · fetch mock 로 uploadImageToLocal · uploadImageToCloudinary
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// FileReader / Image / canvas 는 jsdom 이 부분지원 · 필요한 부분 mock
// compressImage 자체는 canvas 필요 → 여기서는 mocking 로 회피

vi.mock("./cloudinaryUpload", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // compressImage 우회 · Blob 하나 반환하도록
  };
});

// 실제로는 상단 mock 을 활용하되 · compressImage 호출 자체는 우회 필요
// → File.prototype 을 대신하기 위해 blobToDataUrl 로 흐르는 부분 stub

const { uploadImageToLocal, uploadImageToCloudinary, uploadImagesToCloudinary } = await import("./cloudinaryUpload");

// compressImage 는 내부적으로 FileReader + Image + canvas 필요 → 우회 위해 fetch 만 mock
// 대신 하위 API 만 확인 · 실제로 canvas 는 안 그리기 위해 FileReader 를 대체하지 않고
// canvas.toBlob 를 mock

// jsdom 미지원 canvas.toBlob 대응
beforeEach(() => {
  (globalThis as any).HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
  });
  (globalThis as any).HTMLCanvasElement.prototype.toBlob = function (cb: (blob: Blob | null) => void) {
    cb(new Blob(["fake"], { type: "image/webp" }));
  };
  // FileReader mock (readAsDataURL → data:image/webp;base64,ZmFrZQ==)
  (globalThis as any).FileReader = class {
    result: string | null = null;
    onload: any = null;
    onerror: any = null;
    readAsDataURL(_blob: Blob) {
      this.result = "data:image/webp;base64,ZmFrZQ==";
      queueMicrotask(() => this.onload?.());
    }
  };
  // Image mock (onload 자동 트리거)
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
  it("POST /api/board/upload-image · JSON body · data_url + filename", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        image_url: "/uploads/board/xyz.webp",
        public_id: "board/xyz",
        width: 800,
        height: 600,
      }),
    });
    (globalThis as any).fetch = mockFetch;

    const result = await uploadImageToLocal(makeFile());

    expect(mockFetch).toHaveBeenCalledWith("/api/board/upload-image", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.data_url).toContain("data:image/webp;base64,");
    expect(body.filename).toBe("test");
    expect(result.image_url).toBe("/uploads/board/xyz.webp");
    expect(result.public_id).toBe("board/xyz");
  });

  it("서버 에러 · body.error 로 throw", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "저장 실패" }),
    });
    await expect(uploadImageToLocal(makeFile())).rejects.toThrow("저장 실패");
  });

  it("에러 · body.error 없음 · 기본 메시지 + status", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new Error("bad json"); },
    });
    await expect(uploadImageToLocal(makeFile())).rejects.toThrow(/502/);
  });

  it("width/height 없는 응답 · 0 fallback", async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image_url: "u", public_id: "p" }),
    });
    const r = await uploadImageToLocal(makeFile());
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe("uploadImageToCloudinary · 서명 발급 실패 fallback", () => {
  it("signature 401 · uploadImageToLocal fallback", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 }) // sig 실패
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image_url: "/local/x.webp", public_id: "l", width: 100, height: 100 }),
      });
    (globalThis as any).fetch = mockFetch;

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("/local/x.webp");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/board/cloudinary-signature");
    expect(mockFetch.mock.calls[1][0]).toBe("/api/board/upload-image");
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
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sig })
      .mockResolvedValueOnce({ ok: true, json: async () => cloudResp });
    (globalThis as any).fetch = mockFetch;

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("https://res.cloudinary.com/cloud1/x.webp");
    expect(r.public_id).toBe("board/x");
    expect(r.width).toBe(1200);
    expect(mockFetch.mock.calls[1][0]).toContain("cloudinary.com/v1_1/cloud1/image/upload");
    // FormData body 확인
    expect(mockFetch.mock.calls[1][1].body).toBeInstanceOf(FormData);
  });

  it("Cloudinary 업로드 실패 · uploadImageToLocal fallback", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sig })
      .mockResolvedValueOnce({ ok: false, status: 500 }) // Cloudinary 실패
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image_url: "/fallback.webp", public_id: "f", width: 1, height: 1 }),
      });
    (globalThis as any).fetch = mockFetch;

    const r = await uploadImageToCloudinary(makeFile());
    expect(r.image_url).toBe("/fallback.webp");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("uploadImagesToCloudinary · 병렬", () => {
  it("여러 파일 · 병렬 업로드 · onProgress 콜백", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    const cloudResp = { secure_url: "u", public_id: "p", width: 100, height: 100 };
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("cloudinary-signature")) return Promise.resolve({ ok: true, json: async () => sig });
      return Promise.resolve({ ok: true, json: async () => cloudResp });
    });
    (globalThis as any).fetch = mockFetch;

    const onProgress = vi.fn();
    const files = [makeFile(), makeFile(), makeFile()];
    const r = await uploadImagesToCloudinary(files, onProgress);

    expect(r).toHaveLength(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    // 마지막 호출: (3, 3)
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it("progress · done/total · 콜백 optional", async () => {
    const sig = { api_key: "k", timestamp: 1, folder: "b", signature: "s", cloud_name: "c" };
    const cloudResp = { secure_url: "u", public_id: "p", width: 100, height: 100 };
    (globalThis as any).fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("cloudinary-signature")) return Promise.resolve({ ok: true, json: async () => sig });
      return Promise.resolve({ ok: true, json: async () => cloudResp });
    });
    // onProgress 없이 호출
    const r = await uploadImagesToCloudinary([makeFile()]);
    expect(r).toHaveLength(1);
  });
});
