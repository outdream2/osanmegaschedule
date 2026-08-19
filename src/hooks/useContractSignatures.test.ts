// @vitest-environment jsdom
// 2026-08-19 · useContractSignatures · SIGN_KEYS · openSign/closeSign/submitSign/clearSign · SIGN_LABEL
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useContractSignatures,
  SIGN_KEYS,
  REQUIRED_SIGN_COUNT,
  SIGN_LABEL,
} from "./useContractSignatures";

describe("useContractSignatures · 초기 상태", () => {
  it("모든 서명 · null 초기값", () => {
    const { result } = renderHook(() => useContractSignatures());
    // 활성 7개 + 레거시 5개 = 12
    Object.values(result.current.signUrls).forEach((v) => expect(v).toBeNull());
  });

  it("signModal · 초기 닫힘 · key=null", () => {
    const { result } = renderHook(() => useContractSignatures());
    expect(result.current.signModal).toEqual({ open: false, key: null });
  });

  it("모든 함수 반환", () => {
    const { result } = renderHook(() => useContractSignatures());
    expect(typeof result.current.openSign).toBe("function");
    expect(typeof result.current.closeSign).toBe("function");
    expect(typeof result.current.submitSign).toBe("function");
    expect(typeof result.current.clearSign).toBe("function");
    expect(typeof result.current.setSignUrls).toBe("function");
  });
});

describe("useContractSignatures · openSign / closeSign", () => {
  it("openSign · 모달 open · key 지정", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.openSign("employer"); });
    expect(result.current.signModal).toEqual({ open: true, key: "employer" });
  });

  it("closeSign · 모달 닫힘 · key null", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.openSign("employee"); });
    act(() => { result.current.closeSign(); });
    expect(result.current.signModal).toEqual({ open: false, key: null });
  });
});

describe("useContractSignatures · submitSign", () => {
  it("openSign 후 · submitSign · 해당 key 에 dataUrl 저장 + 모달 닫힘", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.openSign("privacy"); });
    act(() => { result.current.submitSign("data:image/png;base64,xxx"); });
    expect(result.current.signUrls.privacy).toBe("data:image/png;base64,xxx");
    expect(result.current.signModal).toEqual({ open: false, key: null });
  });

  it("openSign 없이 · submitSign · 아무 변화 없음", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.submitSign("data:x"); });
    Object.values(result.current.signUrls).forEach((v) => expect(v).toBeNull());
  });

  it("다중 서명 · 각각 저장", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.openSign("employer"); });
    act(() => { result.current.submitSign("sig1"); });
    act(() => { result.current.openSign("employee"); });
    act(() => { result.current.submitSign("sig2"); });
    expect(result.current.signUrls.employer).toBe("sig1");
    expect(result.current.signUrls.employee).toBe("sig2");
  });
});

describe("useContractSignatures · clearSign", () => {
  it("clearSign · 해당 key null 로 복원", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => { result.current.openSign("wageAck"); });
    act(() => { result.current.submitSign("data"); });
    expect(result.current.signUrls.wageAck).toBe("data");
    act(() => { result.current.clearSign("wageAck"); });
    expect(result.current.signUrls.wageAck).toBeNull();
  });
});

describe("SIGN_KEYS · 상수", () => {
  it("활성 서명 지점 · 7개", () => {
    expect(SIGN_KEYS).toHaveLength(7);
    expect(SIGN_KEYS).toEqual([
      "employer", "employee", "privacy",
      "wageAck", "workTimeAck", "etcAck",
      "receipt",
    ]);
  });

  it("REQUIRED_SIGN_COUNT · 6", () => {
    expect(REQUIRED_SIGN_COUNT).toBe(6);
  });

  it("SIGN_LABEL · 12개 (활성 7 + 레거시 5)", () => {
    expect(Object.keys(SIGN_LABEL)).toHaveLength(12);
    expect(SIGN_LABEL.employer).toBe("사업주 (갑) 하단");
    expect(SIGN_LABEL.employee).toBe("근로자 (을) 하단");
  });
});

describe("useContractSignatures · setSignUrls 직접", () => {
  it("setSignUrls · 외부에서 · 전체 대체", () => {
    const { result } = renderHook(() => useContractSignatures());
    act(() => {
      result.current.setSignUrls((prev) => ({ ...prev, employer: "external" }));
    });
    expect(result.current.signUrls.employer).toBe("external");
  });
});
