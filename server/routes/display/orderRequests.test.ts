// 2026-09-01 · bulk_send_order_requests RPC 스키마 + 입력 검증 테스트
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── RPC 입력 스키마 (서버와 동일 로직 검증) ──────────────────────────────────
const BulkSendRpcInputSchema = z.object({
  request_ids: z.array(z.union([z.bigint(), z.string(), z.number()])).min(1),
});

// ── BulkSendOrder 서버 스키마 (orderRequests.ts 기준) ───────────────────────
const ItemSchema = z.object({
  order_request_id: z.union([z.number(), z.string(), z.bigint()]).nullable().optional(),
  order_qty: z.number().nullable().optional(),
  unit_price: z.number().nullable().optional(),
});

const SupplierGroupSchema = z.object({
  supplier: z.string().optional(),
  supplier_email: z.string().nullable().optional(),
  supplier_phone: z.string().nullable().optional(),
  supplier_contact: z.string().nullable().optional(),
  items: z.array(ItemSchema),
});

const BulkSendBodySchema = z.object({
  order_number: z.string().max(100).optional(),
  order_date: z.string().max(20).optional(),
  desired_arrival: z.string().max(20).optional(),
  memo: z.string().max(500).optional(),
  channels: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    kakao: z.boolean().optional(),
  }).optional(),
  bySupplier: z.array(SupplierGroupSchema).optional(),
});

// ── request_ids 추출 헬퍼 (서버 로직 미러) ───────────────────────────────────
function extractRequestIds(items: any[]): bigint[] {
  return items
    .map((it: any) => it.order_request_id)
    .filter((id: any) => id != null && id !== "")
    .map((id: any) => BigInt(id));
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe("bulk_send_order_requests · RPC 입력 스키마", () => {
  it("정상 BIGINT 배열 · 성공", () => {
    const r = BulkSendRpcInputSchema.safeParse({ request_ids: [1n, 2n, 3n] });
    expect(r.success).toBe(true);
  });

  it("문자열 숫자 배열 · 성공 (Supabase JS 호환)", () => {
    const r = BulkSendRpcInputSchema.safeParse({ request_ids: ["1", "2"] });
    expect(r.success).toBe(true);
  });

  it("빈 배열 · 실패 (min(1))", () => {
    const r = BulkSendRpcInputSchema.safeParse({ request_ids: [] });
    expect(r.success).toBe(false);
  });

  it("request_ids 없음 · 실패", () => {
    const r = BulkSendRpcInputSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("extractRequestIds · null/undefined 필터링", () => {
  it("정상 id · BigInt 변환", () => {
    const items = [{ order_request_id: 1 }, { order_request_id: 2 }];
    expect(extractRequestIds(items)).toEqual([1n, 2n]);
  });

  it("null id · 제외", () => {
    const items = [{ order_request_id: null }, { order_request_id: 5 }];
    expect(extractRequestIds(items)).toEqual([5n]);
  });

  it("undefined id · 제외", () => {
    const items = [{ order_request_id: undefined }, { order_request_id: 10 }];
    expect(extractRequestIds(items)).toEqual([10n]);
  });

  it("빈 문자열 id · 제외", () => {
    const items = [{ order_request_id: "" }, { order_request_id: 3 }];
    expect(extractRequestIds(items)).toEqual([3n]);
  });

  it("모두 null · 빈 배열", () => {
    const items = [{ order_request_id: null }, { order_request_id: null }];
    expect(extractRequestIds(items)).toEqual([]);
  });

  it("문자열 숫자 · BigInt 변환", () => {
    const items = [{ order_request_id: "42" }];
    expect(extractRequestIds(items)).toEqual([42n]);
  });
});

describe("BulkSendBodySchema · 요청 바디 검증", () => {
  it("최소 유효 바디 · 성공", () => {
    const r = BulkSendBodySchema.safeParse({
      bySupplier: [{ supplier: "ABC약품", items: [{ order_request_id: 1 }] }],
      channels: { email: true },
    });
    expect(r.success).toBe(true);
  });

  it("memo 500자 · 성공 (경계)", () => {
    const r = BulkSendBodySchema.safeParse({
      memo: "x".repeat(500),
      bySupplier: [],
    });
    expect(r.success).toBe(true);
  });

  it("memo 501자 · 실패", () => {
    const r = BulkSendBodySchema.safeParse({
      memo: "x".repeat(501),
      bySupplier: [],
    });
    expect(r.success).toBe(false);
  });

  it("order_number 100자 · 성공 (경계)", () => {
    const r = BulkSendBodySchema.safeParse({
      order_number: "O".repeat(100),
      bySupplier: [],
    });
    expect(r.success).toBe(true);
  });

  it("order_number 101자 · 실패", () => {
    const r = BulkSendBodySchema.safeParse({
      order_number: "O".repeat(101),
      bySupplier: [],
    });
    expect(r.success).toBe(false);
  });

  it("items 내 order_qty · unit_price nullable · 성공", () => {
    const r = BulkSendBodySchema.safeParse({
      bySupplier: [{
        supplier: "테스트",
        items: [{ order_request_id: 1, order_qty: null, unit_price: null }],
      }],
    });
    expect(r.success).toBe(true);
  });
});

describe("RPC 결과 · status 필드 검증", () => {
  // RPC RETURNS TABLE (id BIGINT, status TEXT)
  const RpcResultSchema = z.array(z.object({
    id: z.union([z.bigint(), z.number(), z.string()]),
    status: z.literal("ordered"),
  }));

  it("정상 RPC 반환 · 성공", () => {
    const r = RpcResultSchema.safeParse([
      { id: 1, status: "ordered" },
      { id: 2, status: "ordered" },
    ]);
    expect(r.success).toBe(true);
  });

  it("status 오타 · 실패", () => {
    const r = RpcResultSchema.safeParse([
      { id: 1, status: "requested" },
    ]);
    expect(r.success).toBe(false);
  });

  it("빈 배열 (조건 미충족 · 이미 ordered) · 성공", () => {
    const r = RpcResultSchema.safeParse([]);
    expect(r.success).toBe(true);
  });
});
