// 2026-07-24 · RawOcrTable 리팩터 · 페이지 snapshot 훅
//   props.pages 는 서버 SSE 로 계속 업데이트되므로 · 컴포넌트 내부에서 스냅샷 유지
//   새 page 만 append · 기존 page 는 절대 교체 X · 사용자 편집·화면 상태 보존
import { useEffect, useRef, useState } from "react";
import type { RawPage } from "./types";

export function usePagesSnapshot(pagesFromProps: RawPage[]): RawPage[] {
  const snapshotRef = useRef<RawPage[]>([]);
  const [pages, setPages] = useState<RawPage[]>([]);
  useEffect(() => {
    const existing = new Set(snapshotRef.current.map(p => p.page));
    const newPages = pagesFromProps.filter(p => !existing.has(p.page));
    // 2026-07-27 · 편집 손실 조사용 로그
    console.log(`[pages snapshot DEBUG] props=${pagesFromProps.length}장 (pages=${pagesFromProps.map(p=>p.page).join(",")}) · snapshot=${snapshotRef.current.length}장 (pages=${snapshotRef.current.map(p=>p.page).join(",")}) · 신규=${newPages.length}장 (pages=${newPages.map(p=>p.page).join(",")})`);
    if (newPages.length === 0 && pagesFromProps.length === snapshotRef.current.length) {
      console.log(`[pages snapshot DEBUG] → 변경 없음 · 리렌더만`);
      return;
    }
    // props.pages 가 완전히 리셋되면 (예: 새 파일 업로드) snapshot 도 리셋
    if (pagesFromProps.length === 0 && snapshotRef.current.length > 0) {
      snapshotRef.current = [];
      setPages([]);
      console.warn("[pages snapshot] ⚠ 리셋 · props.pages 가 비었음 · 편집 손실 발생 지점");
      return;
    }
    if (newPages.length > 0) {
      snapshotRef.current = [...snapshotRef.current, ...newPages];
      setPages([...snapshotRef.current]);
      console.log(`[pages snapshot] +${newPages.length} 페이지 추가 · 총 ${snapshotRef.current.length}`);
    }
  }, [pagesFromProps]);
  return pages;
}
