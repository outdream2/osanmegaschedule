// src/components/SystemSettingsPage/AutoImportSection.tsx
// 2026-08-24 · #253 Phase E · 자동 임포트 설정 UI (관리자 lv9 전용)
//   · SystemSettingsPage 신규 "자동 임포트" 탭 · Phase A endpoints 재사용
//   · 폴더 경로 4개 편집 · interval 프리셋 · after_import · auto_rename
//   · 상태 표시 · heartbeat 기반 green/amber/red
//   · 설치 안내 · Phase C 완료 후 · installer zip 다운로드 활성

import React, { useState } from "react";
import { Robot, FloppyDisk, ArrowsClockwise, Folder, Timer, Download, Play, Warning, CheckCircle } from "@phosphor-icons/react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import {
  useAutoImportConfig,
  useAutoImportStatus,
  computeStatusTone,
} from "../../hooks/useAutoImportConfig";
import type { AutoImportConfig, AutoImportAfter } from "../../shared/schemas/autoImport";

const DEFAULT_FOLDER_BASE = "%USERPROFILE%\\Downloads\\megatown-importdata";
// 2026-08-24 · 사용자 지시 · 공급사 제외 · 3 카테고리 (상품·재고·매입)
const CATEGORIES: Array<{ key: keyof AutoImportConfig["folders"]; label: string; color: string }> = [
  { key: "products", label: "상품",   color: "text-brand-deep" },
  { key: "stock",    label: "재고",   color: "text-emerald-600" },
  { key: "purchase", label: "매입",   color: "text-violet-600" },
];

const INTERVAL_PRESETS: Array<{ value: number; label: string }> = [
  { value: 10,   label: "10분" },
  { value: 30,   label: "30분" },
  { value: 60,   label: "1시간" },
  { value: 120,  label: "2시간" },
  { value: 240,  label: "4시간" },
  { value: 360,  label: "6시간" },
  { value: 720,  label: "12시간" },
  { value: 1440, label: "매일" },
];

// 2026-08-24 · 사용자 지시 · 폴더 찾기 · showDirectoryPicker (Chrome/Edge)
//   · 브라우저 보안상 절대경로 획득 불가 · 폴더명만 반환 · 사용자에게 경로 힌트 제공
async function pickFolderHint(): Promise<string | null> {
  const w = window as any;
  if (typeof w.showDirectoryPicker !== "function") {
    alert("Chrome 또는 Edge 브라우저 에서만 지원됩니다.\n다른 브라우저는 · 파일탐색기에서 폴더 경로 복사 후 붙여넣기 하세요.");
    return null;
  }
  try {
    const handle = await w.showDirectoryPicker();
    const name = handle?.name ?? "";
    if (!name) return null;
    alert(
      `선택된 폴더: ${name}\n\n` +
      `※ 브라우저 보안상 절대경로는 자동 입력할 수 없습니다.\n` +
      `Windows 파일탐색기 · 해당 폴더 우클릭 → "경로 복사" → 여기에 붙여넣기 하세요.\n` +
      `또는 · %USERPROFILE%\\Downloads\\megatown-importdata\\${name} · 형식으로 입력.`
    );
    return name;
  } catch {
    return null;  // 사용자 취소
  }
}

const AFTER_OPTIONS: Array<{ value: AutoImportAfter; label: string; hint: string }> = [
  { value: "keep",               label: "유지",   hint: "원본 파일 그대로 · hash 로 중복 방지" },
  { value: "move_to_processed",  label: "이동",   hint: "_processed/ 로 자동 이동 (권장 · audit trail)" },
  { value: "delete",             label: "삭제",   hint: "원본 파일 제거 · 되돌릴 수 없음" },
];

export const AutoImportSection: React.FC = () => {
  const { config, loaded, saveState, saveError, setConfig, save, reload } = useAutoImportConfig();
  const { status, reload: reloadStatus } = useAutoImportStatus();
  const [installerError, setInstallerError] = useState<string | null>(null);

  const tone = computeStatusTone(status, config.base_interval_minutes);
  const isInstalled = tone !== "gray";

  const updateFolder = (key: keyof AutoImportConfig["folders"], v: string) => {
    setConfig({ ...config, folders: { ...config.folders, [key]: v } });
  };
  const updateInterval = (key: keyof AutoImportConfig["intervals"], v: number) => {
    setConfig({ ...config, intervals: { ...config.intervals, [key]: v } });
  };
  const updateDailyTime = (key: keyof AutoImportConfig["daily_times"], v: string) => {
    setConfig({ ...config, daily_times: { ...config.daily_times, [key]: v } });
  };

  const applyDefaultFolders = () => {
    setConfig({
      ...config,
      folders: {
        products: `${DEFAULT_FOLDER_BASE}\\products`,
        stock:    `${DEFAULT_FOLDER_BASE}\\stock`,
        purchase: `${DEFAULT_FOLDER_BASE}\\purchase`,
      },
    });
  };

  const handlePickFolder = async (key: keyof AutoImportConfig["folders"]) => {
    const hint = await pickFolderHint();
    if (hint) {
      // 사용자에게 힌트 제공 · 실제 절대경로 입력은 여전히 사용자 몫
      // 폴더명 부분만 반영 · 기존 base 유지
      const cur = config.folders[key];
      if (!cur || !cur.includes(hint)) {
        updateFolder(key, `${DEFAULT_FOLDER_BASE}\\${hint}`);
      }
    }
  };

  // 2026-08-24 · 개별 파일 다운로드 (zip 압축 대신 · 회귀 안전) · 브라우저 순차 저장
  const handleInstallerDownload = async () => {
    setInstallerError(null);
    try {
      const r = await fetch("/api/auto-import/installer", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { files: Array<{ name: string; url: string; size: number }>; dir: string };
      if (!j.files?.length) throw new Error("파일 목록 없음");
      for (const f of j.files) {
        await new Promise((r2) => setTimeout(r2, 350));
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      alert(
        `${j.files.length}개 파일 다운로드 시작 · Downloads 폴더 확인\n\n` +
        `다음 단계:\n` +
        `1. Downloads 에서 · 새 폴더 "${j.dir}" 만들고 7 파일 이동\n` +
        `2. install.bat 우클릭 → 관리자 권한으로 실행\n` +
        `3. Python 자동 확인 · config.ini 관리자 credential 입력 (notepad 자동)\n` +
        `4. 이 페이지 새로고침 → 상태 초록불 확인`,
      );
    } catch (e) {
      setInstallerError((e as any)?.message ?? "다운로드 실패");
    }
  };

  return (
    <Card padding="lg" rounded="2xl" className="flex flex-col gap-4">
      {/* 헤더 · 상태 배지 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Robot size={22} className="text-brand-deep shrink-0" />
        <h3 className="text-[17px] font-bold text-ink tracking-tight">자동 임포트</h3>
        {tone === "green" && <StatusPill tone="emerald" size="sm" dot>정상</StatusPill>}
        {tone === "amber" && <StatusPill tone="amber" size="sm" dot>지연</StatusPill>}
        {tone === "red" && <StatusPill tone="rose" size="sm" dot>오프라인</StatusPill>}
        {tone === "gray" && <StatusPill tone="zinc" size="sm">미설치</StatusPill>}
        <div className="ml-auto flex items-center gap-2">
          {saveState === "saving" && <StatusPill tone="amber" size="sm" pulse>저장 중</StatusPill>}
          {saveState === "saved" && <StatusPill tone="emerald" size="sm">저장됨</StatusPill>}
          {saveState === "error" && <StatusPill tone="rose" size="sm">저장 실패</StatusPill>}
          <button
            type="button"
            onClick={() => { void reload(); void reloadStatus(); }}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[14px] font-semibold text-ink-soft hover:text-ink bg-white border border-line hover:bg-zinc-50 cursor-pointer transition"
            title="새로고침"
          >
            <ArrowsClockwise size={14} />
            새로고침
          </button>
        </div>
      </div>

      {/* 미설치 안내 · installer 다운로드 */}
      {!isInstalled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Warning size={18} className="text-amber-600 shrink-0" />
            <div className="text-[15px] font-bold text-amber-900">스크립트 미설치 · 3단계 설치 안내</div>
          </div>
          <ol className="text-[14px] text-ink-soft leading-relaxed list-decimal pl-5 space-y-1">
            <li>[설치 파일 다운로드] 클릭 · <b>megatown-auto-import.zip</b> 저장 (관리자 PC)</li>
            <li>압축 해제 · <code className="bg-white px-1.5 py-0.5 rounded text-[12px] border border-line">install.bat</code> 우클릭 · <b>관리자 권한으로 실행</b></li>
            <li>자동 · 폴더 4개 생성 (Downloads 하위) · Task Scheduler 등록 · 즉시 1회 실행</li>
          </ol>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleInstallerDownload}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white shadow-sm cursor-pointer transition"
            >
              <Download size={15} />
              설치 파일 다운로드
            </button>
            {installerError && (
              <StatusPill tone="amber" size="sm">{installerError}</StatusPill>
            )}
          </div>
        </div>
      )}

      {/* 상태 상세 · 설치 완료 시 */}
      {isInstalled && status && (
        <div className="rounded-xl border border-line bg-zinc-50/60 p-3 flex items-center gap-3 flex-wrap text-[14px]">
          <span className="text-ink-soft">마지막 실행 ·
            <b className="text-ink ml-1 tabular-nums">
              {new Date(status.last_heartbeat_at ?? "").toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </b>
          </span>
          {status.last_processed && Object.keys(status.last_processed).length > 0 && (
            <span className="text-ink-soft">
              처리 · {Object.entries(status.last_processed).filter(([, v]) => v > 0).map(([k, v]) => `${k}(${v})`).join(" · ") || "없음"}
            </span>
          )}
          {status.last_errors && status.last_errors.length > 0 && (
            <StatusPill tone="rose" size="sm">실패 {status.last_errors.length}건</StatusPill>
          )}
        </div>
      )}

      {/* 자동 임포트 · 활성 토글 */}
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            disabled={!loaded}
            className="w-5 h-5 accent-brand-deep cursor-pointer"
          />
          <span className="text-[15px] font-bold text-ink">자동 임포트 활성화</span>
        </label>
        <span className="text-[13px] text-ink-soft">
          {config.enabled ? "· Python 스크립트가 매 실행에 이 값 확인" : "· 비활성 시 · 스크립트 즉시 종료"}
        </span>
      </div>

      {/* 카테고리별 폴더 + 실행 간격 · 3 카테고리 (상품·재고·매입) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Folder size={18} className="text-brand-deep shrink-0" />
          <h4 className="text-[15px] font-bold text-ink">카테고리별 폴더 + 실행 간격</h4>
          <button
            type="button"
            onClick={applyDefaultFolders}
            className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[13px] font-semibold text-ink-soft hover:text-brand-deep bg-white border border-line hover:border-brand-deep cursor-pointer transition"
            title="Downloads 기본값으로 복원"
          >
            기본값 복원
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map(({ key, label, color }) => (
            <div key={key} className="rounded-lg border border-line bg-zinc-50/40 p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-12 text-[14px] font-bold ${color} shrink-0`}>{label}</span>
                <input
                  type="text"
                  value={config.folders[key]}
                  onChange={(e) => updateFolder(key, e.target.value)}
                  disabled={!loaded}
                  placeholder={`${DEFAULT_FOLDER_BASE}\\${key}`}
                  className="flex-1 h-9 px-2.5 text-[14px] text-ink border border-line rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 font-mono min-w-0"
                />
                <button
                  type="button"
                  onClick={() => { void handlePickFolder(key); }}
                  disabled={!loaded}
                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-[13px] font-semibold text-ink-soft hover:text-brand-deep bg-white border border-line hover:border-brand-deep cursor-pointer transition shrink-0"
                  title="폴더 찾기 (Chrome/Edge)"
                >
                  <Folder size={13} />
                  찾기
                </button>
              </div>
              <div className="flex items-center gap-1.5 pl-14 flex-wrap">
                <Timer size={12} className="text-ink-soft shrink-0" />
                <span className="text-[12px] text-ink-soft font-semibold">간격 ·</span>
                <select
                  value={config.intervals[key]}
                  onChange={(e) => updateInterval(key, Number(e.target.value))}
                  disabled={!loaded}
                  className="h-7 px-2 text-[13px] font-semibold text-ink border border-line rounded-md bg-white cursor-pointer disabled:opacity-40"
                >
                  {INTERVAL_PRESETS.map(({ value, label: lbl }) => (
                    <option key={value} value={value}>{lbl}</option>
                  ))}
                </select>
                <span className="text-[12px] text-ink-soft">or</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={config.intervals[key]}
                  onChange={(e) => {
                    const n = Math.max(5, Math.min(1440, Math.round(Number(e.target.value) || 60)));
                    updateInterval(key, n);
                  }}
                  disabled={!loaded}
                  className="w-16 h-7 px-1.5 text-[13px] font-semibold text-ink text-right border border-line rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums"
                />
                <span className="text-[12px] text-ink-soft">분</span>
                {/* 매일(1440) 선택 시 · 실행 시각 · HH:MM 입력 · 2026-08-24 사용자 지시 */}
                {config.intervals[key] === 1440 && (
                  <>
                    <span className="text-[12px] text-ink-soft ml-2">· 매일 실행 시각 ·</span>
                    <input
                      type="time"
                      value={config.daily_times[key]}
                      onChange={(e) => updateDailyTime(key, e.target.value)}
                      disabled={!loaded}
                      className="h-7 px-2 text-[13px] font-semibold text-ink border border-line rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:opacity-40 tabular-nums"
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.folder_auto_create}
            onChange={(e) => setConfig({ ...config, folder_auto_create: e.target.checked })}
            disabled={!loaded}
            className="w-4 h-4 accent-brand-deep cursor-pointer"
          />
          <span className="text-[13px] text-ink-soft">폴더 없으면 · Python 실행 시 자동 생성</span>
        </label>
      </div>

      {/* 2026-08-24 · Task Scheduler 실행 간격은 install.bat 이 자동 설정 · UI 노출 X (혼란 방지) */}

      {/* 임포트 후 처리 */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[15px] font-bold text-ink">임포트 후 처리</h4>
        <div className="flex flex-col gap-1.5">
          {AFTER_OPTIONS.map(({ value, label, hint }) => (
            <label key={value} className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="after_import"
                checked={config.after_import === value}
                onChange={() => setConfig({ ...config, after_import: value })}
                disabled={!loaded}
                className="w-4 h-4 accent-brand-deep cursor-pointer"
              />
              <span className="text-[14px] font-semibold text-ink">{label}</span>
              <span className="text-[13px] text-ink-soft">· {hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 파일명 자동 정리 */}
      <div className="flex flex-col gap-1">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_rename}
            onChange={(e) => setConfig({ ...config, auto_rename: e.target.checked })}
            disabled={!loaded}
            className="w-4 h-4 accent-brand-deep cursor-pointer"
          />
          <span className="text-[14px] font-bold text-ink">파일명 자동 정리 (표준 파일명 rename)</span>
        </label>
        <div className="text-[12px] text-ink-soft pl-6 leading-relaxed">
          · products / vendors · <code>{"{category}_{yyyymmdd_hhmmss}.xlsx"}</code>
          <br />
          · stock / purchase · <code>{"{category}_{start}_{end}.xlsx"}</code>
        </div>
      </div>

      {/* 저장 · 수동 실행 */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={!loaded || saveState === "saving"}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 text-white shadow-sm cursor-pointer transition"
        >
          {saveState === "saving" ? <Spinner size={13} tone="white" /> : <FloppyDisk size={14} weight="fill" />}
          저장
        </button>
        {isInstalled && (
          <button
            type="button"
            disabled
            title="Phase B (Python) 완료 후 활성"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Play size={14} />
            수동 실행 (준비 중)
          </button>
        )}
        {saveError && (
          <span className="text-[13px] text-rose-600 font-semibold">{saveError}</span>
        )}
      </div>

      {/* 안내 */}
      <div className="text-[13px] text-ink-soft bg-zinc-50/60 border border-line rounded-lg px-3 py-2 leading-relaxed">
        <CheckCircle size={13} className="inline text-emerald-500 mr-1" />
        저장 후 · Python 다음 실행 시 즉시 반영 · interval 변경 시 · Task Scheduler 자동 재등록
      </div>
    </Card>
  );
};

export default AutoImportSection;
