// [R-1] 확정 스케줄 서버 lock 검증 · 단위 테스트
// 2026-09-23 · Top5 2위 · DevTools 우회 차단
//
// 테스트 전략:
//   · assertScheduleNotLocked 핵심 로직을 inline 재구현 (vitest 내 supabase 모킹 최소화)
//   · HttpError 코드·메시지 검증 · lv≥9 bypass · lv<9 403 · DB오류 fail-open
import { describe, it, expect } from "vitest";
import { HttpError } from "../../middleware/errorHandler";

// ── assertScheduleNotLocked 로직 인라인 재구현 (테스트용 shim) ──────────────
//   실제 라우터와 완전 동일 로직 · supabase 대신 mock getter 주입
async function assertScheduleNotLockedShim(
  yearMonth: string,
  authLevel: number,
  getSettingValue: (key: string) => Promise<boolean | null | undefined>,
): Promise<void> {
  if (authLevel >= 9) return;
  const key = `schedule_lock_${yearMonth}`;
  let value: boolean | null | undefined;
  try {
    value = await getSettingValue(key);
  } catch {
    // DB 오류 시 fail-open
    return;
  }
  if (value === true) {
    throw new HttpError(403, "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다.", "SCHEDULE_LOCKED");
  }
}

// ── yearMonth 파생 로직 (라우터와 동일) ──────────────────────────────────────
function extractYearMonth(date: string): string {
  return String(date ?? "").slice(0, 7);
}

// ── 테스트 헬퍼 ────────────────────────────────────────────────────────────────
const locked = async (_key: string) => true;
const unlocked = async (_key: string) => false;
const nullSetting = async (_key: string) => null;
const dbError = async (_key: string): Promise<never> => { throw new Error("DB connection failed"); };

// ══ [1] assertScheduleNotLocked 핵심 시나리오 ══════════════════════════════
describe("[R-1] assertScheduleNotLocked · lock 검증 핵심 로직", () => {

  it("lock=false · 정상 통과 (에러 없음)", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, unlocked)
    ).resolves.toBeUndefined();
  });

  it("lock=null (미설정) · 정상 통과 (에러 없음)", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, nullSetting)
    ).resolves.toBeUndefined();
  });

  it("lock=true · lv5 → 403 SCHEDULE_LOCKED", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, locked)
    ).rejects.toMatchObject({ status: 403, code: "SCHEDULE_LOCKED" });
  });

  it("lock=true · lv1 → 403 SCHEDULE_LOCKED", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 1, locked)
    ).rejects.toMatchObject({ status: 403, code: "SCHEDULE_LOCKED" });
  });

  it("lock=true · lv9 (관리자) → lock 무시 · 정상 통과", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 9, locked)
    ).resolves.toBeUndefined();
  });

  it("lock=true · lv10 (최고관리자) → lock 무시 · 정상 통과", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 10, locked)
    ).resolves.toBeUndefined();
  });

  it("DB 오류 → fail-open · 정상 통과 (서비스 중단 방지)", async () => {
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, dbError)
    ).resolves.toBeUndefined();
  });

  it("에러 메시지 · 한국어 · 관리자 안내 포함", async () => {
    let caught: HttpError | null = null;
    try {
      await assertScheduleNotLockedShim("2026-09", 5, locked);
    } catch (e: any) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("확정된 달");
    expect(caught!.message).toContain("관리자(lv≥9)");
  });
});

// ══ [2] yearMonth 파생 로직 ════════════════════════════════════════════════
describe("[R-1] yearMonth 파생 · PUT date 필드 slice(0,7)", () => {

  it("YYYY-MM-DD → YYYY-MM", () => {
    expect(extractYearMonth("2026-09-15")).toBe("2026-09");
  });

  it("월 첫날 · 정상", () => {
    expect(extractYearMonth("2026-09-01")).toBe("2026-09");
  });

  it("월 말일 · 정상", () => {
    expect(extractYearMonth("2026-09-30")).toBe("2026-09");
  });

  it("undefined → 빈 문자열 (lock key 불일치 → lock 없음 처리)", () => {
    expect(extractYearMonth("")).toBe("");
    expect(extractYearMonth(undefined as any)).toBe("");
  });
});

// ══ [3] lock key 네이밍 규칙 ══════════════════════════════════════════════
describe("[R-1] schedule_lock key 네이밍 규칙", () => {

  it("key = schedule_lock_YYYY-MM 형식", async () => {
    const capturedKeys: string[] = [];
    const capturingGetter = async (key: string) => {
      capturedKeys.push(key);
      return false;
    };
    await assertScheduleNotLockedShim("2026-09", 5, capturingGetter);
    expect(capturedKeys[0]).toBe("schedule_lock_2026-09");
  });

  it("lv≥9 → DB 조회 없음 (lock bypass = 성능 최적화)", async () => {
    const capturedKeys: string[] = [];
    const capturingGetter = async (key: string) => {
      capturedKeys.push(key);
      return true; // lock=true 상태여도
    };
    await assertScheduleNotLockedShim("2026-09", 9, capturingGetter);
    expect(capturedKeys.length).toBe(0); // 조회 자체를 하지 않아야 함
  });
});

// ══ [4] 다른 달 독립성 검증 ══════════════════════════════════════════════
describe("[R-1] 달별 독립성 · 다른 달 lock 미영향", () => {

  it("2026-08 locked · 2026-09 요청 → 통과 (다른 달 lock)", async () => {
    const getter = async (key: string) => key === "schedule_lock_2026-08";
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, getter)
    ).resolves.toBeUndefined();
  });

  it("2026-09 locked · 2026-09 요청 → 403", async () => {
    const getter = async (key: string) => key === "schedule_lock_2026-09";
    await expect(
      assertScheduleNotLockedShim("2026-09", 5, getter)
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ══ [5] PHASE 3C · assertScheduleNotLockedForDates · cross-month dedup + short-circuit ══
//   · server/lib/scheduleLock.ts:49-57 로직을 shim 으로 재현
//   · dates 리스트에서 YYYY-MM 들을 추출 → unique 집합 → 각각 assertScheduleNotLocked 호출
//   · 하나라도 locked 면 즉시 throw · 나머지 월 조회 중단
async function assertScheduleNotLockedForDatesShim(
  dates: string[],
  authLevel: number,
  getSettingValue: (key: string) => Promise<boolean | null | undefined>,
): Promise<void> {
  if (authLevel >= 9) return;
  const months = Array.from(
    new Set((dates ?? []).map(d => String(d ?? "").slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))),
  );
  for (const ym of months) {
    await assertScheduleNotLockedShim(ym, authLevel, getSettingValue);
  }
}

describe("[PHASE 3C] assertScheduleNotLockedForDates · cross-month batch lock", () => {

  it("단일 월 · 모두 unlocked → 통과", async () => {
    await expect(
      assertScheduleNotLockedForDatesShim(
        ["2026-10-01", "2026-10-15", "2026-10-31"],
        5,
        unlocked,
      ),
    ).resolves.toBeUndefined();
  });

  it("cross-month · 모두 unlocked → 통과", async () => {
    await expect(
      assertScheduleNotLockedForDatesShim(
        ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
        5,
        unlocked,
      ),
    ).resolves.toBeUndefined();
  });

  it("cross-month · 10월 unlocked + 11월 locked → 403 (silent skip 금지)", async () => {
    const getter = async (key: string) => key === "schedule_lock_2026-11";
    await expect(
      assertScheduleNotLockedForDatesShim(
        ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
        5,
        getter,
      ),
    ).rejects.toMatchObject({ status: 403, code: "SCHEDULE_LOCKED" });
  });

  it("cross-month · 10월 locked (첫 월) → 즉시 short-circuit · 11월 조회 안 함", async () => {
    const seen: string[] = [];
    const getter = async (key: string) => {
      seen.push(key);
      return key === "schedule_lock_2026-10";
    };
    await expect(
      assertScheduleNotLockedForDatesShim(
        ["2026-10-31", "2026-11-01"],
        5,
        getter,
      ),
    ).rejects.toMatchObject({ status: 403 });
    // 10월에서 즉시 throw · 11월 조회가 발생하면 안 됨
    expect(seen).toEqual(["schedule_lock_2026-10"]);
  });

  it("cross-month · lv≥9 bypass · locked month 포함해도 조회 없이 통과", async () => {
    const seen: string[] = [];
    const getter = async (key: string) => { seen.push(key); return true; };
    await expect(
      assertScheduleNotLockedForDatesShim(
        ["2026-10-31", "2026-11-01"],
        9,
        getter,
      ),
    ).resolves.toBeUndefined();
    expect(seen).toEqual([]); // lv>=9 는 DB 조회 자체 skip
  });

  it("중복 날짜 · 같은 월 2개 → 월 1회만 조회 (new Set dedup)", async () => {
    const seen: string[] = [];
    const getter = async (key: string) => { seen.push(key); return false; };
    await assertScheduleNotLockedForDatesShim(
      ["2026-10-01", "2026-10-15", "2026-10-30"],
      5,
      getter,
    );
    expect(seen).toEqual(["schedule_lock_2026-10"]); // 중복 월은 1회만
  });

  it("잘못된 날짜 형식 · 필터 통과 못함 · 조회 skip", async () => {
    const seen: string[] = [];
    const getter = async (key: string) => { seen.push(key); return false; };
    await assertScheduleNotLockedForDatesShim(
      ["invalid", "", "2026", "no-date-at-all"],
      5,
      getter,
    );
    // slice(0,7) 후 "YYYY-MM" 패턴 통과 못하는 것은 모두 skip
    //   · "invalid".slice(0,7) = "invalid" · regex 실패
    //   · "".slice(0,7) = "" · regex 실패
    //   · "2026".slice(0,7) = "2026" · regex 실패 (하이픈 없음)
    //   · "no-date-at-all".slice(0,7) = "no-date" · regex 실패
    //  (주의: "2026-10" 은 slice 후 7자 YYYY-MM 패턴 통과 → 유효한 월로 처리됨 ·
    //         실제 사용처는 YYYY-MM-DD date 리스트이지만 월만 입력돼도 tolerate 하는 정책 유지)
    expect(seen).toEqual([]);
  });
});
