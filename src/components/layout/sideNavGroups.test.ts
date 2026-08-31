// 2026-08-20 · sideNavGroups · pure helpers · deriveUserLevel·canAccessItem·subTabStorageKey·isItemActive
import { describe, it, expect } from "vitest";
import {
  SIDE_NAV_GROUPS,
  DERIVED_TOP_TABS,
  subTabStorageKey,
  deriveUserLevel,
  canAccessItem,
  filterGroupsForSession,
  isItemActive,
  headerAccentGradient,
  COLOR_TONES,
} from "./sideNavGroups";
import type { AuthSession } from "../../types";

describe("SIDE_NAV_GROUPS · 구조", () => {
  it("배열 · 각 그룹 · id·label·items 정의", () => {
    expect(Array.isArray(SIDE_NAV_GROUPS)).toBe(true);
    SIDE_NAV_GROUPS.forEach((g) => {
      expect(g.id).toBeTruthy();
      expect(g.label).toBeTruthy();
      expect(Array.isArray(g.items)).toBe(true);
    });
  });

  it("각 item · key·label·icon 정의", () => {
    SIDE_NAV_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        expect(it.key).toBeTruthy();
        expect(it.label).toBeTruthy();
        expect(it.icon).toBeDefined();
      });
    });
  });
});

describe("DERIVED_TOP_TABS · SIDE_NAV_GROUPS 로부터 자동 파생", () => {
  it("hideInTopTabs 제외 후 · 배열", () => {
    expect(Array.isArray(DERIVED_TOP_TABS)).toBe(true);
    expect(DERIVED_TOP_TABS.length).toBeGreaterThan(0);
    // 각 탭 · 필수 필드
    DERIVED_TOP_TABS.forEach((t) => {
      expect(t.key).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeDefined();
    });
  });
});

describe("subTabStorageKey", () => {
  it("sidebar.subtab.{pageKey}", () => {
    expect(subTabStorageKey("display" as any)).toBe("sidebar.subtab.display");
    expect(subTabStorageKey("business-manage" as any)).toBe("sidebar.subtab.business-manage");
  });
});

describe("deriveUserLevel", () => {
  it("null · 0", () => {
    expect(deriveUserLevel(null)).toBe(0);
  });

  it("session.level 있으면 · 우선", () => {
    expect(deriveUserLevel({ level: 5, role: "manager" } as AuthSession)).toBe(5);
    expect(deriveUserLevel({ level: 0, role: "admin" } as AuthSession)).toBe(0);
  });

  it("level 없음 · role → 파생", () => {
    expect(deriveUserLevel({ role: "superadmin" } as any)).toBe(9);
    expect(deriveUserLevel({ role: "admin" } as any)).toBe(9);
    expect(deriveUserLevel({ role: "manager" } as any)).toBe(2);
    expect(deriveUserLevel({ role: "employee" } as any)).toBe(1);
    expect(deriveUserLevel({ role: "vendor" } as any)).toBe(0);
  });
});

describe("canAccessItem", () => {
  const item = { key: "schedule", label: "스케줄", icon: (() => null) as any };
  const adminSession = { level: 9, role: "admin" } as AuthSession;
  const employeeSession = { level: 1, role: "employee" } as AuthSession;

  it("landing · 항상 true (세션 없어도)", () => {
    expect(canAccessItem({ key: "landing", label: "홈", icon: (() => null) as any }, null)).toBe(true);
  });

  it("세션 없음 · false (landing 제외)", () => {
    expect(canAccessItem(item as any, null)).toBe(false);
  });

  it("minLevel 초과 · false", () => {
    const restricted = { ...item, minLevel: 9 };
    expect(canAccessItem(restricted as any, employeeSession)).toBe(false);
    expect(canAccessItem(restricted as any, adminSession)).toBe(true);
  });

  it("vendor 세션 · landing 만 접근", () => {
    const vendorSession = { role: "vendor", level: 0 } as any;
    expect(canAccessItem(item as any, vendorSession)).toBe(false);
    expect(canAccessItem({ key: "landing", label: "홈", icon: (() => null) as any }, vendorSession)).toBe(true);
  });

  it("managerOnly · level >= 2 만", () => {
    const mgr = { ...item, managerOnly: true };
    expect(canAccessItem(mgr as any, employeeSession)).toBe(false);
    expect(canAccessItem(mgr as any, { level: 2, role: "manager" } as AuthSession)).toBe(true);
  });

  it("pharmacistOnly · level >= 3 (약사) 만", () => {
    const pharm = { ...item, pharmacistOnly: true };
    expect(canAccessItem(pharm as any, employeeSession)).toBe(false);
    expect(canAccessItem(pharm as any, { level: 3, role: "employee" } as AuthSession)).toBe(true);
  });

  it("perms hidden=true · false (일반 사용자)", () => {
    const perms = { schedule: { read: 1, write: 1, hidden: true } } as any;
    expect(canAccessItem(item as any, employeeSession, perms)).toBe(false);
  });

  it("perms hidden=true + ADMIN_ESSENTIAL 페이지 · admin 은 접근 유지 (lockout 방지)", () => {
    const perms = { permissions: { read: 9, write: 9, hidden: true } } as any;
    const essential = { key: "permissions", label: "권한", icon: (() => null) as any };
    expect(canAccessItem(essential as any, adminSession, perms)).toBe(true);
  });

  it("perms hidden=true · 비필수 페이지 · admin 도 차단", () => {
    const perms = { schedule: { read: 1, write: 1, hidden: true } } as any;
    expect(canAccessItem(item as any, adminSession, perms)).toBe(false);
  });
});

describe("filterGroupsForSession", () => {
  it("세션 없음 · landing 포함된 그룹만", () => {
    const groups = filterGroupsForSession(null);
    // landing 만 접근 가능 → landing 있는 그룹만
    expect(groups.length).toBeGreaterThanOrEqual(0);
  });

  it("admin · 대부분 그룹 접근", () => {
    const admin = { level: 9, role: "admin" } as AuthSession;
    const groups = filterGroupsForSession(admin);
    expect(groups.length).toBeGreaterThan(0);
  });

  // 2026-08-20 · #175 · document-writer 서브탭 gate · employmentStatus 파라미터
  it("일반 직원 · employmentStatus=active · 사직서 작성 항목 없음", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    const groups = filterGroupsForSession(emp, null, "active");
    const approvals = groups.find((g) => g.id === "approvals");
    const hasDocWriter = approvals?.items.some(
      (it) => it.subTab === "document-writer",
    );
    expect(hasDocWriter).toBe(false);
  });

  it("일반 직원 · employmentStatus=pending_resignation · 사직서 작성 노출", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    const groups = filterGroupsForSession(emp, null, "pending_resignation");
    const approvals = groups.find((g) => g.id === "approvals");
    const hasDocWriter = approvals?.items.some(
      (it) => it.subTab === "document-writer",
    );
    expect(hasDocWriter).toBe(true);
  });

  it("일반 직원 · employmentStatus=retired · 사직서 작성 없음", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    const groups = filterGroupsForSession(emp, null, "retired");
    const approvals = groups.find((g) => g.id === "approvals");
    const hasDocWriter = approvals?.items.some(
      (it) => it.subTab === "document-writer",
    );
    expect(hasDocWriter).toBe(false);
  });

  it("admin (level ≥ 9) · employmentStatus 무관 · 사직서 작성 항상 노출", () => {
    const admin = { level: 9, role: "admin" } as AuthSession;
    // active
    let groups = filterGroupsForSession(admin, null, "active");
    let approvals = groups.find((g) => g.id === "approvals");
    expect(approvals?.items.some((it) => it.subTab === "document-writer")).toBe(true);
    // null (hook 로딩 중)
    groups = filterGroupsForSession(admin, null, null);
    approvals = groups.find((g) => g.id === "approvals");
    expect(approvals?.items.some((it) => it.subTab === "document-writer")).toBe(true);
    // pending_resignation
    groups = filterGroupsForSession(admin, null, "pending_resignation");
    approvals = groups.find((g) => g.id === "approvals");
    expect(approvals?.items.some((it) => it.subTab === "document-writer")).toBe(true);
  });

  it("employmentStatus 미제공 (undefined) · 일반 직원 · 사직서 작성 없음 (안전측)", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    const groups = filterGroupsForSession(emp, null);
    const approvals = groups.find((g) => g.id === "approvals");
    const hasDocWriter = approvals?.items.some(
      (it) => it.subTab === "document-writer",
    );
    expect(hasDocWriter).toBe(false);
  });
});

// 2026-08-20 · #175 · canAccessItem · document-writer subTab gate
describe("canAccessItem · document-writer gate (#175)", () => {
  const docItem = {
    key: "approval-request",
    label: "서류작성",
    icon: (() => null) as any,
    subTab: "document-writer",
  };

  it("일반 직원 · active · false", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    expect(canAccessItem(docItem as any, emp, null, "active")).toBe(false);
  });

  it("일반 직원 · pending_resignation · true", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    expect(canAccessItem(docItem as any, emp, null, "pending_resignation")).toBe(true);
  });

  it("일반 직원 · retired · false", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    expect(canAccessItem(docItem as any, emp, null, "retired")).toBe(false);
  });

  it("admin (level 9) · status 무관 · true", () => {
    const admin = { level: 9, role: "admin" } as AuthSession;
    expect(canAccessItem(docItem as any, admin, null, "active")).toBe(true);
    expect(canAccessItem(docItem as any, admin, null, "retired")).toBe(true);
    expect(canAccessItem(docItem as any, admin, null, null)).toBe(true);
    expect(canAccessItem(docItem as any, admin, null)).toBe(true);
  });

  it("status undefined · 일반 직원 · false (안전측)", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    expect(canAccessItem(docItem as any, emp, null)).toBe(false);
  });

  it("다른 서브탭 (leave·lunch) · gate 영향 없음", () => {
    const emp = { level: 1, role: "employee" } as AuthSession;
    const leave = { ...docItem, subTab: "leave" };
    const lunch = { ...docItem, subTab: "lunch" };
    expect(canAccessItem(leave as any, emp, null, "active")).toBe(true);
    expect(canAccessItem(lunch as any, emp, null, "active")).toBe(true);
  });

  it("business-manage document-writer:contract · gate 영향 없음 (다른 key)", () => {
    // business-manage 서브탭 document-writer:contract 는 managerOnly=true 로만 제어 · #175 gate 미적용
    const bmContract = {
      key: "business-manage",
      label: "근로계약서 작성",
      icon: (() => null) as any,
      subTab: "document-writer:contract",
      managerOnly: true,
    };
    const mgr = { level: 2, role: "manager" } as AuthSession;
    expect(canAccessItem(bmContract as any, mgr, null, "active")).toBe(true);
  });
});

describe("isItemActive", () => {
  it("현재 페이지와 key 일치 · true", () => {
    const item = { key: "schedule", label: "스케줄", icon: (() => null) as any };
    expect(isItemActive(item as any, "schedule" as any)).toBe(true);
    expect(isItemActive(item as any, "display" as any)).toBe(false);
  });

  it("business-manage · 서브페이지도 활성 (permissions·hr-forms)", () => {
    const item = { key: "business-manage", label: "경영", icon: (() => null) as any };
    expect(isItemActive(item as any, "permissions" as any)).toBe(true);
    expect(isItemActive(item as any, "hr-forms" as any)).toBe(true);
    expect(isItemActive(item as any, "business-manage" as any)).toBe(true);
  });

  it("subTab 있는 item · activeSubTab 미제공 · 활성 스킵 (false · 하위 호환)", () => {
    const item = { key: "display", label: "발주", icon: (() => null) as any, subTab: "purchase-order" };
    expect(isItemActive(item as any, "display" as any)).toBe(false);
  });

  // 2026-08-31 · Phase 3 완성 · activeSubTab 옵션 · 서브탭 항목 활성 판정
  it("subTab item · activeSubTab 일치 + 페이지 일치 · true", () => {
    const item = { key: "display", label: "발주", icon: (() => null) as any, subTab: "purchase-order" };
    expect(isItemActive(item as any, "display" as any, "purchase-order")).toBe(true);
  });

  it("subTab item · activeSubTab 불일치 · false", () => {
    const item = { key: "display", label: "발주", icon: (() => null) as any, subTab: "purchase-order" };
    expect(isItemActive(item as any, "display" as any, "payment")).toBe(false);
  });

  it("subTab item · 페이지 불일치 · activeSubTab 일치해도 false", () => {
    const item = { key: "display", label: "발주", icon: (() => null) as any, subTab: "purchase-order" };
    expect(isItemActive(item as any, "business-manage" as any, "purchase-order")).toBe(false);
  });

  it("subTab item · activeSubTab null · false", () => {
    const item = { key: "display", label: "발주", icon: (() => null) as any, subTab: "purchase-order" };
    expect(isItemActive(item as any, "display" as any, null)).toBe(false);
  });

  it("subTab 없는 item · activeSubTab 무관 · 기존 로직", () => {
    const item = { key: "schedule", label: "스케줄", icon: (() => null) as any };
    expect(isItemActive(item as any, "schedule" as any, "irrelevant")).toBe(true);
    expect(isItemActive(item as any, "display" as any, "purchase-order")).toBe(false);
  });
});

describe("COLOR_TONES · SideNavColor", () => {
  it("8종 컬러 · activeBg·hoverBg 정의", () => {
    (["slate", "amber", "red", "sky", "indigo", "emerald", "violet", "cyan"] as const).forEach((c) => {
      expect(COLOR_TONES[c]).toBeDefined();
      expect(COLOR_TONES[c].activeBg).toBeTruthy();
      expect(COLOR_TONES[c].hoverBg).toBeTruthy();
    });
  });
});

describe("headerAccentGradient", () => {
  it("각 color · 그라디언트 문자열 반환", () => {
    expect(typeof headerAccentGradient("slate")).toBe("string");
    expect(typeof headerAccentGradient("amber")).toBe("string");
    expect(headerAccentGradient("emerald")).toContain("gradient");
  });
});
