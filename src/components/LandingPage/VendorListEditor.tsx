// src/components/LandingPage/VendorListEditor.tsx
// 공급사 관리 · 마스터-디테일 (2026-07-14 · 사용자 요청)
//   왼쪽: 검색창 + 리스트  ·  오른쪽: 클릭한 공급사 상세 정보 + 수정 + 확인 버튼

import React, { useEffect, useState, useMemo } from "react";
import { Search, Check, X, Loader2, Building2 } from "lucide-react";

interface Vendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  category: string | null;
  note: string | null;
  business_number: string | null;
  latestBalance?: { balance: number; invoice_date: string | null; created_at: string } | null;
  balanceConfig?: { balance_field: string; updated_at: string } | null;
}

interface EditDraft {
  company_name: string;
  business_number: string;
  contact_name: string;
  phone: string;
  category: string;
  note: string;
}

const emptyDraft = (v: Vendor): EditDraft => ({
  company_name: v.company_name ?? "",
  business_number: v.business_number ?? "",
  contact_name: v.contact_name ?? "",
  phone: v.phone ?? "",
  category: v.category ?? "",
  note: v.note ?? "",
});

const normalizeBizNum = (s: string): string => s.replace(/[^0-9]/g, "").slice(0, 10);
const formatBizNum = (s: string | null): string => {
  if (!s) return "";
  const d = normalizeBizNum(s);
  if (d.length !== 10) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

export const VendorListEditor: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMissingBiz, setFilterMissingBiz] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("공급사 로드 실패:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadVendors(); }, []);

  const filtered = useMemo(() => {
    let list = vendors;
    if (filterMissingBiz) list = list.filter(v => !v.business_number);
    const q = search.trim().toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
    if (q) {
      list = list.filter(v => {
        const name = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const bn = (v.business_number ?? "").replace(/[^0-9]/g, "");
        return name.includes(q) || bn.includes(q);
      });
    }
    return list.slice().sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "", "ko"));
  }, [vendors, search, filterMissingBiz]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  const handleSelect = (v: Vendor) => {
    setSelectedId(v.id);
    setDraft(emptyDraft(v));
    setSaveMsg(null);
  };

  const isDirty = useMemo(() => {
    if (!selected || !draft) return false;
    return (
      draft.company_name !== (selected.company_name ?? "") ||
      draft.business_number !== (selected.business_number ?? "") ||
      draft.contact_name !== (selected.contact_name ?? "") ||
      draft.phone !== (selected.phone ?? "") ||
      draft.category !== (selected.category ?? "") ||
      draft.note !== (selected.note ?? "")
    );
  }, [selected, draft]);

  const handleSave = async () => {
    if (!selected || !draft) return;
    const bnDigits = normalizeBizNum(draft.business_number);
    if (bnDigits && bnDigits.length !== 10) {
      setSaveMsg({ type: "err", text: "사업자번호는 10자리 숫자여야 합니다" });
      return;
    }
    if (!draft.company_name.trim()) {
      setSaveMsg({ type: "err", text: "회사명은 필수입니다" });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/vendors/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: draft.company_name.trim(),
          business_number: bnDigits || null,
          contact_name: draft.contact_name.trim() || null,
          phone: draft.phone.trim() || null,
          category: draft.category.trim() || null,
          note: draft.note.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`서버 ${res.status}`);
      setSaveMsg({ type: "ok", text: "저장 완료" });
      await loadVendors();
    } catch (e: any) {
      setSaveMsg({ type: "err", text: `저장 실패: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selected) setDraft(emptyDraft(selected));
    setSaveMsg(null);
  };

  const missingCount = vendors.filter(v => !v.business_number).length;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[600px]">
      {/* ── 좌: 검색 + 리스트 ─────────────────────────── */}
      <div className="w-full lg:w-72 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="회사명 · 사업자번호"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filterMissingBiz}
              onChange={e => setFilterMissingBiz(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            사업자번호 미등록만 <span className="text-rose-500 font-bold">({missingCount})</span>
          </label>
          <div className="text-[10px] text-gray-400">
            총 {vendors.length}개 · 결과 {filtered.length}개
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
              <Loader2 size={14} className="animate-spin mr-2" />불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">결과 없음</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map(v => {
                const active = v.id === selectedId;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => handleSelect(v)}
                      className={`w-full text-left px-3 py-2 hover:bg-emerald-50 transition ${active ? "bg-emerald-100/70 border-l-2 border-emerald-500" : ""}`}
                    >
                      <div className="text-xs font-semibold text-gray-800 truncate">{v.company_name}</div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                        {v.business_number ? (
                          <span className="font-mono">{formatBizNum(v.business_number)}</span>
                        ) : (
                          <span className="text-rose-500 font-semibold">사업자번호 없음</span>
                        )}
                        {v.category && <span>· {v.category}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── 우: 상세 편집 ─────────────────────────── */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {!selected || !draft ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
            <Building2 size={40} className="opacity-40" />
            <p>좌측 리스트에서 공급사를 선택하세요</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-200">
              <div className="text-lg font-bold text-gray-800">{selected.company_name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                ID: {selected.id}
                {selected.latestBalance?.balance != null && (
                  <span className="ml-3">
                    · 잔고: <span className="font-semibold text-emerald-700">{selected.latestBalance.balance.toLocaleString()}원</span>
                    {selected.latestBalance.invoice_date && <span className="text-gray-400"> ({selected.latestBalance.invoice_date})</span>}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <Field label="회사명 *">
                <input type="text" value={draft.company_name} onChange={e => setDraft({ ...draft, company_name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="사업자번호 (10자리)">
                <input
                  type="text"
                  value={draft.business_number}
                  onChange={e => setDraft({ ...draft, business_number: normalizeBizNum(e.target.value) })}
                  placeholder="0000000000"
                  className={`${inputCls} font-mono`}
                  maxLength={10}
                />
                {draft.business_number && draft.business_number.length === 10 && (
                  <div className="text-[10px] text-gray-500 mt-1">표시: {formatBizNum(draft.business_number)}</div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="담당자">
                  <input type="text" value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="전화">
                  <input type="text" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="카테고리">
                <input type="text" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={inputCls} />
              </Field>
              <Field label="비고">
                <textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className={`${inputCls} h-20 resize-none`} />
              </Field>
            </div>
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center gap-2">
              {saveMsg && (
                <span className={`text-xs font-medium ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
                  {saveMsg.type === "ok" ? "✓" : "✗"} {saveMsg.text}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={handleCancel}
                disabled={!isDirty || saving}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-gray-700 font-medium"
              >
                <X size={12} />취소
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="inline-flex items-center gap-1 text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                확인
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const inputCls = "w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-gray-600 mb-1">{label}</div>
    {children}
  </label>
);
