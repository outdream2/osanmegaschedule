// 2026-10-06 · #VisitorReservationEmployeeAssignment · Phase 7 refactor
//   · ReservationPage 에서 추출 · 800라인 초과 방지 (framework audit)
//   · 폼 state 는 상위 ReservationPage 에서 관리 · 이 컴포넌트는 presentational
import React from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { KO_INPUT_PROPS } from "../../lib/koreanInput";
import {
  AlertCircle, Building2, Calendar, Clock, MessageSquare,
  Phone, User, X,
} from "lucide-react";

const PURPOSES = ["결제", "신약 상담", "발주 확인", "제품 상담", "재고 점검", "기타"];

export interface ReservationFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string;
  isVendor: boolean;
  modalTime: string | null;
  modalEmployeeLabel: string;
  selectedDateLabel: string;
  company: string;
  setCompany: (v: string) => void;
  contactName: string;
  setContactName: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  purpose: string;
  setPurpose: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
}

export const ReservationFormModal: React.FC<ReservationFormModalProps> = ({
  open, onClose, onSubmit, submitting, error, isVendor,
  modalTime, modalEmployeeLabel, selectedDateLabel,
  company, setCompany, contactName, setContactName,
  phone, onPhoneChange, purpose, setPurpose, note, setNote,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      align="bottom-mobile"
      size="lg-narrow"
      bodyPadding="none"
      showClose={false}
    >
      <div className="flex flex-col h-full">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-gray-900 font-bold text-sm leading-tight">예약 정보 입력</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-emerald-700 text-xs font-semibold tabular-nums">{selectedDateLabel}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-emerald-700 text-xs font-bold tabular-nums flex items-center gap-1">
                <Clock size={10} /> {modalTime}
              </span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-indigo-600 text-xs font-bold">
                담당: {modalEmployeeLabel}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition cursor-pointer shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto p-5 flex-1 min-h-0">
          <form onSubmit={onSubmit} className="space-y-4">

            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200">
                <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                <p className="text-rose-700 text-sm leading-snug">{error}</p>
              </div>
            )}

            {/* 거래처명 */}
            <div>
              <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Building2 size={11} /> 거래처명 <span className="text-rose-500 font-bold">*</span>
              </label>
              <input
                type="text" {...KO_INPUT_PROPS}
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="(주)한국제약"
                readOnly={isVendor}
                className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                autoFocus={!isVendor}
              />
            </div>

            {/* 담당자 + 연락처 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <User size={11} /> 담당자 <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="text" {...KO_INPUT_PROPS}
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="홍길동"
                  readOnly={isVendor}
                  className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                />
              </div>
              <div>
                <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Phone size={11} /> 연락처 <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  lang="ko" type="tel"
                  value={phone}
                  onChange={e => onPhoneChange(e.target.value)}
                  placeholder="010-0000-0000"
                  readOnly={isVendor}
                  className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                />
              </div>
            </div>

            {/* 방문 목적 */}
            <div>
              <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
                방문 목적 <span className="text-rose-500 font-bold">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PURPOSES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      purpose === p
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 추가 요청사항 */}
            <div>
              <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MessageSquare size={11} /> 추가 요청사항
              </label>
              <textarea {...KO_INPUT_PROPS} value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="특이사항이 있으면 입력해 주세요"
                rows={2}
                className="w-full bg-white border border-gray-300 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Spinner size={14} />
                  <span>예약 접수 중...</span>
                </>
              ) : (
                <>
                  <Calendar size={14} />
                  <span>예약 신청</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </Modal>
  );
};
