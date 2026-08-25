// src/components/ScanPage/ExpiryDateModal.tsx
// 2026-08-25 · 사용자 지시 · 유통기한 임박 모달
//   · 트리거 · 스캔 상품 · [유통기한임박] 버튼 클릭
//   · 입력 · 입력날짜 (기본 today) + 유통기한 날짜
//   · 저장 · inventory_checks · expiry_input_date + expiry_date 컬럼 (migration 20260825)
//   · 병행 · products.expiry_date 도 유통기한 날짜로 업데이트 (기존 red highlight 로직 유지)

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Calendar, Save } from "lucide-react";
import { Modal } from "../common/Modal";
import { api } from "../../lib/apiClient";
import type { StockRow } from "./stockRowTypes";

interface ExpiryDateModalProps {
  open: boolean;
  onClose: () => void;
  row: StockRow | null;
  /** 저장 성공 시 · ScanPage 로컬 rows 상태 sync 용 (product.expiry_date 갱신) */
  onSaved: (rowKey: string, expiryDate: string | null) => void;
  onToast: (message: string, ms?: number) => void;
}

const todayYmd = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const ExpiryDateModal: React.FC<ExpiryDateModalProps> = ({ open, onClose, row, onSaved, onToast }) => {
  const [inputDate, setInputDate] = useState<string>(todayYmd());
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달 열릴 때 · 기존 값 있으면 prefill · 없으면 today
  useEffect(() => {
    if (!open) return;
    const prev = (row?.product as { expiry_date?: string | null } | undefined)?.expiry_date;
    setInputDate(todayYmd());
    setExpiryDate(prev ? String(prev).slice(0, 10) : "");
    setError(null);
  }, [open, row]);

  const dDay = useMemo(() => {
    if (!expiryDate) return null;
    try {
      const now = new Date(inputDate + "T00:00:00");
      const exp = new Date(expiryDate + "T00:00:00");
      const diffMs = exp.getTime() - now.getTime();
      const days = Math.round(diffMs / 86400_000);
      return days;
    } catch { return null; }
  }, [inputDate, expiryDate]);

  const dDayLabel = dDay == null
    ? null
    : dDay < 0
      ? { text: `유통기한 ${Math.abs(dDay)}일 지남`, cls: "text-red-700 bg-red-50 border-red-200" }
      : dDay === 0
        ? { text: `오늘 만료`, cls: "text-amber-700 bg-amber-50 border-amber-200" }
        : dDay <= 30
          ? { text: `D-${dDay} 유통기한 임박`, cls: "text-amber-700 bg-amber-50 border-amber-200" }
          : { text: `D-${dDay}`, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" };

  const doSave = async () => {
    if (!row) return;
    if (!expiryDate) { setError("유통기한 날짜를 입력하세요"); return; }
    if (!inputDate)  { setError("입력 날짜를 입력하세요"); return; }
    setSaving(true);
    setError(null);
    try {
      // 1) inventory_checks · 입력날짜 + 유통기한 저장 (product_code + product_name 은 upsert 매칭용)
      await api.post("/api/inventory-checks", {
        product_code: row.code,
        product_name: row.product.name,
        expiry_input_date: inputDate,
        expiry_date:       expiryDate,
      });
      // 2) products.expiry_date · 기존 red-highlight 로직 유지 · 유통기한 날짜 그대로 저장
      await api.patch(`/api/products/${encodeURIComponent(row.code)}`, { expiry_date: expiryDate });

      onSaved(row.key, expiryDate);
      onToast(`[${row.product.name}] 유통기한 저장 완료 · 만료 ${expiryDate}`, 2800);
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? "네트워크 오류";
      setError(`저장 실패: ${msg}`);
      onToast(`저장 실패: ${msg}`, 3500);
    } finally {
      setSaving(false);
    }
  };

  const doClear = async () => {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/inventory-checks", {
        product_code: row.code,
        product_name: row.product.name,
        expiry_input_date: null,
        expiry_date:       null,
      });
      await api.patch(`/api/products/${encodeURIComponent(row.code)}`, { expiry_date: null });
      onSaved(row.key, null);
      onToast(`[${row.product.name}] 유통기한 임박 해제`, 2500);
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? "네트워크 오류";
      setError(`해제 실패: ${msg}`);
      onToast(`해제 실패: ${msg}`, 3500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<AlertCircle size={18} className="text-amber-500" />}
      title="유통기한 임박 저장"
      titleAccent
      size="lg-narrow"
      align="bottom-mobile"
      footer={(
        <div className="flex items-center justify-between gap-2 w-full">
          <button
            type="button"
            onClick={doClear}
            disabled={saving}
            className="text-[14px] font-semibold text-rose-600 hover:text-rose-700 underline underline-offset-4 disabled:opacity-40 cursor-pointer"
          >
            임박 해제
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-10 px-4 rounded-lg bg-white border border-line text-[14px] font-semibold text-ink-soft hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={doSave}
              disabled={saving || !expiryDate}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save size={14} /> 저장
            </button>
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-4 text-[14px]">
        {row && (
          <div className="rounded-xl border border-line bg-zinc-50/60 px-3 py-2.5">
            <div className="text-[15px] font-bold text-ink truncate">{row.product.name}</div>
            <div className="text-[13px] font-mono text-zinc-500 mt-0.5">{row.code}</div>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-ink-soft">입력 날짜</span>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="date"
              value={inputDate}
              onChange={(e) => setInputDate(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-line bg-white text-[14px] tabular-nums text-ink focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-deep/20"
              disabled={saving}
            />
          </div>
          <span className="text-[12px] text-zinc-400">유통기한 임박을 기록한 날짜 · 기본값 오늘</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-ink-soft">유통기한 날짜</span>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-line bg-white text-[14px] tabular-nums text-ink focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              disabled={saving}
            />
          </div>
          <span className="text-[12px] text-zinc-400">실제 상품에 표기된 만료일</span>
        </label>

        {dDayLabel && (
          <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-bold ${dDayLabel.cls}`}>
            <AlertCircle size={13} />
            <span>{dDayLabel.text}</span>
          </div>
        )}

        {error && (
          <div className="text-[13px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
            ⚠ {error}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExpiryDateModal;
