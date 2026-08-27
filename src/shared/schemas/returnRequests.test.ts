// 2026-08-27 · 감사 #4 · #8 · 반품 요청 스키마 + 상태 전이 단위 테스트
import { describe, it, expect } from "vitest";
import {
  ReturnRequestCreateSchema,
  ReturnRequestUpdateSchema,
  ReturnRequestBulkSendSchema,
  canTransitionStatus,
  RETURN_STATUSES,
} from "./returnRequests";

describe("ReturnRequestCreateSchema · 반품 생성 · Zod 검증", () => {
  const base = { product_code: "P001", qty: 5 };

  it("최소 필수 필드 통과 · product_code + qty", () => {
    const r = ReturnRequestCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("모든 optional 필드 포함 · 통과", () => {
    const r = ReturnRequestCreateSchema.safeParse({
      ...base,
      product_name: "테스트상품",
      supplier: "테스트공급사",
      current_stock: 10,
      purchase_price: 1000,
      reason: "재고 과다",
      requested_by: "홍길동",
      requested_by_id: 42,
    });
    expect(r.success).toBe(true);
  });

  it("product_code 빈 문자열 · 거부", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, product_code: "" });
    expect(r.success).toBe(false);
  });

  it("qty 0 · 거부 (min 1)", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, qty: 0 });
    expect(r.success).toBe(false);
  });

  it("qty 음수 · 거부", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, qty: -1 });
    expect(r.success).toBe(false);
  });

  it("qty 초과 (100001) · 거부", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, qty: 100001 });
    expect(r.success).toBe(false);
  });

  it("qty 문자열 숫자 · coerce 통과 (예: '10')", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, qty: "10" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.qty).toBe(10);
  });

  it("허용 안 된 필드 · strip (에러 X · 무시)", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, malicious: "<script>" });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).malicious).toBeUndefined();
  });

  it("긴 문자열 · 거부 (product_name > 200)", () => {
    const r = ReturnRequestCreateSchema.safeParse({ ...base, product_name: "x".repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe("ReturnRequestUpdateSchema · 반품 수정 · Zod 검증", () => {
  it("qty 만 · 통과", () => {
    const r = ReturnRequestUpdateSchema.safeParse({ qty: 3 });
    expect(r.success).toBe(true);
  });

  it("status enum · 통과", () => {
    for (const s of RETURN_STATUSES) {
      const r = ReturnRequestUpdateSchema.safeParse({ status: s });
      expect(r.success).toBe(true);
    }
  });

  it("status 잘못된 값 · 거부", () => {
    const r = ReturnRequestUpdateSchema.safeParse({ status: "invalid" });
    expect(r.success).toBe(false);
  });

  it("빈 객체 · 거부 (수정 필드 없음)", () => {
    const r = ReturnRequestUpdateSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("reason null · 통과", () => {
    const r = ReturnRequestUpdateSchema.safeParse({ reason: null });
    expect(r.success).toBe(true);
  });
});

describe("ReturnRequestBulkSendSchema · 일괄 발송 · Zod 검증", () => {
  it("ids 배열 · 통과", () => {
    const r = ReturnRequestBulkSendSchema.safeParse({ ids: [1, 2, 3] });
    expect(r.success).toBe(true);
  });

  it("ids 빈 배열 · 거부 (min 1)", () => {
    const r = ReturnRequestBulkSendSchema.safeParse({ ids: [] });
    expect(r.success).toBe(false);
  });

  it("ids 501개 초과 · 거부 (max 500)", () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const r = ReturnRequestBulkSendSchema.safeParse({ ids });
    expect(r.success).toBe(false);
  });

  it("ids 음수 · 거부", () => {
    const r = ReturnRequestBulkSendSchema.safeParse({ ids: [-1] });
    expect(r.success).toBe(false);
  });

  it("channels + sender_note 포함 · 통과", () => {
    const r = ReturnRequestBulkSendSchema.safeParse({
      ids: [1],
      channels: { email: true, sms: false },
      sender_note: "긴급 반품",
    });
    expect(r.success).toBe(true);
  });
});

describe("canTransitionStatus · 상태 전이 규칙", () => {
  it("동일 상태 유지 · 항상 허용", () => {
    for (const s of RETURN_STATUSES) {
      expect(canTransitionStatus(s, s)).toBe(true);
    }
  });

  it("pending → 다른 상태 모두 허용", () => {
    expect(canTransitionStatus("pending", "sent")).toBe(true);
    expect(canTransitionStatus("pending", "done")).toBe(true);
    expect(canTransitionStatus("pending", "cancelled")).toBe(true);
  });

  it("sent → pending 금지", () => {
    expect(canTransitionStatus("sent", "pending")).toBe(false);
  });

  it("sent → done · cancelled 허용", () => {
    expect(canTransitionStatus("sent", "done")).toBe(true);
    expect(canTransitionStatus("sent", "cancelled")).toBe(true);
  });

  it("done → pending · sent 금지", () => {
    expect(canTransitionStatus("done", "pending")).toBe(false);
    expect(canTransitionStatus("done", "sent")).toBe(false);
  });

  it("done → cancelled 허용 (반품 취소 가능)", () => {
    expect(canTransitionStatus("done", "cancelled")).toBe(true);
  });

  it("cancelled → done · sent 금지 (재활성화 금지)", () => {
    expect(canTransitionStatus("cancelled", "done")).toBe(false);
    expect(canTransitionStatus("cancelled", "sent")).toBe(false);
  });

  it("cancelled → pending 허용 (재신청)", () => {
    expect(canTransitionStatus("cancelled", "pending")).toBe(true);
  });
});
