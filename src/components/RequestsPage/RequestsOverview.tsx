// src/components/RequestsPage/RequestsOverview.tsx
// 2026-10-10 · 사용자 지시 · 홈 랜딩페이지(HomeDashboard) 톤 정확 복제
//   · 섹션 header · 왼쪽 strip (w-[3px] h-[14px] bg-{tone}-500 rounded-full) + 라벨
//   · CARD rounded-[12px] + subtle shadow · gradient 전부 제거
//   · 내부 · 간결 행 · 작은 아이콘 + 라벨 + 숫자 + arrow
//   · 서류작성 · 큰 숫자 X · HomeDashboard 수치 패턴
//   · 데이터 · 기존 endpoint 재사용

import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar, Buildings, FileText, Package, ForkKnife, ArrowRight,
  CheckCircle, Warning, PenNib, ClipboardText,
} from "@phosphor-icons/react";
import { api } from "../../lib/apiClient";
import type { Employee } from "../../types";

interface PendingCounts {
  display?: number;
  lunch?: number;
  leave?: number;
  vendor?: number;
  resignation?: number;
}

// HomeDashboard 공식 CARD (동일 값)
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

interface Props {
  onNavigate: (group: "approval" | "request", tab: string) => void;
  onNavigateToDocument: () => void;
  isManager: boolean;
}

type Tone = "sky" | "indigo" | "emerald" | "rose" | "amber" | "violet";

// HomeDashboard 톤 레지스트리 · bg-{tone}-50 / text-{tone}-700 subtle
const TONE: Record<Tone, { bg: string; text: string; strip: string }> = {
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     strip: "bg-sky-500"     },
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  strip: "bg-indigo-500"  },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", strip: "bg-emerald-500" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    strip: "bg-rose-500"    },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   strip: "bg-amber-500"   },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  strip: "bg-violet-500"  },
};

interface SectionRow {
  key: string;
  label: string;
  Icon: React.ElementType;
  tone: Tone;
  count: number;
  action: () => void;
}

export const RequestsOverview: React.FC<Props> = ({ onNavigate, onNavigateToDocument, isManager }) => {
  const [counts, setCounts] = useState<PendingCounts>({});
  const [leavePending, setLeavePending] = useState<number>(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    const loadCounts = async () => {
      try {
        const { data } = await api.get<PendingCounts>("/api/requests/pending-counts");
        if (alive) setCounts(data ?? {});
      } catch { if (alive) setCounts({}); }
    };
    const loadLeave = async () => {
      try {
        const { data } = await api.get<{ count?: number }>("/api/leave-requests/pending-count");
        if (alive) setLeavePending(Number(data?.count ?? 0));
      } catch { if (alive) setLeavePending(0); }
    };
    const loadEmployees = async () => {
      try {
        const { data } = await api.get<Employee[]>("/api/employees");
        if (alive) setEmployees(Array.isArray(data) ? data : []);
      } catch { if (alive) setEmployees([]); }
    };
    Promise.all([loadCounts(), loadLeave(), loadEmployees()]).finally(() => {
      if (alive) setLoading(false);
    });
    const timer = window.setInterval(() => { void loadCounts(); void loadLeave(); }, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const docStats = useMemo(() => {
    const active = employees.filter(e => !e.retireDate || String(e.retireDate).trim() === "");
    const retired = employees.filter(e => !!e.retireDate && String(e.retireDate).trim() !== "");
    return {
      activeCount: active.length,
      retiredCount: retired.length,
      missingContract: active.filter(e => !e.contract_file_url || String(e.contract_file_url).trim() === "").length,
      missingResignation: retired.filter(e => !e.resignation_file_url || String(e.resignation_file_url).trim() === "").length,
    };
  }, [employees]);

  const approvalRows: SectionRow[] = isManager ? [
    { key: "leave",       label: "휴가승인",   Icon: Calendar,  tone: "indigo",  count: leavePending,            action: () => onNavigate("approval", "leave") },
    { key: "vendor",      label: "거래처승인", Icon: Buildings, tone: "emerald", count: counts.vendor ?? 0,      action: () => onNavigate("approval", "vendor") },
    { key: "resignation", label: "사직서승인", Icon: FileText,  tone: "rose",    count: counts.resignation ?? 0, action: () => onNavigate("approval", "resignation") },
  ] : [];

  const requestRows: SectionRow[] = [
    { key: "display", label: "진열요청 · 실재고차이", Icon: Package, tone: "amber", count: counts.display ?? 0, action: () => onNavigate("request", "display") },
    ...(isManager ? [
      { key: "lunch", label: "점심불참", Icon: ForkKnife, tone: "sky" as const, count: counts.lunch ?? 0, action: () => onNavigate("request", "lunch") },
    ] : []),
  ];

  // 2026-10-12 · 사용자 지시 "휴가승인등 내용은 모두 리스트형태 3단구조" · 직원서류도 리스트 통합
  const docRows: SectionRow[] = [
    { key: "contract",    label: `근로계약서 · 재직 ${docStats.activeCount}명`,    Icon: FileText,       tone: "emerald", count: docStats.missingContract,    action: onNavigateToDocument },
    { key: "resignation", label: `사직서 · 퇴직자 ${docStats.retiredCount}명`,     Icon: ClipboardText,  tone: "rose",    count: docStats.missingResignation, action: onNavigateToDocument },
  ];

  const approvalTotal = approvalRows.reduce((s, r) => s + r.count, 0);
  const requestTotal = requestRows.reduce((s, r) => s + r.count, 0);
  const docTotal = docStats.missingContract + docStats.missingResignation;
  const grandTotal = approvalTotal + requestTotal + docTotal;

  return (
    <div className="flex flex-col gap-2.5 md:gap-4 pb-6">
      {/* ═════════ 상단 요약 · HomeDashboard quick-row 패턴 (왼쪽 strip + 라벨 + inline KPI) ═════════ */}
      <section className={`${CARD} px-3 py-2.5 md:px-4 md:py-3`}>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1.5 shrink-0 md:w-[88px] md:pr-3 md:border-r md:border-slate-200">
{/* 컬러띠 제거 */}
            <span className="text-[16px] md:text-[17px] font-semibold text-violet-700 tracking-tight">업무요청</span>
          </div>
          <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15px] text-slate-500 font-medium">총 대기</span>
              <span className="text-[17px] md:text-[18px] font-extrabold text-ink tabular-nums leading-none">{grandTotal}</span>
              <span className="text-[15px] text-slate-500 font-medium">건</span>
            </div>
            {isManager && (
              <>
                <span className="text-slate-300 text-[14px]" aria-hidden>·</span>
                <KpiMini label="승인" value={approvalTotal} />
              </>
            )}
            <span className="text-slate-300 text-[14px]" aria-hidden>·</span>
            <KpiMini label="요청" value={requestTotal} />
            <span className="text-slate-300 text-[14px]" aria-hidden>·</span>
            <KpiMini label="서류" value={docTotal} />
            {loading && <span className="text-[14px] text-slate-400 italic">· 불러오는 중</span>}
          </div>
        </div>
      </section>

      {/* ═════════ 2026-10-12 · 사용자 지시 · 승인·요청·서류 3 섹션 lg:3-col grid 통합 리스트 ═════════ */}
      <div className={`grid grid-cols-1 ${isManager ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"} gap-2.5 md:gap-4`}>
        {isManager && (
          <SectionCard
            label="승인요청"
            stripTone="indigo"
            description="관리자 결재 대기"
            rows={approvalRows}
            emptyMsg="대기 중인 승인이 없습니다"
          />
        )}
        <SectionCard
          label="요청확인"
          stripTone="amber"
          description="진열·점심 처리 요청"
          rows={requestRows}
          emptyMsg="대기 중인 요청이 없습니다"
        />
        <SectionCard
          label="직원 서류"
          stripTone="emerald"
          description={docTotal > 0 ? `${docTotal}건 작성 필요` : "모두 작성 완료"}
          rows={docRows}
          emptyMsg="서류 데이터 없음"
        />
      </div>
    </div>
  );
};

// ═════════ Sub-components ═════════

const KpiMini: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-baseline gap-1">
    <span className="text-[15px] text-slate-500 font-medium">{label}</span>
    <span className="text-[16px] font-bold text-ink tabular-nums">{value}</span>
  </div>
);

const SectionCard: React.FC<{
  label: string;
  stripTone: Tone;
  description: string;
  rows: SectionRow[];
  emptyMsg: string;
}> = ({ label, stripTone, description, rows, emptyMsg }) => {
  const t = TONE[stripTone];
  return (
    <section className={`${CARD} overflow-hidden flex flex-col`}>
      <header className="flex items-center gap-2 px-3 py-2.5 md:px-4 md:py-3 border-b border-slate-100">
{/* 2026-10-10 · 사용자 지시 · 컬러띠 제거 */}
        <span className={`text-[16px] md:text-[17px] font-semibold ${t.text} tracking-tight`}>{label}</span>
        <span className="text-[14px] text-slate-400 font-medium">· {description}</span>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[15px] text-slate-400">{emptyMsg}</div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {rows.map(r => {
            const rt = TONE[r.tone];
            const Icon = r.Icon;
            const empty = r.count === 0;
            return (
              <button
                key={r.key}
                type="button"
                onClick={r.action}
                className="w-full flex items-center gap-2.5 px-3 md:px-4 py-2.5 md:py-3 hover:bg-slate-50/60 active:bg-slate-100/40 cursor-pointer transition-colors text-left group"
              >
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-[8px] ${rt.bg} ${rt.text} shrink-0`}>
                  <Icon size={14} weight="fill" />
                </span>
                <span className="flex-1 text-[16px] md:text-[16px] font-semibold text-ink truncate">{r.label}</span>
                <span className={`inline-flex items-baseline gap-0.5 shrink-0 ${empty ? "opacity-50" : ""}`}>
                  <span className={`text-[17px] md:text-[16px] font-bold tabular-nums leading-none ${empty ? "text-slate-300" : rt.text}`}>{r.count}</span>
                  <span className="text-[15px] font-semibold text-slate-400">건</span>
                </span>
                <ArrowRight size={12} weight="bold" className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

// 2026-10-12 · 사용자 지시 "3단구조 통합" · DocCell 제거 · 직원서류 섹션도 SectionCard 로 통합

// unused imports guard
void Warning; void PenNib; void CheckCircle;
