// src/components/common/NewVendorModal.tsx
// 2026-08-09 · 사용자 요청 · 신규 공급사 등록 모달 (공통)
// 사용처:
//   - LandingPage 거래처용 · 공급사등록 카드 클릭
//   - VendorListEditor (매장 > 공급사관리) · [+ 신규 공급사] 버튼 클릭
// 필드: 회사명(필수) · 담당자 · 전화 · 이메일 · 카테고리 · 사업자번호 · 비고
// 저장: POST /api/vendors · 성공 시 window "vendors-changed" 이벤트 dispatch (캐시 무효화)

// 2026-08-17 · apiClient 마이그레이션
import { useState } from "react";
import { api } from "../../lib/apiClient";
import { X, Loader2, Building2, Save } from "lucide-react";
import { IconTile } from "./IconTile";

interface NewVendorModalProps {
  onClose: () => void;
  onSaved?: (vendor: { id: number; company_name: string }) => void;
}

const CATEGORIES = ["위탁", "선결제", "60회전", "90회전", "기타"] as const;

export function NewVendorModal({ onClose, onSaved }: NewVendorModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const disabled = saving || !companyName.trim();

  const handleSave = async () => {
    setErr(null);
    if (!companyName.trim()) { setErr("회사명은 필수입니다"); return; }
    setSaving(true);
    try {
      const { data: saved } = await api.post<unknown>("/api/vendors", {
        company_name: companyName.trim(),
        category: category || null,
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        business_number: businessNumber.trim() || null,
        note: note.trim() || null,
      });
      try { window.dispatchEvent(new CustomEvent("vendors-changed")); } catch { /* silent */ }
      onSaved?.(saved as any);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    // 2026-08-17 v2 · frosted backdrop + 3-layer shadow · Modal 통일
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(10, 46, 74, 0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] bg-white sm:rounded-2xl rounded-t-2xl border border-line overflow-hidden flex flex-col"
        style={{ boxShadow: "0 1px 3px rgba(10,46,74,0.12), 0 8px 32px -8px rgba(10,46,74,0.24), 0 24px 64px -24px rgba(10,46,74,0.28)" }}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 bg-sky-50/60">
          {/* 2026-08-18 · IconTile 확산 */}
          <IconTile icon={<Building2 size={15} />} tone="sky" size="lg" />

          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-sky-600 uppercase tracking-wider">신규 공급사</div>
            <div className="text-[14px] font-bold text-zinc-800">공급사 등록</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
            aria-label="닫기"
            title="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              회사명 <span className="text-rose-500">*</span>
            </span>
            <input
              autoFocus
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="예: (주)메가헬스케어"
              className="h-9 px-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">카테고리</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`h-8 px-3 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  category === "" ? "bg-zinc-700 text-white shadow-sm" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                미분류
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`h-8 px-3 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    category === c
                      ? c === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                      : c === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                      : c === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                      : c === "90회전" ? "bg-teal-500 text-white shadow-sm"
                      :                    "bg-zinc-500 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">담당자</span>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="이름"
                className="h-9 px-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">전화</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="h-9 px-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition tabular-nums"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="h-9 px-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">사업자번호</span>
            <input
              type="text"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder="000-00-00000"
              className="h-9 px-3 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition tabular-nums"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">비고</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="추가 정보"
              rows={2}
              className="px-3 py-2 text-[13px] border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition resize-none"
            />
          </label>

          {err && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
              {err}
            </div>
          )}
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-100 bg-zinc-50/60">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-line bg-white text-zinc-600 hover:bg-zinc-50 text-[12px] font-bold transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled}
            className="ml-auto h-9 px-4 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[12px] font-bold shadow-sm inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} strokeWidth={2.5} />}
            {saving ? "저장 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewVendorModal;
