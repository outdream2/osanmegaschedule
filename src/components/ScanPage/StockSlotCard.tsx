// 2026-08-22 · Framework Phase 4 · ProductInfoCard 5-slot 반복 → 재사용 컴포넌트
// 창고1/2·매장1/2/3 · 값 입력 + 저장 버튼 + 상태 (idle/loading/done/error) · 톤별 컬러 세트

import React from "react";
import { Warehouse, Store, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Spinner } from "../common/Spinner";

export type SlotStatus = "idle" | "loading" | "done" | "error";
export type SlotKind = "warehouse" | "store";

interface StockSlotCardProps {
  kind: SlotKind;
  label: string; // "창고1" · "매장1"
  zone?: string; // real_map slash 값 (매장만)
  value: number | "";
  onChange: (v: number | "") => void;
  status: SlotStatus;
  onSubmit: () => void;
  /** 톤 프리셋 · warehouse(cyan-1/2) · store(violet-1/2 · purple-3) */
  toneKey: "wh1" | "wh2" | "s1" | "s2" | "s3";
}

const TONE: Record<StockSlotCardProps["toneKey"], {
  card: string; // 카드 outer border
  label: string; // 헤더 텍스트 색
  input: string; // input bg/border
  btn: string; // 저장 버튼 색
}> = {
  wh1: {
    card:  "border-cyan-200",
    label: "text-cyan-600",
    input: "bg-cyan-50/50 border-cyan-200 focus:border-cyan-400",
    btn:   "bg-cyan-500 hover:bg-cyan-600",
  },
  wh2: {
    card:  "border-cyan-300",
    label: "text-cyan-700",
    input: "bg-cyan-100/40 border-cyan-300 focus:border-cyan-500",
    btn:   "bg-cyan-600 hover:bg-cyan-700",
  },
  s1: {
    card:  "border-violet-200",
    label: "text-violet-600",
    input: "bg-violet-50/50 border-violet-200 focus:border-brand-deep",
    btn:   "bg-violet-500 hover:bg-violet-600",
  },
  s2: {
    card:  "border-violet-300",
    label: "text-violet-700",
    input: "bg-violet-100/40 border-violet-300 focus:border-brand-deep",
    btn:   "bg-violet-600 hover:bg-violet-700",
  },
  s3: {
    card:  "border-purple-300",
    label: "text-purple-700",
    input: "bg-purple-100/40 border-purple-300 focus:border-purple-500",
    btn:   "bg-purple-600 hover:bg-purple-700",
  },
};

export const StockSlotCard: React.FC<StockSlotCardProps> = ({
  kind, label, zone, value, onChange, status, onSubmit, toneKey,
}) => {
  const t = TONE[toneKey];
  const Icon = kind === "warehouse" ? Warehouse : Store;
  return (
    <div className={`bg-white rounded-lg border py-1 px-1 text-center ${t.card}`}>
      <p className={`text-[12px] font-semibold mb-0.5 flex items-center justify-center gap-0.5 flex-wrap ${t.label}`}>
        <Icon size={10} />{label}
        {zone && <span className={`text-[10px] font-semibold leading-tight ${toneKey === "s3" ? "text-purple-800" : "text-violet-800"}`}>{zone}</span>}
      </p>
      <input
        type="number" min="0"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={`w-full text-sm font-bold text-center border rounded px-1 py-0 outline-none transition ${t.input}`}
        placeholder="—"
      />
      {status === "done" ? (
        <div className="mt-0.5 text-[11px] font-bold text-emerald-700 flex items-center justify-center gap-0.5"><CheckCircle2 size={10} /> 저장됨</div>
      ) : (
        <button
          onClick={onSubmit}
          disabled={status === "loading" || value === ""}
          className={`mt-0.5 w-full text-[11px] font-bold rounded transition cursor-pointer disabled:opacity-40 text-white py-0.5 flex items-center justify-center gap-0.5 ${t.btn}`}
        >
          {status === "loading" ? <Spinner size={9} /> : <ClipboardCheck size={9} />}
          {status === "loading" ? "저장중" : status === "error" ? "재시도" : "저장"}
        </button>
      )}
    </div>
  );
};
