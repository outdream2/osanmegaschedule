// src/components/EmployeeFormModal.tsx
import React, { useEffect, useRef } from "react";
import { X, Users, Calendar, MapPin, FileText, ExternalLink, Upload } from "lucide-react";
import { ZONE_DEFS, SECTION_LABEL } from "../constants/displayZones";

interface EmployeeFormModalProps {
  empModalMode: "create" | "edit";
  empName: string;
  setEmpName: React.Dispatch<React.SetStateAction<string>>;
  empPosition: string;
  setEmpPosition: React.Dispatch<React.SetStateAction<string>>;
  empCustomPosition: string;
  setEmpCustomPosition: React.Dispatch<React.SetStateAction<string>>;
  empEmploymentType: string;
  setEmpEmploymentType: React.Dispatch<React.SetStateAction<string>>;
  empHireDate: string;
  setEmpHireDate: React.Dispatch<React.SetStateAction<string>>;
  empDescription: string;
  setEmpDescription: React.Dispatch<React.SetStateAction<string>>;
  empWorkplace: string;
  setEmpWorkplace: React.Dispatch<React.SetStateAction<string>>;
  empGender: "남" | "여" | "";
  setEmpGender: React.Dispatch<React.SetStateAction<"남" | "여" | "">>;
  empRank: string;
  setEmpRank: React.Dispatch<React.SetStateAction<string>>;
  empAnnualLeave: number;
  setEmpAnnualLeave: React.Dispatch<React.SetStateAction<number>>;
  empLevel: number;
  setEmpLevel: React.Dispatch<React.SetStateAction<number>>;
  empZoneNums: number[];
  setEmpZoneNums: React.Dispatch<React.SetStateAction<number[]>>;
  employmentTypes: string[];
  // 근로계약서
  empContractFile: File | null;
  setEmpContractFile: React.Dispatch<React.SetStateAction<File | null>>;
  empContractUrl: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const SELECT_CLS = "w-full text-xs rounded border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 p-2 bg-white text-slate-800 focus:outline-none transition-all";
const LABEL_CLS = "block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1";

const POSITIONS = ["약사", "캐셔", "진열", "물류", "기타"];
const RANKS     = ["", "대표", "이사", "부장", "팀장", "과장", "약사", "사원", "알바"];
const WORKPLACES = ["매장", "창고", "본사", "기타"];
const GENDERS   = [{ v: "", label: "미지정" }, { v: "남", label: "남자" }, { v: "여", label: "여자" }];
const LEVELS    = [
  { v: 0,  label: "0 — 미지정" },
  { v: 1,  label: "1 — 직원" },
  { v: 2,  label: "2" },
  { v: 3,  label: "3" },
  { v: 4,  label: "4" },
  { v: 5,  label: "5" },
  { v: 6,  label: "6" },
  { v: 7,  label: "7 — 관리자" },
  { v: 8,  label: "8 — 대표" },
  { v: 9,  label: "9 — 최고관리자" },
];

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  empModalMode,
  empName, setEmpName,
  empPosition, setEmpPosition,
  empCustomPosition, setEmpCustomPosition,
  empEmploymentType, setEmpEmploymentType,
  empHireDate, setEmpHireDate,
  empDescription, setEmpDescription,
  empWorkplace, setEmpWorkplace,
  empGender, setEmpGender,
  empRank, setEmpRank,
  empAnnualLeave, setEmpAnnualLeave,
  empLevel, setEmpLevel,
  empZoneNums, setEmpZoneNums,
  employmentTypes,
  empContractFile, setEmpContractFile,
  empContractUrl,
  onSubmit, onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCustomPosition = !["약사", "캐셔", "진열", "물류", ""].includes(empPosition);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full sm:max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 transform scale-100 transition animate-in zoom-in-95 duration-100 max-h-[92vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Users className="text-blue-600" size={18} />
            <h3 className="text-sm font-bold text-slate-900">
              {empModalMode === "edit" ? "직원 정보 수정" : "새 직원 등록"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">

          {/* ── 1. 성명 ── */}
          <div>
            <label className={LABEL_CLS}>
              성명 <span className="text-rose-500 normal-case">*</span>
            </label>
            <input
              type="text"
              placeholder="홍길동"
              value={empName}
              onChange={e => setEmpName(e.target.value)}
              className="w-full text-sm font-semibold rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 px-3 py-2.5 bg-white text-slate-900 placeholder:text-slate-300 focus:outline-none transition-all"
              required
            />
          </div>

          {/* ── 2. 구분 | 직급 ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>
                구분 <span className="text-rose-500 normal-case">*</span>
              </label>
              <select
                value={isCustomPosition ? "기타" : empPosition}
                onChange={e => {
                  const v = e.target.value;
                  setEmpPosition(v);
                  if (v !== "기타") setEmpCustomPosition("");
                  if (v !== "물류") setEmpZoneNums([]);
                }}
                className={SELECT_CLS}
              >
                <option value="">선택</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {(empPosition === "기타" || isCustomPosition) && (
                <input
                  type="text"
                  placeholder="직종 직접 입력"
                  value={empCustomPosition}
                  onChange={e => setEmpCustomPosition(e.target.value)}
                  className="mt-1.5 w-full text-xs rounded border border-slate-200 focus:border-blue-400 px-2 py-1.5 bg-white focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className={LABEL_CLS}>직급</label>
              <select
                value={empRank}
                onChange={e => setEmpRank(e.target.value)}
                className={SELECT_CLS}
              >
                {RANKS.map(r => <option key={r} value={r}>{r || "선택 안 함"}</option>)}
              </select>
            </div>
          </div>

          {/* ── 3. 레벨 ── */}
          <div>
            <label className={LABEL_CLS}>
              레벨
              <span className="text-slate-400 font-normal normal-case ml-1.5">접근 권한 (1=직원, 7=관리자, 8=대표, 9=최고관리자)</span>
            </label>
            <select
              value={empLevel}
              onChange={e => setEmpLevel(Number(e.target.value))}
              className={SELECT_CLS}
            >
              {LEVELS.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
            </select>
          </div>

          {/* ── 4. 입사일 | 연간월차 ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${LABEL_CLS} flex items-center gap-1`}>
                <Calendar size={11} /> 입사일
              </label>
              <input
                type="date"
                value={empHireDate}
                onChange={e => setEmpHireDate(e.target.value)}
                className={SELECT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>
                연간 월차
                <span className="text-slate-400 font-normal normal-case ml-1">일수</span>
              </label>
              <input
                type="number"
                min={0} max={30}
                value={empAnnualLeave || ""}
                onChange={e => setEmpAnnualLeave(parseInt(e.target.value) || 0)}
                placeholder="예: 15"
                className={SELECT_CLS}
              />
            </div>
          </div>

          {/* ── 5. 근무형태 | 성별 | 근무지 ── */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL_CLS}>
                근무형태 <span className="text-rose-500 normal-case">*</span>
              </label>
              <select
                value={empEmploymentType}
                onChange={e => setEmpEmploymentType(e.target.value)}
                className={SELECT_CLS}
              >
                {employmentTypes.map(et => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>성별</label>
              <select
                value={empGender}
                onChange={e => setEmpGender(e.target.value as "남" | "여" | "")}
                className={SELECT_CLS}
              >
                {GENDERS.map(g => <option key={g.v} value={g.v}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>
                근무지 <span className="text-rose-500 normal-case">*</span>
              </label>
              <select
                value={empWorkplace}
                onChange={e => setEmpWorkplace(e.target.value)}
                className={SELECT_CLS}
              >
                {WORKPLACES.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {/* ── 6. 구역 배정 (물류 전용) ── */}
          {empPosition === "물류" && (
            <div className="border border-violet-200 bg-violet-50/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-violet-800 flex items-center gap-1.5">
                  <MapPin size={13} className="text-violet-600" />
                  담당 구역 배정
                  <span className="text-[10px] font-normal text-violet-500">(복수 선택)</span>
                </label>
                <div className="flex items-center gap-2">
                  {empZoneNums.length > 0 && (
                    <span className="text-[10px] font-black text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full">
                      {empZoneNums.length}개 선택
                    </span>
                  )}
                  {empZoneNums.length > 0 && (
                    <button type="button" onClick={() => setEmpZoneNums([])}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer transition">
                      전체 해제
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                {(["top_wall", "aisle", "left_wall", "bottom_wall", "wing"] as const).map(section => {
                  const zones = ZONE_DEFS.filter(z => z.section === section);
                  return (
                    <div key={section}>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">{SECTION_LABEL[section]}</div>
                      <div className="flex flex-wrap gap-1">
                        {zones.map(z => {
                          const isOn = empZoneNums.includes(z.num);
                          return (
                            <button key={z.num} type="button"
                              onClick={() => setEmpZoneNums(prev => isOn ? prev.filter(n => n !== z.num) : [...prev, z.num])}
                              className={`px-1.5 py-1 rounded-lg border text-left transition-all cursor-pointer active:scale-[0.96] ${
                                isOn ? "bg-violet-100 border-violet-400 shadow-sm" : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50"
                              }`}
                              title={z.category}
                            >
                              <span className={`text-[10px] font-black leading-none ${isOn ? "text-violet-800" : "text-slate-600"}`}>{z.num}</span>
                              <span className={`text-[8px] ml-0.5 ${isOn ? "text-violet-600" : "text-slate-400"}`}>{z.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 7. 상세사항 ── */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              상세사항
              <span className="text-[10px] font-normal text-slate-400">(근무 패턴 / 메모)</span>
            </label>
            <input
              type="text"
              placeholder="예: 주6일 일 휴무, 수목휴무, 토일 등"
              value={empDescription}
              onChange={e => setEmpDescription(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
            />
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-200">
              <span className="text-[10px] text-slate-400 font-semibold self-center mr-0.5">패턴:</span>
              {["주6일 일 휴무", "수목 휴무", "토일", "금일", "일월", "3주 목<->토", "월화", "화수", "평일마감 주말오픈"].map(pat => (
                <button key={pat} type="button" onClick={() => setEmpDescription(pat)}
                  className="px-1.5 py-0.5 text-[9px] bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-400 rounded text-slate-600 font-semibold cursor-pointer transition">
                  {pat}
                </button>
              ))}
            </div>
          </div>

          {/* ── 8. 근로계약서 첨부 ── */}
          <div className="border border-slate-200 rounded-xl p-3">
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <FileText size={13} className="text-slate-500" />
              근로계약서 첨부
              <span className="text-[10px] font-normal text-slate-400">(PDF, HWP, 이미지, 20MB 이하)</span>
            </label>

            {/* 기존 파일 링크 */}
            {empContractUrl && !empContractFile && (
              <a href={empContractUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-semibold mb-2 hover:underline">
                <ExternalLink size={11} />
                현재 첨부 파일 열기
              </a>
            )}

            {/* 파일 선택 영역 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.hwp,.png,.jpg,.jpeg"
              className="hidden"
              onChange={e => setEmpContractFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed transition cursor-pointer text-xs font-semibold ${
                empContractFile
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <Upload size={13} />
              {empContractFile
                ? <span className="truncate max-w-[220px]">{empContractFile.name}</span>
                : <span>{empContractUrl ? "파일 교체" : "파일 선택"}</span>}
            </button>
            {empContractFile && (
              <button type="button" onClick={() => setEmpContractFile(null)}
                className="mt-1 text-[10px] text-rose-400 hover:text-rose-600 font-semibold cursor-pointer transition">
                선택 취소
              </button>
            )}
          </div>

          {/* ── 버튼 ── */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 transition cursor-pointer">
              취소
            </button>
            <button type="submit"
              className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition cursor-pointer shadow-sm">
              {empModalMode === "edit" ? "수정 완료" : "등록 완료"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
