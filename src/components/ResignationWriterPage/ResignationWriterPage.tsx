// src/components/ResignationWriterPage/ResignationWriterPage.tsx
// 사직서 작성 페이지 · 2026-08-03 · #179+#181
// - 좌측: 조건 입력 폼 (직원·부서/직급·입사일·마지막근무일·사유·상세사유·인수인계)
//   · 서명란은 좌측에서 제거 · 오른쪽 프리뷰 안에서 서명 spot 클릭
// - 우측: 실시간 표준 사직서 렌더 (한국 표준 양식 · 근로기준법 관례)
//   · 서명 spot 3개 (신청인·금품·기타) 클릭 → 서명 모달
//   · 프리뷰 하단 · PDF 다운로드 버튼
// - [사직서 제출] · POST /api/resignations · 관리자 알림
// - PDF · A4 세로 1페이지 fit (넘치면 scale down)
// - 직원 · 세션 자동 채움 · 자유 편집 가능
// - iOS/Gemini/ContractWriterPage 참조만 · 절대 수정 안 함
//
// 2026-08-05 · 서명 UX 개편:
//   1) 왼쪽 폼에서 서명 카드 3개 제거
//   2) 프리뷰 안 서명 spot 클릭 → 모달 오픈 → SignaturePad → 저장
//   3) PDF 다운 버튼 오른쪽 프리뷰 하단으로 이동
//   4) PDF A4 1페이지 fit · 넘치면 scale down
//
// 준수 원칙:
//   - memory feedback_ui_principles · 최소 14px · 3단 위계 · 고급 톤
//   - memory feedback_ui_consult · 통일된 디자인 · slate + rose 팔레트 · rounded-xl · shadow-sm
//   - memory feedback_git_push · remote push 절대 금지
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import {
  SignOut, User, ClipboardText, CalendarBlank, Notepad, Eraser,
  DownloadSimple, ArrowsClockwise, Warning, Check, Buildings, Signature,
  PaperPlaneTilt, Cake, Money, ShieldCheck, X,
} from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
import html2canvas from "html2canvas-pro"; // 2026-08-04 · Tailwind v4 oklch 지원 · drop-in 교체
import jsPDF from "jspdf";

import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { FieldLabel } from "../common/FieldLabel";
import type { AuthSession, Employee } from "../../types";

type SignatureCanvasType = SignaturePad;

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ResignationWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true · 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

interface ResignationForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeeNo: string;         // 사번 (있으면)
  birthDate: string;          // YYYY-MM-DD (생년월일 · 2026-08-05 추가)
  department: string;         // 부서
  position: string;           // 직급/직위
  hireDate: string;           // YYYY-MM-DD (입사일)

  // 사직 정보
  lastWorkDate: string;       // YYYY-MM-DD (마지막 근무일 = 사직 희망일)
  submitDate: string;         // YYYY-MM-DD (사직서 제출일 · 2026-08-05 추가)
  recipient: string;          // 수신 (예: "코스트팜(Costpharm) 대표") · 2026-08-05 추가

  // 사유
  reason: string;             // 표준 사유 (드롭다운 · 자유 입력 가능)
  reasonDetail: string;       // 상세 사유 (textarea)
  handoverNotes: string;      // 인수인계 사항 (textarea)

  // 금품 지급기일 동의 (2026-08-05 추가)
  payoutDate: string;         // YYYY-MM-DD (임금·퇴직금 지급일)

  // 회사
  employerName: string;       // 대표자
  companyName: string;        // 회사명
}

// 서명 slot 종류
type SignSlot = "employee" | "payout" | "other";

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

// 표준 사유 (2026-08-05 · 4가지로 제한)
const REASON_OPTIONS = [
  "일신상의 사유",
  "개인사정",
  "이직",
  "기타",
];

// 회사 기본값 (오산 메가타운 약국)
const DEFAULT_COMPANY = {
  employerName: "강남성",
  companyName: "오산 메가타운 약국",
};

// 기본 수신처 (실제 사직서 스펙)
const DEFAULT_RECIPIENT = "코스트팜(Costpharm) 대표";

// 서명 slot label
const SIGN_LABELS: Record<SignSlot, string> = {
  employee: "신청인 서명",
  payout: "금품 지급기일 동의 서명",
  other: "기타 사항 동의 서명",
};

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 오늘 + N일
const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 특정 기준일자 + N일 (근로기준법 · 금품 지급기일 14일 계산용)
const addDaysToIso = (baseIso: string, days: number): string => {
  if (!baseIso) return addDaysIso(days);
  const m = baseIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return addDaysIso(days);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtKoreanDate = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
};

// 근속기간 계산 (입사일 → 마지막 근무일)
const calcTenure = (hire: string, end: string): string => {
  if (!hire) return "-";
  const hd = new Date(hire);
  const ed = end ? new Date(end) : new Date();
  if (isNaN(hd.getTime()) || isNaN(ed.getTime())) return "-";
  let months = (ed.getFullYear() - hd.getFullYear()) * 12 + (ed.getMonth() - hd.getMonth());
  if (ed.getDate() < hd.getDate()) months -= 1;
  if (months < 0) return "-";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem}개월`;
  if (rem === 0) return `${years}년`;
  return `${years}년 ${rem}개월`;
};

const emptyForm = (): ResignationForm => {
  const submit = todayIso();
  return {
    employeeId: null,
    employeeName: "",
    employeeNo: "",
    birthDate: "",
    department: "",
    position: "",
    hireDate: "",
    lastWorkDate: addDaysIso(30),
    submitDate: submit,
    recipient: DEFAULT_RECIPIENT,
    reason: "일신상의 사유",
    reasonDetail: "",
    handoverNotes: "",
    // 근로기준법 · 퇴직 후 14일 이내 금품 지급 (마지막 근무일 + 5일 기본값 · 사용자 조정 가능)
    payoutDate: addDaysToIso(addDaysIso(30), 5),
    employerName: DEFAULT_COMPANY.employerName,
    companyName: DEFAULT_COMPANY.companyName,
  };
};

// FieldLabel · 공통 컴포넌트 사용 (../common/FieldLabel) · 2026-08-03 (#199)

// ─────────────────────────────────────────────────────────────────────────────
// 서명 모달 (오른쪽 프리뷰 서명 spot 클릭 시 오픈)
// ─────────────────────────────────────────────────────────────────────────────

const SignatureModal: React.FC<{
  open: boolean;
  slot: SignSlot | null;
  initialDataUrl: string | null;
  onSave: (dataUrl: string | null) => void;
  onClose: () => void;
}> = ({ open, slot, initialDataUrl, onSave, onClose }) => {
  const padRef = useRef<SignatureCanvasType | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 200 });
  const [empty, setEmpty] = useState(true);

  // 모달 열릴 때 · 캔버스 초기화 + 이전 서명 로드
  useEffect(() => {
    if (!open) return;
    // 초기 렌더 · resize 후에 initialDataUrl 반영
    const t = setTimeout(() => {
      if (padRef.current) {
        padRef.current.clear();
        if (initialDataUrl) {
          padRef.current.fromDataURL(initialDataUrl);
          setEmpty(false);
        } else {
          setEmpty(true);
        }
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, initialDataUrl]);

  // 반응형 캔버스 사이즈 (모달 폭 기준)
  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(280, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 200 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };
  const handleSave = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      onSave(null);
      return;
    }
    try {
      const url = padRef.current.toDataURL("image/png");
      onSave(url);
    } catch {
      onSave(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-200 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Signature size={18} weight="fill" className="text-rose-600" />
            <h3 className="text-base font-black text-slate-800">
              {slot ? SIGN_LABELS[slot] : "서명"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            title="닫기"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* 캔버스 */}
        <div className="p-4">
          <div
            ref={wrapperRef}
            className="relative bg-white border-2 border-dashed border-rose-200 rounded-lg overflow-hidden"
            style={{ height: size.h + 2 }}
          >
            <SignaturePad
              ref={(el) => { padRef.current = el; }}
              canvasProps={{
                width: size.w,
                height: size.h,
                className: "block bg-white touch-none",
                style: { width: `${size.w}px`, height: `${size.h}px` },
              }}
              penColor="#0f172a"
              onEnd={() => { if (padRef.current) setEmpty(padRef.current.isEmpty()); }}
              onBegin={() => setEmpty(false)}
            />
            {empty && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-sm font-bold select-none">
                여기에 서명해 주세요
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            * 마우스·터치로 서명하세요 · 저장 시 오른쪽 사직서에 즉시 반영됩니다.
          </p>
        </div>

        {/* 액션 */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-bold transition-colors cursor-pointer"
          >
            <Eraser size={14} />
            지우기
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-bold transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
            >
              <Check size={14} weight="bold" />
              서명 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 실시간 사직서 프리뷰 (우측)
// ─────────────────────────────────────────────────────────────────────────────

const ResignationPreview = React.forwardRef<HTMLDivElement, {
  form: ResignationForm;
  employeeSignUrl: string | null;
  payoutSignUrl: string | null;
  otherSignUrl: string | null;
  onSignClick: (slot: SignSlot) => void;
}>(({ form, employeeSignUrl, payoutSignUrl, otherSignUrl, onSignClick }, ref) => {
  const tenure = calcTenure(form.hireDate, form.lastWorkDate);
  const reasonText = form.reason === "기타" && form.reasonDetail
    ? form.reasonDetail
    : form.reason;

  // 서명 spot 재사용 · 클릭하면 모달 오픈 · 인쇄/PDF 시에는 배경만 사라지고 서명만 보이도록
  const SignSpot: React.FC<{
    slot: SignSlot;
    dataUrl: string | null;
  }> = ({ slot, dataUrl }) => (
    <button
      type="button"
      onClick={() => onSignClick(slot)}
      className="w-32 h-14 border-b-2 border-slate-800 flex items-end justify-center relative group cursor-pointer transition-colors hover:bg-rose-50/40 print:hover:bg-transparent"
      title={dataUrl ? "서명 수정" : "클릭하여 서명"}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="서명" className="max-h-14 max-w-full object-contain" />
      ) : (
        <span className="text-[11px] text-slate-400 font-bold group-hover:text-rose-500 transition-colors">
          클릭하여 서명
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-sm p-6 sm:p-10 mx-auto"
      style={{
        width: "100%",
        maxWidth: "780px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.8,
      }}
    >
      {/* 제목 */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black tracking-[0.3em] text-slate-900">
          사&nbsp;직&nbsp;서
        </h2>
      </div>

      {/* [1] 사직서 정보 */}
      <div className="mb-6">
        <div className="text-[13px] font-black text-slate-800 mb-2 bg-slate-100 px-3 py-1.5 rounded-md border-l-4 border-rose-500">
          [ 사직서 정보 ]
        </div>
        <table className="w-full text-[14px] border-collapse">
          <tbody>
            <tr className="border-t-2 border-slate-800">
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">성명</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.employeeName || "-"}</td>
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">생년월일</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{fmtKoreanDate(form.birthDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">부서 / 직급</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">
                {form.department || "-"}{form.position ? ` / ${form.position}` : ""}
              </td>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">입사일</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{fmtKoreanDate(form.hireDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">사직일<br/><span className="text-[11px] font-semibold text-slate-500">(마지막 근무일)</span></th>
              <td className="py-2 px-3 text-slate-800 font-black border-b border-slate-200">{fmtKoreanDate(form.lastWorkDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">근속기간</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{tenure}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">사직서 제출일</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{fmtKoreanDate(form.submitDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">수신</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.recipient || "-"} 귀하</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b-2 border-slate-800 pl-3 align-top">사유</th>
              <td className="py-2 px-3 text-slate-800 font-semibold border-b-2 border-slate-800 leading-7" colSpan={3}>
                상기자는 <span className="font-black">{reasonText || "일신상의 사유"}</span>(으)로 사직하고자 하오니 처리하여 주시기 바랍니다.
              </td>
            </tr>
          </tbody>
        </table>

        {/* 사유 상세 (기타 사유가 아닌 경우에만 별도 표시) */}
        {form.reasonDetail && form.reason !== "기타" && (
          <div className="mt-3 pl-3 text-[13px] text-slate-700 whitespace-pre-wrap leading-7">
            <span className="font-bold text-slate-600">· 상세: </span>
            {form.reasonDetail}
          </div>
        )}

        {/* 인수인계 사항 */}
        {form.handoverNotes && (
          <div className="mt-3 pl-3 text-[13px] text-slate-700 whitespace-pre-wrap leading-7">
            <span className="font-bold text-slate-600">· 인수인계: </span>
            {form.handoverNotes}
          </div>
        )}
      </div>

      {/* [2] 임금·퇴직금 등 금품 지급기일 동의 */}
      <div className="mb-6">
        <div className="text-[13px] font-black text-slate-800 mb-2 bg-slate-100 px-3 py-1.5 rounded-md border-l-4 border-rose-500">
          [ 임금, 퇴직금 등 금품 지급기일 동의 ]
        </div>
        <div className="text-[13px] text-slate-800 leading-7 px-2 py-2">
          상기 본인은 퇴직일 현재 이미 발생한 임금, 퇴직금, 그 밖의 일체의 금품을{" "}
          <span className="font-black">「{fmtKoreanDate(form.payoutDate) || "지급일"}」</span>에 지급받는 것에 동의합니다.
        </div>
        <div className="flex items-center justify-end gap-3 text-[14px] text-slate-800 mt-2 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-black">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="payout" dataUrl={payoutSignUrl} />
        </div>
      </div>

      {/* [3] 기타 사항 동의 */}
      <div className="mb-6">
        <div className="text-[13px] font-black text-slate-800 mb-2 bg-slate-100 px-3 py-1.5 rounded-md border-l-4 border-rose-500">
          [ 기타 사항 동의 ]
        </div>
        <ol className="list-decimal pl-6 text-[13px] text-slate-800 leading-7 space-y-2">
          <li>
            상기 본인은 귀사와 근로관계 중 근로에 대한 임금(연장, 야간, 휴일), 퇴직금(발생 시),
            연차미사용수당(발생 시), 휴일 및 휴게시간 등 노동관계법령상 권리를 부여 및 지급 받았음을
            확인하며, 추후 노동관계법령상 권리에 관하여 민사, 형사, 행정상 이의를 제기하지 않을 것을
            동의합니다.
          </li>
          <li>
            귀사와의 근로관계 중 알게된 영업비밀, 고객정보 및 경영상 관련 정보 일체를 누설하지 않을 것을
            동의합니다.
          </li>
        </ol>
        <div className="flex items-center justify-end gap-3 text-[14px] text-slate-800 mt-3 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-black">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="other" dataUrl={otherSignUrl} />
        </div>
      </div>

      {/* 작성일 · 신청인 서명 */}
      <div className="mt-10">
        <div className="text-center text-[15px] text-slate-800 font-semibold mb-6">
          {fmtKoreanDate(form.submitDate || todayIso())}
        </div>

        <div className="flex flex-col items-end gap-3 pr-2">
          <div className="flex items-center gap-3 text-[14px] text-slate-800">
            <span className="font-semibold">신청인</span>
            <span className="font-black">{form.employeeName || "-"}</span>
            <span className="font-semibold">(서명)</span>
            <SignSpot slot="employee" dataUrl={employeeSignUrl} />
          </div>
        </div>

        {/* 수신 · 대표자 */}
        <div className="mt-8 pt-4 border-t-2 border-slate-800 text-center">
          <div className="text-[15px] font-black text-slate-800 tracking-wider">
            {form.recipient || `${form.companyName} 대표`} <span className="ml-1">귀하</span>
          </div>
        </div>
      </div>
    </div>
  );
});
ResignationPreview.displayName = "ResignationPreview";

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────

const ResignationWriterPage: React.FC<ResignationWriterPageProps> = ({
  authSession, onBack, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();

  const [form, setForm] = useState<ResignationForm>(() => emptyForm());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [employeeSignUrl, setEmployeeSignUrl] = useState<string | null>(null);
  const [payoutSignUrl, setPayoutSignUrl] = useState<string | null>(null);
  const [otherSignUrl, setOtherSignUrl] = useState<string | null>(null);

  // 서명 모달 state
  const [signModalSlot, setSignModalSlot] = useState<SignSlot | null>(null);

  // ── 직원 목록 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1;
        const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.employees) ? data.employees : [];
        setEmployees(list);
      } catch (err: any) {
        if (!cancelled) setEmpError(err?.message ?? "직원 목록 불러오기 실패");
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 세션 자동 채움 (최초 마운트 · 직원 목록 로드 완료 시) ────────────
  useEffect(() => {
    if (form.employeeId != null) return; // 이미 채워짐
    const sessId = authSession?.employeeId;
    if (!sessId) return;
    const me = employees.find(e => e.id === sessId);
    if (!me) return;
    onSelectEmployee(String(me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, authSession?.employeeId]);

  // ── 필드 업데이트 ────────────────────────────────────────────────────
  const upd = useCallback(<K extends keyof ResignationForm>(key: K, val: ResignationForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  // 사직일 변경 시 · 지급일 미변경(자동) 상태면 재계산 (근로기준법 · 14일 이내 관례)
  // → 사용자가 직접 조정한 경우엔 그대로 유지
  useEffect(() => {
    // 별도 자동추적 하지 않음 · 사용자가 자유롭게 조정
  }, [form.lastWorkDate]);

  // ── 직원 선택 · 자동 채움 ─────────────────────────────────────────────
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) {
      upd("employeeId", null);
      return;
    }
    const empId = Number(empIdRaw);
    const emp = employees.find(e => e.id === empId);
    if (!emp) { upd("employeeId", empId); return; }
    setForm(prev => ({
      ...prev,
      employeeId: emp.id,
      employeeName: emp.name || prev.employeeName,
      employeeNo: String(emp.id ?? prev.employeeNo),
      department: (emp as any).workplace || prev.department, // "매장"/"창고"
      position: emp.position || prev.position,               // "약사"/"매장"/"창고"/...
      hireDate: (emp as any).hire_date || (emp as any).hireDate || prev.hireDate,
      birthDate: (emp as any).birth_date || (emp as any).birthDate || prev.birthDate,
    }));
  };

  const handleReset = async () => {
    if (!await confirm({ message: "입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?", danger: true })) return;
    setForm(emptyForm());
    setEmployeeSignUrl(null);
    setPayoutSignUrl(null);
    setOtherSignUrl(null);
    setNotice(null);
  };

  // ── 서명 모달 open/save ───────────────────────────────────────────────
  const currentSignUrl = signModalSlot === "employee" ? employeeSignUrl
    : signModalSlot === "payout" ? payoutSignUrl
    : signModalSlot === "other" ? otherSignUrl
    : null;

  const handleSignSave = (dataUrl: string | null) => {
    if (signModalSlot === "employee") setEmployeeSignUrl(dataUrl);
    else if (signModalSlot === "payout") setPayoutSignUrl(dataUrl);
    else if (signModalSlot === "other") setOtherSignUrl(dataUrl);
    setSignModalSlot(null);
  };

  // ── PDF 다운로드 (A4 1페이지 fit) ─────────────────────────────────────
  // 전략:
  //   1) html2canvas 로 프리뷰 캡처
  //   2) A4 (210 x 297mm) 여백 (10mm 상하좌우)
  //   3) 이미지 종횡비 유지하며 · 가로/세로 중 초과되는 축에 맞춰 스케일
  //      → 가로에 맞춘 결과 세로가 페이지 초과하면 · 세로 기준으로 재계산
  const generatePdfBlob = async (): Promise<{ blob: Blob } | null> => {
    const node = previewRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();   // 210
    const pdfH = pdf.internal.pageSize.getHeight();  // 297

    // 여백 (mm)
    const margin = 8;
    const maxW = pdfW - margin * 2;
    const maxH = pdfH - margin * 2;

    // 캔버스 aspect ratio 유지하며 · maxW/maxH 안에 fit (contain)
    const ratio = canvas.width / canvas.height;
    let imgW = maxW;
    let imgH = imgW / ratio;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH * ratio;
    }
    // 중앙 배치
    const x = (pdfW - imgW) / 2;
    const y = (pdfH - imgH) / 2;
    pdf.addImage(imgData, "PNG", x, y, imgW, imgH, undefined, "FAST");

    const blob = pdf.output("blob");
    return { blob };
  };

  const handleDownloadPdf = async () => {
    setNotice(null);
    setGenerating(true);
    try {
      const out = await generatePdfBlob();
      if (!out) throw new Error("사직서 프리뷰를 찾을 수 없습니다.");
      const safeName = (form.employeeName || "근로자").replace(/[\\/:*?"<>|]/g, "_");
      const safeDate = (form.lastWorkDate || todayIso()).replace(/-/g, "");
      // jsPDF save 대신 · 브라우저 다운로드 (blob URL)
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `사직서_${safeName}_${safeDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // ── 사직서 제출 (DB + 관리자 알림) ────────────────────────────────────
  const handleSubmit = async () => {
    setNotice(null);

    // 검증
    if (!form.employeeId || !form.employeeName.trim()) {
      setNotice({ tone: "err", text: "성명을 선택하거나 입력하세요." });
      return;
    }
    if (!form.lastWorkDate) {
      setNotice({ tone: "err", text: "사직 희망일을 입력하세요." });
      return;
    }
    if (!form.reason.trim()) {
      setNotice({ tone: "err", text: "퇴사 사유를 선택하세요." });
      return;
    }
    const emptySign = !employeeSignUrl;
    if (emptySign) {
      if (!await confirm({ message: "신청인 서명이 비어있습니다. 서명 없이 제출하시겠습니까?" })) return;
    }

    // 서명 dataURL (in-DB 저장용 · 신청인 서명)
    const signatureDataUrl: string | null = employeeSignUrl;

    setSubmitting(true);
    try {
      const res = await fetch("/api/resignations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: form.employeeId,
          employee_name: form.employeeName,
          position: form.position || null,
          hire_date: form.hireDate || null,
          last_work_date: form.lastWorkDate,
          reason: form.reason,
          reason_detail: form.reasonDetail || null,
          handover_notes: form.handoverNotes || null,
          signature_data_url: signatureDataUrl,
          pdf_url: null, // MVP · 별도 스토리지 업로드는 후속 개선
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `서버 오류 (${res.status})`);
      }
      setNotice({ tone: "ok", text: "사직서가 제출되었습니다. 관리자에게 알림이 전송되었습니다." });
      // 승인대기 배지 즉시 갱신
      window.dispatchEvent(new CustomEvent("approval-count-updated"));
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "사직서 제출에 실패했습니다." });
    } finally {
      setSubmitting(false);
    }
  };

  // 오늘 이후만 선택 가능
  const minLastWorkDate = todayIso();

  const _tenure = useMemo(
    () => calcTenure(form.hireDate, form.lastWorkDate),
    [form.hireDate, form.lastWorkDate]
  );

  // ── 렌더 ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <SignOut size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">사직서 작성</h1>
              <p className="text-xs text-slate-500 mt-1">
                좌측에서 조건을 입력하면 우측에 표준 사직서가 실시간 생성됩니다. 서명 spot 클릭 후 [사직서 제출]하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
              title="초기화"
            >
              <ArrowsClockwise size={14} />
              <span className="hidden sm:inline">초기화</span>
            </button>
          </div>
        </div>

        {/* 안내 배너 */}
        {notice && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
              notice.tone === "ok"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            {notice.tone === "ok" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* 좌우 split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── 좌측: 조건 입력 폼 ─────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-3 order-2 lg:order-1">
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
              <ClipboardText size={15} weight="fill" className="text-rose-600" />
              <h2 className="text-[13px] font-black text-slate-800">사직서 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<User size={12} weight="fill" className="text-slate-400" />} required>
                근로자 정보
              </FieldLabel>
              {empError && <div className="text-[12px] text-rose-600">{empError}</div>}
              {/* 성명 + 사번 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={form.employeeName}
                    onChange={(e) => {
                      const val = e.target.value;
                      upd("employeeName", val);
                      setEmpSearchOpen(true);
                      if (form.employeeId != null) upd("employeeId", null);
                    }}
                    onFocus={() => setEmpSearchOpen(true)}
                    onBlur={() => setTimeout(() => setEmpSearchOpen(false), 200)}
                    placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 → 검색"}
                    autoComplete="off"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                  />
                  {empSearchOpen && form.employeeName.trim() && (() => {
                    const q = form.employeeName.trim().toLowerCase();
                    const matches = employees
                      .filter(e => (e.name ?? "").toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) return (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-[12px] text-slate-400 text-center">
                        일치하는 직원 없음 · 직접 입력 가능
                      </div>
                    );
                    return (
                      <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {matches.map(e => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                onSelectEmployee(String(e.id));
                                setEmpSearchOpen(false);
                              }}
                              className="w-full text-left px-2.5 py-1.5 hover:bg-rose-50 transition-colors flex items-center gap-2"
                            >
                              <span className="text-[13px] font-bold text-slate-800">{e.name}</span>
                              {e.position && (
                                <span className="text-[11px] text-slate-500">{e.position}</span>
                              )}
                              {e.phone && (
                                <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                <input
                  type="text"
                  value={form.employeeNo}
                  onChange={(e) => upd("employeeNo", e.target.value)}
                  placeholder="사번 (자동)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 부서 + 직급 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => upd("department", e.target.value)}
                  placeholder="부서 (예: 매장·창고)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => upd("position", e.target.value)}
                  placeholder="직급 (예: 약사·사원)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 생년월일 + 입사일 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                    <Cake size={11} weight="fill" />생년월일
                  </div>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => upd("birthDate", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">입사일</div>
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) => upd("hireDate", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
                  />
                </div>
              </div>
              {/* 근속기간 (자동) */}
              <div>
                <div className="text-[11px] text-slate-400 font-semibold mb-0.5">근속기간 (자동)</div>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-700 font-semibold">
                  {_tenure}
                </div>
              </div>
            </div>

            {/* 사직 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />} required>
                사직일 (마지막 근무일)
              </FieldLabel>
              <input
                type="date"
                value={form.lastWorkDate}
                min={minLastWorkDate}
                onChange={(e) => upd("lastWorkDate", e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
              />
              <p className="text-[11px] text-slate-400 leading-snug">
                * 통상 최소 30일 전 통보 관례 · 회사와 협의하여 조정 가능
              </p>
            </div>

            {/* 제출일 + 수신 */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />}>
                  사직서 제출일
                </FieldLabel>
                <input
                  type="date"
                  value={form.submitDate}
                  onChange={(e) => upd("submitDate", e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
                />
              </div>
              <div>
                <FieldLabel icon={<Buildings size={12} weight="fill" className="text-slate-400" />}>
                  수신
                </FieldLabel>
                <input
                  type="text"
                  value={form.recipient}
                  onChange={(e) => upd("recipient", e.target.value)}
                  placeholder="예: 코스트팜(Costpharm) 대표"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
            </div>

            {/* 퇴사 사유 (2026-08-05 · 4가지) */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>퇴사 사유</FieldLabel>
              <div className="grid grid-cols-4 gap-1">
                {REASON_OPTIONS.map(r => {
                  const active = form.reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => upd("reason", r)}
                      className={`px-1.5 py-1.5 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                        active
                          ? "bg-rose-500 text-white border-rose-600"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사유 상세 (textarea) */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>
                {form.reason === "기타" ? "기타 사유 (자유 입력)" : "사유 상세 (선택)"}
              </FieldLabel>
              <textarea
                value={form.reasonDetail}
                onChange={(e) => upd("reasonDetail", e.target.value)}
                rows={3}
                placeholder={form.reason === "기타"
                  ? "기타 사유를 직접 입력하세요 (본문에 반영됨)"
                  : "사유에 대한 부연 설명이 필요하면 입력하세요"}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 인수인계 사항 */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>
                인수인계 사항 (선택)
              </FieldLabel>
              <textarea
                value={form.handoverNotes}
                onChange={(e) => upd("handoverNotes", e.target.value)}
                rows={3}
                placeholder="담당 업무 · 인수인계할 파일·연락처·주요 진행상황 등"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 금품 지급기일 */}
            <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
              <FieldLabel icon={<Money size={12} weight="fill" className="text-slate-400" />}>
                금품 지급기일 (임금·퇴직금 등)
              </FieldLabel>
              <input
                type="date"
                value={form.payoutDate}
                onChange={(e) => upd("payoutDate", e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
              />
              <p className="text-[11px] text-slate-400 leading-snug">
                * 근로기준법 § 36 · 퇴직 후 14일 이내 지급 원칙 · 당사자 합의로 연장 가능
              </p>
            </div>

            {/* 기타 사항 동의 안내 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<ShieldCheck size={12} weight="fill" className="text-slate-400" />}>
                기타 사항 동의 (권리 확인 · 영업비밀 유지)
              </FieldLabel>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-600 leading-6">
                <ol className="list-decimal pl-4 space-y-1">
                  <li>노동관계법령상 권리(임금·퇴직금·연차미사용수당·휴게시간 등) 지급 확인 및 이의 미제기</li>
                  <li>재직 중 알게된 영업비밀·고객정보·경영정보 누설 금지</li>
                </ol>
              </div>
            </div>

            {/* 회사 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Buildings size={12} weight="fill" className="text-slate-400" />}>
                회사 정보
              </FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => upd("companyName", e.target.value)}
                  placeholder="회사명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
                <input
                  type="text"
                  value={form.employerName}
                  onChange={(e) => upd("employerName", e.target.value)}
                  placeholder="대표자명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
            </div>

            {/* 서명 안내 · 사직서 제출 */}
            <div className="border-t border-slate-100 pt-2.5">
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[12px] text-rose-700 leading-6 mb-3 flex items-start gap-2">
                <Signature size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-black">서명 안내</span> · 우측 사직서 미리보기의{" "}
                  <span className="font-black">서명 spot 3곳</span>(신청인·금품 지급기일·기타 사항)을 클릭하여 서명하세요.
                </div>
              </div>

              {/* 사직서 제출 · PDF 다운은 오른쪽으로 이동 */}
              <div className="mt-1 flex flex-col sm:flex-row items-stretch sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || generating}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
                  title="사직서 제출 · 관리자 알림"
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                  <span>{submitting ? "제출 중..." : "사직서 제출"}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                * 제출 시 · 관리자에게 알림이 전송되며 · 승인 시 · 자동으로 퇴사일이 반영됩니다.
              </p>
            </div>
          </section>

          {/* ── 우측: 실시간 프리뷰 ─────────────────────────────────── */}
          <section className="order-1 lg:order-2 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 pb-1">
              <SignOut size={16} weight="fill" className="text-rose-600" />
              <h2 className="text-sm font-black text-slate-800">사직서 미리보기</h2>
              <span className="text-[11px] text-slate-400 font-semibold ml-1">
                (서명 spot 클릭 · 우측 화면 그대로 A4 1페이지 PDF)
              </span>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 sm:p-4">
              <ResignationPreview
                ref={previewRef}
                form={form}
                employeeSignUrl={employeeSignUrl}
                payoutSignUrl={payoutSignUrl}
                otherSignUrl={otherSignUrl}
                onSignClick={(slot) => setSignModalSlot(slot)}
              />
            </div>

            {/* PDF 다운로드 버튼 · 프리뷰 아래 */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={generating || submitting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-black shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                title="PDF 다운로드 (A4 1페이지)"
              >
                <DownloadSimple size={16} weight="bold" />
                <span>{generating ? "생성 중..." : "PDF 다운 (A4 1페이지)"}</span>
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* 서명 모달 */}
      <SignatureModal
        open={signModalSlot !== null}
        slot={signModalSlot}
        initialDataUrl={currentSignUrl}
        onSave={handleSignSave}
        onClose={() => setSignModalSlot(null)}
      />
    </div>
  );
};

export default ResignationWriterPage;
