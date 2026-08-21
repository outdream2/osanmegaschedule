// src/components/HrFormsPage/subcomponents.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · 서브 컴포넌트 이관
//   · FileTypeBadge · CatChip · DropZone · EmptyState
import React, { useState } from "react";
import { CheckCircle2, CloudUpload, X, Plus, FileText } from "lucide-react";
import { IconTile } from "../common/IconTile";
import { fileIconInfo, fmtBytes } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// 서브: 파일 타입 배지
// ─────────────────────────────────────────────────────────────────────────────
export const FileTypeBadge: React.FC<{ fileName: string | null; mimeType?: string | null; size?: number }> = ({
  fileName,
  mimeType,
  size = 16,
}) => {
  const { Icon, colorClass } = fileIconInfo(fileName, mimeType);
  return (
    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${colorClass} shrink-0`}>
      <Icon size={size} />
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 서브: 카테고리 필터 chip
// ─────────────────────────────────────────────────────────────────────────────
export const CatChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  badgeClass: string;
  activeClass: string;
}> = ({ active, onClick, label, count, badgeClass, activeClass }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 cursor-pointer",
      active ? activeClass : `${badgeClass} hover:brightness-95`,
    ].join(" ")}
  >
    <span>{label}</span>
    <span
      className={[
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[14px] font-bold leading-none",
        active ? "bg-white/20 text-white" : "bg-white/60 text-zinc-600",
      ].join(" ")}
    >
      {count}
    </span>
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// 서브: 드래그&드롭 업로드 존
// ─────────────────────────────────────────────────────────────────────────────
export const DropZone: React.FC<{
  file: File | null;
  onFile: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error?: string | null;
}> = ({ file, onFile, inputRef, error }) => {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0] ?? null;
    onFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0] ?? null);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={[
        "relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-all duration-150 select-none",
        dragging
          ? "border-amber-400 bg-amber-50/60 scale-[1.01]"
          : file
          ? "border-emerald-300 bg-emerald-50/40"
          : error
          ? "border-rose-300 bg-rose-50/30"
          : "border-line bg-zinc-50/50 hover:border-amber-300 hover:bg-amber-50/30",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={handleInputChange}
        tabIndex={-1}
      />

      {file ? (
        <>
          <CheckCircle2 size={28} className="text-emerald-500" />
          <div className="text-center">
            <p className="text-sm font-bold text-zinc-800 break-all">{file.name}</p>
            <p className="text-xs text-zinc-500 font-semibold mt-0.5">{fmtBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onFile(null); if (inputRef.current) inputRef.current.value = ""; }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-line text-zinc-500 hover:text-rose-600 hover:border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            <X size={11} /> 파일 제거
          </button>
        </>
      ) : (
        <>
          <CloudUpload size={28} className={dragging ? "text-amber-500" : "text-zinc-400"} />
          <div className="text-center">
            <p className="text-sm font-bold text-zinc-600">클릭 또는 파일을 드래그하세요</p>
            <p className="text-xs text-zinc-400 font-semibold mt-0.5">PDF · Word · Excel · HWP · 이미지 · 최대 10MB</p>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 서브: empty state
// ─────────────────────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  isFiltered: boolean;
  isManager: boolean;
  onUpload: () => void;
}> = ({ isFiltered, isManager, onUpload }) => (
  <div className="py-16 flex flex-col items-center gap-4 text-center px-6">
    {/* 2026-08-18 · IconTile 확산 · 2xl · Empty state */}
    <IconTile icon={<FileText size={28} />} tone="zinc" size="2xl" shape="rounded-2xl" />

    <div>
      <p className="text-base font-bold text-zinc-700">
        {isFiltered ? "검색 결과가 없습니다" : "등록된 양식이 없습니다"}
      </p>
      <p className="text-sm text-zinc-400 font-semibold mt-1">
        {isFiltered
          ? "다른 키워드나 카테고리로 검색해 보세요"
          : isManager
          ? "첫 번째 양식을 업로드해 직원들이 쉽게 다운받을 수 있도록 하세요"
          : "아직 등록된 양식이 없습니다. 관리자에게 문의하세요"}
      </p>
    </div>
    {!isFiltered && isManager && (
      <button
        type="button"
        onClick={onUpload}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
      >
        <Plus size={15} />
        첫 양식 업로드하기
      </button>
    )}
  </div>
);
