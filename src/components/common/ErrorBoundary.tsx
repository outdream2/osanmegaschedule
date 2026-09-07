// src/components/common/ErrorBoundary.tsx
// 2026-08-16 · #113 · React lazy chunk 로드 실패 whitescreen 방지
// 2026-09-07 · 에러 상세 항상 표시 (DEV 전용 아님) · 컴포넌트 스택 · 타임스탬프 · "홈으로"
import React from "react";
import { Card } from "./Card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  timestamp: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, timestamp: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, timestamp: new Date().toLocaleString("ko-KR") };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info?.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error.name, error.message, "\n", info?.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null, timestamp: null });
  };

  goHome = (): void => {
    try { window.location.href = "/"; } catch { /* silent */ }
  };

  hardReload = (): void => {
    try { window.location.reload(); } catch { /* silent */ }
  };

  render(): React.ReactNode {
    const { error, componentStack, timestamp } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const isChunkError = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
      error.message ?? "",
    );
    const isHooksError = /Rendered (more|fewer) hooks/i.test(error.message ?? "");

    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <Card variant="brand-modal" padding="lg" rounded="2xl" className="max-w-xl w-full flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 text-2xl shrink-0">
              {isChunkError ? "🔄" : "⚠️"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-bold text-zinc-900">
                {isChunkError ? "새 버전이 배포되었습니다" : "오류가 발생했습니다"}
              </div>
              <div className="text-[14px] text-zinc-500 mt-0.5">
                {isChunkError ? "새로고침 후 계속 이용해주세요" :
                 isHooksError ? "React 내부 훅 오류 · 홈으로 이동 후 다시 시도하세요" :
                 "새로고침하거나 홈으로 이동해주세요"}
              </div>
            </div>
          </div>

          {/* 에러 상세 · 항상 표시 (디버그용) */}
          <div className="bg-zinc-900 rounded-lg p-3 font-mono text-[12px] overflow-auto max-h-[40vh] flex flex-col gap-2">
            {timestamp && (
              <div className="text-zinc-400 text-[11px]">⏱ {timestamp}</div>
            )}
            <div>
              <span className="text-rose-400 font-bold">{error.name}: </span>
              <span className="text-rose-200">{error.message}</span>
            </div>
            {error.stack && (
              <pre className="text-zinc-400 whitespace-pre-wrap break-words text-[11px] leading-relaxed border-t border-zinc-700 pt-2">
                {error.stack.replace(error.message, "").trim()}
              </pre>
            )}
            {componentStack && (
              <pre className="text-amber-300/70 whitespace-pre-wrap break-words text-[11px] leading-relaxed border-t border-zinc-700 pt-2">
                {componentStack.trim()}
              </pre>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={this.goHome}
              className="flex-1 h-10 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white text-[15px] font-bold shadow-sm transition cursor-pointer active:scale-95">
              🏠 홈으로
            </button>
            <button type="button" onClick={this.hardReload}
              className="flex-1 h-10 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[15px] font-bold transition cursor-pointer active:scale-95">
              🔄 새로고침
            </button>
            {!isChunkError && (
              <button type="button" onClick={this.reset}
                className="flex-1 h-10 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[15px] font-bold transition cursor-pointer active:scale-95">
                다시 시도
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }
}

export default ErrorBoundary;
