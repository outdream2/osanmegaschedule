// 2026-10-11 · #14-P3 · 경영현황 Overview · 매장 overview 공통 UI (OverviewHero + OverviewInnerTabs) 적용
//   · inner tabs 5개 · 현황 / 직원관리 / 업무요청 / 인건비 분석 / 근로계약서 작성
//   · 홈 랜딩 톤 (HomeDashboard.tsx SSOT · CARD + 2-tier typography · 좌측 accent 없음)
//   · 폰트 체계 (2026-10-10 대원칙) · body 15/16 · label 13/14 · tiny 12 하한 · 소수점 금지
//   · KPI inline 깔끔 ("19명" · "3건") · meta/subtitle 최소화

import React, { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { Employee } from "../../types";
import { listEmployees } from "../../lib/employeeApi";
import { getLeavePendingCount, listLeaveRequests, type LeaveRequestRow } from "../../lib/leaveApi";
import { getResignationPendingCount } from "../../lib/resignationsApi";
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { Spinner } from "../common/Spinner";

const StaffManagePage = React.lazy(() => import("../StaffManagePage/StaffManagePage"));
// 2026-10-12 · 사용자 지시 · 상세 drawer 는 리스트 X · 상세정보만 (EmployeeInfoPanel · inline edit)
const EmployeeInfoPanel = React.lazy(() => import("../schedule-v2/views/employee/EmployeeInfoPanel").then(m => ({ default: m.EmployeeInfoPanel })));
const DocumentWriterPage = React.lazy(() => import("../DocumentWriterPage/DocumentWriterPage"));
const RequestsPage = React.lazy(() => import("../RequestsPage/RequestsPage").then(m => ({ default: m.RequestsPage })));
const WageAnalysisTab = React.lazy(() => import("./BusinessManagePage.WageAnalysis"));
// 2026-10-12 · 사용자 지시 · 직원관리 대시보드 (KPI + 리스트 + 우측 slide drawer)
const StaffDashboard = React.lazy(() => import("./BusinessManagePage.StaffDashboard"));
// 2026-10-12 · 사용자 지시 "다 해 · 조치필요→인건비구성 · 직원요약 3단 · 슬라이딩 창" · BusinessDashboard 교체
const BusinessDashboard = React.lazy(() => import("./BusinessManagePage.Dashboard"));
// 2026-10-12 · 사용자 지시 · 현금흐름 구성 차트 (매출 대비 인건비·매입·발주·임대료·수수료·공과금 % · settings JSON)
const BusinessCashFlow = React.lazy(() => import("./BusinessManagePage.CashFlow"));

type InnerTabKey = "overview" | "staff-manage" | "requests" | "wage-analysis" | "contract";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

type EmployeeExt = Employee & {
  contract_type?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
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

interface BusinessOverviewProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  initialEmployeeId?: number | null;
  initialFromPage?: AppNavPage | null;
  /** 외부에서 inner tab 변경 요청 · activeNav subTab 과 연동 (business-manage:tabKey) */
  activeInnerTab?: InnerTabKey;
  onInnerTabChange?: (k: InnerTabKey) => void;
}

export const BusinessOverview: React.FC<BusinessOverviewProps> = ({
  authSession, onBack, onNavigate, onLogout, initialEmployeeId, initialFromPage,
  activeInnerTab, onInnerTabChange,
}) => {
  const [innerTab, _setInnerTab] = useState<InnerTabKey>(activeInnerTab ?? "overview");
  useEffect(() => {
    if (activeInnerTab && activeInnerTab !== innerTab) _setInnerTab(activeInnerTab);
  }, [activeInnerTab]);
  const setInnerTab = useCallback((k: InnerTabKey) => {
    _setInnerTab(k);
    onInnerTabChange?.(k);
  }, [onInnerTabChange]);

  // 2026-10-12 · 직원관리 모드 toggle · default="dashboard" · "edit" 는 StaffManagePage 전체 render (상세 편집 열기 버튼)
  const [staffMode, setStaffMode] = useState<"dashboard" | "edit">("dashboard");
  const [staffSelectedId, setStaffSelectedId] = useState<number | null>(initialEmployeeId ?? null);
  // 2026-10-12 · 사용자 지시 "슬라이딩 윈도우로 편집" · drawer state (Overview 레벨 · 어느 inner tab 에서든 open)
  const [drawerEmpId, setDrawerEmpId] = useState<number | null>(null);
  // initialEmployeeId 가 넘어온 경우 (스케줄 → 직원 수정) · edit 모드 로 바로 진입
  useEffect(() => {
    if (initialEmployeeId != null) {
      setStaffSelectedId(initialEmployeeId);
      setStaffMode("edit");
    }
  }, [initialEmployeeId]);

  // ── 공통 data (overview KPI · badge count 공유) ──
  const [employees, setEmployees] = useState<EmployeeExt[]>([]);
  const [leavePending, setLeavePending] = useState<number>(0);
  const [resignPending, setResignPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  // 2026-10-12 · 사용자 지시 · 경영현황 현황판에 업무요청 리스트 추가 · pending 연차 상위 노출
  const [leaveRows, setLeaveRows] = useState<LeaveRequestRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, leaveCnt, resignCnt, leaveList] = await Promise.all([
        listEmployees().catch(() => [] as Employee[]),
        getLeavePendingCount().catch(() => 0),
        getResignationPendingCount().catch(() => 0),
        listLeaveRequests({ all: true }).catch(() => [] as LeaveRequestRow[]),
      ]);
      setEmployees(emps as EmployeeExt[]);
      setLeavePending(leaveCnt);
      setResignPending(resignCnt);
      setLeaveRows(leaveList.filter(r => r.status === "pending"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const activeEmps = useMemo(() => employees.filter(e => !e.retireDate), [employees]);
  const curYm = currentYm();
  const today = todayYmd();

  const newThisMonth = useMemo(
    () => activeEmps.filter(e => (e.hireDate ?? "").startsWith(curYm)),
    [activeEmps, curYm],
  );
  const expiringContracts = useMemo(() => {
    return activeEmps
      .filter(e => !!e.contract_end)
      .map(e => ({ emp: e, days: daysBetween(e.contract_end as string, today) }))
      .filter(x => x.days >= 0 && x.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [activeEmps, today]);
  const pendingTotal = leavePending + resignPending;

  // 2026-10-11 · 사용자 지시 · OverviewInnerTabs 5개 + count badge (매장 overview 패턴)
  const tabs: ReadonlyArray<OverviewInnerTab<InnerTabKey>> = [
    { k: "overview",     label: "현황",         tone: "violet",  count: pendingTotal + expiringContracts.length || null },
    { k: "staff-manage", label: "직원관리",     tone: "emerald", count: activeEmps.length || null },
    { k: "requests",     label: "업무요청",     tone: "indigo",  count: pendingTotal || null },
    { k: "wage-analysis", label: "인건비 분석", tone: "amber",   count: null },
    { k: "contract",     label: "근로계약서 작성", tone: "rose", count: expiringContracts.length || null },
  ];

  // 서브페이지 공통 props (embedded=true)
  const subPageProps = { onBack, authSession, onNavigate, onLogout, embedded: true } as const;

  return (
    <div className="flex flex-col">
      {/* ── Hero + Inner tabs (매장 overview 공통 UI) ──────────────── */}
      <OverviewHero
        tone="violet"
        title="경영현황"
        description="직원 · 요청 · 인건비 · 계약 통합 뷰"
      />
      <OverviewInnerTabs<InnerTabKey>
        ariaLabel="경영현황 inner tabs"
        active={innerTab}
        onChange={setInnerTab}
        tabs={tabs}
      />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-3 flex flex-col">
        {innerTab === "overview" && (
          /* 2026-10-12 · 사용자 지시 "다 해" · BusinessDashboard 교체 (조치필요→인건비구성 · 직원요약 3단 · 슬라이딩 창)
              · onOpenTab 매핑: Dashboard 키 → Overview InnerTabKey (document-writer/hr-forms → contract) */
          <Suspense fallback={<FallbackSpinner label="대시보드 로딩 중..." />}>
            <BusinessDashboard
              onOpenTab={(k) => {
                const map: Record<string, InnerTabKey> = {
                  "staff-manage": "staff-manage",
                  "requests": "requests",
                  "wage-analysis": "wage-analysis",
                  "document-writer": "contract",
                  "hr-forms": "contract",
                };
                setInnerTab(map[k] ?? "overview");
              }}
              onOpenEmployeeId={(id) => setDrawerEmpId(id)}
            />
          </Suspense>
        )}

        {innerTab === "staff-manage" && (
          <div className="-mx-4 sm:-mx-6">
            {staffMode === "dashboard" ? (
              <div className="px-4 sm:px-6">
                <Suspense fallback={<FallbackSpinner label="직원 대시보드 로딩 중..." />}>
                  <StaffDashboard
                    onOpenFullStaffManage={(id) => {
                      setStaffSelectedId(id);
                      setStaffMode("edit");
                    }}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="flex flex-col">
                {/* 2026-10-12 · 상세 편집 모드 · 뒤로가기 바 */}
                <div className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setStaffMode("dashboard")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[14px] font-medium text-slate-600 hover:text-ink hover:bg-slate-100 transition-colors"
                  >
                    ← 대시보드
                  </button>
                  <span className="text-slate-300">·</span>
                  <span className="text-[14px] md:text-[15px] font-semibold text-ink">상세 편집</span>
                </div>
                <Suspense fallback={<FallbackSpinner label="직원관리 로딩 중..." />}>
                  <StaffManagePage
                    initialSelectedId={staffSelectedId ?? null}
                    onBackToSchedule={initialFromPage === "schedule" && onNavigate ? () => onNavigate("schedule") : undefined}
                    onWriteContract={() => setInnerTab("contract")}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {innerTab === "requests" && (
          <div className="-mx-4 sm:-mx-6">
            <Suspense fallback={<FallbackSpinner label="업무요청 로딩 중..." />}>
              <RequestsPage {...subPageProps} />
            </Suspense>
          </div>
        )}

        {innerTab === "wage-analysis" && (
          <div className="-mx-4 sm:-mx-6">
            <Suspense fallback={<FallbackSpinner label="인건비 분석 로딩 중..." />}>
              <WageAnalysisTab />
            </Suspense>
          </div>
        )}

        {innerTab === "contract" && (
          <div className="-mx-4 sm:-mx-6">
            <Suspense fallback={<FallbackSpinner label="근로계약서 로딩 중..." />}>
              <DocumentWriterPage {...subPageProps} allowedTabs={["contract", "settings"]} />
            </Suspense>
          </div>
        )}
      </div>

      {/* 2026-10-12 · 사용자 지시 "직원상세편집이 아직도 리스트로 · 상세정보만"
          · drawer · 리스트 포함 StaffManagePage → EmployeeInfoPanel (상세 전용 · flat sections + inline edit)
          · 폭 축소 (560px · schedule-v2 drawer 와 동일) · 상세 집중 */}
      {drawerEmpId != null && (() => {
        const drawerEmp = employees.find(e => e.id === drawerEmpId);
        return (
          <div
            className="fixed inset-0 z-50 bg-black/30 flex justify-end animate-in fade-in duration-150"
            onClick={() => setDrawerEmpId(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full sm:w-[560px] bg-white h-full shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: "slideInRight 180ms ease-out" }}
            >
              <button
                type="button"
                onClick={() => setDrawerEmpId(null)}
                className="absolute top-3 right-3 z-20 w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 cursor-pointer text-slate-500 text-[16px]"
                aria-label="닫기"
                title="닫기 (Esc)"
              >
                ✕
              </button>
              {drawerEmp ? (
                <Suspense fallback={<FallbackSpinner label="직원 상세 로딩 중..." />}>
                  <EmployeeInfoPanel
                    employee={drawerEmp}
                    onSaved={(updated) => setEmployees(prev => prev.map(e => (e.id === updated.id ? { ...e, ...updated } as EmployeeExt : e)))}
                  />
                </Suspense>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <FallbackSpinner label="직원 정보 로딩 중..." />
                </div>
              )}
            </div>
            <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          </div>
        );
      })()}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Overview content · 현황 탭 전용 (KPI + 조치 필요 + 직원 요약)
// 홈 랜딩 톤 (HomeDashboard SSOT) · CARD + 2-tier typography
// 2026-10-11 · 사용자 지시 · KPI inline ("19명" · 깔끔) · meta 삭제 · 폰트 리밸런싱
// ─────────────────────────────────────────────────────────────

interface OverviewContentProps {
  loading: boolean;
  activeEmps: EmployeeExt[];
  newThisMonth: number;
  expiringContracts: Array<{ emp: EmployeeExt; days: number }>;
  pendingTotal: number;
  leavePending: number;
  resignPending: number;
  // 2026-10-12 · 사용자 지시 · 업무요청 리스트 (pending)
  leaveRows: LeaveRequestRow[];
  onOpenTab: (k: InnerTabKey) => void;
}

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

const OverviewContent: React.FC<OverviewContentProps> = ({
  loading, activeEmps, newThisMonth, expiringContracts, pendingTotal, leavePending, resignPending, leaveRows, onOpenTab,
}) => {
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

  if (loading) {
    return <FallbackSpinner label="경영현황 로딩 중..." />;
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4 pb-4">
      {/* KPI 4-strip · inline 깔끔 ("19명") · 2026-10-11 사용자 지시 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="전체 재직"           value={activeEmps.length} unit="명" tone="violet"  onClick={() => onOpenTab("staff-manage")} />
        <KpiTile label="신규 입사 (이번달)"   value={newThisMonth}       unit="명" tone="emerald" onClick={() => onOpenTab("staff-manage")} />
        <KpiTile label="계약 만료 임박 (30일)" value={expiringContracts.length} unit="명" tone="amber" onClick={() => onOpenTab("contract")} />
        <KpiTile label="미승인 요청"         value={pendingTotal}        unit="건" tone="indigo"  highlight={pendingTotal > 0} onClick={() => onOpenTab("requests")} />
      </section>

      {/* 2단: 조치 필요 + 직원 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
        <section className={`${CARD} md:col-span-2 p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">조치 필요</h3>
            <span className="text-[13px] text-slate-500 font-medium">우선 처리</span>
          </header>
          <ActionRow
            title="재계약 대상"
            count={expiringContracts.length}
            unit="명"
            meta={expiringContracts.length === 0 ? "30일 이내 만료 없음" : expiringContracts.slice(0, 3).map(x => `${x.emp.name} (D-${x.days})`).join(" · ")}
            onClick={() => onOpenTab("contract")}
            tone={expiringContracts.length > 0 ? "amber" : "slate"}
          />
          <ActionRow
            title="미승인 요청"
            count={pendingTotal}
            unit="건"
            meta={pendingTotal === 0 ? "대기 중인 요청 없음" : `휴가 ${leavePending}건 · 사직서 ${resignPending}건`}
            onClick={() => onOpenTab("requests")}
            tone={pendingTotal > 0 ? "indigo" : "slate"}
          />
          <ActionRow
            title="인건비 확인"
            count={null}
            meta="계약서 기반 월 예상 산출"
            onClick={() => onOpenTab("wage-analysis")}
            tone="slate"
          />
        </section>

        <section className={`${CARD} md:col-span-3 p-4 flex flex-col`}>
          <header className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">직원 요약</h3>
            <button
              type="button"
              onClick={() => onOpenTab("staff-manage")}
              className="text-[13px] text-slate-500 hover:text-ink font-medium"
            >
              전체 보기
            </button>
          </header>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {groupedByPosition.map(([pos, list]) => (
              <span
                key={pos}
                className={`text-[13px] px-2 py-[2px] rounded-full font-medium border inline-flex items-center gap-1 ${POSITION_TONE[pos] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
              >
                {pos} <strong className="tabular-nums">{list.length}</strong>
              </span>
            ))}
          </div>

          <ul className="divide-y divide-slate-100">
            {activeEmps.slice(0, 6).map(e => (
              <li
                key={e.id}
                className="py-2 flex items-center justify-between hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer"
                onClick={() => onOpenTab("staff-manage")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[15px] md:text-[16px] text-ink font-medium truncate">{e.name}</span>
                  <span className="text-[13px] text-slate-500 shrink-0">{e.position}</span>
                </div>
                <span className="text-[13px] text-slate-500 shrink-0 tabular-nums">
                  {e.hireDate ? `입사 ${e.hireDate.slice(0, 7)}` : "—"}
                </span>
              </li>
            ))}
            {activeEmps.length > 6 && (
              <li className="pt-3 text-[13px] text-slate-500 text-center">
                외 {activeEmps.length - 6}명
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* 2026-10-12 · 사용자 지시 · 경영현황 현황판에 업무요청 리스트 추가 · pending 연차 상위 */}
      <section className={`${CARD} p-4 flex flex-col`}>
        <header className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">업무요청 대기</h3>
          <button
            type="button"
            onClick={() => onOpenTab("requests")}
            className="text-[13px] text-slate-500 hover:text-ink font-medium inline-flex items-center gap-1"
            title="업무요청 전체 보기"
          >
            전체 보기 ({pendingTotal})
          </button>
        </header>
        {leaveRows.length === 0 ? (
          <div className="py-6 text-center text-[14px] text-slate-500">대기 중인 요청이 없습니다</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {leaveRows.slice(0, 6).map(r => (
              <li key={r.id}
                  onClick={() => onOpenTab("requests")}
                  className="py-2 flex items-center gap-3 hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer">
                <span className="w-14 text-[12px] text-slate-500 shrink-0 tabular-nums">{String(r.created_at ?? "").slice(5, 10)}</span>
                <span className="text-[14px] md:text-[15px] text-ink font-medium shrink-0">{r.employee_name}</span>
                <span className="text-[12px] px-1.5 py-[1px] rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 font-medium shrink-0">{r.leave_type ?? "휴가"}</span>
                <span className="text-[13px] text-slate-500 tabular-nums shrink-0">
                  {String(r.start_date ?? "").slice(5, 10)}
                  {r.end_date && r.end_date !== r.start_date && (
                    <> ~ {String(r.end_date).slice(5, 10)}</>
                  )}
                </span>
                <span className="flex-1 text-[13px] text-slate-500 truncate" title={r.reason ?? ""}>{r.reason ?? ""}</span>
              </li>
            ))}
            {leaveRows.length > 6 && (
              <li className="pt-3 text-[13px] text-slate-500 text-center">
                외 {leaveRows.length - 6}건 · <button type="button" onClick={() => onOpenTab("requests")} className="text-indigo-600 hover:underline">전체 보기</button>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// KpiTile · 홈 랜딩 톤 · inline "19명" · 2-tier · 소수점 금지
// ─────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: number | string;
  unit?: string;
  tone: "violet" | "emerald" | "amber" | "indigo" | "slate" | "rose";
  highlight?: boolean;
  onClick?: () => void;
}

const TONE_TEXT: Record<KpiTileProps["tone"], string> = {
  violet:  "text-violet-700",
  emerald: "text-emerald-700",
  amber:   "text-amber-700",
  indigo:  "text-indigo-700",
  rose:    "text-rose-700",
  slate:   "text-slate-700",
};

const KpiTile: React.FC<KpiTileProps> = ({ label, value, unit, tone, highlight, onClick }) => {
  const clickable = typeof onClick === "function";
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (ev) => { if (ev.key === "Enter" || ev.key === " ") onClick?.(); } : undefined}
      className={[
        CARD,
        "px-3.5 py-3 flex flex-col gap-1",
        clickable ? "cursor-pointer hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-shadow" : "",
      ].join(" ")}
    >
      <span className="text-[13px] md:text-[14px] text-slate-500 font-medium">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-[18px] md:text-[20px] font-semibold tabular-nums tracking-tight ${highlight ? TONE_TEXT[tone] : "text-ink"}`}>
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
};

// ─────────────────────────────────────────────────────────────
// ActionRow · 조치 필요 리스트 아이템
// ─────────────────────────────────────────────────────────────

interface ActionRowProps {
  title: string;
  count: number | null;
  unit?: string;
  meta: string;
  onClick: () => void;
  tone: "amber" | "indigo" | "rose" | "slate";
}

const ACTION_TONE_BG: Record<ActionRowProps["tone"], string> = {
  amber:  "bg-amber-50 text-amber-700",
  indigo: "bg-indigo-50 text-indigo-700",
  rose:   "bg-rose-50 text-rose-700",
  slate:  "bg-slate-100 text-slate-500",
};

const ActionRow: React.FC<ActionRowProps> = ({ title, count, unit, meta, onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 py-2.5 border-t first:border-t-0 border-slate-100 hover:bg-slate-50 -mx-2 px-2 rounded text-left"
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[14px] md:text-[15px] text-ink font-medium">{title}</span>
        {count != null && (
          <span className={`text-[13px] px-1.5 py-[1px] rounded tabular-nums font-semibold ${ACTION_TONE_BG[tone]}`}>
            {count}{unit ? unit : ""}
          </span>
        )}
      </div>
      <div className="text-[13px] text-slate-500 mt-0.5">{meta}</div>
    </div>
    <span className="text-[13px] text-slate-400 shrink-0">→</span>
  </button>
);

const FallbackSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex-1 flex items-center justify-center py-16">
    <Spinner label={label} size={16} tone="brand" />
  </div>
);

export default BusinessOverview;
