// src/components/OrderManagePage/ExceptionNoteModal.tsx
// 2026-09-25 · #1 · 발주매입 대조 · 이상 판정 메모 모달 (사용자 지시)
//   · 사용자 지시 · "이상이면 모달창띄워서 메모쓸수있게"
//   · Props · open · onClose · orderId · orderNumber · defaultExceptionType · defaultNote · onSaved
//   · Body · 이상 사유 SegmentedControl (4종) + 메모 textarea (필수)
//   · Footer · [취소] [저장] · 메모 empty 시 저장 disabled
//
// 대원칙:
//   · 프레임워크 재사용 (Modal · SegmentedControl · Button · InlineLabel · useToast)
//   · KO_INPUT_PROPS · 한글 IME
//   · 이모지·파스텔 X · Linear/Vercel/Notion 2026 톤
//   · 폰트 +2 default (text-[15px] 이상)
//   · 말줄임표 금지 · whitespace-normal
//
// 서버 endpoint · POST /api/order-purchase-match/:order_id/confirm
//   · action='exception' · exception_type · note

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "../common/Modal";
import { SegmentedControl } from "../common/SegmentedControl";
import { InlineLabel } from "../common/InlineLabel";
import { Button } from "../common/Button";
import { Spinner } from "../common/Spinner";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { KO_INPUT_PROPS } from "../../lib/koreanInput";
import { confirmOrderPurchaseMatch } from "../../lib/api/orderPurchaseMatchApi";
import type { ExceptionType } from "../../shared/schemas/orderPurchaseMatch";

// ═══════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════

const EXCEPTION_OPTIONS: { value: ExceptionType; label: string; hint: string }[] = [
  { value: "qty_short",   label: "수량 부족", hint: "매입 수량이 발주 수량보다 적음" },
  { value: "qty_over",    label: "수량 초과", hint: "매입 수량이 발주 수량을 초과" },
  { value: "price_diff",  label: "단가 상이", hint: "발주 단가와 매입 단가 차이 (±1% 초과)" },
  { value: "no_purchase", label: "매입 없음", hint: "매칭 기간 내 매입 확인 안 됨" },
];

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

export interface ExceptionNoteModalProps {
  open: boolean;
  onClose: () => void;
  /** 발주 id (order_requests.id) · confirm endpoint 경로 · 서버 스펙 유지 */
  orderId: string | number | null;
  /** 표시용 발주번호 (예: "PO-2026-0925-001") */
  orderNumber?: string | null;
  /** default 이상 사유 · 서버 auto_exception_type · 없으면 qty_short */
  defaultExceptionType?: ExceptionType | null;
  /** default 메모 · 기존 exception_note (edit 케이스) */
  defaultNote?: string | null;
  /** 저장 성공 시 콜백 · 상위 목록 refetch */
  onSaved?: () => void | Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════════

export const ExceptionNoteModal: React.FC<ExceptionNoteModalProps> = ({
  open,
  onClose,
  orderId,
  orderNumber,
  defaultExceptionType,
  defaultNote,
  onSaved,
}) => {
  const { showSuccess, showError } = useToast();

  const [exType, setExType] = useState<ExceptionType>(
    defaultExceptionType ?? "qty_short",
  );
  const [note, setNote] = useState<string>(defaultNote ?? "");
  const [busy, setBusy] = useState(false);

  // 모달 열릴 때마다 default 재적용 (첫 탭 default 대원칙 · localStorage 복원 X)
  useEffect(() => {
    if (!open) return;
    setExType(defaultExceptionType ?? "qty_short");
    setNote(defaultNote ?? "");
  }, [open, defaultExceptionType, defaultNote]);

  const trimmedNote = note.trim();
  const canSave = trimmedNote.length > 0 && !busy && orderId != null;

  const options = useMemo(
    () => EXCEPTION_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.hint })),
    [],
  );
  const selectedHint = useMemo(
    () => EXCEPTION_OPTIONS.find((o) => o.value === exType)?.hint ?? "",
    [exType],
  );

  const handleSave = async () => {
    if (!canSave || orderId == null) return;
    setBusy(true);
    try {
      await confirmOrderPurchaseMatch(orderId, {
        action: "exception",
        exception_type: exType,
        note: trimmedNote,
      });
      showSuccess("이상 판정 저장");
      await onSaved?.();
      onClose();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "저장 실패");
      showError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg-narrow"
      icon={<AlertTriangle size={18} strokeWidth={2.4} />}
      title={
        <span className="whitespace-normal break-keep">
          이상 판정
          {orderNumber && (
            <span className="ml-2 text-[14px] font-mono font-semibold text-ink-soft tabular-nums">
              #{orderNumber}
            </span>
          )}
        </span>
      }
      titleAccent
      closeOnBackdrop={!busy}
      closeOnEsc={!busy}
      footer={
        <>
          <Button
            variant="secondary"
            size="md"
            onClick={handleClose}
            disabled={busy}
          >
            취소
          </Button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[17px] font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {busy && <Spinner size={12} tone="zinc" />}
            <AlertTriangle size={15} strokeWidth={2.4} />
            저장
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 이상 사유 · SegmentedControl */}
        <div className="flex flex-col gap-2">
          <InlineLabel size="sm">이상 사유</InlineLabel>
          <SegmentedControl<ExceptionType>
            value={exType}
            onChange={setExType}
            options={options}
            variant="pills"
            size="md"
            wrap
            ariaLabel="이상 사유 선택"
          />
          {selectedHint && (
            <div className="text-[13px] text-ink-soft whitespace-normal break-keep leading-relaxed">
              {selectedHint}
            </div>
          )}
        </div>

        {/* 메모 · 필수 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <InlineLabel size="sm">
              메모 <span className="text-rose-600 font-bold ml-0.5">*</span>
            </InlineLabel>
            <span className="text-[12px] text-ink-mute tabular-nums">
              {note.length} / 500
            </span>
          </div>
          <textarea
            {...KO_INPUT_PROPS}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="이상 사유 · 상세 · 조치 사항 등"
            disabled={busy}
            className="w-full rounded-lg border border-line bg-zinc-50/60 px-3 py-2 text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep focus:bg-white transition-colors resize-y disabled:opacity-60 disabled:cursor-not-allowed"
          />
          {trimmedNote.length === 0 && (
            <div className="text-[12px] text-rose-600 whitespace-normal break-keep">
              메모는 필수 입력 항목입니다
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ExceptionNoteModal;
