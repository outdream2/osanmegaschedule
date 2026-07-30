// src/components/LandingPage/VendorListEditor.tsx
// 공급사관리 · 한 줄 테이블 리스트 + 상세 모달 (2026-07-30 UI 리디자인)
//   리스트: shadcn data-table 스타일 · 그룹 컬러 헤더 · h-8 툴바
//   모달:   헤더 gradient · 폼 h-9 · 매입이력 shadcn 스타일 · 하단 저장/닫기 통일

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, Check, X, Loader2, Building2, Package, Calendar,
  DollarSign, TrendingUp, RefreshCw,
} from "lucide-react";

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
const fmtWon = (n: number): string =>
  n >= 1_0000_0000 ? `${(n / 1_0000_0000).toFixed(1)}억` :
  n >= 10000 ? `${(n / 10000).toFixed(1)}만` :
  `${n.toLocaleString()}원`;

export const VendorListEditor: React.FC<VendorListEditorProps> = ({
  initialSelectedId,
  onEditRequest,
  compact = false,
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMissingBiz, setFilterMissingBiz] = useState(false);
  const [modalVendorId, setModalVendorId] = useState<number | null>(null);

  const handleVendorClick = (id: number) => {
    if (onEditRequest) { onEditRequest(id); } else { setModalVendorId(id); }
  };

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
        const name    = (v.company_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const bn      = (v.business_number ?? "").replace(/[^0-9]/g, "");
        const contact = (v.contact_name ?? "").toLowerCase().replace(/[^0-9가-힣a-z]/g, "");
        const phone   = (v.phone ?? "").replace(/[^0-9]/g, "");
        const email   = (v.email ?? "").toLowerCase();
        return name.includes(q) || bn.includes(q) || contact.includes(q) || phone.includes(q) || email.includes(q);
      });
    }
    return list.slice().sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "", "ko"));
  }, [vendors, search, filterMissingBiz]);

  const missingCount = vendors.filter(v => !v.business_number).length;
  const modalVendor = useMemo(() => vendors.find(v => v.id === modalVendorId) ?? null, [vendors, modalVendorId]);

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">

      {/* ── 툴바 ── */}
      <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2">
        {/* 검색 */}
        <div className="relative flex-1 min-w-[200px] sm:min-w-[260px] sm:flex-none">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="회사명 · 사업자번호 · 담당자 · 전화 · 이메일"
            className="h-8 pl-8 pr-3 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 w-full sm:w-80 transition"
          />
        </div>

        {/* 필터 chip */}
        <button
          onClick={() => setFilterMissingBiz(v => !v)}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-semibold transition cursor-pointer ${
            filterMissingBiz
              ? "bg-rose-50 border-rose-300 text-rose-700"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${filterMissingBiz ? "bg-rose-500 border-rose-500" : "border-slate-300"}`}>
            {filterMissingBiz && <Check size={9} className="text-white" strokeWidth={3} />}
          </span>
          사업자번호 미등록
          <span className={`text-[11px] font-black ${filterMissingBiz ? "text-rose-600" : "text-slate-400"}`}>
            {missingCount}
          </span>
        </button>

        {/* 건수 */}
        <span className="text-[12px] font-mono text-slate-400 tabular-nums">
          {loading
            ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />로딩...</span>
            : `${filtered.length} / ${vendors.length}건`}
        </span>

        {/* icon-only 새로고침 */}
        <button
          onClick={loadVendors}
          disabled={loading}
          className="ml-auto inline-flex items-center justify-center h-8 w-8 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
          title="새로고침"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── 반응형 리스트 ── */}
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">

        {/* 모바일(< md): 카드 */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm font-semibold">
              {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
            </div>
          ) : filtered.map((v, i) => (
            <button
              key={v.id}
              onClick={() => handleVendorClick(v.id)}
              className="w-full text-left px-3 py-2.5 hover:bg-teal-50/60 active:bg-teal-100 transition"
            >
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-slate-400 font-mono mt-0.5 w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Building2 size={11} className="text-teal-500 shrink-0" />
                    <span className="text-[13px] font-bold text-slate-800 break-words">{v.company_name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
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

        {/* 태블릿·데스크탑(md+): shadcn data-table 스타일 */}
        <table className="hidden md:table w-full text-xs">
          <thead className="sticky top-0 bg-white z-10 border-b border-slate-200">
            {/* 그룹 컬러 헤더 */}
            <tr className="text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
              <th colSpan={compact ? 3 : 4} className="text-center py-1.5 bg-sky-50 text-sky-700 border-r border-slate-100">
                기본 정보
              </th>
              {!compact && (
                <>
                  <th colSpan={2} className="text-center py-1.5 bg-amber-50 text-amber-700 border-r border-slate-100">
                    연락처
                  </th>
                  <th className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-r border-slate-100">
                    잔고
                  </th>
                  <th className="text-center py-1.5 bg-slate-50 text-slate-500">
                    기타
                  </th>
                </>
              )}
            </tr>
            {/* 서브 헤더 */}
            <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-2 py-1.5 w-8 bg-sky-50/30">#</th>
              <th className="text-left px-3 py-1.5 min-w-[160px] bg-sky-50/30">회사명</th>
              <th className="text-left px-3 py-1.5 w-28 bg-sky-50/30">사업자번호</th>
              <th className="text-left px-3 py-1.5 w-20 bg-sky-50/30">담당자</th>
              {!compact && (
                <>
                  <th className="text-left px-3 py-1.5 w-28 bg-amber-50/30">전화</th>
                  <th className="text-left px-3 py-1.5 w-36 hidden lg:table-cell bg-amber-50/30">이메일</th>
                  <th className="text-right px-3 py-1.5 w-24 bg-emerald-50/30">잔고</th>
                  <th className="text-left px-3 py-1.5 w-20 hidden xl:table-cell bg-slate-50/40">분류</th>
                  <th className="text-left px-3 py-1.5 w-24 hidden lg:table-cell bg-slate-50/40">등록일</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={compact ? 4 : 9} className="text-center py-12 text-slate-400 font-semibold">
                  {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 데이터 없음"}
                </td>
              </tr>
            ) : filtered.map((v, i) => (
              <tr
                key={v.id}
                onClick={() => handleVendorClick(v.id)}
                className="hover:bg-slate-50/60 cursor-pointer transition"
                title="클릭하여 상세 · 편집"
              >
                <td className="px-2 py-1.5 text-[11px] text-slate-400 font-mono tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5 font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={11} className="text-teal-500 shrink-0" />
                    <span className="underline decoration-dotted decoration-teal-300 underline-offset-2 break-words">{v.company_name}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                  {v.business_number
                    ? formatBizNum(v.business_number)
                    : <span className="text-rose-400 italic text-[11px]">없음</span>}
                </td>
                <td className="px-3 py-1.5 text-slate-700 truncate">{v.contact_name ?? "-"}</td>
                {!compact && (
                  <>
                    <td className="px-3 py-1.5 font-mono text-slate-600 whitespace-nowrap">{v.phone ?? "-"}</td>
                    <td className="px-3 py-1.5 text-slate-600 truncate hidden lg:table-cell" title={v.email ?? undefined}>{v.email ?? "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      {v.latestBalance?.balance != null ? fmtWon(v.latestBalance.balance) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 truncate hidden xl:table-cell">{v.category ?? "-"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400 hidden lg:table-cell">
                      {v.created_at ? String(v.created_at).slice(0, 10) : "-"}
                    </td>
                  </>
                )}
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

export const VendorDetailModal: React.FC<{
  vendor: Vendor;
  onClose: () => void;
  onSaved: () => void;
  panel?: boolean;
}> = ({ vendor, onClose, onSaved, panel }) => {
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

  // 매입 이력 · 통계 로드
  useEffect(() => {
    setPurchLoading(true);
    fetch(`/api/purchase-details?supplier=${encodeURIComponent(vendor.company_name)}&limit=1000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        const rows: PurchaseRow[] = Array.isArray(j.rows) ? j.rows : [];
        setPurchases(rows.slice(0, 30));
        const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
        const totalQty    = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const uniqueCodes = new Set(rows.map(r => String(r.product_code)));
        const dates       = rows.map(r => String(r.purchase_date)).filter(Boolean).sort();
        setSummary({
          totalAmount, totalQty,
          uniqueProducts: uniqueCodes.size,
          latestDate:   dates[dates.length - 1] ?? null,
          earliestDate: dates[0] ?? null,
          count: rows.length,
        });
      })
      .catch(() => { setPurchases([]); setSummary(null); })
      .finally(() => setPurchLoading(false));
  }, [vendor.id, vendor.company_name]);

  const isDirty = useMemo(() => (
    draft.company_name    !== (vendor.company_name    ?? "") ||
    draft.business_number !== (vendor.business_number ?? "") ||
    draft.contact_name    !== (vendor.contact_name    ?? "") ||
    draft.phone           !== (vendor.phone           ?? "") ||
    draft.email           !== (vendor.email           ?? "") ||
    draft.category        !== (vendor.category        ?? "") ||
    draft.note            !== (vendor.note            ?? "")
  ), [vendor, draft]);

  const handleSave = async () => {
    const bnDigits = normalizeBizNum(draft.business_number);
    if (bnDigits && bnDigits.length !== 10) {
      setSaveMsg({ type: "err", text: "사업자번호는 10자리 숫자여야 합니다" });
      return;
    }
    if (!draft.company_name.trim()) {
      setSaveMsg({ type: "err", text: "회사명은 필수입니다" });
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 2026-07-22: 'email' 컬럼이 Supabase vendors 스키마에 없어 저장 실패 · 페이로드에서 제외
        //   (UI 는 유지 · 나중에 DB 마이그레이션 시 다시 활성)
        body: JSON.stringify({
          company_name:    draft.company_name.trim(),
          business_number: bnDigits || null,
          contact_name:    draft.contact_name.trim() || null,
          phone:           draft.phone.trim() || null,
          category:        draft.category.trim() || null,
          note:            draft.note.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error ?? `서버 ${res.status}`);
      }
      setSaveMsg({ type: "ok", text: "저장 완료" });
      onSaved();
    } catch (e: any) {
      setSaveMsg({ type: "err", text: `저장 실패: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  // ── 래퍼: panel 모드는 인라인 · 기본은 backdrop 모달 ──
  const backdropCls = panel
    ? "relative bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-0 flex-1"
    : "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4";

  const innerCls = panel
    ? "relative flex flex-col flex-1 min-h-0 overflow-hidden"
    : "relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] md:h-auto md:min-h-[85vh] md:max-h-[92vh] flex flex-col overflow-hidden";

  return (
    <div className={backdropCls} onClick={panel ? undefined : onClose}>
      <div
        className={innerCls}
        onClick={panel ? undefined : (e => e.stopPropagation())}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-teal-50 via-emerald-50 to-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-teal-700" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-black text-slate-800 truncate leading-tight">{vendor.company_name}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                {vendor.business_number
                  ? <span className="tabular-nums">{formatBizNum(vendor.business_number)}</span>
                  : <span className="text-rose-500 italic">사업자번호 없음</span>}
                {vendor.created_at && (
                  <span className="text-slate-400">· 등록 {String(vendor.created_at).slice(0, 10)}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-3 transition"
            title="닫기 (ESC)"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

            {/* Left · 기본 정보 편집 */}
            <div className="space-y-3">
              <SectionTitle icon={<Building2 size={13} />} title="기본 정보" color="sky" />

              <Field label="회사명 *">
                <input
                  type="text"
                  value={draft.company_name}
                  onChange={e => setDraft({ ...draft, company_name: e.target.value })}
                  className={inputCls}
                />
              </Field>

              <Field label="사업자번호 (10자리)">
                <input
                  type="text"
                  value={draft.business_number}
                  onChange={e => setDraft({ ...draft, business_number: normalizeBizNum(e.target.value) })}
                  placeholder="0000000000"
                  className={`${inputCls} font-mono tracking-widest`}
                  maxLength={10}
                />
                {draft.business_number && draft.business_number.length === 10 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    표시: <span className="font-mono font-semibold text-slate-600">{formatBizNum(draft.business_number)}</span>
                  </p>
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
                <input
                  type="email"
                  value={draft.email}
                  onChange={e => setDraft({ ...draft, email: e.target.value })}
                  placeholder="example@company.com"
                  className={inputCls}
                />
              </Field>

              <Field label="카테고리">
                <input
                  type="text"
                  value={draft.category}
                  onChange={e => setDraft({ ...draft, category: e.target.value })}
                  placeholder="제약 · 의약외품 · 화장품 등"
                  className={inputCls}
                />
              </Field>

              <Field label="비고">
                <textarea
                  value={draft.note}
                  onChange={e => setDraft({ ...draft, note: e.target.value })}
                  className={`${inputCls} h-[72px] resize-none`}
                />
              </Field>
            </div>

            {/* Right · 통계 · 매입 이력 */}
            <div className="space-y-4">
              <SectionTitle icon={<TrendingUp size={13} />} title="공급 요약" color="emerald" />

              {/* 4-way stat cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard
                  icon={<DollarSign size={12} />} color="emerald" label="최근 잔고"
                  value={vendor.latestBalance?.balance != null ? fmtWon(vendor.latestBalance.balance) : "-"}
                  sub={vendor.latestBalance?.invoice_date ?? undefined}
                />
                <StatCard
                  icon={<TrendingUp size={12} />} color="indigo" label="총 매입액"
                  value={summary ? fmtWon(summary.totalAmount) : "-"}
                  sub={summary ? `${summary.count.toLocaleString()}건` : undefined}
                />
                <StatCard
                  icon={<Package size={12} />} color="violet" label="매입 상품"
                  value={summary ? `${summary.uniqueProducts.toLocaleString()}종` : "-"}
                  sub={summary?.totalQty ? `총 ${summary.totalQty.toLocaleString()}개` : undefined}
                />
                <StatCard
                  icon={<Calendar size={12} />} color="rose" label="최근 매입일"
                  value={summary?.latestDate ?? "-"}
                  sub={summary?.earliestDate ? `첫 ${summary.earliestDate}` : undefined}
                />
              </div>

              {/* 매입 이력 테이블 */}
              <div>
                <SectionTitle
                  icon={<Package size={13} />}
                  title="최근 매입 이력"
                  color="amber"
                  hint={purchLoading ? "로딩..." : `${purchases.length}건`}
                />
              </div>

              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[280px] bg-white">
                {purchLoading ? (
                  <div className="flex items-center justify-center gap-1.5 py-8 text-slate-400 text-[12px]">
                    <Loader2 size={14} className="animate-spin" />로딩중...
                  </div>
                ) : purchases.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-[12px]">매입 이력 없음</div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <th className="text-left px-3 py-2 w-16">일자</th>
                        <th className="text-left px-3 py-2">상품</th>
                        <th className="text-right px-3 py-2 w-12">수량</th>
                        <th className="text-right px-3 py-2 w-20">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {purchases.map((p, i) => (
                        <tr key={p.id ?? i} className="hover:bg-slate-50/60 transition align-top">
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                            {String(p.purchase_date).slice(5)}
                          </td>
                          <td className="px-3 py-1.5 text-slate-700 break-words leading-snug">{p.product_name}</td>
                          <td className="text-right px-3 py-1.5 font-mono tabular-nums text-slate-700">
                            {Number(p.quantity ?? 0).toLocaleString()}
                          </td>
                          <td className="text-right px-3 py-1.5 font-mono font-bold text-emerald-700 whitespace-nowrap tabular-nums">
                            {Number(p.total ?? p.amount ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── 푸터 · 저장/닫기 ── */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center gap-2 flex-wrap shrink-0">
          {saveMsg && (
            <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${saveMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
              {saveMsg.type === "ok"
                ? <Check size={13} strokeWidth={3} />
                : <X size={13} strokeWidth={3} />}
              {saveMsg.text}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="h-8 px-4 text-[12px] font-semibold bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 transition cursor-pointer"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex items-center gap-1.5 h-8 px-5 text-[12px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition shadow-sm cursor-pointer"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 공용 UI 헬퍼 ────────────────────────────────────────────────

/** shadcn form input · h-9 · focus ring teal */
const inputCls =
  "w-full h-9 px-3 text-[13px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 bg-white transition placeholder:text-slate-300";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">{label}</span>
    {children}
  </label>
);

const colorMap = {
  sky:     { bar: "bg-sky-500",     text: "text-sky-700",     icon: "text-sky-600"     },
  emerald: { bar: "bg-emerald-500", text: "text-emerald-700", icon: "text-emerald-600" },
  amber:   { bar: "bg-amber-500",   text: "text-amber-700",   icon: "text-amber-600"   },
  rose:    { bar: "bg-rose-500",    text: "text-rose-700",    icon: "text-rose-600"    },
  teal:    { bar: "bg-teal-500",    text: "text-teal-700",    icon: "text-teal-600"    },
  indigo:  { bar: "bg-indigo-500",  text: "text-indigo-700",  icon: "text-indigo-600"  },
  violet:  { bar: "bg-violet-500",  text: "text-violet-700",  icon: "text-violet-600"  },
} as const;

type ColorKey = keyof typeof colorMap;

const SectionTitle: React.FC<{
  icon: React.ReactNode;
  title: string;
  color: ColorKey;
  hint?: string;
}> = ({ icon, title, color, hint }) => {
  const c = colorMap[color];
  return (
    <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
      <span className={`w-1 h-3.5 rounded-full ${c.bar} shrink-0`} />
      <span className={`${c.icon} shrink-0`}>{icon}</span>
      <span className={`text-[13px] font-black ${c.text}`}>{title}</span>
      {hint && <span className="ml-auto text-[11px] text-slate-400 font-mono tabular-nums">{hint}</span>}
    </div>
  );
};

const statColorMap: Record<string, string> = {
  emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-800",
  indigo:  "from-indigo-50 to-indigo-100/50 border-indigo-200 text-indigo-800",
  violet:  "from-violet-50 to-violet-100/50 border-violet-200 text-violet-800",
  rose:    "from-rose-50 to-rose-100/50 border-rose-200 text-rose-800",
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  color: "emerald" | "indigo" | "violet" | "rose";
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, color, label, value, sub }) => (
  <div className={`bg-gradient-to-br ${statColorMap[color]} border rounded-xl px-3 py-2.5 shadow-sm`}>
    <div className="flex items-center gap-1 text-[10px] font-black opacity-70 uppercase tracking-wider mb-1">
      {icon}<span>{label}</span>
    </div>
    <div className="text-sm font-black font-mono truncate" title={value}>{value}</div>
    {sub && <div className="text-[10px] font-semibold opacity-60 mt-0.5 truncate" title={sub}>{sub}</div>}
  </div>
);
