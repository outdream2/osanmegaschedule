// src/components/VatPreparePage/hooks/useMonthlyVat.ts
// 2026-08-04 · #253 · 부가세 준비 월별 매출·매입·경비 통합 hook
//   · GET /api/vat/monthly-summary?from=&to= · 매출 (stock_history) + 매입 (purchase_details + vendors.vat_included)
//   · 경비 · localStorage `megatown_vat_expenses_v1` · { "YYYY-MM": number }
//   · 예상 부가세 = 매출세액 - 매입세액공제 - 경비세액
//     경비세액 · 사용자가 별도 지정하지 않으면 VAT 포함 가정 · expense / 11
//   · 파생컬럼 X · 모든 계산 runtime
//
// 반환 · rows[] 월별 · totals · 부가세 요약 (매출세액·매입세액공제·경비세액·예상부가세)

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── 서버 응답 타입 ─────────────────────────────────────────────
export interface MonthlyVatServerRow {
  month: string;                    // YYYY-MM
  salesTotal: number;               // 매출 총액 (VAT 포함 가정)
  salesVat: number;                 // 매출세액 (total / 11)
  salesSupply: number;              // 매출 공급가액
  salesRowCount: number;
  purchaseGross: number;            // 매입 총액 (공급가액+VAT)
  purchaseSupply: number;           // 매입 공급가액
  purchaseVat: number;              // 매입세액 (전체)
  purchaseDeductibleVat: number;    // 공제 가능 매입세액 (면세 공급사 제외)
  purchaseRowCount: number;
}

interface MonthlyVatResponse {
  from: string;
  to: string;
  months: MonthlyVatServerRow[];
  warning?: string;
}

// ─── 프론트 확장 타입 (경비 병합) ──────────────────────────────
export interface MonthlyVatRow extends MonthlyVatServerRow {
  expense: number;                  // 사용자 입력 경비 (VAT 포함 총액)
  expenseVat: number;               // 경비세액 (expense / 11 · 반올림)
  expectedVat: number;              // 예상 부가세 = salesVat - purchaseDeductibleVat - expenseVat
}

export interface MonthlyVatTotals {
  salesTotal: number;
  salesSupply: number;
  salesVat: number;
  purchaseGross: number;
  purchaseSupply: number;
  purchaseVat: number;
  purchaseDeductibleVat: number;
  expense: number;
  expenseVat: number;
  expectedVat: number;
}

// ─── 경비 localStorage ─────────────────────────────────────────
const EXPENSE_KEY = "megatown_vat_expenses_v1";

type ExpenseMap = Record<string, number>;

function loadExpenses(): ExpenseMap {
  try {
    const raw = localStorage.getItem(EXPENSE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      const clean: ExpenseMap = {};
      for (const [k, v] of Object.entries(obj)) {
        if (/^\d{4}-\d{2}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v >= 0) {
          clean[k] = v;
        }
      }
      return clean;
    }
    return {};
  } catch {
    return {};
  }
}

function saveExpenses(map: ExpenseMap) {
  try {
    localStorage.setItem(EXPENSE_KEY, JSON.stringify(map));
  } catch {
    /* quota 초과 등 무시 */
  }
}

// ─── Hook ──────────────────────────────────────────────────────
export interface UseMonthlyVatOptions {
  from: string;  // YYYY-MM-DD
  to: string;    // YYYY-MM-DD
}

export interface UseMonthlyVatResult {
  rows: MonthlyVatRow[];
  totals: MonthlyVatTotals;
  loading: boolean;
  error: string | null;
  warning: string | null;
  /** 특정 월 경비 저장 (localStorage 즉시 반영) */
  setExpense: (month: string, value: number) => void;
  /** 수동 리로드 */
  reload: () => void;
}

/** VAT 포함 총액 → 매출세액 (10/110 · 반올림) */
function vatFromInclusive(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round(total / 11);
}

export function useMonthlyVat(opts: UseMonthlyVatOptions): UseMonthlyVatResult {
  const { from, to } = opts;
  const [serverRows, setServerRows] = useState<MonthlyVatServerRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseMap>(() => loadExpenses());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // 서버 조회
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!from || !to) return;
      setLoading(true);
      setError(null);
      setWarning(null);
      try {
        const r = await fetch(
          `/api/vat/monthly-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        if (!r.ok) throw new Error(`월별 부가세 조회 실패 (${r.status})`);
        const j: MonthlyVatResponse = await r.json();
        if (cancelled) return;
        setServerRows(Array.isArray(j.months) ? j.months : []);
        setWarning(j.warning ?? null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "월별 부가세 조회 실패");
          setServerRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [from, to, reloadTick]);

  // 경비 storage 이벤트 (다른 탭 동기화)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPENSE_KEY) setExpenses(loadExpenses());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 경비 병합 · row 계산
  const rows = useMemo<MonthlyVatRow[]>(() => {
    return serverRows.map(r => {
      const expense = expenses[r.month] ?? 0;
      const expenseVat = vatFromInclusive(expense);
      const expectedVat = r.salesVat - r.purchaseDeductibleVat - expenseVat;
      return {
        ...r,
        expense,
        expenseVat,
        expectedVat,
      };
    });
  }, [serverRows, expenses]);

  const totals = useMemo<MonthlyVatTotals>(() => {
    const t: MonthlyVatTotals = {
      salesTotal: 0,
      salesSupply: 0,
      salesVat: 0,
      purchaseGross: 0,
      purchaseSupply: 0,
      purchaseVat: 0,
      purchaseDeductibleVat: 0,
      expense: 0,
      expenseVat: 0,
      expectedVat: 0,
    };
    for (const r of rows) {
      t.salesTotal += r.salesTotal;
      t.salesSupply += r.salesSupply;
      t.salesVat += r.salesVat;
      t.purchaseGross += r.purchaseGross;
      t.purchaseSupply += r.purchaseSupply;
      t.purchaseVat += r.purchaseVat;
      t.purchaseDeductibleVat += r.purchaseDeductibleVat;
      t.expense += r.expense;
      t.expenseVat += r.expenseVat;
      t.expectedVat += r.expectedVat;
    }
    return t;
  }, [rows]);

  const setExpense = useCallback((month: string, value: number) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const clean = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    setExpenses(prev => {
      const next = { ...prev };
      if (clean === 0) delete next[month];
      else next[month] = clean;
      saveExpenses(next);
      return next;
    });
  }, []);

  const reload = useCallback(() => setReloadTick(x => x + 1), []);

  return { rows, totals, loading, error, warning, setExpense, reload };
}

export default useMonthlyVat;
