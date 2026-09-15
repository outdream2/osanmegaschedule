// apps/sync-agent/src/main/queue.ts
// 2026-09-15 · Phase 3 · 로컬 재시도 큐 · JSON 파일 기반 (SQLite 회피 · Windows 네이티브 이슈 없음)
//   · 실패한 업로드 · 기록 · 다음 스케줄 시 · 자동 재시도 (지수 백오프)
//   · %APPDATA%/megatown-sync-agent/queue.json
//   · SQLite 대비 · 소규모 큐 (수십 건) · JSON 충분

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { FileKind } from "./config";

export interface QueueItem {
  id: string;                            // uuid or timestamp
  kind: FileKind;
  filePath: string;                      // 재시도 시 · 파일 경로
  originalName: string;
  addedAt: string;                       // ISO
  attempts: number;                      // 재시도 횟수
  lastAttemptAt?: string;
  nextRetryAt: string;                   // 지수 백오프
  lastError?: string;
}

interface QueueState {
  items: QueueItem[];
}

const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240, 1440]; // 1분 → 5분 → 15분 → 1h → 4h → 24h
const MAX_ATTEMPTS = 6;

let cachedState: QueueState | null = null;

function queueFilePath(): string {
  return join(app.getPath("userData"), "queue.json");
}

function load(): QueueState {
  if (cachedState) return cachedState;
  try {
    const path = queueFilePath();
    if (!existsSync(path)) {
      cachedState = { items: [] };
      return cachedState;
    }
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as QueueState;
    cachedState = { items: Array.isArray(parsed.items) ? parsed.items : [] };
    return cachedState;
  } catch (err) {
    console.warn("[queue] load 실패 · 빈 큐 사용:", err);
    cachedState = { items: [] };
    return cachedState;
  }
}

function save(state: QueueState): void {
  try {
    const path = queueFilePath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
    cachedState = state;
  } catch (err) {
    console.error("[queue] save 실패:", err);
  }
}

/** 큐에 실패 아이템 추가 · 지수 백오프 계산 */
export function enqueue(kind: FileKind, filePath: string, originalName: string, error?: string): QueueItem {
  const state = load();
  const now = new Date();
  const item: QueueItem = {
    id: `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    filePath,
    originalName,
    addedAt: now.toISOString(),
    attempts: 0,
    nextRetryAt: new Date(now.getTime() + RETRY_DELAYS_MINUTES[0] * 60_000).toISOString(),
    lastError: error,
  };
  state.items.push(item);
  save(state);
  console.log(`[queue] enqueue · ${kind} · ${originalName} · next: ${item.nextRetryAt}`);
  return item;
}

/** 재시도 대상 아이템 · 현재 시각 >= nextRetryAt · 아직 재시도 가능 */
export function getReadyItems(): QueueItem[] {
  const state = load();
  const now = Date.now();
  return state.items.filter(i => new Date(i.nextRetryAt).getTime() <= now && i.attempts < MAX_ATTEMPTS);
}

/** 재시도 성공 · 큐에서 제거 */
export function markSuccess(id: string): void {
  const state = load();
  state.items = state.items.filter(i => i.id !== id);
  save(state);
  console.log(`[queue] success · ${id} · removed`);
}

/** 재시도 실패 · 백오프 증가 · 다음 재시도 예약 */
export function markFailure(id: string, error: string): void {
  const state = load();
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  item.attempts += 1;
  item.lastAttemptAt = new Date().toISOString();
  item.lastError = error;
  if (item.attempts >= MAX_ATTEMPTS) {
    console.warn(`[queue] MAX_ATTEMPTS 도달 · ${item.originalName} · 큐 유지 (수동 처리)`);
  } else {
    const delayIdx = Math.min(item.attempts, RETRY_DELAYS_MINUTES.length - 1);
    const nextMs = Date.now() + RETRY_DELAYS_MINUTES[delayIdx] * 60_000;
    item.nextRetryAt = new Date(nextMs).toISOString();
  }
  save(state);
  console.log(`[queue] failure · ${id} · attempts ${item.attempts} · next: ${item.nextRetryAt}`);
}

/** 큐 전체 조회 (Renderer UI 용) */
export function listQueue(): QueueItem[] {
  return load().items;
}

/** 아이템 · 수동 삭제 (사용자) */
export function removeItem(id: string): void {
  const state = load();
  state.items = state.items.filter(i => i.id !== id);
  save(state);
}

/** 모든 큐 클리어 (사용자) */
export function clearQueue(): void {
  save({ items: [] });
}
