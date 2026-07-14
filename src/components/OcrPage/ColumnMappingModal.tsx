// src/components/OcrPage/ColumnMappingModal.tsx
// 공급사별 컬럼 매핑 모달 · 시각적 연결선 방식
//
// UX:
//   좌측 = raw 헤더 + 샘플 값 (버튼 리스트)
//   우측 = 표준 필드 (버튼 리스트)
//   중앙 = SVG 연결선 (현재 매핑 시각화)
//
// 인터랙션:
//   1. 좌측 버튼 클릭 → 선택 상태 (파란 링)
//   2. 우측 버튼 클릭 → 선택된 좌측과 연결 (mapping 업데이트)
//   3. 좌측 X 버튼 → 연결 해제 (제외로 설정)
//   4. 저장 → 부모의 saveMappingTemplate

import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";

interface Props {
  supplier: string;
  rawHeaders: string[];
  sampleRows: any[][];
  // 분할 감지 전용 · OCR 원본 샘플 (제공되면 우선 사용) · undefined 면 sampleRows 사용
  rawSampleForDetect?: any[][];
  fieldOptions: string[];        // ["품명","규격",...,"제외"]
  mapping: string[];             // 원본 컬럼 인덱스 → 표준 필드
  onChangeMapping: (next: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

type Point = { x: number; y: number };

export const ColumnMappingModal: React.FC<Props> = ({
  supplier, rawHeaders, sampleRows, rawSampleForDetect, fieldOptions, mapping,
  onChangeMapping, onCancel, onSave, saving,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [selectedRawIdx, setSelectedRawIdx] = useState<number | null>(null);
  // 실제 표시 좌표를 저장 (성능·리렌더 안정)
  const [lines, setLines] = useState<Array<{ from: Point; to: Point; rawIdx: number; field: string }>>([]);

  // 각 원본 컬럼의 "분리 가능 토큰 개수" 감지 (자동 분할 UX 활성화용) · v4c
  //   판정: 공백으로 split 한 결과가 2개 이상이거나 · 큰 숫자 그룹이 여러 개면 분할 가능
  //   ⚠ 쉼표(1,000의 천단위) · 마침표(1.000) 는 구분자로 보지 않음
  //   ⚠ 3자리 이상 숫자 그룹만 카운트 → "100ML" (100 하나만 카운트) · "55,000" (55000 하나만)
  //   ⚠ 감지 소스 우선: rawSampleForDetect(OCR 원본) > sampleRows(가공 후)
  const detectSource = (rawSampleForDetect && rawSampleForDetect.length > 0) ? rawSampleForDetect : sampleRows;
  const rawTokenCounts: number[] = rawHeaders.map((_, ci) => {
    let maxTokenCount = 1;
    for (const row of detectSource) {
      if (!Array.isArray(row)) continue;
      const v = row[ci];
      if (v == null || v === "") continue;
      const s = String(v).trim();
      if (!s) continue;
      const wsTokens = s.split(/\s+/).filter(Boolean);
      const NUM_CHUNK_RE = /\d{1,3}(?:[,.]\d{3})+|\d{4,}/g;
      const bigNums = (s.match(NUM_CHUNK_RE) ?? []).length;
      const tokenCount = Math.max(wsTokens.length, bigNums);
      if (tokenCount > maxTokenCount) maxTokenCount = tokenCount;
    }
    return maxTokenCount;
  });

  // 좌측 클릭: 선택 상태 토글
  const handleLeftClick = (idx: number) => {
    setSelectedRawIdx(prev => (prev === idx ? null : idx));
  };
  // 우측 클릭: 선택된 좌측과 연결
  //   · 값이 2개+ 감지된 원본 컬럼: 자동 분할 모드 (선택 유지 · 다음 클릭도 append)
  //   · 값 1개 컬럼: Shift/Ctrl/Cmd 누르고 클릭해야 분할 (기존 방식)
  const handleRightClick = (field: string, e?: React.MouseEvent) => {
    if (selectedRawIdx == null) return;
    const tokenCount = rawTokenCounts[selectedRawIdx] ?? 1;
    const isAutoSplit = tokenCount >= 2;
    const isForceSplit = !!e && (e.shiftKey || e.ctrlKey || e.metaKey);
    const isSplitMode = isAutoSplit || isForceSplit;
    const next = [...mapping];
    const current = next[selectedRawIdx];
    if (isSplitMode && current && current !== "제외" && !current.split("|").includes(field)) {
      // 분할 모드: 기존 필드에 "|" 로 append
      const currentParts = current.split("|");
      if (currentParts.length >= tokenCount && isAutoSplit) {
        // 자동 분할 모드에서 토큰 수만큼 다 채웠으면 선택 해제
        next[selectedRawIdx] = `${current}|${field}`;
        onChangeMapping(next);
        setSelectedRawIdx(null);
        return;
      }
      next[selectedRawIdx] = `${current}|${field}`;
    } else {
      next[selectedRawIdx] = field;
    }
    onChangeMapping(next);
    // 자동 분할 모드는 선택 유지 (다음 필드 계속 추가 가능) · 강제 분할도 유지
    if (!isSplitMode) setSelectedRawIdx(null);
  };
  // 좌측 X: 매핑 제거 (= "제외")
  const handleClearMapping = (idx: number) => {
    const next = [...mapping];
    next[idx] = "제외";
    onChangeMapping(next);
  };

  // 연결선 좌표 계산 (mapping / rawHeaders 참조 안정 후 실행)
  //   ⚠ fieldOptions 는 부모에서 매번 새 참조 가능성 → deps 에서 제외 (렌더시마다 재계산해도 무해)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newLines: Array<{ from: Point; to: Point; rawIdx: number; field: string }> = [];
    for (let ri = 0; ri < mapping.length; ri++) {
      const field = mapping[ri];
      if (!field || field === "제외") continue;
      // 분할 모드 지원: "유통기한|단가" → 각 필드마다 연결선
      const fieldsToDraw = field.split("|").map(s => s.trim()).filter(Boolean);
      for (const singleField of fieldsToDraw) {
      const leftEl = leftRefs.current[ri];
      const rightEl = rightRefs.current[singleField];
      if (!leftEl || !rightEl) continue;
      const lRect = leftEl.getBoundingClientRect();
      const rRect = rightEl.getBoundingClientRect();
      const from: Point = {
        x: lRect.right - containerRect.left,
        y: lRect.top + lRect.height / 2 - containerRect.top,
      };
      const to: Point = {
        x: rRect.left - containerRect.left,
        y: rRect.top + rRect.height / 2 - containerRect.top,
      };
      newLines.push({ from, to, rawIdx: ri, field: singleField });
      }
    }
    // 이전 lines 와 동일하면 setState 스킵 (무한 루프 방지)
    setLines(prev => {
      if (prev.length !== newLines.length) return newLines;
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i], b = newLines[i];
        if (a.rawIdx !== b.rawIdx || a.field !== b.field ||
            a.from.x !== b.from.x || a.from.y !== b.from.y ||
            a.to.x !== b.to.x || a.to.y !== b.to.y) {
          return newLines;
        }
      }
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, rawHeaders]);

  // 창 크기 변경 시 재계산
  useEffect(() => {
    const handler = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      setLines(prev => prev.map(l => {
        const leftEl = leftRefs.current[l.rawIdx];
        const rightEl = rightRefs.current[l.field];
        if (!leftEl || !rightEl) return l;
        const lRect = leftEl.getBoundingClientRect();
        const rRect = rightEl.getBoundingClientRect();
        return {
          ...l,
          from: {
            x: lRect.right - containerRect.left,
            y: lRect.top + lRect.height / 2 - containerRect.top,
          },
          to: {
            x: rRect.left - containerRect.left,
            y: rRect.top + rRect.height / 2 - containerRect.top,
          },
        };
      }));
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // 우측 필드 사용 카운트 (표시용) · 분할 필드도 개별 카운트
  const fieldUsageCount = new Map<string, number>();
  for (const f of mapping) {
    if (!f || f === "제외") continue;
    for (const single of f.split("|").map(s => s.trim()).filter(Boolean)) {
      fieldUsageCount.set(single, (fieldUsageCount.get(single) ?? 0) + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800">🔧 공급사 컬럼 매핑</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              <span className="font-bold text-indigo-600">{supplier || "(공급사 미지정)"}</span> — <span className="text-slate-600">OCR 원본 컬럼</span>을 표준 필드에 연결. 저장하면 다음 스캔부터 자동 적용됩니다.
            </p>
            <p className="text-[10px] text-emerald-700 mt-0.5">
              💡 나눠진 데이터: 같은 필드에 여러 원본을 연결하면 자동 합침 (예: 품·명 → 품명)
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              ✂️ 한 셀에 여러 값 붙어있을 때: 한 원본 선택 후 <b>Shift·Ctrl 누른 채 오른쪽 필드 여러 개 클릭</b> → 공백으로 자동 분리 (예: "20281221 454" → 유통기한 · 단가)
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* 본문 · 좌우 리스트 + SVG 연결선 */}
        <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4 relative">
          {/* SVG 오버레이 (연결선) */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
            {lines.map((l, i) => {
              const midX = (l.from.x + l.to.x) / 2;
              const d = `M ${l.from.x} ${l.from.y} C ${midX} ${l.from.y}, ${midX} ${l.to.y}, ${l.to.x} ${l.to.y}`;
              return (
                <g key={i}>
                  <path d={d} stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <circle cx={l.from.x} cy={l.from.y} r={3} fill="#6366f1" />
                  <circle cx={l.to.x} cy={l.to.y} r={3} fill="#6366f1" />
                </g>
              );
            })}
          </svg>

          <div className="grid grid-cols-[1fr_120px_180px] gap-4 relative">
            {/* 좌측: raw 헤더 + 샘플 값 */}
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black text-slate-500 uppercase mb-1">원본 컬럼</div>
              {rawHeaders.map((h, ci) => {
                const isSelected = selectedRawIdx === ci;
                const mappingVal = mapping[ci];
                const isMapped = mappingVal && mappingVal !== "제외";
                const mappedFieldsCount = isMapped ? mappingVal.split("|").length : 0;
                const tokenCount = rawTokenCounts[ci] ?? 1;
                const isSplittable = tokenCount >= 2;
                return (
                  <div key={ci} className="flex items-center gap-1">
                    <button
                      ref={el => { leftRefs.current[ci] = el; }}
                      type="button"
                      onClick={() => handleLeftClick(ci)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg border-2 transition ${
                        isSelected
                          ? "bg-indigo-100 border-indigo-500 shadow-md"
                          : isMapped
                            ? "bg-indigo-50 border-indigo-200 hover:border-indigo-400"
                            : isSplittable
                              ? "bg-amber-50 border-amber-300 hover:border-amber-500"
                              : "bg-slate-50 border-slate-200 hover:border-indigo-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="text-[12px] font-black text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                          {h || <span className="text-slate-400 italic">(빈 헤더)</span>}
                        </div>
                        {isSplittable && (
                          <span
                            className="text-[9px] font-black text-amber-700 bg-white border border-amber-300 rounded px-1 py-0.5 whitespace-nowrap"
                            title={`이 컬럼은 값이 ${tokenCount}개로 감지됨 · 클릭 후 오른쪽 필드 여러 개 선택하면 자동 분할`}
                          >
                            ✂️ 값 {tokenCount}개
                          </span>
                        )}
                        {isMapped && isSplittable && mappedFieldsCount < tokenCount && isSelected && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded px-1 py-0.5 whitespace-nowrap animate-pulse">
                            {mappedFieldsCount}/{tokenCount} 지정 · 계속 선택
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                        {sampleRows.map((r, ri) => {
                          const v = r[ci];
                          const str = v == null ? "—" : String(v);
                          return (
                            <span key={ri} className="mr-1.5">{str.length > 12 ? str.slice(0, 12) + "…" : str}</span>
                          );
                        })}
                      </div>
                    </button>
                    {isMapped && (
                      <button
                        type="button"
                        onClick={() => handleClearMapping(ci)}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer p-1"
                        title="매핑 해제"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 중앙: 안내 (선택된 좌측 표시) */}
            <div className="flex flex-col items-center justify-center gap-2 text-[10px] text-slate-400 font-bold">
              {selectedRawIdx != null ? (
                <div className="text-center text-indigo-600">
                  <div className="text-[11px] font-black mb-1">→</div>
                  <div className="text-[10px]">오른쪽 필드<br/>클릭</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[11px] font-black mb-1">↔</div>
                  <div className="text-[10px]">왼쪽 → 오른쪽<br/>순서로 클릭</div>
                </div>
              )}
            </div>

            {/* 우측: 표준 필드 */}
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black text-slate-500 uppercase mb-1">표준 필드</div>
              {fieldOptions.filter(f => f !== "제외").map(field => {
                const usageCount = fieldUsageCount.get(field) ?? 0;
                const isTarget = selectedRawIdx != null;
                return (
                  <button
                    key={field}
                    ref={el => { rightRefs.current[field] = el; }}
                    type="button"
                    onClick={e => handleRightClick(field, e)}
                    disabled={selectedRawIdx == null}
                    className={`text-left px-3 py-2 rounded-lg border-2 transition ${
                      selectedRawIdx == null
                        ? "bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed"
                        : usageCount > 0
                          ? "bg-indigo-50 border-indigo-300 hover:bg-indigo-100 cursor-pointer"
                          : "bg-white border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer"
                    } ${isTarget ? "ring-2 ring-indigo-200 ring-offset-1" : ""}`}
                  >
                    <span className="text-[12px] font-black text-slate-800">{field}</span>
                    {usageCount === 1 && (
                      <span className="ml-1.5 text-[9px] font-bold text-indigo-600 bg-white border border-indigo-300 rounded px-1 py-0.5">
                        연결됨
                      </span>
                    )}
                    {usageCount >= 2 && (
                      <span className="ml-1.5 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 rounded px-1 py-0.5">
                        🔗 {usageCount}개 병합
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
          <div className="text-[10px] text-slate-500">
            {mapping.filter(f => f && f !== "제외").length}개 컬럼 매핑됨 · 나머지는 자동 "제외"
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel}
              className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 cursor-pointer">
              취소
            </button>
            <button onClick={onSave}
              disabled={saving || !supplier}
              className="text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-lg px-3 py-1.5 cursor-pointer flex items-center gap-1"
            >
              {saving ? <><Loader2 size={12} className="animate-spin" />저장 중</> : <><Save size={12} />공급사에 저장</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
