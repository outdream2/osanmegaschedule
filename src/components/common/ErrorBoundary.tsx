// src/components/common/ErrorBoundary.tsx
// 2026-08-16 · #113 · React lazy chunk 로드 실패 whitescreen 방지
//   · React.lazy 로 분할 로딩된 컴포넌트 · 배포 후 chunk hash 변경으로 404 시 · 앱 전체 멈춤
//   · ErrorBoundary 로 감싸서 · 친절한 에러 카드 + [새로고침] 버튼 노출
//   · ChunkLoadError 는 자동 감지 · "새 버전이 배포되었습니다" 안내
import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 에러 발생 시 · 사용자 정의 fallback (없으면 기본 카드) */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info?.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  hardReload = (): void => {
    try { window.location.reload(); } catch { /* silent */ }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // 사용자 정의 fallback 우선
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    // ChunkLoadError · 배포 후 옛 chunk 파일 404 · 새로고침으로 해결
    const isChunkError = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
      error.message ?? "",
    );

    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 shadow-lg p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-2xl">
              {isChunkError ? "🔄" : "⚠️"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-bold text-zinc-900">
                {isChunkError ? "새 버전이 배포되었습니다" : "일시적인 오류가 발생했습니다"}
              </div>
              <div className="text-[12px] text-zinc-500 mt-0.5">
                {isChunkError
                  ? "새로고침 후 계속 이용해주세요"
                  : "새로고침하거나 다시 시도해주세요"}
              </div>
            </div>
          </div>
          {/* 에러 상세 · 개발 모드에서만 · production 은 숨김 */}
          {import.meta.env?.DEV && (
            <details className="text-[11px] text-zinc-400 bg-zinc-50 rounded p-2">
              <summary className="cursor-pointer font-semibold">에러 상세 (개발용)</summary>
              <pre className="whitespace-pre-wrap break-words mt-2">{error.message}</pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.hardReload}
              className="flex-1 h-10 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[13px] font-bold shadow-sm transition cursor-pointer active:scale-95"
            >
              🔄 새로고침
            </button>
            {!isChunkError && (
              <button
                type="button"
                onClick={this.reset}
                className="flex-1 h-10 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[13px] font-bold transition cursor-pointer active:scale-95"
              >
                다시 시도
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
