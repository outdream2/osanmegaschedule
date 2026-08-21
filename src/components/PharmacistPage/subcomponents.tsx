// src/components/PharmacistPage/subcomponents.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PharmacistPage 서브 컴포넌트 이관
//   · EmptyRightPanel · SubMenuListPanel
import React from "react";
import { FirstAid } from "@phosphor-icons/react";
import { Plus, Eye, FileText as FileTextIcon } from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import type { PharmMenuItem } from "../PharmacistMenuSettingsPage/PharmacistMenuSettingsPage";
import type { CategoryItem } from "./constants";
import { fmtBytes } from "./utils";

// ─────────────────────────────────────────────────────
// 우측 · 카테고리 미선택 시 안내 패널
// ─────────────────────────────────────────────────────
export const EmptyRightPanel: React.FC<{ tabLabel: string }> = ({ tabLabel }) => (
  <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]">
    <FirstAid size={40} className="mb-3 opacity-30" />
    <div className="text-sm font-bold">좌측에서 {tabLabel} 카테고리를 선택하세요</div>
    <div className="text-[15px] mt-1">하위메뉴가 이 영역에 표시됩니다</div>
  </div>
);

// ─────────────────────────────────────────────────────
// 우측 하위메뉴 리스트 패널
// ─────────────────────────────────────────────────────
export interface SubMenuListPanelProps {
  tabLabel: string;
  category: CategoryItem;
  items: PharmMenuItem[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  onOpenViewer: (item: PharmMenuItem) => void;
  onOpenSettings: () => void;
}

export const SubMenuListPanel: React.FC<SubMenuListPanelProps> = ({
  tabLabel, category, items, loading, error, isAdmin, onOpenViewer, onOpenSettings,
}) => {
  return (
    <Card padding="none" clip className="flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-100 bg-sky-50/60 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-sky-600 uppercase tracking-wider">{tabLabel}</div>
          <div className="text-[15px] font-bold text-zinc-800 leading-tight truncate">{category.title}</div>
          <div className="text-[15px] text-zinc-500 mt-0.5 truncate">{category.subtitle}</div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <StatusPill tone="sky" size="sm">{items.length}건</StatusPill>
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[15px] font-bold cursor-pointer transition shadow-sm"
              title="하위메뉴 추가·수정·삭제"
            >
              <Plus size={11} />
              추가·관리
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-700 font-semibold bg-rose-50 border-b border-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-10 flex flex-col items-center gap-2">
          <Spinner size={18} tone="sky" />
          <span className="text-xs text-zinc-400 font-bold">불러오는 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center">
            <FirstAid size={26} weight="fill" />
          </div>
          <div className="text-[14px] font-bold text-zinc-800">등록된 하위메뉴 없음</div>
          <div className="text-[14px] text-zinc-500 leading-snug max-w-md">
            {isAdmin ? (
              <>
                우측 상단 <b>추가·관리</b> 버튼으로 하위메뉴를 등록하세요.<br />
                이름만 등록하거나 PDF 등을 첨부할 수 있습니다.
              </>
            ) : (
              <>이 카테고리에는 아직 자료가 없습니다.<br />관리자에게 자료 등록을 요청하세요.</>
            )}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
          {items.map(row => {
            const hasFile = !!row.file_url;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpenViewer(row)}
                  disabled={!hasFile}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                    hasFile ? "hover:bg-sky-50/50 cursor-pointer" : "opacity-60 cursor-not-allowed"
                  }`}
                  title={hasFile ? "클릭 · PDF 뷰어 열기" : "첨부 파일 없음"}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    hasFile ? "bg-sky-100 text-sky-600" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    <FileTextIcon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-zinc-800 truncate">{row.title}</div>
                    <div className="text-[15px] text-zinc-400 mt-0.5 truncate font-semibold">
                      {row.file_name
                        ? <>{row.file_name}{row.file_size ? ` · ${fmtBytes(row.file_size)}` : ""}</>
                        : <span className="italic">파일 없음 (이름만)</span>}
                    </div>
                  </div>
                  {hasFile && (
                    <div className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 text-sky-700 text-[15px] font-bold">
                      <Eye size={11} />
                      열기
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
