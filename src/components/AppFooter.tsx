// src/components/AppFooter.tsx
// 전체 페이지 공통 하단 푸터
import React from "react";
import { MapPin, Clock } from "lucide-react";

export const AppFooter: React.FC = () => (
  <div className="w-full flex items-center justify-center gap-3 py-3 text-slate-400 text-[11px] font-medium flex-wrap">
    <span className="flex items-center gap-1.5"><MapPin size={11} />오산메가타운</span>
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    <span className="flex items-center gap-1.5"><Clock size={11} />09:00 - 22:00</span>
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    <span className="text-slate-400">copyright (주)이룸</span>
  </div>
);
