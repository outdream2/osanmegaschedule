// src/components/DisplayPage/DisplayPage.helpers.ts
// 2026-08-22 · Framework Phase 4 · DisplayPage 대형 파일 분리 · constants + helpers 이관
// 2026-10-05 · 사용자 지시 · product 서브탭 제거 · Boxes 아이콘 unused
// 2026-10-05 · 사용자 지시 · 공통모듈화 · DP_SUBTAB_DEFAULTS 를 SIDE_NAV_GROUPS 매장 그룹에서 자동 파생
//   · 매장 서브탭 추가·순서 변경 → sideNavGroups.ts 한 곳만 수정 (사이드바·TabBar 자동 동기)
import {
  Bell, ClipboardList, Package, Store, BarChart2, Wallet, Building2,
  RotateCcw, CircleDollarSign,
} from "lucide-react";
import { ZONE_DEFS } from "../../constants/displayZones";
import {
  type ZoneStatus, type DowMap, type DisplayZone,
  expandZoneDef,
} from "../../utils/zoneUtils";
import { api, ApiError } from "../../lib/apiClient";
import { type TabDef as CommonTabDef } from "../common/TabBar";
import { SIDE_NAV_GROUPS } from "../layout/sideNavGroups";
import type { DpSubTabKey, DisplayRequest } from "./DisplayPage.types";

// ─── DisplayPage 서브탭 (level 2) · TabBar 전용 메타 (아이콘/색상)
//   · 리스트·순서·라벨은 SIDE_NAV_GROUPS 매장 그룹 items 가 single source
//   · 여기엔 subTab key 별 TabBar 아이콘·color 만 매핑 (phosphor ↔ lucide 분리)
type DpSubTabMeta = { icon: CommonTabDef<DpSubTabKey>["icon"]; color: CommonTabDef<DpSubTabKey>["color"] };
const DP_SUBTAB_META: Record<DpSubTabKey, DpSubTabMeta> = {
  "purchase-order": { icon: ClipboardList,    color: "sky"     },
  "purchase":       { icon: Package,          color: "amber"   },
  "statistics":     { icon: BarChart2,        color: "indigo"  },
  "revenue":        { icon: CircleDollarSign, color: "emerald" },
  "payment":        { icon: Wallet,           color: "teal"    },
  "return":         { icon: RotateCcw,        color: "rose"    },
  "stock-arrivals": { icon: Bell,             color: "orange"  },
  "store":          { icon: Store,            color: "violet"  },
  "vendor-manage":  { icon: Building2,        color: "rose"    },
};

// ─── 매장 서브탭 defaults · SIDE_NAV_GROUPS 매장 그룹 items 자동 파생
//   · 사이드바 매장 items 중 subTab 있는 것만 추출 · 순서·라벨 그대로
//   · 아이콘·color 는 DP_SUBTAB_META 매핑 사용
export const DP_SUBTAB_DEFAULTS: CommonTabDef<DpSubTabKey>[] = (() => {
  const displayGroup = SIDE_NAV_GROUPS.find(g => g.id === "display");
  if (!displayGroup) return [];
  return displayGroup.items
    .filter(it => !!it.subTab)
    .map(it => {
      const key = it.subTab as DpSubTabKey;
      const meta = DP_SUBTAB_META[key];
      return {
        key,
        label: it.label,
        icon: meta?.icon ?? ClipboardList,
        color: meta?.color ?? "slate",
      } as CommonTabDef<DpSubTabKey>;
    });
})();

// ─── DOW(요일) 마스크 유틸 ───────────────────────────────────────────
// 비트: 일(1) 월(2) 화(4) 수(8) 목(16) 금(32) 토(64) → 모든요일=127
export const DOW_ALL = 127;
export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const isDowActive = (mask: number | undefined | null, dow: number): boolean =>
  mask == null ? true : ((mask >> dow) & 1) === 1;

// ─── localStorage helpers (requests only) ────────────────────────────
export const REQS_KEY = "megatown_display_requests";

export const loadRequests = (): DisplayRequest[] => {
  try { const r = localStorage.getItem(REQS_KEY); return r ? (JSON.parse(r) as DisplayRequest[]) : []; }
  catch { return []; }
};
export const saveRequests = (r: DisplayRequest[]) => { try { localStorage.setItem(REQS_KEY, JSON.stringify(r)); } catch { } };

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<ZoneStatus, string> = { normal: "정상", low: "부족", empty: "품절" };

export const statusCell = (s: ZoneStatus, extra = ""): string => {
  const m = {
    normal: "bg-emerald-50 border-emerald-300 hover:border-emerald-400 text-emerald-900",
    low: "bg-amber-50 border-amber-300 hover:border-amber-400 text-amber-900",
    empty: "bg-red-50 border-red-300 hover:border-red-400 text-red-900"
  };
  return `${m[s]} ${extra}`;
};
export const statusDot = (s: ZoneStatus) => ({ normal: "bg-emerald-500", low: "bg-amber-500", empty: "bg-red-500" }[s]);
export const statusBadge = (s: ZoneStatus) => ({ normal: "bg-emerald-100 text-emerald-700 border-emerald-300", low: "bg-amber-100 text-amber-700 border-amber-300", empty: "bg-red-100 text-red-700 border-red-300" }[s]);

export const SHIFT_BADGE: Record<string, string> = {
  "오픈": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "미들": "bg-blue-100 text-blue-800 border-blue-300",
  "마감": "bg-rose-100 text-rose-800 border-rose-300",
  "오전반차": "bg-lime-100 text-lime-800 border-lime-300",
  "오후반차": "bg-amber-100 text-amber-800 border-amber-300",
};

export const SKIP_TYPES = new Set(["휴무", "월차", "지정휴무"]);

export const formatRel = (iso: string) => {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
};

// ─── Staff color palette (for assigned zone chip coloring) ────────────────────
export const STAFF_COLORS = [
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-teal-100 text-teal-800 border-teal-300",
  "bg-orange-100 text-orange-800 border-orange-300",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
];

export const STAFF_AVATAR_COLORS = [
  "bg-violet-600 text-white",
  "bg-sky-600 text-white",
  "bg-rose-600 text-white",
  "bg-teal-600 text-white",
  "bg-orange-600 text-white",
  "bg-fuchsia-600 text-white",
];

// ─── API helpers ──────────────────────────────────────────────────────────────
export const fetchZonesFromDB = async (): Promise<DisplayZone[] | null> => {
  try {
    const { data: rows } = await api.get<Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string; dow_map?: DowMap }>>("/api/zones");
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // A/B 확장 + 하위 호환: 옛 zone_id ("1") → 1A로 매핑
    return ZONE_DEFS.flatMap((def) => {
      const expanded = expandZoneDef(def);
      return expanded.map(base => {
        const row = rows.find((r) => r.zone_id === base.id)
          ?? (base.id.endsWith("A") ? rows.find((r) => r.zone_id === String(def.num)) : null);
        return {
          ...base,
          assignedStaffId: row?.employee_id ?? null,
          assignedStaffName: row?.employee_name ?? "",
          status: (row?.status as ZoneStatus) ?? "normal",
          products: row?.products ?? "",
          dowMap: (row?.dow_map ?? null) as DowMap,
        };
      });
    });
  } catch { return null; }
};

export const saveZonesToDB = async (zones: DisplayZone[]): Promise<{ ok: boolean; error?: string }> => {
  try {
    await api.post("/api/zones", {
      zones: zones.map((z) => ({
        zone_id: z.id,
        employee_id: z.assignedStaffId,
        employee_name: z.assignedStaffName,
        status: z.status,
        products: z.products,
        dow_map: z.dowMap ?? null,
      })),
    });
    return { ok: true };
  } catch (err: any) {
    const msg = err instanceof ApiError ? err.message : (err?.message ?? String(err));
    console.error("[saveZonesToDB] exception:", msg);
    return { ok: false, error: msg };
  }
};

export const fetchRequestsFromDB = async (): Promise<DisplayRequest[] | null> => {
  try {
    const { data: rows } = await api.get<any[]>("/api/display-requests");
    return rows.map((r) => ({
      id: String(r.id),
      zoneId: r.zone_id ?? "",
      zoneLabel: r.zone_label ?? "",
      category: r.category ?? "",
      requestedAt: r.requested_at ?? new Date().toISOString(),
      assignedStaffId: r.assigned_staff_id ?? null,
      assignedStaffName: r.assigned_staff_name ?? "",
      status: (r.status ?? "pending") as "pending" | "done",
      note: r.note ?? "",
      // 2026-09-10 · #51 · 사용자 지시 · 서버 products JOIN 필드 반영
      productName: r.product_name ?? null,
      productCode: r.product_code ?? null,
      productSpec: r.product_spec ?? null,
      productDisplayLocation: r.product_display_location ?? null,
      productLocationDetail: r.product_location_detail ?? null,
    }));
  } catch { return null; }
};

// Zones that allow multiple staff assignments (comma-separated names)
export const MULTI_ASSIGN_ZONE_NUMS = new Set([36, 42]);
