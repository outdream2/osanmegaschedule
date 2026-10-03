// apps/sync-agent/src/renderer/src/screens/IregenSettingsSection.tsx
// 2026-10-03 · Iregen ERP 연동 설정 · Settings 섹션
//   · CorpDB_nm · password 입력 · safeStorage 저장 (평문 X · renderer 재전달 X)
//   · [저장] · 즉시 반영 (재시작 불필요)
//   · [연결 테스트] · 실제 SOAP + Decoder 실행 · Supabase 미반영

import React, { useEffect, useState } from "react";

const DEFAULT_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcInventoryBiz.asmx";
const DEFAULT_SOAP_ACTION = "http://tempuri.org/Inventory_Status";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; rowCount: number; columns: number; totalMs: number; soapMs: number; decoderMs: number }
  | { kind: "fail"; stage: string; message: string };

export const IregenSettingsSection: React.FC = () => {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [soapAction, setSoapAction] = useState(DEFAULT_SOAP_ACTION);
  const [corpDbNmInput, setCorpDbNmInput] = useState("");
  const [corpDbNmSet, setCorpDbNmSet] = useState(false);
  const [source, setSource] = useState<"env" | "safeStorage" | "none">("none");
  const [envSourceLabel, setEnvSourceLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  // 2026-10-03 · 사용자 지시 7 · state 복원 crash 방지
  //   · window.api 미주입 (preload 지연) · IPC reject · invalid shape 모두 방어
  //   · 실패해도 render 자체는 성공 · '설정 로드 실패' 안내 UI 로 fallback
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = async () => {
    try {
      if (!window.api?.iregenGetSettings) {
        setLoadErr("preload 미주입 · 앱 재시작 필요");
        setLoaded(true);
        return;
      }
      const s = await window.api.iregenGetSettings();
      if (!s || typeof s !== "object") {
        setLoadErr("설정 응답 형식 오류");
        setLoaded(true);
        return;
      }
      setEnabled(!!s.enabled);
      setEndpoint(s.endpoint || DEFAULT_ENDPOINT);
      setSoapAction(s.soapAction || DEFAULT_SOAP_ACTION);
      setCorpDbNmSet(!!s.corpDbNmSet);
      setSource(s.source ?? "none");
      setEnvSourceLabel(s.envSourceLabel ?? null);
      setLoadErr(null);
      setLoaded(true);
    } catch (err: any) {
      console.error("[IregenSettings] 설정 로드 실패:", err);
      setLoadErr(err?.message ?? String(err));
      setLoaded(true);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!window.api?.iregenSaveSettings) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const r = await window.api.iregenSaveSettings({
        enabled,
        endpoint,
        soapAction,
        corpDbNm: corpDbNmInput || undefined,
      });
      if (r.ok) {
        setCorpDbNmSet(r.corpDbNmSet);
        setCorpDbNmInput("");
        setSavedMsg("저장 완료");
        setTimeout(() => setSavedMsg(null), 2000);
      } else {
        setSavedMsg("저장 실패 · " + r.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const clearCorpDb = async () => {
    if (!window.api?.iregenClearCorpDbNm) return;
    if (!confirm("저장된 CorpDB_nm 을 삭제하시겠습니까?")) return;
    await window.api.iregenClearCorpDbNm();
    setCorpDbNmSet(false);
    setSavedMsg("CorpDB_nm 삭제됨");
    setTimeout(() => setSavedMsg(null), 2000);
  };

  const runTest = async () => {
    if (!window.api?.erpInventoryQuery) return;
    setTest({ kind: "running" });
    const r = await window.api.erpInventoryQuery();
    if (r.ok) {
      setTest({
        kind: "ok",
        rowCount: r.rowCount,
        columns: r.columns.length,
        totalMs: r.meta.totalMs,
        soapMs: r.meta.soapMs,
        decoderMs: r.meta.decoderMs,
      });
    } else {
      setTest({ kind: "fail", stage: r.stage, message: r.error });
    }
  };

  if (!loaded) {
    return (
      <section className="bg-white rounded-xl border border-zinc-200 p-6">
        <div className="text-zinc-500 text-[14px]">Iregen 설정 로딩 중...</div>
      </section>
    );
  }
  if (loadErr) {
    return (
      <section className="bg-white rounded-xl border border-amber-200 p-6">
        <h2 className="text-[17px] font-bold mb-2">🔗 Iregen ERP 연동</h2>
        <div className="text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="font-bold">⚠ 설정을 불러올 수 없습니다</div>
          <div className="text-[12px] mt-1">{loadErr}</div>
          <button
            onClick={() => { setLoaded(false); setLoadErr(null); load(); }}
            className="mt-2 px-3 py-1 bg-amber-600 text-white rounded text-[12px] font-semibold hover:bg-amber-700"
          >
            다시 시도
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-zinc-200 p-6">
      <h2 className="text-[17px] font-bold mb-2">🔗 Iregen ERP 연동</h2>
      <p className="text-[13px] text-zinc-500 mb-4">
        ERP 실시간 조회 · 설정 후 대시보드 「ERP 재고 조회」 에서 사용 · Supabase 미반영
      </p>

      {/* 2026-10-03 · 사용자 지시 · 체크 즉시 저장 (앱 재시작 불필요) */}
      <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 bg-zinc-50 mb-4 cursor-pointer">
        <div>
          <div className="text-[14px] font-semibold text-zinc-800">ERP 연동 사용</div>
          <div className="text-[12px] text-zinc-500">OFF 이면 조회 호출 자체를 차단합니다 (설정값은 유지) · 변경 즉시 반영</div>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={async (e) => {
            const next = e.target.checked;
            setEnabled(next);
            if (!window.api?.iregenSaveSettings) return;
            setSaving(true);
            try {
              const r = await window.api.iregenSaveSettings({ enabled: next });
              if (r.ok) {
                setSavedMsg(next ? "✓ ERP 연동 ON" : "✓ ERP 연동 OFF");
                setTimeout(() => setSavedMsg(null), 1800);
              } else {
                setSavedMsg("저장 실패 · " + r.error);
                setEnabled(!next); // 롤백
              }
            } finally {
              setSaving(false);
            }
          }}
          className="w-5 h-5 accent-brand-deep cursor-pointer"
          disabled={saving}
        />
      </label>

      {/* CorpDB_nm · password · env 우선 · safeStorage fallback */}
      <div className="mb-4">
        <label className="text-[14px] font-semibold text-zinc-700 mb-1 block">
          CorpDB_nm{" "}
          <span className="text-[12px] text-zinc-400 font-normal">
            · 비밀 값 · {source === "env" ? "환경변수에서 로드" : "Windows DPAPI 암호화 저장"}
          </span>
        </label>
        {source === "env" ? (
          <div className="p-3 border border-sky-200 bg-sky-50 rounded-lg text-[13px] text-sky-900">
            <div className="font-semibold">✓ env 로 설정됨 · 입력 불필요</div>
            <div className="text-[12px] mt-0.5 text-sky-700">
              IREGEN_CORP_DB_NM{envSourceLabel ? " · 소스: " + envSourceLabel : ""}
            </div>
            <div className="text-[11px] mt-1 text-zinc-500">
              env 를 끄려면 해당 .env 라인을 삭제하거나 환경변수를 unset 후 앱 재시작
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value={corpDbNmInput}
                onChange={(e) => setCorpDbNmInput(e.target.value)}
                placeholder={corpDbNmSet ? "저장됨 · 변경하려면 새 값 입력" : "미설정 · ERP 연결 값을 입력하세요"}
                autoComplete="new-password"
                className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-[14px] focus:border-brand-deep outline-none"
                disabled={saving}
              />
              {corpDbNmSet && (
                <button
                  onClick={clearCorpDb}
                  disabled={saving}
                  className="px-3 py-2 border border-rose-200 text-rose-600 rounded-lg text-[13px] font-semibold hover:bg-rose-50 disabled:opacity-40"
                >
                  삭제
                </button>
              )}
            </div>
            <div className="text-[12px] mt-1">
              CorpDB 인증정보 ·{" "}
              <span className={corpDbNmSet ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                {corpDbNmSet ? "저장됨" : "미설정"}
              </span>
              <span className="text-zinc-400"> · 평문 저장 X · 화면 표시 X</span>
            </div>
          </>
        )}
      </div>

      {/* Endpoint */}
      <div className="mb-4">
        <label className="text-[14px] font-semibold text-zinc-700 mb-1 block">Endpoint</label>
        <input
          type="url"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-[13px] font-mono focus:border-brand-deep outline-none"
          disabled={saving}
        />
        <div className="text-[12px] text-zinc-400 mt-1">기본값 · {DEFAULT_ENDPOINT}</div>
      </div>

      {/* SOAP Action */}
      <div className="mb-4">
        <label className="text-[14px] font-semibold text-zinc-700 mb-1 block">SOAP Action</label>
        <input
          type="text"
          value={soapAction}
          onChange={(e) => setSoapAction(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-[13px] font-mono focus:border-brand-deep outline-none"
          disabled={saving}
        />
        <div className="text-[12px] text-zinc-400 mt-1">기본값 · {DEFAULT_SOAP_ACTION}</div>
      </div>

      {/* Save + Test */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 bg-brand-deep text-white rounded-lg text-[13px] font-semibold hover:bg-[#0d3a5c] disabled:opacity-40 transition"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          onClick={runTest}
          disabled={saving || test.kind === "running"}
          className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-40 transition"
        >
          {test.kind === "running" ? "테스트 중..." : "연결 테스트"}
        </button>
        {savedMsg && <div className="text-[12px] text-zinc-600">{savedMsg}</div>}
      </div>

      {/* Test result */}
      {test.kind === "ok" && (
        <div className="mt-3 border border-emerald-200 bg-emerald-50 rounded-lg p-3 text-[13px] text-emerald-900 space-y-0.5">
          <div className="font-bold text-emerald-700">✓ Iregen ERP 연결 성공</div>
          <div>HTTP 200 · SOAP {test.soapMs} ms</div>
          <div>Decoder 성공 · {test.decoderMs} ms</div>
          <div>Rows: {test.rowCount.toLocaleString()} · Columns: {test.columns}</div>
          <div className="text-emerald-700">총 소요 · {test.totalMs} ms</div>
        </div>
      )}
      {test.kind === "fail" && (
        <div className="mt-3 border border-rose-200 bg-rose-50 rounded-lg p-3 text-[13px] text-rose-900">
          <div className="font-bold text-rose-700">⚠ 연결 테스트 실패 · stage: {test.stage}</div>
          <pre className="whitespace-pre-wrap break-all mt-1 text-[12px]">{test.message}</pre>
        </div>
      )}
    </section>
  );
};

export default IregenSettingsSection;
