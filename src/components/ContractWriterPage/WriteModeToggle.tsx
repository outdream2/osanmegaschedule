// src/components/ContractWriterPage/WriteModeToggle.tsx
// 작성 방식 토글 + PDF 업로드 모드 패널

import React from "react";
import {
  User, ClipboardText, DownloadSimple, X as XIcon,
} from "@phosphor-icons/react";
import type { ContractForm } from "./types";
import { CONTRACT_TYPES } from "./constants";
import { SelectOrCustom } from "./subcomponents";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { matchHangul } from "../../lib/hangulSearch";
import { TIMING } from "../../constants/timing";
import type { Employee } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface WriteModeToggleProps {
  form: ContractForm;
  upd: <K extends keyof ContractForm>(key: K, val: ContractForm[K]) => void;

  writeMode: "form" | "upload";
  setWriteMode: (m: "form" | "upload") => void;

  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  uploadBusy: boolean;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadContract: () => void;

  employees: Employee[];
  empLoading: boolean;
  empSearchOpen: boolean;
  setEmpSearchOpen: (v: boolean) => void;
  onSelectEmployee: (empIdRaw: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const fldInput = "w-full bg-white border border-line rounded-lg px-3 py-2 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-tint/60 focus:border-brand-deep transition placeholder:text-zinc-400 placeholder:font-normal";
const fldLabel = "block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1";
const cardInner = "rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 flex flex-col gap-2";
const cardGroupLabel = "text-[14px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mb-0.5";

export const WriteModeToggle: React.FC<WriteModeToggleProps> = ({
  form, upd,
  writeMode, setWriteMode,
  uploadFile, setUploadFile, uploadBusy, uploadInputRef, handleUploadContract,
  employees, empLoading, empSearchOpen, setEmpSearchOpen, onSelectEmployee,
}) => (
  <>
    {/* ── T-R (2026-08-05) · 작성 방식 토글 ── */}
    <Card padding="none" className="p-2">
      <div className="grid grid-cols-2 gap-1">
        {([
          { key: "form" as const,   label: "여기서 작성", desc: "폼 입력 → 미리보기 → PDF 생성" },
          { key: "upload" as const, label: "PDF 업로드",  desc: "이미 작성된 PDF 를 Drive 에 저장" },
        ]).map(m => {
          const active = writeMode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setWriteMode(m.key)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                active
                  ? "bg-indigo-50 border-indigo-400 shadow-sm"
                  : "bg-white border-line hover:bg-zinc-50"
              }`}
            >
              <span className={`text-[14px] font-bold ${active ? "text-indigo-700" : "text-zinc-600"}`}>
                {m.label}
              </span>
              <span className={`text-[14px] font-semibold ${active ? "text-zinc-600" : "text-zinc-400"}`}>
                {m.desc}
              </span>
            </button>
          );
        })}
      </div>
    </Card>

    {/* ── T-R · PDF 업로드 모드 ── */}
    {writeMode === "upload" && (
      <div className="rounded-xl border border-line bg-white p-3 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-100">
          <IconTile icon={<DownloadSimple size={13} weight="fill" />} tone="indigo" size="sm" />
          <span className="text-[14px] font-bold text-zinc-700">PDF 업로드 (Google Drive)</span>
        </div>

        <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2 text-[15px] text-zinc-600 leading-relaxed">
          이미 작성한 근로계약서 PDF 를 선택 후 [Google Drive 업로드] 를 누르세요. <br />
          · 저장 위치: Google Drive · <b>contract</b> 폴더 <br />
          · 이력: employee_contracts 테이블 · 링크 (Drive URL) 로 저장 <br />
          · 하단 근로자 정보 · 계약 유형 · 기간 · 입력 후 업로드 필수
        </div>

        {/* 근로자 기본 정보 · 업로드 필수 필드 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>
            <User size={10} weight="bold" />
            근로자 기본 정보 (업로드용)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 relative">
              <label className={fldLabel}>성명 *</label>
              <input
                type="text"
                value={form.employeeName}
                onChange={(e) => {
                  const val = e.target.value;
                  upd("employeeName", val);
                  setEmpSearchOpen(true);
                  if (form.employeeId != null) upd("employeeId", null);
                }}
                onFocus={() => setEmpSearchOpen(true)}
                onBlur={() => setTimeout(() => setEmpSearchOpen(false), TIMING.DEBOUNCE_INPUT)}
                placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 또는 검색"}
                autoComplete="off"
                className={fldInput}
              />
              {empSearchOpen && (() => {
                const q = form.employeeName.trim();
                const matches = q
                  ? employees.filter(e => matchHangul(e.name ?? "", q)).slice(0, 8)
                  : employees.slice(0, 8);
                if (matches.length === 0) return (
                  <Card variant="raw-lg" padding="none" className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 text-[14px] text-zinc-400 text-center">
                    일치하는 직원 없음 · 직접 입력
                  </Card>
                );
                return (
                  <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-line rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-zinc-100">
                    {matches.map(e => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => { onSelectEmployee(String(e.id)); setEmpSearchOpen(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                        >
                          <span className="text-[15px] font-bold text-zinc-800">{e.name}</span>
                          {e.position && <span className="text-[15px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">{e.position}</span>}
                          {e.phone && <span className="text-[15px] text-zinc-400 ml-auto tabular-nums">{e.phone}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
            <div>
              <label className={fldLabel}>계약 유형</label>
              <SelectOrCustom value={form.contractType} options={CONTRACT_TYPES} onChange={(v) => upd("contractType", v)} placeholder="예: 프리랜서" />
            </div>
            <div>
              <label className={fldLabel}>시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => upd("startDate", e.target.value)}
                className={fldInput}
              />
            </div>
            {!form.indefinite && (
              <div className="col-span-2">
                <label className={fldLabel}>종료일</label>
                <input type="date" value={form.endDate} onChange={(e) => upd("endDate", e.target.value)}
                  className={fldInput}
                />
              </div>
            )}
            <label className="col-span-2 inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.indefinite} onChange={(e) => upd("indefinite", e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600" />
              <span className="text-[14px] font-semibold text-zinc-700">무기한 (정규직) · 종료일 없음</span>
            </label>
          </div>
        </div>

        {/* 파일 선택 */}
        <div className={cardInner}>
          <div className={cardGroupLabel}>PDF 파일 선택</div>
          <input
            ref={uploadInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="w-full text-[14px] text-zinc-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[14px] file:font-bold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 file:cursor-pointer cursor-pointer"
          />
          {uploadFile && (
            <Card variant="flat" rounded="lg" padding="none" className="mt-1 flex items-center gap-2 text-[15px] text-zinc-600 px-2 py-1.5">
              <ClipboardText size={12} weight="fill" className="text-indigo-500 shrink-0" />
              <span className="truncate flex-1 font-semibold">{uploadFile.name}</span>
              <span className="tabular-nums text-[14px] text-zinc-400 shrink-0">
                {(uploadFile.size / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null);
                  if (uploadInputRef.current) uploadInputRef.current.value = "";
                }}
                className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer"
                title="선택 취소"
              >
                <XIcon size={11} weight="bold" />
              </button>
            </Card>
          )}
        </div>

        {/* 업로드 버튼 */}
        <button
          type="button"
          onClick={handleUploadContract}
          disabled={!uploadFile || uploadBusy || !form.employeeName.trim()}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-[15px] font-bold shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed ${
            uploadFile && !uploadBusy && form.employeeName.trim()
              ? "bg-brand-deep hover:brightness-110"
              : "bg-zinc-300 text-zinc-500"
          }`}
          title="Google Drive contract 폴더에 저장 · employee_contracts 이력 insert"
        >
          <DownloadSimple size={13} weight="bold" className="rotate-180" />
          {uploadBusy ? "업로드 중..." : "Google Drive 업로드"}
        </button>
      </div>
    )}
  </>
);
