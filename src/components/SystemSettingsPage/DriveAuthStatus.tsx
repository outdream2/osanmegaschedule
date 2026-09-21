// src/components/SystemSettingsPage/DriveAuthStatus.tsx
// 2026-09-21 · #327-③④ · Google Drive 인증 상태 상시 표시 · D-2 만료 알림
//
// 기능:
//   - /api/drive-status?probe=1 · 60초 폴링
//   - 인증 상태: 정상 (초록) · 만료임박 (D-2 이하 · 노랑) · 실패 (빨강) · 미설정 (회색)
//   - D-2 이하 · 관리자 로그인 세션 · 하루 1회 toast + banner (localStorage)
//   - 관리자 (level >= 9) 전용 · SystemSettingsPage 하부 섹션
//
// 재사용:
//   - useDriveAuthWarning · 다른 관리자 페이지에서 D-2 알림만 표시하려면 이 훅만 import 가능

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle, WarningCircle, XCircle, ArrowsClockwise, GoogleDriveLogo,
} from "@phosphor-icons/react";
import { SectionCard } from "../common/SectionCard";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";

// ── 서버 응답 타입 · googleDriveService.ProbeDriveAuthResult 미러 ────────────
export interface DriveStatusResponse {
  ready: boolean;
  mode: "oauth" | "service_account" | "none";
  folders: Record<string, string | null>;
  probe?: {
    ok: boolean;
    mode: "oauth" | "service_account" | "none";
    reason?: string;
    issued_at?: string | null;
    expires_at?: string | null;
    days_left?: number | null;
  };
}

const POLL_INTERVAL_MS = 60_000; // 60초
const D2_THRESHOLD = 2;          // D-2 이하 · 만료 임박
const WARN_STORAGE_KEY = "drive-auth-warning-shown-date";

type Severity = "ok" | "warn" | "error" | "none";

function severityOf(s: DriveStatusResponse | null): Severity {
  if (!s) return "none";
  if (s.mode === "none" || !s.ready) return "error";
  const p = s.probe;
  if (p && p.ok === false) return "error";
  if (p && typeof p.days_left === "number" && p.days_left <= D2_THRESHOLD) return "warn";
  return "ok";
}

// ── 재사용 훅 · D-2 만료 알림 · 하루 1회 (localStorage) ─────────────────────
export function useDriveAuthWarning(status: DriveStatusResponse | null) {
  const { toast, showError, showWarn } = useToast(6000);

  useEffect(() => {
    if (!status) return;
    const sev = severityOf(status);
    if (sev !== "warn" && sev !== "error") return;

    // 하루 1회 제한 · YYYY-MM-DD 비교
    const today = new Date().toISOString().slice(0, 10);
    try {
      const shown = localStorage.getItem(WARN_STORAGE_KEY);
      if (shown === today) return;
      localStorage.setItem(WARN_STORAGE_KEY, today);
    } catch { /* localStorage 사용 불가 시 · 매번 표시 */ }

    if (sev === "error") {
      const reason = status.probe?.reason ?? "인증 실패";
      showError(`Google Drive 인증 실패 · ${reason}`);
    } else {
      const d = status.probe?.days_left ?? 0;
      showWarn(`Google Drive 토큰 만료 임박 · D-${Math.max(0, d)} · 재발급 필요`);
    }
    // status 만 의존 · showError / showWarn 은 매 렌더 새 함수 (useToast 반환) · 의도적 exclude
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return { toast };
}

// ── 배너 표시 유틸 ─────────────────────────────────────────────────────────
function statusLabel(s: DriveStatusResponse | null): { text: string; tone: "green" | "amber" | "rose" | "zinc" } {
  const sev = severityOf(s);
  if (sev === "ok") {
    const d = s?.probe?.days_left;
    return {
      text: typeof d === "number"
        ? `인증 정상 · ${s?.mode === "oauth" ? "OAuth" : "SA"} · 만료 D-${d}일`
        : `인증 정상 · ${s?.mode === "oauth" ? "OAuth (drive.file)" : "Service Account"}`,
      tone: "green",
    };
  }
  if (sev === "warn") {
    const d = s?.probe?.days_left ?? 0;
    return { text: `만료 임박 · D-${Math.max(0, d)}일 · 재발급 준비 필요`, tone: "amber" };
  }
  if (sev === "error") {
    return { text: `인증 실패 · 재발급 필요 · ${s?.probe?.reason ?? "unknown"}`, tone: "rose" };
  }
  return { text: "상태 확인 중...", tone: "zinc" };
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export interface DriveAuthStatusProps {
  // 관리자 세션만 활성화 · 미충족 시 아무 것도 렌더 X
  active?: boolean;
}

export const DriveAuthStatus: React.FC<DriveAuthStatusProps> = ({ active = true }) => {
  const [status, setStatus] = useState<DriveStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DriveStatusResponse>("/api/drive-status?probe=1");
      setStatus(data);
      setLastFetchedAt(new Date());
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    fetchStatus();
    timerRef.current = window.setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, fetchStatus]);

  const { toast } = useDriveAuthWarning(status);

  const label = useMemo(() => statusLabel(status), [status]);

  if (!active) return null;

  const toneCls =
    label.tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
    label.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" :
    label.tone === "rose"  ? "border-rose-200 bg-rose-50 text-rose-700" :
                             "border-zinc-200 bg-zinc-50 text-zinc-600";

  const Icon =
    label.tone === "green" ? CheckCircle :
    label.tone === "amber" ? WarningCircle :
    label.tone === "rose"  ? XCircle :
                             GoogleDriveLogo;

  return (
    <SectionCard
      title="Google Drive 인증 상태"
      icon={<GoogleDriveLogo size={18} weight="fill" />}
      description="근로계약서 · 이력서 등 PDF 업로드용 Google Drive OAuth 인증 상태입니다. 60초마다 자동 확인 · D-2 이하 시 경고 · 실패 시 관리자 재발급 필요."
    >
      <div className="flex flex-col gap-3">
        {/* 상태 배너 */}
        <div className={`rounded-lg border ${toneCls} px-4 py-3 flex items-start gap-3`}>
          <Icon size={20} weight="fill" className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold">{label.text}</div>
            {status?.probe?.issued_at && (
              <div className="text-[13px] mt-1 opacity-80">
                발급: {new Date(status.probe.issued_at).toLocaleString("ko-KR")}
                {status.probe.expires_at && (
                  <> · 예상 만료: {new Date(status.probe.expires_at).toLocaleString("ko-KR")}</>
                )}
              </div>
            )}
            {error && <div className="text-[13px] mt-1 text-rose-600">API 오류: {error}</div>}
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[13px] font-semibold bg-white border border-line hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="지금 새로고침"
          >
            <ArrowsClockwise size={13} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>

        {/* 상세 정보 */}
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-lg border border-line bg-white px-3 py-2">
            <div className="text-zinc-500 font-semibold">인증 모드</div>
            <div className="mt-0.5 font-bold text-zinc-800">
              {status?.mode === "oauth" ? "OAuth 2.0 (개인 Drive)" :
               status?.mode === "service_account" ? "Service Account (레거시)" :
               "미설정"}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white px-3 py-2">
            <div className="text-zinc-500 font-semibold">폴링 주기</div>
            <div className="mt-0.5 font-bold text-zinc-800 tabular-nums">
              60초 · {lastFetchedAt ? lastFetchedAt.toLocaleTimeString("ko-KR") : "-"}
            </div>
          </div>
          {status?.folders && (
            <div className="col-span-2 rounded-lg border border-line bg-white px-3 py-2">
              <div className="text-zinc-500 font-semibold mb-1">Drive 폴더 매핑</div>
              <ul className="space-y-0.5 font-mono text-[12px] text-zinc-700 break-all">
                {Object.entries(status.folders).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-bold text-zinc-500">{k}:</span> {v ?? <span className="text-zinc-400">(미설정 · fallback)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 관리자 안내 · 실패 시 */}
        {severityOf(status) === "error" && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 leading-relaxed">
            <div className="font-bold mb-1">재발급 절차 (관리자 조치)</div>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Google Cloud Console · OAuth 2.0 Playground 접속</li>
              <li>Drive API v3 · scope <code className="font-mono bg-white px-1 rounded">drive.file</code> · authorize</li>
              <li>exchange · refresh_token 복사</li>
              <li><code className="font-mono bg-white px-1 rounded">src/keys/google-oauth.json</code> · refresh_token 갱신 · 서버 재시작</li>
              <li>근본 대책: OAuth 앱 · Production 게시 · 7일 만료 제거</li>
            </ol>
          </div>
        )}
      </div>

      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </SectionCard>
  );
};

export default DriveAuthStatus;
