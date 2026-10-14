// src/components/BoardPage.tsx
// 이슈공유 게시판 · 질문/이슈/메모 + 댓글 + 이미지 첨부 + @멘션 + 반응
// - 모든 직원 접근 가능
// - 이미지: Cloudinary 업로드 (클라 압축 후 25GB 무료)
// - 담당자 표시: [이름 직급] · 헤더 스타일과 통일
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
// 2026-09-14 · employeeApi 프리미티브
import { listEmployees } from "../../lib/employeeApi";
import {
  HelpCircle, AlertTriangle, StickyNote, Plus, Send, X as XIcon, Image as ImageIcon,
  ChevronLeft, Pin, MessageCircle, Trash2,
  Camera, AtSign, Pencil, Check,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
// 2026-10-08 · PAGE_CONTAINER_CLS 제거 · OperationsPageTemplate이 container 책임
// import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { Button } from "../common/Button";
import { Spinner } from "../common/Spinner";
// 2026-10-08 · PageToolbar 제거 · OperationsPageTemplate.title/toolbar slot이 책임
// 2026-10-08 · GLOBAL UI reference-tone application · Operations template wrapper
import { OperationsPageTemplate } from "../common/OperationsPageTemplate";
// 2026-10-12 · 사용자 지시 · 이슈 페이지 현황판 패턴 적용 (리서치 결과 하이브리드)
import { OverviewInnerTabs, type OverviewInnerTab } from "../DisplayPage/overviews/OverviewHeader";
import { uploadImagesToCloudinary, type UploadedImage } from "../../lib/cloudinaryUpload";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { fmtDateShort } from "../../lib/format";
import { useConfirm } from "../../hooks/useConfirm";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import type { PostType, Status, BoardImage, BoardComment, BoardReaction, BoardPost, Employee } from "./types";
import { TYPE_META, STATUS_META, CATEGORIES } from "./constants";
import { timeAgo, AuthorBadge } from "./utils";
import { PostCard } from "./PostCard";
import { InlineDetail } from "./InlineDetail";
import { ComposerModal } from "./ComposerModal";
import { DetailModal } from "./DetailModal";

interface Props {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

export const BoardPage: React.FC<Props> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"" | PostType>("");
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");
  // "" = 전체, "__none__" = 미분류(카테고리 없는 글), CATEGORIES 중 하나 = 해당 카테고리
  const [filterCategory, setFilterCategory] = useState<"" | "__none__" | typeof CATEGORIES[number]>("");
  const [search, setSearch] = useState("");
  // 2026-10-12 · 사용자 지시 · 현황판 패턴 · 2 inner tab (현황 default + 전체 리스트)
  const [innerTab, setInnerTab] = useState<"overview" | "all">("overview");
  const [showComposer, setShowComposer] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailInitialEdit, setDetailInitialEdit] = useState(false);
  // 인라인 확장: 리스트 클릭 시 아래에 댓글 인라인으로 표시
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const level = authSession?.level ?? 0;
  const isManager = level >= 2;

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("type", filterType);
      if (filterStatus) params.set("status", filterStatus);
      if (search.trim()) params.set("search", search.trim());
      const { data } = await api.get<BoardPost[]>(`/api/board/posts?${params}`);
      setPosts(data);
    } finally { setLoading(false); }
  }, [filterType, filterStatus, search]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // 직원 리스트 (@멘션용)
  useEffect(() => {
    (async () => {
      try {
        const list = await listEmployees();
        setEmployees(list.map(e => ({ id: e.id, name: e.name, rank: e.rank, level: e.level ?? undefined })));
      } catch { /* ignore */ }
    })();
  }, []);

  const filtered: BoardPost[] = useMemo(() => {
    if (!filterCategory) return posts;
    if (filterCategory === "__none__") return posts.filter(p => !p.category);
    return posts.filter(p => p.category === filterCategory);
  }, [posts, filterCategory]);

  // 2026-10-12 · 사용자 지시 · 현황판 집계 (리서치 결과 반영 · KPI + 긴급 핀 + 카테고리별 top3 + 최근 활동)
  const nowMs = Date.now();
  const DAY_MS = 86_400_000;
  const openPosts = useMemo(() => posts.filter(p => p.status !== "resolved"), [posts]);
  const newToday = useMemo(() => posts.filter(p => {
    const t = new Date((p as any).created_at ?? 0).getTime();
    return nowMs - t < DAY_MS;
  }), [posts, nowMs]);
  const urgentPins = useMemo(() => {
    // 24h 넘긴 미해결 posts top 5 · updated desc
    return openPosts
      .filter(p => nowMs - new Date((p as any).created_at ?? 0).getTime() > DAY_MS)
      .sort((a, b) => new Date((b as any).updated_at ?? (b as any).created_at ?? 0).getTime() - new Date((a as any).updated_at ?? (a as any).created_at ?? 0).getTime())
      .slice(0, 5);
  }, [openPosts, nowMs]);
  const byCategory = useMemo(() => {
    const map = new Map<string, BoardPost[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const p of openPosts) {
      const c = p.category && CATEGORIES.includes(p.category as any) ? p.category : "미분류";
      const arr = map.get(c) ?? [];
      arr.push(p);
      map.set(c, arr);
    }
    return map;
  }, [openPosts]);
  const recentActivity = useMemo(() => {
    return [...posts]
      .sort((a, b) => new Date((b as any).updated_at ?? (b as any).created_at ?? 0).getTime() - new Date((a as any).updated_at ?? (a as any).created_at ?? 0).getTime())
      .slice(0, 10);
  }, [posts]);

  const innerTabs: ReadonlyArray<OverviewInnerTab<"overview" | "all">> = [
    { k: "overview", label: "현황",     tone: "indigo", count: openPosts.length || null },
    { k: "all",      label: "전체 보기", tone: "slate",  count: posts.length || null },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA]">
      <AppNavHeader activePage="board" authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      {/* 2026-10-08 · GLOBAL UI reference-tone application · OperationsPageTemplate wrapper
                     (presentation-only · state/handlers 전부 보존 · PageToolbar는 compact toolbar slot 안으로 이동) */}
      <OperationsPageTemplate
        title={
          <span className="inline-flex items-center gap-2">
            <StickyNote size={22} className="text-brand-deep" strokeWidth={2.2} />
            <span>이슈공유</span>
            <span className="text-[16px] font-semibold text-ink-soft/70 tabular-nums">{filtered.length}</span>
          </span>
        }
        description="팀 전체가 함께 보는 질문·이슈·메모 보드 · @멘션으로 알림이 전달됩니다"
        actions={
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={14} strokeWidth={3} />}
            onClick={() => setShowComposer(true)}
            disabled={!authSession?.employeeId}
          >
            새 글
          </Button>
        }
        toolbar={
          // 2026-10-08 · reference-tone · toolbar는 search + 구분자 + 카테고리 chip만 compact (상태 chip은 filterbar 로 분리)
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·본문 검색"
              aria-label="게시물 검색"
              className="text-[14px] border border-line rounded-lg px-3 h-9 min-w-[180px] max-w-[360px] flex-1 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors bg-white text-ink placeholder-ink-soft"
            />
            <span className="h-5 w-px bg-line" aria-hidden />
            <CategoryChips
              label="카테고리"
              value={filterCategory}
              onChange={(v) => setFilterCategory(v as typeof filterCategory)}
              size="sm"
              ariaLabel="이슈 카테고리 필터"
              options={[
                { value: "" as typeof filterCategory, label: "전체", tone: "zinc" },
                ...CATEGORIES.map(c => ({
                  value: c as typeof filterCategory,
                  label: c,
                  tone: (c === "결제" ? "sky" : c === "상품" ? "emerald" : c === "주문" ? "violet" : c === "손님" ? "amber" : "zinc") as ChipTone,
                })),
                { value: "__none__" as typeof filterCategory, label: "미분류", tone: "zinc" },
              ]}
            />
          </>
        }
        filterbar={
          // 2026-10-08 · reference-tone · 상태 chip row 를 toolbar 아래 별도 scanning line (filterbar slot)
          <CategoryChips
            label="상태"
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as Status | "")}
            size="sm"
            ariaLabel="이슈 상태 필터"
            options={[
              { value: "" as Status | "", label: "전체", tone: "zinc" },
              { value: "open"        as Status | "", label: "미해결", tone: "rose"    },
              { value: "in_progress" as Status | "", label: "진행중", tone: "amber"   },
              { value: "resolved"    as Status | "", label: "해결",   tone: "emerald" },
            ]}
          />
        }
      >
        {/* 2026-10-12 · 사용자 지시 · 현황판 패턴 · OverviewInnerTabs 2개 (현황 default · 전체 보기) */}
        <OverviewInnerTabs<"overview" | "all">
          ariaLabel="이슈 inner tabs"
          active={innerTab}
          onChange={setInnerTab}
          tabs={innerTabs}
        />

        {innerTab === "overview" ? (
          /* 현황 탭 · KPI + 긴급 핀 + 카테고리별 Top-N + 최근 활동 */
          <div className="flex flex-col gap-3 md:gap-4 pt-3">
            {/* KPI 4-strip (리서치 추천 · 미해결/24h 신규/긴급핀 수/카테고리 수) */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "미해결",       value: openPosts.length,    unit: "건", tone: "rose"    as const },
                { label: "24h 신규",     value: newToday.length,     unit: "건", tone: "indigo"  as const },
                { label: "긴급 핀 (24h+)", value: urgentPins.length, unit: "건", tone: "amber"   as const },
                { label: "활성 카테고리", value: Array.from(byCategory.values()).filter(v => v.length > 0).length, unit: "개", tone: "emerald" as const },
              ].map(k => (
                <div key={k.label} className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-3.5 py-3 flex flex-col gap-1">
                  <span className="text-[13px] md:text-[14px] text-slate-500 font-medium">{k.label}</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[18px] md:text-[20px] font-semibold tabular-nums tracking-tight ${
                      k.tone === "rose" ? "text-rose-700" : k.tone === "amber" ? "text-amber-700" : k.tone === "emerald" ? "text-emerald-700" : "text-indigo-700"
                    }`}>{k.value}</span>
                    <span className="text-[13px] text-slate-500 font-medium">{k.unit}</span>
                  </div>
                </div>
              ))}
            </section>

            {/* 긴급 핀 (24h+ 미해결 top 5) */}
            <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <header className="flex items-center gap-2 mb-3">
                <span className="w-[3px] h-[14px] bg-rose-500 rounded-full" />
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">긴급 · 장기 미해결</h3>
                <span className="text-[13px] text-slate-500">· {urgentPins.length}건</span>
              </header>
              {urgentPins.length === 0 ? (
                <div className="py-6 text-center text-[14px] text-emerald-700">모두 해결됨 ✓</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {urgentPins.map(p => (
                    <li key={p.id}
                        onClick={() => setDetailId(p.id)}
                        className="py-2 flex items-center gap-3 hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer">
                      <span className="text-[12px] px-1.5 py-[1px] rounded border bg-rose-50 text-rose-700 border-rose-200 font-semibold shrink-0">
                        {p.category || "미분류"}
                      </span>
                      <span className="text-[14px] md:text-[15px] text-ink font-medium flex-1 truncate">{p.title}</span>
                      <span className="text-[12px] text-slate-500 tabular-nums shrink-0">
                        {timeAgo((p as any).created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 카테고리별 Top-3 그리드 */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATEGORIES.map(cat => {
                const list = (byCategory.get(cat) ?? []).slice(0, 3);
                const total = (byCategory.get(cat) ?? []).length;
                return (
                  <div key={cat} className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 flex flex-col">
                    <header className="flex items-center justify-between mb-2">
                      <span className="text-[14px] md:text-[15px] font-semibold text-ink">{cat}</span>
                      <span className="text-[12px] text-slate-500 tabular-nums">{total}</span>
                    </header>
                    {list.length === 0 ? (
                      <div className="py-4 text-center text-[13px] text-slate-400">없음</div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {list.map(p => (
                          <li key={p.id}
                              onClick={() => setDetailId(p.id)}
                              className="py-1.5 text-[13px] md:text-[14px] text-ink truncate hover:text-brand-deep cursor-pointer"
                              title={p.title}>
                            {p.title}
                          </li>
                        ))}
                      </ul>
                    )}
                    {total > 3 && (
                      <button type="button" onClick={() => { setFilterCategory(cat as any); setInnerTab("all"); }}
                              className="mt-2 text-[12px] text-indigo-600 hover:underline text-left">
                        외 {total - 3}건 전체 →
                      </button>
                    )}
                  </div>
                );
              })}
            </section>

            {/* 최근 활동 (10건) */}
            <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <header className="flex items-center gap-2 mb-3">
                <span className="w-[3px] h-[14px] bg-slate-400 rounded-full" />
                <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">최근 활동</h3>
              </header>
              {recentActivity.length === 0 ? (
                <div className="py-4 text-center text-[14px] text-slate-500">활동 없음</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentActivity.map(p => (
                    <li key={p.id}
                        onClick={() => setDetailId(p.id)}
                        className="py-2 flex items-center gap-3 hover:bg-slate-50 -mx-2 px-2 rounded cursor-pointer">
                      <span className={`text-[12px] px-1.5 py-[1px] rounded font-semibold shrink-0 ${
                        p.status === "resolved" ? "bg-emerald-50 text-emerald-700" : p.status === "in_progress" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {STATUS_META[p.status]?.label ?? p.status}
                      </span>
                      <span className="text-[14px] text-ink font-medium flex-1 truncate">{p.title}</span>
                      <span className="text-[12px] text-slate-500 shrink-0">{timeAgo((p as any).updated_at ?? (p as any).created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <>
            {/* 전체 보기 탭 · 기존 리스트 render */}
            {loading && filtered.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 bg-brand-tint/40 border border-brand/15 rounded-md">
                <Spinner size={11} tone="brand" label="새로 불러오는 중..." labelSize={13} />
              </div>
            )}
            {loading && filtered.length === 0 ? (
              <div className="flex items-center justify-center py-10"><Spinner tone="zinc" label="로딩 중..." labelSize={12} /></div>
            ) : !loading && filtered.length === 0 ? (
              <div className="text-center text-[14px] text-ink-soft py-10 border border-dashed border-line rounded-lg bg-white">등록된 글 없음</div>
            ) : (
              <div
                className={`bg-white border border-line rounded-xl overflow-hidden divide-y divide-zinc-100 ${loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}`}
                style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 2px 8px -4px rgba(10,46,74,0.06)" }}
              >
                {filtered.map((p: BoardPost) => {
                  const isExpanded = expandedId === p.id;
                  const toggle = () => setExpandedId(prev => prev === p.id ? null : p.id);
                  const isAuthor = p.author_id === authSession?.employeeId;
                  return (
                    <React.Fragment key={p.id}>
                      <PostCard
                        post={p}
                        onOpen={toggle}
                        showEdit={isAuthor || isManager}
                        onEdit={() => { setDetailInitialEdit(true); setDetailId(p.id); }}
                      />
                      {isExpanded && (
                        <InlineDetail
                          postId={p.id}
                          authSession={authSession}
                          employees={employees}
                          isManager={isManager}
                          onOpenFull={() => setDetailId(p.id)}
                          onChanged={loadPosts}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}
      </OperationsPageTemplate>

      {showComposer && authSession?.employeeId && (
        <ComposerModal
          authSession={authSession}
          employees={employees}
          onClose={() => setShowComposer(false)}
          onCreated={() => { setShowComposer(false); loadPosts(); }}
        />
      )}

      {detailId != null && (
        <DetailModal
          postId={detailId}
          authSession={authSession}
          employees={employees}
          isManager={isManager}
          initialEdit={detailInitialEdit}
          onClose={() => { setDetailId(null); setDetailInitialEdit(false); }}
          onChanged={loadPosts}
        />
      )}
    </div>
  );
};

export default BoardPage;
