// src/components/common/NewVendorCard.tsx
// 2026-08-10 · 사용자 요청 · VendorManageSplit 오른쪽 상단 · 인라인 신규 등록 카드
// NewVendorModal 의 인라인 버전 · 필드·저장 로직 완전 동일 (재사용 원칙)
//   NewVendorModal 은 fixed backdrop · 여기는 카드 껍데기 (fixed X · backdrop X)
// 저장 성공 시 · onSaved 콜백 · window "vendors-changed" 이벤트 dispatch (기존 캐시 무효화)
// onSaved 후 폼 자동 초기화 (다음 등록 준비)

import { useState } from "react";
import { Loader2, Building2, Save } from "lucide-react";

interface NewVendorCardProps {
  onSaved?: (vendor: { id: number; company_name: string }) => void;
}

const CATEGORIES = ["위탁", "선결제", "60회전", "90회전", "기타"] as const;

export function NewVendorCard({ onSaved }: NewVendorCardProps) {
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const disabled = saving || !companyName.trim();

  const resetForm = () => {
    setCompanyName("");
    setCategory("");
    setContactName("");
    setPhone("");
    setEmail("");
    setBusinessNumber("");
    setNote("");
  };

  const handleSave = async () => {
    setErr(null); setOkMsg(null);
    if (!companyName.trim()) { setErr("회사명은 필수입니다"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          category: category || null,
          contact_name: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          business_number: businessNumber.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `저장 실패 (${res.status})`);
      }
      const saved = await res.json();
      try { window.dispatchEvent(new CustomEvent("vendors-changed")); } catch { /* silent */ }
      onSaved?.(saved);
      setOkMsg(`"${saved.company_name}" 등록 완료`);
      resetForm();
    } catch (e: any) {
      setErr(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 헤더 · 접기·펼치기 토글 */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-sky-50/60 to-transparent hover:bg-sky-50/40 transition cursor-pointer text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
          <Building2 size={13} className="text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">신규 공급사</div>
          <div className="text-[13px] font-black text-slate-800">공급사 등록 {expanded ? "" : "(펼치기)"}</div>
        </div>
      </button>

      {expanded && (
        <>
          {/* 폼 */}
          <div className="p-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                회사명 <span className="text-rose-500">*</span>
              </span>
              <input
                autoFocus
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="예: (주)메가헬스케어"
                className="h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">카테고리</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className={`h-8 px-3 rounded-md text-[11px] font-black transition cursor-pointer ${
                    category === "" ? "bg-slate-700 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  미분류
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`h-8 px-3 rounded-md text-[11px] font-black transition cursor-pointer ${
                      category === c
                        ? c === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                        : c === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                        : c === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                        : c === "90회전" ? "bg-teal-500 text-white shadow-sm"
                        :                    "bg-slate-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">담당자</span>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="이름"
                  className="h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">전화</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition tabular-nums"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">이메일</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">사업자번호</span>
              <input
                type="text"
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                placeholder="000-00-00000"
                className="h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition tabular-nums"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">비고</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="추가 정보"
                rows={2}
                className="px-3 py-2 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition resize-none"
              />
            </label>

            {err && (
              <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
                {err}
              </div>
            )}
            {okMsg && (
              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
                {okMsg}
              </div>
            )}
          </div>

          {/* 액션 */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/60">
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled}
              className="ml-auto h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-black shadow-sm inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={2.5} />}
              {saving ? "저장 중..." : "등록"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default NewVendorCard;
