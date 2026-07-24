// 2026-07-24 · RawOcrTable 리팩터 · 공급사 잔고 자동 로드 훅 (#4 부분)
//   OCR 완료 후 · supplierBalanceRecords + structuredPages 매칭 → pageBalanceOverride 채움
import { useEffect } from "react";
import type React from "react";
import type { RawPage } from "./types";

interface SupplierBalanceRecord {
  supplier_name: string;
  balance: number;
}

interface Args {
  supplierBalanceRecords: SupplierBalanceRecord[];
  structuredPages: RawPage[];
  rawSupplierByPage: Record<number, string>;
  setPageBalanceOverride: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

/** 공급사별 최신 잔고를 pageBalanceOverride 에 자동 채움 · 사용자 override 있으면 skip */
export function useAutoBalanceLoad({
  supplierBalanceRecords,
  structuredPages,
  rawSupplierByPage,
  setPageBalanceOverride,
}: Args) {
  useEffect(() => {
    if (supplierBalanceRecords.length === 0 || structuredPages.length === 0) return;
    // 공급사별 최신 잔고 (records 순서 = created_at DESC · 첫 등장 = 최신)
    const latestBySupplier = new Map<string, number>();
    for (const r of supplierBalanceRecords) {
      const name = String(r.supplier_name ?? "").trim();
      if (!name) continue;
      if (!latestBySupplier.has(name)) latestBySupplier.set(name, Number(r.balance) || 0);
    }
    setPageBalanceOverride(prev => {
      const next = { ...prev };
      let changed = false;
      for (const pageObj of structuredPages) {
        const pn = pageObj.page;
        if (prev[pn] !== undefined) continue;  // 이미 사용자 override 있으면 skip
        const supplier = (rawSupplierByPage[pn] ?? pageObj.meta.supplier ?? "").trim();
        if (!supplier) continue;
        const bal = latestBySupplier.get(supplier);
        if (bal != null && bal > 0) {
          next[pn] = bal;
          changed = true;
        }
      }
      if (!changed) return prev;
      console.log(`[balance auto-load] ${Object.keys(next).length}개 페이지에 공급사 최신 잔고 자동 채움`);
      return next;
    });
  }, [supplierBalanceRecords, structuredPages, rawSupplierByPage, setPageBalanceOverride]);
}
