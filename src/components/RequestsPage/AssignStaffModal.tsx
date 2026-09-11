// src/components/RequestsPage/AssignStaffModal.tsx
// 2026-09-11 · #75 · 진열요청 · 담당자 지정 모달
//   · 직원 목록 (재직 · level >= 1) · 검색 · 선택 시 · PATCH /api/display-requests/:id · assigned_staff_id·name

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { useToast, toastClass } from "../../hooks/useToast";
import { UserCheck, Search, Users } from "lucide-react";
import type { DisplayRequest } from "./types";

interface EmployeeRow {
  id: number;
  name: string;
  position?: string | null;
  rank?: string | null;
  level?: number | null;
  retire_date?: string | null;
}

interface AssignStaffModalProps {
  open: boolean;
  onClose: () => void;
  request: DisplayRequest | null;
  onAssigned?: () => void; // 성공 시 상위 리스트 refresh
}

export const AssignStaffModal: React.FC<AssignStaffModalProps> = ({ open, onClose, request, onAssigned }) => {
  const { toast, showSuccess, showError } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [assigningId, setAssigningId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLoading(true);
    (async () => {
      try {
        const res = await api.get<EmployeeRow[]>(`/api/employees`);
        const rows = Array.isArray(res.data) ? res.data : [];
        // 재직 중 · level >= 1 (담당 가능 · 관리자 · 직원 · 아르바이트 포함)
        const active = rows.filter(e => !e.retire_date && (e.level ?? 0) >= 1);
        setEmployees(active);
      } catch (e) {
        showError(`직원 목록 로드 실패: ${getErrorMessage(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, showError]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      String(e.name ?? "").toLowerCase().includes(q) ||
      String(e.position ?? "").toLowerCase().includes(q) ||
      String(e.rank ?? "").toLowerCase().includes(q),
    );
  }, [employees, query]);

  const handleAssign = async (emp: EmployeeRow) => {
    if (!request) return;
    setAssigningId(emp.id);
    try {
      await api.patch(`/api/display-requests/${request.id}`, {
        assigned_staff_id: emp.id,
        assigned_staff_name: emp.name,
      });
      showSuccess(`${emp.name} 님 지정 완료`);
      onAssigned?.();
      onClose();
    } catch (e) {
      showError(`지정 실패: ${getErrorMessage(e)}`);
    } finally {
      setAssigningId(null);
    }
  };

  const initial = (name: string) => (name ?? "?").charAt(0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-baseline gap-2">
          <span>담당자 지정</span>
          {request?.zone_label && (
            <span className="text-[13px] font-normal text-zinc-500">· {request.zone_label}</span>
          )}
        </div>
      }
      icon={<UserCheck size={18} />}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        {/* 검색 */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            lang="ko"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·직급·직군 검색..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-[14px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
            autoFocus
          />
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner tone="zinc" label="직원 목록 로딩..." labelSize={13} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? "일치하는 직원 없음" : "직원 없음"}
            size="compact"
          />
        ) : (
          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-1">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => handleAssign(e)}
                disabled={assigningId === e.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-100 bg-white hover:border-brand-deep/40 hover:bg-brand-tint/30 transition-all duration-150 cursor-pointer disabled:opacity-50 text-left"
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-brand-tint text-brand-deep ring-1 ring-brand-deep/20 flex items-center justify-center font-bold text-[15px]">
                  {initial(e.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-zinc-900 truncate">{e.name}</div>
                  <div className="text-[12px] text-zinc-500 truncate">
                    {[e.rank, e.position].filter(Boolean).join(" · ") || "직원"}
                  </div>
                </div>
                {assigningId === e.id && <Spinner size={14} tone="brand" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={toastClass(toast.tone)}>
          {toast.message}
        </div>
      )}
    </Modal>
  );
};

export default AssignStaffModal;
