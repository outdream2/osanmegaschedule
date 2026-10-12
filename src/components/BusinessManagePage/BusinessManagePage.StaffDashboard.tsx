// 2026-10-11 · #14-P3 · 직원관리 대시보드 (사용자 지시 · 대시보드 + 슬라이딩 drawer)
//   · 상단 · 직원 KPI (총재직 · 직군별 · 신규 입사 · 계약 만료 임박 · 생일 임박)
//   · 아래 · 직원 compact 카드 grid (좌)
//   · 클릭 시 · 오른쪽 slide-in drawer · 기본 정보 + "상세 편집 열기" 버튼
//   · 홈 랜딩 톤 · CARD + 2-tier typography · 폰트 2026-10-10 대원칙
//
//   참고 · StaffManagePage 는 유지 (딥링크/다른 라우팅 호환) · 이 대시보드는 inner tab 전용

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X as XIcon } from "@phosphor-icons/react";
import { listEmployees } from "../../lib/employeeApi";
import type { Employee } from "../../types";
import { Spinner } from "../common/Spinner";

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
const POSITION_TONE: Record<string, string> = {
  "약사":   "bg-sky-50 text-sky-700 border-sky-200",
  "매장":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "창고":   "bg-amber-50 text-amber-700 border-amber-200",
  "캐셔":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "진열":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "물류":   "bg-amber-50 text-amber-700 border-amber-200",
  "알바":   "bg-slate-50 text-slate-700 border-slate-200",
  "기타":   "bg-slate-50 text-slate-700 border-slate-200",
};

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

  const selectedEmp = useMemo(
    () => selectedId != null ? activeEmps.find(e => e.id === selectedId) ?? null : null,
    [selectedId, activeEmps],
  );

  if (loading && employees.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Spinner label="직원 대시보드 로딩 중..." size={16} tone="brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4 pb-4 relative">
      {/* ── 상단 KPI 4-strip ──────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="전체 재직"           value={activeEmps.length}       unit="명" />
        <KpiTile label="신규 입사 (이번달)"   value={newThisMonth}             unit="명" />
        <KpiTile label="계약 만료 임박 (30일)" value={expiringCount}            unit="명" highlight={expiringCount > 0} tone="amber" />
        <KpiTile label="평균 근속"           value={Math.floor(avgTenureMonths / 12)} unit="년" />
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

      {/* ── 직원 리스트 (compact card grid) ───────────────────────── */}
      <section className={`${CARD} p-3 md:p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">직원 리스트</h3>
          <span className="text-[13px] text-slate-500">클릭 → 상세 slide drawer</span>
        </div>
        {filteredEmps.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-[14px] text-slate-400">직원 없음</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filteredEmps.map(e => {
              const isActive = selectedId === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-[10px] border transition-colors ${
                      isActive
                        ? "border-violet-300 bg-violet-50/50"
                        : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[15px] md:text-[16px] font-semibold text-ink truncate">{e.name}</span>
                      <span className={`text-[12px] px-1.5 py-[1px] rounded border font-medium ${POSITION_TONE[e.position || "기타"] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                        {e.position || "기타"}
                      </span>
                    </div>
                    <div className="text-[13px] text-slate-500 tabular-nums flex items-center gap-2">
                      <span>입사 {e.hireDate?.slice(0, 7) ?? "—"}</span>
                      <span className="text-slate-300">·</span>
                      <span>근속 {Math.floor(monthsBetween(e.hireDate ?? "", today) / 12)}년</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Slide-in drawer (right) · 선택 직원 기본 정보 ────────── */}
      {selectedEmp && (
        <StaffQuickDrawer
          emp={selectedEmp}
          onClose={() => setSelectedId(null)}
          onOpenFullStaffManage={() => onOpenFullStaffManage(selectedEmp.id)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Slide drawer · 선택 직원 요약 + "상세 편집 열기" 버튼
// ─────────────────────────────────────────────────────────────

interface StaffQuickDrawerProps {
  emp: EmployeeExt;
  onClose: () => void;
  onOpenFullStaffManage: () => void;
}

const StaffQuickDrawer: React.FC<StaffQuickDrawerProps> = ({ emp, onClose, onOpenFullStaffManage }) => {
  // ESC 닫기
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const today = todayYmd();
  const tenureMonths = monthsBetween(emp.hireDate ?? "", today);
  const tenureLabel = `${Math.floor(tenureMonths / 12)}년 ${tenureMonths % 12}개월`;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 z-40"
        onClick={onClose}
        aria-hidden
      />
      {/* drawer panel */}
      <aside
        role="dialog"
        aria-label={`${emp.name} 상세`}
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-[3px] h-[14px] bg-violet-500 rounded-full shrink-0" />
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-[16px] md:text-[17px] font-semibold text-ink truncate">{emp.name}</h2>
              <span className={`text-[12px] px-1.5 py-[1px] rounded border font-medium shrink-0 ${POSITION_TONE[emp.position || "기타"] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                {emp.position || "기타"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="닫기"
          >
            <XIcon size={16} weight="bold" />
          </button>
        </header>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <InfoBlock label="기본">
            <InfoRow k="입사일" v={emp.hireDate ?? "—"} />
            <InfoRow k="근속" v={tenureLabel} />
            <InfoRow k="고용형태" v={emp.employmentType ?? "—"} />
            <InfoRow k="직급" v={emp.rank ?? "—"} />
          </InfoBlock>

          <InfoBlock label="연락처">
            <InfoRow k="전화번호" v={emp.phone ?? "—"} />
            <InfoRow k="이메일" v={emp.email ?? "—"} />
            <InfoRow k="주소" v={emp.address ?? "—"} />
          </InfoBlock>

          <InfoBlock label="계약">
            <InfoRow k="계약 시작" v={emp.contract_start ?? "—"} />
            <InfoRow k="계약 종료" v={emp.contract_end ?? "—"} />
            <InfoRow k="계약 유형" v={emp.contract_type ?? "—"} />
          </InfoBlock>

          <InfoBlock label="연차">
            <InfoRow k="부여" v={emp.annual_leave_days != null ? `${emp.annual_leave_days}일` : "—"} />
          </InfoBlock>

          <InfoBlock label="메모">
            <p className="text-[14px] md:text-[15px] text-slate-700 whitespace-pre-wrap">{emp.description || "—"}</p>
          </InfoBlock>
        </div>

        {/* footer · 상세 편집 열기 */}
        <footer className="border-t border-slate-200 p-3 shrink-0">
          <button
            type="button"
            onClick={onOpenFullStaffManage}
            className="w-full h-10 rounded-md bg-violet-600 text-white text-[14px] md:text-[15px] font-semibold hover:bg-violet-700 transition-colors"
          >
            상세 편집 열기 (전체 직원관리)
          </button>
        </footer>
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// Internal primitives
// ─────────────────────────────────────────────────────────────

const InfoBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section>
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-[3px] h-[10px] bg-slate-300 rounded-full" />
      <span className="text-[13px] text-slate-500 font-medium">{label}</span>
    </div>
    <div className={`${CARD} p-3 space-y-1.5`}>{children}</div>
  </section>
);

const InfoRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-start justify-between gap-3 text-[14px] md:text-[15px]">
    <span className="text-slate-500 shrink-0">{k}</span>
    <span className="text-ink text-right min-w-0 truncate tabular-nums">{v}</span>
  </div>
);

interface KpiTileProps {
  label: string;
  value: number | string;
  unit?: string;
  tone?: "violet" | "amber" | "emerald" | "indigo";
  highlight?: boolean;
}

const TONE_TEXT: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  violet:  "text-violet-700",
  emerald: "text-emerald-700",
  amber:   "text-amber-700",
  indigo:  "text-indigo-700",
};

const KpiTile: React.FC<KpiTileProps> = ({ label, value, unit, tone, highlight }) => (
  <div className={`${CARD} px-3.5 py-3 flex flex-col gap-1`}>
    <span className="text-[13px] md:text-[14px] text-slate-500 font-medium">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={`text-[18px] md:text-[20px] font-semibold tabular-nums tracking-tight ${highlight && tone ? TONE_TEXT[tone] : "text-ink"}`}>
        {value}
      </span>
      {unit && (
        <span className="text-[13px] md:text-[14px] text-slate-500 font-medium">
          {unit}
        </span>
      )}
    </div>
  </div>
);

export default StaffDashboard;
