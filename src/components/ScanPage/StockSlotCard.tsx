// 2026-08-22 · Framework Phase 4 · ProductInfoCard 5-slot 반복 → 재사용 컴포넌트
// 창고1/2·매장1/2/3 · 값 입력 + 저장 버튼 + 상태 (idle/loading/done/error) · 톤별 컬러 세트
// 2026-08-25 · 사용자 지시 · sample/product_storage.png 참고 · pastel bg + 폰트 up + 여유 padding

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

// 2026-08-25 · pastel fill · sample/product_storage.png
// 2026-08-25 · 사용자 지시 · 창고끼리·매장끼리 색깔 통일 (그룹 시각 구분)
//   · 창고 (wh1·wh2) · cyan 통일 · 그룹 A
//   · 매장 (s1·s2·s3) · violet 통일 · 그룹 B
//   · 그룹 간 · cyan vs violet 로 명확 구분 · 그룹 내 · 같은 톤
const WAREHOUSE_TONE = {
  card:  "bg-cyan-50 border-cyan-200",
  label: "text-cyan-700",
  input: "bg-white border-cyan-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200",
  btn:   "bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border border-cyan-200",
  zoneText: "text-cyan-800",
};
const STORE_TONE = {
  card:  "bg-violet-50 border-violet-200",
  label: "text-violet-700",
  input: "bg-white border-violet-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200",
  btn:   "bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-200",
  zoneText: "text-violet-800",
};
const TONE: Record<StockSlotCardProps["toneKey"], typeof WAREHOUSE_TONE> = {
  wh1: WAREHOUSE_TONE,
  wh2: WAREHOUSE_TONE,
  s1:  STORE_TONE,
  s2:  STORE_TONE,
  s3:  STORE_TONE,
};

export const StockSlotCard: React.FC<StockSlotCardProps> = ({
  kind, label, zone, value, onChange, status, onSubmit, toneKey,
}) => {
  const t = TONE[toneKey];
  const Icon = kind === "warehouse" ? Warehouse : Store;
  return (
    <div className={`rounded-xl border py-2 px-2 text-center flex flex-col gap-1.5 ${t.card}`}>
      <p className={`text-[15px] font-bold flex items-center justify-center gap-1 flex-wrap leading-tight ${t.label}`}>
        <Icon size={12} strokeWidth={2.2} />
        <span>{label}</span>
        {zone && <span className={`text-[14px] font-bold leading-tight ${t.zoneText}`}>{zone}</span>}
      </p>
      <input
        type="number" min="0"
        value={value}
        onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={`w-full text-[15px] font-bold text-center border rounded-md px-1 py-1 outline-none transition tabular-nums ${t.input}`}
        placeholder="—"
      />
      {status === "done" ? (
        <div className="text-[14px] font-bold text-emerald-700 flex items-center justify-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 py-1">
          <CheckCircle2 size={12} /> 저장됨
        </div>
      ) : (
        <button
          onClick={onSubmit}
          disabled={status === "loading" || value === ""}
          className={`w-full text-[15px] font-bold rounded-md transition cursor-pointer disabled:opacity-40 py-1 flex items-center justify-center gap-1 ${t.btn}`}
        >
          {status === "loading" ? <Spinner size={11} /> : <ClipboardCheck size={12} />}
          {status === "loading" ? "저장중" : status === "error" ? "재시도" : "저장"}
        </button>
      )}
    </div>
  );
};
