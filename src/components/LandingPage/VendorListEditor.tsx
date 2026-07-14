// src/components/LandingPage/VendorListEditor.tsx
// 공급사 리스트 조회·수정 컴포넌트 (2026-07-14 · 사용자 요청)
//
// 기능:
//   - 전체 공급사 리스트 조회
//   - 회사명·사업자번호 검색
//   - 행 클릭 → 인라인 편집 (사업자번호 · 담당자 · 전화 · 카테고리 · 비고)
//   - 저장 시 사업자번호 자동 정규화 (하이픈 제거 · 10자리 검증)

import React, { useEffect, useState, useMemo } from "react";
import { Search, Pencil, Check, X, Loader2 } from "lucide-react";

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

export const VendorListEditor: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filterMissingBiz, setFilterMissingBiz] = useState(false);

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
    if (filterMissingBiz) {
      list = list.filter(v => !v.business_number);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
    return list.filter(v => {
      const name = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
      const bn = (v.business_number ?? "").replace(/[^0-9]/g, "");
      return name.includes(q) || bn.includes(q);
    });
  }, [vendors, search, filterMissingBiz]);

  const startEdit = (v: Vendor) => {
    setEditingId(v.id);
    setDraft({
      company_name: v.company_name ?? "",
      business_number: v.business_number ?? "",
      contact_name: v.contact_name ?? "",
      phone: v.phone ?? "",
      category: v.category ?? "",
      note: v.note ?? "",
    });
  };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };

  const saveEdit = async (id: number) => {
    if (!draft) return;
    // 사업자번호 정규화 (하이픈 제거 · 10자리 검증)
    const cleanBiz = draft.business_number.replace(/[^0-9]/g, "");
    if (cleanBiz && cleanBiz.length !== 10) {
      alert("사업자번호는 10자리 숫자여야 합니다.");
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: draft.company_name,
          contact_name: draft.contact_name || null,
          phone: draft.phone || null,
          category: draft.category || null,
          note: draft.note || null,
          business_number: cleanBiz || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("저장 실패: " + (err.error ?? res.status));
        return;
      }
      const updated = await res.json();
      setVendors(prev => prev.map(v => v.id === id ? updated : v));
      cancelEdit();
    } finally {
      setSavingId(null);
    }
  };

  const missingBizCount = vendors.filter(v => !v.business_number).length;

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-800">
          공급사 리스트
          <span className="ml-2 text-xs font-normal text-gray-500">
            {vendors.length}건 · 사업자번호 없음 {missingBizCount}건
          </span>
        </h4>
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterMissingBiz}
            onChange={e => setFilterMissingBiz(e.target.checked)}
            className="accent-emerald-500"
          />
          사업자번호 없는 것만
        </label>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="회사명 또는 사업자번호로 검색"
          className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 size={16} className="animate-spin mr-2" /> 로딩...
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto border border-gray-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-gray-600">
                <th className="px-2 py-2 font-bold">회사명</th>
                <th className="px-2 py-2 font-bold">사업자번호</th>
                <th className="px-2 py-2 font-bold">담당자</th>
                <th className="px-2 py-2 font-bold">전화</th>
                <th className="px-2 py-2 font-bold">카테고리</th>
                <th className="px-2 py-2 font-bold text-right">최근 잔고</th>
                <th className="px-2 py-2 font-bold w-14 text-center">편집</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-gray-400">검색 결과 없음</td></tr>
              )}
              {filtered.map(v => {
                const isEditing = editingId === v.id;
                if (isEditing && draft) {
                  return (
                    <tr key={v.id} className="bg-emerald-50 border-t border-gray-100">
                      <td className="px-1 py-1">
                        <input value={draft.company_name} onChange={e => setDraft({ ...draft, company_name: e.target.value })}
                          className="w-full px-2 py-1 border border-emerald-300 rounded" />
                      </td>
                      <td className="px-1 py-1">
                        <input value={draft.business_number} onChange={e => setDraft({ ...draft, business_number: e.target.value })}
                          placeholder="310-18-05493"
                          className="w-full px-2 py-1 border border-emerald-300 rounded font-mono" />
                      </td>
                      <td className="px-1 py-1">
                        <input value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })}
                          className="w-full px-2 py-1 border border-emerald-300 rounded" />
                      </td>
                      <td className="px-1 py-1">
                        <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })}
                          className="w-full px-2 py-1 border border-emerald-300 rounded" />
                      </td>
                      <td className="px-1 py-1">
                        <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}
                          className="w-full px-2 py-1 border border-emerald-300 rounded" />
                      </td>
                      <td className="px-2 py-1 text-right text-[10px] text-gray-400">
                        {v.latestBalance ? v.latestBalance.balance.toLocaleString() + "원" : "—"}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => saveEdit(v.id)} disabled={savingId === v.id}
                            className="p-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white rounded" title="저장">
                            {savingId === v.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button onClick={cancelEdit}
                            className="p-1 bg-gray-300 hover:bg-gray-400 text-white rounded" title="취소">
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-semibold text-gray-800">{v.company_name}</td>
                    <td className={`px-2 py-1.5 font-mono ${v.business_number ? "text-emerald-700" : "text-amber-500"}`}>
                      {v.business_number
                        ? `${v.business_number.slice(0, 3)}-${v.business_number.slice(3, 5)}-${v.business_number.slice(5)}`
                        : "미등록"}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">{v.contact_name ?? "—"}</td>
                    <td className="px-2 py-1.5 text-gray-600 font-mono text-[11px]">{v.phone ?? "—"}</td>
                    <td className="px-2 py-1.5 text-gray-500">{v.category ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {v.latestBalance ? (
                        <div className="flex flex-col items-end">
                          <span className="text-rose-600 font-bold">{v.latestBalance.balance.toLocaleString()}원</span>
                          <span className="text-[9px] text-gray-400">
                            {v.latestBalance.invoice_date ?? new Date(v.latestBalance.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => startEdit(v)} className="p-1 text-gray-400 hover:text-emerald-600" title="편집">
                        <Pencil size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
