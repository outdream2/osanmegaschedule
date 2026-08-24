// src/components/DisplayPage/VendorManageSplit.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage 대형 파일 분리 · VendorManageSplit 이관
// 2026-08-10 · 사용자 요청 · 매장 > 공급사관리 · SplitPanel · PC 좌우 · 모바일 모달
//   Left  · 4컬럼 텍스트 리스트 (분류·공급사·담당자·전화) · 아이콘 X · displayVendorName
//   Right · VendorDetailModal panel 모드 (사업자번호·이메일 · 상세에서만)
//   Mobile · SplitPanel mobileRightAsModal · 우측 자동 모달
import React, { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";
import { useVendors as useVendorsHook } from "../../hooks/useVendors";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { Spinner } from "../common/Spinner";
import { SplitPanel } from "../common/SplitPanel";
import { NewVendorModal } from "../common/features/NewVendorModal";
import { StatusPill } from "../common/StatusPill";
// 2026-08-23 · #151 · Card + EmptyState 프리미티브 확산
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
// 2026-08-23 · #198 Phase 3A · SplitListPanel 프리미티브 (v2 · countDisplay + CategoryChips 프리미티브)
// UI 목업 대원칙 준수 · docs/UI_MOCKUP_2026-08-21.html · Linear/Vercel 톤 · 딥네이비 accent
import { SplitListPanel } from "../common/SplitListPanel";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";

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

  // 2026-08-23 · #198 Phase 3A · CategoryChips 프리미티브 · 5 카테고리 통일
  //   · UI 목업 준수 · Linear/Vercel 톤 · 파스텔 지양 · 프레임워크 색상 시스템
  const CAT_OPTIONS: Array<{ value: string; label: string; tone: ChipTone }> = [
    { value: "전체",    label: "전체",    tone: "zinc"    },
    { value: "위탁",    label: "위탁",    tone: "violet"  },
    { value: "선결제",  label: "선결제",  tone: "rose"    },
    { value: "60회전",  label: "60회전",  tone: "emerald" },
    { value: "90회전",  label: "90회전",  tone: "teal"    },
  ];

  const left = (
    // 2026-08-23 · #198 Phase 3A · SplitListPanel 프리미티브 · UI 통일 (목업 준수)
    //   · CARD_BASE 인라인 헤더 → SplitListPanel · countDisplay 로 loading + N건 표시
    //   · CategoryChips 프리미티브로 chip 필터 통일 · 하드코딩 색상 제거
    //   · onAdd 로 신규 등록 버튼 통일 (딥네이비 · h-8)
    <SplitListPanel
      topAccent
      title="공급사관리"
      countDisplay={
        <StatusPill tone="brand" size="md">
          {loading ? <Spinner size={12} tone="brand" className="inline" /> : `${filtered.length}건`}
        </StatusPill>
      }
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="회사명 · 담당자 · 전화"
      onAdd={() => setShowNewVendor(true)}
      addLabel="신규 등록"
      addTitle="새 공급사 등록"
      filters={
        <CategoryChips
          value={catFilter}
          onChange={(v) => setCatFilter(String(v))}
          options={CAT_OPTIONS}
          size="sm"
          ariaLabel="공급사 카테고리 필터"
        />
      }
      bodyClassName="flex-1 min-h-0 overflow-auto"
    >
      <>
      {/* 2026-08-10 · 신규 공급사 등록 모달 */}
      {showNewVendor && (
        <NewVendorModal
          onClose={() => setShowNewVendor(false)}
          onSaved={() => { setShowNewVendor(false); refresh(); }}
        />
      )}
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
      </>
    </SplitListPanel>
  );

  const right = selected ? (
    <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16"><Spinner label="공급사 상세 로딩 중..." size={16} tone="brand" /></div>}>
      <VendorDetailModalLazy vendor={selected as any} onClose={() => setSelectedId(null)} onSaved={refresh} panel />
    </React.Suspense>
  ) : (
    <Card padding="none" rounded="xl" className="flex-1 min-h-[400px]">
      <EmptyState
        icon={Building2}
        title="좌측에서 공급사를 선택하세요"
        hint="사업자번호 · 담당자 · 결제 조건 상세"
        size="large"
      />
    </Card>
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
