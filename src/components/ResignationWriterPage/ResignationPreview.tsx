// src/components/ResignationWriterPage/ResignationPreview.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · 실시간 사직서 프리뷰 이관
// 프레임워크: AccentBar
import React from "react";
import { AccentBar } from "../common/AccentBar";
import type { ResignationForm, SignSlot } from "./types";
import { calcTenure, fmtKoreanDate, todayIso } from "./utils";

export const ResignationPreview = React.forwardRef<HTMLDivElement, {
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
      className="w-32 h-14 border-b-2 border-zinc-800 flex items-end justify-center relative group cursor-pointer transition-colors hover:bg-brand-tint/40 print:hover:bg-transparent"
      title={dataUrl ? "서명 수정" : "클릭하여 서명"}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="서명" className="max-h-14 max-w-full object-contain" />
      ) : (
        <span className="text-[17px] text-zinc-400 font-bold group-hover:text-brand transition-colors">
          클릭하여 서명
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={ref}
      className="bg-white text-zinc-900 border border-line rounded-xl shadow-sm p-6 sm:p-10 mx-auto"
      style={{
        width: "100%",
        maxWidth: "780px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.8,
      }}
    >
      {/* 제목 */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold tracking-[0.3em] text-ink">
          사&nbsp;직&nbsp;서
        </h2>
      </div>

      {/* [1] 사직서 정보 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">사직서 정보</span>
        </div>
        <table className="w-full text-[18px] border-collapse">
          <tbody>
            <tr className="border-t-2 border-zinc-800">
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">성명</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{form.employeeName || "-"}</td>
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">생년월일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.birthDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">부서 / 직급</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">
                {form.department || "-"}{form.position ? ` / ${form.position}` : ""}
              </td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">입사일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.hireDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">사직일<br/><span className="text-[17px] font-semibold text-ink-soft">(마지막 근무일)</span></th>
              <td className="py-2 px-3 text-ink font-bold border-b border-line">{fmtKoreanDate(form.lastWorkDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">근속기간</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{tenure}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">사직서 제출일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.submitDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">수신</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{form.recipient || "-"} 귀하</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b-2 border-zinc-800 pl-3 align-top">사유</th>
              <td className="py-2 px-3 text-ink font-semibold border-b-2 border-zinc-800 leading-7" colSpan={3}>
                상기자는 <span className="font-bold">{reasonText || "일신상의 사유"}</span>(으)로 사직하고자 하오니 처리하여 주시기 바랍니다.
              </td>
            </tr>
          </tbody>
        </table>

        {/* 사유 상세 (기타 사유가 아닌 경우에만 별도 표시) */}
        {form.reasonDetail && form.reason !== "기타" && (
          <div className="mt-3 pl-3 text-[17px] text-ink-soft whitespace-pre-wrap leading-7">
            <span className="font-bold text-ink-soft">· 상세: </span>
            {form.reasonDetail}
          </div>
        )}

        {/* 인수인계 사항 */}
        {form.handoverNotes && (
          <div className="mt-3 pl-3 text-[17px] text-ink-soft whitespace-pre-wrap leading-7">
            <span className="font-bold text-ink-soft">· 인수인계: </span>
            {form.handoverNotes}
          </div>
        )}
      </div>

      {/* [2] 임금·퇴직금 등 금품 지급기일 동의 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">임금, 퇴직금 등 금품 지급기일 동의</span>
        </div>
        <div className="text-[17px] text-ink leading-7 px-2 py-2">
          상기 본인은 퇴직일 현재 이미 발생한 임금, 퇴직금, 그 밖의 일체의 금품을{" "}
          <span className="font-bold">「{fmtKoreanDate(form.payoutDate) || "지급일"}」</span>에 지급받는 것에 동의합니다.
        </div>
        <div className="flex items-center justify-end gap-3 text-[18px] text-ink mt-2 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-bold">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="payout" dataUrl={payoutSignUrl} />
        </div>
      </div>

      {/* [3] 기타 사항 동의 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">기타 사항 동의</span>
        </div>
        <ol className="list-decimal pl-6 text-[17px] text-ink leading-7 space-y-2">
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
        <div className="flex items-center justify-end gap-3 text-[18px] text-ink mt-3 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-bold">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="other" dataUrl={otherSignUrl} />
        </div>
      </div>

      {/* 작성일 · 신청인 서명 */}
      <div className="mt-10">
        <div className="text-center text-[17px] text-ink font-semibold mb-6">
          {fmtKoreanDate(form.submitDate || todayIso())}
        </div>

        <div className="flex flex-col items-end gap-3 pr-2">
          <div className="flex items-center gap-3 text-[18px] text-ink">
            <span className="font-semibold">신청인</span>
            <span className="font-bold">{form.employeeName || "-"}</span>
            <span className="font-semibold">(서명)</span>
            <SignSpot slot="employee" dataUrl={employeeSignUrl} />
          </div>
        </div>

        {/* 수신 · 대표자 */}
        <div className="mt-8 pt-4 border-t-2 border-zinc-800 text-center">
          <div className="text-[17px] font-bold text-ink tracking-wider">
            {form.recipient || `${form.companyName} 대표`} <span className="ml-1">귀하</span>
          </div>
        </div>
      </div>
    </div>
  );
});
ResignationPreview.displayName = "ResignationPreview";
