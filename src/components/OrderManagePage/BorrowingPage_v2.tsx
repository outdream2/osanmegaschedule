// src/components/OrderManagePage/BorrowingPage_v2.tsx
// 2026-08-31 · #9 차용등록 재설계 Phase D · 우측 BorrowingDetailPanel 연결
//
//   · 병행 개발 · 원본 BorrowingPage.tsx 보존 (Phase E 에서 교체)
//   · CSS Grid 3-column · [320px _ 1fr _ 380px] · lg 이상 · 그 아래는 세로 스택
//   · 좌측 · SplitListPanel (검색 상단 built-in · 상태·기간 필터 · BorrowingCard 리스트)
//   · 중앙 · BorrowingEditPanel (신규/편집 통합 · Phase C)
//   · 우측 · BorrowingDetailPanel (상세·서명·Timeline·CTA · Phase D)
//   · listBorrowings API · borrowingsApi.ts 재사용 (framework 준수)
//
//   대원칙:
//     1. 회귀 절대 X · 원본 BorrowingPage.tsx 수정 X · 라우팅 미변경
//     2. 프레임워크 프리미티브 재사용 · 원-오프 코드 금지
//     3. UI 만 변경 · API/state/handler 절대 X (Phase B 스코프)
//     4. 폭 통일 · max-w-[1360px] w-[85%] mx-auto
//     5. 폰트 +2 기본
//     6. 목업 톤 (docs/UI_MOCKUP_BORROWING_REDESIGN_2026-08-30.html · Linear/Vercel)
//     7. 말줄임표 금지 · 텍스트 잘리면 줄바꿈
//
//   ⚠ 신규 컴포넌트는 Phase B 스코프 아님
//     · PartySelectModal / BorrowingEditPanel 등은 Phase C·D 에서 별도 구현

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, RefreshCw } from "lucide-react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { SplitListPanel } from "../common/SplitListPanel";
import { SegmentedControl, type SegmentedOption } from "../common/SegmentedControl";
import { PeriodSelector, PERIOD_DAYS_PRESET } from "../common/PeriodSelector";
import { BorrowingCard, type BorrowingCardData } from "../common/borrowing/BorrowingCard";
import { StatusPill } from "../common/StatusPill";
import { InlineLabel } from "../common/InlineLabel";
import { GradientAccent } from "../common/GradientAccent";
import { BorrowingEditPanel, type EditMode } from "./BorrowingEditPanel";
import { BorrowingDetailPanel } from "./BorrowingDetailPanel";
import {
  listBorrowings,
  type BorrowingRow,
  type ListBorrowingsParams,
} from "../../lib/borrowingsApi";
import { matchesProductQuery } from "../../lib/productMatch";
import { matchesSupplierQuery } from "../../lib/supplierMatch";
import { useToast, toastClass } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import type { AuthSession } from "../../types";

// ═══════════════════════════════════════════════════════════════════════════
// 매핑 · BorrowingRow → BorrowingCardData
//   · direction=lend  · 공급사→약국 · lender=supplier · borrower=약국
//   · direction=borrow · 약국→공급사 · lender=약국    · borrower=supplier
// ═══════════════════════════════════════════════════════════════════════════

const SELF_LABEL = "약국";

function toCardData(row: BorrowingRow): BorrowingCardData {
  const supplier = row.supplier ?? "-";
  const lender_name  = row.direction === "lend"  ? supplier    : SELF_LABEL;
  const borrower_name = row.direction === "lend" ? SELF_LABEL  : supplier;
  return {
    id: row.id,
    contract_no: row.contract_no ?? null,
    lender_name,
    borrower_name,
    product_name: row.product_name,
    product_code: row.product_code,
    qty: row.qty,
    unit_price: row.unit_price,
    due_date: row.due_date,
    status: row.status,
    created_at: row.created_at,
    settled_at: row.settled_at,
    returned_at: row.returned_at,
    overdue_notified_at: row.overdue_notified_at ?? null,
    note: row.note,
    return_note: row.return_note,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 필터·검색 상태 타입
// ═══════════════════════════════════════════════════════════════════════════

type StatusFilter = "all" | "open" | "settled" | "cancelled";

const STATUS_OPTIONS: SegmentedOption<StatusFilter>[] = [
  { value: "all",       label: "전체" },
  { value: "open",      label: "미해결",   tone: "amber" },
  { value: "settled",   label: "정산완료", tone: "emerald" },
  { value: "cancelled", label: "취소",     tone: "zinc" },
];

// ═══════════════════════════════════════════════════════════════════════════
// 페이지 (Phase B · shell + 좌측 리스트 · 중앙·우측 placeholder)
// ═══════════════════════════════════════════════════════════════════════════

interface BorrowingPageV2Props {
  authSession?: AuthSession | null;
}

// 중앙 편집 모드 · Phase C · EditMode 타입은 BorrowingEditPanel 에서 재수출

export const BorrowingPageV2: React.FC<BorrowingPageV2Props> = ({ authSession }) => {
  // ── 데이터 로드 ─────────────────────────────────────────────
  const [rows, setRows] = useState<BorrowingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 필터·검색 상태 ─────────────────────────────────────────
  const [days, setDays] = useState<number>(180);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // ── 선택·편집 모드 ─────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);

  const { toast, showError } = useToast();

  // ── 서버 조회 (status·days · 서버 필터) ─────────────────────
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: ListBorrowingsParams = { days };
    if (status !== "all") params.status = status;
    listBorrowings(params)
      .then((rs) => setRows(rs))
      .catch((e: unknown) => {
        const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
        setError(msg);
        showError(`차용 조회 실패: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [days, status, showError]);

  useEffect(() => { load(); }, [load]);

  // ── 검색 · 클라이언트 필터 (상품·공급사·계약번호 OR 매칭) ────
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => (
      matchesProductQuery(r, q)
      || matchesSupplierQuery({ supplier: r.supplier ?? undefined }, q)
      || (r.contract_no ? r.contract_no.toLowerCase().includes(q.toLowerCase()) : false)
    ));
  }, [rows, search]);

  const selectedRow = useMemo(
    () => (selectedId != null ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  // ── KPI · 상단 카운트 표시 (미해결·기한초과·정산완료) ────────
  const kpi = useMemo(() => {
    const open      = rows.filter((r) => r.status === "open").length;
    const settled   = rows.filter((r) => r.status === "settled").length;
    const cancelled = rows.filter((r) => r.status === "cancelled").length;
    const overdueToday = new Date().toISOString().slice(0, 10);
    const overdue = rows.filter((r) => r.status === "open" && r.due_date && r.due_date < overdueToday).length;
    return { open, settled, cancelled, overdue };
  }, [rows]);

  // ═══════════════════════════════════════════════════════
  // 좌측 리스트 filters slot (SplitListPanel filters prop)
  //   · SegmentedControl (상태) + PeriodSelector (기간) · 폰트 +2 원칙
  // ═══════════════════════════════════════════════════════
  const listFilters = (
    <div className="flex items-center gap-2 flex-wrap">
      <SegmentedControl<StatusFilter>
        value={status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
        size="sm"
        variant="pills"
        ariaLabel="차용 상태 필터"
      />
      <div className="flex items-center gap-1">
        <InlineLabel size="sm">기간</InlineLabel>
        <PeriodSelector<number>
          options={PERIOD_DAYS_PRESET}
          value={days}
          onChange={(v) => setDays(Number(v) || 180)}
          size="sm"
          ariaLabel="차용 조회 기간"
        />
      </div>
    </div>
  );

  const listHeaderActions = (
    <button
      type="button"
      onClick={load}
      disabled={loading}
      title="새로고침"
      aria-label="새로고침"
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-line text-ink-soft hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
    >
      <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
    </button>
  );

  // ═══════════════════════════════════════════════════════
  // 좌측 · 리스트 body (BorrowingCard 스크롤 리스트)
  // ═══════════════════════════════════════════════════════
  const listBody = (
    <div className="flex flex-col gap-2 p-2.5">
      {filtered.map((r) => {
        const isSelected = selectedId === r.id;
        return (
          <div
            key={r.id}
            onClick={() => { setSelectedId(r.id); setEditMode({ kind: "edit", id: r.id }); }}
            className={`cursor-pointer rounded-xl transition-all ${
              isSelected
                ? "ring-2 ring-brand-deep ring-offset-1"
                : "hover:ring-1 hover:ring-brand-deep/20"
            }`}
          >
            <BorrowingCard item={toCardData(r)} />
          </div>
        );
      })}
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // 중앙 · 신규 등록·편집 폼 (Phase C · BorrowingEditPanel)
  //   · onSaved · 서버 재조회 + 편집 대상 재선택 · 리스트 즉시 반영
  //   · onClose · placeholder 로 복귀 (mode=null)
  // ═══════════════════════════════════════════════════════
  const handleSaved = useCallback((saved: BorrowingRow) => {
    // 리스트에 존재하면 in-place 업데이트 · 신규면 prepend (서버 재조회로 정확한 상태 재확인)
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    // 편집 모드 유지 · 방금 저장한 항목 선택
    setSelectedId(saved.id);
    setEditMode({ kind: "edit", id: saved.id });
    // 백그라운드 재조회 (필터 반영)
    load();
  }, [load]);

  const centerPanel = (
    <BorrowingEditPanel
      mode={editMode}
      row={editMode?.kind === "edit" ? rows.find((r) => r.id === editMode.id) ?? null : null}
      onSaved={handleSaved}
      onClose={() => setEditMode(null)}
      authSession={authSession ?? null}
    />
  );

  // ═══════════════════════════════════════════════════════
  // 우측 · 상세 뷰 (Phase D · BorrowingDetailPanel)
  //   · onChanged · 반환·취소·재열림 시 · rows in-place 업데이트 + selected 유지
  //   · onDeleted · rows 에서 제거 + 선택 해제 + editMode 초기화
  // ═══════════════════════════════════════════════════════
  const handleDetailChanged = useCallback((updated: BorrowingRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }, []);

  const handleDetailDeleted = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedId(null);
    setEditMode((mode) => (mode?.kind === "edit" && mode.id === id ? null : mode));
  }, []);

  const rightPanel = (
    <BorrowingDetailPanel
      row={selectedRow}
      onChanged={handleDetailChanged}
      onDeleted={handleDetailDeleted}
      authSession={authSession ?? null}
    />
  );

  // ═══════════════════════════════════════════════════════
  // 렌더
  // ═══════════════════════════════════════════════════════
  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <div className="max-w-[1360px] w-[85%] mx-auto px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* Hero · 목업 톤 · GradientAccent 상단 라인 */}
        <div className="relative">
          <GradientAccent />
          <div className="pt-3 flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-deep to-[#0d3a5c] text-white flex items-center justify-center shadow-sm shrink-0">
                <HandCoins size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[24px] font-extrabold text-ink tracking-tight leading-tight break-keep">
                  차용 관리 · Redesign
                </h1>
                <p className="text-[14px] text-ink-soft mt-0.5 break-keep">
                  양방향 화살표 · 이중 서명·도장 · Timeline 감사 이력 (#9 Phase D)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusPill tone="amber" size="sm">{kpi.open} 미해결</StatusPill>
              {kpi.overdue > 0 && <StatusPill tone="rose" size="sm">{kpi.overdue} 기한초과</StatusPill>}
              <StatusPill tone="emerald" size="sm">{kpi.settled} 정산완료</StatusPill>
              <StatusPill tone="zinc" size="sm">전체 {rows.length}건</StatusPill>
            </div>
          </div>
        </div>

        {/* 3-column shell · lg 이상 [320 _ 1fr _ 380] · 그 아래 세로 스택 */}
        <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-[320px_1fr_380px] items-stretch">
          {/* ── 좌측 · 리스트 ───────────────────────────────── */}
          <Card
            padding="none"
            rounded="xl"
            clip
            className="h-full min-h-[520px] lg:h-[calc(100vh-220px)] flex flex-col overflow-hidden"
          >
            <SplitListPanel
              topAccent
              title="차용 계약"
              count={filtered.length}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="공급사 · 상품 · 계약번호 검색"
              recentSearchScope="megatown_borrowing_v2_search"
              filters={listFilters}
              headerActions={listHeaderActions}
              onAdd={() => { setEditMode({ kind: "new" }); setSelectedId(null); }}
              addLabel="신규 등록"
              addTitle="신규 차용 계약 등록"
              loading={loading}
              loadingLabel="차용 리스트 로딩 중..."
              empty={!loading && filtered.length === 0}
              emptyText={search ? "검색 결과 없음" : "차용 기록 없음"}
              emptyHint={search ? "다른 검색어로 시도하세요" : "우측 상단 [신규 등록] 으로 첫 계약을 만드세요"}
              emptyIcon={HandCoins}
              error={error}
            >
              {listBody}
            </SplitListPanel>
          </Card>

          {/* ── 중앙 · 신규 등록·편집 폼 (Phase C · BorrowingEditPanel) ── */}
          <div className="min-w-0 lg:h-[calc(100vh-220px)]">
            {centerPanel}
          </div>

          {/* ── 우측 · 상세 뷰 (Phase D 예정) ───────────────── */}
          <div className="min-w-0 lg:h-[calc(100vh-220px)]">
            {rightPanel}
          </div>
        </div>

        {/* 로딩 · 첫 진입 시 하단 스피너 (리스트 카드 empty 상태와 별개) */}
        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <Spinner size={14} tone="brand" label="차용 데이터 로딩 중..." labelSize={13} />
          </div>
        )}
      </div>
    </>
  );
};

export default BorrowingPageV2;
