// src/components/RequestsPage/VendorApprovalPanel.tsx
// 2026-08-26 · #192 · 거래처 승인 목록 · RequestsPage 신규 탭
//   · vendors.approval_status = "pending" 만 조회
//   · 승인 · POST /api/vendors/:id/approve
//   · 거절 · POST /api/vendors/:id/reject · 사유 optional
//   · 연차승인 UX 참고 · 카드형 리스트 · 승인/거절 액션

import React, { useCallback, useEffect, useState } from "react";
import { Building2, Check, X, Clock, RefreshCw, MessageSquare } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
import { dispatchApprovalChange } from "../../lib/approvalEvents";

interface PendingVendor {
  id: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  business_number: string | null;
  category: string | null;
  order_method: string | null;
  team_leader_name: string | null;
  team_leader_phone: string | null;
  emergency_contact: string | null;
  special_notes: string | null;
  note: string | null;
  approval_requested_at: string | null;
}

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const VendorApprovalPanel: React.FC = () => {
  const [rows, setRows] = useState<PendingVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // pending vendor 조회 · /api/vendors?withBalances=0 · 클라이언트에서 filter (신규 서버 endpoint 없음)
      const { data } = await api.get<any[]>("/api/vendors");
      const arr = Array.isArray(data) ? data : [];
      const pending = arr
        .filter((v: any) => v?.approval_status === "pending")
        .sort((a: any, b: any) => String(b?.approval_requested_at ?? "").localeCompare(String(a?.approval_requested_at ?? "")));
      setRows(pending as PendingVendor[]);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : e?.message ?? "네트워크 오류";
      showError(`거래처 승인 목록 로드 실패 · ${msg}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (v: PendingVendor) => {
    const ok = await confirm({
      title: "거래처 승인",
      message: `${v.company_name} · 승인하시겠습니까?\n승인 후 · 공급사 재고확인 메뉴가 활성화됩니다.`,
    });
    if (!ok) return;
    setBusyId(v.id);
    try {
      await api.post(`/api/vendors/${v.id}/approve`, {});
      showSuccess(`${v.company_name} · 승인 완료`);
      dispatchApprovalChange();
      setRows(prev => prev.filter(x => x.id !== v.id));
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : e?.message ?? "승인 실패";
      showError(`승인 실패 · ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectSubmit = async (v: PendingVendor) => {
    setBusyId(v.id);
    try {
      await api.post(`/api/vendors/${v.id}/reject`, { reason: rejectReason.trim() || undefined });
      showSuccess(`${v.company_name} · 거절 완료`);
      dispatchApprovalChange();
      setRows(prev => prev.filter(x => x.id !== v.id));
      setRejectId(null);
      setRejectReason("");
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : e?.message ?? "거절 실패";
      showError(`거절 실패 · ${msg}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {toast && (
        <div className="fixed bottom-4 right-4 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}

      {/* 헤더 · 새로고침 */}
      <Card padding="md" topAccent>
        <div className="flex items-center gap-3">
          <IconTile icon={<Building2 size={16} />} tone="brand" size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight">거래처 승인 요청</div>
            <div className="text-[13px] text-ink-soft mt-0.5">거래처 담당자가 필수 항목 완성 후 · 승인 요청</div>
          </div>
          <StatusPill tone="amber" size="sm" dot={rows.length > 0}>대기 · {rows.length}건</StatusPill>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-white hover:border-brand-deep/40 hover:bg-brand-tint/20 text-ink-soft hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </Card>

      {/* 리스트 */}
      {loading ? (
        <Card padding="md" className="flex items-center justify-center py-16">
          <Spinner size={18} tone="brand" label="승인 목록 로드 중..." labelSize={14} />
        </Card>
      ) : rows.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={Building2} title="승인 대기 거래처 없음" hint="거래처가 필수 항목을 채우고 승인 요청 시 여기에 표시됩니다" />
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(v => (
            <Card key={v.id} padding="md" className="hover:border-brand-deep/40 transition">
              <div className="flex items-start gap-3 mb-3">
                <IconTile icon={<Building2 size={14} />} tone="brand" size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="text-[17px] font-bold text-ink tracking-tight">{v.company_name}</div>
                    {v.category && <StatusPill tone="violet" size="xs">{v.category}</StatusPill>}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-ink-soft mt-1 tabular-nums">
                    <Clock size={11} />
                    <span>요청 {fmtDateTime(v.approval_requested_at)}</span>
                  </div>
                </div>
              </div>

              {/* 필수 8항목 요약 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[13px] mb-3 pl-1">
                <FieldRow label="이메일" value={v.email} />
                <FieldRow label="주문방식" value={v.order_method} />
                <FieldRow label="팀장" value={v.team_leader_name} />
                <FieldRow label="팀장연락처" value={v.team_leader_phone} />
                <FieldRow label="긴급연락처" value={v.emergency_contact} />
                <FieldRow label="사업자번호" value={v.business_number} mono />
                <FieldRow label="특이사항" value={v.special_notes} />
                <FieldRow label="비고" value={v.note} />
              </div>

              {/* 거절 사유 입력 · rejectId 매치 시 */}
              {rejectId === v.id && (
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare size={13} className="text-rose-500 shrink-0" />
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="거절 사유 (선택 · 500자)"
                    maxLength={500}
                    className="flex-1 h-9 px-3 rounded-lg border border-rose-300 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-rose-200"
                  />
                  <button
                    type="button"
                    onClick={() => { setRejectId(null); setRejectReason(""); }}
                    className="h-9 px-3 rounded-lg border border-line text-[13px] font-semibold text-ink-soft hover:bg-zinc-50 cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectSubmit(v)}
                    disabled={busyId === v.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
                  >
                    {busyId === v.id ? <Spinner size={11} tone="white" /> : <X size={12} />}
                    거절 확정
                  </button>
                </div>
              )}

              {/* 액션 · 승인 / 거절 */}
              {rejectId !== v.id && (
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setRejectId(v.id); setRejectReason(""); }}
                    disabled={busyId === v.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-bold text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-40 cursor-pointer transition"
                  >
                    <X size={12} strokeWidth={2.5} />
                    거절
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(v)}
                    disabled={busyId === v.id}
                    className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm ring-2 ring-emerald-300/30 disabled:opacity-40 cursor-pointer transition"
                  >
                    {busyId === v.id ? <Spinner size={11} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
                    승인
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const FieldRow: React.FC<{ label: string; value: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-baseline gap-1.5 min-w-0">
    <span className="text-[12px] font-semibold text-ink-soft shrink-0">{label}</span>
    <span className={`${mono ? "font-mono" : ""} font-bold text-ink truncate ${!value ? "text-zinc-300 font-normal italic" : ""}`}>
      {value ?? "미입력"}
    </span>
  </div>
);

export default VendorApprovalPanel;
