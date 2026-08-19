// 2026-08-19 · permissions · deriveUserLevel/Position · canReadPage/canWritePage · pageKey/subTab
import { describe, it, expect } from "vitest";
import {
  deriveUserLevel,
  deriveUserPosition,
  canReadPage,
  canWritePage,
  canReadPageKey,
  canWritePageKey,
  getEffectivePerm,
  isAdminEssentialPage,
} from "./permissions";

describe("deriveUserLevel", () => {
  it("null · 0", () => {
    expect(deriveUserLevel(null)).toBe(0);
  });

  it("session.level 명시 · 그대로", () => {
    expect(deriveUserLevel({ level: 5 } as any)).toBe(5);
    expect(deriveUserLevel({ level: 9 } as any)).toBe(9);
  });

  it("session.role · superadmin/admin → 9", () => {
    expect(deriveUserLevel({ role: "superadmin" } as any)).toBe(9);
    expect(deriveUserLevel({ role: "admin" } as any)).toBe(9);
  });

  it("session.role · manager → 2", () => {
    expect(deriveUserLevel({ role: "manager" } as any)).toBe(2);
  });

  it("session.role · employee → 1", () => {
    expect(deriveUserLevel({ role: "employee" } as any)).toBe(1);
  });

  it("role/level 없음 · 0", () => {
    expect(deriveUserLevel({} as any)).toBe(0);
  });

  it("level 우선 (role 도 있어도)", () => {
    expect(deriveUserLevel({ level: 3, role: "admin" } as any)).toBe(3);
  });
});

describe("deriveUserPosition", () => {
  it("null · null", () => {
    expect(deriveUserPosition(null)).toBeNull();
  });

  it("position 명시 · 그대로", () => {
    expect(deriveUserPosition({ position: "약사" } as any)).toBe("약사");
  });

  it("position 없음 · null", () => {
    expect(deriveUserPosition({ level: 5 } as any)).toBeNull();
  });

  it("빈 문자열 · null", () => {
    expect(deriveUserPosition({ position: "" } as any)).toBeNull();
  });
});

describe("canReadPage · 레벨 판정", () => {
  it("perm undefined · false", () => {
    expect(canReadPage({ level: 9 } as any, undefined)).toBe(false);
  });

  it("level >= read · true", () => {
    expect(canReadPage({ level: 5 } as any, { read: 3, write: 5 })).toBe(true);
    expect(canReadPage({ level: 3 } as any, { read: 3, write: 5 })).toBe(true);
  });

  it("level < read · false", () => {
    expect(canReadPage({ level: 2 } as any, { read: 3, write: 5 })).toBe(false);
  });

  it("hidden=true · 모두 차단 (admin 포함)", () => {
    expect(canReadPage({ level: 9 } as any, { read: 0, write: 0, hidden: true })).toBe(false);
  });
});

describe("canReadPage · 직군 판정 (readPositions)", () => {
  it("level 미달 + 직군 포함 · true", () => {
    const session = { level: 1, position: "약사" } as any;
    expect(canReadPage(session, { read: 5, write: 5, readPositions: ["약사"] })).toBe(true);
  });

  it("level 미달 + 직군 미포함 · false", () => {
    const session = { level: 1, position: "매장" } as any;
    expect(canReadPage(session, { read: 5, write: 5, readPositions: ["약사"] })).toBe(false);
  });

  it("readPositions 없음 + level 미달 · false", () => {
    expect(canReadPage({ level: 1, position: "약사" } as any, { read: 5, write: 5 })).toBe(false);
  });
});

describe("canWritePage", () => {
  it("perm undefined · false", () => {
    expect(canWritePage({ level: 9 } as any, undefined)).toBe(false);
  });

  it("level >= write · true", () => {
    expect(canWritePage({ level: 5 } as any, { read: 0, write: 5 })).toBe(true);
  });

  it("직군 · writePositions 매칭", () => {
    expect(canWritePage(
      { level: 1, position: "약사" } as any,
      { read: 0, write: 5, writePositions: ["약사"] }
    )).toBe(true);
  });

  it("hidden 무시 (canWritePage 는 hidden 검사 X)", () => {
    // canWritePage 는 hidden 검사 안 함 (canReadPage 만 검사)
    expect(canWritePage(
      { level: 9 } as any,
      { read: 0, write: 5, hidden: true }
    )).toBe(true);
  });
});

describe("canReadPageKey · subTab 우선", () => {
  const perms = {
    order: { read: 3, write: 5 },
    "order:vendor": { read: 5, write: 7 },
  } as any;

  it("subTab 없음 · pageKey · true (레벨 3)", () => {
    expect(canReadPageKey({ level: 3 } as any, perms, "order")).toBe(true);
  });

  it("subTab 있음 · 복합키 우선 (레벨 3 < subTab read 5) · false", () => {
    expect(canReadPageKey({ level: 3 } as any, perms, "order", "vendor")).toBe(false);
  });

  it("subTab 있음 · 복합키 우선 (레벨 5 >= subTab read 5) · true", () => {
    expect(canReadPageKey({ level: 5 } as any, perms, "order", "vendor")).toBe(true);
  });

  it("subTab 있는데 · 복합키 없음 · pageKey fallback", () => {
    expect(canReadPageKey({ level: 3 } as any, perms, "order", "unknown")).toBe(true);
  });

  it("perms null · false", () => {
    expect(canReadPageKey({ level: 9 } as any, null, "order")).toBe(false);
  });
});

describe("canWritePageKey · subTab 우선", () => {
  const perms = {
    order: { read: 3, write: 5 },
    "order:admin": { read: 7, write: 9 },
  } as any;

  it("subTab 없음 · 기본 pageKey · 레벨 5 write · true", () => {
    expect(canWritePageKey({ level: 5 } as any, perms, "order")).toBe(true);
  });

  it("subTab 있음 · 복합키 · 레벨 9 write · true", () => {
    expect(canWritePageKey({ level: 9 } as any, perms, "order", "admin")).toBe(true);
    expect(canWritePageKey({ level: 5 } as any, perms, "order", "admin")).toBe(false);
  });
});

describe("getEffectivePerm", () => {
  const perms = { order: { read: 3, write: 5 }, "order:x": { read: 7, write: 9 } } as any;

  it("subTab 없음 · pageKey perm 반환", () => {
    expect(getEffectivePerm(perms, "order")).toEqual({ read: 3, write: 5 });
  });

  it("subTab 있음 · 복합키 우선", () => {
    expect(getEffectivePerm(perms, "order", "x")).toEqual({ read: 7, write: 9 });
  });

  it("복합키 없음 · pageKey fallback", () => {
    expect(getEffectivePerm(perms, "order", "unknown")).toEqual({ read: 3, write: 5 });
  });

  it("perms null · undefined", () => {
    expect(getEffectivePerm(null, "order")).toBeUndefined();
  });
});

describe("isAdminEssentialPage", () => {
  it("permissions/business-manage/account · true", () => {
    expect(isAdminEssentialPage("permissions")).toBe(true);
    expect(isAdminEssentialPage("business-manage")).toBe(true);
    expect(isAdminEssentialPage("account")).toBe(true);
  });

  it("그 외 · false", () => {
    expect(isAdminEssentialPage("dashboard")).toBe(false);
    expect(isAdminEssentialPage("staff")).toBe(false);
  });
});
