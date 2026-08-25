// src/components/DisplayPage/useDisplayData.ts
// 2026-08-22 · Framework Phase 4 · DisplayPage 데이터 fetch/save useEffect 분리
import { useEffect, useRef, useState } from "react";
import { getProductsMap, type ProductInfo } from "../../lib/productsCache";
import { api } from "../../lib/apiClient";
import {
  loadZones, saveZones, loadRequests, saveRequests,
  fetchZonesFromDB, saveZonesToDB, fetchRequestsFromDB,
  SKIP_TYPES,
} from "./DisplayPage.helpers";
import type { ZoneGroup } from "./ZoneGroupPanel";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { DisplayRequest, Employee, TodayStaff } from "./DisplayPage.types";

interface UseDisplayDataReturn {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  todayStaff: TodayStaff[];
  setTodayStaff: React.Dispatch<React.SetStateAction<TodayStaff[]>>;
  staffLoading: boolean;
  staffError: string | null;
  zones: DisplayZone[];
  setZones: React.Dispatch<React.SetStateAction<DisplayZone[]>>;
  zonesLoaded: boolean;
  requests: DisplayRequest[];
  setRequests: React.Dispatch<React.SetStateAction<DisplayRequest[]>>;
  productsMap: Record<string, ProductInfo>;
  setProductsMap: React.Dispatch<React.SetStateAction<Record<string, ProductInfo>>>;
  zoneGroups: ZoneGroup[];
  setZoneGroups: React.Dispatch<React.SetStateAction<ZoneGroup[]>>;
  zoneGroupsLoaded: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  lastSaveError: string | null;
}

export function useDisplayData(selectedDate: string, selectedYM: string): UseDisplayDataReturn {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayStaff, setTodayStaff] = useState<TodayStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [zones, setZones] = useState<DisplayZone[]>(() => loadZones());
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [requests, setRequests] = useState<DisplayRequest[]>(() => loadRequests());
  const [productsMap, setProductsMap] = useState<Record<string, ProductInfo>>({});
  const [zoneGroups, setZoneGroups] = useState<ZoneGroup[]>([]);
  const [zoneGroupsLoaded, setZoneGroupsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const dbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch employees by month
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      try {
        const [y, m] = selectedYM.split("-").map(Number);
        const { data } = await api.get<any>(`/api/schedules?year=${y}&month=${m}`);
        const empList: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
        if (cancelled) return;
        setEmployees(empList);
        setStaffError(null);
      } catch {
        if (!cancelled) setStaffError("직원 정보를 불러올 수 없습니다");
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedYM]);

  // Derive today's staff
  useEffect(() => {
    const staff: TodayStaff[] = [];
    for (const emp of employees) {
      const sc = emp.schedules?.find((s) => s.date === selectedDate);
      if (sc && !SKIP_TYPES.has(sc.type)) {
        staff.push({ employee: emp, scheduleType: sc.type, workingHours: sc.workingHours || "" });
      }
    }
    setTodayStaff(staff);
  }, [employees, selectedDate]);

  // Load zones from DB on mount
  useEffect(() => {
    fetchZonesFromDB().then((dbZones) => {
      if (dbZones) { setZones(dbZones); saveZones(dbZones); }
      setZonesLoaded(true);
    });
  }, []); // eslint-disable-line

  // Validate zone assignments against current employees
  useEffect(() => {
    if (!zonesLoaded || staffLoading || employees.length === 0) return;
    let changed = false;
    setZones(prev => {
      const validated = prev.map(z => {
        if (!z.assignedStaffName) return z;
        const names = z.assignedStaffName.split(",").map((s: string) => s.trim()).filter(Boolean);
        const validNames = names.filter((name: string) => employees.some(e => e.name === name));
        if (validNames.length === names.length) return z;
        changed = true;
        const validName = validNames.join(",");
        const firstEmp = validNames.length > 0 ? employees.find(e => e.name === validNames[0]) : null;
        return { ...z, assignedStaffName: validName, assignedStaffId: firstEmp?.id ?? null };
      });
      if (changed) {
        saveZones(validated);
        saveZonesToDB(validated);
      }
      return changed ? validated : prev;
    });
  }, [zonesLoaded, staffLoading, employees.length]); // eslint-disable-line

  // Load requests from DB on mount
  useEffect(() => {
    fetchRequestsFromDB().then((dbReqs) => {
      if (dbReqs) { setRequests(dbReqs); saveRequests(dbReqs); }
    });
  }, []);

  // Load products map
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getProductsMap().catch(() => ({} as Record<string, ProductInfo>)),
      api.get<Record<string, ProductInfo>>("/api/products-map").then(({ data }) => data ?? {}).catch(() => ({} as Record<string, ProductInfo>)),
      api.get<Record<string, any>>("/api/inventory-latest").then(({ data }) => data ?? {}).catch(() => ({} as Record<string, any>)),
    ]).then(([staticMap, serverMap, invMap]) => {
      if (cancelled) return;
      const merged: Record<string, ProductInfo> = { ...staticMap };
      for (const [code, info] of Object.entries(serverMap as Record<string, ProductInfo>)) {
        merged[code] = { ...(staticMap[code] ?? {} as ProductInfo), ...info };
      }
      // 2026-08-26 · 사용자 버그 fix · 5-slot 완전 지원 · 창고2·매장2·매장3 + zones 전파
      const inv = invMap as Record<string, {
        warehouse_stock: number | null; warehouse1_stock: number | null; warehouse2_stock: number | null;
        store_stock: number | null; store_stock_2: number | null; store3_stock: number | null;
        store1_zone: string | null; store2_zone: string | null; store3_zone: string | null;
        checked_at: string | null;
      }>;
      for (const [code, iv] of Object.entries(inv)) {
        const stripped = code.replace(/^0+/, "");
        for (const k of [code, stripped].filter(Boolean)) {
          if (merged[k]) {
            merged[k] = {
              ...merged[k],
              warehouse_stock:  iv.warehouse_stock,
              warehouse1_stock: iv.warehouse1_stock,
              warehouse2_stock: iv.warehouse2_stock,
              store_stock:      iv.store_stock,
              store_stock_2:    iv.store_stock_2,
              store3_stock:     iv.store3_stock,
              store1_zone:      iv.store1_zone,
              store2_zone:      iv.store2_zone,
              store3_zone:      iv.store3_zone,
              inv_checked_at:   iv.checked_at,
            } as ProductInfo;
          }
        }
      }
      setProductsMap(merged);
    });
    return () => { cancelled = true; };
  }, []);

  // Load zone groups from DB
  useEffect(() => {
    api.get<any[]>("/api/zone-groups")
      .then(({ data }) => setZoneGroups(Array.isArray(data) ? data : []))
      .catch(() => { })
      .finally(() => setZoneGroupsLoaded(true));
  }, []);

  // Debounced save zone groups to DB
  useEffect(() => {
    if (!zoneGroupsLoaded) return;
    const t = setTimeout(() => {
      api.put("/api/zone-groups", zoneGroups).catch(() => { });
    }, 800);
    return () => clearTimeout(t);
  }, [zoneGroups, zoneGroupsLoaded]);

  // Persist zones: localStorage immediately; debounce DB save
  useEffect(() => {
    saveZones(zones);
    if (!zonesLoaded) return;
    if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current);
    setSaveStatus("saving");
    dbSaveTimer.current = setTimeout(async () => {
      const result = await saveZonesToDB(zones);
      if (result.ok) {
        setSaveStatus("saved");
        setLastSaveError(null);
        setTimeout(() => setSaveStatus(prev => prev === "saved" ? "idle" : prev), 2500);
      } else {
        setSaveStatus("error");
        setLastSaveError(result.error ?? "알 수 없는 오류");
      }
    }, 1500);
    return () => { if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current); };
  }, [zones, zonesLoaded]);

  useEffect(() => { saveRequests(requests); }, [requests]);

  return {
    employees, setEmployees,
    todayStaff, setTodayStaff,
    staffLoading, staffError,
    zones, setZones,
    zonesLoaded,
    requests, setRequests,
    productsMap, setProductsMap,
    zoneGroups, setZoneGroups,
    zoneGroupsLoaded,
    saveStatus, lastSaveError,
  };
}
