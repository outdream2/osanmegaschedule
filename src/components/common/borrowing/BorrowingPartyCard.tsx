// src/components/common/borrowing/BorrowingPartyCard.tsx
// 2026-08-31 · #9/#130 · Phase A 프리미티브
//   · 당사자 카드 · Lender (대여자) violet · Borrower (차용자) emerald
//   · avatar + 이름 + 담당자 + 연락처
//   · docs/BORROWING_REDESIGN_2026-08-30.md 2-1 컨셉

import React from "react";
import { User, Phone } from "lucide-react";

export interface BorrowingParty {
  id?: number;
  party_type?: "self" | "vendor" | "external";
  name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  memo?: string | null;
}

export interface BorrowingPartyCardProps {
  role: "lender" | "borrower";
  party: BorrowingParty | null;
  onClick?: () => void;
  className?: string;
}

// 당사자 톤 · lender=violet · borrower=emerald
const TONE = {
  lender:   { bg: "bg-violet-50", border: "border-violet-200", ring: "ring-violet-300", accentText: "text-violet-700", accentBg: "bg-violet-100", iconBg: "bg-violet-500", label: "대여자 · LENDER" },
  borrower: { bg: "bg-emerald-50", border: "border-emerald-200", ring: "ring-emerald-300", accentText: "text-emerald-700", accentBg: "bg-emerald-100", iconBg: "bg-emerald-500", label: "차용자 · BORROWER" },
};

export const BorrowingPartyCard: React.FC<BorrowingPartyCardProps> = ({ role, party, onClick, className = "" }) => {
  const t = TONE[role];
  const initial = String(party?.name ?? "?").charAt(0).toUpperCase();
  const clickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-xl border-2 ${t.border} ${t.bg} p-4
        ${clickable ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : ""}
        transition-all duration-200 ${className}
      `}
    >
      {/* 역할 라벨 */}
      <div className={`inline-flex items-center h-5 px-2 rounded text-[11px] font-extrabold uppercase tracking-wider ${t.accentBg} ${t.accentText} mb-2`}>
        {t.label}
      </div>

      {party ? (
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-11 h-11 rounded-full ${t.iconBg} text-white flex items-center justify-center text-[18px] font-extrabold ring-2 ${t.ring} shadow-sm`}>
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold text-ink tracking-tight truncate">{party.name}</div>
            {party.contact_name && (
              <div className="flex items-center gap-1 mt-0.5 text-[13px] text-ink-soft">
                <User size={11} className="shrink-0" />
                <span className="truncate">{party.contact_name}</span>
              </div>
            )}
            {party.contact_phone && (
              <div className="flex items-center gap-1 mt-0.5 text-[13px] text-ink-soft tabular-nums">
                <Phone size={11} className="shrink-0" />
                <span className="truncate">{party.contact_phone}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`text-[13px] italic text-ink-soft py-3 ${clickable ? "text-center" : ""}`}>
          {clickable ? "클릭하여 당사자 선택 · 신규 등록" : "미지정"}
        </div>
      )}
    </div>
  );
};

export default BorrowingPartyCard;
