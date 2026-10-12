// server/routes/settings/holidays.ts
// 2026-09-18 · 사용자 지시 · C · 공휴일 API 연동 · data.go.kr 특일정보 → events 자동 동기
//   · GET  /api/holidays?year=YYYY          · 특일정보 API 호출 · JSON 변환 · in-memory 캐시 (연 단위 · TTL 24h)
//   · POST /api/holidays/sync?year=YYYY     · 관리자 (level≥9) · 지정 연도 공휴일 → events 테이블 upsert
//
// 데이터소스:
//   · 한국천문연구원 특일 정보 (data.go.kr B090041/SpcdeInfoService/getRestDeInfo)
//   · 파라미터 · serviceKey · solYear · solMonth · _type=json · numOfRows=50
//   · 응답 · response.body.items.item[] · { locdate:20260929, dateName:"설날", isHoliday:"Y" }
//
// 동기 정책:
//   · events 테이블 · type='holiday' · recurring=true
//   · 같은 name 의 연속된 date 들은 하나의 event 로 병합 (start_date = 첫 날 · end_date = 마지막 날)
//     · 예 · "설날" 2/16·2/17·2/18 → start=02-16 · end=02-18 (하나의 event row)
//     · 예 · "대체공휴일(삼일절)" 1일 → start=end=03-02
//   · unique key · (type='holiday', name) · 코드 단 확인 (실제 SQL UNIQUE 없음)
//   · 이미 있으면 · dates 가 이미 오늘 이후 (미래) 이면 skip · 과거이면 UPDATE (더 최신 date 로 갱신)
//   · 없으면 · INSERT
//   · 여러 해를 순차 sync 하면 · 오늘 이후 가장 가까운 date 만 최종 유지 (오래된 해 date 로 덮어쓰지 않음)
//   · 응답 · { ok, synced, created, updated, skipped }

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { badRequest, HttpError } from "../../middleware/errorHandler";
import logger from "../../lib/logger";

const router = Router();

interface Holiday {
  date: string;         // "YYYY-MM-DD"
  name: string;         // "설날" · "추석" 등
  is_holiday: boolean;  // isHoliday === "Y"
}

// ─────────────────────────────────────────────────
// 2026-10-08 · 사용자 지시 · 캐시 완전 제거 · 매 요청 실시간 API 호출
//   · 과거 캐시로 인한 공휴일 누락 재발 방지
// ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────
// 특일정보 API 호출 (연 단위 · 2026-10-08 · fix · month 반복 → year 1회 · 2개 엔드포인트 merge)
//   · getRestDeInfo (공휴일 + 대체공휴일 superset) + getHoliDeInfo (법정 15개 공휴일 보강)
//   · month-by-month 반복 시 특정 월 fetch 실패 → 홀수 공휴일(예: 한글날) 누락 사례 fix
//   · numOfRows=100 (연 전체 수용 · 대체공휴일 포함 최대 20여개)
//   · 2026-10-08 · 캐시 완전 제거 · 매 호출 실시간 조회
// ─────────────────────────────────────────────────
async function fetchHolidays(year: number): Promise<Holiday[]> {
  const apiKey = process.env.HOLIDAY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new HttpError(500, "HOLIDAY_API_KEY 환경변수 미설정 · .env 파일 확인 필요", "ENV_MISSING");
  }

  // 2개 엔드포인트 (getRestDeInfo 우선 · getHoliDeInfo 보강) · year 단위 1회 호출
  const endpoints = ["getRestDeInfo", "getHoliDeInfo"] as const;
  const byDate = new Map<string, Holiday>(); // date → Holiday (중복 제거 · 첫 매치 우선)

  for (const ep of endpoints) {
    const url =
      `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/${ep}` +
      `?serviceKey=${encodeURIComponent(apiKey)}` +
      `&solYear=${year}` +
      `&_type=json&numOfRows=100`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        logger.warn(`[holidays] ${ep} fetch fail · year=${year} · status=${resp.status}`);
        continue;
      }
      const json: any = await resp.json();
      const items = json?.response?.body?.items?.item;
      const list: any[] = Array.isArray(items) ? items : items ? [items] : [];
      for (const it of list) {
        const locdate = String(it?.locdate ?? "");
        if (locdate.length !== 8) continue;
        const date = `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
        const name = String(it?.dateName ?? "").trim();
        if (!name) continue;
        // getHoliDeInfo 는 모두 공휴일 (isHoliday 필드 없거나 Y)
        // getRestDeInfo 는 isHoliday 명시 (Y/N) · N 포함할 수 있음 (예: 기념일)
        const isHoliday = ep === "getHoliDeInfo" ? true : String(it?.isHoliday ?? "N") === "Y";
        if (!byDate.has(date)) {
          byDate.set(date, { date, name, is_holiday: isHoliday });
        } else if (isHoliday && !byDate.get(date)!.is_holiday) {
          // 보강 endpoint 가 is_holiday=true 로 승격 (예: 기념일 → 공휴일 승격)
          byDate.set(date, { date, name, is_holiday: true });
        }
      }
      logger.info(`[holidays] ${ep} year=${year} · items=${list.length}`);
    } catch (e: any) {
      logger.warn(`[holidays] ${ep} fetch error · year=${year} · ${e?.message ?? e}`);
    }
  }

  const holidays = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  // 2026-10-08 · 사용자 지시 · 캐시 저장 제거 (실시간 조회만)
  logger.info(`[holidays] year=${year} · total=${holidays.length} · public=${holidays.filter(h => h.is_holiday).length}`);
  return holidays;
}

// ═══════════════════════════════════════════════════════════
// GET /api/holidays?year=2026 · 공휴일 조회 (캐시 우선)
//   · year 미지정 · 올해
//   · 응답 · [{ date, name, is_holiday }, ...]
// ═══════════════════════════════════════════════════════════
router.get("/api/holidays", asyncHandler(async (req, res) => {
  const yearRaw = String(req.query.year ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    throw badRequest("year 파라미터 유효하지 않음 (1900~2100)");
  }
  // 2026-10-08 · 사용자 지시 · 캐시 완전 제거 · 실시간 조회 · no-store 헤더
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const holidays = await fetchHolidays(year);
  res.json({ year, holidays });
}));

// ═══════════════════════════════════════════════════════════
// POST /api/holidays/sync?year=2026 · 공휴일 → events 자동 동기 (관리자 lv≥9)
//   · 지정 연도 공휴일 fetch → events upsert
//   · type='holiday' · recurring=true · dates=locdate
//   · 이미 있으면 (동일 name + type='holiday') · dates 만 UPDATE
//   · 없으면 INSERT
//   · 응답 · { ok, year, synced, created, updated, skipped, errors }
// ═══════════════════════════════════════════════════════════
router.post("/api/holidays/sync", authorize(9), asyncHandler(async (req, res) => {
  const yearRaw = String(req.query.year ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    throw badRequest("year 파라미터 유효하지 않음 (1900~2100)");
  }

  // 1) API fetch
  const holidays = await fetchHolidays(year);
  // is_holiday=true 만 events 동기 (공휴일 아닌 기념일 · 예: 어버이날 · 스킵)
  const holidayItems = holidays.filter(h => h.is_holiday);

  // 2) 같은 name 의 연속된 날짜들 병합 (설날 3일 → 하나의 event range)
  //    · 정렬 · 같은 name 그룹핑 · 연속 여부 (하루 차이) 판정
  const sorted = [...holidayItems].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.date.localeCompare(b.date);
  });

  interface HolidayRange { name: string; start_date: string; end_date: string; }
  const ranges: HolidayRange[] = [];
  for (const h of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.name === h.name) {
      // 연속 여부 · end_date + 1일 === h.date ?
      const [ly, lm, ld] = last.end_date.split("-").map(Number);
      const lastDate = new Date(Date.UTC(ly, lm - 1, ld));
      const nextDay = new Date(lastDate.getTime() + 86400000);
      const nextYmd = nextDay.toISOString().slice(0, 10);
      if (nextYmd === h.date) {
        last.end_date = h.date;
        continue;
      }
    }
    ranges.push({ name: h.name, start_date: h.date, end_date: h.date });
  }
  const targets = ranges;

  // 3) 기존 holiday events 조회 (name 기반 매칭)
  const { data: existing, error: eErr } = await supabase
    .from("events")
    .select("id, name, type, start_date, end_date, recurring")
    .eq("type", "holiday");
  if (eErr) throw new HttpError(500, eErr.message, "DB_ERROR");

  // name → 첫 매칭 event (같은 이름이 여러 개면 첫 번째 사용 · id 오름차순)
  const byName = new Map<string, any>();
  const rows = (existing ?? []).slice().sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));
  for (const r of rows) {
    const key = String(r.name ?? "").trim();
    if (key && !byName.has(key)) byName.set(key, r);
  }

  // 4) upsert · INSERT 또는 UPDATE (range 단위)
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { name: string; date: string; error: string }[] = [];

  const todayYmd = new Date().toISOString().slice(0, 10);

  for (const r of targets) {
    const existingRow = byName.get(r.name);
    if (existingRow) {
      // 이미 존재
      //   · 기존 end_date 가 오늘 이후 (미래) 이고 새 dates 가 그보다 늦으면 · skip
      //     (더 오래된 미래 date 유지 · 예: 이미 2026-02 저장돼 있는데 2027-02 로 덮어쓰지 않음)
      //   · 기존 end_date 가 과거이면 · UPDATE (지난 공휴일 → 새 연도 date 로 갱신)
      //   · dates 완전 동일 + recurring=true 이면 · skip
      const sameDates =
        existingRow.start_date === r.start_date &&
        existingRow.end_date === r.end_date;
      const recurringOk = existingRow.recurring === true;
      if (sameDates && recurringOk) {
        skipped++;
        continue;
      }
      const existingIsFuture = String(existingRow.end_date ?? "") >= todayYmd;
      const newIsLater = String(r.start_date) > String(existingRow.start_date ?? "");
      if (existingIsFuture && newIsLater && recurringOk) {
        // 기존이 이미 미래 date · 새 것이 더 늦은 미래 → skip (오래된 미래 date 우선)
        skipped++;
        continue;
      }
      const { error: uErr } = await supabase
        .from("events")
        .update({
          start_date: r.start_date,
          end_date: r.end_date,
          recurring: true,
        })
        .eq("id", existingRow.id);
      if (uErr) {
        logger.warn(`[holidays/sync] update fail · id=${existingRow.id} name=${r.name} · ${uErr.message}`);
        errors.push({ name: r.name, date: r.start_date, error: uErr.message });
        continue;
      }
      updated++;
    } else {
      // 신규 · INSERT
      const { data: ins, error: iErr } = await supabase
        .from("events")
        .insert({
          name: r.name,
          type: "holiday",
          start_date: r.start_date,
          end_date: r.end_date,
          recurring: true,
        })
        .select()
        .single();
      if (iErr) {
        logger.warn(`[holidays/sync] insert fail · name=${r.name} date=${r.start_date} · ${iErr.message}`);
        errors.push({ name: r.name, date: r.start_date, error: iErr.message });
        continue;
      }
      // 새로 생성된 row 도 byName 등록 (동일 연도 재실행 시 skip)
      if (ins) byName.set(r.name, ins);
      created++;
    }
  }

  const synced = created + updated;
  logger.info(`[holidays/sync] year=${year} · ranges=${targets.length} · created=${created} · updated=${updated} · skipped=${skipped} · errors=${errors.length}`);

  res.json({
    ok: true,
    year,
    total: targets.length,
    synced,
    created,
    updated,
    skipped,
    errors,
  });
}));

export default router;
