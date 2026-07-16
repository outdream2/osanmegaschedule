// src/components/LandingPage/VendorListEditor.tsx
// 공급사관리 · 한 줄 테이블 리스트 + 상세 모달 (2026-07-16 재편)
//   리스트: 한 줄 · 반응형 (모바일 카드 · 태블릿·데스크탑 테이블)
//   모달:   기본 정보 편집 + 잔고 · 매입 통계 · 최근 매입 이력

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Search, Check, X, Loader2, Building2, Package, Calendar, DollarSign, TrendingUp } from "lucide-react";

interface VendorListEditorProps {
  // 기존 API 호환용 · 무시됨 (모달 방식으로 통일)
  mode?: "dashboard" | "raw";
  initialSelectedId?: number | null;
  onEditRequest?: (vendorId: number) => void;
  /** 2026-07-16 · 좌우 split 좌측용 컴팩트 모드 · 공급사명·사업자번호·담당자 3컬럼만 */
  compact?: boolean;
}

export interface Vendor {
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
const fmtWon = (n: number): string => n >= 1_0000_0000 ? `${(n/1_0000_0000).toFixed(1)}억` : n >= 10000 ? `${(n/10000).toFixed(1)}만` : `${n.toLocaleString()}원`;

export const VendorListEditor: React.FC<VendorListEditorProps> = ({ initialSelectedId, onEditRequest, compact = false }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMissingBiz, setFilterMissingBiz] = useState(false);
  const [modalVendorId, setModalVendorId] = useState<number | null>(null);
  // onEditRequest 제공 시 내부 모달 스킵 · 외부 split 패널로 위임
  const handleVendorClick = (id: number) => { if (onEditRequest) { onEditRequest(id); } else { setModalVendorId(id); } };

  const loadVendors = useCallback(async () => {
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
  }, []);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  // 부모가 initialSelectedId 로 특정 공급사 열기 요청한 경우 자동 모달 오픈
  useEffect(() => {
    if (initialSelectedId != null && vendors.find(v => v.id === initialSelectedId)) {
      setModalVendorId(initialSelectedId);
    }
  }, [initialSelectedId, vendors]);

  const filtered = useMemo(() => {
    let list = vendors;
    if (filterMissingBiz) list = list.filter(v => !v.business_number);
    const q = search.trim().toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
    if (q) {
      list = list.filter(v => {
        const name = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const bn = (v.business_number ?? "").replace(/[^0-9]/g, "");
        const contact = (v.contact_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const phone = (v.phone ?? "").replace(/[^0-9]/g, "");
        const email = (v.email ?? "").toLowerCase();
        return name.includes(q) || bn.includes(q) || contact.includes(q) || phone.includes(q) || email.includes(q);
      });
    }
    return list.slice().sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "", "ko"));
  }, [vendors, search, filterMissingBiz]);

  const missingCount = vendors.filter(v => !v.business_number).length;
  const modalVendor = useMemo(() => vendors.find(v => v.id === modalVendorId) ?? null, [vendors, modalVendorId]);

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* 상단 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm p-3">
        <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] sm:flex-none">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="회사명 · 사업자번호 · 담당자 · 전화 · 이메일"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-full sm:w-80"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
          <input type="checkbox" checked={filterMissingBiz} onChange={e => setFilterMissingBiz(e.target.checked)} className="w-3.5 h-3.5 accent-teal-500" />
          사업자번호 미등록만 <span className="text-rose-500 font-bold">({missingCount})</span>
        </label>
        <span className="text-[11px] font-mono text-slate-500">
          {loading ? <><Loader2 size={11} className="inline animate-spin mr-1" />로딩...</> : `${filtered.length} / ${vendors.length}건`}
        </span>
        <button onClick={loadVendors} disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold text-slate-600 cursor-pointer transition">
          새로고침
        </button>
      </div>

      {/* 반응형 리스트 · 모바일(< md): 카드 · 태블릿·데스크탑(md+): 한 줄 테이블 */}
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* 모바일: 카드 리스트 */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm font-semibold">
              {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
            </div>
          ) : filtered.map((v, i) => (
            <button
              key={v.id}
              onClick={() => handleVendorClick(v.id)}
              className="w-full text-left px-3 py-2 hover:bg-teal-50 active:bg-teal-100 transition"
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Building2 size={11} className="text-teal-500 shrink-0" />
                    <span className="text-[13px] font-bold text-slate-800 break-words">{v.company_name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                    {v.business_number
                      ? <span className="font-mono">{formatBizNum(v.business_number)}</span>
                      : <span className="text-rose-500 font-semibold italic">사번없음</span>}
                    {v.category && <span>· {v.category}</span>}
                    {v.contact_name && <span>· {v.contact_name}</span>}
                    {v.phone && <span className="font-mono">· {v.phone}</span>}
                    {v.latestBalance?.balance != null && (
                      <span className="font-mono font-bold text-emerald-700">· 잔고 {fmtWon(v.latestBalance.balance)}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
        {/* 태블릿·데스크탑: 한 줄 테이블 · 2026-07-16 · compact 모드 지원 (공급사명+사업자번호+담당자만) */}
        <table className="hidden md:table w-full text-xs">
          <thead className="sticky top-0 bg-white z-10 border-b border-slate-200 shadow-sm">
            <tr className="text-slate-500 uppercase text-[10px]">
              <th className="text-left px-3 py-2 w-10">#</th>
              <th className="text-left px-3 py-2 min-w-[160px]">회사명</th>
              <th className="text-left px-3 py-2 w-28">사업자번호</th>
              <th className="text-left px-3 py-2 w-20">담당자</th>
              {!compact && <th className="text-left px-3 py-2 w-24">전화</th>}
              {!compact && <th className="text-left px-3 py-2 w-40 hidden lg:table-cell">이메일</th>}
              {!compact && <th className="text-left px-3 py-2 w-20 hidden xl:table-cell">분류</th>}
              {!compact && <th className="text-right px-3 py-2 w-24">잔고</th>}
              {!compact && <th className="text-left px-3 py-2 w-24 hidden lg:table-cell">등록일</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={compact ? 4 : 9} className="text-center py-10 text-slate-400 font-semibold">
                {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
              </td></tr>
            ) : filtered.map((v, i) => (
              <tr key={v.id}
                onClick={() => handleVendorClick(v.id)}
                className="hover:bg-teal-50 cursor-pointer transition"
                title="클릭하여 상세 · 편집">
                <td className="px-3 py-1.5 text-orange-600 font-black text-[10px]">{i + 1}</td>
                <td className="px-3 py-1.5 font-bold text-slate-800">
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={11} className="text-teal-500 shrink-0" />
                    <span className="underline decoration-dotted decoration-teal-400 underline-offset-2 break-words">{v.company_name}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">{v.business_number ? formatBizNum(v.business_number) : <span className="text-rose-400 italic">없음</span>}</td>
                <td className="px-3 py-1.5 text-slate-700 truncate">{v.contact_name ?? "-"}</td>
                {!compact && <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">{v.phone ?? "-"}</td>}
                {!compact && <td className="px-3 py-1.5 text-slate-600 truncate hidden lg:table-cell" title={v.email ?? undefined}>{v.email ?? "-"}</td>}
                {!compact && <td className="px-3 py-1.5 text-slate-500 truncate hidden xl:table-cell">{v.category ?? "-"}</td>}
                {!compact && <td className="px-3 py-1.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">{v.latestBalance?.balance != null ? fmtWon(v.latestBalance.balance) : "-"}</td>}
                {!compact && <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400 hidden lg:table-cell">{v.created_at ? String(v.created_at).slice(0, 10) : "-"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 상세 모달 */}
      {modalVendor && (
        <VendorDetailModal
          vendor={modalVendor}
          onClose={() => setModalVendorId(null)}
          onSaved={loadVendors}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 공급사 상세 모달 · 편집 필드 + 잔고 · 매입 통계 · 최근 매입 이력
// ═══════════════════════════════════════════════════════════════════
interface PurchaseRow {
  id: number;
  purchase_date: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  total: number;
}
interface VendorSummary {
  totalAmount: number;
  totalQty: number;
  uniqueProducts: number;
  latestDate: string | null;
  earliestDate: string | null;
  count: number;
}

export const VendorDetailModal: React.FC<{ vendor: Vendor; onClose: () => void; onSaved: () => void; panel?: boolean }> = ({ vendor, onClose, onSaved, panel }) => {
  const [draft, setDraft] = useState<EditDraft>(emptyDraft(vendor));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchLoading, setPurchLoading] = useState(false);
  const [summary, setSummary] = useState<VendorSummary | null>(null);

  // ESC · 배경 클릭 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 매입 이력 · 통계 로드 (supplier 필터로 GET /api/purchase-details)
  useEffect(() => {
    setPurchLoading(true);
    fetch(`/api/purchase-details?supplier=${encodeURIComponent(vendor.company_name)}&limit=1000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        const rows: PurchaseRow[] = Array.isArray(j.rows) ? j.rows : [];
        setPurchases(rows.slice(0, 30)); // 최근 30건만 표시
        // 통계 · 전체 rows 기반
        const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
        const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const uniqueCodes = new Set(rows.map(r => String(r.product_code)));
        const dates = rows.map(r => String(r.purchase_date)).filter(Boolean).sort();
        setSummary({
          totalAmount, totalQty,
          uniqueProducts: uniqueCodes.size,
          latestDate: dates[dates.length - 1] ?? null,
          earliestDate: dates[0] ?? null,
          count: rows.length,
        });
      })
      .catch(() => { setPurchases([]); setSummary(null); })
      .finally(() => setPurchLoading(false));
  }, [vendor.id, vendor.company_name]);

  const isDirty = useMemo(() => (
    draft.company_name !== (vendor.company_name ?? "") ||
    draft.business_number !== (vendor.business_number ?? "") ||
    draft.contact_name !== (vendor.contact_name ?? "") ||
    draft.phone !== (vendor.phone ?? "") ||
    draft.email !== (vendor.email ?? "") ||
    draft.category !== (vendor.category ?? "") ||
    draft.note !== (vendor.note ?? "")
  ), [vendor, draft]);

  const handleSave = async () => {
    const bnDigits = normalizeBizNum(draft.business_number);
    if (bnDigits && bnDigits.length !== 10) { setSaveMsg({ type: "err", text: "사업자번호는 10자리 숫자여야 합니다" }); return; }
    if (!draft.company_name.trim()) { setSaveMsg({ type: "err", text: "회사명은 필수입니다" }); return; }
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
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
      onSaved();
    } catch (e: any) {
      setSaveMsg({ type: "err", text: `저장 실패: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={panel ? "relative bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0 flex-1" : "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"} onClick={panel ? undefined : onClose}>
      <div
        className={panel ? "relative flex flex-col flex-1 min-h-0 overflow-hidden" : "relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] md:h-auto md:min-h-[85vh] md:max-h-[92vh] flex flex-col overflow-hidden"}
        onClick={panel ? undefined : (e => e.stopPropagation())}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-gradient-to-r from-teal-50 to-emerald-50">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={22} className="text-teal-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-slate-800 truncate">{vendor.company_name}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {vendor.business_number ? formatBizNum(vendor.business_number) : <span className="text-rose-500 italic">사업자번호 없음</span>}
                {vendor.created_at && <span className="ml-2 text-slate-400">· 등록 {String(vendor.created_at).slice(0, 10)}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-2 transition">
            <X size={16} />
          </button>
        </div>

        {/* 본문 · 반응형 2단 (< lg 1단 · lg+ 2단 · 태블릿 답답함 해소) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {/* Left · 편집 필드 */}
            <div className="space-y-2.5">
              <SectionTitle icon="📝" title="기본 정보" />
              <Field label="회사명 *"><input type="text" value={draft.company_name} onChange={e => setDraft({ ...draft, company_name: e.target.value })} className={inputCls} /></Field>
              <Field label="사업자번호 (10자리)">
                <input type="text" value={draft.business_number} onChange={e => setDraft({ ...draft, business_number: normalizeBizNum(e.target.value) })} placeholder="0000000000" className={`${inputCls} font-mono`} maxLength={10} />
                {draft.business_number && draft.business_number.length === 10 && (
                  <div className="text-[10px] text-slate-500 mt-1">표시: {formatBizNum(draft.business_number)}</div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="담당자"><input type="text" value={draft.contact_name} onChange={e => setDraft({ ...draft, contact_name: e.target.value })} className={inputCls} /></Field>
                <Field label="전화"><input type="text" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="이메일"><input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="example@company.com" className={inputCls} /></Field>
              <Field label="카테고리"><input type="text" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="제약 · 의약외품 · 화장품 등" className={inputCls} /></Field>
              <Field label="비고"><textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} className={`${inputCls} h-16 resize-none`} /></Field>
            </div>

            {/* Right · 통계 · 매입 이력 */}
            <div className="space-y-3">
              <SectionTitle icon="📊" title="공급 요약" />
              {/* 4-way stat cards */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={<DollarSign size={12} />} color="emerald" label="최근 잔고" value={vendor.latestBalance?.balance != null ? vendor.latestBalance.balance.toLocaleString() + "원" : "-"} sub={vendor.latestBalance?.invoice_date ?? undefined} />
                <StatCard icon={<TrendingUp size={12} />} color="indigo" label="총 매입액" value={summary ? fmtWon(summary.totalAmount) : "-"} sub={summary ? `${summary.count.toLocaleString()}건` : undefined} />
                <StatCard icon={<Package size={12} />} color="violet" label="매입 상품" value={summary ? `${summary.uniqueProducts.toLocaleString()}종` : "-"} sub={summary?.totalQty ? `총 ${summary.totalQty.toLocaleString()}개` : undefined} />
                <StatCard icon={<Calendar size={12} />} color="rose" label="최근 매입일" value={summary?.latestDate ?? "-"} sub={summary?.earliestDate ? `첫 ${summary.earliestDate}` : undefined} />
              </div>

              <SectionTitle icon="📦" title="최근 매입 이력" hint={purchLoading ? "로딩..." : `${purchases.length}건`} />
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[300px] bg-slate-50/40">
                {purchLoading ? (
                  <div className="p-4 text-center text-slate-400 text-xs"><Loader2 size={14} className="animate-spin inline mr-1" />로딩중...</div>
                ) : purchases.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs">매입 이력 없음</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-500 text-[9px] uppercase">
                      <tr>
                        <th className="text-left px-2 py-1 w-16">일자</th>
                        <th className="text-left px-2 py-1">상품</th>
                        <th className="text-right px-2 py-1 w-10">수량</th>
                        <th className="text-right px-2 py-1 w-16">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {purchases.map((p, i) => (
                        <tr key={p.id ?? i} className="hover:bg-white transition align-top">
                          <td className="px-2 py-1 font-mono text-slate-500 whitespace-nowrap">{String(p.purchase_date).slice(5)}</td>
                          <td className="px-2 py-1 text-slate-700 break-words leading-tight">{p.product_name}</td>
                          <td className="text-right px-2 py-1 font-mono text-slate-700">{Number(p.quantity ?? 0).toLocaleString()}</td>
                          <td className="text-right px-2 py-1 font-mono font-bold text-emerald-700 whitespace-nowrap">{Number(p.total ?? p.amount ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 · 저장/취소 */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap">
          {saveMsg && (
            <span className={`text-xs font-bold ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {saveMsg.type === "ok" ? "✓" : "✗"} {saveMsg.text}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 font-bold transition">닫기</button>
          <button onClick={handleSave} disabled={!isDirty || saving}
            className="inline-flex items-center gap-1 text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-lg transition shadow-sm">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}저장
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 공용 UI 헬퍼 ───────────────────────────────────────────
const inputCls = "w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-black text-slate-600 mb-0.5">{label}</div>
    {children}
  </label>
);

const SectionTitle: React.FC<{ icon: string; title: string; hint?: string }> = ({ icon, title, hint }) => (
  <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
    <span className="text-sm">{icon}</span>
    <span className="text-[12px] font-black text-slate-700">{title}</span>
    {hint && <span className="ml-auto text-[10px] text-slate-400 font-mono">{hint}</span>}
  </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; color: "emerald" | "indigo" | "violet" | "rose"; label: string; value: string; sub?: string }> = ({ icon, color, label, value, sub }) => {
  const c: Record<string, string> = {
    emerald: "from-emerald-50 to-emerald-100/60 border-emerald-200 text-emerald-800",
    indigo:  "from-indigo-50 to-indigo-100/60 border-indigo-200 text-indigo-800",
    violet:  "from-violet-50 to-violet-100/60 border-violet-200 text-violet-800",
    rose:    "from-rose-50 to-rose-100/60 border-rose-200 text-rose-800",
  };
  return (
    <div className={`bg-gradient-to-br ${c[color]} border rounded-lg px-2.5 py-2 shadow-sm`}>
      <div className="flex items-center gap-1 text-[10px] font-black opacity-70 uppercase tracking-wider">
        {icon}<span>{label}</span>
      </div>
      <div className="text-sm sm:text-base font-black mt-0.5 font-mono truncate" title={value}>{value}</div>
      {sub && <div className="text-[9px] font-semibold opacity-60 mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
};
