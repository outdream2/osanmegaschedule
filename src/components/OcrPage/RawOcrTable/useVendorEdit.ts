import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/apiClient";
import { useVendors } from "../../../hooks/useVendors";
import type { Vendor } from "../../LandingPage/VendorListEditor";

interface UseVendorEditParams {
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  showError: (msg: string) => void;
}

export function useVendorEdit({ confirm, showError }: UseVendorEditParams) {
  const { vendors: _ocrVendors, refresh: refreshVendors } = useVendors();

  const [vendorEditModal, setVendorEditModal] = useState<Vendor | null>(null);
  const [editingRawSuppRow, setEditingRawSuppRow] = useState<number | null>(null);
  const [editingRawSuppVal, setEditingRawSuppVal] = useState("");
  const [supplierConfirm, setSupplierConfirm] = useState<{ pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null>(null);
  const [suppDropdownRect, setSuppDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const suppInputRef = useRef<HTMLInputElement | null>(null);

  const vendorNames = useMemo<string[]>(
    () => (_ocrVendors as unknown as Vendor[]).map(v => String(v.company_name ?? "").trim()).filter(Boolean),
    [_ocrVendors],
  );

  const openVendorEdit = useCallback(async (supplierName: string) => {
    const name = supplierName.trim();
    if (!name) return;
    const norm = (s: string) => s.toLowerCase().replace(/[()（）\s㈜(주)주식회사]/g, "");
    const target = norm(name);
    let match = (_ocrVendors as unknown as Vendor[]).find(v => norm(String(v.company_name ?? "")) === target);
    if (!match) match = (_ocrVendors as unknown as Vendor[]).find(v => norm(String(v.company_name ?? "")).includes(target) || target.includes(norm(String(v.company_name ?? ""))));
    if (match) { setVendorEditModal(match); return; }
    if (await confirm({ message: `"${name}" 은(는) 공급사 DB 에 없습니다.\n신규 등록하시겠습니까?` })) {
      try {
        const { data: newV } = await api.post<Vendor>("/api/vendors", { company_name: name });
        setVendorEditModal(newV);
        refreshVendors();
      } catch (e) {
        console.error("[공급사조회] 실패:", e);
        showError("공급사 신규 등록 실패");
      }
    }
  }, [_ocrVendors, refreshVendors, showError, confirm]);

  return {
    vendorNames,
    vendorEditModal, setVendorEditModal,
    editingRawSuppRow, setEditingRawSuppRow,
    editingRawSuppVal, setEditingRawSuppVal,
    supplierConfirm, setSupplierConfirm,
    suppDropdownRect, setSuppDropdownRect,
    suppInputRef,
    openVendorEdit,
  };
}
