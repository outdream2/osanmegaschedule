// src/components/LandingPage/UploadDataModal.tsx
// 2026-08-23 · Framework Phase 4 · ImportLogTab + StockUploadTab 분리
// 2026-08-23 · #191 · Modal primitive 마이그레이션
import React, { useState, useRef, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { Upload } from "lucide-react";
import { Table, CheckCircle } from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import { Modal } from "../common/Modal";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
import { PeriodCoverageWidget } from "./PeriodCoverageWidget";
import { ImportLogTab } from "./ImportLogTab";
import { StockUploadTab } from "./StockUploadTab";

interface UploadDataModalProps {
  open: boolean;
  onClose: () => void;
  authSession: AuthSession | null;
  isManagerOrAdmin: boolean;
}

export const UploadDataModal: React.FC<UploadDataModalProps> = ({ open, onClose, authSession, isManagerOrAdmin }) => {
  const confirm = useConfirm();
  const { showError } = useToast();

  // ── 서브탭 ──────────────────────────────────────────────────────────
  const [uploadTab, setUploadTab] = useState<"products" | "stock" | "vendors" | "purchase" | "log">("products");

  // ── 상품목록 업로드 ──────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; count?: number; msg?: string } | null>(null);
  const [importLog, setImportLog] = useState<{ timestamp: string; count: number }[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ── 공급사 업로드 ────────────────────────────────────────────────────
  const [vendorUploadFile, setVendorUploadFile] = useState<File | null>(null);
  const [vendorUploadLoading, setVendorUploadLoading] = useState(false);
  const [vendorUploadResult, setVendorUploadResult] = useState<{ ok: boolean; count?: number; inserted?: number; updated?: number; failed?: number; msg?: string } | null>(null);
  const vendorUploadInputRef = useRef<HTMLInputElement>(null);

  // ── 매입 업로드 ──────────────────────────────────────────────────────
  const [purchaseUploadFile, setPurchaseUploadFile] = useState<File | null>(null);
  const [purchaseFromDate, setPurchaseFromDate] = useState<string>("");
  const [purchaseToDate, setPurchaseToDate] = useState<string>("");
  const [purchaseImportBatches, setPurchaseImportBatches] = useState<Array<{ imported_at: string; count: number; startDate: string; endDate: string; periodStart: string | null; periodType: string | null }>>([]);
  const [purchaseUploadLoading, setPurchaseUploadLoading] = useState(false);
  const [purchaseUploadResult, setPurchaseUploadResult] = useState<{ ok: boolean; total?: number; inserted?: number; skipped?: number; msg?: string } | null>(null);
  const purchaseUploadInputRef = useRef<HTMLInputElement>(null);

  const purchasePeriodType: "early" | "mid" | "late" | null = (() => {
    if (!purchaseToDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseToDate)) return null;
    const dd = Number(purchaseToDate.slice(8, 10));
    return dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
  })();

  // ── 재고 업로드 ──────────────────────────────────────────────────────
  const [stockUploadFile, setStockUploadFile] = useState<File | null>(null);
  const [stockUploadLoading, setStockUploadLoading] = useState(false);
  const [stockUploadResult, setStockUploadResult] = useState<{ ok: boolean; updated?: number; total?: number; history?: number; snapshot_date?: string; msg?: string } | null>(null);
  const [stockImportLog, setStockImportLog] = useState<{
    timestamp: string;
    count: number;
    total?: number;
    snapshot_date?: string;
    start_date?: string | null;
    period_type?: "early" | "mid" | "late" | null;
    history?: number;
  }[]>([]);
  const [stockStartDate, setStockStartDate] = useState<string>("");
  const [stockEndDate, setStockEndDate] = useState<string>("");

  const stockPeriodType: "early" | "mid" | "late" | null = (() => {
    const m = /^\d{4}-\d{2}-(\d{2})$/.exec(stockEndDate);
    if (!m) return null;
    const dd = Number(m[1]);
    if (dd >= 1 && dd <= 10) return "early";
    if (dd >= 11 && dd <= 20) return "mid";
    if (dd >= 21 && dd <= 31) return "late";
    return null;
  })();

  // ── 임포트 목록 필터 ────────────────────────────────────────────────
  const [logFilter, setLogFilter] = useState<{
    type: "all" | "products" | "stock" | "purchase" | "vendors";
    from: string;
    to: string;
    search: string;
  }>({ type: "all", from: "", to: "", search: "" });

  // ── API 헬퍼 ────────────────────────────────────────────────────────
  const fetchImportLog = async () => {
    try {
      const { data } = await api.get<{ value?: unknown }>("/api/settings?key=product_import_log");
      const logs = Array.isArray(data?.value) ? data.value : [];
      setImportLog(logs as any);
    } catch { setImportLog([]); }
  };

  const fetchStockImportLog = async () => {
    try {
      const { data } = await api.get<unknown>("/api/stock-import-log");
      setStockImportLog(Array.isArray(data) ? data as any : []);
    } catch { setStockImportLog([]); }
  };

  const fetchPurchaseImportLog = async () => {
    try {
      const { data: j } = await api.get<{ batches?: any[] }>("/api/purchase-details/import-log");
      setPurchaseImportBatches(Array.isArray(j?.batches) ? j.batches : []);
    } catch { setPurchaseImportBatches([]); }
  };

  const handleClearImportLog = async () => {
    if (!await confirm({ message: "임포트 이력을 모두 삭제할까요?", danger: true })) return;
    await api.del("/api/product-import-log");
    setImportLog([]);
  };

  const handleClearStockImportLog = async () => {
    if (!await confirm({ message: "재고 임포트 이력을 모두 삭제할까요?", danger: true })) return;
    await api.del("/api/stock-import-log");
    setStockImportLog([]);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const canUpload = isManagerOrAdmin && !!authSession?.employeeId;
    if (!canUpload) return;
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const params = `managerId=${authSession!.employeeId}`;
      const buf = await uploadFile.arrayBuffer();
      const { data } = await api.post<{ count?: number }>(`/api/upload-products?${params}`, buf, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      setUploadResult({ ok: true, count: data?.count ?? 0 });
      await fetchImportLog();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "업로드 실패";
      setUploadResult({ ok: false, msg });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleVendorUpload = async () => {
    if (!vendorUploadFile) return;
    const canUpload = isManagerOrAdmin && !!authSession?.employeeId;
    if (!canUpload) return;
    setVendorUploadLoading(true);
    setVendorUploadResult(null);
    try {
      const params = `managerId=${authSession!.employeeId}`;
      const buf = await vendorUploadFile.arrayBuffer();
      const { data } = await api.post<{ count?: number; inserted?: number; updated?: number; failed?: number }>(
        `/api/upload-vendors?${params}`, buf,
        { headers: { "Content-Type": "application/octet-stream" } },
      );
      setVendorUploadResult({
        ok: true,
        count: data?.count ?? 0,
        inserted: data?.inserted ?? 0,
        updated: data?.updated ?? 0,
        failed: data?.failed ?? 0,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "업로드 실패";
      setVendorUploadResult({ ok: false, msg });
    } finally {
      setVendorUploadLoading(false);
    }
  };

  const handleStockUpload = async () => {
    if (!stockUploadFile) return;
    if (!authSession?.employeeId) return;
    if (!stockStartDate || !stockEndDate) {
      setStockUploadResult({ ok: false, msg: "시작재고일 · 종료재고일을 모두 입력하세요" });
      return;
    }
    if (stockStartDate > stockEndDate) {
      setStockUploadResult({ ok: false, msg: "시작재고일이 종료재고일보다 뒤에 있습니다" });
      return;
    }
    if (!stockPeriodType) {
      setStockUploadResult({ ok: false, msg: "종료재고일의 일(dd)로 초/중/하순 판정 실패" });
      return;
    }
    setStockUploadLoading(true);
    setStockUploadResult(null);
    try {
      const params = new URLSearchParams({ managerId: String(authSession.employeeId) });
      params.set("snapshot_date", stockEndDate);
      params.set("start_date", stockStartDate);
      params.set("period_type", stockPeriodType);
      const buf = await stockUploadFile.arrayBuffer();
      let res: { data: any };
      try {
        res = await api.post<any>(`/api/upload-stock?${params}`, buf, { headers: { "Content-Type": "application/octet-stream" } });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          const j = (err.data as any) ?? {};
          const ok = await confirm({
            message:
              `기간 ${j.period?.from ?? "?"} ~ ${j.period?.to ?? "?"} 에 ` +
              `이미 ${j.existingCount ?? "?"}행 재고 스냅샷이 있습니다.\n\n` +
              `[확인] 덮어쓰기\n[취소] 임포트 취소`,
            confirmLabel: "덮어쓰기",
          });
          if (!ok) {
            setStockUploadResult({ ok: false, msg: "임포트 취소 (기존 데이터 유지)" });
            setStockUploadLoading(false);
            return;
          }
          params.set("force", "true");
          res = await api.post<any>(`/api/upload-stock?${params}`, buf, { headers: { "Content-Type": "application/octet-stream" } });
        } else {
          throw err;
        }
      }
      setStockUploadResult({
        ok: true,
        updated: res.data.updated ?? 0,
        total: res.data.total ?? 0,
        history: res.data.history ?? 0,
        snapshot_date: res.data.snapshot_date,
      });
      await fetchStockImportLog();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "업로드 실패";
      setStockUploadResult({ ok: false, msg });
    } finally {
      setStockUploadLoading(false);
    }
  };

  const handlePurchaseUpload = async () => {
    if (!purchaseUploadFile) return;
    const canUpload = isManagerOrAdmin && !!authSession?.employeeId;
    if (!canUpload) return;
    setPurchaseUploadLoading(true);
    setPurchaseUploadResult(null);
    try {
      const managerId = String(authSession!.employeeId);
      const buf = await purchaseUploadFile.arrayBuffer();
      const params = new URLSearchParams({ managerId });
      params.set("filename", purchaseUploadFile.name);
      if (purchaseFromDate) params.set("from", purchaseFromDate);
      if (purchaseToDate) params.set("to", purchaseToDate);
      let j: any;
      try {
        const r = await api.post<any>(`/api/upload-purchase-details?${params}`, buf, { headers: { "Content-Type": "application/octet-stream" } });
        j = r.data;
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          const d = (err.data as any) ?? {};
          const ok = await confirm({
            message:
              `기간 ${d.period?.from ?? "?"} ~ ${d.period?.to ?? "?"} 에 ` +
              `이미 ${d.existingCount ?? "?"}행 매입 데이터가 있습니다.\n\n` +
              `[확인] 덮어쓰기\n[취소] 임포트 취소`,
            confirmLabel: "덮어쓰기",
          });
          if (!ok) {
            setPurchaseUploadResult({ ok: false, msg: "임포트 취소 (기존 데이터 유지)" });
            setPurchaseUploadLoading(false);
            return;
          }
          params.set("force", "true");
          const r2 = await api.post<any>(`/api/upload-purchase-details?${params}`, buf, { headers: { "Content-Type": "application/octet-stream" } });
          j = r2.data;
        } else {
          throw err;
        }
      }
      setPurchaseUploadResult({
        ok: true,
        total: j?.total,
        inserted: j?.inserted,
        skipped: j?.skipped,
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "업로드 실패";
      setPurchaseUploadResult({ ok: false, msg });
    } finally {
      setPurchaseUploadLoading(false);
    }
  };

  // ── open 시 초기화 및 로그 fetch ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setUploadTab("products");
    setUploadResult(null);
    setUploadFile(null);
    setStockUploadResult(null);
    setStockUploadFile(null);
    fetchImportLog();
    fetchStockImportLog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      icon={<IconTile icon={<Table size={15} weight="fill" />} tone="orange" size="lg" />}
      title="데이터 업로드"
      className="max-h-[92vh]"
    >

        {/* 서브탭 */}
        <div className="w-full mb-4">
          <div className="flex bg-zinc-100/70 border border-line/60 rounded-2xl p-1 gap-0.5 overflow-x-auto scrollbar-none">
            {(["products", "stock", "vendors", "purchase", "log"] as const).map(tab => {
              const labels: Record<typeof tab, string> = {
                products: "상품목록", stock: "재고리스트", vendors: "공급사관리", purchase: "매입상세", log: "임포트 목록",
              };
              const isActive = uploadTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === "vendors") { setVendorUploadResult(null); setVendorUploadFile(null); }
                    if (tab === "purchase") { setPurchaseUploadResult(null); setPurchaseUploadFile(null); fetchPurchaseImportLog(); }
                    if (tab === "log") { fetchImportLog(); fetchStockImportLog(); fetchPurchaseImportLog(); }
                    setUploadTab(tab);
                  }}
                  className={`flex-1 min-w-0 px-2 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-colors duration-150 cursor-pointer leading-tight ${isActive ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}
                >
                  {labels[tab]}
                  {tab === "log" && (importLog.length + stockImportLog.length + purchaseImportBatches.length) > 0 && (
                    <span className={`ml-1 text-[9px] font-mono rounded-full px-1.5 py-0.5 ${isActive ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-400"}`}>
                      {importLog.length + stockImportLog.length + purchaseImportBatches.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 상품목록 탭 ── */}
        {uploadTab === "products" && (
          <>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              xlsx 파일을 업로드하면 전체 상품 데이터가 DB에 임포트됩니다.<br />
              <span className="text-gray-400">기존 데이터는 모두 덮어씁니다.</span>
            </p>
            {uploadResult?.ok ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle size={36} className="text-emerald-500" weight="fill" />
                <p className="text-sm font-bold text-emerald-700">업로드 완료</p>
                <p className="text-xs text-gray-500">{uploadResult.count?.toLocaleString()}개 상품 등록됨</p>
                <button onClick={() => { setUploadResult(null); setUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) { setUploadFile(null); return; }
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  const validMime = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/octet-stream"];
                  if ((ext !== "xlsx" && ext !== "xls") || (!!file.type && !validMime.includes(file.type))) {
                    showError("형식이 다른 파일입니다. 상품리스트를 업로드해주세요.");
                    e.target.value = ""; return;
                  }
                  setUploadResult(null);
                  setUploadFile(file);
                }} />
                <button type="button" onClick={() => uploadInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-orange-400 text-gray-500 hover:text-orange-600 text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
                  <Upload size={16} />
                  {uploadFile ? uploadFile.name : "파일 선택 (.xlsx)"}
                </button>
                {uploadResult?.ok === false && (
                  <p className="text-xs text-rose-500 font-semibold text-center">{uploadResult.msg}</p>
                )}
                <button type="button" disabled={!uploadFile || uploadLoading} onClick={handleUpload}
                  className="w-full py-3 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2">
                  {uploadLoading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중...</span></> : <><Upload size={14} /><span>DB 임포트</span></>}
                </button>
              </div>
            )}
            {importLog.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">상품 임포트 이력</p>
                  <button onClick={handleClearImportLog} className="text-[10px] text-gray-400 hover:text-rose-500 transition cursor-pointer">clear</button>
                </div>
                <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                  {importLog.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">
                        {new Date(entry.timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`font-semibold ${i === 0 ? "text-orange-600" : "text-gray-400"}`}>{entry.count.toLocaleString()}개</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 재고리스트 탭 ── */}
        {uploadTab === "stock" && (
          <StockUploadTab
            stockUploadFile={stockUploadFile}
            setStockUploadFile={setStockUploadFile}
            stockUploadLoading={stockUploadLoading}
            stockUploadResult={stockUploadResult}
            setStockUploadResult={setStockUploadResult}
            stockImportLog={stockImportLog}
            stockStartDate={stockStartDate}
            setStockStartDate={setStockStartDate}
            stockEndDate={stockEndDate}
            setStockEndDate={setStockEndDate}
            stockPeriodType={stockPeriodType}
            handleStockUpload={handleStockUpload}
            handleClearStockImportLog={handleClearStockImportLog}
          />
        )}

        {/* ── 공급사관리 탭 ── */}
        {uploadTab === "vendors" && (
          <>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              공급사관리 xlsx 파일을 업로드하면 <b>회사명</b> 기준으로 담당자·전화·이메일·카테고리·비고·사업자번호가 갱신됩니다.<br />
              <span className="text-gray-400">기존에 없는 공급사는 신규 등록됩니다.</span>
            </p>
            {vendorUploadResult?.ok ? (
              <div className="flex flex-col items-center gap-3 py-4 mb-4">
                <CheckCircle size={36} className="text-emerald-500" weight="fill" />
                <p className="text-sm font-bold text-emerald-700">공급사 임포트 완료</p>
                <p className="text-xs text-gray-500">
                  총 {vendorUploadResult.count?.toLocaleString()}건 · 신규 {vendorUploadResult.inserted ?? 0} · 갱신 {vendorUploadResult.updated ?? 0}
                  {vendorUploadResult.failed ? <> · <span className="text-rose-500">실패 {vendorUploadResult.failed}</span></> : null}
                </p>
                <button onClick={() => { setVendorUploadResult(null); setVendorUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                <input ref={vendorUploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) { setVendorUploadFile(null); return; }
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  if (ext !== "xlsx" && ext !== "xls") {
                    showError("형식이 다른 파일입니다. 공급사관리 xlsx를 업로드해주세요.");
                    e.target.value = ""; return;
                  }
                  setVendorUploadResult(null);
                  setVendorUploadFile(file);
                }} />
                <div className="flex gap-2 items-stretch">
                  <button type="button" onClick={() => vendorUploadInputRef.current?.click()}
                    className="flex-1 min-w-0 py-2.5 border-2 border-dashed border-gray-300 hover:border-emerald-400 text-gray-500 hover:text-emerald-600 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 truncate">
                    <Upload size={14} className="shrink-0" />
                    <span className="truncate">{vendorUploadFile ? vendorUploadFile.name : "파일 선택 (.xlsx)"}</span>
                  </button>
                  <button type="button" disabled={!vendorUploadFile || vendorUploadLoading} onClick={handleVendorUpload}
                    className="shrink-0 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-xs flex items-center gap-1.5">
                    {vendorUploadLoading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중</span></> : <><Upload size={13} /><span>DB 임포트</span></>}
                  </button>
                </div>
                {vendorUploadResult?.ok === false && (
                  <p className="text-xs text-rose-500 font-semibold text-center">{vendorUploadResult.msg}</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 매입상세 탭 ── */}
        {uploadTab === "purchase" && (
          <>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              매입상세현황 xlsx 파일을 업로드하면 개별 매입 건마다 저장됩니다.<br />
              <span className="text-gray-400">상품코드·매입일자·수량·금액·공급사 컬럼을 자동 감지 · 없으면 products DB 로 보강.</span>
            </p>
            <PeriodCoverageWidget endpoint="/api/purchase-details/coverage" label="매입 데이터 커버리지" color="sky" refreshTrigger={purchaseUploadResult} />
            {purchaseUploadResult?.ok ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle size={36} className="text-emerald-500" weight="fill" />
                <p className="text-sm font-bold text-emerald-700">매입 임포트 완료</p>
                <p className="text-xs text-gray-500">
                  총 {(purchaseUploadResult.total ?? 0).toLocaleString()}행 · 저장 {(purchaseUploadResult.inserted ?? 0).toLocaleString()}행
                  {purchaseUploadResult.skipped ? <> · <span className="text-amber-600">skip {purchaseUploadResult.skipped.toLocaleString()}</span></> : null}
                </p>
                <button onClick={() => { setPurchaseUploadResult(null); setPurchaseUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5">매입 기간 (필수)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-500">시작매입일</span>
                      <input type="date" value={purchaseFromDate} onChange={(e) => setPurchaseFromDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono border-2 border-line rounded-lg focus:outline-none focus:border-brand-deep" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-500">종료매입일</span>
                      <input type="date" value={purchaseToDate} onChange={(e) => setPurchaseToDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono border-2 border-line rounded-lg focus:outline-none focus:border-brand-deep" />
                    </label>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px]">
                    {purchasePeriodType ? (
                      <StatusPill tone={purchasePeriodType === "early" ? "sky" : purchasePeriodType === "mid" ? "indigo" : "violet"} size="xs">
                        자동판정: {purchasePeriodType === "early" ? "초순 (1-10일)" : purchasePeriodType === "mid" ? "중순 (11-20일)" : "하순 (21-말일)"}
                      </StatusPill>
                    ) : (
                      <span className="text-gray-400">종료매입일 입력 시 초/중/하순 자동 판정</span>
                    )}
                    {purchaseFromDate && purchaseToDate && purchaseFromDate > purchaseToDate && (
                      <span className="text-rose-600 font-bold">⚠ 시작일이 종료일보다 뒤</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">예: 7월 매입 → 시작 2026-07-01 · 종료 2026-07-31 (파일명 자동 파싱 지원)</p>
                </div>
                <input ref={purchaseUploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) { setPurchaseUploadFile(null); return; }
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  if (ext !== "xlsx" && ext !== "xls") {
                    showError("xlsx 또는 xls 파일만 가능합니다.");
                    e.target.value = ""; return;
                  }
                  setPurchaseUploadResult(null);
                  setPurchaseUploadFile(file);
                  try {
                    const stem = file.name.replace(/\.(xlsx|xls)$/i, "");
                    const two = (s: string) => s.padStart(2, "0");
                    let m: RegExpMatchArray | null = stem.match(/(\d{4})[-_](\d{2})(\d{2})[-_](\d{2})[-.]?(\d{2})/);
                    if (!m) m = stem.match(/(\d{4})[-_](\d{2})[-_.](\d{2})[-_](\d{2})[-_.](\d{2})/);
                    if (!m) {
                      const alt = stem.match(/(\d{4})(\d{2})(\d{2})[-_](\d{4})(\d{2})(\d{2})/);
                      if (alt) {
                        const [, y1, m1, d1, y2, m2, d2] = alt;
                        setPurchaseFromDate(`${y1}-${two(m1)}-${two(d1)}`);
                        setPurchaseToDate(`${y2}-${two(m2)}-${two(d2)}`);
                        return;
                      }
                    }
                    if (m) {
                      const [, yyyy, sMM, sDD, eMM, eDD] = m;
                      setPurchaseFromDate(`${yyyy}-${two(sMM)}-${two(sDD)}`);
                      setPurchaseToDate(`${yyyy}-${two(eMM)}-${two(eDD)}`);
                    }
                  } catch { /* 파싱 실패 시 무시 */ }
                }} />
                <button type="button" onClick={() => purchaseUploadInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-sky-400 text-gray-500 hover:text-sky-600 text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
                  <Upload size={16} />
                  {purchaseUploadFile ? purchaseUploadFile.name : "파일 선택 (.xlsx)"}
                </button>
                {purchaseUploadResult?.ok === false && (
                  <p className="text-xs text-rose-500 font-semibold text-center">{purchaseUploadResult.msg}</p>
                )}
                <button type="button" disabled={!purchaseUploadFile || purchaseUploadLoading || !purchaseFromDate || !purchaseToDate || purchaseFromDate > purchaseToDate}
                  onClick={handlePurchaseUpload}
                  className="w-full py-3 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-sky-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2">
                  {purchaseUploadLoading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중...</span></> : <><Upload size={14} /><span>매입 임포트</span></>}
                </button>
                {purchaseImportBatches.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">매입 임포트 이력</p>
                      <button onClick={fetchPurchaseImportLog} className="text-[10px] text-gray-400 hover:text-sky-500 transition cursor-pointer">새로고침</button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                      {purchaseImportBatches.map((b, i) => {
                        const shortDate = (d?: string | null): string | null => {
                          if (!d) return null;
                          const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
                          return m ? `${Number(m[1])}/${Number(m[2])}` : null;
                        };
                        const rangeLabel = `${shortDate(b.periodStart ?? b.startDate)} ~ ${shortDate(b.endDate)}`;
                        const periodLabel = b.periodType === "early" ? "초순" : b.periodType === "mid" ? "중순" : b.periodType === "late" ? "하순" : null;
                        const periodChipClass = b.periodType === "early" ? "text-sky-700 bg-sky-50 border-sky-200" : b.periodType === "mid" ? "text-indigo-700 bg-indigo-50 border-indigo-200" : "text-purple-700 bg-purple-50 border-purple-200";
                        const d = new Date(b.imported_at);
                        const ts = isNaN(d.getTime()) ? b.imported_at : d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-gray-500 font-mono shrink-0">{ts}</span>
                              <span className="text-emerald-700 font-mono font-bold shrink-0" title={`매입기간 ${b.periodStart ?? b.startDate} ~ ${b.endDate}`}>{rangeLabel}</span>
                              {periodLabel && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${periodChipClass} shrink-0`}>{periodLabel}</span>}
                            </div>
                            <span className="text-emerald-700 font-bold font-mono shrink-0">{b.count.toLocaleString()}건</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 임포트 목록 탭 ── */}
        {uploadTab === "log" && (
          <ImportLogTab
            importLog={importLog}
            stockImportLog={stockImportLog}
            purchaseImportBatches={purchaseImportBatches}
            logFilter={logFilter}
            setLogFilter={setLogFilter}
          />
        )}
    </Modal>
  );
};
