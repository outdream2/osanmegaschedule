// 2026-08-20 · parse · fixDateInAmountColumns + sanitizeBalanceContamination
import { describe, it, expect } from "vitest";
import {
  fixDateInAmountColumns,
  sanitizeBalanceContamination,
} from "./parse";

const HEADERS = ["품명", "수량", "단가", "금액", "유통기한"];

describe("fixDateInAmountColumns · 날짜 오배정 복구", () => {
  it("금액 컬럼에 YYYYMMDD · 유통기한 컬럼으로 이동", () => {
    const rows = [["타이레놀", 10, 500, 20271231, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBeNull();
    expect(r.rows[0][4]).toBe("2027-12-31");
  });

  it("단가 컬럼에 YYYYMMDD · 유통기한 이동", () => {
    const rows = [["타이레놀", 10, 20280130, 5000, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][2]).toBeNull();
    expect(r.rows[0][4]).toBe("2028-01-30");
  });

  it("수량 컬럼에 YYYYMMDD · 유통기한 이동", () => {
    const rows = [["타이레놀", 20281221, null, null, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][1]).toBeNull();
    expect(r.rows[0][4]).toBe("2028-12-21");
  });

  it("정상 금액 · 변화 없음", () => {
    const rows = [["타이레놀", 10, 500, 5000, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(5000);
  });

  it("범위 밖 숫자 (< 20200101) · 날짜 아님", () => {
    const rows = [["타이레놀", 10, 500, 20190101, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(20190101);
  });

  it("잘못된 월 (13월) · 날짜 아님", () => {
    const rows = [["타이레놀", 10, 500, 20271301, null]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(0);
  });

  it("유통기한 컬럼 없음 · 값만 null 처리", () => {
    const rows = [["타이레놀", 10, 500, 20271231]];
    const r = fixDateInAmountColumns(["품명", "수량", "단가", "금액"], rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBeNull();
  });

  it("유통기한 이미 채워짐 · 덮어쓰기 X · 값은 null 처리", () => {
    const rows = [["타이레놀", 10, 500, 20271231, "2026-01-01"]];
    const r = fixDateInAmountColumns(HEADERS, rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBeNull();
    expect(r.rows[0][4]).toBe("2026-01-01"); // 유지
  });

  it("컬럼 모두 없음 · 원본 그대로", () => {
    const r = fixDateInAmountColumns(["품명", "규격"], [["a", "b"]]);
    expect(r.fixedCount).toBe(0);
  });
});

describe("sanitizeBalanceContamination · 잔액 오염 감지", () => {
  it("total >= subtotal × 20 · 오염 · total 제거 · balanceAfter 이동", () => {
    const meta = { total: 53411540, subtotal: 542160 };
    const r = sanitizeBalanceContamination(meta, 0);
    expect(r.contaminated).toBe(true);
    expect(r.meta.total).toBeUndefined();
    expect(r.meta.balanceAfter).toBe(53411540);
  });

  it("total >= rowsSum × 20 (subtotal 없음) · 오염", () => {
    const meta = { total: 10000000 };
    const r = sanitizeBalanceContamination(meta, 500000);
    // 10M / 500k = 20 · >= 20 · 오염
    expect(r.contaminated).toBe(true);
  });

  it("total < reference × 20 · 정상 · 그대로", () => {
    const meta = { total: 100000, subtotal: 90000 };
    const r = sanitizeBalanceContamination(meta, 0);
    expect(r.contaminated).toBe(false);
    expect(r.meta.total).toBe(100000);
  });

  it("meta 없음 · 그대로 · contaminated false", () => {
    const r = sanitizeBalanceContamination(null, 0);
    expect(r.contaminated).toBe(false);
    expect(r.meta).toBeNull();
  });

  it("total 없음 · 그대로", () => {
    const r = sanitizeBalanceContamination({}, 100);
    expect(r.contaminated).toBe(false);
  });

  it("reference 0 (subtotal 및 rowsSum 없음) · 판정 안 함", () => {
    const r = sanitizeBalanceContamination({ total: 1000000 }, 0);
    expect(r.contaminated).toBe(false);
  });

  it("balanceAfter 이미 있음 · 덮어쓰기 X", () => {
    const meta = { total: 10000000, subtotal: 100000, balanceAfter: 999 };
    const r = sanitizeBalanceContamination(meta, 0);
    expect(r.contaminated).toBe(true);
    expect(r.meta.balanceAfter).toBe(999); // 유지
    expect(r.meta.total).toBeUndefined();
  });
});
