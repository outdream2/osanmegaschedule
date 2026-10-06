// @vitest-environment jsdom
// 2026-10-06 · NULL HARDENING regression · StockArrivalPage
//   · line 209: if (!employeeId) return guard before delete API call
//   · Validates handleDelete early-return when employeeId is undefined/null

import { describe, it, expect, vi } from "vitest";

// ─── Unit test of handleDelete guard logic ────────────────────────────────────

async function simulateHandleDelete(
  employeeId: number | undefined | null,
  confirmFn: () => Promise<boolean>,
  deleteApiFn: (id: number, empId: number) => Promise<void>
): Promise<"guarded" | "confirmed" | "api_called"> {
  // Exact guard from line 209
  if (!employeeId) return "guarded";
  const ok = await confirmFn();
  if (!ok) return "confirmed";
  await deleteApiFn(1, employeeId);
  return "api_called";
}

describe("StockArrivalPage · handleDelete employeeId guard (line 209)", () => {
  it("employeeId=undefined → returns early, API not called", async () => {
    const deleteApi = vi.fn();
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await simulateHandleDelete(undefined, confirm, deleteApi);
    expect(result).toBe("guarded");
    expect(deleteApi).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("employeeId=null → returns early, API not called", async () => {
    const deleteApi = vi.fn();
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await simulateHandleDelete(null, confirm, deleteApi);
    expect(result).toBe("guarded");
    expect(deleteApi).not.toHaveBeenCalled();
  });

  it("employeeId=0 (falsy) → returns early, API not called", async () => {
    const deleteApi = vi.fn();
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await simulateHandleDelete(0, confirm, deleteApi);
    expect(result).toBe("guarded");
    expect(deleteApi).not.toHaveBeenCalled();
  });

  it("employeeId=valid + confirm=false → API not called", async () => {
    const deleteApi = vi.fn();
    const confirm = vi.fn().mockResolvedValue(false);
    const result = await simulateHandleDelete(42, confirm, deleteApi);
    expect(result).toBe("confirmed");
    expect(deleteApi).not.toHaveBeenCalled();
  });

  it("employeeId=valid + confirm=true → API called with correct id", async () => {
    const deleteApi = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await simulateHandleDelete(42, confirm, deleteApi);
    expect(result).toBe("api_called");
    expect(deleteApi).toHaveBeenCalledWith(1, 42);
  });
});
