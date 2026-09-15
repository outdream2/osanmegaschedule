// src/components/SystemSettingsPage/AutoImportSection.tsx
// 2026-09-15 · T-AUTO-IMPORT-WEB-REDESIGN · Electron sync-agent 다운로드 안내 페이지
//   · 기존 KV 폴더 설정 UI 제거 · Electron 앱 (megatown-sync-agent.exe) 이관 후
//   · 파일 감시(chokidar) + 스케줄러 · 폴더/일정 설정 모두 앱 자체 UI 에서 편집
//   · 웹은 · exe 다운로드 + 설치 가이드 + 로그인 안내
//   · 관리자 lv9 만 진입 (탭 자체 gating)

import React, { useEffect, useState } from "react";
import {
  Download, Desktop, DeviceMobile, Eye, Clock,
  ShieldCheck, CheckCircle, ArrowsClockwise, Info, Package,
} from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import { api, ApiError } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";

interface VersionInfo {
  available: boolean;
  version?: string;
  file?: string;
  size?: number;
  mtime?: string;
  download_url?: string;
  message?: string;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "-";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export const AutoImportSection: React.FC = () => {
  const { toast, showError, showSuccess } = useToast(4500);
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [loadingVer, setLoadingVer] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const loadVersion = React.useCallback(async () => {
    setLoadingVer(true);
    try {
      const { data } = await api.get<VersionInfo>("/api/sync-agent/version");
      setVer(data);
    } catch (e) {
      setVer({ available: false, message: e instanceof ApiError ? e.message : "버전 조회 실패" });
    } finally {
      setLoadingVer(false);
    }
  }, []);

  useEffect(() => { void loadVersion(); }, [loadVersion]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data: blob } = await api.get<Blob>("/api/sync-agent/installer", { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ver?.file ?? "megatown-sync-agent-setup.exe";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showSuccess(`다운로드 완료 · ${ver?.file ?? "setup.exe"} · Downloads 폴더 확인 후 설치`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : getErrorMessage(e, "다운로드 실패");
      showError(`다운로드 실패 · ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}

      <div className="flex flex-col gap-4">
        {/* ── 히어로 카드 · 다운로드 CTA ───────────────────────── */}
        <Card padding="lg" rounded="2xl" className="relative overflow-hidden bg-gradient-to-br from-brand-deep via-[#0d3a5c] to-[#08253a] text-white">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <Desktop size={280} className="absolute -right-8 -bottom-12 text-white/40" weight="duotone" />
          </div>
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Package size={22} weight="fill" />
              <span className="text-[13px] font-bold uppercase tracking-wider opacity-90">Megatown Sync Agent</span>
              <StatusPill tone="emerald" size="sm" dot>Windows</StatusPill>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-[24px] font-extrabold tracking-tight">자동 임포트 · 데스크탑 앱</h3>
              <p className="text-[14px] opacity-90 leading-relaxed max-w-xl">
                구글 드라이브 · 로컬 폴더에 xlsx 파일이 저장되면 <b>자동으로 감지</b>해서
                Megatown 서버에 임포트하는 · 트레이 상주 데스크탑 앱.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!ver?.available || downloading}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white text-brand-deep hover:bg-brand-tint text-[15px] font-bold shadow-lg ring-2 ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              >
                {downloading
                  ? <Spinner size={16} tone="zinc" />
                  : <Download size={17} weight="fill" />
                }
                {downloading ? "다운로드 중..." : "설치 파일 다운로드 (.exe)"}
              </button>
              <div className="flex items-center gap-2 text-[13px] opacity-90">
                {loadingVer ? (
                  <span className="flex items-center gap-1"><Spinner size={12} tone="white" /> 버전 확인 중...</span>
                ) : ver?.available ? (
                  <>
                    <span className="font-bold">v{ver.version}</span>
                    <span>· {formatBytes(ver.size)}</span>
                    <span>· {formatDate(ver.mtime)}</span>
                  </>
                ) : (
                  <span className="text-amber-200">설치 파일 없음 · 관리자 문의</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { void loadVersion(); }}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 cursor-pointer transition"
              >
                <ArrowsClockwise size={13} />
                버전 확인
              </button>
            </div>
          </div>
        </Card>

        {/* ── 주요 기능 3열 ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card padding="md" rounded="xl" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Eye size={18} weight="fill" className="text-emerald-600" />
              </div>
              <h4 className="text-[15px] font-bold text-ink">파일 감시 모드</h4>
            </div>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              구글 드라이브·폴더에 새 xlsx 저장 시 · 자동 감지 · 10분 debounce 후 임포트.
              스케줄 시간표 없이 · 파일 생성이 트리거.
            </p>
          </Card>

          <Card padding="md" rounded="xl" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-brand-tint flex items-center justify-center">
                <Clock size={18} weight="fill" className="text-brand-deep" />
              </div>
              <h4 className="text-[15px] font-bold text-ink">스케줄 모드</h4>
            </div>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              선택 시 · cron 프리셋 (10분 · 30분 · 1시간 · 매일 지정 시각).
              파일 감시와 상호배제 · 앱에서 편집.
            </p>
          </Card>

          <Card padding="md" rounded="xl" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <ShieldCheck size={18} weight="fill" className="text-violet-600" />
              </div>
              <h4 className="text-[15px] font-bold text-ink">보안 · 자동 업데이트</h4>
            </div>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              JWT 쿠키 · Windows DPAPI 암호화 저장 · refresh 자동.
              GitHub Releases · 신버전 자동 알림.
            </p>
          </Card>
        </div>

        {/* ── 설치 가이드 ───────────────────────────────────── */}
        <Card padding="lg" rounded="2xl" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Info size={20} weight="fill" className="text-brand-deep" />
            <h3 className="text-[17px] font-bold text-ink tracking-tight">설치 가이드 · 5단계</h3>
          </div>
          <ol className="flex flex-col gap-3">
            <Step n={1} title="설치 파일 다운로드" desc="위 [설치 파일 다운로드 (.exe)] 클릭 · Downloads 폴더에 저장됩니다." />
            <Step n={2} title="더블클릭 · 설치 진행"
              desc={<>다운로드된 <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-[13px] border border-line font-mono">megatown-sync-agent-{ver?.version ?? "x.x.x"}-setup.exe</code> 를 실행 · 사용자 폴더 (%LOCALAPPDATA%) 에 자동 설치 · 관리자 권한 불필요.</>} />
            <Step n={3} title="트레이 아이콘 · 부팅 시 자동 시작"
              desc="설치 후 · 트레이(우측 하단 시계 옆) 아이콘 상주 · 컴퓨터 부팅 시 자동 실행 · 우클릭 → 열기." />
            <Step n={4} title="로그인 · 핸드폰번호"
              desc={<>웹앱과 <b>동일한 핸드폰번호 + 비밀번호</b> 로 로그인 · JWT 쿠키 15분 · refresh 30일 · 아이디 자동 저장 옵션.</>} />
            <Step n={5} title="폴더·모드 설정"
              desc={<>앱의 <b>[설정]</b> 탭 · 상품·재고·매입 폴더 3개 지정 · 감시 모드 or 스케줄 모드 선택 · <b>[저장]</b> · 완료.</>} />
          </ol>
        </Card>

        {/* ── 사용 방법 & 팁 ─────────────────────────────────── */}
        <Card padding="lg" rounded="2xl" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <DeviceMobile size={20} weight="fill" className="text-brand-deep" />
            <h3 className="text-[17px] font-bold text-ink tracking-tight">사용 방법</h3>
          </div>
          <ul className="flex flex-col gap-2 text-[14px] text-ink-soft leading-relaxed">
            <Tip><b>지금 실행</b> · 대시보드에서 파일별 [지금 실행] 버튼 · 최신 파일 즉시 임포트.</Tip>
            <Tip><b>최신 파일 규칙</b> · 파일명 날짜 우선 (예 <code className="text-[13px]">재고_20260915.xlsx</code>) · 없으면 mtime.</Tip>
            <Tip><b>_processed / _failed</b> · 성공한 파일 자동 이동 · 실패 시 재시도 대상 (지수 백오프).</Tip>
            <Tip><b>Logs 탭</b> · 실행 이력 · 데이터 카운트 · 재시도 큐 · 폴더 상태 확인.</Tip>
            <Tip><b>로그아웃</b> · 앱 상단 우측 · 재로그인 필요 시 클릭 · 저장된 아이디 유지.</Tip>
          </ul>
        </Card>

        {/* ── 완료 안내 배너 ─────────────────────────────────── */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-start gap-2">
          <CheckCircle size={16} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-[13px] text-emerald-900 leading-relaxed">
            <b>설치 완료 후</b> · 이 페이지 · 별도 설정 없음 · 모든 자동 임포트 설정은 · Sync Agent 앱 (트레이) 에서 직접 편집.
            앱은 · 서버 재시작 시 · 자동으로 재연결 (JWT refresh).
          </div>
        </div>
      </div>
    </>
  );
};

// ── 서브 컴포넌트 ─────────────────────────────────────────
const Step: React.FC<{ n: number; title: string; desc: React.ReactNode }> = ({ n, title, desc }) => (
  <li className="flex gap-3">
    <div className="w-7 h-7 rounded-full bg-brand-deep text-white text-[13px] font-bold flex items-center justify-center shrink-0">{n}</div>
    <div className="flex-1 min-w-0 pt-0.5">
      <div className="text-[14px] font-bold text-ink">{title}</div>
      <div className="text-[13px] text-ink-soft leading-relaxed mt-0.5">{desc}</div>
    </div>
  </li>
);

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2">
    <span className="text-brand-deep shrink-0">·</span>
    <span>{children}</span>
  </li>
);

export default AutoImportSection;
