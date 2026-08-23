// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../../lib/apiClient";
import { dispatchApprovalChange, useApprovalRefreshListener } from "../../lib/approvalEvents";
import { TIMING } from "../../constants/timing";
import {
  RefreshCw, ShoppingCart, Square, CheckSquare,
  Utensils, UtensilsCrossed,
} from "lucide-react";
import { getProductsMap, type ProductInfo } from "../../lib/productsCache";
import { fmtDateMD } from "../../lib/format";
import type { AuthSession } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { useColumnResize } from "../../hooks/useColumnResize";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { CARD_BASE } from "../../styles/tokens";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
// 2026-08-12 · 연차승인 탭 · LeavePage mode="approval" 로 임베드 (관리자용 승인 UI)
import { LeavePage } from "../LeavePage/LeavePage";
// 2026-08-21 · Framework Phase 4 · large-file 분리 · types + ListToolbar
import type { DisplayRequest, OrderRequest, ZoneMismatch, LunchRequest, InventoryCheck, Tab } from "./types";
import { ListToolbar } from "./ListToolbar";
// 2026-08-22 · Framework Phase 4 · 3탭 별도 컴포넌트 이관 (Display/Order/Inventory)
import { DisplayRequestTab, OrderRequestTab, InventoryCheckTab, RequestCheckbox } from "./RequestsPage.tabs";

interface RequestsPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const fmtDate = fmtDateMD;

export const RequestsPage: React.FC<RequestsPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
  const [tab, setTab] = useState<Tab>(() => {
    // 2026-08-11 · 사이드바 V2 · localStorage("sidebar.subtab.requests") 있으면 초기값 사용
    // 2026-08-12 · StrictMode 이중 마운트 대비 · 읽기만 · 삭제는 useEffect 로
    try {
      const sb = localStorage.getItem("sidebar.subtab.requests") as Tab | null;
      if (sb) return sb;
    } catch { /* silent */ }
    return "display";
  });
  // mount 완료 후 · localStorage 정리
  useEffect(() => {
    try { localStorage.removeItem("sidebar.subtab.requests"); } catch { /* silent */ }
  }, []);
  // 사이드바에서 같은 페이지 서브탭 클릭 시 CustomEvent 리스닝
  useEffect(() => {
    const onSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ page: string; subTab: string }>).detail;
      if (detail?.page !== "requests") return;
      setTab(detail.subTab as Tab);
    };
    window.addEventListener("sidebar:subtab", onSubTab);
    return () => window.removeEventListener("sidebar:subtab", onSubTab);
  }, []);
  const isManager = (authSession?.level ?? 0) >= 2;
  const { getWidth: rw, resizerProps: rr } = useColumnResize("requestsDisplay", {
    check:   { default: 32,  min: 28, max: 48  },
    name:    { default: 200, min: 100, max: 400 },
    zone:    { default: 80,  min: 60, max: 160 },
    staff:   { default: 72,  min: 52, max: 140 },
    wh_prep: { default: 72,  min: 52, max: 100 },
    disp:    { default: 72,  min: 52, max: 100 },
    date:    { default: 72,  min: 52, max: 120 },
  });

  // 진열요청
  const [displayReqs, setDisplayReqs] = useState<DisplayRequest[]>([]);
  const [displayLoading, setDisplayLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<Set<string>>(new Set());

  // 발주요청
  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());
  const [orderRequestError, setOrderRequestError] = useState<string | null>(null);

  // 발주 필요 상품
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // 구역불일치
  const [mismatches, setMismatches] = useState<ZoneMismatch[]>([]);
  const [mismatchLoading, setMismatchLoading] = useState(false);
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [selectedMismatch, setSelectedMismatch] = useState<Set<string>>(new Set());

  // 점심신청
  const [lunchRequests, setLunchRequests] = useState<LunchRequest[]>([]);
  const [lunchLoading, setLunchLoading] = useState(false);

  // 실재고 점검
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<Set<string>>(new Set());
  const [invLogOpen, setInvLogOpen] = useState(false);
  const [requestingInvOrder, setRequestingInvOrder] = useState<Set<string>>(new Set());

  // 빠른 탭 갯수 (pending-counts 엔드포인트)
  const [tabCounts, setTabCounts] = useState<{display:number; order:number; mismatch:number; lunch:number; inventory:number} | null>(null);

  // 2026-08-12 · 연차승인 탭 · pending 건수 별도 폴링 (leave-requests/pending-count)
  const [leavePendingCount, setLeavePendingCount] = useState<number>(0);

  // 발주요청 중복 확인 모달
  const [dupOrderModal, setDupOrderModal] = useState<{existing: OrderRequest; product: ProductInfo; editStock: number | ""} | null>(null);


  // 진열요청 개별 완료 처리 중인 id (준비완료·진열완료 공용 busy state)
  const [completingDisplay, setCompletingDisplay] = useState<Set<string>>(new Set());

  // 2026-08-05 · T-SCAN-1 · 3단계 권한 판별
  //   · 창고담당 · [창고 준비완료] 버튼 표시
  //   · 진열담당 · [진열 완료] 버튼 표시
  //   · 관리자 (level ≥ 8) · 두 버튼 다 표시 · 강제 완료 가능
  const authPos = ((authSession as any)?.position ?? "") as string;
  const authRank = ((authSession as any)?.employeeRank ?? "") as string;
  const isWarehouseStaff = authPos === "창고" || authPos === "물류" || authRank === "창고";
  const isDisplayStaff   = authPos === "진열" || authPos === "매장" || authRank === "진열";
  const isAdminLevel8    = (authSession?.level ?? 0) >= 8;
  const canPrepare = isWarehouseStaff || isAdminLevel8;
  const canComplete = isDisplayStaff  || isAdminLevel8;

  // 진열요청 완료 확인 (전체삭제)
  const [displayConfirmDelete, setDisplayConfirmDelete] = useState(false);

  // 진열요청 알림 전송
  const [notifying, setNotifying] = useState(false);
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  // 2026-08-05 · T-SCAN-1 · [창고준비] 토글 · PATCH /prepare
  //   · pending → prepared (완료 · 진열담당 알림)
  //   · prepared → pending (되돌리기 · 준비자 정보 clear)
  const handlePrepareDisplay = useCallback(async (req: DisplayRequest) => {
    setCompletingDisplay(prev => new Set([...prev, req.id]));
    try {
      const { data: body } = await api.patch<any>(`/api/display-requests/${req.id}/prepare`, {
        prepared_by: authSession?.employeeId ?? null,
        prepared_by_name: authSession?.employeeName ?? "",
      });
      const reverted = body.action === "reverted";
      const now = new Date().toISOString();
      setDisplayReqs(prev => prev.map(r => r.id === req.id
        ? reverted
          ? { ...r, status: "pending", prepared_at: null, prepared_by: null, prepared_by_name: null }
          : { ...r, status: "prepared", prepared_at: now,
              prepared_by: authSession?.employeeId ?? null,
              prepared_by_name: authSession?.employeeName ?? "" }
        : r));
      // 2026-08-18 · 진열 준비 상태 변경 시 배지 갱신
      dispatchApprovalChange("display");
    } catch (e: any) {
      showError(`창고 준비 토글 실패: ${e?.message ?? "오류"}`);
    } finally {
      setCompletingDisplay(prev => { const s = new Set(prev); s.delete(req.id); return s; });
    }
  }, [authSession?.employeeId, authSession?.employeeName, showError]);

  // 2026-08-05 · T-SCAN-1 · [진열완료] 토글 · PATCH /complete
  //   · pending·prepared → done (완료 · 관리자 알림)
  //   · done → prepared(창고준비O) or pending(창고준비X) · 완료자 정보 clear
  const handleCompleteDisplay = useCallback(async (req: DisplayRequest) => {
    setCompletingDisplay(prev => new Set([...prev, req.id]));
    try {
      const { data: body } = await api.patch<any>(`/api/display-requests/${req.id}/complete`, {
        completed_by: authSession?.employeeId ?? null,
        completed_by_name: authSession?.employeeName ?? "",
      });
      const reverted = body.action === "reverted";
      const revertedStatus = body.status as "prepared" | "pending" | undefined;
      const now = new Date().toISOString();
      setDisplayReqs(prev => prev.map(r => r.id === req.id
        ? reverted
          ? { ...r, status: revertedStatus ?? "prepared", completed_at: null, completed_by: null, completed_by_name: null }
          : { ...r, status: "done", completed_at: now,
              completed_by: authSession?.employeeId ?? null,
              completed_by_name: authSession?.employeeName ?? "" }
        : r));
      // 2026-08-18 · 진열 완료 상태 변경 시 배지 갱신
      dispatchApprovalChange("display");
    } catch (e: any) {
      showError(`진열완료 토글 실패: ${e?.message ?? "오류"}`);
    } finally {
      setCompletingDisplay(prev => { const s = new Set(prev); s.delete(req.id); return s; });
    }
  }, [authSession?.employeeId, authSession?.employeeName, showError]);

  const handleNotifyAll = useCallback(async () => {
    const pending = displayReqs.filter(r => r.status === "pending" && r.assigned_staff_id);
    if (pending.length === 0) {
      setNotifyToast("전송할 대기 중인 진열요청이 없습니다");
      setTimeout(() => setNotifyToast(null), TIMING.TOAST_MEDIUM);
      return;
    }
    setNotifying(true);
    // 담당자별로 그룹화
    const byStaff = new Map<number, { name: string; zones: string[] }>();
    for (const r of pending) {
      if (!r.assigned_staff_id) continue;
      const entry = byStaff.get(r.assigned_staff_id) ?? { name: r.assigned_staff_name, zones: [] };
      entry.zones.push(r.zone_label);
      byStaff.set(r.assigned_staff_id, entry);
    }
    try {
      await Promise.all(
        [...byStaff.entries()].map(([staffId, { name, zones }]) =>
          api.post("/api/notifications", {
            employee_id: staffId,
            title: "📦 진열 보충 요청",
            body: zones.length === 1
              ? `${zones[0]} 진열 보충이 필요합니다`
              : `${zones[0]} 외 ${zones.length - 1}개 구역 보충이 필요합니다`,
            type: "alert",
          })
        )
      );
      setNotifyToast(`${byStaff.size}명 담당자에게 알림을 전송했습니다`);
    } catch {
      setNotifyToast("알림 전송 중 오류가 발생했습니다");
    } finally {
      setNotifying(false);
      setTimeout(() => setNotifyToast(null), TIMING.TOAST_LONG);
    }
  }, [displayReqs]);

  // 로드
  const loadDisplayReqs = useCallback(async () => {
    setDisplayLoading(true);
    try {
      const empId = authSession?.employeeId;
      const url = !isManager && empId
        ? `/api/display-requests?scope=mine&employeeId=${empId}`
        : "/api/display-requests";
      const { data } = await api.get<any>(url);
      setDisplayReqs(Array.isArray(data) ? data : []);
    }
    catch { setDisplayReqs([]); } finally { setDisplayLoading(false); }
  }, [authSession?.employeeId, isManager]);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true);
    setOrderError(null);
    try {
      const { data } = await api.get<any>("/api/order-requests");
      setOrderReqs(data);
    } catch (e: any) { setOrderError(e?.message ?? "네트워크 오류"); setOrderReqs([]); }
    finally { setOrderLoading(false); }
  }, []);

  const loadMismatches = useCallback(async () => {
    setMismatchLoading(true);
    setMismatchError(null);
    try {
      const { data } = await api.get<any>("/api/zone-mismatches");
      setMismatches(data);
    } catch (e: any) { setMismatchError(e?.message ?? "네트워크 오류"); setMismatches([]); }
    finally { setMismatchLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const { data } = await api.get<any>("/api/stock-manage/low-stock");
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      // 실패 시 fallback: 정적 캐시
      const map = await getProductsMap();
      setProducts(Object.values(map));
    } finally { setProductsLoading(false); }
  }, []);

  const loadLunch = useCallback(async () => {
    setLunchLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await api.get<any>(`/api/lunch-requests?date=${today}`);
      setLunchRequests(data.requests ?? []);
    } catch { setLunchRequests([]); }
    finally { setLunchLoading(false); }
  }, []);

  const loadInventoryChecks = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const { data } = await api.get<any>("/api/inventory-checks");
      setInventoryChecks(Array.isArray(data) ? data : []);
    } catch { setInventoryChecks([]); }
    finally { setInventoryLoading(false); }
  }, []);

  const loadTabCounts = useCallback(async () => {
    try {
      const { data } = await api.get<any>("/api/requests/pending-counts");
      setTabCounts(data);
    } catch {}
  }, []);

  // 연차 pending 건수 · 별도 API
  const loadLeavePendingCount = useCallback(async () => {
    try {
      const { data: d } = await api.get<any>("/api/leave-requests/pending-count");
      setLeavePendingCount(Number(d?.count ?? 0));
    } catch {}
  }, []);

  useEffect(() => { loadTabCounts(); loadDisplayReqs(); loadOrderReqs(); loadMismatches(); loadLunch(); loadInventoryChecks(); loadLeavePendingCount(); }, []);
  // 2026-08-18 · 승인 요청 상태 변경 시 · 탭 카운트 + 리스트 즉시 재로드
  useApprovalRefreshListener(() => {
    loadTabCounts();
    loadLeavePendingCount();
    loadDisplayReqs();
    loadOrderReqs();
    loadMismatches();
    loadLunch();
  });
  useEffect(() => {
    if (tab === "order") { loadOrderReqs(); loadProducts(); }
  }, [tab]);
  // ✅ 실재고 수정 이벤트 수신 → 관련 데이터 자동 재조회
  useEffect(() => {
    const handler = () => { loadInventoryChecks(); loadOrderReqs(); loadProducts(); };
    window.addEventListener("inventory-checks-updated", handler);
    return () => window.removeEventListener("inventory-checks-updated", handler);
  }, [loadInventoryChecks, loadOrderReqs, loadProducts]);
  useEffect(() => {
    if (!dupOrderModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDupOrderModal(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dupOrderModal]);

  // 자동 갱신: 30초마다 pending-counts 폴링, 현재 탭 건수 변화 시 목록 재로드
  const prevCountsRef = useRef<typeof tabCounts>(null);
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data: counts } = await api.get<any>("/api/requests/pending-counts");
        const prev = prevCountsRef.current;
        setTabCounts(counts);
        prevCountsRef.current = counts;
        if (!prev) return;
        if (tab === "display"   && counts.display   !== prev.display)   loadDisplayReqs();
        if (tab === "order"     && counts.order     !== prev.order)     loadOrderReqs();
        if (tab === "mismatch"  && counts.mismatch  !== prev.mismatch)  loadMismatches();
        if (tab === "inventory" && counts.inventory !== prev.inventory) loadInventoryChecks();
        if (tab === "lunch"     && counts.lunch     !== prev.lunch)     loadLunch();
        // 2026-08-12 · 연차 pending 카운트 · 별도 API · 매 폴링 갱신
        loadLeavePendingCount();
      } catch {}
    }, 30_000);
    return () => clearInterval(interval);
  }, [tab, loadDisplayReqs, loadOrderReqs, loadMismatches, loadInventoryChecks, loadLunch]);

  // ── 단건 삭제 헬퍼 ──
  async function deleteOne(url: string) { await api.del(url); }

  // ── 진열 삭제 ── 2026-08-18 · 배지 갱신 dispatch
  const deleteDisplay = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/display-requests/${id}`)));
    setDisplayReqs(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedDisplay(new Set());
    dispatchApprovalChange("display");
  };

  // ── 발주 삭제 ── 2026-08-18 · 배지 갱신 dispatch
  const deleteOrder = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/order-requests/${id}`)));
    setOrderReqs(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedOrder(new Set());
    dispatchApprovalChange("order");
  };

  // ── 불일치 삭제 ── 2026-08-18 · 배지 갱신 dispatch
  const deleteMismatch = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/zone-mismatches/${id}`)));
    setMismatches(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedMismatch(new Set());
    dispatchApprovalChange("mismatch");
  };

  // ── 실재고 삭제 ──
  const deleteInventory = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/inventory-checks/${id}`)));
    setInventoryChecks(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedInventory(new Set());
  };

  const doSubmitOrderRequest = async (p: ProductInfo, stockOverride?: number | null) => {
    setRequestingOrder(prev => new Set([...prev, p.code]));
    setOrderRequestError(null);
    const currentStock = stockOverride !== undefined ? stockOverride : (p.current_stock != null ? Number(p.current_stock) : null);
    try {
      await api.post("/api/order-requests", {
        product_code: p.code, product_name: p.name,
        current_stock: currentStock,
        optimal_stock: p.optimal_stock != null ? Number(p.optimal_stock) : null, note: "",
      });
      await loadOrderReqs();
      // 2026-08-18 · 발주 요청 배지 즉시 갱신
      dispatchApprovalChange("order");
    } catch (e: any) { setOrderRequestError(e?.message ?? "네트워크 오류 — 다시 시도해주세요"); }
    finally { setRequestingOrder(prev => { const s = new Set(prev); s.delete(p.code); return s; }); }
  };

  const handleRequestOrder = (p: ProductInfo) => {
    const existing = orderReqs.find(r => r.product_code === p.code);
    if (existing) {
      setDupOrderModal({ existing, product: p, editStock: p.current_stock != null ? Number(p.current_stock) : "" });
      return;
    }
    doSubmitOrderRequest(p);
  };

  const handleOrderFromInventory = async (r: InventoryCheck) => {
    const existing = orderReqs.find(o => o.product_code === r.product_code);
    if (existing) {
      const fakeProduct = { code: r.product_code, name: r.product_name, spec: "", current_stock: r.system_stock, optimal_stock: r.optimal_stock } as ProductInfo;
      setDupOrderModal({ existing, product: fakeProduct, editStock: r.system_stock ?? "" });
      return;
    }
    setRequestingInvOrder(prev => new Set([...prev, r.product_code]));
    try {
      await api.post("/api/order-requests", { product_code: r.product_code, product_name: r.product_name, current_stock: r.system_stock, optimal_stock: r.optimal_stock, note: "" });
      await loadOrderReqs();
      // 2026-08-18 · 발주 요청 배지 즉시 갱신
      dispatchApprovalChange("order");
    } finally {
      setRequestingInvOrder(prev => { const s = new Set(prev); s.delete(r.product_code); return s; });
    }
  };

  // 선택 토글 헬퍼
  function toggleOne(set: Set<string>, id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll<T extends { id: string }>(items: T[], selected: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(selected.size === items.length && items.length > 0 ? new Set() : new Set(items.map(r => r.id)));
  }

  // 상품코드 → 최신 실재고 (창고+매장 합계) 맵
  const invStockMap = new Map<string, { warehouse: number | null; store: number | null; total: number }>();
  for (const inv of inventoryChecks) {
    if (!invStockMap.has(inv.product_code)) {
      const total = (inv.warehouse_stock ?? 0) + (inv.store_stock ?? 0);
      invStockMap.set(inv.product_code, { warehouse: inv.warehouse_stock, store: inv.store_stock, total });
    }
  }

  const requestedCodes = new Set(orderReqs.map(r => r.product_code));
  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
    return !isNaN(cur) && !isNaN(opt) && opt > 0 && cur < opt;
  }).sort((a, b) => (Number(b.optimal_stock) - Number(b.current_stock)) - (Number(a.optimal_stock) - Number(a.current_stock)));

  const pending = displayReqs.filter(r => r.status === "pending");

  // 탭 갯수: 로딩 중이면 pending-counts 값을, 로딩 완료 후엔 실제 데이터 값을 사용
  const displayTabCount   = displayLoading   ? (tabCounts?.display   ?? 0) : pending.length;
  const orderTabCount     = orderLoading     ? (tabCounts?.order     ?? 0) : orderReqs.length;
  const mismatchTabCount  = mismatchLoading  ? (tabCounts?.mismatch  ?? 0) : mismatches.length;
  const inventoryTabCount = inventoryLoading ? (tabCounts?.inventory ?? 0) : inventoryChecks.length;
  const lunchTabCount     = lunchLoading     ? (tabCounts?.lunch     ?? 0) : lunchRequests.filter(r => !r.eating).length;

  const eatCount = lunchRequests.filter(r => r.eating).length;
  const noEatCount = lunchRequests.filter(r => !r.eating).length;

  // 2026-08-10 · 사용자 요청 · 구역불일치 탭 제거 · 관리자 전용 탭: 실재고차이 · 점심불참
  const TABS: [Tab, string, number, string, string, string, string][] = [
    ["display",   isManager ? "진열요청" : "내가 받은 요청",   displayTabCount,   "bg-white text-zinc-900 ring-zinc-200/70",  "text-zinc-800", "bg-indigo-100 text-indigo-700",  "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"],
    ...(isManager ? ([
      ["inventory", "실재고차이", inventoryTabCount, "bg-white text-zinc-900 ring-zinc-200/70",  "text-zinc-800", "bg-indigo-100 text-indigo-700",  "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"],
      ["lunch",     "점심불참",   lunchTabCount,     "bg-white text-zinc-900 ring-zinc-200/70",  "text-zinc-800", "bg-indigo-100 text-indigo-700",  "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"],
      ["leave",     "연차승인",   leavePendingCount, "bg-white text-zinc-900 ring-zinc-200/70",  "text-zinc-800", "bg-indigo-100 text-indigo-700",  "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"],
    ] as [Tab, string, number, string, string, string, string][]) : []),
  ];

  // 공통 체크박스
  const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} className="shrink-0 cursor-pointer text-gray-300 hover:text-gray-500 transition">
      {checked ? <CheckSquare size={16} className="text-rose-500" /> : <Square size={16} />}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA]">
      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="requests"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* 2026-08-17 · 탭 바 · 최신 트렌드 · 딥네이비 segmented pill · 통일 (프레임워크 톤) */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-line sticky top-14 z-20 shadow-sm">
        <div className="max-w-[1360px] mx-auto w-full px-2 sm:px-4 py-2">
          <div className="inline-flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
            {TABS.map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-3 sm:px-4 py-1.5 flex items-center gap-2 rounded-md text-[15px] sm:text-[16px] font-semibold transition-colors cursor-pointer justify-center ${
                  tab === key
                    ? "bg-brand-deep text-white shadow-sm"
                    : "text-ink hover:text-brand-deep hover:bg-white"
                }`}>
                <span>{label}</span>
                {count > 0 && (
                  <span className={`text-[13px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${tab === key ? "bg-white/20 text-white" : "bg-brand-tint text-brand-deep"}`}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4">

        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · DisplayRequestTab */}
        {tab === "display" && (
          <DisplayRequestTab
            displayReqs={displayReqs}
            displayLoading={displayLoading}
            selectedDisplay={selectedDisplay}
            setSelectedDisplay={setSelectedDisplay}
            completingDisplay={completingDisplay}
            notifyToast={notifyToast}
            notifying={notifying}
            isManager={isManager}
            isAdminLevel8={isAdminLevel8}
            canPrepare={canPrepare}
            canComplete={canComplete}
            rw={rw}
            rr={rr}
            onToggleAll={() => toggleAll(displayReqs, selectedDisplay, setSelectedDisplay)}
            onToggleOne={(id) => toggleOne(selectedDisplay, id, setSelectedDisplay)}
            onDeleteSelected={() => deleteDisplay([...selectedDisplay])}
            onDeleteAll={async () => { if (await confirm({ message: `진열요청 전체 ${displayReqs.length}건을 삭제할까요?`, danger: true })) deleteDisplay(displayReqs.map(r => r.id)); }}
            onRefresh={loadDisplayReqs}
            onNotifyAll={handleNotifyAll}
            onPrepareDisplay={handlePrepareDisplay}
            onCompleteDisplay={handleCompleteDisplay}
          />
        )}

        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · OrderRequestTab */}
        {tab === "order" && (
          <OrderRequestTab
            orderReqs={orderReqs}
            orderLoading={orderLoading}
            orderError={orderError}
            orderRequestError={orderRequestError}
            selectedOrder={selectedOrder}
            productsLoading={productsLoading}
            lowStock={lowStock}
            invStockMap={invStockMap}
            requestedCodes={requestedCodes}
            requestingOrder={requestingOrder}
            onToggleAll={() => toggleAll(orderReqs, selectedOrder, setSelectedOrder)}
            onToggleOne={(id) => toggleOne(selectedOrder, id, setSelectedOrder)}
            onDeleteSelected={() => deleteOrder([...selectedOrder])}
            onDeleteAll={async () => { if (await confirm({ message: `발주요청 전체 ${orderReqs.length}건을 삭제할까요?`, danger: true })) deleteOrder(orderReqs.map(r => r.id)); }}
            onRefresh={loadOrderReqs}
            onRequestOrder={handleRequestOrder}
          />
        )}

        {/* ── 구역불일치 ── */}
        {tab === "mismatch" && (
          <div className="flex flex-col gap-2">
            <ListToolbar
              total={mismatches.length} selected={selectedMismatch.size}
              allChecked={selectedMismatch.size === mismatches.length && mismatches.length > 0}
              onToggleAll={() => toggleAll(mismatches, selectedMismatch, setSelectedMismatch)}
              onDeleteSelected={() => deleteMismatch([...selectedMismatch])}
              onDeleteAll={async () => { if (await confirm({ message: `구역불일치 전체 ${mismatches.length}건을 삭제할까요?`, danger: true })) deleteMismatch(mismatches.map(r => r.id)); }}
              onRefresh={loadMismatches} loading={mismatchLoading} accentColor="text-orange-600"
            />
            {mismatchLoading && mismatches.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-orange-50 border border-orange-200 rounded-md sticky top-0 z-10">
                <Spinner size={11} tone="orange" label="새로 불러오는 중..." labelSize={14} />
              </div>
            )}
            {mismatchLoading && mismatches.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
            ) : mismatchError ? (

              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm font-bold text-red-500">불러오기 오류</p>
                <p className="text-xs text-red-400 text-center px-4">{mismatchError}</p>
                <button onClick={loadMismatches} className="mt-2 text-xs text-orange-600 underline cursor-pointer">다시 시도</button>
              </div>
            ) : !mismatchLoading && mismatches.length === 0 ? (
              <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
            ) : (
              <div className={`${CARD_BASE} divide-y divide-zinc-50 ${mismatchLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {mismatches.map(m => (
                  <div key={m.id} className={`flex items-center gap-3 px-0.5 py-1.5 transition-all duration-150 ${selectedMismatch.has(m.id) ? "bg-rose-50/50" : "hover:bg-zinc-50/60"}`}>
                    <RequestCheckbox checked={selectedMismatch.has(m.id)} onChange={() => toggleOne(selectedMismatch, m.id, setSelectedMismatch)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-bold text-zinc-800 break-keep">{m.product_name}</span>
                        <span className="text-gray-300 text-[14px]">·</span>
                        <span className="text-[14px] font-semibold text-zinc-400">{m.product_code}</span>
                        <span className="text-gray-300 text-[14px]">·</span>
                        <span className="text-[15px] text-zinc-500" title="전산배치구역">전산 <span className="font-bold text-zinc-700">{m.spec_zone || "미지정"}</span></span>
                        <span className="text-gray-300 text-[14px]">→</span>
                        <span className="text-[15px] font-bold text-red-600" title="실제배치구역">실제 {m.real_zone}</span>
                      </div>
                    </div>
                    <span className="text-[14px] text-gray-400 shrink-0">{fmtDate(m.registered_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2026-08-22 · Framework Phase 4 · 별도 컴포넌트 이관 · InventoryCheckTab */}
        {tab === "inventory" && (
          <InventoryCheckTab
            inventoryChecks={inventoryChecks}
            inventoryLoading={inventoryLoading}
            selectedInventory={selectedInventory}
            displayReqsCount={displayReqs.length}
            orderReqsCount={orderReqs.length}
            requestedCodes={requestedCodes}
            requestingInvOrder={requestingInvOrder}
            invLogOpen={invLogOpen}
            setInvLogOpen={setInvLogOpen}
            onToggleAll={() => toggleAll(inventoryChecks, selectedInventory, setSelectedInventory)}
            onToggleOne={(id) => toggleOne(selectedInventory, id, setSelectedInventory)}
            onDeleteSelected={() => deleteInventory([...selectedInventory])}
            onDeleteAll={async () => { if (await confirm({ message: `실재고 점검 내역 전체 ${inventoryChecks.length}건을 삭제할까요?`, danger: true })) deleteInventory(inventoryChecks.map(r => r.id)); }}
            onRefresh={loadInventoryChecks}
            onOrderFromInventory={handleOrderFromInventory}
          />
        )}

        {/* ── 점심불참 ── */}
        {tab === "lunch" && (
          <div className="flex flex-col gap-3">
            {/* 요약 뱃지 */}
            <Card padding="none" className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Utensils size={14} className="text-emerald-500" />
                <span className="text-xs font-bold text-gray-700">오늘의 점심 불참 현황</span>
                <span className="text-[14px] text-gray-400">({lunchRequests.length}명 응답)</span>
              </div>
              <div className="flex items-center gap-2">
                {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                <div className="flex items-center gap-1 text-[15px] font-bold">
                  <StatusPill tone="emerald" size="md">🍱 {eatCount}명</StatusPill>
                  <StatusPill tone="zinc" size="md" icon={<UtensilsCrossed size={9} />}>{noEatCount}명</StatusPill>
                </div>
                <button onClick={loadLunch} className="p-1.5 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                  <RefreshCw size={12} className={lunchLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </Card>

            {lunchLoading && lunchRequests.length > 0 && (
              <div className="flex items-center justify-center py-1.5 mb-1 bg-zinc-100 border border-line rounded-md sticky top-0 z-10"><Spinner tone="zinc" size={11} label="새로 불러오는 중..." labelSize={14} /></div>
            )}
            {lunchLoading && lunchRequests.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} /></div>
            ) : !lunchLoading && lunchRequests.length === 0 ? (
              <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
            ) : (
              <div className={`${CARD_BASE} divide-y divide-zinc-50 ${lunchLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                {lunchRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-0.5 py-1.5 hover:bg-zinc-50/60 transition-all duration-150">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${r.eating ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{r.employee_name}</span>
                    {r.memo && <span className="text-[14px] text-gray-400 flex-1 min-w-0 break-keep">{r.memo}</span>}
                    <StatusPill tone={r.eating ? "emerald" : "zinc"} size="md">
                      {r.eating ? "🍱 식사" : "불참"}
                    </StatusPill>
                    <span className="text-[14px] text-gray-300 shrink-0">
                      {new Date(r.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 연차승인 (2026-08-12 · 관리자용 승인 목록 · LeavePage embedded mode="approval") ── */}
        {tab === "leave" && isManager && (
          <div className="flex flex-col gap-2">
            <LeavePage
              embedded
              mode="approval"
              authSession={authSession ?? null}
              onBack={onBack}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          </div>
        )}

      </main>

      {/* 발주요청 중복 확인 모달 */}
      <Modal
        open={!!dupOrderModal}
        onClose={() => setDupOrderModal(null)}
        size="sm"
        showClose={false}
        closeOnBackdrop={false}
        backdropIntensity="brand"
        className="!max-w-sm"
      >
        {dupOrderModal && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              {/* 2026-08-18 · IconTile 확산 · lg + orange · rounded-xl */}
              <IconTile icon={<ShoppingCart size={18} />} tone="orange" size="lg" shape="rounded-xl" />

              <div>
                <p className="font-bold text-gray-900 text-sm">이미 발주요청이 있습니다</p>
                <p className="text-[15px] text-gray-500 mt-0.5">실재고를 확인 후 업데이트하세요.</p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[14px] font-bold text-orange-600 uppercase tracking-wide">기존 발주요청</p>
              <p className="text-sm font-bold text-gray-900">{dupOrderModal.existing.product_name}</p>
              <p className="text-[15px] text-gray-500 font-semibold">{dupOrderModal.existing.product_code}</p>
              <div className="flex gap-3 mt-0.5">
                <span className="text-[15px] text-gray-500">기록 현재고: <strong className="text-gray-800">{dupOrderModal.existing.current_stock ?? "—"}</strong></span>
                <span className="text-[15px] text-gray-500">추천적정재고: <strong className="text-gray-800">{dupOrderModal.existing.optimal_stock ?? "—"}</strong></span>
              </div>
              <p className="text-[14px] text-gray-400">{fmtDate(dupOrderModal.existing.requested_at)} 요청됨</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-gray-500 uppercase tracking-wide">실재고 (현재)</label>
              <input
                type="number" min="0"
                value={dupOrderModal.editStock}
                onChange={e => setDupOrderModal(prev => prev ? { ...prev, editStock: e.target.value === "" ? "" : Number(e.target.value) } : null)}
                className="w-full text-xl font-bold text-center bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-brand-deep transition"
                placeholder="실재고 입력"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDupOrderModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-line text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const p = dupOrderModal.product;
                  const stock = dupOrderModal.editStock === "" ? null : dupOrderModal.editStock;
                  setDupOrderModal(null);
                  doSubmitOrderRequest(p, stock);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] transition cursor-pointer"
              >
                업데이트
              </button>
            </div>
          </div>
        )}
      </Modal>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};
