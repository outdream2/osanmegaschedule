// @vitest-environment jsdom
// 2026-08-23 · useApiCall 훅 · try/catch + loading + toast + error state 통합 검증
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApiCall } from "./useApiCall";

// useToast mock
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock("./useToast", () => ({
  useToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    toast: null,
  }),
}));

// ApiError mock
vi.mock("../lib/apiClient", () => ({
  ApiError: class MockApiError extends Error {
    status: number;
    data: unknown;
    constructor(message: string, status = 500, data: unknown = null) {
      super(message);
      this.status = status;
      this.data = data;
      this.name = "ApiError";
    }
  },
}));

beforeEach(() => {
  mockShowError.mockReset();
  mockShowSuccess.mockReset();
});

describe("useApiCall · 기본", () => {
  it("초기 state · loading=false · error=null", () => {
    const { result } = renderHook(() => useApiCall());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("call · 성공 · loading true → false · result 반환", async () => {
    const { result } = renderHook(() => useApiCall<{ ok: boolean }>());
    const fn = vi.fn().mockResolvedValue({ ok: true });

    let ret: any;
    await act(async () => {
      ret = await result.current.call(fn);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(ret).toEqual({ ok: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("call · 실패 · error state set · toast showError", async () => {
    const { result } = renderHook(() => useApiCall());
    const fn = vi.fn().mockRejectedValue(new Error("network fail"));

    await act(async () => {
      await result.current.call(fn);
    });

    expect(result.current.error).toBe("network fail");
    expect(mockShowError).toHaveBeenCalledWith("network fail");
  });

  it("call · 실패 시 · 반환 undefined", async () => {
    const { result } = renderHook(() => useApiCall());
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    let ret: any;
    await act(async () => {
      ret = await result.current.call(fn);
    });

    expect(ret).toBeUndefined();
  });
});

describe("useApiCall · options.successMsg", () => {
  it("성공 · successMsg 있으면 · showSuccess", async () => {
    const { result } = renderHook(() =>
      useApiCall({ successMsg: "저장 완료" })
    );
    await act(async () => {
      await result.current.call(async () => "ok");
    });
    expect(mockShowSuccess).toHaveBeenCalledWith("저장 완료");
  });

  it("성공 · successMsg 없으면 · showSuccess 안 호출", async () => {
    const { result } = renderHook(() => useApiCall());
    await act(async () => {
      await result.current.call(async () => "ok");
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });
});

describe("useApiCall · options.errorPrefix", () => {
  it("실패 · errorPrefix 있으면 · prefix + 원본 message", async () => {
    const { result } = renderHook(() =>
      useApiCall({ errorPrefix: "저장 실패" })
    );
    await act(async () => {
      await result.current.call(async () => {
        throw new Error("서버 오류");
      });
    });
    expect(result.current.error).toBe("저장 실패: 서버 오류");
    expect(mockShowError).toHaveBeenCalledWith("저장 실패: 서버 오류");
  });
});

describe("useApiCall · options.showErrorToast", () => {
  it("showErrorToast=false · toast 없음 · error state 만", async () => {
    const { result } = renderHook(() =>
      useApiCall({ showErrorToast: false })
    );
    await act(async () => {
      await result.current.call(async () => {
        throw new Error("silent");
      });
    });
    expect(result.current.error).toBe("silent");
    expect(mockShowError).not.toHaveBeenCalled();
  });
});

describe("useApiCall · reset", () => {
  it("reset · error state null 로 초기화", async () => {
    const { result } = renderHook(() => useApiCall());
    await act(async () => {
      await result.current.call(async () => {
        throw new Error("fail");
      });
    });
    expect(result.current.error).toBe("fail");
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
  });
});

describe("useApiCall · callbacks", () => {
  it("onSuccess · 성공 후 호출", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useApiCall({ onSuccess }));
    await act(async () => {
      await result.current.call(async () => "ok");
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("onError · 실패 시 원본 error 전달", async () => {
    const onError = vi.fn();
    const err = new Error("fail");
    const { result } = renderHook(() => useApiCall({ onError }));
    await act(async () => {
      await result.current.call(async () => {
        throw err;
      });
    });
    expect(onError).toHaveBeenCalledWith(err);
  });
});
