// src/components/SettingsModal/tabs/AccountTab.tsx
// 2026-08-29 · SettingsModal 분리 · account (비밀번호 변경) 탭 서브컴포넌트
import React from "react";
import { Card } from "../../common/Card";

export interface AccountTabProps {
  sessionEmployeeId?: number | null;
  pwCurrent: string;
  pwNew: string;
  pwConfirm: string;
  pwSubmitting: boolean;
  pwMsg: { type: "ok" | "err"; text: string } | null;
  setPwCurrent: (v: string) => void;
  setPwNew: (v: string) => void;
  setPwConfirm: (v: string) => void;
  submitPasswordChange: () => void;
}

export const AccountTab: React.FC<AccountTabProps> = ({
  sessionEmployeeId,
  pwCurrent, pwNew, pwConfirm,
  pwSubmitting, pwMsg,
  setPwCurrent, setPwNew, setPwConfirm,
  submitPasswordChange,
}) => (
  <div className="space-y-4 max-w-md">
    <p className="text-xs text-zinc-500 font-semibold leading-relaxed">
      로그인 중인 계정의 비밀번호를 변경합니다. 변경 후에도 세션은 유지됩니다.
    </p>
    {!sessionEmployeeId ? (
      <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" rounded="lg" padding="sm" className="text-xs text-rose-600 font-semibold">
        로그인 세션 정보를 찾을 수 없습니다. 다시 로그인해주세요.
      </Card>
    ) : (
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 mb-1">현재 비밀번호</label>
          <input
            type="password"
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
            placeholder="현재 비밀번호"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 mb-1">새 비밀번호 (4자 이상)</label>
          <input
            type="password"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
            placeholder="새 비밀번호"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-zinc-600 mb-1">새 비밀번호 확인</label>
          <input
            type="password"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
            placeholder="새 비밀번호 확인"
            onKeyDown={(e) => { if (e.key === "Enter" && !pwSubmitting) submitPasswordChange(); }}
          />
        </div>
        {pwMsg && (
          <div className={`text-xs font-semibold rounded-lg px-3 py-2 ${
            pwMsg.type === "ok"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-rose-50 border border-rose-200 text-rose-600"
          }`}>
            {pwMsg.text}
          </div>
        )}
        <div className="pt-1">
          <button
            type="button"
            onClick={submitPasswordChange}
            disabled={pwSubmitting}
            className="px-4 py-2 text-xs font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition cursor-pointer"
          >
            {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </div>
      </div>
    )}
  </div>
);
