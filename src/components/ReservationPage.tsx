// src/components/ReservationPage.tsx
import React, { useState } from "react";
import { Calendar, ChevronLeft, Phone, User, Clock, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";

interface ReservationPageProps {
  onBack: () => void;
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "13:00", "13:30", "14:00", "14:30", "15:00",
  "15:30", "16:00", "16:30", "17:00", "17:30", "18:00",
  "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

const PURPOSES = [
  "약사 상담", "건강기능식품 상담", "처방전 문의", "대량구매 상담", "기타",
];

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack }) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;
    if (digits.length > 3 && digits.length <= 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else if (digits.length > 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date || !time || !purpose) {
      setError("모든 필수 항목을 입력해 주세요.");
      return;
    }
    setError("");
    setSubmitting(true);
    // Simulate API call (replace with real endpoint when ready)
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 h-14 flex items-center px-4 sm:px-6 gap-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm font-medium cursor-pointer"
        >
          <ChevronLeft size={16} />
          <span>홈으로</span>
        </button>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Calendar size={13} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">방문예약</span>
        </div>
        <div className="ml-auto">
          <span className="font-black tracking-tight">
            <span className="text-red-500 text-base">OSAN</span>
            <span className="text-slate-400 text-sm"> MEGATOWN</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg">

          {submitted ? (
            /* Success state */
            <div className="bg-slate-900 border border-emerald-700/50 rounded-2xl p-8 text-center mt-8">
              <div className="w-14 h-14 rounded-full bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-white font-bold text-xl mb-2">예약이 접수되었습니다</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-1">
                <span className="text-white font-semibold">{name}</span>님, {date} {time}
              </p>
              <p className="text-slate-400 text-sm mb-1">목적: <span className="text-white">{purpose}</span></p>
              <p className="text-slate-500 text-xs mt-4 leading-relaxed">
                담당자가 확인 후 연락드립니다.<br />문의: 오산 메가타운 약국
              </p>
              <button
                onClick={() => { setSubmitted(false); setName(""); setPhone(""); setDate(""); setTime(""); setPurpose(""); setNote(""); }}
                className="mt-6 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition cursor-pointer"
              >
                새 예약하기
              </button>
            </div>
          ) : (
            /* Form */
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 mt-4">
              <h1 className="text-white font-bold text-xl mb-1">방문 예약</h1>
              <p className="text-slate-400 text-sm mb-6">오산 메가타운 약국 상담 예약 시스템</p>

              {error && (
                <div className="flex items-center gap-2 bg-rose-900/30 border border-rose-700/50 rounded-xl px-4 py-3 mb-5 text-rose-300 text-sm">
                  <AlertCircle size={15} className="shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Name + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <User size={11} /> 성함 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Phone size={11} /> 연락처 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Calendar size={11} /> 방문 날짜 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      min={today}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Clock size={11} /> 방문 시간 <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition cursor-pointer"
                    >
                      <option value="">시간 선택</option>
                      {TIME_SLOTS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Purpose */}
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                    방문 목적 <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PURPOSES.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPurpose(p)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          purpose === p
                            ? "bg-emerald-600 border-emerald-500 text-white"
                            : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <MessageSquare size={11} /> 추가 요청사항
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="특이사항이 있으면 입력해 주세요"
                    rows={3}
                    className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>예약 접수 중...</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={15} />
                      <span>예약 신청</span>
                    </>
                  )}
                </button>

              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
