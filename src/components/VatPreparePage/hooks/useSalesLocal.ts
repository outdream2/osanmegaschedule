// src/components/VatPreparePage/hooks/useSalesLocal.ts
// 2026-08-04 · Phase 1 · localStorage 기반 매출 입력 저장소
//   - 부가세 페이지 매출 탭에서 사용
//   - key: "megatown_vatSalesLocal_v1"
//   - Phase 2 에서 DB 스키마 (vat_sales_local → Supabase) 로 마이그레이션 예정
//   - 데이터 유실 위험 · UI 에서 안내 필수

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── 타입 ────────────────────────────────────────────────────────

/** 매출 유형 · 약국 실무 기준 (Phase 1 하드코딩 · Phase 2 마스터 테이블 분리) */
export type SaleType =
  | "카드매출"
  | "현금매출"
  | "현금영수증"
  | "세금계산서"
  | "처방조제매출";

/** 매출 유형별 기본 과세 여부 (처방조제만 면세) */
export const DEFAULT_TAXABLE_BY_TYPE: Record<SaleType, boolean> = {
  카드매출: true,
  현금매출: true,
  현금영수증: true,
  세금계산서: true,
  처방조제매출: false,
};

/** 매출 유형 옵션 (select) · Phase 1 고정 순서 */
export const SALE_TYPE_OPTIONS: SaleType[] = [
  "카드매출",
  "현금매출",
  "현금영수증",
  "세금계산서",
  "처방조제매출",
];

export interface SalesEntry {
  /** UUID or timestamp 기반 로컬 ID (Phase 2 에서 DB PK 로 교체) */
  id: string;
  /** YYYY-MM-DD */
  sale_date: string;
  sale_type: SaleType;
  /** true = 과세 · false = 면세 (처방조제 등) */
  taxable: boolean;
  /**
   * 매출 총액 (VAT 포함 여부는 매출 유형에 따라 다름)
   *   · Phase 1 · 총액(VAT 포함) 입력 원칙 · 과세면 vat = total/11
   *   · Phase 2 · 공급가액/부가세 분리 입력 옵션 검토
   */
  total_amount: number;
  /** 세금계산서 발행 시 상대 사업자명 (optional) */
  customer_name?: string;
  memo?: string;
  /** 등록 시각 (ISO) · 정렬용 */
  created_at: string;
}

/** 월별 요약 · SalesTab 테이블 표시용 */
export interface MonthlySalesSummary {
  /** YYYY-MM */
  month: string;
  taxable: number;        // 과세 공급가액 합계
  exempt: number;         // 면세 매출 합계
  outputVat: number;      // 매출세액 합계 (taxable 총액 → vat)
  cardTotal: number;      // 카드 매출 총액 (참고용 · 홈택스 신용카드 매출전표 발행분)
  cashTotal: number;      // 현금 매출 총액 (현금영수증 포함)
  taxInvoiceTotal: number; // 세금계산서 매출 총액
  rowCount: number;
}

// ─── localStorage 유틸 ──────────────────────────────────────────
const STORAGE_KEY = "megatown_vatSalesLocal_v1";

function loadFromLocal(): SalesEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // 형식 검증 (필수 필드 누락 시 스킵)
    return arr.filter(
      (r): r is SalesEntry =>
        r &&
        typeof r.id === "string" &&
        typeof r.sale_date === "string" &&
        typeof r.sale_type === "string" &&
        typeof r.total_amount === "number" &&
        typeof r.taxable === "boolean",
    );
  } catch {
    return [];
  }
}

function saveToLocal(entries: SalesEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* 저장 실패 시 무시 (quota 초과 등) */
  }
}

/** 신규 ID 생성 (crypto.randomUUID 폴백) */
function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch { /* noop */ }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── VAT 계산 ────────────────────────────────────────────────────

/**
 * 매출세액 계산 · taxable 인 경우 총액에서 VAT 를 뽑아냄 (10/110 rule)
 *   - Phase 1 · 총액 입력 → vat = round(total / 11)
 *   - 면세면 0
 */
export function calcOutputVat(entry: Pick<SalesEntry, "taxable" | "total_amount">): number {
  if (!entry.taxable) return 0;
  const total = Number(entry.total_amount) || 0;
  if (total <= 0) return 0;
  return Math.round(total / 11);
}

/** 공급가액 (과세면 total - vat · 면세면 total 그대로) */
export function calcSupply(entry: Pick<SalesEntry, "taxable" | "total_amount">): number {
  const total = Number(entry.total_amount) || 0;
  if (!entry.taxable) return total;
  const vat = calcOutputVat(entry);
  return Math.max(0, total - vat);
}

// ─── Hook ────────────────────────────────────────────────────────

export interface UseSalesLocalOptions {
  /** 기간 필터 · YYYY-MM-DD */
  from?: string;
  to?: string;
}

export interface UseSalesLocalResult {
  /** 기간 필터 적용 후 정렬된 매출 리스트 (최신 → 과거) */
  entries: SalesEntry[];
  /** 필터 없이 전체 (다른 기간 KPI 비교용) */
  allEntries: SalesEntry[];
  add: (entry: Omit<SalesEntry, "id" | "created_at">) => SalesEntry;
  update: (id: string, patch: Partial<Omit<SalesEntry, "id" | "created_at">>) => void;
  remove: (id: string) => void;
  clearAll: () => void;

  /** 기간 내 총 과세 공급가액 (매출세액 계산 base) */
  taxableSales: number;
  /** 기간 내 총 면세 매출 */
  exemptSales: number;
  /** 기간 내 총 매출세액 */
  outputVat: number;
  /** 기간 내 매출 건수 */
  salesRowCount: number;

  /** 월별 요약 (기간 내) · SalesTab 테이블에 표시 */
  monthlySummary: MonthlySalesSummary[];
}

export function useSalesLocal(opts: UseSalesLocalOptions = {}): UseSalesLocalResult {
  const [entries, setEntries] = useState<SalesEntry[]>(() => loadFromLocal());

  // storage → 다른 탭에서 변경 시 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEntries(loadFromLocal());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 변경 시 저장 (초기 로드도 저장 · 사이드이펙트 미미)
  useEffect(() => {
    saveToLocal(entries);
  }, [entries]);

  const add = useCallback(
    (entry: Omit<SalesEntry, "id" | "created_at">): SalesEntry => {
      const created: SalesEntry = {
        ...entry,
        id: newId(),
        created_at: new Date().toISOString(),
      };
      setEntries(prev => [created, ...prev]);
      return created;
    },
    [],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<SalesEntry, "id" | "created_at">>) => {
      setEntries(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setEntries(prev => prev.filter(r => r.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

  // 기간 필터
  const filtered = useMemo(() => {
    const list = entries.slice().sort((a, b) => {
      // 최신 매출일 우선 · 동일 날짜는 created_at DESC
      if (a.sale_date !== b.sale_date) return a.sale_date < b.sale_date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    if (!opts.from && !opts.to) return list;
    return list.filter(r => {
      if (opts.from && r.sale_date < opts.from) return false;
      if (opts.to && r.sale_date > opts.to) return false;
      return true;
    });
  }, [entries, opts.from, opts.to]);

  // 집계
  const { taxableSales, exemptSales, outputVat, salesRowCount } = useMemo(() => {
    let taxable = 0;
    let exempt = 0;
    let vat = 0;
    for (const r of filtered) {
      const v = calcOutputVat(r);
      if (r.taxable) {
        taxable += calcSupply(r);
        vat += v;
      } else {
        exempt += Number(r.total_amount) || 0;
      }
    }
    return {
      taxableSales: taxable,
      exemptSales: exempt,
      outputVat: vat,
      salesRowCount: filtered.length,
    };
  }, [filtered]);

  // 월별 요약
  const monthlySummary = useMemo<MonthlySalesSummary[]>(() => {
    const map = new Map<string, MonthlySalesSummary>();
    for (const r of filtered) {
      const month = r.sale_date.slice(0, 7); // YYYY-MM
      if (!map.has(month)) {
        map.set(month, {
          month,
          taxable: 0,
          exempt: 0,
          outputVat: 0,
          cardTotal: 0,
          cashTotal: 0,
          taxInvoiceTotal: 0,
          rowCount: 0,
        });
      }
      const m = map.get(month)!;
      m.rowCount += 1;
      if (r.taxable) {
        m.taxable += calcSupply(r);
        m.outputVat += calcOutputVat(r);
      } else {
        m.exempt += Number(r.total_amount) || 0;
      }
      if (r.sale_type === "카드매출") m.cardTotal += Number(r.total_amount) || 0;
      else if (r.sale_type === "현금매출" || r.sale_type === "현금영수증") m.cashTotal += Number(r.total_amount) || 0;
      else if (r.sale_type === "세금계산서") m.taxInvoiceTotal += Number(r.total_amount) || 0;
    }
    // 최신 월이 위로
    return Array.from(map.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [filtered]);

  return {
    entries: filtered,
    allEntries: entries,
    add,
    update,
    remove,
    clearAll,
    taxableSales,
    exemptSales,
    outputVat,
    salesRowCount,
    monthlySummary,
  };
}

export default useSalesLocal;
