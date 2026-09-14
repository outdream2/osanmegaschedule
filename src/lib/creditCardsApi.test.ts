// @vitest-environment jsdom
// 2026-09-14 · creditCardsApi · 카드 CRUD + summary 프리미티브 테스트
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./apiClient", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

import {
  listCreditCards,
  listCreditCardSummary,
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
} from "./creditCardsApi";
import { api } from "./apiClient";

const sampleCard = {
  id: 1,
  issuer: "국민",
  alias: "메인카드",
  last4: "1234",
  billing_day: 15,
  active: true,
  note: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

describe("listCreditCards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("기본 · 전체 리스트", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [sampleCard] });
    const list = await listCreditCards();
    expect(list).toHaveLength(1);
    expect(list[0].issuer).toBe("국민");
    expect(api.get).toHaveBeenCalledWith("/api/credit-cards");
  });

  it("active: true · ?active=1 query", async () => {
    (api.get as any).mockResolvedValueOnce({ data: [] });
    await listCreditCards({ active: true });
    expect(api.get).toHaveBeenCalledWith("/api/credit-cards?active=1");
  });

  it("Array 아닌 응답 · 빈 배열", async () => {
    (api.get as any).mockResolvedValueOnce({ data: null });
    expect(await listCreditCards()).toEqual([]);
  });
});

describe("listCreditCardSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summary 배열 반환", async () => {
    (api.get as any).mockResolvedValueOnce({
      data: [
        { card: sampleCard, totalAmount: 100000, totalCount: 5, monthly: [], nextBillingAmount: 30000, nextBillingDate: "2026-10-15", currentBillingAmount: 10000, currentBillingDate: "2026-09-15" },
      ],
    });
    const list = await listCreditCardSummary();
    expect(list).toHaveLength(1);
    expect(list[0].totalAmount).toBe(100000);
    expect(api.get).toHaveBeenCalledWith("/api/credit-cards/summary");
  });
});

describe("createCreditCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST · input 그대로", async () => {
    (api.post as any).mockResolvedValueOnce({ data: sampleCard });
    const created = await createCreditCard({
      issuer: "국민",
      alias: "메인",
      last4: "1234",
      billing_day: 15,
    });
    expect(created.id).toBe(1);
    expect(api.post).toHaveBeenCalledWith("/api/credit-cards", {
      issuer: "국민",
      alias: "메인",
      last4: "1234",
      billing_day: 15,
    });
  });
});

describe("updateCreditCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PATCH · id/patch", async () => {
    (api.patch as any).mockResolvedValueOnce({ data: sampleCard });
    await updateCreditCard(1, { active: false });
    expect(api.patch).toHaveBeenCalledWith("/api/credit-cards/1", { active: false });
  });
});

describe("deleteCreditCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft delete (기본 true) · ?soft=1", async () => {
    (api.del as any).mockResolvedValueOnce({});
    await deleteCreditCard(1);
    expect(api.del).toHaveBeenCalledWith("/api/credit-cards/1?soft=1");
  });

  it("hard delete (soft=false) · no query", async () => {
    (api.del as any).mockResolvedValueOnce({});
    await deleteCreditCard(1, false);
    expect(api.del).toHaveBeenCalledWith("/api/credit-cards/1");
  });
});
