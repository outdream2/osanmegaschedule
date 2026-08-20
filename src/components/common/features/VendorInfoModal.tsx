// src/components/common/features/VendorInfoModal.tsx
// T-COMMON-VendorInfoModal · 공급사 상세 모달 공통 wrapper + 훅 (2026-08-06)
//
// VendorInfoModal  · backdrop-blur + max-w-3xl · click-outside close · VendorDetailModal 포함
// useVendorInfoModal · 다음 반환:
//   openVendorInfo(vendorNameOrId) — 이름/id/Vendor 객체로 열기
//   modalElement  — 페이지 root 에 한번 렌더
//
// 사용처 (예정):
//   PurchaseHistoryTab / PaymentInfoTab / ReturnListPanel / OrderManagePage

import React, { useCallback, useState } from "react";
import { VendorDetailModal } from "../../LandingPage/VendorListEditor";
import type { Vendor } from "../../LandingPage/VendorListEditor";
import { useVendors } from "../../../hooks/useVendors";

// ─── VendorInfoModal ──────────────────────────────────────────────────────────

export interface VendorInfoModalProps {
  vendor: Vendor;
  onClose: () => void;
  /** 저장 후 캐시 무효화 등 부모가 처리할 콜백 (생략 가능) */
  onSaved?: () => void;
}

export const VendorInfoModal: React.FC<VendorInfoModalProps> = ({ vendor, onClose, onSaved }) => {
  const handleSaved = useCallback(() => {
    onSaved?.();
    onClose();
  }, [onSaved, onClose]);

  return (
    // 2026-08-17 v2 · frosted backdrop + 3-layer shadow · Modal 통일
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <VendorDetailModal vendor={vendor} onClose={onClose} onSaved={handleSaved} />
      </div>
    </div>
  );
};

// ─── useVendorInfoModal ───────────────────────────────────────────────────────

export type VendorRef = string | number | Vendor;

export function useVendorInfoModal(opts?: { onSaved?: () => void }) {
  const { vendors, findVendorByName } = useVendors();
  const [openVendor, setOpenVendor] = useState<Vendor | null>(null);

  /** 이름(string) · id(number) · Vendor 객체 로 열기 */
  const openVendorInfo = useCallback(
    (ref: VendorRef | null | undefined) => {
      if (ref == null) return;

      // Vendor 객체 직접 전달
      if (typeof ref === "object" && "company_name" in ref) {
        setOpenVendor(ref as Vendor);
        return;
      }

      // id(number)
      if (typeof ref === "number") {
        const found = vendors.find((v) => v.id === ref);
        // useVendors.Vendor has an index signature; cast to VendorListEditor.Vendor
        if (found) { setOpenVendor(found as unknown as Vendor); return; }
        alert(`공급사 정보 없음 (id: ${ref})`);
        return;
      }

      // 이름(string)
      const name = String(ref).trim();
      if (!name) return;
      const found = findVendorByName(name);
      // useVendors.Vendor has an index signature; cast to VendorListEditor.Vendor
      if (found) { setOpenVendor(found as unknown as Vendor); return; }
      alert(`공급사 정보 없음: ${ref}`);
    },
    [vendors, findVendorByName],
  );

  const handleClose = useCallback(() => setOpenVendor(null), []);

  const modalElement: React.ReactNode = openVendor ? (
    <VendorInfoModal
      vendor={openVendor}
      onClose={handleClose}
      onSaved={opts?.onSaved}
    />
  ) : null;

  return { openVendorInfo, modalElement };
}

export default VendorInfoModal;
