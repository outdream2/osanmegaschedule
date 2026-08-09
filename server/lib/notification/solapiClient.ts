// server/lib/notification/solapiClient.ts
// 2026-08-09 · SolAPI 카카오 알림톡 발송 클라이언트 (사용자 요청 · 옵션 1)
//
// 사용자 상태:
//   · 아직 사업자등록번호 없음 · 나중에 발급 후 입력만 하면 되도록 스켈레톤만
//   · 실제 발송은 credentials 설정 후 활성화됨
//
// 필요한 환경변수 (사업자 인증 후 입력):
//   SOLAPI_API_KEY       · SolAPI 콘솔 발급
//   SOLAPI_API_SECRET    · SolAPI 콘솔 발급
//   SOLAPI_SENDER_PHONE  · 발신자 전화번호 (사업자 등록된 번호)
//   SOLAPI_KAKAO_PFID    · 카카오톡 채널 프로필 ID
//   SOLAPI_KAKAO_TEMPLATE_ORDER  · 발주 알림톡 템플릿 ID (심사 통과 후)
//
// SolAPI 설정 절차:
//   1. https://solapi.com 회원가입 · 사업자 인증 (사업자등록증 필요 · 1~3영업일)
//   2. 카카오 채널 개설 (kakaobusiness.com · 무료 · 30분)
//   3. SolAPI 콘솔 · 카카오 채널 연동 (PFID 발급)
//   4. 알림톡 템플릿 등록 · 카카오 심사 (2~3영업일)
//   5. API Key/Secret 발급 · 위 환경변수 설정
//   6. 10,000원 충전 · 발송 테스트

import type { Request, Response } from "express";

/** SolAPI 설정 상태 · 활성화 여부 · UI 표시용 */
export function getSolApiStatus(): {
  configured: boolean;
  missing: string[];
} {
  const required = [
    "SOLAPI_API_KEY",
    "SOLAPI_API_SECRET",
    "SOLAPI_SENDER_PHONE",
    "SOLAPI_KAKAO_PFID",
  ];
  const missing = required.filter(k => !process.env[k]);
  return {
    configured: missing.length === 0,
    missing,
  };
}

export interface AlimtalkPayload {
  /** 수신자 전화번호 (010-0000-0000 or 01000000000) */
  to: string;
  /** 템플릿 ID (환경변수 SOLAPI_KAKAO_TEMPLATE_ORDER 등에서) */
  templateId: string;
  /** 템플릿 변수 · #{키} = 값 매핑 */
  variables?: Record<string, string>;
  /** 알림톡 실패 시 SMS 대체 발송 여부 (기본 true) */
  fallbackToSms?: boolean;
  /** 대체 SMS 본문 (fallbackToSms=true 시 · 없으면 템플릿 fallback) */
  smsText?: string;
}

/**
 * 카카오 알림톡 발송
 *   · SolAPI Node.js SDK 사용
 *   · credentials 미설정 시 · 예외 throw (호출측에서 handle)
 *   · 성공: { groupId, messageId, statusCode, statusMessage }
 *   · 실패: throw Error
 */
export async function sendAlimtalk(payload: AlimtalkPayload): Promise<any> {
  const status = getSolApiStatus();
  if (!status.configured) {
    throw new Error(`SolAPI 미설정 · 환경변수 필요: ${status.missing.join(", ")}`);
  }

  // 지연 import · credentials 없을 때 solapi 모듈 로드 실패 방지
  const { SolapiMessageService } = await import("solapi");
  const svc = new SolapiMessageService(
    process.env.SOLAPI_API_KEY!,
    process.env.SOLAPI_API_SECRET!
  );

  const result = await svc.send({
    to: payload.to.replace(/[^0-9]/g, ""),
    from: process.env.SOLAPI_SENDER_PHONE!.replace(/[^0-9]/g, ""),
    kakaoOptions: {
      pfId: process.env.SOLAPI_KAKAO_PFID!,
      templateId: payload.templateId,
      variables: payload.variables ?? {},
      disableSms: payload.fallbackToSms === false,
    },
    text: payload.smsText, // fallback SMS 본문
  });
  return result;
}

/**
 * 상태 조회 API 핸들러 · GET /api/notification/solapi-status
 *   · UI 에서 SolAPI 설정 여부 확인 · "설정 필요" 배너 표시용
 */
export function handleSolApiStatus(_req: Request, res: Response): void {
  const status = getSolApiStatus();
  res.json({
    provider: "solapi",
    configured: status.configured,
    missing_env: status.missing,
    docs: {
      signup: "https://solapi.com",
      pricing: "https://solapi.com/pricing",
      kakao_channel: "https://center-pf.kakao.com",
      guide: "https://guide.solapi.com",
    },
    envVars: [
      { key: "SOLAPI_API_KEY", desc: "SolAPI 콘솔 · API Keys 메뉴", required: true },
      { key: "SOLAPI_API_SECRET", desc: "SolAPI 콘솔 · API Keys 메뉴", required: true },
      { key: "SOLAPI_SENDER_PHONE", desc: "발신자 전화번호 (사업자 등록)", required: true },
      { key: "SOLAPI_KAKAO_PFID", desc: "카카오 채널 프로필 ID (SolAPI 콘솔 연동 후)", required: true },
      { key: "SOLAPI_KAKAO_TEMPLATE_ORDER", desc: "발주 알림톡 템플릿 ID (심사 통과 후)", required: false },
    ],
  });
}
