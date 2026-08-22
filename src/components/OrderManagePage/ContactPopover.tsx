// src/components/OrderManagePage/ContactPopover.tsx
// 2026-08-23 · Framework Phase 4 · 담당자 팝오버 분리
import React from "react";

interface ContactPopoverProps {
  anchor: DOMRect;
  name: string;
  phone: string | null;
  email: string | null;
  onClose: () => void;
}

export const ContactPopover: React.FC<ContactPopoverProps> = ({ anchor, name, phone, email, onClose }) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div className="fixed z-50 bg-white border border-zinc-300 rounded-xl shadow-2xl p-3 min-w-[220px]"
      style={{ top: Math.min(window.innerHeight - 150, anchor.bottom + 4), left: Math.min(window.innerWidth - 240, anchor.left) }}>
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-100">
        <div className="w-8 h-8 rounded-full bg-brand-tint flex items-center justify-center text-brand-deep font-semibold text-[13px]">
          {name.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-zinc-800">{name}</div>
          <div className="text-[14px] text-zinc-400">공급사 담당자</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {phone ? (
          <a href={`tel:${phone}`} className="flex items-center gap-2 text-[14px] text-zinc-700 hover:text-indigo-700 hover:bg-zinc-50 rounded-lg px-2 py-1.5 cursor-pointer transition">
            <span className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600">📞</span>
            <span className="font-mono font-bold flex-1">{phone}</span>
          </a>
        ) : (
          <div className="flex items-center gap-2 text-[15px] text-zinc-300 px-2 py-1.5">
            <span className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center">📞</span>전화번호 미등록
          </div>
        )}
        {email ? (
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-[14px] text-zinc-700 hover:text-indigo-700 hover:bg-zinc-50 rounded-lg px-2 py-1.5 cursor-pointer transition">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">✉️</span>
            <span className="font-semibold truncate flex-1">{email}</span>
          </a>
        ) : (
          <div className="flex items-center gap-2 text-[15px] text-zinc-300 px-2 py-1.5">
            <span className="w-6 h-6 rounded-lg bg-zinc-100 flex items-center justify-center">✉️</span>이메일 미등록
          </div>
        )}
      </div>
      <button onClick={onClose}
        className="mt-2 w-full text-[14px] font-bold text-zinc-400 hover:text-zinc-700 py-1 border-t border-zinc-100 cursor-pointer">닫기</button>
    </div>
  </>
);
