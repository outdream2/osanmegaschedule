// server/lib/logger.ts
// 2026-09-21 · P1-4 · 서버 애플리케이션 로그 · winston 통합
//   · production : info+ → logs/app-YYYY-MM-DD.log (30일 유지)
//   · development : debug+ → 콘솔 colorize 출력
//   · debug 레벨 : 매 요청마다 찍히는 로그 → production 에서 자동 skip
//
// 사용법:
//   import logger from "../lib/logger";
//   logger.info("[MODULE] 메시지", { extra: "data" });
//   logger.warn("[MODULE] 경고");
//   logger.error("[MODULE] 에러", errorObj);
//   logger.debug("[MODULE] 매 요청 로그 · dev 전용");

import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const LOG_DIR = path.join(process.cwd(), "logs");
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  console.warn("[logger] logs/ 폴더 생성 실패:", (err as any)?.message);
}

const isProd = process.env.NODE_ENV === "production";

const fileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, "app-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",
  zippedArchive: true,
  handleExceptions: false,
  auditFile: path.join(LOG_DIR, ".app-logger-state.json"),
});

const logger = winston.createLogger({
  // production: info+, development: debug+
  level: isProd ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    fileTransport,
    ...(!isProd
      ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
            ),
          }),
        ]
      : []),
  ],
});

export default logger;
