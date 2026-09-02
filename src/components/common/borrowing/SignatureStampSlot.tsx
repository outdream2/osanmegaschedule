// src/components/common/borrowing/SignatureStampSlot.tsx
// 2026-08-31 · #9/#130 · Phase A 프리미티브
//   · 서명 (SignaturePad) + 도장 오버레이 + 감사 메타 (IP·시각)
//   · role · lender · borrower · lender_return · borrower_return
//   · 서명 됐으면 · 이미지 + 감사 정보 · 안 됐으면 · [서명하기] 버튼

import React from "react";
import { PenTool, Check, Clock } from "lucide-react";

export interface SignatureRecord {
  role: "lender" | "borrower" | "lender_return" | "borrower_return" | "witness";
  signer_name: string;
  signature_url: string;
  stamp_url?: string | null;
  signed_at: string;
  ip_address?: string | null;
  intent_text?: string | null;
}

export interface SignatureStampSlotProps {
  role: "lender" | "borrower" | "lender_return" | "borrower_return";
  signature?: SignatureRecord | null;
  onSign?: () => void;
  disabled?: boolean;
  className?: string;
}

const ROLE_LABEL: Record<SignatureStampSlotProps["role"], string> = {
  lender: "대여자 서명",
  borrower: "차용자 서명",
  lender_return: "대여자 반환 서명",
  borrower_return: "차용자 반환 서명",
};

// 2026-09-02 · 목업 · signed / unsigned 시각 명확화
//   · signed · solid border · 진한 톤 · shadow
//   · unsigned · dashed border · 옅은 톤 · shadow 없음
const ROLE_TONE_SIGNED: Record<SignatureStampSlotProps["role"], string> = {
  lender: "border-violet-300 bg-violet-50/60 shadow-[0_1px_3px_rgba(139,92,246,0.10)]",
  borrower: "border-emerald-300 bg-emerald-50/60 shadow-[0_1px_3px_rgba(16,185,129,0.10)]",
  lender_return: "border-violet-400 bg-violet-100/60 shadow-[0_1px_3px_rgba(139,92,246,0.12)]",
  borrower_return: "border-emerald-400 bg-emerald-100/60 shadow-[0_1px_3px_rgba(16,185,129,0.12)]",
};
const ROLE_TONE_UNSIGNED: Record<SignatureStampSlotProps["role"], string> = {
  lender: "border-dashed border-violet-200 bg-violet-50/20",
  borrower: "border-dashed border-emerald-200 bg-emerald-50/20",
  lender_return: "border-dashed border-violet-200 bg-violet-50/20",
  borrower_return: "border-dashed border-emerald-200 bg-emerald-50/20",
};

export const SignatureStampSlot: React.FC<SignatureStampSlotProps> = ({
  role, signature, onSign, disabled = false, className = "",
}) => {
  const label = ROLE_LABEL[role];
  const isSigned = !!signature?.signature_url;
  const tone = isSigned ? ROLE_TONE_SIGNED[role] : ROLE_TONE_UNSIGNED[role];

  return (
    <div className={`relative rounded-xl border-2 ${tone} p-3 transition-all ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <PenTool size={12} className="text-ink-soft" />
        <span className="text-[12px] font-bold text-ink-soft uppercase tracking-wider">{label}</span>
        {isSigned && (
          <span className="ml-auto inline-flex items-center gap-1 h-4 px-1.5 rounded text-[10px] font-extrabold text-emerald-700 bg-emerald-100 border border-emerald-200">
            <Check size={9} strokeWidth={3} /> 서명됨
          </span>
        )}
      </div>

      {isSigned ? (
        <div className="flex flex-col gap-2">
          {/* 서명 이미지 + 도장 오버레이 */}
          <div className="relative bg-white rounded-lg border border-line p-2 flex items-center justify-center min-h-[80px]">
            <img src={signature!.signature_url} alt="서명" className="max-h-16 object-contain" />
            {signature!.stamp_url && (
              <img
                src={signature!.stamp_url}
                alt="도장"
                className="absolute right-2 bottom-2 w-12 h-12 opacity-80"
                style={{ transform: "rotate(-8deg)" }}
              />
            )}
          </div>
          {/* 감사 메타 */}
          <div className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="font-bold">{signature!.signer_name}</span>
            <span className="flex items-center gap-0.5 tabular-nums">
              <Clock size={9} />
              {String(signature!.signed_at).slice(0, 16).replace("T", " ")}
            </span>
            {signature!.ip_address && (
              <span className="tabular-nums text-zinc-400">· {signature!.ip_address}</span>
            )}
          </div>
          {signature!.intent_text && (
            <div className="text-[11px] italic text-ink-soft border-t border-line pt-1.5">
              "{signature!.intent_text}"
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onSign}
          disabled={disabled || !onSign}
          className="w-full py-4 rounded-lg border-2 border-dashed border-zinc-300 hover:border-brand-deep hover:bg-white text-ink-soft hover:text-brand-deep cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PenTool size={16} className="inline mr-1.5" />
          <span className="text-[13px] font-bold">서명하기</span>
        </button>
      )}
    </div>
  );
};

export default SignatureStampSlot;
