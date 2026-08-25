// src/components/DisplayPage/DisplayModals.tsx
// 2026-08-25 · Framework Phase 4 · large-file 분리 · DisplayPage.tsx 에서 이관
//   · 4 modals wrapper · ZoneAssignPopover · ZoneDetailModal · StaffInfoModal · ZoneProductsModal · ProductInfoModal
//   · 재사용성보다 slim화 목적 · 각 modal 은 독자적으로 이미 분리됨 · props 그대로 전달

import React from "react";
import { ZoneAssignPopover } from "./ZoneAssignPopover";
import { ZoneDetailModal } from "./ZoneDetailModal";
import { StaffInfoModal } from "./StaffInfoModal";
import { ZoneProductsModal, type ZoneProductsModalState } from "./ZoneProductsModal";
import { ProductInfoModal } from "./ProductInfoModal";
import type { DisplayRequest, Employee, TodayStaff, PopoverAnchor } from "./DisplayPage.types";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { ProductInfo } from "../../lib/productsCache";
import type { ZoneGroup } from "./ZoneGroupPanel";

interface DisplayModalsProps {
  // Popover
  popoverAnchor: PopoverAnchor | null;
  popoverZone: DisplayZone | null;
  logisticsStaff: TodayStaff[];
  staffColorMap: Map<number, number>;
  handlePopoverAssign: (staffId: number, staffName: string) => void;
  handlePopoverUnassign: () => void;
  handleOpenZoneDetail: (zone: DisplayZone) => void;
  openZoneProducts: (params: ZoneProductsModalState) => void;
  setPopoverAnchor: (v: PopoverAnchor | null) => void;
  setActiveStaffInfo: React.Dispatch<React.SetStateAction<TodayStaff | null>>;
  setZoneDefs: React.Dispatch<React.SetStateAction<any[]>>;

  // Zone Detail
  activeZone: DisplayZone | null;
  draftCategory: string;
  draftProducts: string;
  draftStaffId: number | null;
  draftStatus: string;
  requestNote: string;
  savedFlash: boolean;
  requestFlash: boolean;
  employees: Employee[];
  canRequest: boolean;
  setActiveZoneId: (id: string | null) => void;
  setDraftStaffId: (v: number | null) => void;
  setDraftProducts: (v: string) => void;
  setDraftStatus: (v: any) => void;
  setRequestNote: (v: string) => void;
  handleSave: () => void;
  handleSendRequest: () => void;
  setScannerMode: (v: "search" | "products" | null) => void;
  toggleZoneDow: (zoneId: string, nameKey: string, dow: number) => void;

  // Staff Info
  activeStaffInfo: TodayStaff | null;
  zones: DisplayZone[];
  setZones: React.Dispatch<React.SetStateAction<DisplayZone[]>>;

  // Zone Products
  zoneProductsModal: ZoneProductsModalState | null;
  productsMap: Record<string, ProductInfo>;
  zoneProductsFilter: "all" | "mismatch";
  zoneProductsSearch: string;
  zoneProductsSort: { key: any; dir: "asc" | "desc" };
  setZoneProductsModal: (v: ZoneProductsModalState | null) => void;
  setZoneProductsFilter: (v: "all" | "mismatch") => void;
  setZoneProductsSearch: (v: string) => void;
  setZoneProductsSort: (v: any) => void;

  // Product Info
  productInfoModal: ProductInfo | null;
  setProductInfoModal: React.Dispatch<React.SetStateAction<ProductInfo | null>>;
  setProductsMap: React.Dispatch<React.SetStateAction<Record<string, ProductInfo>>>;
}

export const DisplayModals: React.FC<DisplayModalsProps> = (p) => (
  <>
    {/* Zone Assignment Popover */}
    {p.popoverAnchor && p.popoverZone && (
      <ZoneAssignPopover
        zone={p.popoverZone} anchor={p.popoverAnchor.rect} logisticsStaff={p.logisticsStaff} staffColorMap={p.staffColorMap}
        onAssign={p.handlePopoverAssign} onUnassign={p.handlePopoverUnassign} onOpenDetail={() => p.handleOpenZoneDetail(p.popoverZone!)}
        onOpenProducts={() => { p.openZoneProducts({ zoneId: p.popoverZone!.id, zoneNum: p.popoverZone!.num, zoneLabel: p.popoverZone!.label, category: p.popoverZone!.category }); p.setPopoverAnchor(null); }}
        onClose={() => p.setPopoverAnchor(null)} onStaffInfoClick={(staff) => { p.setActiveStaffInfo(staff); p.setPopoverAnchor(null); }}
        onZoneUpdate={(updates) => {
          const pz = p.popoverZone!;
          p.setZoneDefs((prev) => prev.map((z: any) => (
            z.num === pz.num
              ? { ...z, ...(updates.label != null ? { label: updates.label } : {}), ...(updates.category != null ? { category: updates.category } : {}), ...(updates.num != null ? { num: updates.num } : {}) }
              : z
          )));
        }}
      />
    )}

    {/* Zone Detail Modal */}
    {p.activeZone && (
      <ZoneDetailModal
        activeZone={p.activeZone} draftCategory={p.draftCategory} draftProducts={p.draftProducts} draftStaffId={p.draftStaffId}
        draftStatus={p.draftStatus as any} requestNote={p.requestNote} savedFlash={p.savedFlash} requestFlash={p.requestFlash}
        employees={p.employees} staffColorMap={p.staffColorMap} canRequest={p.canRequest}
        onClose={() => p.setActiveZoneId(null)} onSetDraftStaffId={p.setDraftStaffId} onSetDraftProducts={p.setDraftProducts}
        onSetDraftStatus={p.setDraftStatus} onSetRequestNote={p.setRequestNote} onSave={p.handleSave}
        onSendRequest={p.handleSendRequest} onScanProducts={() => p.setScannerMode("products")} toggleZoneDow={p.toggleZoneDow}
      />
    )}

    {/* Employee Info Modal */}
    {p.activeStaffInfo && (
      <StaffInfoModal
        activeStaffInfo={p.activeStaffInfo} zones={p.zones} employees={p.employees} staffColorMap={p.staffColorMap}
        onClose={() => p.setActiveStaffInfo(null)}
        onZoneToggle={(zoneId, empId, empName, isAssigned) => {
          p.setZones(prev => prev.map(zone => zone.id !== zoneId ? zone : (isAssigned ? { ...zone, assignedStaffId: null, assignedStaffName: "" } : { ...zone, assignedStaffId: empId, assignedStaffName: empName })));
        }}
        onClearAllZones={(empId) => { p.setZones(prev => prev.map(z => z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z)); }}
      />
    )}

    {/* Zone Products Modal */}
    {p.zoneProductsModal && (
      <ZoneProductsModal
        modal={p.zoneProductsModal} productsMap={p.productsMap} filter={p.zoneProductsFilter}
        search={p.zoneProductsSearch} sort={p.zoneProductsSort}
        onClose={() => p.setZoneProductsModal(null)} onSetFilter={p.setZoneProductsFilter}
        onSetSearch={p.setZoneProductsSearch} onSetSort={p.setZoneProductsSort}
        onProductClick={(prod) => { p.setProductInfoModal(prod); p.setZoneProductsModal(null); }}
      />
    )}

    {/* Product Info Modal */}
    {p.productInfoModal && (
      <ProductInfoModal
        product={p.productInfoModal} onClose={() => p.setProductInfoModal(null)}
        onRealMapUpdate={(newValue) => {
          const pim = p.productInfoModal!;
          p.setProductInfoModal(prev => prev ? { ...prev, real_map: newValue } : prev);
          p.setProductsMap(prev => { const code = String(pim.code ?? "").trim(); if (!code || !prev[code]) return prev; return { ...prev, [code]: { ...prev[code], real_map: newValue } }; });
        }}
        onProductUpdate={(updates) => {
          const pim = p.productInfoModal!;
          p.setProductInfoModal(prev => prev ? { ...prev, ...updates } : prev);
          p.setProductsMap(prev => { const code = String(pim.code ?? "").trim(); if (!code || !prev[code]) return prev; return { ...prev, [code]: { ...prev[code], ...updates } }; });
        }}
      />
    )}
  </>
);

export default DisplayModals;
// Re-export for consumers that need the type from wrapper
export type { ZoneGroup };
