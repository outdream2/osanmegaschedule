// src/components/PharmacistPage/constants.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PharmacistPage 상수 이관
import { BookOpen, Video, FileText, GraduationCap } from "@phosphor-icons/react";
import type { TabDef as CommonTabDef } from "../common/TabBar";
import type { PharmTabKey } from "../PharmacistMenuSettingsPage/PharmacistMenuSettingsPage";

export interface CategoryItem { key: string; title: string; subtitle: string; custom?: boolean; }

export const PHARM_TABS: CommonTabDef<PharmTabKey>[] = [
  { key: "education", label: "교육자료",  icon: GraduationCap, color: "sky"     },
  { key: "reference", label: "복약지도",  icon: BookOpen,      color: "emerald" },
  { key: "video",     label: "동영상 강의", icon: Video,         color: "violet"  },
  { key: "docs",      label: "각종 문서",  icon: FileText,      color: "amber"   },
];

// 커스텀 카테고리 · app_settings key='education_custom_categories' 로 저장 (JSON 배열)
//   - zone 기반 카테고리와 병합 · 뒤쪽에 표시 · 삭제는 커스텀만 가능
//   - key 는 "cus_<timestamp>_<rand>" (zone key 와 충돌 방지)
export const CUSTOM_CATS_SETTINGS_KEY = "education_custom_categories";

export interface CustomCategoryRow { key: string; title: string; subtitle?: string; createdAt?: string; }

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// 교육자료 카테고리는 매장 구역(ZONE_DEFS) 기반 · buildEducationCategories 참조
export const CATEGORIES: Record<Exclude<PharmTabKey, "education">, CategoryItem[]> = {
  reference: [
    { key: "interact",   title: "상호작용",           subtitle: "병용 금기·주의" },
    { key: "adverse",    title: "부작용",             subtitle: "이상반응·대응" },
    { key: "pregnancy",  title: "임부·수유부",         subtitle: "안전성 등급" },
    { key: "chronic",    title: "만성질환",           subtitle: "고혈압·당뇨 등" },
  ],
  video: [
    { key: "recent",   title: "최신 강의",           subtitle: "약사회·제약사 최근 영상" },
    { key: "series",   title: "시리즈 강의",         subtitle: "테마별 연속 강의" },
    { key: "webinar",  title: "웨비나 다시보기",     subtitle: "실시간 세미나 녹화" },
  ],
  docs: [
    { key: "manual",  title: "매뉴얼",              subtitle: "업무 매뉴얼·SOP" },
    { key: "notice",  title: "환자 안내문",         subtitle: "복용법·주의사항" },
    { key: "form",    title: "각종 양식",           subtitle: "인수인계·체크리스트" },
    { key: "policy",  title: "내부 정책",           subtitle: "약국 운영 정책" },
  ],
};
