// src/components/BoardPage/constants.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 상수 이관
import { HelpCircle, AlertTriangle, StickyNote } from "lucide-react";
import type { PostType, Status } from "./types";

export const TYPE_META: Record<PostType, { label: string; icon: any; bg: string; text: string; border: string; }> = {
  question: { label: "질문", icon: HelpCircle,    bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  issue:    { label: "이슈", icon: AlertTriangle, bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  memo:     { label: "메모", icon: StickyNote,    bg: "bg-zinc-50",  text: "text-zinc-700",  border: "border-line" },
};

export const STATUS_META: Record<Status, { label: string; dot: string; text: string; }> = {
  open:        { label: "미해결", dot: "bg-rose-500",    text: "text-rose-600" },
  in_progress: { label: "진행중", dot: "bg-amber-500",   text: "text-amber-600" },
  resolved:    { label: "해결",   dot: "bg-emerald-500", text: "text-emerald-600" },
};

export const CATEGORIES = ["결제", "상품", "주문", "손님", "기타"] as const;
