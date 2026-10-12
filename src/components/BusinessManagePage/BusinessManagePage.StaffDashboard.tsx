// 2026-10-11 · #14-P3 · 직원관리 대시보드 (사용자 지시 · 대시보드 + 슬라이딩 drawer)
//   · 상단 · 직원 KPI (총재직 · 직군별 · 신규 입사 · 계약 만료 임박 · 생일 임박)
//   · 아래 · 직원 compact 카드 grid (좌)
//   · 클릭 시 · 오른쪽 slide-in drawer · 기본 정보 + "상세 편집 열기" 버튼
//   · 홈 랜딩 톤 · CARD + 2-tier typography · 폰트 2026-10-10 대원칙
//
//   참고 · StaffManagePage 는 유지 (딥링크/다른 라우팅 호환) · 이 대시보드는 inner tab 전용

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listEmployees } from "../../lib/employeeApi";
import type { Employee } from "../../types";
import { Spinner } from "../common/Spinner";
import { StaffListTable, POSITION_TONE } from "./common/StaffListTable";
import { EmployeeDrawer } from "./common/EmployeeDrawer";
import type { EmployeeExt as StaffListEmployeeExt } from "./common/StaffListTable";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

type EmployeeExt = Employee & {
  contract_type?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  birth_date?: string | null;
};

const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const currentYm = (): string => todayYmd().slice(0, 7);
const daysBetween = (ymdA: string, ymdB: string): number => {
  const a = new Date(ymdA + "T00:00:00").getTime();
  const b = new Date(ymdB + "T00:00:00").getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
};
const monthsBetween = (fromYmd: string, toYmd: string): number => {
  if (!fromYmd) return 0;
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  if (!fy || !ty) return 0;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
};

const POSITION_ORDER = ["약사", "매장", "창고", "캐셔", "진열", "물류", "알바", "기타"];

export interface StaffDashboardProps {
  /** 상세 편집 열기 · 부모 state 로 StaffManagePage 전체 render 전환 */
  onOpenFullStaffManage: (empId: number) => void;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onOpenFullStaffManage }) => {
  const [employees, setEmployees] = useState<EmployeeExt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPosition, setFilterPosition] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listEmployees().catch(() => [] as Employee[]);
      setEmployees(list as EmployeeExt[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeEmps = useMemo(() => employees.filter(e => !e.retireDate), [employees]);
  const today = todayYmd();
  const curYm = currentYm();

  // KPIs
  const newThisMonth = useMemo(
    () => activeEmps.filter(e => (e.hireDate ?? "").startsWith(curYm)).length,
    [activeEmps, curYm],
  );
  const expiringCount = useMemo(() => (
    activeEmps.filter(e => {
      if (!e.contract_end) return false;
      const d = daysBetween(e.contract_end, today);
      return d >= 0 && d <= 30;
    }).length
  ), [activeEmps, today]);
  const birthdayCount = useMemo(() => (
    activeEmps.filter(e => {
      if (!e.birth_date) return false;
      const mmdd = e.birth_date.slice(5); // MM-DD
      const todayMmdd = today.slice(5);
      // 7일 이내 (단순 비교 · 연말 wraparound 미처리 · 단순화)
      const [bm, bd] = mmdd.split("-").map(Number);
      const [tm, td] = todayMmdd.split("-").map(Number);
      if (!bm || !tm) return false;
      // same month + day >= today
      if (bm === tm && bd >= td && bd - td <= 7) return true;
      if (bm === (tm % 12) + 1 && bd + (30 - td) <= 7) return true;
      return false;
    }).length
  ), [activeEmps, today]);
  const avgTenureMonths = useMemo(() => {
    if (activeEmps.length === 0) return 0;
    const total = activeEmps.reduce((s, e) => s + monthsBetween(e.hireDate ?? "", today), 0);
    return Math.round(total / activeEmps.length);
  }, [activeEmps, today]);

  // 직군별 요약
  const groupedByPosition = useMemo(() => {
    const map = new Map<string, EmployeeExt[]>();
    for (const e of activeEmps) {
      const key = e.position || "기타";
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = POSITION_ORDER.indexOf(a);
      const ib = POSITION_ORDER.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [activeEmps]);

  // 필터링된 리스트
  const filteredEmps = useMemo(() => {
    if (!filterPosition) return activeEmps;
    return activeEmps.filter(e => (e.position || "기타") === filterPosition);
  }, [activeEmps, filterPosition]);

  if (loading && employees.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Spinner label="직원 대시보드 로딩 중..." size={16} tone="brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4 pb-4 relative">
      {/* 2026-10-12 · 사용자 지시 "그냥 깔끔한 텍스트로" · KPI 4-tile 제거 · inline 텍스트 요약 (Dashboard 톤 통일) */}
      <section className={`${CARD} px-4 py-3`}>
        <div className="flex items-baseline gap-x-6 gap-y-1.5 flex-wrap text-[14px]">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-500 font-medium">전체 재직</span>
            <span className="font-bold text-ink tabular-nums">{activeEmps.length}</span>
            <span className="text-slate-500">명</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-500 font-medium">신규 입사 (이번달)</span>
            <span className="font-bold text-ink tabular-nums">{newThisMonth}</span>
            <span className="text-slate-500">명</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-500 font-medium">계약 만료 임박 (30일)</span>
            <span className={`font-bold tabular-nums ${expiringCount > 0 ? "text-amber-600" : "text-ink"}`}>{expiringCount}</span>
            <span className="text-slate-500">명</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-slate-500 font-medium">평균 근속</span>
            <span className="font-bold text-ink tabular-nums">{Math.floor(avgTenureMonths / 12)}</span>
            <span className="text-slate-500">년</span>
          </span>
          {birthdayCount > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-slate-500 font-medium">생일 임박 (7일)</span>
                <span className="font-bold text-rose-600 tabular-nums">{birthdayCount}</span>
                <span className="text-slate-500">명</span>
              </span>
            </>
          )}
        </div>
      </section>

      {/* ── 직군 필터 (chip row) ──────────────────────────────────── */}
      <section className={`${CARD} p-3 md:p-3.5`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">직군별</h3>
          <span className="text-[13px] text-slate-500">
            {filterPosition ? `${filterPosition} ${filteredEmps.length}명` : `전체 ${activeEmps.length}명`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterPosition(null)}
            className={`text-[13px] px-2.5 py-[2px] rounded-full font-medium border inline-flex items-center gap-1 ${
              filterPosition === null ? "bg-ink text-white border-ink" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
          >
            전체 <strong className="tabular-nums">{activeEmps.length}</strong>
          </button>
          {groupedByPosition.map(([pos, list]) => (
            <button
              key={pos}
              type="button"
              onClick={() => setFilterPosition(pos === filterPosition ? null : pos)}
              className={`text-[13px] px-2.5 py-[2px] rounded-full font-medium border inline-flex items-center gap-1 ${
                pos === filterPosition
                  ? "bg-ink text-white border-ink"
                  : (POSITION_TONE[pos] ?? "bg-slate-50 text-slate-700 border-slate-200") + " hover:brightness-95"
              }`}
            >
              {pos} <strong className="tabular-nums">{list.length}</strong>
            </button>
          ))}
          {birthdayCount > 0 && (
            <span className="ml-auto text-[13px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-[2px] rounded-full font-medium">
              생일 임박 {birthdayCount}명
            </span>
          )}
        </div>
      </section>

      {/* 2026-10-12 · 사용자 지시 "직원관리 페이지도 경영현황 직원리스트처럼" · 테이블 통일 톤
          · 7-column (이름/직군/계약유형/계약시작일/입사일/이력서/근로계약서) · 스크롤 처리
          · thead sticky · 선택 row 는 violet accent 유지 */}
      <section className={`${CARD} p-3 md:p-4 flex flex-col`}>
        <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-[3px] h-[12px] bg-violet-500 rounded-full" aria-hidden />
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">직원 리스트</h3>
            <span className="text-[13px] text-slate-500 tabular-nums">
              {filterPosition
                ? `· ${filterPosition} ${filteredEmps.length}명`
                : `· 총 ${filteredEmps.length}명`}
            </span>
          </div>
          <span className="text-[13px] text-slate-400">클릭 → 상세 slide drawer</span>
        </header>
        {/* 공용 StaffListTable · 공통 컴포넌트 */}
        <StaffListTable
          employees={filteredEmps as StaffListEmployeeExt[]}
          onRowClick={(id) => setSelectedId(id)}
          selectedId={selectedId}
          maxHeight="max-h-[520px]"
          showColumns={["name", "position", "contract_type", "contract_start", "hire_date", "tenure", "birth"]}
        />
      </section>

      {/* ── 공용 EmployeeDrawer · EmployeeInfoPanel slide drawer ── */}
      <EmployeeDrawer
        employeeId={selectedId}
        employees={employees}
        onClose={() => setSelectedId(null)}
        onSaved={(updated) => {
          setEmployees(prev => prev.map(e => (e.id === updated.id ? { ...e, ...updated } as EmployeeExt : e)));
        }}
        onOpenManagement={(id) => {
          setSelectedId(null);
          onOpenFullStaffManage(id);
        }}
      />
    </div>
  );
};


export default StaffDashboard;
