// src/components/StockManagePage/StockReconciliationTab.tsx
// 재고 3단계 검증 탭 — 순차 종속 워크플로
// [입고 리스트에서 상품 선택] → [사입: 관련 거래명세서 자동 조회 + 상세 확인]
//                              → [ERP: products 정보 자동 조회]
// 각 컬럼의 [확인] 버튼은 DB 자동 저장 · 세션도 필요 시 자동 생성

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PackageCheck,
  FileText,
  Server,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Pencil,
  X as XIcon,
  Loader2,
  Camera,
  Box,
  Package,
  Info,
  ArrowRight,
  ImageOff,
  ZoomIn,
  FileImage,
} from "lucide-react";
import { BarcodeScanner } from "../BarcodeScanner";
import type { AuthSession } from "../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReconciliationItem {
  id?: number;
  product_code: string;
  product_name: string;
  receiving_qty: number | null;
  invoice_qty: number | null;
  erp_qty: number | null;
  receiving_note?: string | null;
  erp_note?: string | null;
  _first_scan_at?: string;
  _last_scan_at?: string;
  _scan_count?: number;
  _receiving_date?: string; // 입고 날짜 (기본 오늘)
  // 담당자 확인 필드
  receiving_confirmed_by?: string | null;
  receiving_confirmed_at?: string | null;
  invoice_confirmed_by?: string | null;
  invoice_confirmed_at?: string | null;
}

interface ReconciliationSession {
  id: number;
  title: string;
  session_date: string;
  staff_name?: string | null;
  created_by?: string | null;
  status: "draft" | "receiving_done" | "invoice_matched" | "erp_done" | "finalized";
  created_at: string;
  items?: ReconciliationItem[];
}

interface ProductSearchResult {
  product_code: string;
  product_name: string;
}

interface OcrConfirmedItem {
  id?: number;
  saved_at?: string;
  invoice_date?: string | null; // 거래명세서 원본 날짜
  product_code: string | null;
  product_name: string;
  quantity: number | null;
  unit_price?: number | null;
  amount?: number | null;
  supplier?: string | null;
  expiry_date?: string | null;
  memo?: string | null;
  image_url?: string | null;      // Cloudinary 명세서 원본 이미지 URL
  image_public_id?: string | null;
}

interface ProductInfo {
  product_code: string;
  product_name: string;
  current_stock: number | null;
  purchase_price: number | null;
  sale_price: number | null;
  supplier: string | null;
  last_purchase_date: string | null;
  warehouse_stock: number | null;
  store_stock: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Scan/receiving note (de)serialization ──────────────────────────────────
interface ReceivingNoteMeta {
  first?: string;
  last?: string;
  count?: number;
  date?: string; // 입고 날짜
}

function serializeReceivingNote(item: ReconciliationItem): string | null {
  const meta: ReceivingNoteMeta = {
    first: item._first_scan_at,
    last: item._last_scan_at,
    count: item._scan_count,
    date: item._receiving_date,
  };
  if (!meta.first && !meta.last && !meta.count && !meta.date) {
    return item.receiving_note ?? null;
  }
  try {
    return `scan:${JSON.stringify(meta)}`;
  } catch {
    return null;
  }
}

function parseReceivingNote(note: string | null | undefined): ReceivingNoteMeta | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed.startsWith("scan:")) return null;
  try {
    const parsed = JSON.parse(trimmed.slice("scan:".length)) as ReceivingNoteMeta;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatScanTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  try {
    return n.toLocaleString("ko-KR") + "원";
  } catch {
    return String(n);
  }
}

// ─── Cloudinary URL transformation helpers ──────────────────────────────────
// upload 후 반환된 URL 은 https://res.cloudinary.com/{cloud}/image/upload/v.../{public_id}.{ext}
// URL path 의 /upload/ 뒤에 transformation 삽입 → 별도 API 호출 없이 실시간 변환 CDN 제공
function cloudinaryThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/\/upload\//.test(url)) return url;
  return url.replace("/upload/", "/upload/w_120,h_120,c_fit,q_auto,f_auto/");
}

function cloudinaryFull(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/\/upload\//.test(url)) return url;
  return url.replace("/upload/", "/upload/w_1600,c_limit,q_auto,f_auto/");
}

// ─── ProductSearchInput ──────────────────────────────────────────────────────

const ProductSearchInput: React.FC<{
  placeholder?: string;
  onSelect: (p: ProductSearchResult) => void;
  colorAccent: string;
}> = ({ placeholder = "상품 검색...", onSelect, colorAccent }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/products-search?q=${encodeURIComponent(q.trim())}&limit=15`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const arr: any[] = Array.isArray(data)
          ? data
          : data.items ?? data.rows ?? [];
        setResults(
          arr.slice(0, 15).map((p: any) => ({
            product_code: String(p.product_code ?? p.code ?? ""),
            product_name: String(p.product_name ?? p.name ?? ""),
          }))
        );
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (p: ProductSearchResult) => {
    onSelect(p);
    setQ("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-2.5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className={`w-full pl-7 pr-7 py-1.5 text-[12px] rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 ${colorAccent} transition placeholder:text-slate-400`}
        />
        {loading && (
          <Loader2 size={12} className="absolute right-2.5 text-slate-400 animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {results.map((p) => (
            <li key={p.product_code}>
              <button
                type="button"
                onMouseDown={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-slate-50 transition flex flex-col gap-0.5"
              >
                <span className="font-semibold text-slate-800 leading-tight">
                  {p.product_name}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {p.product_code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export const StockReconciliationTab: React.FC<{
  onOpenOcr?: () => void;
  authSession?: AuthSession | null;
}> = ({ onOpenOcr, authSession }) => {
  // 로그인한 사용자 이름 (없으면 빈 문자열)
  const sessionEmployeeName = (authSession?.employeeName ?? "").trim();
  // 세션 목록
  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 현재 세션
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionTitle, setSessionTitle] = useState(`재고대사 ${todayStr()}`);
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [staffName, setStaffName] = useState<string>(sessionEmployeeName);

  // authSession 이 나중에 준비될 수도 있으므로 · 비어있으면 자동 채움
  useEffect(() => {
    if (sessionEmployeeName && !staffName.trim()) {
      setStaffName(sessionEmployeeName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEmployeeName]);
  const [sessionStatus, setSessionStatus] = useState<
    "draft" | "receiving_done" | "invoice_matched" | "erp_done" | "finalized"
  >("draft");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // 아이템 리스트 (입고 컬럼 = 소스 오브 트루스)
  const [items, setItems] = useState<ReconciliationItem[]>([]);

  // 상태
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  // 바코드 스캐너
  const [showScanner, setShowScanner] = useState(false);

  // 순차 종속 선택 상태
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(
    null
  );

  // 사입 컬럼: 관련 명세서 리스트 + 선택된 명세서
  const [relatedInvoiceItems, setRelatedInvoiceItems] = useState<
    OcrConfirmedItem[]
  >([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [selectedInvoiceItemId, setSelectedInvoiceItemId] = useState<
    number | null
  >(null);

  // ERP 컬럼: products 정보
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [productInfoLoading, setProductInfoLoading] = useState(false);

  // 명세서 이미지 라이트박스 (Cloudinary 원본 확대)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);
  useEffect(() => { setImgLoadFailed(false); }, [selectedInvoiceItemId]);
  // ESC 로 라이트박스 닫기
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  // ── 세션 목록 로드 ──────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/stock-reconciliation?limit=20");
      const d = res.ok ? await res.json() : {};
      setSessions(Array.isArray(d.sessions) ? d.sessions : []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── 세션 로드 ──────────────────────────────────────────────────────────────
  const loadSession = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/stock-reconciliation/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      const s: ReconciliationSession = d.session ?? d;
      const rawItems: ReconciliationItem[] = Array.isArray(d.items)
        ? d.items
        : Array.isArray(s.items)
        ? s.items
        : [];
      setSessionId(s.id);
      setSessionTitle(s.title ?? `재고대사 ${todayStr()}`);
      setSessionDate(s.session_date?.slice(0, 10) ?? todayStr());
      setStaffName(s.staff_name ?? s.created_by ?? "");
      setSessionStatus(s.status ?? "draft");
      const hydrated = rawItems.map((it) => {
        const meta = parseReceivingNote(it.receiving_note);
        if (!meta) return it;
        return {
          ...it,
          _first_scan_at: meta.first,
          _last_scan_at: meta.last,
          _scan_count: typeof meta.count === "number" ? meta.count : undefined,
          _receiving_date: meta.date,
        };
      });
      setItems(hydrated);
      setSelectedProductCode(null);
      setRelatedInvoiceItems([]);
      setSelectedInvoiceItemId(null);
      setProductInfo(null);
      setSidebarOpen(false);
    } catch {
      /* 우아하게 실패 */
    }
  }, []);

  // ── 세션 신규 ──────────────────────────────────────────────────────────────
  const newSession = () => {
    setSessionId(null);
    setSessionTitle(`재고대사 ${todayStr()}`);
    setSessionDate(todayStr());
    setStaffName(sessionEmployeeName);
    setSessionStatus("draft");
    setItems([]);
    setSelectedProductCode(null);
    setRelatedInvoiceItems([]);
    setSelectedInvoiceItemId(null);
    setProductInfo(null);
    setSaveMsg(null);
    setSidebarOpen(false);
  };

  // ── 세션 없으면 자동 생성 (title=자동·YYYY-MM-DD) ────────────────────────
  // staff_name: 우선순위 → authSession.employeeName > 입력된 staffName > null
  const ensureSession = useCallback(async (): Promise<number> => {
    if (sessionId) return sessionId;
    const autoStaff =
      sessionEmployeeName || staffName.trim() || null;
    const res = await fetch("/api/stock-reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sessionTitle || `자동 · ${todayStr()}`,
        session_date: sessionDate || todayStr(),
        created_by: autoStaff,
        staff_name: autoStaff,
      }),
    });
    if (!res.ok) throw new Error("세션 생성 실패");
    const d = await res.json();
    const id: number | undefined = d.id ?? d.session?.id;
    if (!id) throw new Error("세션 ID 없음");
    setSessionId(id);
    // 로컬 staffName state 도 동기화
    if (autoStaff && !staffName.trim()) setStaffName(autoStaff);
    return id;
  }, [sessionId, sessionTitle, sessionDate, staffName, sessionEmployeeName]);

  // ── 담당자 이름 확보 ─────────────────────────────────────────────────
  // 우선순위: authSession.employeeName > 세션 staffName > window.prompt (마지막 폴백)
  const ensureStaff = useCallback((): string | null => {
    if (sessionEmployeeName) return sessionEmployeeName;
    if (staffName.trim()) return staffName.trim();
    const name = window.prompt("담당자 이름을 입력하세요") ?? "";
    const trimmed = name.trim();
    if (!trimmed) return null;
    setStaffName(trimmed);
    return trimmed;
  }, [staffName, sessionEmployeeName]);

  // ── 입고 리스트에 상품 추가/증가 ──────────────────────────────────────
  const addProductToReceiving = useCallback(
    (product: ProductSearchResult, qtyDelta: number = 0) => {
      setItems((prev) => {
        const idx = prev.findIndex(
          (it) => it.product_code === product.product_code
        );
        if (idx >= 0) {
          if (qtyDelta === 0) return prev; // 중복 검색 → 변경 없음
          const updated = [...prev];
          const cur = updated[idx];
          updated[idx] = {
            ...cur,
            receiving_qty: (cur.receiving_qty ?? 0) + qtyDelta,
          };
          return updated;
        }
        return [
          ...prev,
          {
            product_code: product.product_code,
            product_name: product.product_name,
            receiving_qty: qtyDelta > 0 ? qtyDelta : null,
            invoice_qty: null,
            erp_qty: null,
            _receiving_date: todayStr(),
          },
        ];
      });
    },
    []
  );

  // ── 입고 수량 · 날짜 인라인 편집 ─────────────────────────────────────
  const updateReceivingQty = useCallback(
    (product_code: string, val: string) => {
      const num = val === "" ? null : parseInt(val, 10);
      setItems((prev) =>
        prev.map((it) =>
          it.product_code === product_code
            ? { ...it, receiving_qty: isNaN(num as number) ? null : num }
            : it
        )
      );
    },
    []
  );

  const updateReceivingDate = useCallback(
    (product_code: string, val: string) => {
      setItems((prev) =>
        prev.map((it) =>
          it.product_code === product_code
            ? { ...it, _receiving_date: val || undefined }
            : it
        )
      );
    },
    []
  );

  // ── 아이템 삭제 (DB · 로컬) ──────────────────────────────────────────
  const removeItem = useCallback(
    async (item: ReconciliationItem) => {
      if (!window.confirm(`"${item.product_name}" 를 리스트에서 제거할까요?`)) {
        return;
      }
      // DB 삭제 (id 있을 때)
      if (sessionId && item.id != null) {
        try {
          await fetch(
            `/api/stock-reconciliation/${sessionId}/items/${item.id}`,
            { method: "DELETE" }
          );
        } catch {
          /* silent */
        }
      }
      setItems((prev) =>
        prev.filter((it) => it.product_code !== item.product_code)
      );
      if (selectedProductCode === item.product_code) {
        setSelectedProductCode(null);
        setRelatedInvoiceItems([]);
        setSelectedInvoiceItemId(null);
        setProductInfo(null);
      }
    },
    [sessionId, selectedProductCode]
  );

  // ── 단일 아이템 upsert (DB 반영 · 반환된 id/필드로 로컬 병합) ──────────
  const upsertItemToDb = useCallback(
    async (id: number, item: ReconciliationItem) => {
      const payloadItem = {
        product_code: item.product_code,
        product_name: item.product_name,
        receiving_qty: item.receiving_qty,
        invoice_qty: item.invoice_qty,
        erp_qty: item.erp_qty,
        receiving_note: serializeReceivingNote(item),
        erp_note: item.erp_note ?? null,
      };
      const res = await fetch(`/api/stock-reconciliation/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [payloadItem] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "저장 실패");
      }
      const d = await res.json();
      const returned: ReconciliationItem | undefined = d.items?.[0];
      if (returned) {
        setItems((prev) =>
          prev.map((it) =>
            it.product_code === returned.product_code
              ? {
                  ...it,
                  ...returned,
                  // 로컬 스캔 메타 유지 (서버는 note 문자열만 앎)
                  _first_scan_at: it._first_scan_at,
                  _last_scan_at: it._last_scan_at,
                  _scan_count: it._scan_count,
                  _receiving_date: it._receiving_date,
                }
              : it
          )
        );
      }
      return returned?.id;
    },
    []
  );

  // ── 확인 (receiving / invoice) API 호출 ─────────────────────────────
  const callConfirm = useCallback(
    async (
      itemId: number,
      stage: "receiving" | "invoice",
      confirmedBy: string,
      sid: number,
      confirmedAt?: string
    ) => {
      const res = await fetch(
        `/api/stock-reconciliation/${sid}/items/${itemId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage,
            confirmed_by: confirmedBy,
            confirmed_at: confirmedAt ?? null,
          }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "확인 처리 실패");
      }
      const d = await res.json();
      const updated: ReconciliationItem | undefined = d.item;
      if (updated) {
        setItems((prev) =>
          prev.map((it) =>
            it.product_code === updated.product_code
              ? {
                  ...it,
                  ...updated,
                  _first_scan_at: it._first_scan_at,
                  _last_scan_at: it._last_scan_at,
                  _scan_count: it._scan_count,
                  _receiving_date: it._receiving_date,
                }
              : it
          )
        );
      }
      return updated;
    },
    []
  );

  // ── [입고 확인] 클릭 → 세션 자동 생성 · DB 저장 · confirm 호출 ────────
  const handleReceivingConfirm = useCallback(
    async (item: ReconciliationItem) => {
      if (item.receiving_qty == null || item.receiving_qty <= 0) {
        setSaveMsg("실물 갯수를 입력하세요");
        setTimeout(() => setSaveMsg(null), 2500);
        return;
      }
      const staff = ensureStaff();
      if (!staff) return;
      try {
        const sid = await ensureSession();
        let itemId = item.id;
        if (itemId == null) {
          itemId = await upsertItemToDb(sid, item);
        } else {
          // 최신 수량/날짜 반영
          await upsertItemToDb(sid, item);
        }
        if (itemId == null) {
          throw new Error("아이템 ID 획득 실패");
        }
        // 확인 토글: 이미 확인되어 있으면 취소
        const alreadyConfirmed = !!item.receiving_confirmed_by;
        // 서버 receiving_confirmed_at 를 사용자 지정 입고 날짜로 세팅
        const receivingDate = item._receiving_date || todayStr();
        await callConfirm(
          itemId,
          "receiving",
          alreadyConfirmed ? "" : staff,
          sid,
          alreadyConfirmed ? undefined : receivingDate,
        );
        setSaveMsg(alreadyConfirmed ? "입고 확인 취소" : "입고 확인 완료");
        setTimeout(() => setSaveMsg(null), 2000);
        await loadSessions();
      } catch (e: any) {
        setSaveMsg(e?.message ?? "저장 오류");
        setTimeout(() => setSaveMsg(null), 3500);
      }
    },
    [ensureSession, ensureStaff, upsertItemToDb, callConfirm, loadSessions]
  );

  // ── 입고 리스트에서 상품 선택 → 나머지 컬럼 갱신 ─────────────────────
  const selectProduct = useCallback(
    async (productCode: string) => {
      // 같은 상품 다시 클릭 → 선택 해제
      if (selectedProductCode === productCode) {
        setSelectedProductCode(null);
        setRelatedInvoiceItems([]);
        setSelectedInvoiceItemId(null);
        setProductInfo(null);
        return;
      }
      setSelectedProductCode(productCode);
      setSelectedInvoiceItemId(null);

      // 사입 컬럼: 관련 명세서 자동 조회
      setRelatedLoading(true);
      setRelatedInvoiceItems([]);
      fetch(
        `/api/ocr-confirmed-items?product_code=${encodeURIComponent(
          productCode
        )}&limit=20`
      )
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          const raw: any[] = Array.isArray(d.items)
            ? d.items
            : Array.isArray(d)
            ? d
            : [];
          const filtered = raw.filter(
            (x: any) => String(x.product_code ?? "") === productCode
          );
          const arr = (filtered.length > 0 ? filtered : raw).map((x: any) => ({
            id: typeof x.id === "number" ? x.id : Number(x.id),
            saved_at: x.saved_at ?? x.created_at,
            invoice_date: x.invoice_date ?? null,
            product_code: x.product_code ?? null,
            product_name: String(x.product_name ?? ""),
            quantity: x.quantity != null ? Number(x.quantity) : null,
            unit_price: x.unit_price != null ? Number(x.unit_price) : null,
            amount: x.amount != null ? Number(x.amount) : null,
            supplier: x.supplier ?? null,
            expiry_date: x.expiry_date ?? null,
            memo: x.memo ?? null,
            image_url: x.image_url ?? null,
            image_public_id: x.image_public_id ?? null,
          }));
          setRelatedInvoiceItems(arr);
        })
        .catch(() => setRelatedInvoiceItems([]))
        .finally(() => setRelatedLoading(false));

      // ERP 컬럼: products 정보 자동 조회
      setProductInfoLoading(true);
      setProductInfo(null);
      fetch(`/api/products-search?q=${encodeURIComponent(productCode)}&limit=5`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const arr: any[] = Array.isArray(data)
            ? data
            : data.items ?? data.rows ?? [];
          const hit = arr.find(
            (p: any) => String(p.product_code ?? "") === productCode
          );
          if (hit) {
            setProductInfo({
              product_code: String(hit.product_code ?? ""),
              product_name: String(hit.product_name ?? ""),
              current_stock:
                hit.current_stock != null ? Number(hit.current_stock) : null,
              purchase_price:
                hit.purchase_price != null ? Number(hit.purchase_price) : null,
              sale_price:
                hit.sale_price != null ? Number(hit.sale_price) : null,
              supplier: hit.supplier ?? null,
              last_purchase_date: hit.last_purchase_date ?? null,
              warehouse_stock:
                hit.warehouse_stock != null
                  ? Number(hit.warehouse_stock)
                  : null,
              store_stock:
                hit.store_stock != null ? Number(hit.store_stock) : null,
            });
          } else {
            setProductInfo(null);
          }
        })
        .catch(() => setProductInfo(null))
        .finally(() => setProductInfoLoading(false));
    },
    [selectedProductCode]
  );

  // ── 사입 [맞는지 확인] 클릭 → invoice_qty 저장 + confirm ────────────
  const handleInvoiceConfirm = useCallback(
    async (chosen: OcrConfirmedItem) => {
      if (!selectedProductCode) return;
      const target = items.find(
        (it) => it.product_code === selectedProductCode
      );
      if (!target) {
        setSaveMsg("입고 리스트에 없는 상품입니다");
        setTimeout(() => setSaveMsg(null), 2500);
        return;
      }
      const staff = ensureStaff();
      if (!staff) return;
      try {
        const sid = await ensureSession();
        const updatedLocal: ReconciliationItem = {
          ...target,
          invoice_qty:
            chosen.quantity != null ? Math.round(chosen.quantity) : target.invoice_qty,
        };
        // 로컬 반영
        setItems((prev) =>
          prev.map((it) =>
            it.product_code === target.product_code ? updatedLocal : it
          )
        );
        const itemId = target.id ?? (await upsertItemToDb(sid, updatedLocal));
        if (itemId == null) throw new Error("아이템 ID 획득 실패");
        if (target.id != null) {
          await upsertItemToDb(sid, updatedLocal);
        }
        const alreadyConfirmed = !!target.invoice_confirmed_by;
        await callConfirm(
          itemId,
          "invoice",
          alreadyConfirmed ? "" : staff,
          sid
        );
        setSaveMsg(alreadyConfirmed ? "사입 확인 취소" : "사입 확인 완료");
        setTimeout(() => setSaveMsg(null), 2000);
      } catch (e: any) {
        setSaveMsg(e?.message ?? "사입 확인 오류");
        setTimeout(() => setSaveMsg(null), 3500);
      }
    },
    [
      items,
      selectedProductCode,
      ensureSession,
      ensureStaff,
      upsertItemToDb,
      callConfirm,
    ]
  );

  // ── ERP [반영 확인] 클릭 → erp_qty = current_stock 저장 + erp_note ──
  const handleErpConfirm = useCallback(async () => {
    if (!selectedProductCode || !productInfo) return;
    const target = items.find((it) => it.product_code === selectedProductCode);
    if (!target) return;
    const staff = ensureStaff();
    if (!staff) return;
    try {
      const sid = await ensureSession();
      const now = new Date().toISOString();
      const alreadyConfirmed =
        !!target.erp_note && target.erp_note.startsWith("erp_confirmed:");
      const nextErpNote = alreadyConfirmed
        ? null
        : `erp_confirmed:${JSON.stringify({ by: staff, at: now })}`;
      const nextErpQty = alreadyConfirmed
        ? target.erp_qty
        : productInfo.current_stock ?? target.receiving_qty;
      const updatedLocal: ReconciliationItem = {
        ...target,
        erp_qty: nextErpQty,
        erp_note: nextErpNote,
      };
      setItems((prev) =>
        prev.map((it) =>
          it.product_code === target.product_code ? updatedLocal : it
        )
      );
      await upsertItemToDb(sid, updatedLocal);
      setSaveMsg(alreadyConfirmed ? "ERP 확인 취소" : "ERP 확인 완료");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setSaveMsg(e?.message ?? "ERP 확인 오류");
      setTimeout(() => setSaveMsg(null), 3500);
    }
  }, [
    items,
    selectedProductCode,
    productInfo,
    ensureSession,
    ensureStaff,
    upsertItemToDb,
  ]);

  // ── 바코드 스캔 → 입고 리스트 +1 · 스캔 메타 갱신 ────────────────────
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(
        `/api/products-search?q=${encodeURIComponent(trimmed)}&limit=1`
      );
      if (!res.ok) throw new Error("검색 실패");
      const data = await res.json();
      const arr: any[] = Array.isArray(data)
        ? data
        : data.items ?? data.rows ?? [];
      const p = arr[0];
      if (!p) {
        alert(`바코드 ${trimmed}에 해당하는 상품을 찾을 수 없습니다.`);
        return;
      }
      const productCode = String(p.product_code ?? p.code ?? "");
      const productName = String(p.product_name ?? p.name ?? "");
      if (!productCode) {
        alert("상품 코드를 확인할 수 없습니다.");
        return;
      }
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.product_code === productCode);
        const now = new Date().toISOString();
        if (idx >= 0) {
          const updated = [...prev];
          const cur = updated[idx];
          updated[idx] = {
            ...cur,
            receiving_qty: (cur.receiving_qty ?? 0) + 1,
            _first_scan_at: cur._first_scan_at ?? now,
            _last_scan_at: now,
            _scan_count: (cur._scan_count ?? 0) + 1,
            _receiving_date: cur._receiving_date ?? todayStr(),
          };
          return updated;
        }
        return [
          ...prev,
          {
            product_code: productCode,
            product_name: productName,
            receiving_qty: 1,
            invoice_qty: null,
            erp_qty: null,
            _first_scan_at: now,
            _last_scan_at: now,
            _scan_count: 1,
            _receiving_date: todayStr(),
          },
        ];
      });
    } catch {
      alert("상품 검색 실패");
    }
  }, []);

  // ── 완료 (finalize) ────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!sessionId) {
      setSaveMsg("먼저 항목 하나 이상을 확인하세요");
      setTimeout(() => setSaveMsg(null), 2500);
      return;
    }
    setFinalizing(true);
    setSaveMsg(null);
    try {
      const res = await fetch(
        `/api/stock-reconciliation/${sessionId}/finalize`,
        { method: "POST" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "완료 처리 실패");
      }
      setSessionStatus("finalized");
      setSaveMsg("완료 처리되었습니다");
      await loadSessions();
    } catch (e: any) {
      setSaveMsg(e?.message ?? "완료 오류");
    } finally {
      setFinalizing(false);
      setTimeout(() => setSaveMsg(null), 3500);
    }
  };

  // ── 파생: 선택된 아이템 · 3/3 진행률 ────────────────────────────────
  const selectedItem = useMemo(
    () =>
      selectedProductCode
        ? items.find((it) => it.product_code === selectedProductCode) ?? null
        : null,
    [selectedProductCode, items]
  );

  const selectedInvoiceItem = useMemo(
    () =>
      selectedInvoiceItemId != null
        ? relatedInvoiceItems.find((r) => r.id === selectedInvoiceItemId) ??
          null
        : null,
    [selectedInvoiceItemId, relatedInvoiceItems]
  );

  const progress = useMemo(() => {
    if (!selectedItem) return 0;
    let n = 0;
    if (selectedItem.receiving_confirmed_by) n++;
    if (selectedItem.invoice_confirmed_by) n++;
    if (selectedItem.erp_note && selectedItem.erp_note.startsWith("erp_confirmed:"))
      n++;
    return n;
  }, [selectedItem]);

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 min-h-0 w-full">
      {/* 바코드 스캐너 */}
      {showScanner && (
        <BarcodeScanner
          title="입고 바코드 스캔"
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* 명세서 이미지 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-label="거래명세서 원본 이미지"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer border border-white/20"
            title="닫기 (ESC)"
          >
            <XIcon size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="거래명세서 원본"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-default"
          />
        </div>
      )}

      {/* 상단 툴바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5 flex flex-wrap items-center gap-2">
        {/* 세션 제목 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSessionTitle(titleDraft);
                    setEditingTitle(false);
                  }
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="flex-1 min-w-0 px-2 py-1 text-[13px] font-bold rounded-lg border border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 bg-sky-50"
              />
              <button
                type="button"
                onClick={() => {
                  setSessionTitle(titleDraft);
                  setEditingTitle(false);
                }}
                className="w-7 h-7 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-700 flex items-center justify-center cursor-pointer transition"
              >
                <CheckCircle2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setEditingTitle(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition"
              >
                <XIcon size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(sessionTitle);
                setEditingTitle(true);
              }}
              className="flex items-center gap-1.5 text-[13px] font-black text-slate-800 hover:text-sky-700 transition cursor-pointer group"
            >
              <span className="truncate max-w-[220px]">{sessionTitle}</span>
              <Pencil
                size={11}
                className="text-slate-300 group-hover:text-sky-500 transition shrink-0"
              />
            </button>
          )}
          {sessionStatus === "finalized" && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              완료
            </span>
          )}
        </div>

        {/* 날짜 · 담당자 */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock size={11} />
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="border-0 bg-transparent text-[11px] text-slate-600 focus:outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <User size={11} />
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="담당자"
              className="w-16 border-0 bg-transparent text-[11px] text-slate-600 focus:outline-none placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* 세션 목록 토글 */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
        >
          <Clock size={12} />
          이력
          {sidebarOpen ? (
            <ChevronDown size={11} />
          ) : (
            <ChevronRight size={11} />
          )}
        </button>

        {/* 신규 */}
        <button
          type="button"
          onClick={newSession}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
        >
          <Plus size={12} />
          신규
        </button>

        {/* 완료 */}
        <button
          type="button"
          onClick={handleFinalize}
          disabled={
            finalizing ||
            sessionId === null ||
            sessionStatus === "finalized" ||
            items.length === 0
          }
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          title="이 세션을 finalize 처리"
        >
          {finalizing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCheck size={12} />
          )}
          완료
        </button>

        {/* 상태 메시지 */}
        {saveMsg && (
          <span
            className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
              saveMsg.includes("완료") || saveMsg.includes("취소")
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {saveMsg}
          </span>
        )}
      </div>

      {/* 세션 이력 사이드바 */}
      {sidebarOpen && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-black text-slate-700">
              최근 세션 이력
            </span>
            <button
              type="button"
              onClick={() => loadSessions()}
              className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer transition"
              title="새로고침"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2">
              <Loader2 size={14} className="animate-spin" />로딩 중...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-[11px] text-slate-300 py-6">
              저장된 세션이 없습니다
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSession(s.id)}
                  className={`w-full text-left px-0.5 py-1.5 text-[11px] transition flex items-center gap-2 ${
                    sessionId === s.id
                      ? "bg-emerald-50/50"
                      : "hover:bg-orange-50/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 truncate">
                      {s.title}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {s.session_date?.slice(0, 10)} ·{" "}
                      {s.staff_name ?? s.created_by ?? "담당자 없음"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                      s.status === "finalized"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.status === "finalized" ? "완료" : "임시"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 진행률 배너 (상품 선택 시) */}
      {selectedItem && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-slate-700 font-bold">
            <Info size={11} className="text-sky-500" />
            선택:
            <span className="text-slate-900 font-black">
              {selectedItem.product_name}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              [{selectedItem.product_code}]
            </span>
          </span>
          <span
            className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded-full border ${
              progress === 3
                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                : progress > 0
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-500 border-slate-200"
            }`}
          >
            3단계 확인 {progress}/3
          </span>
        </div>
      )}

      {/* 3컬럼 메인 레이아웃 */}
      <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
        {/* ── ① 입고 컬럼 (sky) ── */}
        <div className="flex flex-col flex-1 min-w-0 rounded-xl border border-sky-200 bg-white shadow-sm overflow-hidden">
          {/* 헤더 */}
          <div className="px-3 py-2.5 bg-sky-50/80 border-b border-sky-100 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <PackageCheck size={14} className="text-sky-600 shrink-0" />
              <span className="text-[13px] font-black text-slate-800 flex-1 leading-tight">
                ① 입고 · 실물 갯수
              </span>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-700 text-[10px] font-bold transition cursor-pointer border border-sky-200"
                title="바코드 스캔"
              >
                <Camera size={11} />
                스캔
              </button>
            </div>
            <span className="text-[11px] text-slate-500 leading-tight">
              상품 검색·스캔 → 실물 수량 입력 → [확인] 클릭
            </span>
          </div>

          {/* 검색 */}
          <div className="px-2.5 py-2 border-b border-slate-100">
            <ProductSearchInput
              placeholder="상품 검색/추가..."
              onSelect={(p) => addProductToReceiving(p, 0)}
              colorAccent="focus:ring-sky-200"
            />
          </div>

          {/* 리스트 */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 ? (
              <div className="text-center text-[11px] text-slate-300 py-6">상품을 추가하세요</div>
            ) : (
              items.map((it) => {
                const isSelected = selectedProductCode === it.product_code;
                const confirmed = !!it.receiving_confirmed_by;
                const scanCount = it._scan_count ?? 0;
                return (
                  <div
                    key={it.product_code}
                    className={`group border-b border-slate-50 last:border-0 transition-colors ${
                      isSelected
                        ? "bg-emerald-50/50"
                        : "hover:bg-orange-50/30"
                    }`}
                  >
                    {/* 한 줄 레이아웃: [상품명+코드] [스캔뱃지] [수량] [날짜] [확인] [삭제] */}
                    <div className="flex flex-row flex-nowrap items-center gap-1.5 px-2 py-1.5">
                      {/* 상품명 (클릭 = 선택) */}
                      <button
                        type="button"
                        onClick={() => selectProduct(it.product_code)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div
                          className={`text-[12px] font-semibold truncate leading-tight ${
                            isSelected ? "text-sky-800" : "text-slate-800"
                          }`}
                          title={it.product_name}
                        >
                          {it.product_name}
                        </div>
                        <div className="text-[9px] font-mono text-slate-400 truncate">
                          {it.product_code}
                        </div>
                      </button>

                      {/* 스캔 뱃지 */}
                      {scanCount > 0 && (
                        <span
                          className="shrink-0 text-[9px] font-black text-sky-700 bg-sky-100 border border-sky-200 rounded px-1 py-0.5 leading-none"
                          title={`처음: ${formatScanTime(it._first_scan_at)}  최근: ${formatScanTime(it._last_scan_at)}`}
                        >
                          <Camera size={8} className="inline mr-0.5 -mt-px" />
                          {scanCount}
                        </span>
                      )}

                      {/* 수량 (w-14) */}
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={it.receiving_qty ?? ""}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateReceivingQty(it.product_code, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="—"
                        className="shrink-0 w-14 text-center px-1 py-1 text-[12px] font-mono font-bold rounded border border-sky-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 transition"
                        title="실물 수량"
                      />

                      {/* 날짜 (w-28 · 기본 오늘) */}
                      <input
                        type="date"
                        value={it._receiving_date ?? todayStr()}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateReceivingDate(it.product_code, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 w-28 text-[10px] px-1 py-1 rounded border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-200 text-slate-600 cursor-pointer"
                        title="입고 날짜"
                      />

                      {/* 확인 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReceivingConfirm(it);
                        }}
                        className={`shrink-0 flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-black transition cursor-pointer whitespace-nowrap ${
                          confirmed
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200"
                            : "bg-sky-600 text-white border border-sky-700 hover:bg-sky-700"
                        }`}
                        title={
                          confirmed
                            ? `${it.receiving_confirmed_by} · ${
                                it.receiving_confirmed_at
                                  ? new Date(
                                      it.receiving_confirmed_at
                                    ).toLocaleString("ko-KR")
                                  : ""
                              } (클릭 → 취소)`
                            : "실물 수량 확정 · 리스트 등록"
                        }
                      >
                        {confirmed ? (
                          <>
                            <CheckCircle2 size={10} /> 확인됨
                          </>
                        ) : (
                          <>
                            <CheckCircle size={10} /> 확인
                          </>
                        )}
                      </button>

                      {/* 삭제 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(it);
                        }}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 푸터 */}
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{items.length}종</span>
            <span className="text-[12px] font-black text-sky-700">
              총{" "}
              {items
                .reduce((a, it) => a + (it.receiving_qty ?? 0), 0)
                .toLocaleString()}
              개
            </span>
          </div>
        </div>

        {/* ── ② 사입 컬럼 (violet) ── */}
        <div className="flex flex-col flex-1 min-w-0 rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-violet-50/80 border-b border-violet-100 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-violet-600 shrink-0" />
              <span className="text-[13px] font-black text-slate-800 flex-1 leading-tight">
                ② 사입 · 거래명세서
              </span>
              {onOpenOcr && (
                <button
                  type="button"
                  onClick={onOpenOcr}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold transition cursor-pointer border border-violet-700"
                  title="OCR 페이지로 이동"
                >
                  <FileText size={11} />
                  OCR
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-500 leading-tight">
              {selectedItem
                ? "관련 명세서 · 하나 선택 → 상세 확인"
                : "왼쪽 [입고] 리스트에서 상품을 선택하세요"}
            </span>
          </div>

          {/* 콘텐츠 */}
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
              <ArrowRight size={22} className="rotate-180" />
              <span className="text-[11px]">입고에서 상품을 선택하세요</span>
            </div>
          ) : (
            <>
              {/* 상단: 관련 명세서 리스트 */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-3 py-1.5 border-b border-violet-100 flex items-center gap-1.5 bg-violet-50/40">
                  <FileText size={11} className="text-violet-600" />
                  <span className="text-[11px] font-bold text-violet-800">
                    관련 명세서{" "}
                    {relatedInvoiceItems.length > 0 && (
                      <span className="font-mono">
                        ({relatedInvoiceItems.length})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-50">
                  {relatedLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2">
                      <Loader2 size={14} className="animate-spin" />로딩 중...
                    </div>
                  ) : relatedInvoiceItems.length === 0 ? (
                    <div className="text-center text-[11px] text-slate-300 py-6">
                      관련 명세서가 없습니다
                    </div>
                  ) : (
                    relatedInvoiceItems.map((r, i) => {
                      const key = r.id ?? -i - 1;
                      const isChosen =
                        r.id != null && r.id === selectedInvoiceItemId;
                      const toggleChosen = () => {
                        if (r.id != null) {
                          setSelectedInvoiceItemId(
                            isChosen ? null : (r.id as number)
                          );
                        }
                      };
                      return (
                        <div
                          key={key}
                          role="button"
                          tabIndex={0}
                          onClick={toggleChosen}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleChosen();
                            }
                          }}
                          className={`w-full text-left px-0.5 py-1.5 text-[11px] transition cursor-pointer ${
                            isChosen
                              ? "bg-emerald-50/50"
                              : "hover:bg-orange-50/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 truncate">
                              {r.supplier ?? "공급처 미상"}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono font-black text-violet-700">
                                {r.quantity ?? 0}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const full = cloudinaryFull(r.image_url);
                                  if (full) setLightboxUrl(full);
                                }}
                                disabled={!r.image_url}
                                className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition ${
                                  r.image_url
                                    ? "bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-300 cursor-pointer"
                                    : "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                                }`}
                                title={r.image_url ? "명세서 이미지 보기" : "이미지 없음"}
                              >
                                <FileImage size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {(r.invoice_date ?? r.saved_at)?.slice(0, 10) ?? "—"} ·{" "}
                            {formatCurrency(r.amount ?? null)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 하단: 선택된 명세서 상세 pane */}
              {selectedInvoiceItem && (
                <div className="border-t-2 border-violet-200 bg-violet-50/40 animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-violet-100 bg-violet-100/50">
                    <Info size={11} className="text-violet-700" />
                    <span className="text-[11px] font-black text-violet-800 flex-1">
                      명세서 상세
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedInvoiceItemId(null)}
                      className="w-5 h-5 rounded-md hover:bg-violet-200 flex items-center justify-center text-violet-700 cursor-pointer transition"
                      title="닫기"
                    >
                      <XIcon size={11} />
                    </button>
                  </div>
                  <dl className="px-3 py-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                    <dt className="text-slate-500">거래명세서 날짜</dt>
                    <dd className="font-mono text-slate-700">
                      {(selectedInvoiceItem.invoice_date ?? selectedInvoiceItem.saved_at)?.slice(0, 10) ?? "—"}
                    </dd>
                    <dt className="text-slate-500">공급사</dt>
                    <dd className="text-slate-700 truncate">
                      {selectedInvoiceItem.supplier ?? "—"}
                    </dd>
                    <dt className="text-slate-500">품명</dt>
                    <dd className="font-semibold text-slate-800 truncate">
                      {selectedInvoiceItem.product_name}
                    </dd>
                    <dt className="text-slate-500">수량</dt>
                    <dd className="font-mono font-black text-violet-700">
                      {selectedInvoiceItem.quantity ?? "—"}
                    </dd>
                    <dt className="text-slate-500">단가</dt>
                    <dd className="font-mono text-slate-700">
                      {formatCurrency(selectedInvoiceItem.unit_price ?? null)}
                    </dd>
                    <dt className="text-slate-500">금액</dt>
                    <dd className="font-mono font-bold text-slate-800">
                      {formatCurrency(selectedInvoiceItem.amount ?? null)}
                    </dd>
                    <dt className="text-slate-500">유통기한</dt>
                    <dd className="text-slate-700">
                      {selectedInvoiceItem.expiry_date ?? "—"}
                    </dd>
                    {selectedInvoiceItem.memo && (
                      <>
                        <dt className="text-slate-500">메모</dt>
                        <dd className="text-slate-700 truncate" title={selectedInvoiceItem.memo}>
                          {selectedInvoiceItem.memo}
                        </dd>
                      </>
                    )}
                  </dl>

                  {/* ── 명세서 이미지 프리뷰 (있으면 썸네일 · 클릭 시 라이트박스) ── */}
                  <div className="px-3 pb-2">
                    {selectedInvoiceItem.image_url && !imgLoadFailed ? (
                      <button
                        type="button"
                        onClick={() => {
                          const full = cloudinaryFull(selectedInvoiceItem.image_url);
                          if (full) setLightboxUrl(full);
                        }}
                        className="group relative w-full flex items-center gap-2 rounded-lg border border-violet-200 bg-white p-1.5 hover:bg-violet-50 hover:border-violet-400 transition cursor-pointer"
                        title="클릭하여 원본 크기로 보기"
                      >
                        <img
                          src={cloudinaryThumb(selectedInvoiceItem.image_url) ?? selectedInvoiceItem.image_url}
                          alt="거래명세서 원본"
                          onError={() => setImgLoadFailed(true)}
                          className="w-[100px] h-[100px] object-cover rounded border border-slate-100 bg-slate-50"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                          <span className="text-[10px] font-bold text-violet-700 flex items-center gap-1">
                            <ZoomIn size={10} />
                            원본 이미지
                          </span>
                          <span className="text-[10px] text-slate-500 leading-tight">
                            클릭하여 확대
                          </span>
                        </div>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2 py-1.5 text-slate-400">
                        <div className="w-[60px] h-[60px] rounded bg-slate-100 flex items-center justify-center border border-slate-200">
                          <ImageOff size={18} className="text-slate-300" />
                        </div>
                        <span className="text-[10px]">
                          {imgLoadFailed ? "이미지 로드 실패" : "이미지 없음"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="px-3 pb-2">
                    <button
                      type="button"
                      onClick={() => handleInvoiceConfirm(selectedInvoiceItem)}
                      className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                        selectedItem?.invoice_confirmed_by
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200"
                          : "bg-violet-600 text-white hover:bg-violet-700 border border-violet-700"
                      }`}
                      title={
                        selectedItem?.invoice_confirmed_by
                          ? `${selectedItem.invoice_confirmed_by} 확인 (클릭 → 취소)`
                          : "이 명세서가 맞습니다"
                      }
                    >
                      {selectedItem?.invoice_confirmed_by ? (
                        <>
                          <CheckCircle2 size={11} /> 사입 확인됨
                        </>
                      ) : (
                        <>
                          <CheckCircle size={11} /> 맞는지 확인
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── ③ ERP 컬럼 (emerald) ── */}
        <div className="flex flex-col flex-1 min-w-0 rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-emerald-50/80 border-b border-emerald-100 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-emerald-600 shrink-0" />
              <span className="text-[13px] font-black text-slate-800 flex-1 leading-tight">
                ③ ERP · 시스템 조회
              </span>
            </div>
            <span className="text-[11px] text-slate-500 leading-tight">
              {selectedItem
                ? "products 테이블 정보 (현재고 · 매입가 · 공급사)"
                : "왼쪽 [입고] 리스트에서 상품을 선택하세요"}
            </span>
          </div>

          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
              <ArrowRight size={22} className="rotate-180" />
              <span className="text-[11px]">입고에서 상품을 선택하세요</span>
            </div>
          ) : productInfoLoading ? (
            <div className="flex-1 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 py-4">
              <Loader2 size={13} className="animate-spin" />
              조회 중...
            </div>
          ) : !productInfo ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 gap-2 px-4 text-center">
              <AlertTriangle size={20} className="text-amber-500" />
              <span className="text-[11px] font-bold">ERP에 없는 상품</span>
              <span className="text-[10px]">
                products 테이블에서 조회되지 않았습니다
              </span>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
              {/* 상품 카드 */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                <div className="flex items-start gap-1.5">
                  <Package size={12} className="text-emerald-700 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-black text-slate-800 leading-tight">
                      {productInfo.product_name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {productInfo.product_code}
                    </div>
                  </div>
                </div>
              </div>

              {/* 재고 정보 */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Box size={11} className="text-emerald-600" />
                    현재고
                  </span>
                  <span
                    className={`font-mono font-black ${
                      productInfo.current_stock != null &&
                      productInfo.current_stock > 0
                        ? "text-emerald-700"
                        : "text-slate-400"
                    }`}
                  >
                    {productInfo.current_stock ?? "—"}
                  </span>
                </div>
                {productInfo.warehouse_stock != null && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">창고재고</span>
                    <span className="font-mono text-slate-600">
                      {productInfo.warehouse_stock}
                    </span>
                  </div>
                )}
                {productInfo.store_stock != null && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">매장재고</span>
                    <span className="font-mono text-slate-600">
                      {productInfo.store_stock}
                    </span>
                  </div>
                )}
              </div>

              {/* 가격 · 공급사 · 최근입고일 */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">매입가</span>
                  <span className="font-mono text-slate-700">
                    {formatCurrency(productInfo.purchase_price)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">판매가</span>
                  <span className="font-mono text-slate-700">
                    {formatCurrency(productInfo.sale_price)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">공급사</span>
                  <span className="text-slate-700 truncate max-w-[60%]">
                    {productInfo.supplier ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">최근입고일</span>
                  <span className="text-slate-700">
                    {productInfo.last_purchase_date?.slice(0, 10) ?? "—"}
                  </span>
                </div>
              </div>

              {/* ERP 반영 확인 버튼 */}
              <button
                type="button"
                onClick={handleErpConfirm}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                  selectedItem?.erp_note?.startsWith("erp_confirmed:")
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700"
                }`}
                title={
                  selectedItem?.erp_note?.startsWith("erp_confirmed:")
                    ? "ERP 반영 확인됨 (클릭 → 취소)"
                    : "ERP 정보 확인 · 마지막 단계 완료"
                }
              >
                {selectedItem?.erp_note?.startsWith("erp_confirmed:") ? (
                  <>
                    <CheckCircle2 size={11} /> ERP 확인됨
                  </>
                ) : (
                  <>
                    <CheckCircle size={11} /> ERP에 반영 확인
                  </>
                )}
              </button>
            </div>
          )}

          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/80 text-[11px] text-slate-500 text-center">
            {selectedItem
              ? productInfo
                ? "ERP 조회 완료"
                : "ERP 없음"
              : "선택 대기"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockReconciliationTab;
