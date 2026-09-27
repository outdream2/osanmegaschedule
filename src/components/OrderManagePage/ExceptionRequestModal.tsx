// src/components/OrderManagePage/ExceptionRequestModal.tsx
// 2026-09-27 · 사용자 지시 · 발주이상 요청서 모달
//   · 참고 · OrderModal.tsx (발주요청 · 유사 구조)
//   · 공급사별 · 담당자 · 이상 라인 리스트 · 채널 checkbox · 메모 · 발송 버튼
//
// 대원칙:
//   · Modal · Button · Spinner · Card · StatusPill · InlineLabel · SegmentedControl
//   · KO_INPUT_PROPS (한글 IME)
//   · 이모지 X · 파스텔 X · Linear/Vercel/Notion 2026 톤
//   · 폰트 +2 (text-[15px] 이상)
//   · 말줄임표 X · whitespace-normal break-keep

import React from "react";
import { AlertTriangle, Mail, MessageSquare, Send } from "lucide-react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { InlineLabel } from "../common/InlineLabel";
import { KO_INPUT_PROPS } from "../../lib/koreanInput";
import { shortDate } from "../../lib/dateFormat";
import type {
  ExceptionRequestModalState,
  ExceptionRequestModalItem,
} from "./useExceptionRequestModal";

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

export interface ExceptionRequestModalProps {
  state: ExceptionRequestModalState | null;
  sendingBulk: boolean;
  onClose: () => void;
  onToggleChannel: (channel: "email" | "sms" | "kakao") => void;
  onMemoChange: (memo: string) => void;
  onSubmit: () => void | Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// 포맷 유틸
// ═══════════════════════════════════════════════════════════════
const fmtWon = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString()}원`;
const fmtQty = (n: number | null | undefined): string =>
  n == null ? "—" : `${Number(n).toLocaleString()}`;

const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

// ═══════════════════════════════════════════════════════════════
// 이상 라인 카드
// ═══════════════════════════════════════════════════════════════
const ExceptionLineRow: React.FC<{ item: ExceptionRequestModalItem }> = ({ item }) => {
  const exLabel = EXCEPTION_LABEL[String(item.exception_type ?? "")] ?? "이상";
  const orderAmount = (item.unit_price ?? 0) * (item.order_qty ?? 0);
  const purchaseAmount = (item.purchase_avg_price ?? 0) * (item.purchase_qty ?? 0);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-ink-mute font-mono tabular-nums">
            {item.product_code}
          </div>
          <div className="text-[15px] font-semibold text-ink whitespace-normal break-keep">
            {item.product_name || "—"}
          </div>
        </div>
        <StatusPill tone="amber" size="xs">
          {exLabel}
        </StatusPill>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px] tabular-nums">
        <div className="rounded-md border border-line bg-white px-2 py-1.5">
          <div className="text-[11px] text-ink-soft">발주</div>
          <div className="text-ink font-semibold">
            {fmtQty(item.order_qty)}개 × {fmtWon(item.unit_price)}
          </div>
          <div className="text-[12px] text-ink-soft">{fmtWon(orderAmount)}</div>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5">
          <div className="text-[11px] text-ink-soft">매입</div>
          <div className="text-ink font-semibold">
            {item.purchase_qty > 0
              ? `${fmtQty(item.purchase_qty)}개 × ${fmtWon(item.purchase_avg_price)}`
              : "매입 없음"}
          </div>
          <div className="text-[12px] text-ink-soft">
            {item.purchase_qty > 0 ? fmtWon(purchaseAmount) : "—"}
            {item.purchase_date && ` · ${shortDate(item.purchase_date)}`}
          </div>
        </div>
      </div>
      {item.diff_desc && (
        <div className="text-[13px] font-semibold text-amber-700">{item.diff_desc}</div>
      )}
      {item.exception_note && (
        <div className="text-[13px] text-ink-soft whitespace-normal break-keep">
          <span className="font-semibold text-ink">메모</span> · {item.exception_note}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 채널 체크박스
// ═══════════════════════════════════════════════════════════════
const ChannelCheckbox: React.FC<{
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ label, icon, checked, disabled, onToggle }) => (
  <label
    className={`inline-flex items-center gap-2 h-10 px-3 rounded-lg border cursor-pointer select-none transition-colors ${
      checked
        ? "bg-brand-deep border-brand-deep text-white"
        : "bg-white border-line text-ink hover:bg-zinc-50"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onToggle}
      className="sr-only"
    />
    {icon}
    <span className="text-[15px] font-semibold">{label}</span>
  </label>
);

// ═══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════
export const ExceptionRequestModal: React.FC<ExceptionRequestModalProps> = ({
  state,
  sendingBulk,
  onClose,
  onToggleChannel,
  onMemoChange,
  onSubmit,
}) => {
  if (!state) return null;

  const totalItems = state.suppliers.reduce((s, g) => s + g.items.length, 0);
  const totalSuppliers = state.suppliers.length;
  const noChannel = !state.channels.email && !state.channels.sms && !state.channels.kakao;
  const canSubmit = totalItems > 0 && !sendingBulk;

  return (
    <Modal
      open
      onClose={onClose}
      size="3xl"
      icon={<AlertTriangle size={18} strokeWidth={2.4} />}
      title={
        <span className="whitespace-normal break-keep">
          발주이상 요청서
          <span className="ml-2 text-[14px] font-semibold text-ink-soft tabular-nums">
            {totalSuppliers}개 공급사 · {totalItems}건
          </span>
        </span>
      }
      titleAccent
      closeOnBackdrop={!sendingBulk}
      closeOnEsc={!sendingBulk}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={sendingBulk}>
            취소
          </Button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[17px] font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {sendingBulk && <Spinner size={12} tone="white" />}
            <Send size={15} strokeWidth={2.4} />
            발송
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 채널 선택 */}
        <div className="flex flex-col gap-2">
          <InlineLabel size="sm">발송 채널</InlineLabel>
          <div className="flex flex-wrap gap-2">
            <ChannelCheckbox
              label="이메일"
              icon={<Mail size={15} strokeWidth={2.2} />}
              checked={state.channels.email}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("email")}
            />
            <ChannelCheckbox
              label="문자"
              icon={<MessageSquare size={15} strokeWidth={2.2} />}
              checked={state.channels.sms}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("sms")}
            />
            <ChannelCheckbox
              label="카카오톡"
              icon={<MessageSquare size={15} strokeWidth={2.2} />}
              checked={state.channels.kakao}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("kakao")}
            />
          </div>
          {noChannel && (
            <div className="text-[13px] text-amber-700 whitespace-normal break-keep">
              발송 채널이 선택되지 않았습니다. 발송 시 결과만 기록됩니다.
            </div>
          )}
        </div>

        {/* 메모 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <InlineLabel size="sm">요청 메모 (선택)</InlineLabel>
            <span className="text-[12px] text-ink-mute tabular-nums">
              {state.memo.length} / 1000
            </span>
          </div>
          <textarea
            {...KO_INPUT_PROPS}
            value={state.memo}
            onChange={(e) => onMemoChange(e.target.value)}
            rows={3}
            placeholder="추가 요청 · 조치 사항 등 (선택)"
            disabled={sendingBulk}
            className="w-full rounded-lg border border-line bg-zinc-50/60 px-3 py-2 text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep focus:bg-white transition-colors resize-y disabled:opacity-60"
          />
        </div>

        {/* 공급사별 이상 라인 리스트 */}
        <div className="flex flex-col gap-3">
          {state.suppliers.map((s, si) => {
            const contactBits: string[] = [];
            if (s.supplier_contact) contactBits.push(String(s.supplier_contact));
            if (s.supplier_phone) contactBits.push(String(s.supplier_phone));
            if (s.supplier_email) contactBits.push(String(s.supplier_email));
            const contactMissing = contactBits.length === 0;
            return (
              <div
                key={`ex-modal-sup-${si}`}
                className="rounded-lg border border-line bg-white overflow-hidden"
              >
                <div className="px-3 py-2.5 border-b border-line bg-zinc-50/60 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex flex-col leading-snug">
                    <span className="text-[16px] font-semibold text-ink">
                      {s.supplierDisplay}
                    </span>
                    <span
                      className={`text-[13px] font-semibold ${
                        contactMissing ? "text-rose-700" : "text-ink-soft"
                      }`}
                    >
                      {contactBits.length > 0 ? contactBits.join(" · ") : "담당자·연락처 미등록"}
                    </span>
                  </div>
                  <StatusPill tone="amber" size="xs" dot>
                    {s.items.length}건
                  </StatusPill>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {s.items.map((it, ii) => (
                    <ExceptionLineRow key={`ex-modal-line-${si}-${ii}`} item={it} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export default ExceptionRequestModal;
