// src/components/ContractWriterPage/subcomponents.tsx
// 소형 공통 서브컴포넌트 (FieldLabel · SectionHeader · SpanBox · SelectOrCustom · InlineSignSpot)

import React, { useState, useEffect } from "react";
import { CUSTOM_OPTION } from "./constants";
import type { SignKey } from "../../hooks/useContractSignatures";

export const SelectOrCustom: React.FC<{
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  className?: string;
}> = ({ value, options, onChange, placeholder, suffix, className = "" }) => {
  const inList = options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(inList ? "select" : "custom");

  useEffect(() => {
    setMode(options.includes(value) ? "select" : "custom");
  }, [value, options]);

  return (
    <div className={`flex items-stretch gap-1 ${className}`}>
      {mode === "select" ? (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION) {
              setMode("custom");
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
          className="flex-1 min-w-0 bg-white border border-line rounded-lg px-2 py-1 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition cursor-pointer"
        >
          {options.map(o => (
            <option key={o} value={o}>{o}{suffix ? ` ${suffix}` : ""}</option>
          ))}
          <option value={CUSTOM_OPTION}>직접 입력...</option>
        </select>
      ) : (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-white border border-line rounded-lg px-2 py-1 text-[15px] text-zinc-800 font-semibold focus:outline-none focus:border-brand-deep transition"
          />
          <button
            type="button"
            onClick={() => {
              setMode("select");
              if (!options.includes(value)) onChange(options[0] ?? "");
            }}
            className="shrink-0 px-1.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-[15px] font-bold transition-colors cursor-pointer"
            title="드롭박스로 전환"
          >
            목록
          </button>
        </>
      )}
    </div>
  );
};

export const FieldLabel: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; required?: boolean }> = ({ icon, children, required }) => (
  <label className="text-[14px] font-bold text-zinc-600 flex items-center gap-1.5 mb-1">
    {icon}
    <span>{children}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
  </label>
);

export const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode; sub?: React.ReactNode }> = ({ icon, children, sub }) => (
  <div className="text-[15px] font-bold text-zinc-700 flex items-center gap-1.5 border-b border-zinc-100 pb-1 mb-2">
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-zinc-100 text-zinc-600">{icon}</span>
    <span>{children}</span>
    {sub && <span className="ml-auto text-[10.5px] font-semibold text-zinc-400">{sub}</span>}
  </div>
);

export const SpanBox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    className={`inline-flex items-center justify-center w-4 h-4 border-2 text-[14px] font-bold ${checked ? "border-emerald-600 text-emerald-600" : "border-zinc-400 text-transparent"}`}
    style={{ lineHeight: "1" }}
  >
    {checked ? "V" : ""}
  </span>
);

interface InlineSignSpotProps {
  signKey: SignKey;
  signUrl: string | null;
  stampUrl?: string | null;
  width?: number;
  height?: number;
  placeholder?: string;
  onOpen: (key: SignKey) => void;
  onClear: (key: SignKey) => void;
}

export const InlineSignSpot: React.FC<InlineSignSpotProps> = ({
  signKey, signUrl, stampUrl, width = 130, height = 36, placeholder = "(서명 또는 도장)", onOpen, onClear,
}) => {
  const has = !!signUrl;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        onClick={() => onOpen(signKey)}
        className={`relative inline-flex items-end justify-center border-b-2 cursor-pointer transition-colors ${
          has ? "border-emerald-400 bg-emerald-50/30" : "border-zinc-400 bg-amber-50/40 hover:bg-amber-100"
        }`}
        style={{ width, height }}
        title={has ? "서명 재작성 (클릭)" : `${placeholder} 클릭하여 서명`}
      >
        {stampUrl && (
          <img
            src={stampUrl}
            alt="도장"
            className="absolute right-0 top-1/2 -translate-y-1/2 opacity-80 pointer-events-none"
            style={{ width: Math.round(height * 1.1), height: Math.round(height * 1.1) }}
          />
        )}
        {has ? (
          <img
            src={signUrl!}
            alt="서명"
            className="max-h-full max-w-full object-contain relative z-10"
          />
        ) : (
          <span className="text-[14px] font-bold text-zinc-500 relative z-10 pb-0.5">
            {placeholder}
          </span>
        )}
      </span>
      {has && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(signKey); }}
          className="text-[15px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer px-0.5"
          title="서명 지우기"
        >
          ✕
        </button>
      )}
    </span>
  );
};
