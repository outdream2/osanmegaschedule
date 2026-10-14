// src/components/RequestsPage/VendorApprovalPanel.tsx
// 2026-10-12 · 사용자 지시 "거래처 승인 슬라이딩윈도우 UI 교체" (UI-7-3)
//   · 기존: 각 vendor 카드 안에 모든 상세 inline 펼침 · 공간 많이 차지
//   · 변경: 리스트 compact row · click → right slide-in drawer · 상세정보 + 거절/승인 drawer 안
//   · 다른 slide drawer 패턴 (RequestsPage · VendorOverviewPage) 과 통일
//
// 2026-08-26 · #192 · 거래처 승인 목록 · RequestsPage 신규 탭
//   · vendors.approval_status = "pending" / "requested" 만 조회
//   · 승인 · POST /api/vendors/:id/approve
//   · 거절 · POST /api/vendors/:id/reject · 사유 optional

import React, { useCallback, useEffect, useState } from "react";
import { Building2, Check, X, Clock, RefreshCw, MessageSquare, Mail, Phone, ShieldAlert, User, ShoppingBag, MessageCircle, Hash, AlertTriangle, ChevronRight } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { KO_INPUT_PROPS } from "../../lib/koreanInput";

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
  const [rejectReason, setRejectReason] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  // 2026-10-12 · drawer target
  const [selected, setSelected] = useState<PendingVendor | null>(null);
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<any[]>("/api/vendors");
      const arr = Array.isArray(data) ? data : [];
      const pending = arr
        .filter((v: any) => v?.approval_status === "requested" || v?.approval_status === "pending")
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

  const closeDrawer = useCallback(() => {
    setSelected(null);
    setRejectMode(false);
    setRejectReason("");
  }, []);

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
      closeDrawer();
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
      closeDrawer();
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

      {/* 2026-10-12 · 홈 랜딩 톤 compact header */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={14} className="text-brand-deep shrink-0" />
            <span className="text-[15px] font-semibold text-ink tracking-tight">거래처 승인 요청</span>
            <span className={`inline-flex items-center h-6 px-2 rounded-md border text-[12.5px] font-semibold tabular-nums ${rows.length > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
              대기 {rows.length}
            </span>
            <span className="text-[12.5px] text-slate-400 font-medium hidden sm:inline">· 담당자 필수 항목 완성 후 승인 요청</span>
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center h-8 px-2 rounded-md text-slate-500 hover:text-ink hover:bg-slate-50 text-[12.5px] font-medium transition-colors cursor-pointer"
            title="새로고침">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size={14} tone="zinc" label="승인 목록 로드 중..." labelSize={13} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="승인 대기 거래처 없음" hint="거래처가 필수 항목을 채우고 승인 요청 시 여기에 표시됩니다" />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {rows.map(v => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelected(v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-ink tracking-tight truncate">
                        {displayVendorName(v.company_name) || v.company_name}
                      </span>
                      {v.category && (
                        <span className="text-[12.5px] font-semibold text-violet-600">· {v.category}</span>
                      )}
                      {v.business_number && (
                        <span className="inline-flex items-center gap-0.5 text-[12px] text-slate-500 tabular-nums">
                          <Hash size={11} />
                          {v.business_number}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-500 flex-wrap">
                      {v.order_method && (
                        <span className="inline-flex items-center gap-1">
                          <ShoppingBag size={11} className="text-brand-deep" />
                          <span className="font-medium">{v.order_method}</span>
                        </span>
                      )}
                      {v.contact_name && (
                        <span className="inline-flex items-center gap-1">
                          <User size={11} />
                          <span>{v.contact_name}</span>
                        </span>
                      )}
                      {v.phone && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone size={11} />
                          <span>{v.phone}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 tabular-nums text-slate-400 ml-auto">
                        <Clock size={11} />
                        <span>{fmtDateTime(v.approval_requested_at)}</span>
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2026-10-12 · right slide-in drawer · 다른 drawer 와 통일 */}
      {selected && (
        <>
          <style>{`@keyframes vendorApprovalDrawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div
            className="fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-[1px]"
            onClick={closeDrawer}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="vendor-approval-drawer-title"
            className="fixed right-0 top-0 bottom-0 z-[81] w-full sm:w-[480px] bg-white shadow-2xl flex flex-col"
            style={{ animation: "vendorApprovalDrawerSlideIn 0.22s ease-out" }}
          >
            {/* drawer header */}
            <header className="px-5 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 id="vendor-approval-drawer-title" className="text-[17px] font-bold text-ink tracking-tight truncate">
                    {displayVendorName(selected.company_name) || selected.company_name}
                  </h2>
                  {selected.category && (
                    <span className="text-[13px] font-semibold text-violet-600">· {selected.category}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-slate-500 mt-1 flex-wrap tabular-nums">
                  {selected.business_number && (
                    <span className="inline-flex items-center gap-0.5"><Hash size={11} />{selected.business_number}</span>
                  )}
                  <span className="inline-flex items-center gap-1"><Clock size={11} />승인 요청 {fmtDateTime(selected.approval_requested_at)}</span>
                </div>
              </div>
              <button type="button" onClick={closeDrawer}
                className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </header>

            {/* drawer body · 섹션별 그룹 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {/* 주문방식 */}
              <DrawerField icon={<ShoppingBag size={14} className="text-brand-deep" />} label="주문방식" value={selected.order_method} />

              <div className="h-px bg-slate-100" />

              {/* 담당자·연락처·이메일 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <DrawerField icon={<User size={14} className="text-slate-500" />} label="담당자" value={selected.contact_name} />
                <DrawerField icon={<Phone size={14} className="text-slate-500" />} label="연락처" value={selected.phone} mono />
                <DrawerField icon={<Mail size={14} className="text-slate-500" />} label="이메일" value={selected.email} />
              </div>

              <div className="h-px bg-slate-100" />

              {/* 팀장·팀장연락처·긴급연락처 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <DrawerField icon={<User size={14} className="text-slate-400" />} label="팀장" value={selected.team_leader_name} />
                <DrawerField icon={<Phone size={14} className="text-slate-400" />} label="팀장 연락처" value={selected.team_leader_phone} mono />
                <DrawerField icon={<ShieldAlert size={14} className="text-rose-500" />} label="긴급 연락처" value={selected.emergency_contact} mono accent="rose" />
              </div>

              <div className="h-px bg-slate-100" />

              {/* 특이사항·비고 */}
              <DrawerField icon={<AlertTriangle size={14} className="text-amber-500" />} label="특이사항" value={selected.special_notes} accent="amber" />
              <DrawerField icon={<MessageCircle size={14} className="text-slate-400" />} label="비고" value={selected.note} />
            </div>

            {/* drawer footer · 액션 */}
            <footer className="shrink-0 border-t border-slate-200 bg-slate-50/40 px-5 py-3 flex flex-col gap-2">
              {rejectMode ? (
                <>
                  <div className="flex items-center gap-2">
                    <MessageSquare size={13} className="text-rose-500 shrink-0" />
                    <input
                      type="text" {...KO_INPUT_PROPS}
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="거절 사유 (선택 · 500자)"
                      maxLength={500}
                      autoFocus
                      className="flex-1 h-9 px-3 rounded-md border border-rose-200 bg-white text-[13.5px] focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400 transition"
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button type="button" onClick={() => { setRejectMode(false); setRejectReason(""); }}
                      className="h-9 px-4 rounded-md border border-slate-200 bg-white text-[13.5px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer">
                      취소
                    </button>
                    <button type="button" onClick={() => handleRejectSubmit(selected)} disabled={busyId === selected.id}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-[13.5px] font-semibold transition-colors cursor-pointer">
                      {busyId === selected.id ? <Spinner size={11} tone="white" /> : <X size={13} strokeWidth={2.5} />}
                      거절 확정
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 justify-end">
                  <button type="button" onClick={() => setRejectMode(true)} disabled={busyId === selected.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-[13.5px] font-semibold transition-colors cursor-pointer">
                    <X size={13} strokeWidth={2.5} />
                    거절
                  </button>
                  <button type="button" onClick={() => handleApprove(selected)} disabled={busyId === selected.id}
                    className="inline-flex items-center gap-1.5 h-9 px-5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[13.5px] font-semibold transition-colors cursor-pointer">
                    {busyId === selected.id ? <Spinner size={11} tone="white" /> : <Check size={13} strokeWidth={2.5} />}
                    승인
                  </button>
                </div>
              )}
            </footer>
          </aside>
        </>
      )}
    </div>
  );
};

// 2026-10-12 · drawer 내부 field · 라벨 (12px 캡션) + 아이콘 + 값 (14px 세미볼드)
const DrawerField: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
  accent?: "amber" | "rose";
}> = ({ icon, label, value, mono, accent }) => {
  const valueCls = !value
    ? "text-slate-300 italic font-medium"
    : accent === "amber"
    ? "text-amber-700"
    : accent === "rose"
    ? "text-rose-600"
    : "text-ink";
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className={`text-[14px] font-semibold break-words whitespace-normal leading-snug ${mono ? "tabular-nums" : ""} ${valueCls}`}>
          {value ?? "미입력"}
        </span>
      </div>
    </div>
  );
};

export default VendorApprovalPanel;
