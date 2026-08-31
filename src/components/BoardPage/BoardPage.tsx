// src/components/BoardPage.tsx
// 이슈공유 게시판 · 질문/이슈/메모 + 댓글 + 이미지 첨부 + @멘션 + 반응
// - 모든 직원 접근 가능
// - 이미지: Cloudinary 업로드 (클라 압축 후 25GB 무료)
// - 담당자 표시: [이름 직급] · 헤더 스타일과 통일
// 2026-08-17 · apiClient 마이그레이션

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import {
  HelpCircle, AlertTriangle, StickyNote, Search, Plus, Send, X as XIcon, Image as ImageIcon,
  ChevronLeft, Pin, MessageCircle, Trash2,
  Camera, AtSign, Pencil, Check,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { CARD_BASE } from "../../styles/tokens";
import { CategoryChips, type ChipTone } from "../common/CategoryChips";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
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
        const { data: list } = await api.get<Employee[]>("/api/employees");
        setEmployees(Array.isArray(list) ? list : []);
      } catch { /* ignore */ }
    })();
  }, []);

  const filtered: BoardPost[] = useMemo(() => {
    if (!filterCategory) return posts;
    if (filterCategory === "__none__") return posts.filter(p => !p.category);
    return posts.filter(p => p.category === filterCategory);
  }, [posts, filterCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA]">
      <AppNavHeader activePage="board" authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      {/* 2026-08-31 · 사용자 지시 · SplitPanel 통일 넓이 (85% · max 1360px) · 목업 톤 */}
      <main className="flex-1 max-w-[1360px] w-[85%] mx-auto px-3 sm:px-4 py-3 sm:py-4">
        {/* 필터 · 검색 · 새글 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·본문 검색"
              className="w-full pl-9 pr-3 py-2 text-[15px] font-semibold bg-white border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowComposer(true)}
            disabled={!authSession?.employeeId}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold shadow-sm active:scale-95 transition-all duration-150 disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={3} /> 새 글
          </button>
        </div>

        {/* 2026-08-17 · 상태 필터 · 공용 CategoryChips · 딥네이비 · Vercel status dot */}
        <div className="mb-2">
          <CategoryChips
            label="상태"
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as Status | "")}
            size="md"
            ariaLabel="이슈 상태 필터"
            options={[
              { value: "" as Status | "", label: "전체", tone: "zinc" },
              { value: "open"        as Status | "", label: "미해결", tone: "rose"    },
              { value: "in_progress" as Status | "", label: "진행중", tone: "amber"   },
              { value: "resolved"    as Status | "", label: "해결",   tone: "emerald" },
            ]}
          />
        </div>

        {/* 카테고리 필터 · 공용 CategoryChips · 딥네이비 통일 */}
        <div className="mb-3">
          <CategoryChips
            label="카테고리"
            value={filterCategory}
            onChange={(v) => setFilterCategory(v as typeof filterCategory)}
            size="md"
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
        </div>

        {/* 목록 · 재고관리 스타일 통일 (2026-07-16) */}
        {loading && filtered.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mb-1 bg-brand-tint border border-brand/15 rounded-md sticky top-0 z-10">
            <Spinner size={11} tone="brand" label="새로 불러오는 중..." labelSize={14} />
          </div>
        )}
        {loading && filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩 중..." labelSize={12} /></div>
        ) : !loading && filtered.length === 0 ? (
          <div className="text-center text-[15px] text-zinc-300 py-6">등록된 글 없음</div>
        ) : (
          <div className={`${CARD_BASE} ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            {/* 이슈리스트 제목 · 2026-08-17 · 세련 · accent bar + 딥네이비 통일 */}
            <div className="flex items-center justify-between px-4 py-3 gap-2 flex-wrap border-b border-line">
              <div className="flex items-center gap-2.5">
                <AccentBar />
                <StickyNote size={16} className="text-brand-deep" />
                <span className="text-[16px] font-bold text-ink tracking-tight">이슈리스트</span>
                <StatusPill tone="brand" size="md">{filtered.length}건</StatusPill>
              </div>
              <span className="text-[13px] text-ink-soft font-medium">항목 클릭 → 상세</span>
            </div>
            <div className="divide-y divide-zinc-50">
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
          </div>
        )}
      </main>

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
