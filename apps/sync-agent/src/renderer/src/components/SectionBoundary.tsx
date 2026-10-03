// apps/sync-agent/src/renderer/src/components/SectionBoundary.tsx
// 2026-10-03 · Section 단위 ErrorBoundary · WHITE SCREEN 영구 방어
//   · 특정 섹션에서 render 중 throw 가 발생해도 Dashboard 전체는 유지
//   · 사용자 지시 9 · 각 기능 독립 로딩

import React from "react";

interface Props {
  name: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class SectionBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[SectionBoundary:${this.props.name}] render 에러`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="border border-rose-200 bg-rose-50 rounded-xl p-4 text-[13px] text-rose-900">
          <div className="font-bold text-rose-700 mb-1">⚠ {this.props.name} 섹션 로드 실패</div>
          <div className="text-[12px] text-rose-700 mb-2">
            이 영역만 일시적으로 사용할 수 없습니다. 다른 기능은 정상입니다.
          </div>
          <pre className="text-[11px] text-rose-900 whitespace-pre-wrap break-all bg-white border border-rose-100 rounded p-2 mb-2">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-3 py-1.5 bg-rose-600 text-white rounded text-[12px] font-semibold hover:bg-rose-700"
          >
            이 섹션 다시 시도
          </button>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
