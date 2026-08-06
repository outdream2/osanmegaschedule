// src/components/common/VendorInfoModal.tsx
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
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { useVendors } from "../../hooks/useVendors";

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
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl"
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setOpenVendor(ref as any);
        return;
      }

      // id(number)
      if (typeof ref === "number") {
        const found = vendors.find((v) => v.id === ref);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (found) { setOpenVendor(found as any); return; }
        alert(`공급사 정보 없음 (id: ${ref})`);
        return;
      }

      // 이름(string)
      const name = String(ref).trim();
      if (!name) return;
      const found = findVendorByName(name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (found) { setOpenVendor(found as any); return; }
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
