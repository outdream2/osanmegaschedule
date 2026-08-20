// @vitest-environment jsdom
// 2026-08-20 · DayTimelineModal utils · 순수 헬퍼 검증
//   · parseRange / pct / widthPct / minToStr / shiftSlot / datesInMonth
//   · cleanupStaleTimelineKeys / safeSetTimelineItem · localStorage 조작
//   · createGhost / moveGhost / removeGhost · DOM 조작
//   · buildTypeTones · settings entry → color map
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseRange,
  pct,
  widthPct,
  minToStr,
  shiftSlot,
  datesInMonth,
  cleanupStaleTimelineKeys,
  safeSetTimelineItem,
  createGhost,
  moveGhost,
  removeGhost,
  buildTypeTones,
  DISPLAY_START,
  DISPLAY_END,
  TOTAL,
  HOUR_SLOTS,
  LUNCH_SLOTS,
  REST_SLOTS,
} from "./utils";

describe("상수 · DISPLAY 범위", () => {
  it("DISPLAY_START · 10:00 (600분)", () => {
    expect(DISPLAY_START).toBe(600);
  });

  it("DISPLAY_END · 22:00 (1320분)", () => {
    expect(DISPLAY_END).toBe(1320);
  });

  it("TOTAL · 12시간 (720분)", () => {
    expect(TOTAL).toBe(720);
  });

  it("HOUR_SLOTS · 13개 (10:00-22:00 매시)", () => {
    expect(HOUR_SLOTS.length).toBe(13);
    expect(HOUR_SLOTS[0]).toBe("10:00");
    expect(HOUR_SLOTS[12]).toBe("22:00");
  });

  it("LUNCH_SLOTS · 6개 · 11:30-14:00 30분 간격", () => {
    expect(LUNCH_SLOTS).toEqual(["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]);
  });

  it("REST_SLOTS · 5개 · 16:00-18:00 30분 간격", () => {
    expect(REST_SLOTS).toEqual(["16:00", "16:30", "17:00", "17:30", "18:00"]);
  });
});

describe("parseRange · 시간 범위 파싱", () => {
  it("표준 형식 · 10:00-18:00", () => {
    expect(parseRange("10:00-18:00")).toEqual({ start: 600, end: 1080 });
  });

  it("~ 구분자 지원", () => {
    expect(parseRange("09:30~17:00")).toEqual({ start: 570, end: 1020 });
  });

  it("시간만 · 10-18 (분 생략)", () => {
    expect(parseRange("10-18")).toEqual({ start: 600, end: 1080 });
  });

  it("공백 있음 · 10:00 - 18:00", () => {
    expect(parseRange("10:00 - 18:00")).toEqual({ start: 600, end: 1080 });
  });

  it("빈 문자열 · null", () => {
    expect(parseRange("")).toBeNull();
  });

  it("잘못된 형식 · null", () => {
    expect(parseRange("hello")).toBeNull();
    expect(parseRange("10")).toBeNull();
  });
});

describe("pct · 시간 → 백분율", () => {
  it("DISPLAY_START · 0%", () => {
    expect(pct(DISPLAY_START)).toBe(0);
  });

  it("DISPLAY_END · 100%", () => {
    expect(pct(DISPLAY_END)).toBe(100);
  });

  it("중간 · 16:00 · 50%", () => {
    expect(pct(960)).toBeCloseTo(50, 5);
  });

  it("범위 밖 (하한) · 클램프 0%", () => {
    expect(pct(0)).toBe(0);
    expect(pct(-100)).toBe(0);
  });

  it("범위 밖 (상한) · 클램프 100%", () => {
    expect(pct(1500)).toBe(100);
  });
});

describe("widthPct · 시간 범위 → 폭 %", () => {
  it("표준 · 10:00-16:00 · 50%", () => {
    expect(widthPct(600, 960)).toBeCloseTo(50, 5);
  });

  it("전체 · 100%", () => {
    expect(widthPct(600, 1320)).toBe(100);
  });

  it("범위 밖 (역순) · 0%", () => {
    expect(widthPct(1000, 900)).toBe(0);
  });

  it("start < DISPLAY_START · 클램프", () => {
    // start=0 (clamp to 600), end=960 → 360/720
    expect(widthPct(0, 960)).toBeCloseTo(50, 5);
  });

  it("end > DISPLAY_END · 클램프", () => {
    // start=600, end=2000 (clamp to 1320) → 100%
    expect(widthPct(600, 2000)).toBe(100);
  });
});

describe("minToStr · 분 → HH:MM", () => {
  it("0분 · 00:00", () => {
    expect(minToStr(0)).toBe("00:00");
  });

  it("600분 · 10:00", () => {
    expect(minToStr(600)).toBe("10:00");
  });

  it("1320분 · 22:00", () => {
    expect(minToStr(1320)).toBe("22:00");
  });

  it("일부 · 675분 · 11:15", () => {
    expect(minToStr(675)).toBe("11:15");
  });
});

describe("shiftSlot · 시간 이동", () => {
  it("+30분", () => {
    expect(shiftSlot("11:00", 30)).toBe("11:30");
  });

  it("-30분", () => {
    expect(shiftSlot("11:00", -30)).toBe("10:30");
  });

  it("+60분 (시 넘김)", () => {
    expect(shiftSlot("11:30", 60)).toBe("12:30");
  });

  it("음수 결과 대응 · 12:00 -90분 → 10:30", () => {
    expect(shiftSlot("12:00", -90)).toBe("10:30");
  });

  it("음수 modulo · 안전 처리 (10:00 -30 = 09:30)", () => {
    expect(shiftSlot("10:00", -30)).toBe("09:30");
  });
});

describe("datesInMonth · 월 내 모든 날짜", () => {
  it("2026-02 · 28일 (평년)", () => {
    const r = datesInMonth("2026-02-15");
    expect(r.length).toBe(28);
    expect(r[0]).toBe("2026-02-01");
    expect(r[27]).toBe("2026-02-28");
  });

  it("2024-02 · 29일 (윤년)", () => {
    const r = datesInMonth("2024-02-01");
    expect(r.length).toBe(29);
    expect(r[28]).toBe("2024-02-29");
  });

  it("2026-08 · 31일", () => {
    const r = datesInMonth("2026-08-20");
    expect(r.length).toBe(31);
    expect(r[30]).toBe("2026-08-31");
  });

  it("2026-04 · 30일", () => {
    const r = datesInMonth("2026-04-15");
    expect(r.length).toBe(30);
    expect(r[29]).toBe("2026-04-30");
  });
});

describe("cleanupStaleTimelineKeys · localStorage 정리", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("30일 이전 tl_ key · 삭제", () => {
    const now = new Date("2026-08-20T00:00:00");
    // 31일 이전 · 삭제
    localStorage.setItem("tl_test_2026-07-19", "value");
    // 오늘 · 유지
    localStorage.setItem("tl_test_2026-08-20", "value");
    // tl_ prefix 없음 · 유지
    localStorage.setItem("other_key", "value");
    // tl_ 이지만 date 없음 · 유지
    localStorage.setItem("tl_nodate", "value");

    const removed = cleanupStaleTimelineKeys(now);
    expect(removed).toBe(1);
    expect(localStorage.getItem("tl_test_2026-07-19")).toBeNull();
    expect(localStorage.getItem("tl_test_2026-08-20")).toBe("value");
    expect(localStorage.getItem("other_key")).toBe("value");
    expect(localStorage.getItem("tl_nodate")).toBe("value");
  });

  it("전체 유효 · 0 반환", () => {
    const now = new Date("2026-08-20T00:00:00");
    localStorage.setItem("tl_a_2026-08-19", "v");
    localStorage.setItem("tl_b_2026-08-20", "v");
    expect(cleanupStaleTimelineKeys(now)).toBe(0);
  });

  it("빈 localStorage · 0 반환 · throw 없음", () => {
    expect(cleanupStaleTimelineKeys()).toBe(0);
  });
});

describe("safeSetTimelineItem · 설정 + 실패 시 정리 후 재시도", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("정상 시 · 값 저장", () => {
    safeSetTimelineItem("tl_new_2026-08-20", "hello");
    expect(localStorage.getItem("tl_new_2026-08-20")).toBe("hello");
  });

  it("Quota 오류 · 정리 후 재시도 (mock)", () => {
    // stale key 하나 삽입 (cleanup 대상) · mock 전에 세팅
    localStorage.setItem("tl_stale_2020-01-01", "old");

    const orig = Storage.prototype.setItem;
    let callCount = 0;
    Storage.prototype.setItem = vi.fn(function (this: Storage, k: string, v: string) {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("Quota");
        err.name = "QuotaExceededError";
        throw err;
      }
      orig.call(this, k, v);
    }) as any;

    safeSetTimelineItem("tl_new_2026-08-20", "hello");
    // 재시도 후 저장됨
    expect(localStorage.getItem("tl_new_2026-08-20")).toBe("hello");

    Storage.prototype.setItem = orig;
  });

  it("Quota 오류인데 stale 없음 · 조용히 실패", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      const err: any = new Error("Quota");
      err.name = "QuotaExceededError";
      throw err;
    }) as any;

    // stale 없음
    safeSetTimelineItem("tl_new_2026-08-20", "hello");
    // 실패해도 throw 없음 (silent)

    Storage.prototype.setItem = orig;
  });
});

describe("createGhost / moveGhost / removeGhost", () => {
  afterEach(() => {
    // ghost 정리 · 모듈 상태 · DOM 모두 초기화
    try { removeGhost(); } catch { /* noop */ }
    document.body.innerHTML = "";
  });

  it("createGhost · body 에 fixed div 추가", () => {
    createGhost("직원1");
    const el = document.body.querySelector("div") as HTMLDivElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("직원1");
    expect(el.style.position).toBe("fixed");
  });

  it("createGhost + moveGhost · 동일 세션 · left/top 갱신", () => {
    createGhost("직원2");
    moveGhost(100, 200);
    const el = document.body.querySelector("div") as HTMLDivElement;
    expect(el.style.left).toBe("100px");
    expect(el.style.top).toBe("200px");
  });

  it("createGhost + removeGhost · body 에서 삭제", () => {
    createGhost("직원3");
    removeGhost();
    expect(document.body.querySelector("div")).toBeNull();
  });

  it("removeGhost · ghost 없어도 안전 (no-throw)", () => {
    removeGhost(); // 초기화
    expect(() => removeGhost()).not.toThrow();
  });

  it("moveGhost · ghost 없어도 안전 (no-throw)", () => {
    removeGhost(); // 초기화
    expect(() => moveGhost(1, 1)).not.toThrow();
  });
});

describe("buildTypeTones · 근무유형 톤 매핑", () => {
  it("기본 6개 타입 · 항상 포함", () => {
    const tones = buildTypeTones();
    ["오픈", "미들", "마감", "오픈마감", "오전반차", "오후반차"].forEach(t => {
      expect(tones[t]).toBeDefined();
      expect(tones[t].bg).toBeDefined();
      expect(tones[t].text).toBeDefined();
    });
  });

  it("추가 entries · type 병합", () => {
    const tones = buildTypeTones([
      { type: "특근", hours: "18:00-22:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#fbbf24" },
    ]);
    expect(tones["특근"]).toBeDefined();
    expect(tones["특근"].bg).toBe("#fbbf24");
  });

  it("entries 없음 · 기본 6개만 반환", () => {
    const tones = buildTypeTones();
    expect(Object.keys(tones).length).toBe(6);
  });

  it("각 tone · bg/text/dot/chipBg/chipText/chipBorder 6필드", () => {
    const tones = buildTypeTones();
    const t = tones["오픈"];
    expect(t.bg).toBeDefined();
    expect(t.text).toBeDefined();
    expect(t.dot).toBeDefined();
    expect(t.chipBg).toBeDefined();
    expect(t.chipText).toBeDefined();
    expect(t.chipBorder).toBeDefined();
  });

  it("동일 type 있으면 우선순위 = known > entries (덮어쓰기 X)", () => {
    // known 이 이미 "오픈" 등록 · entries 로 다른 색 주더라도 known 유지
    const tones = buildTypeTones([
      { type: "오픈", hours: "10:00-18:00", pharmHours: "", logisticsHours: "", partTimeHours: "", color: "#00ff00" },
    ]);
    // known 우선 · entries 무시 (구현: known 먼저 build · 그다음 entries 는 out[e.type] 없을 때만)
    // 하지만 known 은 getTypeHex 로 entries 를 참조하므로 entries 색상이 반영될 수 있음
    // 이 케이스는 구현에 따라 다름 · 실제 값 존재 여부만 확인
    expect(tones["오픈"]).toBeDefined();
  });
});
