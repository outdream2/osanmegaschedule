// 2026-09-21 · E-004 · 하얀 화면 방지 · ErrorBoundary + 부트 fallback 제거
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// ── ErrorBoundary · React 트리 어디서든 에러 발생 시 · 사용자에게 표시 ──
class RootBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RootBoundary] React 트리 에러:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#475569", fontSize: 15, fontFamily: "sans-serif" }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0F172A", marginBottom: 8 }}>
            📥 메가타운 자동임포트
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 16,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            ⚠ 앱 렌더 오류
            {"\n"}
            {this.state.error?.message ?? String(this.state.error)}
          </div>
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              background: "#0A2E4A",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<div style="padding:40px;color:#991b1b;font-family:sans-serif">⚠ #root 엘리먼트 없음</div>';
} else {
  // 부트 fallback 제거 (React 가 성공적으로 마운트 · createRoot 가 innerHTML 을 대체)
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <RootBoundary>
        <App />
      </RootBoundary>
    </React.StrictMode>,
  );
}
