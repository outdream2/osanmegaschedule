// src/components/DisplayPage/DisplayPage.helpers.ts
// 2026-08-22 · Framework Phase 4 · DisplayPage 대형 파일 분리 · constants + helpers 이관
import {
  Bell, ClipboardList, Package, Store, BarChart2, Wallet, Building2,
  RotateCcw, Boxes,
} from "lucide-react";
import { ZONE_DEFS } from "../../constants/displayZones";
import {
  type ZoneStatus, type DowMap, type DisplayZone,
  expandZoneDef,
} from "../../utils/zoneUtils";
import { api, ApiError } from "../../lib/apiClient";
import { type TabDef as CommonTabDef } from "../common/TabBar";
import type { DpSubTabKey, DisplayRequest } from "./DisplayPage.types";

// ─── DisplayPage 서브탭 (level 2) 정의 · 상수 · 컴포넌트 외부 배치 (참조 안정성 · 훅 재등록 방지)
// 2026-08-25 · 사용자 지시 · "통계" → "판매" 라벨 변경 · 반품 메뉴 추가 (반품필요 이관 대상)
export const DP_SUBTAB_DEFAULTS: CommonTabDef<DpSubTabKey>[] = [
  // 2026-08-29 · 사용자 지시 · 상품 신규 서브탭 · 매입에서 이관 (실재고입력·상품입고·상품정보 3개 이너 탭)
  { key: "product",        label: "상품",       icon: Boxes,         color: "red"    },
  { key: "purchase-order", label: "발주",       icon: ClipboardList, color: "sky"    },
  { key: "purchase",       label: "매입",       icon: Package,       color: "amber"  },
  { key: "payment",        label: "결제",       icon: Wallet,        color: "teal"   },
  { key: "statistics",     label: "판매",       icon: BarChart2,     color: "indigo" },
  // 2026-08-25 · 사용자 지시 · 신규 반품 메뉴 · 반품필요/반품확정 통합 예정
  { key: "return",         label: "반품",       icon: RotateCcw,     color: "rose"   },
  { key: "stock-arrivals", label: "입고알림",   icon: Bell,          color: "orange" },
  // "display-request" 서브탭 제거 · RequestsPage 진열요청 탭으로 통합 (2026-08-05)
  { key: "store",          label: "매장구역도", icon: Store,         color: "violet" },
  // 2026-08-09 · 사용자 요청 · 공급사관리 (경영관리에서 이동)
  { key: "vendor-manage",  label: "공급사관리", icon: Building2,     color: "rose"   },
];

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
    }));
  } catch { return null; }
};

// Zones that allow multiple staff assignments (comma-separated names)
export const MULTI_ASSIGN_ZONE_NUMS = new Set([36, 42]);
