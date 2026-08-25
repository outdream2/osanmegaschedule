// src/components/PermissionsPage/SessionTimeoutSection.tsx
// 2026-08-23 · #252 Phase 2 · 세션 만료 시간 · 관리자 편집 카드 (lv9 게이트 · PermissionsPage 임베드)
//   · 서버 KV `session_idle_timeout_minutes` · 5~480 분 · 기본 30
//   · 저장 시 · 다음 useAuth tick 부터 반영 (전역 · 즉시)
//   · 관련 · #186 (30분 자동 로그아웃) · #251 (탭 focus 즉시 로그아웃)
// 2026-08-25 · 사용자 지시 · 시스템 설정에도 추가 + v9 목업 디자인
//   · topAccent (gradient) · IconTile · 프리셋 chip · 폰트 +2 · Linear/Attio 톤

import React from "react";
import { Timer, ShieldCheck, Clock } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import {
  useSessionTimeoutSettingEditor,
  SESSION_TIMEOUT_DEFAULT_MINUTES,
  SESSION_TIMEOUT_MIN_MINUTES,
  SESSION_TIMEOUT_MAX_MINUTES,
} from "../../hooks/useSessionTimeoutSetting";

// 프리셋 · 흔한 시간 · 원클릭 적용
const PRESETS: Array<{ minutes: number; label: string; tone: "rose" | "amber" | "brand" | "emerald" | "zinc" }> = [
  { minutes: 5,   label: "5분",   tone: "rose"    },
  { minutes: 15,  label: "15분",  tone: "amber"   },
  { minutes: 30,  label: "30분",  tone: "brand"   },
  { minutes: 60,  label: "1시간", tone: "emerald" },
  { minutes: 120, label: "2시간", tone: "emerald" },
  { minutes: 240, label: "4시간", tone: "zinc"    },
  { minutes: 480, label: "8시간", tone: "zinc"    },
];

export const SessionTimeoutSection: React.FC = () => {
  const { value: minutes, setValue: setMinutes, loaded, saveState } = useSessionTimeoutSettingEditor();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(SESSION_TIMEOUT_MIN_MINUTES, Math.min(SESSION_TIMEOUT_MAX_MINUTES, Math.round(n)));
    setMinutes(clamped);
  };

  const current = loaded ? minutes : SESSION_TIMEOUT_DEFAULT_MINUTES;

  return (
    <Card padding="lg" topAccent clip className="flex flex-col gap-4">
      {/* 헤더 · IconTile + 타이틀 + 상태 pill */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-brand-tint flex items-center justify-center shrink-0">
          <Timer size={18} weight="duotone" className="text-brand-deep" />
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink leading-tight tracking-tight">세션 만료 시간</div>
          <div className="text-[13px] text-ink-soft leading-tight mt-0.5">
            무동작 시 자동 로그아웃 · 전역 즉시 반영
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saveState === "saving" && <StatusPill tone="sky" size="sm" dot pulse><Spinner size={10} className="inline mr-0.5" />저장중</StatusPill>}
          {saveState === "saved"  && <StatusPill tone="emerald" size="sm" dot>저장됨</StatusPill>}
          {saveState === "error"  && <StatusPill tone="rose" size="sm" dot>저장 실패</StatusPill>}
        </div>
      </div>

      {/* 현재값 카드 · 큰 숫자 · 시각 강조 */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-stretch">
        <div className="rounded-xl border border-brand-deep/20 bg-gradient-to-br from-brand-tint to-white p-4 min-w-[180px]">
          <div className="text-[12px] font-bold text-brand-deep/70 uppercase tracking-wider">현재 설정</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[36px] font-extrabold text-brand-deep tabular-nums leading-none tracking-tighter">{current}</span>
            <span className="text-[15px] font-bold text-brand-deep/60">분</span>
          </div>
          <div className="mt-2 text-[13px] text-ink-soft flex items-center gap-1">
            <Clock size={13} className="text-brand-deep/60" />
            <span>
              {current < 60 ? `${current}분` : `${Math.floor(current/60)}시간${current%60 ? ` ${current%60}분` : ""}`}
              {" 후 자동 로그아웃"}
            </span>
          </div>
        </div>

        {/* 프리셋 · 원클릭 적용 */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="text-[13px] font-bold text-ink-soft tracking-tight">프리셋 · 원클릭 적용</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => {
              const active = current === p.minutes;
              return (
                <button
                  key={p.minutes}
                  type="button"
                  onClick={() => setMinutes(p.minutes)}
                  disabled={!loaded}
                  className={[
                    "inline-flex items-center h-8 px-3 rounded-lg text-[13px] font-bold cursor-pointer transition disabled:opacity-40",
                    active
                      ? "bg-brand-deep text-white shadow-sm ring-1 ring-brand-deep/40"
                      : "bg-white border border-line text-ink-soft hover:border-brand-deep/40 hover:bg-brand-tint/20 hover:text-brand-deep",
                  ].join(" ")}
                  title={`${p.label} · 무동작 시 로그아웃`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* 수동 입력 */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <label htmlFor="session-timeout-minutes" className="text-[13px] font-semibold text-ink-soft">
              직접 입력
            </label>
            <input
              id="session-timeout-minutes"
              type="number"
              min={SESSION_TIMEOUT_MIN_MINUTES}
              max={SESSION_TIMEOUT_MAX_MINUTES}
              step={1}
              value={current}
              onChange={handleChange}
              disabled={!loaded}
              className="w-24 h-9 px-2.5 text-[15px] font-bold text-ink text-right border border-line rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums"
            />
            <span className="text-[13px] text-ink-soft">분</span>
            <span className="text-[12px] text-zinc-400">
              (범위 {SESSION_TIMEOUT_MIN_MINUTES}분 ~ {SESSION_TIMEOUT_MAX_MINUTES}분 · 기본 {SESSION_TIMEOUT_DEFAULT_MINUTES}분)
            </span>
          </div>
        </div>
      </div>

      {/* 안내 · 아이콘 tile + 3열 grid · Linear/Attio 톤 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { tone: "rose",    label: "짧게 · 5~15분",  desc: "보안 강화 · 재로그인 잦음 · 민감 데이터 환경" },
          { tone: "brand",   label: "표준 · 30분",     desc: "일반 사무 환경 · 이 앱 기본값 (권장)" },
          { tone: "emerald", label: "길게 · 60분~",    desc: "편의성 우선 · 신뢰 환경 · 장시간 세션 유지" },
        ].map((tip, i) => {
          const cls = tip.tone === "rose"    ? "border-rose-200 bg-rose-50/40"
                    : tip.tone === "brand"   ? "border-brand-deep/20 bg-brand-tint/40"
                    :                          "border-emerald-200 bg-emerald-50/40";
          return (
            <div key={i} className={`rounded-lg border ${cls} px-3 py-2.5`}>
              <div className="text-[13px] font-bold text-ink">{tip.label}</div>
              <div className="text-[12px] text-ink-soft leading-snug mt-0.5">{tip.desc}</div>
            </div>
          );
        })}
      </div>

      {/* 만료 경고 안내 */}
      <div className="flex items-start gap-2 rounded-lg border border-line bg-zinc-50/60 px-3 py-2 text-[13px] text-ink-soft leading-relaxed">
        <ShieldCheck size={16} className="text-brand-deep/70 shrink-0 mt-0.5" />
        <div>
          만료 <b className="text-ink">5분 전</b> · 우측 하단 경고 알림 (계속 사용 / 로그아웃 선택)
          <br />
          변경 즉시 · 전체 사용자 · 다음 자동 tick (30초) 부터 반영
        </div>
      </div>
    </Card>
  );
};

export default SessionTimeoutSection;
