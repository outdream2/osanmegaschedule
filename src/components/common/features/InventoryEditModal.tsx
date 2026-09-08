// src/components/common/features/InventoryEditModal.tsx
// 실재고 입력 모달 · InventoryEditPanel 을 Modal 로 감쌈 · 누적(add) 방식
// zone별 저장: POST /api/inventory-checks (모든 필드 포함 · 해당 zone 만 newTotal)
// 저장 완료 후: CustomEvent "inventory-checks-updated" dispatch

// 2026-08-17 · apiClient 마이그레이션
import React, { useState } from "react";
import { api } from "../../../lib/apiClient";
import { Modal } from "../Modal";
import { InventoryEditPanel, type ZoneKey } from "../InventoryEditPanel";
import type { CurrentValues } from "../InventoryEditPanel";
import { useToast, toastClass } from "../../../hooks/useToast";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface InventoryEditModalInitialValues {
  w1?: number | null;
  w2?: number | null;
  s1?: number | null;
  s2?: number | null;
  s3?: number | null;
  s1z?: string | null;
  s2z?: string | null;
  s3z?: string | null;
  // 2026-09-08 · 상세 진열위치 초기값 (편집 · zone별 저장 시 병합)
  shelf_positions?: Record<string, string | null | undefined> | null;
}

export interface InventoryEditModalProps {
  open: boolean;
  productCode: string;
  productName: string;
  initialValues?: InventoryEditModalInitialValues;
  checkedBy?: string;
  onSaved?: () => void;
  onClose: () => void;
  // 2026-09-08 · 실시간 중복 검증 · 상품의 진열구역 · 있으면 각 ShelfPositionInput 에 전달
  displayLocation?: string | null;
}

// null/undefined → 0 로 정규화 (누적 방식 · 기준값)
function normalizeInitial(iv?: InventoryEditModalInitialValues): CurrentValues {
  return {
    w1:  iv?.w1  != null ? Number(iv.w1)  : 0,
    w2:  iv?.w2  != null ? Number(iv.w2)  : 0,
    s1:  iv?.s1  != null ? Number(iv.s1)  : 0,
    s2:  iv?.s2  != null ? Number(iv.s2)  : 0,
    s3:  iv?.s3  != null ? Number(iv.s3)  : 0,
    s1z: iv?.s1z ?? null,
    s2z: iv?.s2z ?? null,
    s3z: iv?.s3z ?? null,
    // 2026-09-08 · 상세 진열위치 · JSONB · 편집 시 병합
    shelf_positions: iv?.shelf_positions ?? {},
  };
}

// 2026-09-08 · zone → storage_location code 매핑 (InventoryEditPanel 와 동일)
const ZONE_TO_LOCATION: Record<"w1" | "w2" | "s1" | "s2" | "s3", string> = {
  w1: "warehouse1", w2: "warehouse2",
  s1: "store1", s2: "store2", s3: "store3",
};

// ─────────────────────────────────────────────────────────────
// InventoryEditModal
// ─────────────────────────────────────────────────────────────
export const InventoryEditModal: React.FC<InventoryEditModalProps> = ({
  open,
  productCode,
  productName,
  initialValues,
  checkedBy,
  onSaved,
  onClose,
  displayLocation,
}) => {
  const { toast, showSuccess, showError } = useToast();
  const [currentValues, setCurrentValues] = useState<CurrentValues>(() => normalizeInitial(initialValues));
  const [savingZone, setSavingZone] = useState<ZoneKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // open/productCode 변경 시 값 초기화
  React.useEffect(() => {
    if (open) {
      setCurrentValues(normalizeInitial(initialValues));
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productCode]);

  const handleSaveZone = async (
    zone: ZoneKey,
    newTotal: number,
    zoneLabel?: string | null,
    shelfDetail?: string | null,
  ) => {
    if (savingZone) return;
    setSavingZone(zone);
    setError(null);

    // 해당 zone 만 newTotal · 나머지는 currentValues 그대로
    const next: CurrentValues = { ...currentValues };
    if (zone === "w1") next.w1 = newTotal;
    else if (zone === "w2") next.w2 = newTotal;
    else if (zone === "s1") { next.s1 = newTotal; if (zoneLabel !== undefined) next.s1z = zoneLabel ?? null; }
    else if (zone === "s2") { next.s2 = newTotal; if (zoneLabel !== undefined) next.s2z = zoneLabel ?? null; }
    else if (zone === "s3") { next.s3 = newTotal; if (zoneLabel !== undefined) next.s3z = zoneLabel ?? null; }

    // 2026-09-08 · 상세위치 병합 · 해당 zone 만 UPDATE · 기존 값 보존
    const locCode = ZONE_TO_LOCATION[zone];
    const nextShelf = { ...(currentValues.shelf_positions ?? {}) } as Record<string, string | null>;
    if (shelfDetail !== undefined) {
      nextShelf[locCode] = shelfDetail; // null → 미입력 · string → 3자리
    }
    next.shelf_positions = nextShelf;

    try {
      await api.post("/api/inventory-checks", {
        product_code:     productCode,
        product_name:     productName,
        checked_by:       checkedBy ?? "",
        warehouse1_stock: next.w1,
        warehouse2_stock: next.w2,
        store_stock:      next.s1,
        store_stock_2:    next.s2,
        store3_stock:     next.s3,
        store1_zone:      next.s1z,
        store2_zone:      next.s2z,
        store3_zone:      next.s3z,
        warehouse_stock:  next.w1, // 레거시 mirror
        // 2026-09-08 · 상세 진열위치 · 서버에서 병합 처리
        shelf_positions:  nextShelf,
      });
      setCurrentValues(next);
      showSuccess("재고가 저장되었습니다");
      window.dispatchEvent(new CustomEvent("inventory-checks-updated"));
      onSaved?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.";
      setError(msg);
      showError(msg);
    } finally {
      setSavingZone(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="실재고 입력 · 편집"
      size="sm"
      footer={
        <div className="flex items-center gap-2 w-full">
          {error && (
            <span className="flex-1 text-[13px] text-rose-600 font-medium truncate">{error}</span>
          )}
          {toast && (
            <span className={toastClass(toast.tone)}>{toast.message}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-lg text-[14px] font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      }
    >
      <InventoryEditPanel
        productCode={productCode}
        productName={productName}
        currentValues={currentValues}
        onSaveZone={handleSaveZone}
        savingZone={savingZone}
        displayLocation={displayLocation}
      />
    </Modal>
  );
};

export default InventoryEditModal;
