// src/components/BottomNav.tsx
// 모바일 하단 5탭 · 홈/스케줄/요청/이슈/더보기
// - 모바일에서만 표시 (sm:hidden)
// - 활성 탭 하이라이트 + iOS 스타일 페일
// - "더보기" 는 나머지 페이지를 sheet 로 노출

import React, { useState } from "react";
import {
  Home, Calendar, MessageSquare, MessageCircleQuestion, Menu,
  LayoutGrid, ScanLine, FileText, UtensilsCrossed, CalendarDays,
  Lock, LogOut, Package, Bell,
} from "lucide-react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "./AppNavHeader";
// 2026-08-23 · #191 확장 · BottomSheet primitive · 인라인 fixed inset-0 제거
import { BottomSheet } from "../common/BottomSheet";
// 2026-08-28 · 사용자 지시 · 모바일 페이지 가시성 · gate 적용 (SideNav 와 동일 · viewport="mobile")
import { usePageVisibility } from "../../hooks/usePageVisibility";

interface Props {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onNavigate: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface TabDef {
  key: AppNavPage | "more";
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}

const TABS: TabDef[] = [
  { key: "landing",  label: "홈",     icon: Home },
  { key: "schedule", label: "스케줄", icon: Calendar },
  { key: "requests", label: "요청",   icon: MessageSquare },
  { key: "board",    label: "이슈",   icon: MessageCircleQuestion },
  { key: "more",     label: "더보기", icon: Menu },
];

export const BottomNav: React.FC<Props> = ({ activePage, authSession, onNavigate, onLogout }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const level = authSession?.level ?? 0;
  const isManager = level >= 2;
  const isSuperAdmin = level >= 9;
  // 2026-08-28 · 사용자 지시 · 모바일 gate · 메뉴설정에서 mobile=false 인 페이지 · 하단탭·더보기 모두 숨김
  const { isVisible, loaded: visLoaded } = usePageVisibility();
  const mobileVisible = (pageKey: string) => !visLoaded || isVisible(pageKey, "mobile");

  const handleTap = (key: TabDef["key"]) => {
    if (key === "more") { setSheetOpen(true); return; }
    onNavigate(key as AppNavPage);
  };

  // 활성 매칭: 매장/재고/OCR 등은 "더보기" 그룹으로 취급
  const isActive = (key: TabDef["key"]) => {
    if (key === activePage) return true;
    if (key === "more" && ["display", "scan", "ocr", "leave", "lunch", "permissions", "stockarrivals", "stockcheck"].includes(activePage)) return true;
    return false;
  };

  return (
    <>
      {/* Bottom safe-area padding for pages · fixed 나 sticky 요소에 가리지 않도록 하단 여백 확보 */}
      <div className="sm:hidden h-20" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }} aria-hidden="true" />

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-line shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1">
          {TABS.filter(t => t.key === "more" || mobileVisible(t.key)).map(t => {
            const Icon = t.icon;
            const active = isActive(t.key);
            return (
              <button
                key={t.key}
                onClick={() => handleTap(t.key)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition active:scale-95 ${
                  active ? "text-orange-600" : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                <span className={`w-9 h-6 flex items-center justify-center rounded-full transition ${active ? "bg-orange-100" : ""}`}>
                  <Icon size={active ? 18 : 17} strokeWidth={active ? 2.6 : 2} />
                </span>
                <span className={`text-[10px] font-bold leading-none tracking-tight ${active ? "text-orange-700" : ""}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 2026-08-23 · #191 확장 · BottomSheet primitive 마이그레이션 */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={<h3 className="text-sm font-bold text-zinc-800">더보기</h3>}
        maxHeight="80vh"
        className="sm:hidden"
      >
        <div className="p-3 grid grid-cols-3 gap-2">
          {isManager && mobileVisible("display") && (
            <SheetTile icon={LayoutGrid} label="매장관리" color="sky" onClick={() => { setSheetOpen(false); onNavigate("display"); }} />
          )}
          {isManager && mobileVisible("scan") && (
            <SheetTile icon={Package} label="상품관리" color="violet" onClick={() => { setSheetOpen(false); onNavigate("scan"); }} />
          )}
          {isManager && mobileVisible("ocr") && (
            <SheetTile icon={FileText} label="거래명세서" color="amber" onClick={() => { setSheetOpen(false); onNavigate("ocr"); }} />
          )}
          {isManager && mobileVisible("stockarrivals") && (
            <SheetTile icon={Bell} label="입고알림" color="emerald" onClick={() => { setSheetOpen(false); onNavigate("stockarrivals"); }} />
          )}
          {isManager && mobileVisible("leave") && (
            <SheetTile icon={CalendarDays} label="연차승인" color="rose" onClick={() => { setSheetOpen(false); onNavigate("leave"); }} />
          )}
          {mobileVisible("lunch") && (
            <SheetTile icon={UtensilsCrossed} label="점심불참" color="red" onClick={() => { setSheetOpen(false); onNavigate("lunch"); }} />
          )}
          {mobileVisible("scan") && (
            <SheetTile icon={ScanLine} label="상품스캔" color="violet" onClick={() => { setSheetOpen(false); onNavigate("scan"); }} />
          )}
          {isSuperAdmin && mobileVisible("permissions") && (
            <SheetTile icon={Lock} label="권한관리" color="slate" onClick={() => { setSheetOpen(false); onNavigate("permissions"); }} />
          )}
          {onLogout && (
            <SheetTile icon={LogOut} label="로그아웃" color="red" onClick={() => { setSheetOpen(false); onLogout(); }} />
          )}
        </div>
      </BottomSheet>
    </>
  );
};

const TILE_COLORS: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  sky:     { bg: "hover:bg-sky-50",     border: "border-sky-200",     text: "text-sky-700",     iconBg: "bg-sky-100" },
  violet:  { bg: "hover:bg-violet-50",  border: "border-violet-200",  text: "text-violet-700",  iconBg: "bg-violet-100" },
  amber:   { bg: "hover:bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   iconBg: "bg-amber-100" },
  emerald: { bg: "hover:bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", iconBg: "bg-emerald-100" },
  rose:    { bg: "hover:bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    iconBg: "bg-rose-100" },
  red:     { bg: "hover:bg-red-50",     border: "border-red-200",     text: "text-red-700",     iconBg: "bg-red-100" },
  slate:   { bg: "hover:bg-zinc-50",   border: "border-line",   text: "text-zinc-700",   iconBg: "bg-zinc-100" },
};

function SheetTile({
  icon: Icon, label, color, onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  label: string; color: string; onClick: () => void;
}) {
  const c = TILE_COLORS[color] ?? TILE_COLORS.slate;
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 py-3 bg-white border ${c.border} rounded-2xl ${c.bg} active:scale-95 transition`}>
      <span className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center`}>
        <Icon size={18} className={c.text} strokeWidth={2.4} />
      </span>
      <span className={`text-[11px] font-bold ${c.text}`}>{label}</span>
    </button>
  );
}

export default BottomNav;
