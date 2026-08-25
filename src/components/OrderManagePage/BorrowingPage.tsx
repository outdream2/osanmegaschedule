// src/components/OrderManagePage/BorrowingPage.tsx
// 2026-08-25 · 사용자 지시 · 결제 > 차용입력 페이지 · 공급사↔약국 차용 기록
//   · 방향 (대여 lend / 차용 borrow) · 상품 · 수량 · 단가 · 일자 · 사유 · 서명
//   · 리스트 · 상태별 필터 (미해결·정산완료·취소·전체) · 공급사·상품 검색
//   · 정산 완료 · 취소 · 재열림 · 삭제 액션
//   · 서명 · 캔버스 (touch/mouse) → dataURL 저장

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, HandCoins, Pencil, RefreshCw, Search, Trash2, X, Save } from "lucide-react";
import { api, ApiError } from "../../lib/apiClient";
import type { AuthSession } from "../../types";
import { Card } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { InlineLabel } from "../common/InlineLabel";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useVendors } from "../../hooks/useVendors";

type Direction = "lend" | "borrow";
type Status = "open" | "settled" | "cancelled";

interface BorrowingRow {
  id: number;
  created_at: string;
  direction: Direction;
  supplier: string | null;
  product_code: string | null;
  product_name: string | null;
  qty: number;
  unit_price: number | null;
  due_date: string | null;
  note: string | null;
  signature_url: string | null;
  status: Status;
  settled_at: string | null;
  created_by: string | null;
}

const fmtDate = (s: string | null): string => (s ? String(s).slice(0, 10) : "-");
const fmtWon = (n: number): string => (n > 0 ? n.toLocaleString() + "원" : "-");
const dirLabel = (d: Direction) => (d === "lend" ? "대여 (공급사→약국)" : "차용 (약국→공급사)");
const statusPillProps = (s: Status): { tone: "amber" | "emerald" | "zinc"; label: string } => (
  s === "open"    ? { tone: "amber",   label: "미해결" }
: s === "settled" ? { tone: "emerald", label: "정산완료" }
:                   { tone: "zinc",    label: "취소" }
);

interface BorrowingPageProps {
  authSession?: AuthSession | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 서명 캔버스
// ═══════════════════════════════════════════════════════════════════════════

const SignaturePad: React.FC<{ value: string; onChange: (dataUrl: string) => void }> = ({ value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX = 0, clientY = 0;
    if ("touches" in e) {
      clientX = e.touches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const pos = getPos(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        className="border border-line rounded-lg bg-white w-full h-40 touch-none cursor-crosshair"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-zinc-400">마우스/터치로 서명 · 저장 시 이미지로 함께 기록</span>
        <button
          type="button"
          onClick={clear}
          className="text-[12px] font-bold text-zinc-500 hover:text-rose-600 underline underline-offset-4 cursor-pointer"
        >지우기</button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 등록 폼
// ═══════════════════════════════════════════════════════════════════════════

interface FormState {
  direction: Direction;
  supplier: string;
  product_code: string;
  product_name: string;
  qty: string;
  unit_price: string;
  due_date: string;
  note: string;
  signature_url: string;
}
const EMPTY: FormState = {
  direction: "lend",
  supplier: "",
  product_code: "",
  product_name: "",
  qty: "",
  unit_price: "",
  due_date: "",
  note: "",
  signature_url: "",
};

const BorrowingForm: React.FC<{
  authSession?: AuthSession | null;
  vendorNames: string[];
  onCreated: (row: BorrowingRow) => void;
}> = ({ authSession, vendorNames, onCreated }) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { toast, showError, showSuccess } = useToast();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier.trim()) { showError("공급사를 입력하세요"); return; }
    if (!form.product_name.trim()) { showError("상품명을 입력하세요"); return; }
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) { showError("수량은 1 이상"); return; }
    setSaving(true);
    try {
      const { data } = await api.post<{ ok: boolean; row: BorrowingRow }>("/api/borrowings", {
        direction: form.direction,
        supplier: form.supplier.trim(),
        product_code: form.product_code.trim() || null,
        product_name: form.product_name.trim(),
        qty,
        unit_price: form.unit_price.trim() ? Number(form.unit_price) : null,
        due_date: form.due_date || null,
        note: form.note.trim() || null,
        signature_url: form.signature_url || null,
        created_by: authSession?.employeeName ?? null,
        created_by_id: authSession?.employeeId ?? null,
      });
      onCreated(data.row);
      showSuccess(`차용 등록 완료 · ${form.product_name}`);
      setForm(EMPTY);
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
      showError(`등록 실패: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full h-9 px-2.5 rounded-lg border border-line bg-white text-[14px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition";

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <Card padding="md" topAccent clip>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <HandCoins size={17} className="text-brand-deep" />
            <span className="text-[16px] font-bold text-ink tracking-tight">차용 등록</span>
            <div className="ml-auto inline-flex items-center rounded-lg bg-zinc-100 p-0.5">
              {(["lend", "borrow"] as Direction[]).map(d => {
                const active = form.direction === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("direction", d)}
                    className={`h-8 px-3 rounded-md text-[13px] font-bold cursor-pointer transition ${
                      active ? "bg-white text-brand-deep shadow-sm" : "text-zinc-500 hover:text-brand-deep"
                    }`}
                    title={dirLabel(d)}
                  >
                    {d === "lend" ? "대여 (공급사→약국)" : "차용 (약국→공급사)"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">공급사 *</span>
              <input
                list="borrowing-vendor-list"
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                className={inputCls}
                placeholder="공급사명 입력"
                required
              />
              <datalist id="borrowing-vendor-list">
                {vendorNames.map(n => <option key={n} value={n} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">반환/정산 예정일</span>
              <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className={inputCls + " tabular-nums"} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">상품명 *</span>
              <input type="text" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className={inputCls} placeholder="상품명" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">상품코드</span>
              <input type="text" value={form.product_code} onChange={(e) => set("product_code", e.target.value)} className={inputCls + " font-mono"} placeholder="(선택)" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">수량 *</span>
              <input type="number" min={1} value={form.qty} onChange={(e) => set("qty", e.target.value)} className={inputCls + " tabular-nums"} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">단가 (원)</span>
              <input type="number" min={0} value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} className={inputCls + " tabular-nums"} placeholder="(선택)" />
            </label>
            <label className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">사유·메모</span>
              <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className="w-full min-h-[64px] px-2.5 py-2 rounded-lg border border-line bg-white text-[14px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-y" placeholder="예: 급한 요청으로 임시 대여, 다음 정산 시 반영" />
            </label>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">서명 (선택)</span>
              <SignaturePad value={form.signature_url} onChange={(dataUrl) => set("signature_url", dataUrl)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm(EMPTY)}
              disabled={saving}
              className="h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
            >초기화</button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] hover:from-[#0d3a5c] hover:to-[#08253a] shadow-sm ring-1 ring-brand-deep/30 disabled:opacity-40 cursor-pointer"
            >
              {saving ? <Spinner size={13} tone="white" /> : <Save size={13} />}
              {saving ? "저장 중..." : "등록"}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 리스트
// ═══════════════════════════════════════════════════════════════════════════

const BorrowingList: React.FC<{
  rows: BorrowingRow[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onPatch: (id: number, patch: Partial<BorrowingRow>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  days: number;
  setDays: (n: number) => void;
  status: Status | "all";
  setStatus: (s: Status | "all") => void;
  q: string;
  setQ: (v: string) => void;
  onPreviewSignature: (url: string) => void;
}> = ({ rows, loading, error, onReload, onPatch, onDelete, days, setDays, status, setStatus, q, setQ, onPreviewSignature }) => {
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(r =>
      (r.supplier ?? "").toLowerCase().includes(kw)
      || (r.product_name ?? "").toLowerCase().includes(kw)
      || (r.product_code ?? "").toLowerCase().includes(kw)
    );
  }, [rows, q]);

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        <HandCoins size={18} className="text-brand-deep shrink-0" />
        <span className="text-[17px] font-bold text-ink tracking-tight">차용 리스트</span>
        <StatusPill tone="brand" size="md">
          {loading ? <Spinner size={12} tone="brand" className="inline" /> : `${filtered.length}건`}
        </StatusPill>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5">
            {(["all", "open", "settled", "cancelled"] as const).map(s => {
              const active = status === s;
              const label = s === "all" ? "전체" : s === "open" ? "미해결" : s === "settled" ? "정산완료" : "취소";
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`h-8 px-3 rounded-md text-[13px] font-bold cursor-pointer transition ${
                    active ? "bg-white text-brand-deep shadow-sm" : "text-zinc-500 hover:text-brand-deep"
                  }`}
                >{label}</button>
              );
            })}
          </div>
          <InlineLabel size="sm">기간</InlineLabel>
          <PeriodSelector
            options={PERIOD_DAYS_PRESET}
            value={days}
            onChange={(v) => setDays(Number(v) || 180)}
            size="sm"
          />
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="공급사·상품·코드 검색"
              className="h-9 pl-8 pr-3 w-56 rounded-lg bg-white border border-line text-[14px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20"
            />
          </div>
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white border border-line text-[14px] font-bold text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
          </button>
        </div>
      </div>

      {/* 리스트 */}
      {loading && rows.length === 0 ? (
        <Card padding="none" className="flex items-center justify-center py-12">
          <Spinner size={16} tone="brand" label="차용 리스트 로딩 중..." labelSize={15} />
        </Card>
      ) : error ? (
        <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700 font-semibold">
          ⚠ {error}
          <button onClick={onReload} className="ml-2 underline cursor-pointer">다시 시도</button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="none" className="py-12">
          <EmptyState
            icon={HandCoins}
            title={q ? "검색 결과 없음" : "차용 기록 없음"}
            hint={q ? "다른 검색어로 시도하세요" : "상단 [차용 등록] 폼에서 신규 등록하세요"}
            size="normal"
          />
        </Card>
      ) : (
        <TableListWrap>
          <table className="w-full border-collapse">
            <thead className={tableHeadCls()}>
              <tr>
                <th className={tableThCls("center")} style={{ width: "9%" }}>등록일</th>
                <th className={tableThCls("center")} style={{ width: "7%" }}>방향</th>
                <th className={tableThCls("left")}   style={{ width: "14%" }}>공급사</th>
                <th className={tableThCls("left")}   style={{ width: "25%" }}>상품</th>
                <th className={tableThCls("num")}    style={{ width: "8%" }}>수량</th>
                <th className={tableThCls("num")}    style={{ width: "11%" }}>단가·금액</th>
                <th className={tableThCls("center")} style={{ width: "9%" }}>예정일</th>
                <th className={tableThCls("center")} style={{ width: "8%" }}>상태</th>
                <th className={tableThCls("left")}   style={{ width: "9%" }}>사유</th>
                <th className={tableThCls("center")} style={{ width: "8%" }}>서명</th>
                <th className={tableThCls("center")} style={{ width: "12%" }}>액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(r => {
                const amount = (r.qty ?? 0) * (r.unit_price ?? 0);
                const pill = statusPillProps(r.status);
                const isOpen = r.status === "open";
                return (
                  <tr key={r.id} className="hover:bg-zinc-50/60 transition text-[14px]">
                    <td className={tableTdCls("center", "text-zinc-500 tabular-nums")}>{fmtDate(r.created_at)}</td>
                    <td className={tableTdCls("center")}>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-bold ${r.direction === "lend" ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                        {r.direction === "lend" ? "대여" : "차용"}
                      </span>
                    </td>
                    <td className={tableTdCls("left", "font-semibold text-sky-700 break-keep")}>{r.supplier ?? <span className="text-zinc-400">-</span>}</td>
                    <td className={tableTdCls("left", "font-bold text-zinc-800 break-keep")}>
                      {r.product_name ?? "-"}
                      {r.product_code && <div className="text-[12px] font-mono text-zinc-400 mt-0.5">{r.product_code}</div>}
                    </td>
                    <td className={tableTdCls("num", "font-bold text-rose-600")}>{(r.qty ?? 0).toLocaleString()}</td>
                    <td className={tableTdCls("num", "text-zinc-600 tabular-nums")}>
                      {r.unit_price != null ? r.unit_price.toLocaleString() : "-"}
                      {amount > 0 && <div className="text-[12px] font-bold text-emerald-700">{fmtWon(amount)}</div>}
                    </td>
                    <td className={tableTdCls("center", "text-zinc-600 tabular-nums")}>{fmtDate(r.due_date)}</td>
                    <td className={tableTdCls("center")}>
                      <StatusPill tone={pill.tone} size="sm">{pill.label}</StatusPill>
                    </td>
                    <td className={tableTdCls("left", "text-[13px] text-zinc-500")}>{r.note ?? <span className="text-zinc-300">-</span>}</td>
                    <td className={tableTdCls("center")}>
                      {r.signature_url ? (
                        <button
                          type="button"
                          onClick={() => onPreviewSignature(r.signature_url!)}
                          className="text-[12px] font-bold text-brand-deep underline underline-offset-2 hover:text-brand-deep/80 cursor-pointer"
                          title="서명 미리보기"
                        >보기</button>
                      ) : <span className="text-zinc-300 text-[12px]">-</span>}
                    </td>
                    <td className={tableTdCls("center")}>
                      <div className="inline-flex items-center gap-0.5">
                        {isOpen ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onPatch(r.id, { status: "settled" })}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold cursor-pointer"
                              title="정산 완료 처리"
                            ><CheckCircle2 size={11} /> 정산</button>
                            <button
                              type="button"
                              onClick={() => onPatch(r.id, { status: "cancelled" })}
                              className="inline-flex w-7 h-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                              title="취소"
                            ><X size={13} /></button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onPatch(r.id, { status: "open" })}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-white border border-line text-zinc-500 hover:text-brand-deep hover:border-brand-deep text-[12px] font-bold cursor-pointer"
                            title="다시 미해결로 복귀"
                          ><Pencil size={11} /> 재열림</button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
                          className="inline-flex w-7 h-7 items-center justify-center rounded-md text-zinc-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"
                          title="완전 삭제"
                        ><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableListWrap>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 페이지 (폼 + 리스트)
// ═══════════════════════════════════════════════════════════════════════════

export const BorrowingPage: React.FC<BorrowingPageProps> = ({ authSession }) => {
  const [rows, setRows] = useState<BorrowingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(180);
  const [status, setStatus] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const { toast, showError, showSuccess } = useToast();
  const confirm = useConfirm();
  const { vendors } = useVendors();
  const vendorNames = useMemo(() => vendors.map(v => String(v.company_name ?? "")).filter(Boolean), [vendors]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("days", String(days));
    if (status !== "all") params.set("status", status);
    api.get<{ rows?: BorrowingRow[] }>(`/api/borrowings?${params.toString()}`)
      .then(({ data }) => setRows(Array.isArray(data?.rows) ? data.rows : []))
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as any)?.message ?? "네트워크 오류";
        setError(msg);
        showError(`차용 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [days, status, showError]);

  useEffect(() => { load(); }, [load]);

  const onPatch = async (id: number, patch: Partial<BorrowingRow>) => {
    try {
      const { data } = await api.patch<{ ok: boolean; row: BorrowingRow }>(`/api/borrowings/${id}`, patch);
      setRows(prev => prev.map(r => (r.id === id ? { ...r, ...data.row } : r)));
      showSuccess("저장되었습니다");
    } catch (e: any) {
      showError(`저장 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };
  const onDelete = async (id: number) => {
    const target = rows.find(r => r.id === id);
    const label = target ? (target.product_name ?? `#${id}`) : `#${id}`;
    if (!await confirm({ message: `${label} · 차용 기록 완전 삭제?`, danger: true })) return;
    try {
      await api.del(`/api/borrowings/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
      showSuccess("삭제되었습니다");
    } catch (e: any) {
      showError(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="flex flex-col gap-4 p-3 sm:p-4">
        <BorrowingForm
          authSession={authSession}
          vendorNames={vendorNames}
          onCreated={(row) => setRows(prev => [row, ...prev])}
        />
        <BorrowingList
          rows={rows}
          loading={loading}
          error={error}
          onReload={load}
          onPatch={onPatch}
          onDelete={onDelete}
          days={days}
          setDays={setDays}
          status={status}
          setStatus={setStatus}
          q={q}
          setQ={setQ}
          onPreviewSignature={(url) => setSignaturePreview(url)}
        />
      </div>
      {/* 서명 미리보기 · 라이트박스 */}
      {signaturePreview && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSignaturePreview(null)}
        >
          <div className="bg-white rounded-xl shadow-xl p-4 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[15px] font-bold text-ink">서명 미리보기</span>
              <button type="button" onClick={() => setSignaturePreview(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 cursor-pointer"><X size={16} /></button>
            </div>
            <img src={signaturePreview} alt="서명" className="w-full h-auto border border-line rounded-lg bg-white" />
          </div>
        </div>
      )}
    </>
  );
};

export default BorrowingPage;
