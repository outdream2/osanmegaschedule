// Settings.tsx
// 2026-09-15 · Phase 2 · 실제 설정 편집
// 2026-10-05 · XLSX 파일 감시 폴더/스케줄 섹션 제거 (ERP 자동임포트 전환)
//   · 임포트 모드 radio · 상품정보/재고정보/매입정보 폴더+cron · 전부 제거

import React, { useEffect, useState } from "react";
import type { RendererConfig } from "../types";
import { IregenSettingsSection } from "./IregenSettingsSection";
import { SectionBoundary } from "../components/SectionBoundary";

export const Settings: React.FC = () => {
  const [config, setConfig] = useState<RendererConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const cfg = await window.api.getConfig();
    setConfig(cfg);
  };
  useEffect(() => { load(); }, []);

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

      {/* 2026-10-03 · Iregen ERP 연동 설정 (CorpDB_nm · safeStorage · 평문 저장 X) */}
      <SectionBoundary name="Iregen ERP 연동">
        <IregenSettingsSection />
      </SectionBoundary>

      {/* 2026-10-05 · 자동 임포트 설정 · ERP → Supabase 동기화 탭 안 "자동 임포트 설정" 패널로 이동 */}
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <h2 className="text-[17px] font-bold mb-2">🕒 자동 임포트 설정</h2>
        <p className="text-[13px] text-zinc-500">
          Dataset 별 자동 동기화 주기 설정은{" "}
          <strong className="text-brand-deep">⚡ ERP → Supabase 동기화</strong> 탭 상단 "자동 임포트 설정" 패널에서 관리합니다.
        </p>
      </section>
    </div>
  );
};

export default Settings;
