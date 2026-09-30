// server/services/expoPushService.ts
// #328 · iOS 앱 Expo 푸시 알림 · 발송 서비스
// 2026-09-21 · 사용자 지시 · WebView 앱 v1.0.1 · 앱 개발자 가이드 수령
//
// 역할:
//   · sendPush({ userId, title, body, badge?, data?, url? })
//     → push_tokens (active=true) 조회 → Expo API 호출 → DeviceNotRegistered 시 active=false
//   · sendPushToTokens (내부) · 배치 최대 100 · 지수 백오프 재시도
//
// Expo Push API:
//   · https://exp.host/--/api/v2/push/send
//   · POST · Content-Type: application/json
//   · 인증 · Expo 는 서버측 API key 불필요 · 공개 API (per guide)
//   · body · 배열 (최대 100) · 각 · { to: token, title, body, sound, data, badge, ... }
//
// 로그 prefix · [EXPO-PUSH]

import { supabase } from "../../src/supabase/client";
import logger from "../lib/logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH = 100;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
  // 2026-09-29 · silent push · iOS background notification · badge 만 갱신 · alert 표시 X
  //   · Expo SDK · _contentAvailable → APNs `content-available: 1` (iOS) · GCM data-only (Android)
  //   · https://docs.expo.dev/push-notifications/sending-notifications/#message-format
  _contentAvailable?: boolean;
  // 2026-09-30 · iOS 15+ · interruption level · passive = 배너/소리 X · 알림센터에만 조용히
  //   · Expo SDK · _interruptionLevel → APNs `interruption-level` (iOS 15+)
  //   · badge 자동 반영 · regular alert 스펙 준수 · 앱 handler 불필요
  _interruptionLevel?: "active" | "passive" | "time-sensitive" | "critical";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
}

export interface SendPushParams {
  userId: number;
  title: string;
  body: string;
  /** iOS 배지 카운트 · undefined 면 미변경 · 0 이면 clear */
  badge?: number;
  /** 앱 tap 시 열릴 웹 경로 (WebView 라우팅용) */
  url?: string;
  /** 앱측 커스텀 데이터 (data payload) */
  data?: Record<string, unknown>;
}

export interface SendPushResult {
  sent: number;
  failed: number;
  skipped: number;
  deactivated: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Expo Push API 호출 (배치)
 * · 실패 시 지수 백오프 재시도 (최대 MAX_RETRIES)
 * · 네트워크 에러 vs 티켓 에러 구분
 */
async function callExpoApi(messages: ExpoPushMessage[]): Promise<ExpoPushResponse | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        logger.warn(`[EXPO-PUSH] HTTP ${res.status} · attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        return null;
      }
      const json = (await res.json()) as ExpoPushResponse;
      return json;
    } catch (err: any) {
      logger.warn(`[EXPO-PUSH] network error · attempt ${attempt + 1} · ${err?.message ?? err}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * 특정 토큰 목록으로 push 전송 (내부용)
 * · 배치 100 단위 · Expo API 호출
 * · DeviceNotRegistered 감지 · 해당 token active=false 마킹
 */
async function sendPushToTokens(
  tokens: string[],
  base: Omit<ExpoPushMessage, "to">,
): Promise<{ sent: number; failed: number; deactivated: number }> {
  let sent = 0;
  let failed = 0;
  const expiredTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += MAX_BATCH) {
    const batch = tokens.slice(i, i + MAX_BATCH);
    const messages: ExpoPushMessage[] = batch.map((t) => ({ ...base, to: t }));
    const response = await callExpoApi(messages);
    if (!response) {
      failed += batch.length;
      continue;
    }
    if (response.errors && response.errors.length > 0) {
      logger.warn(`[EXPO-PUSH] response errors`, { errors: response.errors });
    }
    const tickets = response.data ?? [];
    tickets.forEach((ticket, idx) => {
      const token = batch[idx];
      if (ticket.status === "ok") {
        sent++;
      } else {
        failed++;
        const errCode = ticket.details?.error;
        if (errCode === "DeviceNotRegistered") {
          expiredTokens.push(token);
        } else {
          logger.warn(`[EXPO-PUSH] ticket error · token=${token.slice(0, 32)}... · ${ticket.message ?? errCode ?? "unknown"}`);
        }
      }
    });
  }

  // DeviceNotRegistered · active=false 마킹
  let deactivated = 0;
  if (expiredTokens.length > 0) {
    try {
      const { error } = await supabase
        .from("push_tokens")
        .update({ active: false })
        .in("token", expiredTokens);
      if (error) {
        logger.warn(`[EXPO-PUSH] deactivate failed · ${error.message}`);
      } else {
        deactivated = expiredTokens.length;
        logger.info(`[EXPO-PUSH] deactivated ${deactivated} expired tokens`);
      }
    } catch (err: any) {
      logger.warn(`[EXPO-PUSH] deactivate exception · ${err?.message ?? err}`);
    }
  }

  return { sent, failed, deactivated };
}

/**
 * 2026-09-24 · 사용자 지시 · 앱 개발자 스펙 · 사용자 unread notifications 갯수 조회
 *   · badge · NotificationBell 과 동일 metric · notifications 테이블 · read=false · limit 미제한
 *   · badge 파라미터 미지정 시 · 자동 조회 · push 마다 최신 값 전송
 */
async function fetchUnreadCount(userId: number): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", userId)
      .eq("read", false);
    if (error) {
      logger.warn(`[EXPO-PUSH] unread count 조회 실패 · user=${userId} · ${error.message}`);
      return 0;
    }
    return Number.isFinite(count) ? (count as number) : 0;
  } catch (e: any) {
    logger.warn(`[EXPO-PUSH] unread count 예외 · user=${userId} · ${e?.message ?? e}`);
    return 0;
  }
}

/**
 * 특정 user 에게 push 전송 (public)
 * · push_tokens (user_id, active=true) 조회 → sendPushToTokens
 * · 토큰 없으면 skip (fire-and-forget · throw 없음)
 * · 2026-09-24 · 사용자 지시 · badge 미지정 시 · 서버가 unread count 자동 조회 · NotificationBell 과 완전 일치
 */
export async function sendPush(params: SendPushParams): Promise<SendPushResult> {
  const { userId, title, body, badge, url, data } = params;
  const empty: SendPushResult = { sent: 0, failed: 0, skipped: 0, deactivated: 0 };

  if (!userId || !title) {
    logger.warn(`[EXPO-PUSH] sendPush · missing userId/title · skip`);
    return empty;
  }

  try {
    const { data: rows, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) {
      logger.warn(`[EXPO-PUSH] token fetch failed · user=${userId} · ${error.message}`);
      return empty;
    }
    const tokens = (rows ?? []).map((r) => String(r.token)).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      logger.debug(`[EXPO-PUSH] no active tokens · user=${userId} · skip`);
      return empty;
    }

    // 2026-09-24 · 앱 개발자 스펙 · badge = user's current unread count · 미지정 시 자동 조회
    //   · 사용자 보고 · "앱에서 갯수가 틀린거야" · notifications 테이블 unread count 로 통일
    //   · 이전 · 각 callsite 별 badge 계산 or 미지정 · 앱 뱃지 · 로컬 계산 (limit=100) · 불일치
    //   · 이후 · 서버 · notifications 실시간 count · 매 push 시 최신 값 · NotificationBell 과 완전 일치
    const badgeCount = typeof badge === "number" ? badge : await fetchUnreadCount(userId);

    // 마지막 사용 시각 갱신 (fire-and-forget)
    supabase
      .from("push_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .in("token", tokens)
      .then(({ error: uErr }) => {
        if (uErr) logger.warn(`[EXPO-PUSH] last_used_at update warn · ${uErr.message}`);
      });

    // 2026-09-22 · 앱 개발자 스펙 준수 · data.url 반드시 https://osanmega.onrender.com 로 시작
    //   · iOS WebView 앱 · 알림 탭 시 이 URL 로 열림 · 상대경로 X · 도메인 필수
    //   · env PUSH_BASE_URL · 프로덕션·개발 오버라이드 가능
    const PUSH_BASE_URL = process.env.PUSH_BASE_URL || "https://osanmega.onrender.com";
    const rawUrl = url ?? "/";
    const absoluteUrl = rawUrl.startsWith("http") ? rawUrl : `${PUSH_BASE_URL}${rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl}`;
    const payload: Omit<ExpoPushMessage, "to"> = {
      title,
      body,
      sound: "default",
      priority: "high",
      data: { url: absoluteUrl, ...(data ?? {}) },
      // 2026-09-24 · 사용자 지시 · badge 항상 포함 · NotificationBell 과 완전 일치
      badge: badgeCount,
    };

    const result = await sendPushToTokens(tokens, payload);
    logger.info(`[EXPO-PUSH] user=${userId} · sent=${result.sent} · failed=${result.failed} · deactivated=${result.deactivated}`);
    return { ...result, skipped: 0 };
  } catch (err: any) {
    logger.error(`[EXPO-PUSH] sendPush unexpected · user=${userId} · ${err?.message ?? err}`);
    return empty;
  }
}

/**
 * fire-and-forget wrapper · 실패해도 caller 흐름 방해 X
 */
export function sendPushSafe(params: SendPushParams): void {
  sendPush(params).catch((err) => {
    logger.warn(`[EXPO-PUSH] sendPushSafe · ${err?.message ?? err}`);
  });
}

/**
 * 2026-09-29 · 사용자 보고 · "앱·웹 뱃지 갯수 불일치" 근본 fix
 *
 * Silent Push · iOS 앱 홈스크린 badge 만 실시간 갱신 (알림 표시·소리 X)
 *   · alert 표시 X · sound null · title/body 빈값
 *   · Expo · `_contentAvailable: true` → APNs `content-available: 1` (iOS silent) · GCM data-only (Android)
 *   · badge · fetchUnreadCount 자동 조회 · notifications 실시간 count
 *   · 사용 시점 · notification 읽음/전체읽음/전체삭제 후 · 앱 badge 즉시 stale 상태 해소
 *
 * 회귀 방지:
 *   · 기존 sendPush 로직 무변경
 *   · 실패 시 fire-and-forget · caller 흐름 방해 X (throw 없음)
 *   · Android · data-only 전송 · notification tray 표시 X (title/body 빈값)
 */
export async function sendBadgeSync(userId: number): Promise<SendPushResult> {
  const empty: SendPushResult = { sent: 0, failed: 0, skipped: 0, deactivated: 0 };
  if (!userId) return empty;

  try {
    const { data: rows, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) {
      logger.warn(`[EXPO-PUSH] badgeSync · token fetch failed · user=${userId} · ${error.message}`);
      return empty;
    }
    const tokens = (rows ?? []).map((r) => String(r.token)).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      logger.debug(`[EXPO-PUSH] badgeSync · no active tokens · user=${userId} · skip`);
      return empty;
    }

    const badgeCount = await fetchUnreadCount(userId);
    // 2026-09-30 · Passive Alert (iOS 15+) · 배너·소리 X · 알림센터 조용히 · badge 자동 반영
    //   · 이전 · silent push · iOS · 앱 handler 없으면 badge 반영 X (v1.0.1 앱 handler 미포함)
    //   · 이후 · regular alert · title 공백 1글자 · interruption-level=passive · iOS 시스템 auto badge
    //   · trade-off · 알림센터에 조용한 entry 쌓임 (배너·소리 없음 · 사용자 방해 최소)
    const payload: Omit<ExpoPushMessage, "to"> = {
      title: " ",
      body: "",
      sound: null,
      priority: "high",
      badge: badgeCount,
      _interruptionLevel: "passive",
      data: { type: "badge-sync", badge: badgeCount },
    };

    const result = await sendPushToTokens(tokens, payload);
    logger.info(`[EXPO-PUSH] badgeSync · user=${userId} · badge=${badgeCount} · sent=${result.sent} · failed=${result.failed}`);
    return { ...result, skipped: 0 };
  } catch (err: any) {
    logger.warn(`[EXPO-PUSH] badgeSync unexpected · user=${userId} · ${err?.message ?? err}`);
    return empty;
  }
}

/**
 * fire-and-forget wrapper · 실패해도 caller 흐름 방해 X
 */
export function sendBadgeSyncSafe(userId: number): void {
  sendBadgeSync(userId).catch((err) => {
    logger.warn(`[EXPO-PUSH] sendBadgeSyncSafe · user=${userId} · ${err?.message ?? err}`);
  });
}
