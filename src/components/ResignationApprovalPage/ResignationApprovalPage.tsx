// src/components/ResignationApprovalPage/ResignationApprovalPage.tsx
// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useState } from "react";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { api, ApiError } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import {
  Clock, CheckCircle, XCircle, ArrowsClockwise,
  Warning, FileText, User, Calendar, ChatCenteredText,
} from "@phosphor-icons/react";
import { Spinner } from "../common/Spinner";
import { Badge } from "../common/Badge";
import type { AuthSession } from "../../types";
import { fmtDateYMD, fmtDateMD } from "../../lib/format";

interface Resignation {
  id: number;
  employee_id: number;
  employee_name: string;
  position: string | null;
  hire_date: string | null;
  last_work_date: string;
  reason: string;
  reason_detail: string | null;
  handover_notes: string | null;
  signature_data_url: string | null;
  pdf_url: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  approved_by: string | null;
  approved_by_id: number | null;
  approved_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

interface ResignationApprovalPageProps {
  authSession: AuthSession | null;
}

type MgrTab = "pending" | "all";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  approved: "승인",
  rejected: "반려",
  withdrawn: "철회",
};
const STATUS_TONE: Record<string, "amber" | "emerald" | "rose" | "zinc"> = {
  pending:   "amber",
  approved:  "emerald",
  rejected:  "rose",
  withdrawn: "zinc",
};

const fmtDate = fmtDateYMD;
const fmtDateTime = fmtDateMD;

const ResignationApprovalPage: React.FC<ResignationApprovalPageProps> = ({ authSession }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();

  const canApprove = (authSession?.level ?? 0) >= 8;
  const approverName = authSession?.employeeName ?? "관리자";
  const approverId = authSession?.employeeId;

  const [tab, setTab] = useState<MgrTab>("pending");
  const [list, setList] = useState<Resignation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<any>("/api/resignations");
      setList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err?.message ?? "불러오기 실패");
      // 테이블 미생성 힌트
      if (/relation .* does not exist|resignation_requests/i.test(String(msg))) {
        setError("DB 테이블이 없습니다. Supabase SQL Editor 에서 migrations/create_resignation_requests.sql 을 실행해주세요.");
      } else {
        setError(msg);
      }
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 부모 배지 · 새 사직서 도착 이벤트 시 자동 리로드
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("approval-count-updated", handler);
    return () => window.removeEventListener("approval-count-updated", handler);
  }, [load]);

  const pending = list.filter(r => r.status === "pending");
  const reviewed = list.filter(r => r.status !== "pending");
  const rows = tab === "pending" ? pending : reviewed;

  const handleReview = async (
    id: number,
    status: "approved" | "rejected",
  ) => {
    if (!canApprove) {
      showError("승인 권한이 없습니다 (level 8 이상 필요).");
      return;
    }
    if (status === "rejected" && !rejectReason.trim()) {
      showError("반려 사유를 입력하세요.");
      return;
    }
    if (status === "approved" && !await confirm({
      message: "이 사직서를 승인하시겠습니까?\n승인 시 · 해당 직원의 퇴사일이 자동으로 반영됩니다.",
    })) return;

    setProcessingId(id);
    try {
      await api.patch(`/api/resignations/${id}`, {
        status,
        reject_reason: status === "rejected" ? rejectReason : undefined,
        approved_by: approverName,
        approved_by_id: approverId,
      });
      // 로컬 갱신
      setList(prev => prev.map(r =>
        r.id === id
          ? {
              ...r,
              status,
              reject_reason: status === "rejected" ? rejectReason : null,
              approved_by: approverName,
              approved_by_id: approverId ?? null,
              approved_at: new Date().toISOString(),
            }
          : r
      ));
      setReviewingId(null);
      setRejectReason("");
      // 배지 즉시 갱신
      window.dispatchEvent(new CustomEvent("approval-count-updated"));
    } catch (err: any) {
      showError(err?.message ?? "처리 실패");
    } finally {
      setProcessingId(null);
    }
  };

  if (!canApprove) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <Card variant="raw-sm" borderColor="border-rose-100" rounded="2xl" padding="lg" className="max-w-sm flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
            <Warning size={24} weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-800 mb-1">권한 없음</h2>
            <p className="text-[12px] text-zinc-500 leading-snug">
              사직서 승인은 대표(level 8) 이상만 가능합니다.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <main className={`flex-1 ${PAGE_CONTAINER_CLS} px-3 sm:px-5 py-5 flex flex-col gap-3`}>
        {/* 페이지 헤더 · 2026-08-17 · 세련 · accent bar + gradient icon card */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <AccentBar size="hero" className="shrink-0" />
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-tint to-white border border-brand/15 text-brand-deep flex items-center justify-center shadow-[0_1px_2px_rgba(10,46,74,0.04),0_2px_8px_rgba(10,46,74,0.06)]">
              <FileText size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-[18px] sm:text-[19px] font-bold text-ink leading-tight tracking-tight">사직서 승인</h1>
              <p className="text-[13px] text-ink-soft mt-0.5 font-medium">
                제출된 사직서를 검토하여 승인 또는 반려하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
            title="새로고침"
          >
            <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* 탭 (pending · all) */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 border border-line rounded-xl">
          {(["pending", "all"] as MgrTab[]).map(t => {
            const active = tab === t;
            const count = t === "pending" ? pending.length : reviewed.length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2 text-xs font-bold rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  active
                    ? "bg-white shadow-sm text-zinc-800 border border-line"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {t === "pending" ? (
                  <>
                    <Clock size={12} weight="fill" />
                    승인 대기
                    <span className={`ml-0.5 tabular-nums ${count > 0 ? "text-amber-600" : "text-zinc-400"}`}>
                      {count}
                    </span>
                  </>
                ) : (
                  <>
                    <FileText size={12} weight="fill" />
                    처리 완료
                    <span className="ml-0.5 tabular-nums text-zinc-500">{count}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* 리스트 · 2026-08-25 · v9 topAccent */}
        <Card padding="none" topAccent className="p-3 sm:p-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              <Warning size={12} weight="fill" />
              {error}
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Spinner label="로딩 중..." size={14} tone="zinc" labelSize={12} />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-[12px] text-zinc-300 py-8">
              {tab === "pending" ? "대기 중인 사직서가 없습니다." : "처리된 사직서가 없습니다."}
            </div>
          ) : (
            <div className={`flex flex-col divide-y divide-zinc-100 ${loading ? "opacity-40 pointer-events-none" : ""}`}>
              {rows.map(r => {
                const expanded = expandedId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`py-2.5 hover:bg-zinc-50/60 transition rounded-lg pl-2 border-l-2 ${
                      r.status === "pending" ? "border-amber-300"
                      : r.status === "approved" ? "border-emerald-300"
                      : r.status === "rejected" ? "border-rose-300"
                      : "border-zinc-300"
                    }`}
                  >
                    {/* 상단 · 이름 · 상태 */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <User size={13} weight="fill" className="text-zinc-400 shrink-0" />
                          <span className="text-sm font-bold text-zinc-800">{r.employee_name}</span>
                          {r.position && (
                            <Badge tone="zinc" size="xs">{r.position}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[12px] text-zinc-600 font-semibold">
                          <Calendar size={11} className="text-rose-400 shrink-0" />
                          <span>마지막 근무: <span className="font-bold text-zinc-800">{fmtDate(r.last_work_date)}</span></span>
                        </div>
                      </div>
                      <StatusPill tone={STATUS_TONE[r.status] ?? "zinc"} size="xs" className="shrink-0">
                        {STATUS_LABEL[r.status]}
                      </StatusPill>
                    </div>

                    {/* 사유 요약 */}
                    <div className="text-[12px] text-zinc-600 mb-1 pl-4">
                      사유: <span className="font-bold text-zinc-800">{r.reason}</span>
                    </div>

                    {/* 메타 정보 */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-400 mb-1.5 pl-4">
                      <span>제출: {fmtDateTime(r.created_at)}</span>
                      {r.hire_date && <span>입사: {fmtDate(r.hire_date)}</span>}
                      {r.approved_at && <span>처리: {fmtDateTime(r.approved_at)} {r.approved_by && `(${r.approved_by})`}</span>}
                    </div>

                    {/* 접기/펼치기 · 상세 */}
                    {(r.reason_detail || r.handover_notes || r.signature_data_url || r.reject_reason) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        className="ml-4 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        {expanded ? "▲ 상세 접기" : "▼ 상세 보기"}
                      </button>
                    )}

                    {expanded && (
                      <div className="ml-4 mt-2 flex flex-col gap-2">
                        {r.reason_detail && (
                          <div className="bg-zinc-50 border border-line rounded-lg px-2.5 py-2">
                            <div className="text-[10px] font-bold text-zinc-500 mb-0.5 flex items-center gap-1">
                              <ChatCenteredText size={10} weight="fill" /> 사유 상세
                            </div>
                            <div className="text-[12px] text-zinc-700 whitespace-pre-wrap leading-snug">
                              {r.reason_detail}
                            </div>
                          </div>
                        )}
                        {r.handover_notes && (
                          <Card variant="flat" bg="bg-indigo-50" borderColor="border-indigo-200" rounded="lg" padding="sm">
                            <div className="text-[10px] font-bold text-indigo-600 mb-0.5">인수인계</div>
                            <div className="text-[12px] text-indigo-900 whitespace-pre-wrap leading-snug">
                              {r.handover_notes}
                            </div>
                          </Card>
                        )}
                        {r.signature_data_url && (
                          <Card variant="flat" rounded="lg" padding="none" className="px-2.5 py-2">
                            <div className="text-[10px] font-bold text-zinc-500 mb-0.5">서명</div>
                            <img
                              src={r.signature_data_url}
                              alt="서명"
                              className="max-h-16 object-contain"
                            />
                          </Card>
                        )}
                        {r.reject_reason && (
                          <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" rounded="lg" padding="sm">
                            <div className="text-[10px] font-bold text-rose-600 mb-0.5">반려 사유</div>
                            <div className="text-[12px] text-rose-900 whitespace-pre-wrap leading-snug">
                              {r.reject_reason}
                            </div>
                          </Card>
                        )}
                      </div>
                    )}

                    {/* 승인/반려 액션 · pending 만 */}
                    {r.status === "pending" && (
                      reviewingId === r.id ? (
                        <div className="ml-4 flex flex-col gap-2 mt-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="반려 사유 (반려 시 필수)"
                            className="w-full bg-white border border-line rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand-deep transition"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleReview(r.id, "approved")}
                              disabled={processingId === r.id}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle size={12} weight="fill" />
                              {processingId === r.id ? "처리 중..." : "승인"}
                            </button>
                            <button
                              onClick={() => handleReview(r.id, "rejected")}
                              disabled={processingId === r.id}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-50"
                            >
                              <XCircle size={12} weight="fill" />
                              {processingId === r.id ? "처리 중..." : "반려"}
                            </button>
                          </div>
                          <button
                            onClick={() => { setReviewingId(null); setRejectReason(""); }}
                            className="text-[11px] text-zinc-400 hover:text-zinc-600 text-center cursor-pointer"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReviewingId(r.id); setRejectReason(""); }}
                          className="ml-4 mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                        >
                          검토하기
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

export default ResignationApprovalPage;
