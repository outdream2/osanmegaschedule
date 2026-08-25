// 2026-08-22 · Framework Phase 4 · ContractSettingsPage.tsx large-file 분리
// CompanyInfoSection · 회사 정보 섹션 (접기·회사명·대표자·주소·사업자번호·임금지급일)
//   · props-driven pure display

import React from "react";
import { Info, Warning, Check, FloppyDisk } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";

type SaveState = "idle" | "saving" | "saved" | "error";

interface CompanyInfo {
  name: string;
  representativeName: string;
  address: string;
  regNo: string;
  representativeTitle?: string;
}

interface CompanyInfoSectionProps {
  companyInfoOpen: boolean;
  setCompanyInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  companyInfo: CompanyInfo;
  setCompanyInfo: React.Dispatch<React.SetStateAction<CompanyInfo>>;
  companyInfoLoaded: boolean;
  companyInfoSaveState: SaveState;
  paymentDayText: string;
  setPaymentDayText: (v: string) => void;
  paymentDayLoaded: boolean;
  saveCompanyInfoNow: () => Promise<any>;
  savePaymentDayNow: () => Promise<any>;
}

export const CompanyInfoSection: React.FC<CompanyInfoSectionProps> = ({
  companyInfoOpen, setCompanyInfoOpen,
  companyInfo, setCompanyInfo,
  companyInfoLoaded, companyInfoSaveState,
  paymentDayText, setPaymentDayText, paymentDayLoaded,
  saveCompanyInfoNow, savePaymentDayNow,
}) => {
  return (
    <Card as="section" clip padding="none" topAccent>
      <button
        type="button"
        onClick={() => setCompanyInfoOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/60 hover:bg-zinc-100/60 transition cursor-pointer"
        aria-expanded={companyInfoOpen}
      >
        <span className={`text-zinc-400 transition-transform ${companyInfoOpen ? "" : "-rotate-90"}`}>▼</span>
        <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <Info size={14} weight="fill" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <h2 className="text-[13px] font-bold text-emerald-700 leading-none">회사 정보</h2>
          <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">근로계약서 사업주란 자동 채움 · 편집 즉시 저장</p>
        </div>
        {!companyInfoLoaded && (
          <Spinner size={11} tone="zinc" label="로딩 중..." labelSize={11} className="shrink-0" />
        )}
        {companyInfoLoaded && companyInfoSaveState === "saving" && (
          <Spinner size={11} tone="violet" label="저장 중..." labelSize={11} className="shrink-0" />
        )}
        {companyInfoLoaded && companyInfoSaveState === "saved" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold shrink-0">
            <Check size={11} weight="bold" /> 저장됨
          </span>
        )}
        {companyInfoLoaded && companyInfoSaveState === "error" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-semibold shrink-0">
            <Warning size={11} weight="fill" /> 저장 실패
          </span>
        )}
      </button>

      {companyInfoOpen && (
      <div className="p-3 grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-zinc-500">상호</label>
          <input
            type="text"
            value={companyInfo.name}
            onChange={(e) => setCompanyInfo(prev => ({ ...prev, name: e.target.value }))}
            placeholder="예) 오산 메가타운 약국"
            disabled={!companyInfoLoaded}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-zinc-500">대표자 이름</label>
          <input
            type="text"
            value={companyInfo.representativeName}
            onChange={(e) => setCompanyInfo(prev => ({ ...prev, representativeName: e.target.value }))}
            placeholder="예) 강남성"
            disabled={!companyInfoLoaded}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="text-[11px] font-bold text-zinc-500">사업장 주소</label>
          <input
            type="text"
            value={companyInfo.address}
            onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
            placeholder="예) 경기도 오산시 경기대로 868-4 2층"
            disabled={!companyInfoLoaded}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-zinc-500">사업자등록번호 <span className="text-zinc-400 font-normal">(선택)</span></label>
          <input
            type="text"
            value={companyInfo.regNo}
            onChange={(e) => setCompanyInfo(prev => ({ ...prev, regNo: e.target.value }))}
            placeholder="예) 123-45-67890"
            disabled={!companyInfoLoaded}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-zinc-500">대표자 직함 <span className="text-zinc-400 font-normal">(선택)</span></label>
          <input
            type="text"
            value={companyInfo.representativeTitle ?? ""}
            onChange={(e) => setCompanyInfo(prev => ({ ...prev, representativeTitle: e.target.value }))}
            placeholder="예) 대표약사"
            disabled={!companyInfoLoaded}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <label className="text-[11px] font-bold text-zinc-500">
            임금지급일 <span className="text-zinc-400 font-normal">(근로계약서에 자동 반영)</span>
          </label>
          <textarea
            value={paymentDayText}
            onChange={(e) => setPaymentDayText(e.target.value)}
            placeholder="예) 당월 01일부터 당월 말일 까지 근로한 부분에 대하여 당월 말일에 '을' 본인 명의의 통장으로 지급한다."
            disabled={!paymentDayLoaded}
            rows={2}
            className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition disabled:opacity-50 resize-none"
          />
        </div>
        <div className="col-span-2 flex justify-end pt-1">
          <button
            type="button"
            onClick={async () => {
              await Promise.all([saveCompanyInfoNow(), savePaymentDayNow()]);
            }}
            disabled={!companyInfoLoaded || companyInfoSaveState === "saving"}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:bg-emerald-300 text-white text-[12px] font-bold shadow-sm transition-colors cursor-pointer"
          >
            <FloppyDisk size={12} weight="bold" />
            {companyInfoSaveState === "saving" ? "저장 중..." : "회사 정보 저장"}
          </button>
        </div>
      </div>
      )}
    </Card>
  );
};
