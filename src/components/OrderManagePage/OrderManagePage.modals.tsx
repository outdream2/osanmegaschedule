// src/components/OrderManagePage/OrderManagePage.modals.tsx
// 2026-08-25 · Framework Phase 4 · large-file 분리 · OrderManagePage.tsx 모달 래퍼 이관
// 2026-08-31 · #32 · ProductDetailModal 제거 · TrendingTab 에 useProductDetailModal 내장
//   · OrderModal · ContactPopover · VendorDetailModal(supplier info) · InventoryEditModal · toast
//   · self-contained render · props 로 state/setter 전달

import React from "react";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { Modal } from "../common/Modal";
import { toastClass } from "../../hooks/useToast";
import { InventoryEditModal, type InventoryEditModalInitialValues } from "../common/features/InventoryEditModal";
import { OrderModal } from "./OrderModal";
import { ContactPopover } from "./ContactPopover";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";

interface OrderManageModalsProps {
  // OrderModal
  orderModal: any;
  sendingBulk: boolean;
  notifyLogisticsLeader: boolean;
  setNotifyLogisticsLeader: (v: boolean) => void;
  setOrderModal: React.Dispatch<React.SetStateAction<any>>;
  submitOrderModal: () => void | Promise<void>;
  updateModalItem: (supIdx: number, itemIdx: number, patch: any) => void;
  // Contact popover
  contactPopover: null | { anchor: DOMRect; name: string; phone: string | null; email: string | null };
  setContactPopover: (v: null | { anchor: DOMRect; name: string; phone: string | null; email: string | null }) => void;
  // Supplier info modal (VendorDetailModal panel)
  supplierInfoModal: Vendor | null;
  setSupplierInfoModal: (v: Vendor | null) => void;
  // Inventory edit modal
  inventoryEditModal: { code: string; name: string; initialValues: InventoryEditModalInitialValues } | null;
  setInventoryEditModal: (v: { code: string; name: string; initialValues: InventoryEditModalInitialValues } | null) => void;
  loadInvMap: () => void | Promise<void>;
  // Toast
  toast: { message: string; tone?: any } | null;
}

export const OrderManageModals: React.FC<OrderManageModalsProps> = (p) => (
  <>
    {/* 발주서 모달 */}
    {p.orderModal && (
      <OrderModal
        orderModal={p.orderModal} sendingBulk={p.sendingBulk}
        notifyLogisticsLeader={p.notifyLogisticsLeader} setNotifyLogisticsLeader={p.setNotifyLogisticsLeader}
        onClose={() => !p.sendingBulk && p.setOrderModal(null)} onSubmit={p.submitOrderModal}
        onUpdateModalItem={p.updateModalItem}
        onDateChange={(field, value) => p.setOrderModal((prev: any) => prev && ({ ...prev, [field]: value }))}
        onChannelChange={(ch, value) => p.setOrderModal((prev: any) => prev && ({ ...prev, channels: { ...prev.channels, [ch]: value } }))}
      />
    )}

    {/* 담당자 팝오버 */}
    {p.contactPopover && (
      <ContactPopover anchor={p.contactPopover.anchor} name={p.contactPopover.name}
        phone={p.contactPopover.phone} email={p.contactPopover.email} onClose={() => p.setContactPopover(null)} />
    )}

    {/* 공급사 정보 모달 · 2026-08-24 · 즉시 닫힘 버그 fix · closeOnBackdrop=false */}
    <Modal
      open={!!p.supplierInfoModal}
      onClose={() => p.setSupplierInfoModal(null)}
      size="xl"
      showClose={false}
      closeOnEsc={false}
      closeOnBackdrop={false}
      bodyPadding="none"
      className="h-[95vh] md:min-h-[85vh] md:max-h-[92vh]"
    >
      {p.supplierInfoModal && (
        <VendorDetailModal vendor={p.supplierInfoModal} onClose={() => p.setSupplierInfoModal(null)} onSaved={() => p.setSupplierInfoModal(null)} panel />
      )}
    </Modal>

    {p.inventoryEditModal && (
      <InventoryEditModal open={true} productCode={p.inventoryEditModal.code} productName={p.inventoryEditModal.name}
        initialValues={p.inventoryEditModal.initialValues} onSaved={() => { p.loadInvMap(); }} onClose={() => p.setInventoryEditModal(null)} />
    )}

    {p.toast && (
      <div className="fixed bottom-6 right-6 z-[9999]">
        <div className={toastClass(p.toast.tone)}>{p.toast.message}</div>
      </div>
    )}
  </>
);

export default OrderManageModals;
