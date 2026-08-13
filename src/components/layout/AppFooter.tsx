// src/components/AppFooter.tsx
// 전체 페이지 공통 하단 푸터
// 2026-08-12 · 프레임워크 · brand_identity·contact_info 반영 · 값 없으면 하드코딩 fallback 유지
import React from "react";
import { MapPin, Clock } from "lucide-react";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";

export const AppFooter: React.FC = () => {
  const { brand } = useBrandIdentity();
  const { contact } = useContactInfo();
  const hours = contact.businessHours || "09:00 - 22:00";
  const copyright = contact.copyrightText || "(주)이룸즈(IRUMS)";
  const shortName = brand.shortName || "오산메가타운";
  return (
    <div className="w-full flex items-center justify-center gap-3 py-3 text-zinc-400 text-[11px] font-medium flex-wrap">
      <span className="flex items-center gap-1.5"><MapPin size={11} />{shortName}</span>
      <span className="w-1 h-1 rounded-full bg-zinc-300" />
      <span className="flex items-center gap-1.5"><Clock size={11} />{hours}</span>
      <span className="w-1 h-1 rounded-full bg-zinc-300" />
      <span className="text-zinc-400">copyright {copyright}</span>
    </div>
  );
};
