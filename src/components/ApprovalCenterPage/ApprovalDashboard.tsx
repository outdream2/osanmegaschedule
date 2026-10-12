// src/components/ApprovalCenterPage/ApprovalDashboard.tsx
// 2026-10-08 · 사용자 지시 · 승인 센터 통합 대시보드
//   · 톤 참고 = HomeDashboard (max-w-[1240px] · slim CARD · 3px color rail · divide-y rows)
//   · 3 섹션: 연차 승인 (sky) · 거래처 승인 (violet) · 사직서 승인 (rose)
//   · 각 섹션 pending top-5 미리보기 + "전체보기 →"
//   · 데이터: 기존 API 재사용 (listLeaveRequests · listResignations · /api/vendors)
//   · UI only wrapper · 승인/거절 로직은 상세 뷰에서 수행

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDots, Buildings, SignOut } from "@phosphor-icons/react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { api } from "../../lib/apiClient";
import { listLeaveRequests, type LeaveRequestRow } from "../../lib/leaveApi";
import { listResignations, type ResignationRow } from "../../lib/resignationsApi";

// ─── Styling tokens (HomeDashboard 톤 그대로) ────────────────────────
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

interface VendorPendingRow {
  id: number;
  company_name: string;
  manager_name?: string | null;
  approval_requested_at?: string | null;
}

export type ApprovalDetailView = "leave" | "resignation" | "vendor";

interface ApprovalDashboardProps {
  onOpenDetail: (view: ApprovalDetailView) => void;
  onCountsChange?: (counts: { leave: number; resignation: number; vendor: number }) => void;
}

// 날짜 포맷터
function fmtMD(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtDateRange(start: string, end: string): string {
  if (!start) return "-";
  if (start === end) return fmtMD(start);
  return `${fmtMD(start)} ~ ${fmtMD(end)}`;
}

export const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ onOpenDetail, onCountsChange }) => {
  const [leave, setLeave] = useState<LeaveRequestRow[]>([]);
  const [resign, setResign] = useState<ResignationRow[]>([]);
  const [vendor, setVendor] = useState<VendorPendingRow[]>([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [loadingResign, setLoadingResign] = useState(true);
  const [loadingVendor, setLoadingVendor] = useState(true);

  const loadAll = useCallback(async () => {
    setLoadingLeave(true);
    setLoadingResign(true);
    setLoadingVendor(true);
    const [leaveRows, resignRows, vendorRaw] = await Promise.all([
      listLeaveRequests({ all: true }).catch(() => [] as LeaveRequestRow[]),
      listResignations().catch(() => [] as ResignationRow[]),
      api.get<any[]>("/api/vendors").then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    ]);
    const leavePending = leaveRows.filter(r => r.status === "pending")
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const resignPending = resignRows.filter(r => r.status === "pending")
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const vendorPending: VendorPendingRow[] = vendorRaw
      .filter((v: any) => v?.approval_status === "requested" || v?.approval_status === "pending")
      .sort((a: any, b: any) => String(b?.approval_requested_at ?? "").localeCompare(String(a?.approval_requested_at ?? "")))
      .map((v: any) => ({
        id: Number(v.id),
        company_name: String(v.company_name ?? ""),
        manager_name: v.manager_name ?? null,
        approval_requested_at: v.approval_requested_at ?? null,
      }));

    setLeave(leavePending);
    setResign(resignPending);
    setVendor(vendorPending);
    setLoadingLeave(false);
    setLoadingResign(false);
    setLoadingVendor(false);
    onCountsChange?.({ leave: leavePending.length, resignation: resignPending.length, vendor: vendorPending.length });
  }, [onCountsChange]);

  useEffect(() => {
    void loadAll();
    const iv = setInterval(() => { void loadAll(); }, 60_000);
    const handler = () => { void loadAll(); };
    window.addEventListener("approval-count-updated", handler);
    return () => {
      clearInterval(iv);
      window.removeEventListener("approval-count-updated", handler);
    };
  }, [loadAll]);

  const totalPending = leave.length + resign.length + vendor.length;
  const allLoading = loadingLeave && loadingResign && loadingVendor;

  // 섹션별 preview rows (top-5)
  const leavePreview = useMemo(() => leave.slice(0, 5), [leave]);
  const resignPreview = useMemo(() => resign.slice(0, 5), [resign]);
  const vendorPreview = useMemo(() => vendor.slice(0, 5), [vendor]);

  return (
    <div className="w-full max-w-[1240px] mx-auto flex flex-col gap-3 md:gap-4 px-3 md:px-4 py-3 md:py-4">
      {/* ── Hero greeting · amber rail · HomeDashboard 패턴 ── */}
      <section className="flex items-center justify-between gap-2 py-0.5 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[3px] h-[14px] bg-amber-500 rounded-full shrink-0" />
          <span className="text-[14px] md:text-[15px] text-slate-700 truncate">
            {allLoading ? (
              "승인 현황 조회 중..."
            ) : totalPending > 0 ? (
              <>현재 <strong className="font-semibold text-amber-700 tabular-nums">{totalPending}</strong>건의 승인이 대기 중입니다.</>
            ) : (
              "대기 중인 승인이 없습니다."
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { void loadAll(); }}
          disabled={allLoading}
          className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
          title="새로고침"
          aria-label="새로고침"
        >
          <RefreshCw size={14} className={allLoading ? "animate-spin" : ""} />
        </button>
      </section>

      {/* ── 3 섹션 카드 grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-4">
        <ApprovalCard
          tone="sky"
          icon={<CalendarDots size={14} weight="fill" />}
          title="연차 승인"
          count={leave.length}
          loading={loadingLeave}
          onOpenAll={() => onOpenDetail("leave")}
          items={leavePreview.map(r => ({
            key: r.id,
            primary: r.employee_name,
            secondary: `${r.leave_type} · ${fmtDateRange(r.start_date, r.end_date)}`,
            onClick: () => onOpenDetail("leave"),
          }))}
          emptyLabel="처리할 연차 신청이 없습니다"
        />

        <ApprovalCard
          tone="violet"
          icon={<Buildings size={14} weight="fill" />}
          title="거래처 승인"
          count={vendor.length}
          loading={loadingVendor}
          onOpenAll={() => onOpenDetail("vendor")}
          items={vendorPreview.map(v => ({
            key: v.id,
            primary: v.company_name,
            secondary: `${v.manager_name ?? "담당자 미지정"} · 요청 ${fmtMD(v.approval_requested_at)}`,
            onClick: () => onOpenDetail("vendor"),
          }))}
          emptyLabel="처리할 거래처 승인이 없습니다"
        />

        <ApprovalCard
          tone="rose"
          icon={<SignOut size={14} weight="fill" />}
          title="사직서 승인"
          count={resign.length}
          loading={loadingResign}
          onOpenAll={() => onOpenDetail("resignation")}
          items={resignPreview.map(r => ({
            key: r.id,
            primary: r.employee_name,
            secondary: `퇴사일 ${fmtMD(r.last_work_date)} · ${r.reason}`,
            onClick: () => onOpenDetail("resignation"),
          }))}
          emptyLabel="처리할 사직서가 없습니다"
        />
      </section>
    </div>
  );
};

// ─── ApprovalCard · HomeDashboard TodayTasksCard 패턴 ──────────────────
interface ApprovalCardItem {
  key: string | number;
  primary: string;
  secondary: string;
  onClick: () => void;
}
interface ApprovalCardProps {
  tone: "sky" | "violet" | "rose";
  icon: React.ReactNode;
  title: string;
  count: number;
  loading: boolean;
  items: ApprovalCardItem[];
  emptyLabel: string;
  onOpenAll: () => void;
}

const TONE: Record<ApprovalCardProps["tone"], { rail: string; badgeBg: string; badgeText: string; iconBg: string; iconText: string; countText: string; linkText: string }> = {
  sky:    { rail: "bg-sky-500",    badgeBg: "bg-sky-50",    badgeText: "text-sky-700",    iconBg: "bg-sky-50",    iconText: "text-sky-600",    countText: "text-sky-700",    linkText: "text-sky-600"    },
  violet: { rail: "bg-violet-500", badgeBg: "bg-violet-50", badgeText: "text-violet-700", iconBg: "bg-violet-50", iconText: "text-violet-600", countText: "text-violet-700", linkText: "text-violet-600" },
  rose:   { rail: "bg-rose-500",   badgeBg: "bg-rose-50",   badgeText: "text-rose-700",   iconBg: "bg-rose-50",   iconText: "text-rose-600",   countText: "text-rose-700",   linkText: "text-rose-600"   },
};

const ApprovalCard: React.FC<ApprovalCardProps> = ({ tone, icon, title, count, loading, items, emptyLabel, onOpenAll }) => {
  const t = TONE[tone];
  const hasItems = items.length > 0;
  return (
    <div className={`${CARD} flex flex-col lg:min-h-[300px]`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-[3px] h-[16px] ${t.rail} rounded-full shrink-0`} />
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] ${t.iconBg} ${t.iconText} shrink-0`}>
            {icon}
          </span>
          <h3 className="text-[15px] md:text-[16px] font-bold text-ink tracking-tight">{title}</h3>
          <span className={`text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${count > 0 ? `${t.badgeBg} ${t.badgeText}` : "bg-slate-100 text-slate-500"}`}>
            {loading ? "..." : count}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenAll}
          className={`text-[13px] md:text-[14px] font-semibold ${t.linkText} hover:underline cursor-pointer flex items-center gap-0.5 shrink-0`}
        >
          전체보기 <ChevronRight size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-slate-400 py-8">
            로드 중...
          </div>
        ) : !hasItems ? (
          <div className="flex-1 flex items-center justify-center text-[14px] text-slate-400 py-8">
            {emptyLabel}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={it.onClick}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50/70 transition-colors cursor-pointer text-left min-h-[48px]"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[14px] md:text-[15px] font-semibold text-ink truncate">{it.primary}</span>
                  <span className="text-[12px] md:text-[13px] text-slate-500 truncate">{it.secondary}</span>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalDashboard;
