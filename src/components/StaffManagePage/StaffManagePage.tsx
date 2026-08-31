// src/components/StaffManagePage/StaffManagePage.tsx
// 직원관리 페이지 — 마스터-디테일 레이아웃 (이력서 스타일 우측 패널)
// 2026-08-23 · Framework Phase 4 · 분리 완료 (1917→XXX · 6 신규 파일)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSortableTable } from "../../hooks/useSortableTable";
import { useColumnResize } from "../../hooks/useColumnResize";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-24 · SplitPanel 프리미티브 마이그레이션 · useResizablePanel 제거
import { SplitPanel } from "../common/SplitPanel";
import { useLeaveManager } from "../../hooks/useLeaveManager";
import {
  updateEmployee,
  createEmployee as apiCreateEmployee,
  deleteEmployee as apiDeleteEmployee,
  uploadResume as apiUploadResume,
  uploadBankbook as apiUploadBankbook,
  uploadResignationFile as apiUploadResignation,
  deleteResume as apiDeleteResume,
} from "../../lib/employeeApi";
import { api, ApiError } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { AddressSearchModal } from "../common/features/AddressSearchModal";
import { getEmploymentStatus } from "../../lib/employmentStatus";

import type { Employee, EditDraft } from "./types";
import { CreateModal } from "./CreateModal";
import { StaffToolbar } from "./StaffToolbar";
import { StaffListPanel } from "./StaffListPanel";
import { StaffDetailPanel } from "./StaffDetailPanel";
import { StaffMobileDetail } from "./StaffMobileDetail";

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface StaffManagePageProps {
  onWriteContract?: (emp: Employee) => void;
  initialSelectedId?: number | null;
  onBackToSchedule?: () => void;
}

type FilterStatus = "active" | "pending_resignation" | "retired" | "all";
type SortKey = "name" | "position" | "contract_type" | "tenure" | "performance_rating"
  | "resume_file" | "bankbook_file" | "contract_file" | "resignation_file" | "status";

interface LatestContract {
  id?: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  pdf_url?: string | null;
}

interface ContractHistoryItem {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pdf_url?: string | null;
  pdf_size?: number | null;
  storage?: string | null;
  approved_by?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const StaffManagePage: React.FC<StaffManagePageProps> = ({ onWriteContract, initialSelectedId, onBackToSchedule }) => {
  const confirm = useConfirm();
  const { toast, showError, showSuccess } = useToast();

  // ── 기본 상태 ──
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("");
  const [filterStatus, setFilterStatus]     = useState<FilterStatus>("active");
  const [selectedId, setSelectedId]         = useState<number | null>(initialSelectedId ?? null);
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState<EditDraft | null>(null);
  const [saving, setSaving]       = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [addrModalOpen, setAddrModalOpen] = useState(false);

  // initialSelectedId 변경 시 자동 선택
  useEffect(() => {
    if (initialSelectedId != null) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  // 모바일 상세 ESC 닫기
  useEffect(() => {
    if (!mobileDetail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileDetail(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileDetail]);

  // 2026-08-24 · SplitPanel 프리미티브 이관 · useResizablePanel 제거
  //   · 폭 조정 · localStorage · mobile modal 자동 처리
  //   · maxWidth 640 → 1200 확장 (사용자 지시: 넓이 조정 안 됨 fix)

  // ── 연차 훅 ──
  const {
    leaveYear, setLeaveYear, currentYearNow,
    usedLeaves, leaveLoading, leaveError, deletingLeaveDate,
    loadUsedLeaves, deleteUsedLeave,
  } = useLeaveManager(selectedId, confirm);

  // ── 최신 근로계약서 ──
  const [latestContract, setLatestContract] = useState<LatestContract | null>(null);
  const [latestContractLoading, setLatestContractLoading] = useState(false);

  // ── 계약 이력 ──
  const [contractHistory, setContractHistory]         = useState<ContractHistoryItem[]>([]);
  const [contractHistoryLoading, setContractHistoryLoading] = useState(false);
  const [contractHistoryError, setContractHistoryError]     = useState<string | null>(null);

  // ── 계약 count (리스트 배지용) ──
  const [contractCountByEmp, setContractCountByEmp] = useState<Map<number, number>>(() => new Map());

  // 2026-08-29 · P2 fix · 감사 결과 · 매 latestContract 변화마다 전체 재fetch 방지
  //   · deps [latestContract] → [] · 마운트 1회 · 새 계약 저장 시 loadLatestContract 에서 map 증분
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: rows } = await api.get<any[]>("/api/employee-contracts");
        if (!Array.isArray(rows)) return;
        const map = new Map<number, number>();
        for (const r of rows) {
          const id = Number(r?.employee_id);
          if (!Number.isFinite(id)) continue;
          map.set(id, (map.get(id) ?? 0) + 1);
        }
        if (alive) setContractCountByEmp(map);
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 데이터 로드 ──
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      // 2026-08-31 · endpoint 통일 · /api/employees · birth_date·address 포함 · #52
      void y; void m;
      const { data } = await api.get<any>(`/api/employees`);
      const list: Employee[] = Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : []);
      setEmployees(list);
      if (selectedId != null && !list.find((e) => e.id === selectedId)) setSelectedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadEmployees(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 최신 계약서 조회 ──
  useEffect(() => {
    if (selectedId == null) { setLatestContract(null); setLatestContractLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLatestContractLoading(true);
      try {
        const { data: rows } = await api.get<any>(`/api/employee-contracts?employeeId=${selectedId}`);
        if (cancelled) return;
        setLatestContract(Array.isArray(rows) && rows.length > 0 ? rows[0] as LatestContract : null);
      } catch {
        if (!cancelled) setLatestContract(null);
      } finally {
        if (!cancelled) setLatestContractLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── 계약 이력 조회 ──
  useEffect(() => {
    if (selectedId == null) {
      setContractHistory([]); setContractHistoryError(null); setContractHistoryLoading(false); return;
    }
    let cancelled = false;
    (async () => {
      setContractHistoryLoading(true); setContractHistoryError(null);
      try {
        const { data: rows } = await api.get<any>(`/api/employee-contracts?employeeId=${selectedId}`);
        if (cancelled) return;
        setContractHistory(Array.isArray(rows) ? rows : []);
      } catch (err: any) {
        if (!cancelled) {
          setContractHistory([]);
          setContractHistoryError(err instanceof ApiError ? err.message : (err?.message ?? "계약 이력 조회 실패"));
        }
      } finally {
        if (!cancelled) setContractHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, latestContract]);

  // ── 필터링 ──
  const filteredRaw = useMemo(() => employees.filter((e) => {
    const status = getEmploymentStatus((e as any).retire_date ?? null);
    if (filterStatus !== "all" && status !== filterStatus) return false;
    if (filterPosition && !(e.position ?? "").includes(filterPosition)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        e.name?.toLowerCase().includes(q) ||
        (e.position ?? "").toLowerCase().includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  }), [employees, search, filterPosition, filterStatus]);

  // ── 정렬 ──
  const cmpStr = (a: string, b: string) => a.localeCompare(b, "ko");
  const tenureDays = (e: Employee) => {
    if (!e.hire_date) return -Infinity;
    const t = Date.parse(String(e.hire_date));
    return Number.isFinite(t) ? t : -Infinity;
  };
  const sortComparators = useMemo<Record<SortKey, (a: Employee, b: Employee) => number>>(() => ({
    name:               (a, b) => cmpStr(a.name ?? "", b.name ?? ""),
    position:           (a, b) => cmpStr(a.position ?? "", b.position ?? ""),
    contract_type:      (a, b) => cmpStr((a as any).contract_type ?? "", (b as any).contract_type ?? ""),
    tenure:             (a, b) => tenureDays(b) - tenureDays(a),
    performance_rating: (a, b) => cmpStr((a as any).performance_rating ?? "", (b as any).performance_rating ?? ""),
    resume_file:        (a, b) => (((b as any).resume_url ? 1 : 0) - ((a as any).resume_url ? 1 : 0)),
    bankbook_file:      (a, b) => (((b as any).bankbook_image_url ? 1 : 0) - ((a as any).bankbook_image_url ? 1 : 0)),
    contract_file:      (a, b) => (((b as any).contract_file_url ? 1 : 0) - ((a as any).contract_file_url ? 1 : 0)),
    resignation_file:   (a, b) => (((b as any).resignation_file_url ? 1 : 0) - ((a as any).resignation_file_url ? 1 : 0)),
    status:             (a, b) => (((a as any).retire_date ? 1 : 0) - ((b as any).retire_date ? 1 : 0)),
  }), []);
  const { sorted: filtered, sortKey, sortDir, toggleSort } = useSortableTable<Employee, SortKey>(filteredRaw, "name", sortComparators);

  // ── 컬럼 리사이즈 ──
  const { getWidth: sw, resizerProps: sr } = useColumnResize("staffList", {
    name:          { default: 100, min: 60,  max: 200 },
    position:      { default: 64,  min: 48,  max: 120 },
    contract_type: { default: 72,  min: 48,  max: 120 },
    tenure:        { default: 52,  min: 40,  max: 100 },
    rating:        { default: 40,  min: 32,  max: 80  },
    resume:        { default: 44,  min: 36,  max: 80  },
    bankbook:      { default: 40,  min: 36,  max: 80  },
    contract:      { default: 44,  min: 36,  max: 80  },
    resignation:   { default: 44,  min: 36,  max: 80  },
    status:        { default: 44,  min: 36,  max: 80  },
  });

  const selectedEmp = useMemo(() => employees.find((e) => e.id === selectedId) ?? null, [employees, selectedId]);

  // ── 핸들러 ──
  const handleSelect = async (emp: Employee) => {
    if (editing && !await confirm({ message: "편집 중인 내용이 있습니다. 이동할까요?" })) return;
    setSelectedId(emp.id); setEditing(false); setDraft(null); setMobileDetail(true);
  };

  const startEdit = (emp: Employee) => {
    setDraft({
      // 2026-08-29 · #177 회귀 fix · rank 초기값 · 없으면 저장 시 undefined 로 기존값 지워짐
      name: emp.name ?? "", position: emp.position ?? "", rank: emp.rank ?? "", phone: emp.phone ?? "",
      email: emp.email ?? "", level: emp.level ?? null, role: emp.role ?? "",
      hire_date: emp.hire_date ?? "", memo: emp.memo ?? "",
      contract_file_url: emp.contract_file_url ?? "", resume_url: (emp as any).resume_url ?? "",
      photo_url: emp.photo_url ?? "", birth_date: emp.birth_date ?? "",
      gender: emp.gender ?? "", address: emp.address ?? "",
      schedule_type: emp.schedule_type ?? "", work_area: emp.work_area ?? "",
      salary: emp.salary ?? "", contract_start: emp.contract_start ?? "",
      contract_end: emp.contract_end ?? "", contract_type: emp.contract_type ?? "",
      performance_rating: emp.performance_rating ?? "",
      break_time_minutes: emp.break_time_minutes ?? 60, break_apply_paid: emp.break_apply_paid ?? true,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const saveEdit = async () => {
    if (!selectedEmp || !draft) return;
    if (!draft.name?.trim()) { showError("이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      await updateEmployee(selectedEmp as any, draft as any);
      // 2026-08-29 · #185 Phase A · P0 회귀 방지 · 세션 재발급 필요 변경 감지
      //   · position · level · phone · role 변경 시 · 본인 편집이면 재로그인 안내
      //   · JWT payload · role/level/phone 변경 · 다음 요청 401 방지
      const changedFields: string[] = [];
      const beforeAny = selectedEmp as any;
      const afterAny = draft as any;
      if (afterAny.position != null && String(beforeAny.position ?? "") !== String(afterAny.position ?? "")) changedFields.push("직군(position)");
      if (afterAny.rank != null && String(beforeAny.rank ?? "") !== String(afterAny.rank ?? "")) changedFields.push("직급(rank)");
      if (afterAny.level != null && Number(beforeAny.level ?? 0) !== Number(afterAny.level ?? 0)) changedFields.push("권한(level)");
      if (afterAny.phone != null && String(beforeAny.phone ?? "") !== String(afterAny.phone ?? "")) changedFields.push("핸드폰(phone)");
      if (changedFields.length > 0) {
        showSuccess(`저장 완료 · ${changedFields.join(" · ")} 변경 · 해당 직원 · 재로그인 시 반영`);
      } else {
        showSuccess("저장 완료");
      }
      setEditing(false); setDraft(null);
      setEmployees((prev) => prev.map((e) => e.id === selectedEmp.id ? { ...e, ...draft } : e));
    } catch (err: unknown) {
      showError(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  };

  const deleteEmployee = async (emp: Employee) => {
    if (!await confirm({ message: `직원 [${emp.name}] 삭제할까요?\n\n관련 스케줄·배정 데이터도 영향을 받을 수 있습니다.`, danger: true })) return;
    try {
      await apiDeleteEmployee(emp.id);
      if (selectedId === emp.id) setSelectedId(null);
      loadEmployees();
    } catch (err: unknown) { showError(`삭제 오류: ${err instanceof Error ? err.message : String(err)}`); }
  };

  const createEmployee = async (data: Partial<Employee>) => {
    if (!data.name?.trim()) { showError("이름을 입력해주세요."); return; }
    setCreateSaving(true);
    try {
      const created = await apiCreateEmployee(data as any);
      setCreateOpen(false); await loadEmployees(); setSelectedId(created?.id ?? null);
    } catch (err: unknown) { showError(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setCreateSaving(false); }
  };

  const setField = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) =>
    setDraft((p) => (p ? { ...p, [k]: v } : p));

  // ── 파일 업로드 헬퍼 ──
  const uploadResumeForRow = useCallback(async (emp: Employee, file: File) => {
    try {
      const { url } = await apiUploadResume(emp.id, file);
      setEmployees((prev) => prev.map((e) => e.id === emp.id ? { ...e, resume_url: url } : e));
      showSuccess(`이력서 업로드 완료 · ${emp.name}`);
    } catch (err: any) { showError(`이력서 업로드 실패 · ${err?.message ?? err}`); }
  }, [showSuccess, showError]);

  const uploadBankbookForRow = useCallback(async (emp: Employee, file: File) => {
    try {
      const { dataUrl } = await apiUploadBankbook(emp as any, file);
      setEmployees((prev) => prev.map((e) => e.id === emp.id ? { ...e, bankbook_image_url: dataUrl } : e));
      showSuccess(`통장사본 업로드 완료 · ${emp.name}`);
    } catch (err: any) { showError(`통장사본 업로드 실패 · ${err?.message ?? err}`); }
  }, [showSuccess, showError]);

  const uploadResignationFileForRow = useCallback(async (emp: Employee, file: File) => {
    try {
      const { url } = await apiUploadResignation(emp.id, file);
      setEmployees((prev) => prev.map((e) => e.id === emp.id ? { ...e, resignation_file_url: url ?? "" } : e));
      showSuccess(`사직서 업로드 완료 · ${emp.name}`);
    } catch (err: any) { showError(`사직서 업로드 실패 · ${err?.message ?? err}`); }
  }, [showSuccess, showError]);

  const displayEmp = editing && draft ? { ...selectedEmp!, ...draft } : selectedEmp;

  // ── 렌더링 ──────────────────────────────────────────────────────────────────
  return (
    <main className={`flex-1 ${PAGE_CONTAINER_CLS} px-4 py-4 flex flex-col gap-3 min-h-0`}>

      {/* 상단 필터바 */}
      <StaffToolbar
        employees={employees}
        loading={loading}
        search={search}
        filterStatus={filterStatus}
        filterPosition={filterPosition}
        onSearchChange={setSearch}
        onFilterStatusChange={setFilterStatus}
        onFilterPositionChange={setFilterPosition}
        onRefresh={loadEmployees}
        onCreateOpen={() => setCreateOpen(true)}
        onBackToSchedule={onBackToSchedule}
      />

      {/* 마스터-디테일 · 2026-08-24 · SplitPanel 프리미티브 · 폭 조정 자동 · 최대 1200 확장 */}
      <SplitPanel
        storageKey="staffManage.listWidth"
        defaultWidth={288}
        minWidth={200}
        maxWidth={1200}
        dividerColor="indigo"
        className="flex-1 min-h-0"
        mobileRightAsModal={false}
        left={
          <StaffListPanel
            employees={employees}
            filtered={filtered}
            loading={loading}
            error={error}
            selectedId={selectedId}
            contractCountByEmp={contractCountByEmp}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            getWidth={sw as (col: string) => number}
            resizerProps={sr as (col: any) => React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>}
            handleSelect={handleSelect}
            showError={showError}
            onCreateOpen={() => setCreateOpen(true)}
            onRefresh={loadEmployees}
            uploadResumeForRow={uploadResumeForRow}
            uploadBankbookForRow={uploadBankbookForRow}
            uploadResignationFileForRow={uploadResignationFileForRow}
            onWriteContract={onWriteContract}
          />
        }
        right={
          <StaffDetailPanel
            displayEmp={displayEmp ?? null}
            selectedEmp={selectedEmp}
            editing={editing}
            draft={draft}
            saving={saving}
            latestContract={latestContract}
            latestContractLoading={latestContractLoading}
            contractHistory={contractHistory}
            contractHistoryLoading={contractHistoryLoading}
            contractHistoryError={contractHistoryError}
            contractCountByEmp={contractCountByEmp}
            leaveYear={leaveYear}
            currentYearNow={currentYearNow}
            usedLeaves={usedLeaves}
            leaveLoading={leaveLoading}
            leaveError={leaveError}
            deletingLeaveDate={deletingLeaveDate}
            setField={setField}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            deleteEmployee={deleteEmployee}
            setLeaveYear={setLeaveYear}
            loadUsedLeaves={loadUsedLeaves}
            deleteUsedLeave={deleteUsedLeave}
            setAddrModalOpen={setAddrModalOpen}
            showError={showError}
            showSuccess={showSuccess}
            confirm={confirm}
            uploadResume={apiUploadResume}
            deleteResume={apiDeleteResume}
          />
        }
      />

      {/* 모바일 상세 모달 */}
      {mobileDetail && selectedEmp && (
        <StaffMobileDetail
          selectedEmp={selectedEmp}
          onClose={() => setMobileDetail(false)}
          onEdit={() => { setMobileDetail(false); startEdit(selectedEmp); }}
          onDelete={() => { setMobileDetail(false); deleteEmployee(selectedEmp); }}
        />
      )}

      {/* 신규 등록 모달 */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSave={createEmployee}
          saving={createSaving}
        />
      )}

      {/* 주소 검색 모달 */}
      <AddressSearchModal
        open={addrModalOpen}
        onClose={() => setAddrModalOpen(false)}
        onSelect={(data) => setField("address", data.formatted)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </main>
  );
};

export default StaffManagePage;
