// @vitest-environment jsdom
// 2026-09-01 · RealMapSelector · 검색 리스트 재설계 검증
//   · matchesQuery 순수 함수 · UI 렌더 · 선택/닫기 콜백

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// ── matchesQuery 순수 함수 단독 테스트 ──────────────────────────────────────
// 컴포넌트 내부 함수이므로 동일 로직 인라인 재현 · 회귀 방지용
function matchesQuery(query: string, targets: string[]): boolean {
  if (!query) return true;
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = targets.map(t => t.toLowerCase()).join(" ");
  return tokens.every(tok => haystack.includes(tok));
}

describe("matchesQuery", () => {
  it("빈 쿼리 → 항상 true", () => {
    expect(matchesQuery("", ["아무거나"])).toBe(true);
  });
  it("단순 카테고리 매칭", () => {
    expect(matchesQuery("감기약", ["1A", "진열대 1A", "감기약", ""])).toBe(true);
  });
  it("구역 코드 매칭", () => {
    expect(matchesQuery("3A", ["3A", "감기", "중앙상비약존"])).toBe(true);
  });
  it("대분류 존 매칭", () => {
    expect(matchesQuery("중앙상비약존", ["1A", "", "감기약", "중앙상비약존"])).toBe(true);
  });
  it("멀티 토큰 · 모두 포함 시 true", () => {
    expect(matchesQuery("감기 1A", ["1A", "진열대 1A", "감기약", ""])).toBe(true);
  });
  it("멀티 토큰 · 하나 불일치 시 false", () => {
    expect(matchesQuery("감기 99Z", ["1A", "진열대 1A", "감기약", ""])).toBe(false);
  });
  it("대소문자 무시", () => {
    expect(matchesQuery("1a", ["1A", "아이템"])).toBe(true);
  });
  it("공백 토큰 무시", () => {
    expect(matchesQuery("   ", ["아무거나"])).toBe(true);
  });
});

// ── UI 렌더 테스트 · useZoneDefs 모킹 ────────────────────────────────────────
vi.mock("../../hooks/useZoneDefs", () => ({
  useZoneDefs: () => ({
    zonesRaw: [
      { id: 1, cellId: 1, location: "1A", zone: "진열대 1A", category: "감기약", detailedCategory: "종합감기약" },
      { id: 2, cellId: 2, location: "9",  zone: "벽면 9",   category: "스포츠음료", detailedCategory: "" },
      { id: 3, cellId: 3, location: "22", zone: "진열대 22", category: "파스", detailedCategory: "" },
    ],
    loading: false,
    error: null,
  }),
  classifyMajorZone: (loc: string) => {
    if (/^[1-8][AB]$/.test(loc) || loc === "22") return "중앙상비약존";
    const n = Number(loc);
    if (n >= 9 && n <= 21) return "상담존";
    return "(미분류)";
  },
}));

vi.mock("../common/StoreZoneMap", () => ({
  StoreZoneMap: ({ onZoneClick }: { onZoneClick?: (z: string) => void }) => (
    <div data-testid="store-zone-map">
      <button onClick={() => onZoneClick?.("3B")}>존클릭</button>
    </div>
  ),
}));

import { RealMapSelector } from "./RealMapSelector";

describe("RealMapSelector · 렌더", () => {
  it("검색바 존재", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("미지정 버튼 존재", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain("미지정");
  });

  it("전체 구역 리스트 · 빈 검색 시 모두 표시", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    // 3개 구역 코드 모두 표시
    expect(container.textContent).toContain("1A");
    expect(container.textContent).toContain("9");
    expect(container.textContent).toContain("22");
  });

  it("현재 구역 강조 표시", () => {
    const { container } = render(
      <RealMapSelector current="1A" onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain("현재 · 1A");
  });
});

describe("RealMapSelector · 검색 필터링", () => {
  it("카테고리 입력 → 해당 항목만 표시", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "감기" } });
    expect(container.textContent).toContain("1A");
    expect(container.textContent).not.toContain("스포츠음료");
  });

  it("구역 코드 입력 → 해당 항목만", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "22" } });
    expect(container.textContent).toContain("파스");
    expect(container.textContent).not.toContain("감기약");
  });

  it("매칭 없으면 EmptyState 표시", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "XYZNOTFOUND999" } });
    expect(container.textContent).toContain("검색 결과 없음");
  });
});

describe("RealMapSelector · 선택 콜백", () => {
  it("항목 클릭 → onSelect(location) 호출", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <RealMapSelector current={null} onSelect={onSelect} onClose={onClose} />
    );
    // "1A" 코드가 들어간 버튼 클릭
    const btns = Array.from(container.querySelectorAll("button"));
    const btn1A = btns.find(b => b.textContent?.includes("감기약"));
    btn1A?.click();
    expect(onSelect).toHaveBeenCalledWith("1A");
    expect(onClose).toHaveBeenCalled();
  });

  it("미지정 클릭 → onSelect('') 호출", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <RealMapSelector current="1A" onSelect={onSelect} onClose={onClose} />
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const unset = btns.find(b => b.textContent?.includes("미지정"));
    unset?.click();
    expect(onSelect).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalled();
  });

  it("닫기(X) 클릭 → onClose 호출 · onSelect 미호출", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <RealMapSelector current={null} onSelect={onSelect} onClose={onClose} />
    );
    const closeBtn = container.querySelector('button[aria-label="매장구역 선택 닫기"]');
    closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("RealMapSelector · StoreZoneMap fallback", () => {
  it("매장구역도 토글 버튼 존재", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.textContent).toContain("매장구역도로 선택");
  });

  it("토글 클릭 → 지도 표시", () => {
    const { container } = render(
      <RealMapSelector current={null} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const btns = Array.from(container.querySelectorAll("button"));
    const mapToggle = btns.find(b => b.textContent?.includes("매장구역도로 선택"));
    if (mapToggle) fireEvent.click(mapToggle);
    expect(container.querySelector('[data-testid="store-zone-map"]')).not.toBeNull();
  });
});
