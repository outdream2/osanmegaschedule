// 2026-08-16 · 서버·클라 공유 · 예약 응답 DTO
export interface Reservation {
  time: string;
  note: string;
  purpose: string;
  company: string;
  contact_name: string;
  phone: string;
  vendor_id: number | null;
}

/** GET /api/reservations?date=YYYY-MM-DD · 배열 직접 반환 */
export type ReservationsListResponse = Reservation[];
