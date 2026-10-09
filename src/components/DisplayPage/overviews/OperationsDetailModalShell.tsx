// src/components/DisplayPage/overviews/OperationsDetailModalShell.tsx
// 2026-10-09 · GLOBAL UI · 공통 Modal Shell (header/body scroll/sticky footer)
//   · common/Modal 재사용 · 신규 modal architecture 금지
//   · 각 domain-specific modal (OrderDetailModal · ReturnDetailModal · 등) 이 이 shell을 wrap
//   · 폰트 · title 20 · section 16 · body 14 (사용자 리밸런싱)

import React from "react";
import { Modal } from "../../common/Modal";

export type OperationsModalSize = "md" | "lg" | "xl";

export interface OperationsDetailModalShellProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  size?: OperationsModalSize;
  loading?: boolean;
  errorMessage?: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
}

export const OperationsDetailModalShell: React.FC<OperationsDetailModalShellProps> = ({
  open, onClose, title, icon, size = "lg",
  loading, errorMessage, summary, children, footerLeft, footerRight,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon}
      size={size}
      titleAccent
      bodyPadding="default"
    >
      {errorMessage && (
        <div className="mb-3 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[13px]">
          {errorMessage}
        </div>
      )}
      {summary && <div className="mb-4">{summary}</div>}
      <div className="relative min-h-[80px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10 rounded-lg">
            <span className="text-[13px] font-medium text-ink-soft">불러오는 중...</span>
          </div>
        )}
        {children}
      </div>
      {(footerLeft || footerRight) && (
        <footer className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">{footerLeft}</div>
          <div className="flex items-center gap-2">{footerRight}</div>
        </footer>
      )}
    </Modal>
  );
};

export default OperationsDetailModalShell;
