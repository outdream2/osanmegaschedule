// src/components/DisplayPage/DisplayPage.types.ts
// 2026-08-22 · Framework Phase 4 · DisplayPage 대형 파일 분리 · types 이관
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";

// ─── DisplayPage 서브탭 key ─────────────────────────────────────────────
export type DpSubTabKey =
  | "purchase-order"
  | "purchase"
  | "payment"
  | "statistics"
  | "return"          // 2026-08-25 · 사용자 지시 · 반품 (신규)
  | "stock-arrivals"
  | "store"
  | "vendor-manage";

// ─── DisplayPage props ─────────────────────────────────────────────────
export interface DisplayPageProps {
  onBack: () => void;
  onOpenEmployeeEdit?: (employeeId: number) => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── 진열 요청 · 스케줄 · 직원 · 팝오버 ────────────────────────────────
export interface DisplayRequest {
  id: string;
  zoneId: string;
  zoneLabel: string;
  category: string;
  requestedAt: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: "pending" | "done";
  note: string;
}

export interface ScheduleEntry {
  date: string;
  type: string;
  workingHours?: string;
}

export interface Employee {
  id: number;
  name: string;
  position: string;
  schedules?: ScheduleEntry[];
}

export interface TodayStaff {
  employee: Employee;
  scheduleType: string;
  workingHours: string;
}

// ─── Popover anchor ────────────────────────────────────────────────────
export interface PopoverAnchor {
  zoneId: string;
  rect: DOMRect;
}
