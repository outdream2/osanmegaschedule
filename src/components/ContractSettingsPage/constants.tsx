// src/components/ContractSettingsPage/constants.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ContractSettingsPage 상수 이관
import React from "react";
import {
  Coins, Clock, Calendar, Shield, ListChecks, Lock,
} from "@phosphor-icons/react";
import type { ContractCategory, ClauseGroupKey } from "../../lib/contract";

// ─────────────────────────────────────────────────────────────────────────────
// 메타 · 직군 & 각 호 그룹
// ─────────────────────────────────────────────────────────────────────────────
export const JOB_META: Array<{
  key: ContractCategory;
  label: string;
  color: string;
  bg: string;
  border: string;
  accent: string;
}> = [
  { key: "약사", label: "약사", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", accent: "border-l-violet-400" },
  { key: "매장", label: "매장", color: "text-sky-700",    bg: "bg-sky-50",   border: "border-sky-200",   accent: "border-l-sky-400"    },
  { key: "창고", label: "창고", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  accent: "border-l-amber-400"  },
  { key: "기타", label: "기타", color: "text-zinc-700",  bg: "bg-zinc-50",  border: "border-line",  accent: "border-l-zinc-400"  },
];

export const CLAUSE_GROUP_META: Array<{
  key: ClauseGroupKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; weight?: any; className?: string }>;
  color: string;
  bg: string;
  border: string;
}> = [
  { key: "wageClauses",       label: "임금 단서",      desc: "임금·수당 지급 약정",     icon: Coins,      color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  { key: "workTimeClauses",   label: "근로시간·휴게",  desc: "근로시간·간주근로 약정",  icon: Clock,      color: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200"     },
  { key: "holidayClauses",    label: "휴일",           desc: "주휴일·공휴일·휴무",      icon: Calendar,   color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200"    },
  { key: "disciplineClauses", label: "징계·해지 사유", desc: "근로계약 해지 각 호",      icon: Shield,     color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"    },
  { key: "etcClauses",        label: "기타",           desc: "지급방법·비밀·인수인계",  icon: ListChecks, color: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200"  },
  { key: "privacyClauses",    label: "개인정보",       desc: "개인정보·CCTV 수집",      icon: Lock,       color: "text-zinc-700",   bg: "bg-zinc-50",   border: "border-line"   },
];
