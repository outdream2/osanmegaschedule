// src/components/SchedulePage/AdminLoginModal.tsx
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 관리자 로그인 모달
// 2026-08-23 · #191 · Modal primitive 마이그레이션
import React from "react";
import { Lock, LogIn, ShieldAlert } from "lucide-react";
import { Modal } from "../common/Modal";

interface AdminLoginModalProps {
  loginId: string;
  setLoginId: (v: string) => void;
  loginPw: string;
  setLoginPw: (v: string) => void;
  loginError: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const ModalTitle = () => (
  <div>
    <div className="text-sm font-extrabold text-gray-900 tracking-tight">관리자 로그인</div>
    <div className="text-[10px] text-gray-400 font-medium">관리자 계정정보를 기입해 주십시오.</div>
  </div>
);

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  loginId, setLoginId, loginPw, setLoginPw, loginError, onSubmit, onClose,
}) => (
  <Modal
    open
    onClose={onClose}
    size="sm"
    title={<ModalTitle />}
    icon={<div className="p-1.5 bg-brand-deep text-white rounded-lg"><Lock size={16} /></div>}
  >
    <form onSubmit={onSubmit} className="space-y-4">
      {loginError && (
        <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs flex items-center gap-2 animate-pulse">
          <ShieldAlert size={14} className="shrink-0 text-rose-500" />
          <span className="font-semibold">{loginError}</span>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">관리자 아이디 (osanmega)</label>
        <input
          type="text" value={loginId} onChange={e => setLoginId(e.target.value)}
          placeholder="아이디를 입력하세요" required autoFocus
          className="w-full text-xs rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none font-semibold text-gray-800 transition"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">비밀번호</label>
        <input
          type="password" value={loginPw} onChange={e => setLoginPw(e.target.value)}
          placeholder="비밀번호를 입력하세요" required
          className="w-full text-xs rounded-xl border border-gray-300 focus:border-brand-deep focus:ring-2 focus:ring-brand-tint/10 p-3 bg-white focus:outline-none font-semibold text-gray-800 transition"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 p-3 text-xs font-bold bg-gray-50 hover:bg-gray-100 rounded-xl border border-line text-gray-600 transition">
          취소
        </button>
        <button type="submit" className="flex-1 p-3 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white border border-indigo-600 rounded-xl transition shadow-sm inline-flex items-center justify-center gap-1.5">
          <LogIn size={13} />
          <span>로그인</span>
        </button>
      </div>
    </form>
  </Modal>
);
