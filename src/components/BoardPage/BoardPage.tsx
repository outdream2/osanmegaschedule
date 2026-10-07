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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Compact search · 기존 className 스타일 유지 (focus ring, placeholder color) */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·본문 검색"
              aria-label="게시물 검색"
              className="text-[14px] border border-line rounded-lg px-3 h-9 min-w-[180px] max-w-[320px] flex-1 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors bg-white text-ink placeholder-ink-soft"
            />
            <span className="h-5 w-px bg-line" aria-hidden />
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
          </div>
        }
      >
        {/* Dense list · card wrapper 제거 · divide-y 로 row 구분 · reload overlay 는 inline spinner */}
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
