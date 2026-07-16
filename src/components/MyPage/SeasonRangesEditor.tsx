// src/components/MyPage/SeasonRangesEditor.tsx
// 관리자(level>=9) 전용 · MyPage 하단에 렌더링
// 봄/여름/가을/겨울 · 각 계절에 해당하는 월(들) 을 체크박스로 편집
// 저장 시 POST /api/settings/season-ranges (서버측 level>=9 재검증)
import React, { useEffect, useState } from "react";
import { Save, Loader2, RotateCcw } from "lucide-react";
import {
  DEFAULT_SEASON_RANGES,
  SEASON_EMOJI,
  SEASON_LABEL,
  fetchSeasonRanges,
  saveSeasonRanges,
  type SeasonKey,
  type SeasonRanges,
} from "../../hooks/useSeasonRanges";

interface Props {
  employeeId: number;
  onToast?: (msg: string, ms?: number) => void;
}

const SEASONS: SeasonKey[] = ["spring", "summer", "autumn", "winter"];
const SEASON_COLOR: Record<SeasonKey, { bg: string; text: string; border: string; active: string }> = {
  spring: { bg: "bg-pink-50",    text: "text-pink-700",    border: "border-pink-200",    active: "bg-pink-500" },
  summer: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   active: "bg-amber-500" },
  autumn: { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  active: "bg-orange-500" },
  winter: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     active: "bg-sky-500" },
};

export const SeasonRangesEditor: React.FC<Props> = ({ employeeId, onToast }) => {
  const [ranges, setRanges] = useState<SeasonRanges>({ ...DEFAULT_SEASON_RANGES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchSeasonRanges().then(v => {
      if (mounted) { setRanges(v); setLoading(false); }
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const toggleMonth = (season: SeasonKey, month: number) => {
    setRanges(prev => {
      const set = new Set<number>(prev[season]);
      if (set.has(month)) set.delete(month); else set.add(month);
      const next = { ...prev, [season]: [...set].sort((a, b) => a - b) };
      setDirty(true);
      return next;
    });
  };

  const resetToDefault = () => {
    setRanges({ ...DEFAULT_SEASON_RANGES });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await saveSeasonRanges(ranges, employeeId);
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      onToast?.("계절 정의가 저장되었습니다");
    } else {
      onToast?.(`저장 실패: ${res.error ?? "알 수 없는 오류"}`, 3000);
    }
  };

  // 각 월이 여러 계절에 중복되어 있으면 경고
  const monthCount: Record<number, number> = {};
  for (const s of SEASONS) for (const m of ranges[s]) monthCount[m] = (monthCount[m] ?? 0) + 1;
  const duplicateMonths = Object.entries(monthCount)
    .filter(([, c]) => c > 1)
    .map(([m]) => Number(m));
  const missingMonths: number[] = [];
  for (let m = 1; m <= 12; m++) if (!monthCount[m]) missingMonths.push(m);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-100 bg-emerald-50/60 text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <span>🌸☀️🍁❄️</span> 계절 정의 <span className="text-emerald-400 font-semibold normal-case">(관리자 전용)</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetToDefault}
            disabled={saving || loading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-40"
            title="기본값(3~5·6~8·9~11·12~2)으로 초기화"
          >
            <RotateCcw size={10} /> 기본값
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !dirty}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition disabled:opacity-40"
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} 저장
          </button>
        </div>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-slate-500 font-semibold mb-3 leading-relaxed">
          재고·판매 리스트 조회에서 <b>계절 버튼</b> 클릭 시, 여기 정의된 월들의 데이터 (년도 무관 · 전 기간) 가 조회됩니다.
          <br />각 계절에 속하는 월을 선택하세요.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />로딩...</div>
        ) : (
          <div className="flex flex-col gap-2">
            {SEASONS.map(season => {
              const col = SEASON_COLOR[season];
              return (
                <div key={season} className={`rounded-lg border ${col.border} ${col.bg} p-2`}>
                  <div className={`flex items-center justify-between mb-1.5 text-[12px] font-black ${col.text}`}>
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden>{SEASON_EMOJI[season]}</span>
                      <span>{SEASON_LABEL[season]}</span>
                    </span>
                    <span className="text-[10px] font-mono opacity-70">
                      {ranges[season].length > 0 ? ranges[season].map(m => `${m}`).join("·") + "월" : "없음"}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                      const active = ranges[season].includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMonth(season, m)}
                          className={`text-[10px] font-black rounded-md py-1 border transition cursor-pointer ${
                            active
                              ? `${col.active} text-white border-transparent shadow-sm`
                              : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                          }`}
                          title={`${m}월 ${active ? "해제" : "추가"}`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 검증 안내 */}
        {(duplicateMonths.length > 0 || missingMonths.length > 0) && (
          <div className="mt-3 text-[10px] text-slate-500 font-semibold space-y-0.5 border-t border-slate-100 pt-2">
            {duplicateMonths.length > 0 && (
              <div className="text-amber-700">
                ⚠ 여러 계절에 중복된 월: <span className="font-mono">{duplicateMonths.sort((a, b) => a - b).join("·")}월</span>
                <span className="text-slate-400"> · 사용자가 계절 조회 시 어느 쪽을 눌러도 이 월 데이터가 함께 조회됩니다</span>
              </div>
            )}
            {missingMonths.length > 0 && (
              <div className="text-rose-600">
                ✕ 어느 계절에도 속하지 않는 월: <span className="font-mono">{missingMonths.join("·")}월</span>
                <span className="text-slate-400"> · 이 월의 데이터는 계절 조회로 볼 수 없습니다</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SeasonRangesEditor;
