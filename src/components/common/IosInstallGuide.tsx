// 2026-08-19 · iOS 웹앱 카메라 문제 · 재설치 안내 · 시각 가이드
//   · iOS SFSafariViewController · standalone=false + safari=false + inApp=false
//   · mediaDevices 봉인 (Apple 정책) · 정식 PWA 로 재설치 필요
//   · Safari 직접 열기 + 홈 화면에 추가 · 시각적 단계 가이드
//   · WebKit Bug 185448 · 오랜된 이슈 · iOS 17.4+ PWA 로만 우회 가능

import { useState } from "react";
import { X, Share, Plus, Compass, RefreshCw } from "lucide-react";

interface IosInstallGuideProps {
  onClose?: () => void;
  /** 진단 정보 (진단 오버레이에 표시) */
  diagnostic?: {
    url: string;
    mediaDevices: boolean;
    getUserMedia: boolean;
    standalone: boolean;
    inApp: boolean;
    ua: string;
  };
}

export function IosInstallGuide({ onClose, diagnostic }: IosInstallGuideProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Safari 열기 시도 (일부 컨텍스트에서만 작동 · best-effort)
  const openInSafari = () => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "/";
    try {
      window.location.href = `x-safari-https://${host}${path}`;
    } catch { /* silent · fallback X */ }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-zinc-950 overflow-y-auto">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 ring-1 ring-amber-400/40 flex items-center justify-center">
            <RefreshCw size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-white text-[15px] font-bold tracking-tight">카메라 활성화 필요</div>
            <div className="text-white/60 text-[11px]">iOS 정식 웹앱 재설치</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 원인 설명 */}
      <div className="max-w-md mx-auto px-5 py-5">
        <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/30 p-4">
          <div className="text-amber-200 text-[13px] font-semibold mb-1.5">진단 결과</div>
          <p className="text-white/90 text-[14px] leading-relaxed">
            현재 홈화면 아이콘은 <b className="text-amber-200">정식 웹앱이 아닌 임시 바로가기</b>로 저장되어 있습니다.
            iOS 정책상 이 컨텍스트에서는 카메라 API 접근이 불가능합니다.
          </p>
          <p className="text-white/70 text-[13px] mt-2 leading-relaxed">
            아래 3단계로 <b className="text-white">정식 웹앱</b>으로 재설치하면
            <b className="text-emerald-300"> 웹앱 안에서 카메라 정상 작동</b>합니다.
          </p>
        </div>

        {/* 진행 인디케이터 */}
        <div className="flex items-center justify-center gap-2 mt-6 mb-4">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setStep(n as 1 | 2 | 3)}
              className={`w-8 h-8 rounded-full font-bold text-[13px] transition cursor-pointer ${
                step === n
                  ? "bg-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.4)]"
                  : "bg-white/10 text-white/50 hover:bg-white/15"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Step 1 · 이전 아이콘 삭제 */}
        {step === 1 && (
          <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-red-500 text-white font-bold text-[13px] flex items-center justify-center">1</span>
              <h3 className="text-white text-[16px] font-bold tracking-tight">이전 홈화면 아이콘 삭제</h3>
            </div>
            <ol className="text-white/80 text-[14px] leading-relaxed space-y-2.5 pl-1">
              <li>① 홈화면의 <b className="text-white">현재 웹앱 아이콘</b> 을 <b className="text-white">길게 눌러</b> 주세요</li>
              <li>② 팝업 메뉴에서 <b className="text-red-300">"앱 제거"</b> → <b className="text-red-300">"홈 화면에서 제거"</b> 탭</li>
              <li>③ <span className="text-amber-200">중요</span> · 그냥 "홈 화면에서 이동" 이 아닌 <b className="text-white">완전 삭제</b> 필요</li>
            </ol>
            <button
              onClick={() => setStep(2)}
              className="mt-5 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[14px] font-bold transition cursor-pointer"
            >
              삭제 완료 · 다음 →
            </button>
          </div>
        )}

        {/* Step 2 · Safari 로 새로 접속 */}
        {step === 2 && (
          <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-sky-500 text-white font-bold text-[13px] flex items-center justify-center">2</span>
              <h3 className="text-white text-[16px] font-bold tracking-tight">Safari 앱 직접 열기</h3>
            </div>
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-sky-500/10 ring-1 ring-sky-400/30">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg">
                <Compass size={26} className="text-white" strokeWidth={2.2} />
              </div>
              <div className="flex-1">
                <div className="text-white text-[14px] font-bold">Safari 앱</div>
                <div className="text-white/60 text-[12px]">파란색 나침반 아이콘</div>
              </div>
            </div>
            <ol className="text-white/80 text-[14px] leading-relaxed space-y-2.5 pl-1">
              <li>① iPhone 홈화면에서 <b className="text-white">Safari 앱</b> 을 여세요</li>
              <li>② 주소창에 아래 주소를 정확히 입력:</li>
              <li className="pl-4">
                <code className="inline-block px-3 py-1.5 rounded-md bg-black/50 text-emerald-300 font-mono text-[13px] font-bold">
                  osanmega.onrender.com
                </code>
                <button
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText("https://osanmega.onrender.com").catch(() => {});
                    }
                  }}
                  className="ml-2 text-[12px] text-sky-300 hover:text-sky-200 underline"
                >
                  주소 복사
                </button>
              </li>
              <li>③ 사이트가 로드되면 다음 단계로</li>
            </ol>
            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                onClick={openInSafari}
                className="w-full py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[13px] font-semibold ring-1 ring-sky-400/40 transition cursor-pointer mb-2"
              >
                Safari 로 자동 열기 시도 (베타)
              </button>
              <p className="text-white/50 text-[11px] text-center">위 버튼이 작동 안 하면 · 수동으로 Safari 여세요</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold transition cursor-pointer"
              >← 이전</button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[14px] font-bold transition cursor-pointer"
              >
                Safari 접속 완료 · 다음 →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 · 홈 화면에 추가 */}
        {step === 3 && (
          <div className="rounded-2xl bg-zinc-900 ring-1 ring-white/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500 text-white font-bold text-[13px] flex items-center justify-center">3</span>
              <h3 className="text-white text-[16px] font-bold tracking-tight">정식 웹앱으로 등록</h3>
            </div>
            <div className="text-white/70 text-[12px] mb-3">Safari 안에서:</div>
            <ol className="text-white/80 text-[14px] leading-relaxed space-y-3 pl-1">
              <li className="flex items-start gap-2">
                <span className="text-emerald-300 font-bold shrink-0">①</span>
                <span>Safari 하단 중앙의 <b className="text-white">공유 버튼</b> 탭
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-sky-500/20 ml-1.5 align-middle">
                    <Share size={14} className="text-sky-300" />
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-300 font-bold shrink-0">②</span>
                <span>공유 시트를 스크롤 · <b className="text-white">"홈 화면에 추가"</b> 탭
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/20 ml-1.5 align-middle">
                    <Plus size={14} className="text-emerald-300" />
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-300 font-bold shrink-0">③</span>
                <span>이름 확인 후 <b className="text-white">"추가"</b> 탭 (우측 상단)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-300 font-bold shrink-0">④</span>
                <span>홈화면에 새 아이콘 생성 · 이번엔 <b className="text-emerald-300">정식 웹앱</b>으로 등록</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-300 font-bold shrink-0">⑤</span>
                <span>새 아이콘 탭 → 바코드 스캔 → <b className="text-white">카메라 팝업 정상 뜸</b></span>
              </li>
            </ol>
            <div className="mt-5 p-3 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-400/30">
              <div className="text-emerald-300 text-[12px] font-bold mb-1">완료 후 · 웹앱 안에서 카메라 정상 작동</div>
              <div className="text-white/70 text-[12px] leading-relaxed">
                Safari 이동 없이 · 네이티브 앱처럼 · 웹앱 안에서 바로 스캔
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold transition cursor-pointer"
              >← 이전</button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[14px] font-bold transition cursor-pointer"
                >
                  완료
                </button>
              )}
            </div>
          </div>
        )}

        {/* 참고 정보 */}
        {diagnostic && (
          <details className="mt-6 rounded-xl bg-zinc-900/70 ring-1 ring-white/5 overflow-hidden">
            <summary className="px-4 py-2.5 text-white/60 text-[12px] font-semibold cursor-pointer hover:bg-white/5 transition">
              기술 진단 정보 (탭)
            </summary>
            <div className="px-4 py-3 border-t border-white/5 font-mono text-[11px] text-white/80 space-y-1 break-all">
              <div><span className="text-white/50">URL:</span> {diagnostic.url}</div>
              <div><span className="text-white/50">mediaDevices:</span> <span className={diagnostic.mediaDevices ? "text-emerald-300" : "text-rose-300"}>{diagnostic.mediaDevices ? "yes" : "NO"}</span></div>
              <div><span className="text-white/50">getUserMedia:</span> <span className={diagnostic.getUserMedia ? "text-emerald-300" : "text-rose-300"}>{diagnostic.getUserMedia ? "yes" : "NO"}</span></div>
              <div><span className="text-white/50">standalone:</span> {String(diagnostic.standalone)}</div>
              <div><span className="text-white/50">inApp:</span> {String(diagnostic.inApp)}</div>
              <div><span className="text-white/50">UA:</span> {diagnostic.ua}</div>
              <div className="pt-2 border-t border-white/10 mt-2 text-white/60">
                <b className="text-amber-200">WebKit Bug 185448</b> · iOS 웹앱 (홈 화면 바로가기) 에서 getUserMedia 봉인 · Apple 정책 · 2018년~ · 정식 PWA (standalone=true) 로만 우회 가능
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default IosInstallGuide;
