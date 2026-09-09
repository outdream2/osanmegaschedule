// src/components/common/ShelfPositionsEditModal.tsx
// 2026-09-09 · #15 · 상세구역 편집 모달 (사용자 지시 · B안 · 모달 편집)
//   · storage_locations 활성 위치 전부 표시 · 3자리 stepper 편집
//   · 저장 · PATCH /api/products/:code/shelf-positions · atomic replace
//   · 저장 성공 시 · invalidateShelfPositionsMap + inventory-checks-updated dispatch · 전 화면 자동 반영

import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useStorageLocations } from "../../hooks/useStorageLocations";
import { invalidateShelfPositionsMap } from "../../hooks/useShelfPositionsMap";
import { ShelfPositionInput } from "./ShelfPositionInput";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import type { ShelfPositions } from "../../lib/shelfPositions";

export interface ShelfPositionsEditModalProps {
  productCode: string;
  productName?: string;
  displayLocation?: string | null;
  initial?: ShelfPositions | null;
  onClose: () => void;
  onSaved?: (next: ShelfPositions) => void;
}

export const ShelfPositionsEditModal: React.FC<ShelfPositionsEditModalProps> = ({
  productCode, productName, displayLocation, initial, onClose, onSaved,
}) => {
  const locations = useStorageLocations();
  const activeLocs = useMemo(
    () => locations.filter(l => l.active).sort((a, b) => a.sort_order - b.sort_order),
    [locations],
  );
  // 편집 상태 · 초기값 = initial 에 있는 값 or null
  const [draft, setDraft] = useState<ShelfPositions>(() => {
    const seed: ShelfPositions = {};
    for (const loc of activeLocs) {
      const v = initial?.[loc.code];
      seed[loc.code] = typeof v === "string" && v.length === 3 ? v : null;
    }
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError } = useToast();

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/products/${encodeURIComponent(productCode)}/shelf-positions`, {
        shelf_positions: draft,
      });
      invalidateShelfPositionsMap();
      window.dispatchEvent(new CustomEvent("inventory-checks-updated"));
      showSuccess("상세구역 저장 완료");
      onSaved?.(draft);
      onClose();
    } catch (e: any) {
      console.error("[ShelfPositionsEditModal] save error", e);
      showError(e?.response?.data?.error?.message ?? e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden border border-line"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24)" }}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-line bg-zinc-50/60 shrink-0">
          <div className="w-1.5 rounded-full bg-brand-deep self-stretch" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink leading-tight tracking-tight">상세구역 편집</div>
            {productName && (
              <div className="text-[13px] text-ink-soft mt-1 truncate">
                {productName}
                {displayLocation && <span className="ml-1.5 text-zinc-400">· {displayLocation}</span>}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer shrink-0 transition-colors disabled:opacity-40"
            title="닫기 (ESC)"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>

        {/* 바디 · 각 위치별 3자리 stepper */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {activeLocs.length === 0 && (
            <div className="text-[14px] text-ink-soft">활성화된 저장 위치가 없습니다</div>
          )}
          {activeLocs.map(loc => (
            <div key={loc.code} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink leading-tight">{loc.name}</div>
                <div className="text-[12px] text-ink-soft mt-0.5">
                  {loc.kind === "store" ? "매장" : "창고"} · {loc.required_detail ? "상세 필수" : "선택"}
                </div>
              </div>
              <ShelfPositionInput
                value={draft[loc.code] ?? null}
                onChange={(v) => setDraft(prev => ({ ...prev, [loc.code]: v }))}
                required={loc.required_detail}
                compact
                productCode={productCode}
                displayLocation={displayLocation ?? null}
                storageKey={loc.code}
              />
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-zinc-50/60 shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            {saving ? <Spinner size={11} /> : null}
            저장
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShelfPositionsEditModal;
