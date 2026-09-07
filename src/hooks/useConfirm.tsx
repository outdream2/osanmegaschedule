// src/hooks/useConfirm.tsx
// 2026-08-06 · T-SLIM D · Promise-based 확인 다이얼로그 훅
//
// 사용 예:
//   const confirm = useConfirm();
//   if (await confirm({ message: "삭제할까요?", danger: true })) {
//     doDelete();
//   }
//
// ConfirmProvider를 앱 루트에 마운트해야 함 (App.tsx or main.tsx)

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

interface ConfirmOptions {
  title?: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 중립(3번째) 버튼 · 지정 시 · Promise 는 "neutral" 반환 */
  neutralLabel?: string;
  danger?: boolean;
}

export type ConfirmResult = boolean | "neutral";

interface ConfirmState extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * ConfirmProvider
 * App 루트에 한 번만 마운트:
 *   <ConfirmProvider><App /></ConfirmProvider>
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ConfirmState | null>(null);
  // resolveRef: setState 후 stale closure 방지
  const resolveRef = useRef<((result: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<ConfirmResult>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleNeutral = useCallback(() => {
    resolveRef.current?.("neutral");
    resolveRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          open
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          neutralLabel={state.neutralLabel}
          danger={state.danger}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onNeutral={state.neutralLabel ? handleNeutral : undefined}
        />
      )}
    </ConfirmContext.Provider>
  );
};

/**
 * useConfirm
 * ConfirmProvider 하위 컴포넌트에서 사용:
 *   const confirm = useConfirm();
 *   if (await confirm({ message: "삭제?" })) { ... }
 */
export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm: ConfirmProvider 가 마운트되지 않았습니다.");
  }
  return ctx;
};

export default useConfirm;
