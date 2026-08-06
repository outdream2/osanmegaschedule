// src/components/common/InventoryEditModal.tsx
// 실재고 입력 모달 · InventoryEditPanel 을 Modal 로 감쌈
// 저장: POST /api/inventory-checks (기존 endpoint 재사용)
// 저장 완료 후: CustomEvent "inventory-checks-updated" dispatch

import React, { useState } from "react";
import { Modal } from "./Modal";
import { InventoryEditPanel, type InventoryValues } from "./InventoryEditPanel";

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
}

export interface InventoryEditModalProps {
  open: boolean;
  productCode: string;
  productName: string;
  initialValues?: InventoryEditModalInitialValues;
  checkedBy?: string;
  onSaved?: () => void;
  onClose: () => void;
}

// null/undefined → "" 로 정규화
function normalizeInitial(iv?: InventoryEditModalInitialValues): InventoryValues {
  return {
    w1:  iv?.w1  != null ? Number(iv.w1)  : "",
    w2:  iv?.w2  != null ? Number(iv.w2)  : "",
    s1:  iv?.s1  != null ? Number(iv.s1)  : "",
    s2:  iv?.s2  != null ? Number(iv.s2)  : "",
    s3:  iv?.s3  != null ? Number(iv.s3)  : "",
    s1z: iv?.s1z ?? null,
    s2z: iv?.s2z ?? null,
    s3z: iv?.s3z ?? null,
  };
}

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
}) => {
  const [values, setValues] = useState<InventoryValues>(() => normalizeInitial(initialValues));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // initialValues 가 바뀌면 (다른 상품 클릭) 필드 리셋
  const prevCode = React.useRef<string>("");
  if (open && productCode !== prevCode.current) {
    prevCode.current = productCode;
    // 컴포넌트 렌더 중 setState는 금지 — effect 대신 render 중 ref + lazy init 패턴 사용
    // 여기서는 open 될 때마다 initialValues 로 리셋을 원하므로
    // key prop 을 부모에서 productCode 로 설정하거나, useEffect 로 처리
  }

  // open/productCode 변경 시 값 초기화
  React.useEffect(() => {
    if (open) {
      setValues(normalizeInitial(initialValues));
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productCode]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code:     productCode,
          product_name:     productName,
          checked_by:       checkedBy ?? "",
          warehouse1_stock: values.w1 !== "" ? Number(values.w1) : null,
          warehouse2_stock: values.w2 !== "" ? Number(values.w2) : null,
          store_stock:      values.s1 !== "" ? Number(values.s1) : null,   // 매장1
          store_stock_2:    values.s2 !== "" ? Number(values.s2) : null,   // 매장2
          store3_stock:     values.s3 !== "" ? Number(values.s3) : null,   // 매장3
          store1_zone:      values.s1z,
          store2_zone:      values.s2z,
          store3_zone:      values.s3z,
          // 레거시 mirror
          warehouse_stock:  values.w1 !== "" ? Number(values.w1) : null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? `저장 실패 (${res.status})`);
      }
      // 다른 탭/컴포넌트에 재조회 트리거
      window.dispatchEvent(new CustomEvent("inventory-checks-updated"));
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
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
            <span className="flex-1 text-[11px] text-rose-600 font-medium truncate">{error}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-[12px] font-bold text-white bg-violet-600 hover:bg-violet-700 active:bg-violet-800 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      }
    >
      <InventoryEditPanel
        productCode={productCode}
        productName={productName}
        values={values}
        onChange={setValues}
      />
    </Modal>
  );
};

export default InventoryEditModal;
