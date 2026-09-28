// src/components/OrderManagePage/ExceptionRequestModal.tsx
// 2026-09-28 · 사용자 지시 · 발주이상 요청서 모달 · KPI Hero 삭제 · 라인 강조 재디자인
//   · "위의 대시보드 필요없고 가장 한눈에 잘 보이게 구성"
//   · 상단 KpiCard 3장 (건수·금액·수량) 제거 · 채널·메모·공급사 직행
//   · 이상 라인 · 이메일과 동일 시각 언어 (좌 accent bar · 큰 배지 · 큰 상품명 · 큰 Diff)
//   · Diff · "발주 X → 매입 Y (Δ · 라벨)" · 한 줄 큰 강조
//
// 대원칙:
//   · Modal · Button · Spinner · CollapseCard · StatusPill · InlineLabel
//   · KO_INPUT_PROPS (한글 IME)
//   · 이모지 X · 파스텔 X · Linear/Vercel/Notion 2026 톤
//   · 폰트 +2 (상품명 20px · Diff 18~20px · 라인 최소 14px)
//   · 말줄임표 X · whitespace-normal break-keep
//   · 프레임워크 · 서버 endpoint 시그니처·outcomes 무변경

import React from "react";
import { AlertTriangle, ArrowRight, Mail, MessageSquare, Send } from "lucide-react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { InlineLabel } from "../common/InlineLabel";
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

const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

// 사유별 semantic tone · Tailwind class
interface LineTone {
  bar: string;
  pill: "rose" | "amber" | "zinc";
  diffText: string;
  diffBg: string;
  diffBorder: string;
  arrow: string;
}
const LINE_TONE: Record<string, LineTone> = {
  qty_short: {
    bar: "bg-rose-500",
    pill: "rose",
    diffText: "text-rose-700",
    diffBg: "bg-rose-50",
    diffBorder: "border-rose-200",
    arrow: "text-rose-500",
  },
  qty_over: {
    bar: "bg-amber-500",
    pill: "amber",
    diffText: "text-amber-700",
    diffBg: "bg-amber-50",
    diffBorder: "border-amber-200",
    arrow: "text-amber-500",
  },
  price_diff: {
    bar: "bg-amber-600",
    pill: "amber",
    diffText: "text-amber-800",
    diffBg: "bg-amber-50",
    diffBorder: "border-amber-200",
    arrow: "text-amber-600",
  },
  no_purchase: {
    bar: "bg-zinc-500",
    pill: "zinc",
    diffText: "text-zinc-700",
    diffBg: "bg-zinc-50",
    diffBorder: "border-zinc-200",
    arrow: "text-zinc-500",
  },
};
const DEFAULT_LINE_TONE: LineTone = {
  bar: "bg-zinc-400",
  pill: "zinc",
  diffText: "text-zinc-700",
  diffBg: "bg-zinc-50",
  diffBorder: "border-zinc-200",
  arrow: "text-zinc-500",
};

// ═══════════════════════════════════════════════════════════════
// Diff 라인 · "발주 X → 매입 Y (Δ · 라벨)" · exType 따라 축 분기
// ═══════════════════════════════════════════════════════════════
interface DiffParts {
  leftValue: string;
  rightValue: string;
  deltaText: string;
}
function buildDiffParts(item: ExceptionRequestModalItem, exType: string): DiffParts {
  const isPriceDiff = exType === "price_diff";
  const isNoPurchase = exType === "no_purchase";
  if (isPriceDiff) {
    const op = item.unit_price ?? 0;
    const pp = item.purchase_avg_price ?? 0;
    let deltaText = "";
    if (op > 0 && pp > 0) {
      const pct = ((pp - op) / op) * 100;
      const sign = pct > 0 ? "+" : "";
      const dir = pct > 0 ? "높음" : "낮음";
      deltaText = `${sign}${pct.toFixed(1)}% · ${dir}`;
    }
    return { leftValue: fmtWon(op), rightValue: fmtWon(pp), deltaText };
  }
  if (isNoPurchase) {
    return {
      leftValue: `${fmtQty(item.order_qty)}개`,
      rightValue: "매입 이력 없음",
      deltaText: "",
    };
  }
  // qty_short / qty_over / default → 수량 축
  const oq = item.order_qty ?? 0;
  const pq = item.purchase_qty ?? 0;
  const qtyDiff = pq - oq;
  let deltaText = "";
  if (qtyDiff !== 0) {
    const sign = qtyDiff > 0 ? "+" : "";
    const dir = qtyDiff > 0 ? "초과" : "부족";
    deltaText = `${sign}${qtyDiff.toLocaleString()}개 · ${dir}`;
  }
  return {
    leftValue: `${fmtQty(oq)}개`,
    rightValue: `${fmtQty(pq)}개`,
    deltaText,
  };
}

// ═══════════════════════════════════════════════════════════════
// 이상 라인 카드 · 좌 accent bar · 큰 배지 · 큰 상품명 · 큰 Diff
// ═══════════════════════════════════════════════════════════════
const ExceptionLineRow: React.FC<{ item: ExceptionRequestModalItem }> = ({ item }) => {
  const exType = String(item.exception_type ?? "");
  const exLabel = EXCEPTION_LABEL[exType] ?? "이상";
  const tone = LINE_TONE[exType] ?? DEFAULT_LINE_TONE;
  const diff = buildDiffParts(item, exType);
  const orderAmount = (item.unit_price ?? 0) * (item.order_qty ?? 0);
  const purchaseAmount = (item.purchase_avg_price ?? 0) * (item.purchase_qty ?? 0);
  const hasAmountLine =
    orderAmount > 0 || purchaseAmount > 0 || Boolean(item.purchase_date);

  return (
    <div className="relative rounded-xl border border-line bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* left accent bar · 6px */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="pl-4 pr-4 py-4 flex flex-col gap-2">
        {/* Row 1 · 사유 배지 (큰) */}
        <div>
          <StatusPill tone={tone.pill} size="sm">
            {exLabel}
          </StatusPill>
        </div>
        {/* Row 2 · 상품 코드 · 작게 · secondary */}
        <div className="text-[12px] text-ink-mute font-mono tabular-nums leading-tight">
          {item.product_code || "—"}
        </div>
        {/* Row 3 · 상품명 · 크게 (20px) · 최우선 정보 */}
        <div className="text-[20px] font-extrabold text-ink whitespace-normal break-keep leading-snug tracking-tight -mt-1">
          {item.product_name || "—"}
        </div>
        {/* Row 4 · Diff · 발주 → 매입 · 큰 강조 · 한 줄 */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-bold text-ink-mute uppercase tracking-wider">
            발주
          </span>
          <span className="text-[18px] font-bold text-ink tabular-nums whitespace-normal break-keep tracking-tight">
            {diff.leftValue}
          </span>
          <ArrowRight
            size={18}
            strokeWidth={2.6}
            className={`${tone.arrow} shrink-0`}
            aria-hidden
          />
          <span className="text-[11px] font-bold text-ink-mute uppercase tracking-wider">
            매입
          </span>
          <span
            className={`text-[18px] font-bold ${tone.diffText} tabular-nums whitespace-normal break-keep tracking-tight`}
          >
            {diff.rightValue}
          </span>
        </div>
        {/* Row 5 · Delta pill · 차이 강조 */}
        {diff.deltaText && (
          <div>
            <span
              className={`inline-block px-2.5 py-1 rounded-md border ${tone.diffBg} ${tone.diffBorder} ${tone.diffText} text-[14px] font-extrabold tabular-nums tracking-tight`}
            >
              {diff.deltaText}
            </span>
          </div>
        )}
        {/* Row 6 · 금액 · secondary · 있을 때만 */}
        {hasAmountLine && (
          <div className="text-[13px] text-ink-soft tabular-nums whitespace-normal break-keep leading-snug mt-0.5">
            {orderAmount > 0 && <>발주액 {fmtWon(orderAmount)}</>}
            {orderAmount > 0 && purchaseAmount > 0 && <> · </>}
            {purchaseAmount > 0 && <>매입액 {fmtWon(purchaseAmount)}</>}
            {item.purchase_date && (
              <>
                {(orderAmount > 0 || purchaseAmount > 0) && " · "}
                매입일 {shortDate(item.purchase_date)}
              </>
            )}
          </div>
        )}
        {/* Row 7 · 메모 */}
        {item.exception_note && (
          <div className="text-[14px] text-ink-soft whitespace-normal break-keep bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 leading-relaxed">
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

  // ─── 카운트 (헤더·발송 버튼용) ─────────────────────────────
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
            <span>발송</span>
            <span className="tabular-nums opacity-90">· {totalItems}건</span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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

        {/* ═══ 공급사별 CollapseCard · 이상 라인 강조 ═══ */}
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
                <div className="p-3 pt-2 flex flex-col gap-3">
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
