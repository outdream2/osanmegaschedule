// Settings.tsx
// 2026-09-15 · Phase 2 · 실제 설정 편집 · 폴더 지정 · 스케줄 · 서버 URL

import React, { useEffect, useState } from "react";
import type { RendererConfig, FileKind } from "../types";

const FILE_LABELS: Record<FileKind, string> = {
  products: "상품정보",
  stock:    "재고정보",
  purchase: "매입정보",
};

// cron 프리셋 · 사용자 친화
const CRON_PRESETS: { key: string; label: string; expr: string }[] = [
  { key: "off",       label: "사용 안 함",       expr: "" },
  { key: "5m",        label: "매 5분",          expr: "*/5 * * * *" },
  { key: "15m",       label: "매 15분",         expr: "*/15 * * * *" },
  { key: "30m",       label: "매 30분",         expr: "*/30 * * * *" },
  { key: "1h",        label: "매 1시간",        expr: "0 * * * *" },
  { key: "2h",        label: "매 2시간",        expr: "0 */2 * * *" },
  { key: "6h",        label: "매 6시간",        expr: "0 */6 * * *" },
  { key: "daily-8",   label: "매일 08:00",      expr: "0 8 * * *" },
  { key: "daily-9",   label: "매일 09:00",      expr: "0 9 * * *" },
  { key: "daily-18",  label: "매일 18:00",      expr: "0 18 * * *" },
];

export const Settings: React.FC = () => {
  const [config, setConfig] = useState<RendererConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const cfg = await window.api.getConfig();
    setConfig(cfg);
  };
  useEffect(() => { load(); }, []);

  const patchFolder = async (kind: FileKind) => {
    const folder = await window.api.selectFolder({ title: `${FILE_LABELS[kind]} 폴더 선택` });
    if (!folder) return;
    setSaving(true);
    try {
      await window.api.patchConfig({ folders: { [kind]: folder } });
      await load();
    } finally { setSaving(false); }
  };

  const patchSchedule = async (kind: FileKind, expr: string) => {
    setSaving(true);
    try {
      await window.api.patchConfig({ schedules: { [kind]: expr || undefined } });
      await load();
    } finally { setSaving(false); }
  };

  const patchServer = async (baseUrl: string) => {
    setSaving(true);
    try {
      await window.api.patchConfig({ server: { baseUrl } });
      await load();
    } finally { setSaving(false); }
  };

  if (!config) return <div className="text-zinc-500">로딩 중...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* 서버 URL */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-2">🌐 서버 주소</h2>
        <p className="text-[13px] text-zinc-500 mb-4">
          웹 서비스 URL · 임포트 API 엔드포인트 (변경 후 · 재로그인 필요)
        </p>
        <input
          type="url"
          defaultValue={config.server.baseUrl}
          onBlur={(e) => e.target.value !== config.server.baseUrl && patchServer(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-[15px] focus:border-brand-deep outline-none"
          placeholder="https://osanmega.onrender.com"
          disabled={saving}
        />
        <p className="text-[12px] text-zinc-400 mt-2">
          로그인 계정 · {config.auth.email ?? "-"}
        </p>
      </section>

      {/* 파일별 · 폴더 + 스케줄 */}
      {(["products", "stock", "purchase"] as FileKind[]).map((kind) => (
        <section key={kind} className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-[17px] font-bold mb-4">📂 {FILE_LABELS[kind]}</h2>

          {/* 폴더 */}
          <div className="mb-4">
            <label className="text-[14px] font-semibold text-zinc-700 mb-2 block">감시 폴더</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={config.folders[kind] ?? ""}
                readOnly
                placeholder="폴더 미설정"
                className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-[14px] bg-zinc-50 truncate"
              />
              <button
                onClick={() => patchFolder(kind)}
                disabled={saving}
                className="px-4 py-2 bg-brand-deep text-white rounded-lg text-[14px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
              >
                폴더 선택
              </button>
            </div>
            <p className="text-[12px] text-zinc-400 mt-1">
              xlsx 파일 · 이 폴더에 넣으면 · 스케줄 or 수동 실행 시 · 서버로 업로드
            </p>
          </div>

          {/* 스케줄 */}
          <div>
            <label className="text-[14px] font-semibold text-zinc-700 mb-2 block">실행 스케줄</label>
            <select
              value={CRON_PRESETS.find(p => p.expr === (config.schedules[kind] ?? ""))?.key ?? "custom"}
              onChange={(e) => {
                const preset = CRON_PRESETS.find(p => p.key === e.target.value);
                if (preset) patchSchedule(kind, preset.expr);
              }}
              disabled={saving}
              className="px-3 py-2 border border-zinc-300 rounded-lg text-[14px] focus:border-brand-deep outline-none"
            >
              {CRON_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <div className="text-[12px] text-zinc-500 mt-1">
              현재 · <code className="bg-zinc-100 px-1 rounded">{config.schedules[kind] || "off"}</code>
              {config.schedules[kind] && " · cron 표현식"}
            </div>
          </div>

          {/* 수동 실행 */}
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <button
              onClick={async () => {
                const result = await window.api.runNow(kind);
                alert(`${FILE_LABELS[kind]} · ${result.message}`);
              }}
              disabled={saving || !config.folders[kind]}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[14px] font-semibold hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              지금 실행
            </button>
          </div>
        </section>
      ))}
    </div>
  );
};

export default Settings;
