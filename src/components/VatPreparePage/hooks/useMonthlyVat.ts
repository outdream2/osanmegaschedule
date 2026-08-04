// src/components/VatPreparePage/hooks/useMonthlyVat.ts
// 2026-08-04 · #253 · 부가세 준비 월별 매출·매입·경비 통합 hook
//   · GET /api/vat/monthly-summary?from=&to= · 매출 (stock_history) + 매입 (purchase_details + vendors.vat_included)
//   · 경비 · localStorage `megatown_vat_expenses_v1` · { "YYYY-MM": number }
//   · 면세(TAX FREE) 매출 · localStorage `megatown_vat_taxfree_sales_v1` · { "YYYY-MM": number }
//       - 사용자 수동 입력 (외국인 즉시환급 · 처방전 조제 등 POS 미분류)
//       - stock_history 매출 총액 중 면세분만큼 차감 → 과세 매출로만 매출세액 산정
//   · 예상 부가세 = 매출세액(과세만) - 매입세액공제 - 경비세액
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

// ─── 프론트 확장 타입 (경비·면세 병합) ─────────────────────────
export interface MonthlyVatRow extends MonthlyVatServerRow {
  // 경비 (사용자 입력)
  expense: number;                  // 사용자 입력 경비 (VAT 포함 총액)
  expenseVat: number;               // 경비세액 (expense / 11 · 반올림)
  // 면세(TAX FREE) 매출 (사용자 입력)
  taxfreeSales: number;             // 면세 매출액 (외국인 즉시환급 등 · 매출세액 산정 제외)
  taxableSales: number;             // 과세 매출 = max(salesTotal - taxfreeSales, 0)
  // 재계산된 매출세액 (서버 응답 salesVat 는 참고용 · 실제 표시는 taxableSalesVat)
  taxableSalesVat: number;          // 과세 매출세액 (taxableSales / 11 · 반올림)
  // 예상 부가세 = taxableSalesVat - purchaseDeductibleVat - expenseVat
  expectedVat: number;
}

export interface MonthlyVatTotals {
  salesTotal: number;               // 매출 총액 (과세+면세)
  salesSupply: number;              // (참고) 서버 계산 공급가액 총합
  salesVat: number;                 // (참고) 서버 원본 매출세액 총합
  taxfreeSales: number;             // 면세 매출 총합
  taxableSales: number;             // 과세 매출 총합
  taxableSalesVat: number;          // 과세 매출세액 총합 (실제 신고 base)
  purchaseGross: number;
  purchaseSupply: number;
  purchaseVat: number;
  purchaseDeductibleVat: number;
  expense: number;
  expenseVat: number;
  expectedVat: number;
}

// ─── localStorage · 경비 · 면세매출 ────────────────────────────
const EXPENSE_KEY  = "megatown_vat_expenses_v1";
const TAXFREE_KEY  = "megatown_vat_taxfree_sales_v1";

type MonthMoneyMap = Record<string, number>;

/** 월별 금액 map · YYYY-MM 키만 · 유한 non-negative 수치만 */
function loadMoneyMap(key: string): MonthMoneyMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      const clean: MonthMoneyMap = {};
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

function saveMoneyMap(key: string, map: MonthMoneyMap) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
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
  /** 특정 월 면세(TAX FREE) 매출 저장 (localStorage 즉시 반영) */
  setTaxfreeSales: (month: string, value: number) => void;
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
  const [expenses, setExpenses] = useState<MonthMoneyMap>(() => loadMoneyMap(EXPENSE_KEY));
  const [taxfree, setTaxfree] = useState<MonthMoneyMap>(() => loadMoneyMap(TAXFREE_KEY));
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

  // 경비·면세매출 storage 이벤트 (다른 탭 동기화)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPENSE_KEY) setExpenses(loadMoneyMap(EXPENSE_KEY));
      if (e.key === TAXFREE_KEY) setTaxfree(loadMoneyMap(TAXFREE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 경비·면세 병합 · row 계산
  const rows = useMemo<MonthlyVatRow[]>(() => {
    return serverRows.map(r => {
      const expense = expenses[r.month] ?? 0;
      const expenseVat = vatFromInclusive(expense);
      // 면세 매출 · 사용자 입력 · 서버 salesTotal 상한 clamp (음수 방지)
      const rawTaxfree = taxfree[r.month] ?? 0;
      const taxfreeSales = Math.min(rawTaxfree, r.salesTotal);
      const taxableSales = Math.max(r.salesTotal - taxfreeSales, 0);
      const taxableSalesVat = vatFromInclusive(taxableSales);
      const expectedVat = taxableSalesVat - r.purchaseDeductibleVat - expenseVat;
      return {
        ...r,
        expense,
        expenseVat,
        taxfreeSales,
        taxableSales,
        taxableSalesVat,
        expectedVat,
      };
    });
  }, [serverRows, expenses, taxfree]);

  const totals = useMemo<MonthlyVatTotals>(() => {
    const t: MonthlyVatTotals = {
      salesTotal: 0,
      salesSupply: 0,
      salesVat: 0,
      taxfreeSales: 0,
      taxableSales: 0,
      taxableSalesVat: 0,
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
      t.taxfreeSales += r.taxfreeSales;
      t.taxableSales += r.taxableSales;
      t.taxableSalesVat += r.taxableSalesVat;
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
      saveMoneyMap(EXPENSE_KEY, next);
      return next;
    });
  }, []);

  const setTaxfreeSales = useCallback((month: string, value: number) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const clean = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    setTaxfree(prev => {
      const next = { ...prev };
      if (clean === 0) delete next[month];
      else next[month] = clean;
      saveMoneyMap(TAXFREE_KEY, next);
      return next;
    });
  }, []);

  const reload = useCallback(() => setReloadTick(x => x + 1), []);

  return { rows, totals, loading, error, warning, setExpense, setTaxfreeSales, reload };
}

export default useMonthlyVat;
