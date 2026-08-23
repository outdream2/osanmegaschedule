// @vitest-environment jsdom
// 2026-08-23 · #179 · ScanLeftPanel · notFoundCode 카드 · 등록 버튼 (canManageProducts + onOpenCreate)
// 2026-08-23 · #202 · SaveCard · 등록 준비 요약 리스트
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ScanLeftPanel, SaveCard } from "./ScanPage.panels";
import type { StockRow } from "./stockRowTypes";

afterEach(() => cleanup());

const baseProps = {
  mapLoading: false,
  autoIncOn: false,
  onToggleAutoInc: vi.fn(),
  lastProduct: null,
  lastCode: null,
  requestingKey: null,
  rows: [] as StockRow[],
  onOpenScanner: vi.fn(),
  onScan: vi.fn(),
  onRequestDisplay: vi.fn(),
};

describe("ScanLeftPanel · 기본 렌더", () => {
  it("스캐너 버튼 · 상품 검색 렌더", () => {
    const { container } = render(<ScanLeftPanel {...baseProps} notFoundCode={null} />);
    expect(container.textContent).toContain("바코드 스캔");
    expect(container.querySelector('input[placeholder*="상품"]')).not.toBeNull();
  });

  it("notFoundCode 없음 · 등록 버튼 안 보임", () => {
    const { container } = render(<ScanLeftPanel {...baseProps} notFoundCode={null} canManageProducts onOpenCreate={vi.fn()} />);
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });
});

describe("ScanLeftPanel · #179 · notFoundCode 카드", () => {
  it("notFoundCode 있음 · '미등록 상품 코드' 카드 노출", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="8801234567890" />,
    );
    expect(container.textContent).toContain("미등록 상품 코드");
    expect(container.textContent).toContain("8801234567890");
  });

  it("canManageProducts=false · 등록 버튼 없음", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts={false} onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });

  it("onOpenCreate 없음 · 등록 버튼 없음", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
  });

  it("canManageProducts=true + onOpenCreate · 등록 버튼 노출", () => {
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" canManageProducts onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).toContain("이 코드로 상품 등록");
  });

  it("등록 버튼 클릭 · onOpenCreate 호출 · notFoundCode 인자 전달", () => {
    const onOpenCreate = vi.fn();
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="8801234567890" canManageProducts onOpenCreate={onOpenCreate} />,
    );
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("이 코드로 상품 등록")) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onOpenCreate).toHaveBeenCalledTimes(1);
    expect(onOpenCreate).toHaveBeenCalledWith("8801234567890");
  });

  it("lastProduct 있음 · notFoundCode 무시 · 등록 버튼 안 보임", () => {
    const lastProduct = { code: "PC001", name: "타이레놀", spec: "10정" };
    const { container } = render(
      <ScanLeftPanel {...baseProps} notFoundCode="X001" lastProduct={lastProduct} canManageProducts onOpenCreate={vi.fn()} />,
    );
    expect(container.textContent).not.toContain("이 코드로 상품 등록");
    expect(container.textContent).not.toContain("미등록 상품 코드");
  });
});

// 2026-08-23 · #202 · SaveCard · 등록 준비 요약 리스트
const mkRow = (code: string, name: string, realMap: string | null = null, addQty = 0): StockRow => ({
  key: code + "_1",
  code,
  product: { code, name, spec: "" } as any,
  addedAt: Date.now(),
  prevWarehouse1Qty: null,
  prevWarehouse2Qty: null,
  prevStore1Qty: null,
  prevStore2Qty: null,
  prevStore3Qty: null,
  warehouse1AddQty: addQty,
  warehouse2AddQty: "",
  store1AddQty: "",
  store2AddQty: "",
  store3AddQty: "",
  store1Zone: null,
  store2Zone: null,
  store3Zone: null,
  ...(realMap ? { product: { code, name, spec: "", realMap } as any } : {}),
});

describe("SaveCard · #202 · 등록 준비 요약 리스트", () => {
  const baseSave = {
    saveStatus: "idle" as const,
    savedCount: 0,
    saveError: null,
    onReview: vi.fn(),
    onReset: vi.fn(),
  };

  it("rows.length=0 · SaveCard null (렌더 안 함)", () => {
    const { container } = render(<SaveCard {...baseSave} rows={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("rows 있음 · '등록 준비 요약' 헤더 · 건수 표시", () => {
    const rows = [mkRow("PC001", "타이레놀", null, 5)];
    const { container } = render(<SaveCard {...baseSave} rows={rows} />);
    expect(container.textContent).toContain("등록 준비 요약");
    // 헤더에 "1건" 표시
    const summaryHeader = container.querySelector(".rounded-lg.border.border-line\\/70");
    expect(summaryHeader).not.toBeNull();
  });

  it("요약 리스트 · 각 행 · 순번+상품명+수량 렌더", () => {
    const rows = [
      mkRow("PC001", "타이레놀", null, 5),
      mkRow("PC002", "게보린", null, 3),
    ];
    const { container } = render(<SaveCard {...baseSave} rows={rows} />);
    expect(container.textContent).toContain("타이레놀");
    expect(container.textContent).toContain("게보린");
    // 순번 · 1 · 2 (요약 리스트 안)
    const summary = container.querySelector(".rounded-lg.border.border-line\\/70");
    expect(summary!.textContent).toContain("1");
    expect(summary!.textContent).toContain("2");
    // 수량 · 5개 · 3개
    expect(container.textContent).toContain("5개");
    expect(container.textContent).toContain("3개");
  });

  it("realMap 있음 · 위치 배지 (보라) 노출", () => {
    const rows = [mkRow("PC001", "타이레놀", "12번", 5)];
    const { container } = render(<SaveCard {...baseSave} rows={rows} />);
    // 위치 배지 · text-violet-700
    const location = container.querySelector(".text-violet-700");
    expect(location).not.toBeNull();
    expect(location!.textContent).toBe("12번");
  });

  it("전체 등록 버튼 · rows.length 표시", () => {
    const rows = [
      mkRow("PC001", "A", null, 1),
      mkRow("PC002", "B", null, 2),
      mkRow("PC003", "C", null, 3),
    ];
    const { container } = render(<SaveCard {...baseSave} rows={rows} />);
    expect(container.textContent).toContain("전체 등록 (3건)");
  });

  it("전체 등록 버튼 클릭 · onReview 호출", () => {
    const rows = [mkRow("PC001", "A", null, 1)];
    const onReview = vi.fn();
    const { container } = render(<SaveCard {...baseSave} rows={rows} onReview={onReview} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("전체 등록")) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onReview).toHaveBeenCalled();
  });

  it("saveStatus=saving · 저장 중 표시 + 버튼 비활성", () => {
    const rows = [mkRow("PC001", "A", null, 1)];
    const { container } = render(<SaveCard {...baseSave} rows={rows} saveStatus="saving" />);
    expect(container.textContent).toContain("저장 중");
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("저장 중")) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("saveStatus=done · 완료 표시 + savedCount", () => {
    const rows = [mkRow("PC001", "A", null, 1)];
    const { container } = render(<SaveCard {...baseSave} rows={rows} saveStatus="done" savedCount={5} />);
    expect(container.textContent).toContain("저장 완료 (5건)");
  });

  it("saveStatus=error · 다시 시도 + saveError 메시지", () => {
    const rows = [mkRow("PC001", "A", null, 1)];
    const { container } = render(<SaveCard {...baseSave} rows={rows} saveStatus="error" saveError="네트워크 오류" />);
    expect(container.textContent).toContain("다시 시도");
    expect(container.textContent).toContain("네트워크 오류");
  });
});
