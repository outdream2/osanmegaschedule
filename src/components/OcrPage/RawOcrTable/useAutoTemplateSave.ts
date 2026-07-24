// 2026-07-24 · RawOcrTable 리팩터 · 템플릿 자동 저장 훅 (#4 부분)
//   structuredPages 도착 시 · 공급사 템플릿 DB 에 없으면 · 자동으로 saveTemplate 호출
import { useEffect, useRef } from "react";
import type { RawPage } from "./types";

interface Args {
  structuredPages: RawPage[];
  rawSupplierByPage: Record<number, string>;
  saveTemplate: (pageNum: number, supplierName: string) => Promise<void>;
}

/** 공급사 템플릿 DB 에 없으면 자동으로 saveTemplate 호출 · 중복 방지용 ref 내부 관리 */
export function useAutoTemplateSave({ structuredPages, rawSupplierByPage, saveTemplate }: Args) {
  const templateAutoSavedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (structuredPages.length === 0) return;
    const pageSupplierPairs = structuredPages
      .map(p => ({ pn: p.page, supplier: (rawSupplierByPage[p.page] ?? p.meta.supplier ?? "").trim() }))
      .filter(x => x.supplier);
    if (pageSupplierPairs.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/ocr-templates");
        if (!res.ok) return;
        const data = await res.json();
        const templates: any[] = Array.isArray(data?.templates) ? data.templates : [];
        const existingSuppliers = new Set(templates.map(t => String(t.supplier_name ?? "").trim()));
        for (const { pn, supplier } of pageSupplierPairs) {
          if (existingSuppliers.has(supplier)) continue;
          if (templateAutoSavedRef.current.has(supplier)) continue;
          templateAutoSavedRef.current.add(supplier);
          console.log(`[템플릿 자동저장] "${supplier}" DB 에 없음 → 새 템플릿 저장 (page ${pn})`);
          await saveTemplate(pn, supplier);
        }
      } catch (e: any) {
        console.warn("[템플릿 자동저장] 실패:", e?.message);
      }
    })();
  }, [structuredPages, rawSupplierByPage, saveTemplate]);
}
