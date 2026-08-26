// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

// 2026-08-26 · 사용자 지시 · 예약 대상 · 부장 제외 · 대표 · 이사만
//   · env STAFF_IDS 없으면 · employees 테이블에서 rank IN ('대표','이사') 동적 조회
const RESERVATION_RANKS = ["대표", "이사"] as const;
const OFF_TYPES = ["휴무", "월차", "지정휴무", "오전반차", "오후반차"];

/** 예약 대상 스탭 목록 · env STAFF_IDS 우선 · 없으면 DB 조회 · rank 로 매칭 · 이름은 실제 employees.name (강남성/강남규) */
async function loadReservationStaffList(): Promise<Array<{ id: number; name: string; rank: string }>> {
  const envRaw = process.env.STAFF_IDS;
  if (envRaw) {
    const parsed = envRaw.split(",").map(e => {
      const [id, rank] = e.split(":");
      return { id: parseInt((id ?? "").trim()), name: (rank ?? "").trim(), rank: (rank ?? "").trim() };
    }).filter(s => !isNaN(s.id) && s.id > 0 && RESERVATION_RANKS.includes(s.rank as any));
    if (parsed.length > 0) return parsed;
  }
  // DB fallback · rank 로 조회 · 이름 정렬 · 최대 각 rank 1명 (대표 1명 · 이사 1명 우선)
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, rank, resigned_at")
    .in("rank", RESERVATION_RANKS as unknown as string[])
    .is("resigned_at", null);
  if (error) return [];
  const rows = (data ?? []) as Array<{ id: number; name: string; rank: string }>;
  // 순서 · 대표 먼저 · 이사 다음
  return rows.sort((a, b) => {
    const ai = RESERVATION_RANKS.indexOf(a.rank as any);
    const bi = RESERVATION_RANKS.indexOf(b.rank as any);
    return ai - bi;
  });
}

router.get("/api/staff-availability", asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date query param required");
  const staffList = await loadReservationStaffList();
  if (staffList.length === 0) { res.json([]); return; }
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, type")
    .eq("date", date)
    .in("employeeId", staffList.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result = staffList.map(({ id, name, rank }) => {
    const row = (data ?? []).find((r: any) => r.employeeId === id);
    const scheduleType: string | null = row?.type ?? null;
    return {
      employeeId: id,
      name: rank,          // 클라이언트 컬럼 헤더용 · "대표" / "이사"
      displayName: name,   // 실제 사람 이름 · 강남성 · 강남규
      scheduleType,
      isOff: scheduleType ? OFF_TYPES.includes(scheduleType) : false,
    };
  });
  res.json(result);
}));

router.get("/api/staff-monthly", asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) throw badRequest("year and month required");
  const staffList = await loadReservationStaffList();
  if (staffList.length === 0) { res.json({}); return; }
  const monthStr = String(month).padStart(2, "0");
  const datePrefix = `${year}-${monthStr}-`;
  const { data, error } = await supabase
    .from("schedules")
    .select("employeeId, date, type")
    .like("date", `${datePrefix}%`)
    .in("employeeId", staffList.map(s => s.id));
  if (error) throw new HttpError(500, error.message);
  const result: Record<string, string[]> = {};
  for (const row of (data ?? [])) {
    if (!OFF_TYPES.includes(row.type)) continue;
    const staff = staffList.find(s => s.id === row.employeeId);
    if (!staff) continue;
    if (!result[row.date]) result[row.date] = [];
    result[row.date].push(staff.rank); // 대표 / 이사
  }
  res.json(result);
}));

export default router;
