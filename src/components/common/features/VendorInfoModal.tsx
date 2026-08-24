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
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../../hooks/useToast";
import { Modal } from "../Modal";

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
    // 2026-08-24 · 공급사 조회 즉시 닫힘 fix · closeOnBackdrop=false · panel 모드 강제 (중첩 backdrop 제거)
    // 이전 · Modal + VendorDetailModal 각자 backdrop 2중 · 클릭 시 즉시 닫힘
    // 개선 · panel 모드로 embedded · Modal 이 유일한 backdrop
    <Modal
      open
      onClose={onClose}
      zIndex={100}
      size="3xl"
      bodyPadding="none"
      showClose={false}
      closeOnBackdrop={false}
    >
      <VendorDetailModal vendor={vendor} onClose={onClose} onSaved={handleSaved} panel />
    </Modal>
  );
};

// ─── useVendorInfoModal ───────────────────────────────────────────────────────

export type VendorRef = string | number | Vendor;

export function useVendorInfoModal(opts?: { onSaved?: () => void }) {
  const { vendors, findVendorByName } = useVendors();
  const [openVendor, setOpenVendor] = useState<Vendor | null>(null);
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

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
        showError(`공급사 정보 없음 (id: ${ref})`);
        return;
      }

      // 이름(string)
      const name = String(ref).trim();
      if (!name) return;
      const found = findVendorByName(name);
      // useVendors.Vendor has an index signature; cast to VendorListEditor.Vendor
      if (found) { setOpenVendor(found as unknown as Vendor); return; }
      showError(`공급사 정보 없음: ${ref}`);
    },
    [vendors, findVendorByName, showError],
  );

  const handleClose = useCallback(() => setOpenVendor(null), []);

  const modalElement: React.ReactNode = (
    <>
      {openVendor && (
        <VendorInfoModal
          vendor={openVendor}
          onClose={handleClose}
          onSaved={opts?.onSaved}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </>
  );

  return { openVendorInfo, modalElement };
}

export default VendorInfoModal;
