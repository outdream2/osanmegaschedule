// src/hooks/useUpcomingLeaves.ts
// #311 · 다가오는 연차 알림 · GET /api/upcoming-leaves?days=N
//   · 관리자(level>=2) 전용 · SchedulePage 상단 배너용

import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/apiClient";

export interface UpcomingLeaveItem {
  employeeId: number;
  employeeName: string;
  date: string;      // YYYY-MM-DD
  type: string;      // 월차 | 오전반차 | 오후반차
}

export interface UpcomingLeaveBannerRow {
  employeeId: number;
  employeeName: string;
  /** 연속 날짜 병합 후 표시 문자열 · "9/25 (수)" or "9/26–9/27" */
  dateLabel: string;
  type: string;
  /** 정렬 기준 · 첫 날짜 */
  startDate: string;
}

function formatDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(ymd + "T00:00:00").getDay()];
  return `${Number(m)}/${Number(d)} (${dow})`;
}

/**
 * 같은 직원 + 같은 유형의 연속 날짜를 하나의 BannerRow 로 병합
 *   - 연속 여부: 날짜 diff == 1일
 *   - 병합 후 표시: "9/26–9/27"
 */
function mergeConsecutive(items: UpcomingLeaveItem[]): UpcomingLeaveBannerRow[] {
  if (items.length === 0) return [];

  const rows: UpcomingLeaveBannerRow[] = [];
  let cur = items[0];
  let end = items[0];

  const flush = () => {
    const [, sm, sd] = cur.date.split("-");
    const [, em, ed] = end.date.split("-");
    const dateLabel =
      cur.date === end.date
        ? formatDate(cur.date)
        : `${Number(sm)}/${Number(sd)}–${Number(em)}/${Number(ed)}`;
    rows.push({
      employeeId: cur.employeeId,
      employeeName: cur.employeeName,
      dateLabel,
      type: cur.type,
      startDate: cur.date,
    });
  };

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const sameEmpType =
      item.employeeId === cur.employeeId && item.type === cur.type;

    if (sameEmpType) {
      // 연속 여부 확인
      const endMs = new Date(end.date + "T00:00:00Z").getTime();
      const curMs = new Date(item.date + "T00:00:00Z").getTime();
      if (curMs - endMs === 86400000) {
        end = item;
        continue;
      }
    }
    flush();
    cur = item;
    end = item;
  }
  flush();

  // 날짜 오름차순 재정렬
  return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function useUpcomingLeaves(days = 14, enabled = true) {
  const [rows, setRows] = useState<UpcomingLeaveBannerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await api.get<{ items: UpcomingLeaveItem[] }>(
        `/api/upcoming-leaves?days=${days}`,
      );
      setRows(mergeConsecutive(res.data.items ?? []));
    } catch {
      // 권한 없음(401/403) 포함 · 조용히 빈 배열
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { rows, loading, refetch: fetch };
}
