// src/components/DisplayPage/VendorManageSplit.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage 대형 파일 분리 · VendorManageSplit 이관
// 2026-08-10 · 사용자 요청 · 매장 > 공급사관리 · SplitPanel · PC 좌우 · 모바일 모달
//   Left  · 4컬럼 텍스트 리스트 (분류·공급사·담당자·전화) · 아이콘 X · displayVendorName
//   Right · VendorDetailModal panel 모드 (사업자번호·이메일 · 상세에서만)
//   Mobile · SplitPanel mobileRightAsModal · 우측 자동 모달
import React, { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Search as SearchIcon } from "lucide-react";
import { useVendors as useVendorsHook } from "../../hooks/useVendors";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { CARD_BASE } from "../../styles/tokens";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { SplitPanel } from "../common/SplitPanel";
import { NewVendorModal } from "../common/features/NewVendorModal";
import { StatusPill } from "../common/StatusPill";

const VendorDetailModalLazy = React.lazy(() => import("../LandingPage/VendorListEditor").then(m => ({ default: m.VendorDetailModal })));

export const VendorManageSplit: React.FC = () => {
  const { vendors, loading, refresh } = useVendorsHook();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("전체");
  // 2026-08-10 · 사용자 요청 · 신규 공급사 등록 모달 (복원 · 90회전 옆 [+ 신규] 버튼)
  const [showNewVendor, setShowNewVendor] = useState(false);
  // 2026-08-10 · 사용자 요청 · 자동 정렬 · 헤더 클릭 · 원칙
  type VmSortKey = "category" | "company_name" | "contact_name" | "phone";
  const [sortKey, setSortKey] = useState<VmSortKey>("company_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (key: VmSortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => (d === "asc" ? "desc" : "asc")); return prev; }
      setSortDir("asc");
      return key;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = vendors.filter(v => {
      if (q && !(
        String(v.company_name ?? "").toLowerCase().includes(q)
        || String(v.contact_name ?? "").toLowerCase().includes(q)
        || String(v.phone ?? "").toLowerCase().includes(q)
      )) return false;
      if (catFilter !== "전체" && v.category !== catFilter) return false;
      return true;
    });
    // 자동 정렬
    const dirMul = sortDir === "asc" ? 1 : -1;
    const nameOf = (v: any) => displayVendorName(String(v.company_name ?? "")) || String(v.company_name ?? "");
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "category":     cmp = String(a.category ?? "").localeCompare(String(b.category ?? ""), "ko"); break;
        case "company_name": cmp = nameOf(a).localeCompare(nameOf(b), "ko"); break;
        case "contact_name": cmp = String(a.contact_name ?? "").localeCompare(String(b.contact_name ?? ""), "ko"); break;
        case "phone":        cmp = String(a.phone ?? "").localeCompare(String(b.phone ?? ""), "ko"); break;
      }
      if (cmp === 0) cmp = nameOf(a).localeCompare(nameOf(b), "ko");
      return cmp * dirMul;
    });
  }, [vendors, search, catFilter, sortKey, sortDir]);

  const selected = useMemo(() => vendors.find(v => v.id === selectedId) ?? null, [vendors, selectedId]);

  // 정렬 헤더 셀 · 클릭 정렬 · asc/desc 표시
  const SortTh: React.FC<{ label: string; sk: VmSortKey; className?: string }> = ({ label, sk, className = "" }) => (
    <button
      type="button"
      onClick={() => toggleSort(sk)}
      className={`inline-flex items-center gap-0.5 select-none cursor-pointer hover:text-indigo-600 transition ${
        sortKey === sk ? "text-indigo-600" : "text-zinc-600"
      } ${className}`}
    >
      {label}
      {sortKey === sk
        ? (sortDir === "asc" ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />)
        : <span className="text-zinc-300 text-[9px]">↕</span>}
    </button>
  );

  const left = (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* 툴바 · 공통 CARD_BASE · 2026-08-17 · 최신 트렌드 · 좌측 accent bar */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-col gap-2.5 shrink-0`}>
        {/* 헤더 · 좌 accent bar + 제목 + count */}
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <span className="text-[17px] font-bold text-ink tracking-tight">공급사관리</span>
          <StatusPill tone="brand" size="md">
            {loading ? <Spinner size={12} tone="brand" className="inline" /> : `${filtered.length}건`}
          </StatusPill>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <SearchIcon size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="회사명 · 담당자 · 전화"
              className="w-full h-9 pl-9 pr-2 text-[14px] border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
          {(["전체", "위탁", "선결제", "60회전", "90회전"] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`h-8 px-3 rounded-md text-[12px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                catFilter === cat
                  ? cat === "전체"    ? "bg-zinc-700 text-white shadow-sm"
                  : cat === "위탁"    ? "bg-violet-500 text-white shadow-sm"
                  : cat === "선결제"  ? "bg-rose-500 text-white shadow-sm"
                  : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                  :                    "bg-teal-500 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-md"
              }`}
            >
              {cat}
            </button>
          ))}
          {/* 2026-08-10 · 사용자 요청 · 90회전 옆 · 신규 공급사 등록 버튼 */}
          <button
            onClick={() => setShowNewVendor(true)}
            className="ml-auto h-8 px-3 rounded-md text-[12px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] transition cursor-pointer whitespace-nowrap shrink-0"
            title="새 공급사 등록"
          >
            + 신규 등록
          </button>
        </div>
      </div>
      {/* 2026-08-10 · 신규 공급사 등록 모달 */}
      {showNewVendor && (
        <NewVendorModal
          onClose={() => setShowNewVendor(false)}
          onSaved={() => { setShowNewVendor(false); refresh(); }}
        />
      )}

      {/* 리스트 · 통일 CARD_BASE · 헤더 정렬 · 모바일도 4컬럼 (컴팩트) · 2026-08-10 */}
      <div className={`${CARD_BASE} flex-1 min-h-0 overflow-auto`}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-line">
            <tr>
              {/* 2026-08-10 · #20 · 분류 컬럼 제거 · 공급사 셀에 [분류][줄바꿈][공급사명] 통합 (사용자 요청) */}
              {/* 2026-08-10 · 사용자 요청 · 폰트 +1 · 공급사 이름 wrap · 왼쪽 한눈에 · whitespace-normal */}
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold min-w-[120px]"><SortTh label="공급사" sk="company_name" /></th>
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold w-20 sm:w-24"><SortTh label="담당자" sk="contact_name" /></th>
              <th className="text-left px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] font-bold w-28 sm:w-36"><SortTh label="전화" sk="phone" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-[13px] font-semibold text-zinc-400">
                  {loading ? "로딩 중..." : search ? "검색 결과 없음" : "공급사 없음"}
                </td>
              </tr>
            ) : filtered.map(v => {
              const isActive = selectedId === v.id;
              const catCls = v.category === "위탁" ? "text-violet-700"
                : v.category === "선결제"  ? "text-rose-700"
                : v.category === "60회전" ? "text-emerald-700"
                : v.category === "90회전" ? "text-teal-700"
                :                            "text-zinc-500";
              return (
                <tr
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`cursor-pointer transition ${isActive ? "bg-indigo-50/60" : "hover:bg-zinc-50/80"}`}
                >
                  <td className="px-2 sm:px-3 py-2 align-top" title={String(v.company_name ?? "")}>
                    <div className="flex flex-col leading-tight">
                      <span className={`text-[12px] sm:text-[13px] font-bold ${catCls}`}>
                        {v.category || <span className="text-zinc-300">-</span>}
                      </span>
                      {/* 공급사명 · 길면 wrap · 폰트 +1 */}
                      <span className={`text-[13px] sm:text-[14px] font-bold break-words whitespace-normal ${isActive ? "text-indigo-900" : "text-zinc-800"}`}>
                        {displayVendorName(String(v.company_name ?? "")) || String(v.company_name ?? "")}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] text-zinc-600 whitespace-nowrap align-top">
                    <span className="block break-words">
                      {String(v.contact_name ?? "") || <span className="text-zinc-300">-</span>}
                    </span>
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-[13px] sm:text-[14px] text-zinc-600 tabular-nums whitespace-nowrap align-top">
                    <span className="block break-words">
                      {String(v.phone ?? "") || <span className="text-zinc-300">-</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const right = selected ? (
    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="공급사 상세 로딩 중..." size={16} tone="brand" /></div>}>
      <VendorDetailModalLazy vendor={selected as any} onClose={() => setSelectedId(null)} onSaved={refresh} panel />
    </React.Suspense>
  ) : (
    <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 min-h-[400px] gap-3 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-brand-tint flex items-center justify-center">
        <Building2 size={30} className="text-brand-deep/70" />
      </div>
      <div className="text-[15px] font-semibold text-ink tracking-tight">좌측에서 공급사를 선택하세요</div>
      <div className="text-[13px] text-ink-soft">사업자번호 · 담당자 · 결제 조건 상세</div>
    </div>
  );

  return (
    <SplitPanel
      storageKey="vendor-manage.leftWidth"
      /* 2026-08-10 · 사용자 요청 · 기본 5:5 · 뷰포트 절반 (min-1200px 라면 600) */
      defaultWidth={typeof window !== "undefined" ? Math.max(400, Math.min(900, Math.floor(window.innerWidth / 2))) : 600}
      minWidth={280}
      maxWidth={1200}
      dividerColor="indigo"
      left={left}
      right={right}
      wrapLeft={false}
      mobileRightAsModal
      mobileModalTitle={selected ? String((selected as any).company_name ?? "공급사 상세") : "공급사 상세"}
      mobileOpen={selectedId != null}
      onMobileClose={() => setSelectedId(null)}
    />
  );
};
