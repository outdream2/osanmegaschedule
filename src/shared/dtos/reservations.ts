// 2026-08-16 · 서버·클라 공유 · 예약 응답 DTO
// 2026-10-06 · #VisitorReservationEmployeeAssignment · assigned_employee_id + snapshot 추가
export interface Reservation {
  id?: number;
  date?: string;
  time: string;
  note: string;
  purpose: string;
  company: string;
  contact_name: string;
  phone: string;
  vendor_id: number | null;
  /** 2026-10-06 · 담당자 (employees.id) · legacy row 는 null */
  assigned_employee_id?: number | null;
  /** 2026-10-06 · 저장 시점 담당자 이름 snapshot · 직원명 변경 후에도 영수증·이력 안정 */
  employee_name_snapshot?: string | null;
}

/** GET /api/reservations?date=YYYY-MM-DD · 배열 직접 반환 */
export type ReservationsListResponse = Reservation[];
