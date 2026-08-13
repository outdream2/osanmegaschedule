// src/components/SystemSettingsPage/SystemSettingsPage.tsx
// 2026-08-12 · 시스템 설정 페이지 (관리자 lv≥9 전용)
//   · env 편집 · 서버 재시작 시 반영
//   · GET /api/system-config · 파일+env 병합 · 민감값 마스킹
//   · POST /api/system-config · patch 저장 · restartRequired
//   · 카테고리 탭: DB·인증 · AI/OCR · 알림톡·SMS · 이미지 CDN · Web Push · OCR 수신처 · 데이터 업로드(랜딩에서 이관)
import React, { useCallback, useEffect, useState } from "react";
import {
  Gear, FloppyDisk, Warning, Info, ArrowsClockwise, Database, Robot,
  ChatCircleDots, ImageSquare, Bell, Buildings, UploadSimple,
} from "@phosphor-icons/react";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { TabBar, type TabDef } from "../common/TabBar";
import { SettingsPageShell } from "../common/SettingsPageShell";
import {
  SET_SECTION_TITLE, SET_INPUT, SET_TEXTAREA, SET_LABEL,
  SET_ACTION_BAR, SET_BTN_PRIMARY, SET_BTN_SECONDARY,
  SET_NOTICE_AMBER, SET_NOTICE_ROSE, SET_NOTICE_EMERALD,
} from "../common/settingsTypography";
import { CARD_BASE } from "../../styles/tokens";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── 카테고리별 키 그룹 ─────────────────────────────────────────────────────
type Cat = "db-auth" | "ai-ocr" | "sms" | "cdn" | "webpush" | "ocr-tenant" | "upload";

const CAT_TABS: TabDef<Cat>[] = [
  { key: "db-auth",    label: "DB · 인증",       icon: Database,       color: "slate" },
  { key: "ai-ocr",     label: "AI · OCR",       icon: Robot,           color: "violet" },
  { key: "sms",        label: "알림톡 · SMS",    icon: ChatCircleDots,  color: "amber" },
  { key: "cdn",        label: "이미지 CDN",      icon: ImageSquare,     color: "cyan" },
  { key: "webpush",    label: "Web Push",       icon: Bell,             color: "emerald" },
  { key: "ocr-tenant", label: "OCR 수신처",      icon: Buildings,       color: "indigo" },
  { key: "upload",     label: "데이터 업로드",    icon: UploadSimple,    color: "red" },
];

const CAT_KEYS: Record<Cat, string[]> = {
  "db-auth":    ["SUPABASE_URL", "SUPABASE_KEY", "JWT_SECRET"],
  "ai-ocr":     ["GEMINI_API_KEY", "GEMINI_API_KEYS"],
  "sms":        ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER", "KAKAO_TOKEN", "KAKAO_PFID"],
  "cdn":        ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  "webpush":    ["WEB_PUSH_VAPID_PUBLIC", "WEB_PUSH_VAPID_PRIVATE", "WEB_PUSH_SUBJECT"],
  "ocr-tenant": ["OCR_RECIPIENT_COMPANY", "OCR_RECIPIENT_NAMES", "OCR_RECIPIENT_ADDRESS",
                 "OCR_EXCLUDED_LOGISTICS", "OCR_EXCLUDED_SUPPLIERS", "OCR_EXCLUDED_BUSINESS_NUMBERS"],
  "upload":     [],
};

const KEY_LABELS: Record<string, { label: string; desc?: string; multiline?: boolean }> = {
  SUPABASE_URL: { label: "Supabase URL", desc: "예: https://xxxxxxx.supabase.co" },
  SUPABASE_KEY: { label: "Supabase Anon/Service Key", desc: "민감정보 · 저장 시 마스킹" },
  JWT_SECRET: { label: "JWT 시크릿", desc: "로그인 세션 서명 키 · 최소 32자 랜덤 권장" },
  GEMINI_API_KEY: { label: "Gemini API Key", desc: "단일 키" },
  GEMINI_API_KEYS: { label: "Gemini API Keys (여러 개)", desc: "콤마·파이프 구분 · 라운드로빈", multiline: true },
  SOLAPI_API_KEY: { label: "Solapi API Key" },
  SOLAPI_API_SECRET: { label: "Solapi API Secret" },
  SOLAPI_SENDER: { label: "발신번호", desc: "-없이 숫자만 (예: 01012345678)" },
  KAKAO_TOKEN: { label: "카카오 알림톡 Token" },
  KAKAO_PFID: { label: "카카오 채널 PFID" },
  CLOUDINARY_CLOUD_NAME: { label: "Cloudinary Cloud Name" },
  CLOUDINARY_API_KEY: { label: "Cloudinary API Key" },
  CLOUDINARY_API_SECRET: { label: "Cloudinary API Secret" },
  WEB_PUSH_VAPID_PUBLIC: { label: "VAPID 공개키" },
  WEB_PUSH_VAPID_PRIVATE: { label: "VAPID 개인키" },
  WEB_PUSH_SUBJECT: { label: "VAPID Subject", desc: "예: mailto:admin@example.com" },
  OCR_RECIPIENT_COMPANY: { label: "자체 약국 상호", desc: "OCR 공급사 오인식 방지 · 콤마·파이프 구분", multiline: true },
  OCR_RECIPIENT_NAMES:   { label: "자체 약국 담당자", desc: "직원 이름 · 오추출 방지", multiline: true },
  OCR_RECIPIENT_ADDRESS: { label: "자체 약국 주소 조각", desc: "주소 일부 · 상호 오인식 방지", multiline: true },
  OCR_EXCLUDED_LOGISTICS: { label: "배송사·물류사", desc: "공급사 오인식 방지 리스트", multiline: true },
  OCR_EXCLUDED_SUPPLIERS: { label: "기타 제외 공급사", multiline: true },
  OCR_EXCLUDED_BUSINESS_NUMBERS: { label: "자체 사업자번호", desc: "하이픈 유무 무관" },
};

interface FieldState {
  value: string;
  source: "file" | "env" | "";
  masked: boolean;
  hasValue: boolean;
}

const SystemSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [cat, setCat] = useState<Cat>("db-auth");
  const [server, setServer] = useState<Record<string, FieldState>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/system-config", { credentials: "include" });
      if (!res.ok) { setError(res.status === 401 ? "로그인이 필요합니다" : res.status === 403 ? "관리자(lv 9) 전용" : "조회 실패"); return; }
      const data = await res.json();
      setServer(data);
      setDraft({}); // 편집 draft 초기화
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? "네트워크 오류");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchDraft = useCallback((k: string, v: string) => {
    setDraft(prev => ({ ...prev, [k]: v }));
  }, []);

  const save = useCallback(async () => {
    if (Object.keys(draft).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "저장 실패"); return; }
      setSavedNotice(data?.message ?? "저장되었습니다");
      await load();
      setTimeout(() => setSavedNotice(null), 5000);
    } catch (e: any) {
      setError(e?.message ?? "네트워크 오류");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const dirty = Object.keys(draft).length > 0;

  return (
    <SettingsPageShell
      activePage={"system-settings" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Gear}
      iconColor="text-zinc-600"
      title="시스템 설정"
      description="DB · 인증 · AI/OCR · 알림톡·SMS · 이미지 CDN · Web Push · OCR 수신처 등 서버 env 편집. 저장 후 서버 재시작 시 반영. 관리자(lv 9) 전용."
    >
        {/* 안내 배너 · 2026-08-12 · 폰트 -1 · 중요부분 붉은 강조 */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-xs text-amber-800">
          <Warning size={14} weight="fill" className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <div className="font-bold mb-0.5 text-rose-700">저장 후 서버 재시작이 필요합니다.</div>
            <div>편집한 값은 <code className="px-1 py-0.5 bg-amber-100 rounded font-bold text-rose-700">server/tenant.config.json</code> 파일에 저장되고 · 다음 서버 부팅 시 <code className="px-1 py-0.5 bg-amber-100 rounded font-bold text-rose-700">process.env</code> 를 덮어씁니다. Render 는 자동 재시작 · 로컬은 <span className="font-bold text-rose-700">수동 재시작 필요</span>.</div>
          </div>
        </div>

        {error && <div className={SET_NOTICE_ROSE}>{error}</div>}
        {savedNotice && <div className={SET_NOTICE_EMERALD}>{savedNotice}</div>}

        <TabBar<Cat> level={2} tabs={CAT_TABS} activeKey={cat} onSelect={setCat} />

        {/* ── 카테고리별 편집 폼 ── */}
        {cat !== "upload" && (
          <section className={CARD_BASE + " p-5 flex flex-col gap-4"}>
            {CAT_KEYS[cat].map(k => {
              const meta = KEY_LABELS[k] ?? { label: k };
              const cur = server[k];
              const draftVal = draft[k];
              const isEditing = draftVal !== undefined;
              const placeholder = cur?.hasValue
                ? (cur.masked ? `현재값: ${cur.value} (마스킹) · 새 값 입력 시 덮어씀` : `현재값: ${cur.value}`)
                : "설정되지 않음 · 값 입력";
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  <label className={SET_LABEL}>
                    <span>{meta.label}</span>
                    <span className="text-[10px] font-mono text-zinc-400">{k}</span>
                    {cur?.source === "file" && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">파일 저장됨</span>}
                    {cur?.source === "env"  && <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">env 기본값</span>}
                  </label>
                  {meta.multiline ? (
                    <textarea
                      value={isEditing ? draftVal : ""}
                      onChange={e => patchDraft(k, e.target.value)}
                      placeholder={placeholder}
                      rows={2}
                      className={SET_TEXTAREA}
                    />
                  ) : (
                    <input
                      type="text"
                      value={isEditing ? draftVal : ""}
                      onChange={e => patchDraft(k, e.target.value)}
                      placeholder={placeholder}
                      className={SET_INPUT}
                    />
                  )}
                  {meta.desc && <p className="text-xs text-zinc-400 mt-0.5">{meta.desc}</p>}
                </div>
              );
            })}
            {!loaded && <p className="text-sm text-zinc-400 text-center">불러오는 중...</p>}
          </section>
        )}

        {/* ── 데이터 업로드 탭 · 공통 SECTION_TITLE ── */}
        {cat === "upload" && (
          <section className={CARD_BASE + " p-5 flex flex-col gap-3"}>
            <h2 className={SET_SECTION_TITLE}>
              <UploadSimple size={18} className="text-orange-500" />
              데이터 업로드
            </h2>
            <p className="text-sm text-zinc-500 flex items-start gap-1.5">
              <Info size={14} className="mt-0.5 shrink-0" />
              상품목록 · 재고리스트 xlsx 업로드. 이 탭은 이후 커밋에서 · 랜딩 데이터업로드 모달을 이 자리로 이관 예정입니다.
              현재는 랜딩페이지 [데이터 업로드] 카드를 사용하세요.
            </p>
          </section>
        )}

        {/* ── 저장 액션바 · 공통 SET_ACTION_BAR ── */}
        <div className={`${SET_ACTION_BAR} justify-between`}>
          <button onClick={load} className={SET_BTN_SECONDARY}>
            <ArrowsClockwise size={14} /> 다시 불러오기
          </button>
          <button onClick={save} disabled={!dirty || saving} className={SET_BTN_PRIMARY}>
            <FloppyDisk size={14} weight="fill" />
            {saving ? "저장 중..." : dirty ? `저장 (${Object.keys(draft).length}개)` : "변경 없음"}
          </button>
        </div>
    </SettingsPageShell>
  );
};

export default SystemSettingsPage;
