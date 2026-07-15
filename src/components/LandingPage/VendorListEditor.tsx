// src/components/LandingPage/VendorListEditor.tsx
// 공급사 관리 · 마스터-디테일 (2026-07-14 · 사용자 요청)
//   왼쪽: 검색창 + 리스트  ·  오른쪽: 클릭한 공급사 상세 정보 + 수정 + 확인 버튼
// mode="dashboard" (기본): 마스터-디테일 · mode="raw": 원본 데이터 스프레드시트 뷰

import React, { useEffect, useState, useMemo } from "react";
import { Search, Check, X, Loader2, Building2 } from "lucide-react";

interface VendorListEditorProps {
  mode?: "dashboard" | "raw";
  // 대시보드 진입 시 자동으로 선택될 공급사 id (raw → dashboard 전환 시 활용)
  initialSelectedId?: number | null;
  // raw 모드에서 편집 요청 시 호출 (부모가 mode 를 dashboard 로 전환)
  onEditRequest?: (vendorId: number) => void;
}

interface Vendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  note: string | null;
  business_number: string | null;
  created_at?: string | null;
  latestBalance?: { balance: number; invoice_date: string | null; created_at: string } | null;
  balanceConfig?: { balance_field: string; updated_at: string } | null;
}

interface EditDraft {
  company_name: string;
  business_number: string;
  contact_name: string;
  phone: string;
  email: string;
  category: string;
  note: string;
}

const emptyDraft = (v: Vendor): EditDraft => ({
  company_name: v.company_name ?? "",
  business_number: v.business_number ?? "",
  contact_name: v.contact_name ?? "",
  phone: v.phone ?? "",
  email: v.email ?? "",
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

export const VendorListEditor: React.FC<VendorListEditorProps> = ({ mode = "dashboard", initialSelectedId, onEditRequest }) => {
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

  // 부모가 initialSelectedId 를 넘겨준 경우 (raw → dashboard 전환) 자동 선택
  useEffect(() => {
    if (mode !== "dashboard" || initialSelectedId == null) return;
    const v = vendors.find(x => x.id === initialSelectedId);
    if (v) {
      setSelectedId(v.id);
      setDraft(emptyDraft(v));
      setSaveMsg(null);
    }
  }, [mode, initialSelectedId, vendors]);

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
      draft.email !== (selected.email ?? "") ||
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
          email: draft.email.trim() || null,
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

  // ─── 원본 데이터 뷰 (스프레드시트 · 검색 + 정렬) ──────────────────
  if (mode === "raw") {
    return <RawVendorsView vendors={vendors} loading={loading} onReload={loadVendors} onEditRequest={onEditRequest} />;
  }

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
              <Field label="이메일">
                <input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="example@company.com" className={inputCls} />
              </Field>
              <Field label="카테고리">
                <input type="text" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="제약 · 의약외품 · 화장품 등" className={inputCls} />
              </Field>
              <Field label="비고">
                <textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className={`${inputCls} h-20 resize-none`} />
              </Field>
              {/* 읽기 전용 · DB 메타데이터 */}
              {(selected.created_at || selected.balanceConfig || selected.latestBalance) && (
                <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                  {selected.created_at && (
                    <div>등록일: <span className="font-mono text-slate-700">{new Date(selected.created_at).toLocaleDateString("ko-KR")}</span></div>
                  )}
                  {selected.balanceConfig?.balance_field && (
                    <div>잔고 필드: <span className="font-mono text-slate-700">{selected.balanceConfig.balance_field}</span></div>
                  )}
                  {selected.latestBalance?.balance != null && (
                    <div>최근 잔고: <span className="font-mono font-bold text-emerald-700">{selected.latestBalance.balance.toLocaleString()}원</span>
                      {selected.latestBalance.invoice_date && <span className="text-slate-400 ml-1">({selected.latestBalance.invoice_date})</span>}
                    </div>
                  )}
                </div>
              )}
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

// ═══════════════════════════════════════════════════════════════════════
// 원본 데이터 뷰 (재고관리 원본데이터 스타일 · 스프레드시트)
// ═══════════════════════════════════════════════════════════════════════
type RawSortKey = "company_name" | "business_number" | "contact_name" | "phone" | "email" | "category" | "created_at";

const RawVendorsView: React.FC<{ vendors: Vendor[]; loading: boolean; onReload: () => void; onEditRequest?: (id: number) => void }> = ({ vendors, loading, onReload, onEditRequest }) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<RawSortKey>("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
    const base = !q ? vendors : vendors.filter(v => {
      const name = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
      const bn = (v.business_number ?? "").replace(/[^0-9]/g, "");
      const contact = (v.contact_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
      const phone = (v.phone ?? "").replace(/[^0-9]/g, "");
      const email = (v.email ?? "").toLowerCase();
      return name.includes(q) || bn.includes(q) || contact.includes(q) || phone.includes(q) || email.includes(q);
    });
    return [...base].sort((a, b) => {
      const va = String((a as any)[sortKey] ?? "");
      const vb = String((b as any)[sortKey] ?? "");
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [vendors, search, sortKey, sortDir]);

  const handleSort = (k: RawSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const arrow = (k: RawSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  const downloadCsv = () => {
    const headers = ["id", "company_name", "business_number", "contact_name", "phone", "email", "category", "note", "created_at"];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...filtered.map(v => headers.map(h => esc((v as any)[h])).join(",")),
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm p-3">
        <div className="relative min-w-[240px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="회사명 · 사업자번호 · 담당자 · 전화 · 이메일 검색"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-full sm:w-96"
          />
        </div>
        <span className="text-[11px] font-mono text-slate-500">
          {loading ? <><Loader2 size={11} className="inline animate-spin mr-1" />로딩...</> : `${filtered.length} / ${vendors.length}건`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={onReload} disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold text-slate-600 cursor-pointer transition">
            새로고침
          </button>
          <button onClick={downloadCsv}
            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-bold cursor-pointer transition shadow-sm">
            CSV 다운로드
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10 border-b border-slate-200 shadow-sm">
            <tr className="text-slate-500 uppercase text-[10px]">
              <th className="text-left px-3 py-2 w-10">#</th>
              {([
                { k: "company_name" as const,    label: "회사명",       w: "min-w-[180px]" },
                { k: "business_number" as const, label: "사업자번호",   w: "w-32" },
                { k: "contact_name" as const,    label: "담당자",       w: "w-24" },
                { k: "phone" as const,           label: "전화",         w: "w-28" },
                { k: "email" as const,           label: "이메일",       w: "w-52" },
                { k: "category" as const,        label: "분류",         w: "w-24" },
                { k: "created_at" as const,      label: "등록일",       w: "w-28" },
              ]).map(col => (
                <th key={col.k} onClick={() => handleSort(col.k)}
                  className={`text-left px-3 py-2 ${col.w} cursor-pointer select-none hover:bg-teal-50 transition ${sortKey === col.k ? "text-teal-700 font-black" : ""}`}>
                  {col.label}{arrow(col.k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400 font-semibold">
                {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
              </td></tr>
            ) : filtered.map((v, i) => (
              <tr key={v.id}
                onClick={() => onEditRequest?.(v.id)}
                className={`transition ${onEditRequest ? "hover:bg-teal-50 cursor-pointer" : "hover:bg-teal-50/30"}`}
                title={onEditRequest ? "클릭하여 편집 · 대시보드로 이동" : undefined}>
                <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                <td className="px-3 py-1.5 font-bold text-slate-800 flex items-center gap-1">
                  <Building2 size={11} className="text-teal-500 shrink-0" />
                  <span className={`truncate ${onEditRequest ? "underline decoration-dotted decoration-teal-400 underline-offset-2" : ""}`} title={v.company_name}>{v.company_name}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-slate-600">{v.business_number ? formatBizNum(v.business_number) : <span className="text-rose-400 italic">없음</span>}</td>
                <td className="px-3 py-1.5 text-slate-700">{v.contact_name ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono text-slate-600">{v.phone ?? "-"}</td>
                <td className="px-3 py-1.5 text-slate-600 truncate" title={v.email ?? undefined}>{v.email ?? "-"}</td>
                <td className="px-3 py-1.5 text-slate-500">{v.category ?? "-"}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400">{v.created_at ? String(v.created_at).slice(0, 10) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
