// server/services/kakaoNotifyService.ts
// 2026-08-29 · #176/#214 · 발주요청 · 물류팀장 카톡 전송 서비스 (뼈대)
//
// 목적:
//   · 발주요청 PDF 저장(#94) 이후 · 물류팀장에게 카카오 알림톡 전송 지점 명시
//   · 실제 발송은 사업자 등록 완료 + credentials 설정 후 활성화
//   · 현재는 gracefully · `{ ok: false, reason: "카카오 API 미구성" }` 반환
//
// 아키텍처:
//   · 이 서비스 = 도메인 레이어 (라우트에서 호출)
//   · 실제 벤더 호출 = server/lib/notification/solapiClient.ts (기존 존재)
//   · 향후 벤더 교체 (NHN Cloud · 알리고 · Bizppurio 등) 는 이 파일 내부만 수정
//
// 환경변수 (사업자 등록 후 설정):
//   기본 gate (사용자 스펙):
//     KAKAO_API_KEY               · 카카오 알림톡 서비스 API 키 (게이트)
//   실제 벤더 (Solapi 사용 시 · 기존 solapiClient 재사용):
//     SOLAPI_API_KEY              · SolAPI 콘솔 발급
//     SOLAPI_API_SECRET           · SolAPI 콘솔 발급
//     SOLAPI_SENDER_PHONE         · 발신자 번호 (사업자 등록)
//     SOLAPI_KAKAO_PFID           · 카카오 채널 프로필 ID
//     SOLAPI_KAKAO_TEMPLATE_ORDER · 발주 알림톡 템플릿 ID (심사 통과 후)
//
// 향후 확장 지점 (사업자 등록 후):
//   1) isKakaoConfigured() · 실제 벤더 credentials 검증 로직 추가
//   2) sendKakaoAlimtalk() · 벤더 SDK 호출 (Solapi/NHN/알리고 등)
//   3) attachment · 카카오 알림톡은 이미지 첨부 제약 있음 · SMS/LMS/MMS fallback 고려
//   4) 결과 로깅 · notifications 테이블에 messageId · status 기록 (재전송 · 상태조회)

import {
  sendAlimtalk as sendAlimtalkViaSolapi,
  getSolApiStatus,
  type AlimtalkPayload,
} from "../lib/notification/solapiClient";

/** 카카오 발송 결과 · 라우트에서 그대로 응답 가능한 shape */
export interface KakaoSendResult {
  ok: boolean;
  /** 실패 사유 (미구성 · 벤더 에러 등) */
  reason?: string;
  /** 벤더가 반환한 messageId (성공 시) */
  messageId?: string;
  /** 벤더 raw 응답 (디버깅용 · 프로덕션에서는 로그로만) */
  raw?: unknown;
}

/** 카카오 알림톡 전송 입력 */
export interface SendKakaoAlimtalkInput {
  /** 수신자 전화번호 (010-0000-0000 · 01000000000 · 하이픈 무관) */
  to: string;
  /** 알림톡 템플릿 ID (카카오 심사 통과 후 부여) */
  templateId: string;
  /** 템플릿 변수 · #{키} 치환 값 */
  vars?: Record<string, string>;
  /** 첨부 파일 URL (예: 발주요청 PDF · Google Drive · Supabase Storage) */
  attachment?: string;
}

/**
 * 카카오 API 구성 여부 확인.
 *   · KAKAO_API_KEY 는 사용자 스펙상 게이트 역할 (구성 의도 표시)
 *   · 실제 발송을 위해 Solapi credentials 도 필요 · 둘 다 확인
 *   · 향후 벤더 교체 시 · 이 함수 내부만 수정
 */
export function isKakaoConfigured(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  // 사용자 스펙 · 게이트 env
  if (!process.env.KAKAO_API_KEY) missing.push("KAKAO_API_KEY");
  // 실제 벤더 credentials (현재는 Solapi)
  const solapi = getSolApiStatus();
  for (const key of solapi.missing) {
    if (!missing.includes(key)) missing.push(key);
  }
  return { configured: missing.length === 0, missing };
}

/**
 * 카카오 알림톡 발송.
 *   · 미구성 시 · gracefully return · throw 하지 않음 (라우트에서 200 응답 유지)
 *   · 구성 시 · Solapi SDK 호출 (지연 import · 미설치 환경 안전)
 *   · 벤더 에러 시 · ok:false + reason (로그는 여기서 남김)
 *
 * @example
 *   const r = await sendKakaoAlimtalk({
 *     to: "010-1234-5678",
 *     templateId: process.env.SOLAPI_KAKAO_TEMPLATE_ORDER!,
 *     vars: { 발주번호: "ORD-2026-001", 공급사: "코스트팜", 총금액: "1,234,000원" },
 *     attachment: "https://.../order-pdf/ORD-2026-001.pdf",
 *   });
 */
export async function sendKakaoAlimtalk(input: SendKakaoAlimtalkInput): Promise<KakaoSendResult> {
  const status = isKakaoConfigured();
  if (!status.configured) {
    console.warn(
      `[kakaoNotifyService] 카카오 API 미구성 · 미설정 env: ${status.missing.join(", ")} · to=${maskPhone(input.to)} · template=${input.templateId}`,
    );
    return { ok: false, reason: "카카오 API 미구성" };
  }

  // 향후 확장 지점 · attachment 처리
  //   · 카카오 알림톡 · 이미지 첨부는 "이미지 첨부형" 템플릿 심사 별도 필요
  //   · PDF 첨부 불가 · URL 을 템플릿 변수에 삽입 or SMS/LMS fallback 사용
  //   · 지금은 attachment 를 로그로만 남기고 · vars 에 삽입은 라우트 담당
  if (input.attachment) {
    console.log(`[kakaoNotifyService] attachment 참고 · ${input.attachment} · 템플릿 변수로 삽입 필요`);
  }

  const payload: AlimtalkPayload = {
    to: input.to,
    templateId: input.templateId,
    variables: input.vars ?? {},
    // 카카오 실패 시 SMS fallback · 사업자 인증 완료 후 기본 true 유지
    fallbackToSms: true,
  };

  try {
    const raw = await sendAlimtalkViaSolapi(payload);
    // SolAPI 응답 shape · groupInfo · messageList · statusCode 등
    const messageId =
      (raw && typeof raw === "object" && "messageId" in raw && typeof (raw as any).messageId === "string")
        ? ((raw as any).messageId as string)
        : (raw && typeof raw === "object" && "groupInfo" in raw && (raw as any).groupInfo?.groupId)
          ? ((raw as any).groupInfo.groupId as string)
          : undefined;
    console.log(
      `[kakaoNotifyService] 발송 성공 · to=${maskPhone(input.to)} · template=${input.templateId} · messageId=${messageId ?? "n/a"}`,
    );
    return { ok: true, messageId, raw };
  } catch (err: any) {
    const reason = err?.message ?? "알 수 없는 벤더 에러";
    console.error(
      `[kakaoNotifyService] 발송 실패 · to=${maskPhone(input.to)} · template=${input.templateId} · ${reason}`,
    );
    return { ok: false, reason };
  }
}

/** 로그용 전화번호 마스킹 · 010-****-5678 */
function maskPhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}
