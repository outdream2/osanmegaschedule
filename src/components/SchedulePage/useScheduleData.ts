// src/components/SchedulePage/useScheduleData.ts
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 데이터 fetch/mutate 훅
import { useState, useRef, useCallback } from "react";
import { api } from "../../lib/apiClient";
import { SK_EMPLOYEE_ORDER } from "../../lib/storageKeys";
import {
  updateEmployee,
  updateEmployeeFull,
  createEmployee,
  deleteEmployee as apiDeleteEmployee,
  uploadContract as apiUploadContract,
} from "../../lib/employeeApi";
import { Employee, Schedule } from "../../types";
import { useConfirm } from "../../hooks/useConfirm";

export interface UndoEntry {
  employeeId: number;
  date: string;
  type: string;
  workingHours: string;
  actualHours: string;
  memo: string;
}

export interface CellUpdateData {
  employeeId: number;
  date: string;
  type: string;
  workingHours: string;
  actualHours: string;
  memo?: string;
}

export function useScheduleData(
  currentYear: number,
  currentMonth: number,
  showNotification: (msg: string, type?: "success" | "error") => void
) {
  const confirm = useConfirm();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [yearLeaveStats, setYearLeaveStats] = useState<Record<number, number>>({});
  const [isMonthLocked, setIsMonthLocked] = useState(false);
  const [isLockLoading, setIsLockLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const isInitialFetchRef = useRef(true);

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const fetchScheduleData = useCallback(async (dates?: string[], silent = false) => {
    const targetDates = dates ?? [];
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const monthKeys = Array.from(new Set(targetDates.map(d => d.substring(0, 7))));
      const months = monthKeys.map(k => ({
        year: parseInt(k.substring(0, 4)),
        month: parseInt(k.substring(5, 7)),
      }));

      const responses = await Promise.all(
        months.map(({ year, month }) =>
          api.get<any>(`/api/schedules?year=${year}&month=${month}`)
        )
      );

      const empMap = new Map<number, Employee>();
      for (const res of responses) {
        const empList: Employee[] = res.data.employees || [];
        for (const emp of empList) {
          if (empMap.has(emp.id)) {
            const existing = empMap.get(emp.id)!;
            const existingDates = new Set(existing.schedules.map(s => s.date));
            const newSchedules = emp.schedules.filter(s => !existingDates.has(s.date));
            existing.schedules = [...existing.schedules, ...newSchedules];
          } else {
            empMap.set(emp.id, { ...emp, schedules: [...emp.schedules] });
          }
        }
      }

      let merged = Array.from(empMap.values());
      const savedOrderStr = localStorage.getItem(SK_EMPLOYEE_ORDER);
      if (savedOrderStr) {
        try {
          const savedOrder = JSON.parse(savedOrderStr) as number[];
          merged.sort((a, b) => {
            const iA = savedOrder.indexOf(a.id);
            const iB = savedOrder.indexOf(b.id);
            if (iA !== -1 && iB !== -1) return iA - iB;
            if (iA !== -1) return -1;
            if (iB !== -1) return 1;
            return a.id - b.id;
          });
        } catch (e) {
          console.error("Error parsing saved order", e);
        }
      }

      setEmployees(merged);

      const todayMeta = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
      const primaryIdx = months.findIndex(m => m.year === todayMeta.year && m.month === todayMeta.month);
      if (primaryIdx !== -1) {
        setSummary(responses[primaryIdx].data.summary || []);
      } else if (responses.length > 0) {
        setSummary(responses[0].data.summary || []);
      }

      api.get<any>(`/api/leave-stats?year=${currentYear}`)
        .then(res => setYearLeaveStats(res.data ?? {}))
        .catch(() => {});
    } catch (err: any) {
      console.error("Error fetching schedules:", err);
      setError("스케줄 데이터를 불러오는 중에 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [currentYear]);

  // ── Cell Update ───────────────────────────────────────────────────────────
  const handleCellUpdate = useCallback(async (data: CellUpdateData) => {
    try {
      const emp = employees.find(e => e.id === data.employeeId);
      const prevSched = emp?.schedules.find(s => s.date === data.date);
      if (prevSched) {
        setUndoStack(prev => [
          { employeeId: data.employeeId, date: data.date, type: prevSched.type, workingHours: prevSched.workingHours, actualHours: prevSched.actualHours, memo: prevSched.memo ?? "" },
          ...prev.slice(0, 19),
        ]);
      }

      await api.put("/api/schedules", data);

      setEmployees(prev => prev.map(emp => {
        if (emp.id !== data.employeeId) return emp;
        const existing = [...emp.schedules];
        const idx = existing.findIndex(s => s.date === data.date);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], type: data.type, workingHours: data.workingHours, actualHours: data.actualHours, memo: data.memo };
        } else {
          existing.push({ employeeId: data.employeeId, date: data.date, type: data.type, workingHours: data.workingHours, actualHours: data.actualHours, memo: data.memo });
        }
        return { ...emp, schedules: existing };
      }));

      const primaryYear = new Date().getFullYear();
      const primaryMonth = new Date().getMonth() + 1;
      const summaryRes = await api.get<any>(`/api/schedules?year=${primaryYear}&month=${primaryMonth}`);
      setSummary(summaryRes.data.summary || []);

      showNotification(`${data.date.split("-").slice(1).join("/")} 스케줄이 성공적으로 변경되었습니다.`);
    } catch (err) {
      console.error("Failed to update cell schedule:", err);
      showNotification("스케줄 정보 저장에 실패했습니다.", "error");
    }
  }, [employees, showNotification]);

  // ── Undo ──────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const [prev, ...rest] = undoStack;
    setUndoStack(rest);
    try {
      await api.put("/api/schedules", prev);
      setEmployees(prevEmployees => prevEmployees.map(emp => {
        if (emp.id !== prev.employeeId) return emp;
        return { ...emp, schedules: emp.schedules.map(s => s.date === prev.date ? { ...s, ...prev } : s) };
      }));
      showNotification("마지막 변경을 되돌렸습니다.", "success");
    } catch {
      showNotification("되돌리기에 실패했습니다.", "error");
    }
  }, [undoStack, showNotification]);

  // ── Save Break ────────────────────────────────────────────────────────────
  const handleSaveBreak = useCallback(async (
    breakModal: {
      employeeId: number; date: string; scheduleId?: number;
      type: string; workingHours: string; actualHours: string; memo: string;
      lunchStart: string; lunchEnd: string; breakStart: string; breakEnd: string;
    },
    parseBreakMemo: (s: string) => { lunch?: string; break?: string; other?: string },
    onClose: () => void,
    setIsSaving: (v: boolean) => void
  ) => {
    setIsSaving(true);
    try {
      const existing = parseBreakMemo(breakModal.memo || "");
      const next: { lunch?: string; break?: string; other?: string } = { ...existing };
      const lunch = breakModal.lunchStart && breakModal.lunchEnd ? `${breakModal.lunchStart}-${breakModal.lunchEnd}` : "";
      const brk   = breakModal.breakStart && breakModal.breakEnd ? `${breakModal.breakStart}-${breakModal.breakEnd}` : "";
      if (lunch) next.lunch = lunch; else delete next.lunch;
      if (brk)  next.break = brk;   else delete next.break;

      let memoOut = "";
      if (next.lunch || next.break) memoOut = JSON.stringify(next);
      else if (next.other) memoOut = next.other;

      await api.put("/api/schedules", {
        employeeId: breakModal.employeeId,
        date: breakModal.date,
        type: breakModal.type || "휴무",
        workingHours: breakModal.workingHours || "",
        actualHours: breakModal.actualHours || "",
        memo: memoOut,
      });

      setEmployees(prev => prev.map(emp => {
        if (emp.id !== breakModal.employeeId) return emp;
        const idx = emp.schedules.findIndex(s => s.date === breakModal.date);
        const updatedSched: Schedule = {
          ...(idx >= 0 ? emp.schedules[idx] : {
            employeeId: breakModal.employeeId, date: breakModal.date,
            type: breakModal.type || "휴무", workingHours: breakModal.workingHours || "",
            actualHours: breakModal.actualHours || "",
          }),
          memo: memoOut,
        };
        const schedules = idx >= 0
          ? emp.schedules.map((s, i) => (i === idx ? updatedSched : s))
          : [...emp.schedules, updatedSched];
        return { ...emp, schedules };
      }));

      showNotification("점심/휴게 시간이 저장되었습니다.", "success");
      onClose();
    } catch (err) {
      console.error("Failed to save break/lunch:", err);
      showNotification("점심/휴게 시간 저장에 실패했습니다.", "error");
    } finally {
      setIsSaving(false);
    }
  }, [showNotification]);

  // ── Employee CRUD ─────────────────────────────────────────────────────────
  const handleAddEmployee = useCallback(async (
    empModalMode: "create" | "edit",
    selectedEmpForEdit: Employee | null,
    payload: {
      name: string; position: string; rank: string | null;
      employmentType: string; hireDate: string; retireDate: string | null;
      description: string; workplace: string; gender: string | null;
      phone: string | null; annual_leave_days: number | null; level: number;
      employee_number?: string | null;
    },
    empZoneNums: number[],
    empContractFile: File | null,
    applyZones: (empId: number, name: string) => void,
    onSuccess: () => void
  ) => {
    try {
      const uploadContract = async (empId: number) => {
        if (!empContractFile) return;
        try { await apiUploadContract(empId, empContractFile); }
        catch { showNotification("근로계약서 업로드 중 오류가 발생했습니다.", "error"); }
      };

      if (empModalMode === "edit" && selectedEmpForEdit) {
        if (!await confirm({ message: `${payload.name} 직원의 정보를 수정하시겠습니까?` })) return;
        await updateEmployeeFull(selectedEmpForEdit.id, payload);
        await uploadContract(selectedEmpForEdit.id);
        applyZones(selectedEmpForEdit.id, payload.name);
        showNotification(`${payload.name} 직원의 정보가 수정되었습니다.`);
      } else {
        const created = await createEmployee({ ...payload, employee_number: payload.employee_number ?? null });
        if (created?.id) { await uploadContract(created.id); applyZones(created.id, payload.name); }
        showNotification(`새 직원 ${payload.name}님이 등록되었습니다.`);
      }
      onSuccess();
    } catch (err: any) {
      console.error("Failed to solve employee form request:", err);
      const serverMsg = err?.response?.data?.error;
      const base = empModalMode === "edit" ? "직원 정보 수정 오류" : "직원 등록 오류";
      showNotification(serverMsg ? `${base}: ${serverMsg}` : `${base}가 발생했습니다.`, "error");
    }
  }, [confirm, showNotification]);

  const handleDeleteEmployee = useCallback(async (id: number, name: string) => {
    if (!await confirm({ message: `${name} 직원을 목록에서 삭제하시겠습니까? 등록된 모든 스케줄이 삭제됩니다.`, danger: true })) return;
    try {
      await apiDeleteEmployee(id);
      showNotification(`${name} 직원이 삭제되었습니다.`);
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error("Failed to delete employee:", err);
      showNotification("직원 삭제 도중 오류가 발생했습니다.", "error");
    }
  }, [confirm, showNotification]);

  const handleUpdateDescription = useCallback(async (id: number, tempDescription: string) => {
    const emp = employees.find(e => e.id === id);
    if (!emp || emp.description === tempDescription) return;
    try {
      await updateEmployee(emp, { description: tempDescription });
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, description: tempDescription } : e));
      showNotification(`${emp.name}님의 상세 설명이 수정되었습니다.`);
    } catch (err) {
      console.error("Failed to update employee description:", err);
      showNotification("상세 설명 수정에 실패했습니다.", "error");
    }
  }, [employees, showNotification]);

  const handleSetEmployeePassword = useCallback(async (
    selectedEmpForEdit: Employee | null,
    newEmpPassword: string,
    setIsSavingPassword: (v: boolean) => void,
    onSuccess: () => void
  ) => {
    if (!selectedEmpForEdit) return;
    if (!newEmpPassword || newEmpPassword.length < 4) {
      showNotification("비밀번호는 최소 4자 이상이어야 합니다.", "error");
      return;
    }
    setIsSavingPassword(true);
    try {
      await api.post<any>("/api/auth/set-password", { employeeId: selectedEmpForEdit.id, password: newEmpPassword });
      showNotification(`${selectedEmpForEdit.name}님의 비밀번호가 설정되었습니다.`, "success");
      onSuccess();
    } catch (err) {
      console.error("Failed to set password:", err);
      showNotification("비밀번호 설정에 실패했습니다.", "error");
    } finally {
      setIsSavingPassword(false);
    }
  }, [showNotification]);

  // ── Month Lock ────────────────────────────────────────────────────────────
  const loadMonthLock = useCallback(async () => {
    const key = `schedule_lock_${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    api.get<any>(`/api/settings?key=${key}`)
      .then(res => setIsMonthLocked(res.data?.value === true))
      .catch(() => setIsMonthLocked(false));
  }, [currentYear, currentMonth]);

  const handleToggleMonthLock = useCallback(async () => {
    const next = !isMonthLocked;
    const label = next ? "확정" : "확정해제";
    if (!await confirm({ message: `${currentYear}년 ${currentMonth}월 스케줄을 ${label}하시겠습니까?${next ? "\n확정 후에는 관리자도 수정할 수 없습니다." : ""}` })) return;
    setIsLockLoading(true);
    try {
      const key = `schedule_lock_${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      await api.post<any>("/api/settings", { key, value: next });
      setIsMonthLocked(next);
      showNotification(`${currentMonth}월 스케줄이 ${label}되었습니다.`);
    } catch {
      showNotification("처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsLockLoading(false);
    }
  }, [isMonthLocked, currentYear, currentMonth, confirm, showNotification]);

  // ── Copy Previous Month ───────────────────────────────────────────────────
  const executeCopyFromPreviousMonth = useCallback(async (
    copySchedules: boolean,
    copyDayAssignments: boolean,
    dateList: string[],
    onDone: () => void
  ) => {
    if (!copySchedules && !copyDayAssignments) {
      showNotification("복사할 항목을 하나 이상 선택하세요.", "error");
      return;
    }
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear  = currentMonth === 1 ? currentYear - 1 : currentYear;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    const currentMonthHasSchedules = employees.some(emp =>
      emp.schedules?.some(s => s.date.startsWith(monthPrefix) && s.type.trim() !== "")
    );

    let curDayHasData = false;
    if (copyDayAssignments) {
      try {
        const daysInCur = new Date(currentYear, currentMonth, 0).getDate();
        for (let d = 1; d <= daysInCur; d++) {
          const dateStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
          const r = await api.get<any>(`/api/zone-day/${dateStr}`);
          if (r.data && !r.data._empty && (
            Object.keys(r.data.zone_slots ?? {}).length > 0 ||
            Object.keys(r.data.lunch_slots ?? {}).length > 0 ||
            Object.keys(r.data.rest_slots ?? {}).length > 0
          )) { curDayHasData = true; break; }
        }
      } catch { /* skip */ }
    }

    const needsScheduleOverwrite = copySchedules && currentMonthHasSchedules;
    const needsDayOverwrite = copyDayAssignments && curDayHasData;
    if (needsScheduleOverwrite || needsDayOverwrite) {
      const parts: string[] = [];
      if (needsScheduleOverwrite) parts.push("월별 스케쥴");
      if (needsDayOverwrite)      parts.push("일별 근무설정");
      if (!await confirm({ message: `${currentMonth}월에 이미 ${parts.join(" / ")} 데이터가 있습니다.\n${prevYear}년 ${prevMonth}월 데이터로 덮어쓰시겠습니까?` })) return;
      if (!await confirm({ message: `정말 덮어쓰시겠습니까?\n현재 ${currentMonth}월 ${parts.join(" / ")}이(가) 교체됩니다.`, danger: true })) return;
    }

    setIsCopying(true);
    onDone(); // close modal
    try {
      const msgs: string[] = [];
      if (copySchedules) {
        const response = await api.post<any>("/api/schedules/copy", { targetYear: currentYear, targetMonth: currentMonth });
        msgs.push(`월별 스케쥴 ${response.data.count || 0}건`);
      }
      if (copyDayAssignments) {
        const r = await api.post<any>("/api/zone-day/copy-month", {
          targetYear: currentYear, targetMonth: currentMonth, overwrite: needsDayOverwrite || true,
        });
        msgs.push(`일별 근무설정 ${r.data.count || 0}건`);
      }
      showNotification(`복사 완료 — ${msgs.join(" · ")}`);
      await fetchScheduleData(dateList, true);
    } catch (err: any) {
      console.error("Failed to copy:", err);
      showNotification("전월 복사 도중 오류가 발생했습니다.", "error");
    } finally {
      setIsCopying(false);
    }
  }, [currentYear, currentMonth, employees, confirm, showNotification, fetchScheduleData]);

  // ── Apply Shift Hours ─────────────────────────────────────────────────────
  const applyShiftHoursToAll = useCallback(async (
    getTypeHoursMapFn: (pos: string, empType: string) => Record<string, string>,
    dateList: string[]
  ) => {
    const monthStr = String(currentMonth).padStart(2, "0");
    const items: CellUpdateData[] = [];
    for (const emp of employees) {
      const hoursMap = getTypeHoursMapFn(emp.position, emp.employmentType);
      for (const sc of emp.schedules) {
        if (!sc.date.startsWith(`${currentYear}-${monthStr}`)) continue;
        const wh = hoursMap[sc.type];
        if (!wh) continue;
        items.push({ employeeId: emp.id, date: sc.date, type: sc.type, workingHours: wh, actualHours: sc.actualHours || "", memo: sc.memo || "" });
      }
    }
    if (items.length > 0) await api.post<any>("/api/schedules/batch", { items });
    await fetchScheduleData(dateList, true);
    showNotification("기본 근무시간이 현재 월 전체에 적용되었습니다.", "success");
  }, [currentYear, currentMonth, employees, showNotification, fetchScheduleData]);

  return {
    employees, setEmployees,
    summary, setSummary,
    isLoading, error,
    undoStack,
    yearLeaveStats, setYearLeaveStats,
    isMonthLocked, setIsMonthLocked,
    isLockLoading,
    isCopying,
    isInitialFetchRef,
    fetchScheduleData,
    handleCellUpdate,
    handleUndo,
    handleSaveBreak,
    handleAddEmployee,
    handleDeleteEmployee,
    handleUpdateDescription,
    handleSetEmployeePassword,
    loadMonthLock,
    handleToggleMonthLock,
    executeCopyFromPreviousMonth,
    applyShiftHoursToAll,
  };
}
