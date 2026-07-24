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
    if (newPages.length === 0 && pagesFromProps.length === snapshotRef.current.length) return;
    // props.pages 가 완전히 리셋되면 (예: 새 파일 업로드) snapshot 도 리셋
    if (pagesFromProps.length === 0 && snapshotRef.current.length > 0) {
      snapshotRef.current = [];
      setPages([]);
      console.log("[pages snapshot] 리셋 · props.pages 가 비었음");
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
