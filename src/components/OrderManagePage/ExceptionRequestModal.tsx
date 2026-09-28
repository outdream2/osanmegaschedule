// src/components/OrderManagePage/ExceptionRequestModal.tsx
// 2026-09-28 · 사용자 지시 · 발주이상 요청서 모달 · 최신 트렌드 재디자인
//   · Linear · Vercel · Notion · Attio 2026 톤 · 뉴트럴 base + 사유별 accent
//   · Hero KPI 3-metric · 상단 한눈에 파악
//   · 공급사 CollapseCard · 담당자·건수·contact tone
//   · 이상 라인 · left accent bar + Diff-first + 2-col compare
//   · 채널 Chip segmented · toggle 명확
//   · Sticky action · [발송 · N건] · 발송 대상 카운트 명시
//
// 대원칙:
//   · Modal · Button · Spinner · KpiCard · CollapseCard · StatusPill · InlineLabel
//   · KO_INPUT_PROPS (한글 IME)
//   · 이모지 X · 파스텔 X · Linear/Vercel/Notion 2026 톤
//   · 폰트 +2 (text-[15px] 이상)
//   · 말줄임표 X · whitespace-normal break-keep
//   · 프레임워크 · 서버 endpoint 시그니처·outcomes 무변경

import React from "react";
import { AlertTriangle, Mail, MessageSquare, Send } from "lucide-react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { InlineLabel } from "../common/InlineLabel";
import { KpiCard } from "../common/KpiCard";
import { CollapseCard } from "../common/CollapseCard";
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
const fmtWonSigned = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0원";
  const sign = n > 0 ? "+" : "";
  return sign + Math.round(n).toLocaleString() + "원";
};
const fmtQtySigned = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return sign + n.toLocaleString();
};

const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

// 사유별 semantic tone · Tailwind class
interface LineTone {
  bar: string;
  pill: "rose" | "amber" | "amber" | "zinc";
  diffText: string;
}
const LINE_TONE: Record<string, LineTone> = {
  qty_short: { bar: "bg-rose-500", pill: "rose", diffText: "text-rose-700" },
  qty_over: { bar: "bg-amber-500", pill: "amber", diffText: "text-amber-700" },
  price_diff: { bar: "bg-amber-600", pill: "amber", diffText: "text-amber-800" },
  no_purchase: { bar: "bg-zinc-500", pill: "zinc", diffText: "text-zinc-700" },
};
const DEFAULT_LINE_TONE: LineTone = {
  bar: "bg-zinc-400",
  pill: "zinc",
  diffText: "text-zinc-700",
};

// ═══════════════════════════════════════════════════════════════
// 이상 라인 · left accent bar + Diff-first + 2-col compare
// ═══════════════════════════════════════════════════════════════
const ExceptionLineRow: React.FC<{ item: ExceptionRequestModalItem }> = ({ item }) => {
  const exType = String(item.exception_type ?? "");
  const exLabel = EXCEPTION_LABEL[exType] ?? "이상";
  const tone = LINE_TONE[exType] ?? DEFAULT_LINE_TONE;
  const orderAmount = (item.unit_price ?? 0) * (item.order_qty ?? 0);
  const purchaseAmount = (item.purchase_avg_price ?? 0) * (item.purchase_qty ?? 0);
  return (
    <div className="relative rounded-lg border border-line bg-white overflow-hidden">
      {/* left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} aria-hidden />
      <div className="pl-3.5 pr-3 py-2.5 flex flex-col gap-1.5">
        {/* Row 1 · code + chip */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-ink-mute font-mono tabular-nums leading-tight">
              {item.product_code || "—"}
            </div>
            <div className="text-[15px] font-semibold text-ink whitespace-normal break-keep leading-snug mt-0.5">
              {item.product_name || "—"}
            </div>
          </div>
          <StatusPill tone={tone.pill as "rose" | "amber" | "zinc"} size="xs">
            {exLabel}
          </StatusPill>
        </div>
        {/* Row 2 · Diff · 강조 · 없으면 생략 */}
        {item.diff_desc && (
          <div className={`text-[14px] font-semibold ${tone.diffText} leading-snug`}>
            {item.diff_desc}
          </div>
        )}
        {/* Row 3 · 2-col compact compare */}
        <div className="grid grid-cols-2 gap-0 border-t border-zinc-100 pt-2 mt-0.5">
          <div className="pr-3 border-r border-zinc-100">
            <div className="text-[10px] font-bold text-ink-mute uppercase tracking-wider leading-none">
              발주
            </div>
            <div className="text-[13px] font-semibold text-ink mt-1 tabular-nums whitespace-normal break-keep leading-tight">
              {fmtQty(item.order_qty)}개 · {fmtWon(item.unit_price)}
            </div>
            <div className="text-[12px] text-ink-soft tabular-nums leading-tight mt-0.5">
              {fmtWon(orderAmount)}
            </div>
          </div>
          <div className="pl-3">
            <div className="text-[10px] font-bold text-ink-mute uppercase tracking-wider leading-none">
              매입
            </div>
            <div className="text-[13px] font-semibold text-ink mt-1 tabular-nums whitespace-normal break-keep leading-tight">
              {item.purchase_qty > 0
                ? `${fmtQty(item.purchase_qty)}개 · ${fmtWon(item.purchase_avg_price)}`
                : "매입 이력 없음"}
            </div>
            <div className="text-[12px] text-ink-soft tabular-nums leading-tight mt-0.5 whitespace-normal break-keep">
              {item.purchase_qty > 0 ? fmtWon(purchaseAmount) : "—"}
              {item.purchase_date && ` · ${shortDate(item.purchase_date)}`}
            </div>
          </div>
        </div>
        {item.exception_note && (
          <div className="text-[13px] text-ink-soft whitespace-normal break-keep bg-zinc-50 border border-zinc-100 rounded-md px-2.5 py-1.5 mt-0.5">
            <span className="font-semibold text-ink">메모</span> · {item.exception_note}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 채널 Chip · Segmented toggle
// ═══════════════════════════════════════════════════════════════
const ChannelChip: React.FC<{
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ label, icon, checked, disabled, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={checked}
    className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer select-none transition-colors ${
      checked
        ? "bg-brand-deep border-brand-deep text-white shadow-sm"
        : "bg-white border-line text-ink-soft hover:bg-zinc-50 hover:text-ink"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
  >
    {icon}
    {label}
  </button>
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

  // ─── KPI 계산 ────────────────────────────────────────────
  const totalItems = state.suppliers.reduce((s, g) => s + g.items.length, 0);
  const totalSuppliers = state.suppliers.length;
  const orderAmountSum = state.suppliers.reduce(
    (s, g) => s + g.items.reduce((a, it) => a + (it.unit_price ?? 0) * (it.order_qty ?? 0), 0),
    0,
  );
  const purchaseAmountSum = state.suppliers.reduce(
    (s, g) =>
      s +
      g.items.reduce((a, it) => a + (it.purchase_avg_price ?? 0) * (it.purchase_qty ?? 0), 0),
    0,
  );
  const amountDiff = purchaseAmountSum - orderAmountSum;
  const qtyDiffSum = state.suppliers.reduce(
    (s, g) => s + g.items.reduce((a, it) => a + ((it.purchase_qty ?? 0) - (it.order_qty ?? 0)), 0),
    0,
  );

  const noChannel = !state.channels.email && !state.channels.sms && !state.channels.kakao;
  const canSubmit = totalItems > 0 && !sendingBulk;

  // 금액 차이 KPI tone
  const amountDiffTone: "rose" | "amber" | "emerald" =
    amountDiff === 0 ? "emerald" : amountDiff > 0 ? "amber" : "rose";
  const qtyDiffTone: "rose" | "amber" | "emerald" =
    qtyDiffSum === 0 ? "emerald" : qtyDiffSum > 0 ? "amber" : "rose";

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
            <span>발송</span>
            <span className="tabular-nums opacity-90">· {totalItems}건</span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ═══ KPI Hero · 한눈에 파악 ═══ */}
        <div className="grid grid-cols-3 gap-2">
          <KpiCard
            tone="amber"
            label="이상 건수"
            value={totalItems}
            unit="건"
            hint={`${totalSuppliers}개 공급사`}
            isActive={totalItems > 0}
          />
          <KpiCard
            tone={amountDiffTone === "emerald" ? "emerald" : amountDiffTone}
            label="매입 - 발주 금액"
            value={fmtWonSigned(amountDiff)}
            hint={amountDiff === 0 ? "차이 없음" : amountDiff > 0 ? "매입 초과" : "매입 부족"}
            isActive={amountDiff !== 0}
          />
          <KpiCard
            tone={qtyDiffTone === "emerald" ? "emerald" : qtyDiffTone}
            label="수량 차이 합계"
            value={fmtQtySigned(qtyDiffSum)}
            unit="개"
            hint={qtyDiffSum === 0 ? "차이 없음" : qtyDiffSum > 0 ? "매입 초과" : "매입 부족"}
            isActive={qtyDiffSum !== 0}
          />
        </div>

        {/* ═══ 채널 선택 · Chip segmented ═══ */}
        <div className="flex flex-col gap-1.5">
          <InlineLabel size="sm">발송 채널</InlineLabel>
          <div className="flex flex-wrap gap-1.5">
            <ChannelChip
              label="이메일"
              icon={<Mail size={14} strokeWidth={2.2} />}
              checked={state.channels.email}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("email")}
            />
            <ChannelChip
              label="문자"
              icon={<MessageSquare size={14} strokeWidth={2.2} />}
              checked={state.channels.sms}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("sms")}
            />
            <ChannelChip
              label="카카오톡"
              icon={<MessageSquare size={14} strokeWidth={2.2} />}
              checked={state.channels.kakao}
              disabled={sendingBulk}
              onToggle={() => onToggleChannel("kakao")}
            />
          </div>
          {noChannel && (
            <div className="text-[13px] text-amber-700 whitespace-normal break-keep leading-snug">
              발송 채널이 선택되지 않았습니다. 발송 시 결과만 기록됩니다.
            </div>
          )}
        </div>

        {/* ═══ 요청 메모 ═══ */}
        <div className="flex flex-col gap-1.5">
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
            rows={2}
            placeholder="추가 요청 · 조치 사항 등 (선택)"
            disabled={sendingBulk}
            className="w-full rounded-lg border border-line bg-zinc-50/60 px-3 py-2 text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep focus:bg-white transition-colors resize-y disabled:opacity-60"
          />
        </div>

        {/* ═══ 공급사별 CollapseCard ═══ */}
        <div className="flex flex-col gap-2">
          <InlineLabel size="sm">
            공급사별 이상 라인 · {totalSuppliers}개
          </InlineLabel>
          {state.suppliers.map((s, si) => {
            const contactBits: string[] = [];
            if (s.supplier_contact) contactBits.push(String(s.supplier_contact));
            if (s.supplier_phone) contactBits.push(String(s.supplier_phone));
            if (s.supplier_email) contactBits.push(String(s.supplier_email));
            const contactMissing = contactBits.length === 0;
            return (
              <CollapseCard
                key={`ex-modal-sup-${si}`}
                defaultOpen
                depth="sm"
                contentPadding="none"
                title={
                  <div className="flex flex-col leading-snug min-w-0">
                    <span className="text-[16px] font-semibold text-ink whitespace-normal break-keep">
                      {s.supplierDisplay}
                    </span>
                    <span
                      className={`text-[12.5px] font-semibold whitespace-normal break-keep ${
                        contactMissing ? "text-rose-700" : "text-ink-soft"
                      }`}
                    >
                      {contactBits.length > 0 ? contactBits.join(" · ") : "담당자·연락처 미등록"}
                    </span>
                  </div>
                }
                right={
                  <StatusPill tone={contactMissing ? "rose" : "amber"} size="xs" dot>
                    {s.items.length}건
                  </StatusPill>
                }
              >
                <div className="p-3 pt-2 flex flex-col gap-2">
                  {s.items.map((it, ii) => (
                    <ExceptionLineRow key={`ex-modal-line-${si}-${ii}`} item={it} />
                  ))}
                </div>
              </CollapseCard>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export default ExceptionRequestModal;
