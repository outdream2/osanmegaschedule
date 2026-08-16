// server/lib/auditLogger.ts
// 2026-08-16 · #112-S5 · Audit Logging · winston + DailyRotateFile
//   · logs/audit-YYYY-MM-DD.log · 일별 파일 · 30일 후 자동 삭제
//   · JSON 라인 포맷 · grep·jq·log aggregator 친화
//   · 이벤트: 로그인(성공/실패) · 관리자 작업(권한/비번 변경 · 직원 삭제 등)
//
// 사용 예:
//   audit("LOGIN_SUCCESS", { userId: 123, name: "홍길동", ip });
//   audit("LOGIN_FAIL", { phone, reason: "wrong_password", ip });
//   audit("PASSWORD_SET", { actorId, targetEmployeeId }, "warn");
import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

// logs/ 폴더 없으면 생성 (동기 · 부팅 시 1회)
const LOG_DIR = path.join(process.cwd(), "logs");
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.warn("[auditLogger] logs/ 폴더 생성 실패:", (err as any)?.message);
}

// DailyRotateFile 인스턴스 · 30일 유지 · gzip 압축
const auditTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, "audit-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",     // 30일 지난 파일 자동 삭제
  zippedArchive: true, // 오래된 파일 gzip 압축
  handleExceptions: false,
  auditFile: path.join(LOG_DIR, ".audit-state.json"),
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.json(),
  ),
  transports: [
    auditTransport,
    // 개발 모드 · 콘솔에도 함께 출력
    ...(process.env.NODE_ENV !== "production"
      ? [new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        })]
      : []),
  ],
});

/** 감사 이벤트 기록 · 자유 형식 metadata */
export function audit(
  event: string,
  meta: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  try {
    logger.log(level, event, meta);
  } catch (err) {
    // 로거 자체가 실패해도 · 애플리케이션은 계속 동작
    console.error("[auditLogger] log failed:", (err as any)?.message);
  }
}

/** Express req 에서 · IP·User-Agent 추출 (audit 편의) */
export function auditContext(req: any): { ip: string; ua: string } {
  const ip = String(
    req?.headers?.["x-forwarded-for"] ??
    req?.socket?.remoteAddress ??
    req?.ip ??
    "unknown",
  ).split(",")[0]?.trim() ?? "unknown";
  const ua = String(req?.headers?.["user-agent"] ?? "unknown").slice(0, 200);
  return { ip, ua };
}
