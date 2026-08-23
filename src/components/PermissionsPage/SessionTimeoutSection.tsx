// src/components/PermissionsPage/SessionTimeoutSection.tsx
// 2026-08-23 · #252 Phase 2 · 세션 만료 시간 · 관리자 편집 카드 (lv9 게이트 · PermissionsPage 임베드)
//   · 서버 KV `session_idle_timeout_minutes` · 5~480 분 · 기본 30
//   · 저장 시 · 다음 useAuth tick 부터 반영 (전역 · 즉시)
//   · 관련 · #186 (30분 자동 로그아웃) · #251 (탭 focus 즉시 로그아웃)

import React from "react";
import { Timer } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import {
  useSessionTimeoutSettingEditor,
  SESSION_TIMEOUT_DEFAULT_MINUTES,
  SESSION_TIMEOUT_MIN_MINUTES,
  SESSION_TIMEOUT_MAX_MINUTES,
} from "../../hooks/useSessionTimeoutSetting";

export const SessionTimeoutSection: React.FC = () => {
  const { value: minutes, setValue: setMinutes, loaded, saveState } = useSessionTimeoutSettingEditor();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(SESSION_TIMEOUT_MIN_MINUTES, Math.min(SESSION_TIMEOUT_MAX_MINUTES, Math.round(n)));
    setMinutes(clamped);
  };

  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Timer size={20} className="text-brand-deep shrink-0" />
        <h3 className="text-[16px] font-bold text-ink tracking-tight">세션 만료 시간</h3>
        {saveState === "saving" && (
          <span className="text-[12px] text-zinc-400 ml-2">저장 중...</span>
        )}
        {saveState === "saved" && (
          <span className="text-[12px] text-emerald-600 ml-2">저장됨</span>
        )}
        {saveState === "error" && (
          <span className="text-[12px] text-rose-600 ml-2">저장 실패</span>
        )}
      </div>

      <p className="text-[14px] text-ink-soft leading-relaxed">
        <strong className="text-ink">무동작 시간</strong> · 마우스·키보드·터치 무입력 상태로 <em className="text-brand-deep font-semibold">N분</em> 경과 시 · 자동 로그아웃 → 로그인 화면 이동
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="session-timeout-minutes" className="text-[14px] font-semibold text-ink">
          만료 시간
        </label>
        <input
          id="session-timeout-minutes"
          type="number"
          min={SESSION_TIMEOUT_MIN_MINUTES}
          max={SESSION_TIMEOUT_MAX_MINUTES}
          step={1}
          value={loaded ? minutes : SESSION_TIMEOUT_DEFAULT_MINUTES}
          onChange={handleChange}
          disabled={!loaded}
          className="w-24 h-9 px-2.5 text-[15px] font-semibold text-ink text-right border border-line rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums"
        />
        <span className="text-[14px] text-ink-soft">분</span>
        <span className="text-[12px] text-zinc-400 ml-2">
          (범위 · {SESSION_TIMEOUT_MIN_MINUTES}분 ~ {SESSION_TIMEOUT_MAX_MINUTES}분 · 기본 {SESSION_TIMEOUT_DEFAULT_MINUTES}분)
        </span>
      </div>

      <div className="text-[13px] text-ink-soft bg-zinc-50/60 border border-line rounded-lg px-3 py-2 leading-relaxed">
        💡 짧게 (5~15분) · 보안 강화 · 재로그인 잦음 · 민감 데이터 환경
        <br />
        💡 표준 (30분) · 일반 사무 환경 · 이 앱 기본값
        <br />
        💡 길게 (60~480분) · 편의성 우선 · 신뢰 환경 · 로그인 유지
        <br />
        💡 만료 5분 전 · 우측 하단 경고 알림 (계속 사용 or 로그아웃 선택)
      </div>
    </Card>
  );
};

export default SessionTimeoutSection;
