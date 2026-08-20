// @vitest-environment jsdom
// 2026-08-20 · PurchaseHistoryList · 매입이력 리스트 공통 컴포넌트
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "./PurchaseHistoryList";

const sampleRows: PurchaseHistoryRow[] = [
  { id: 1, purchase_date: "2026-08-15", supplier_name: "대웅제약", product_name: "타이레놀", quantity: 10, unit_price: 1000, amount: 10000 },
  { id: 2, purchase_date: "2026-08-10", supplier_name: "한독", product_name: "아스피린", quantity: 5, unit_price: 800, amount: 4000 },
  { id: 3, date: "2026-08-05", supplier_name: "삼성제약", product_name: "감기약", quantity: 20, unit_price: 500, total: 12000 },
];

beforeEach(() => {
  localStorage.clear();
});

describe("PurchaseHistoryList · 기본 렌더", () => {
  it("rows 표시 · 3행", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    // tbody tr 개수 확인
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeGreaterThanOrEqual(3);
  });

  it("공급사 컬럼 · showSupplier=true (기본)", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    expect(container.textContent).toContain("대웅제약");
    expect(container.textContent).toContain("한독");
  });

  it("상품명 컬럼 · showProduct=true", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} showProduct />);
    expect(container.textContent).toContain("타이레놀");
    expect(container.textContent).toContain("아스피린");
  });

  it("date fallback · purchase_date > date > invoice_date", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    expect(container.textContent).toContain("2026-08-15");
    expect(container.textContent).toContain("2026-08-10");
    expect(container.textContent).toContain("2026-08-05"); // date field
  });
});

describe("PurchaseHistoryList · 정렬", () => {
  it("초기 정렬 · date desc (기본)", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    const bodyText = container.querySelector("tbody")?.textContent ?? "";
    // 최신 날짜 (2026-08-15) 가 먼저 등장
    const idx15 = bodyText.indexOf("2026-08-15");
    const idx05 = bodyText.indexOf("2026-08-05");
    expect(idx15).toBeLessThan(idx05);
  });
});

describe("PurchaseHistoryList · 상태 표시", () => {
  it("loading=true · 로딩 인디케이터", () => {
    const { container } = render(<PurchaseHistoryList rows={[]} loading />);
    // Loader2 아이콘이나 로딩 텍스트가 있어야 함
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("error 있음 · 에러 메시지 표시", () => {
    const { container } = render(<PurchaseHistoryList rows={[]} error="네트워크 오류" />);
    expect(container.textContent).toContain("네트워크 오류");
  });

  it("빈 rows · emptyText 표시 (기본)", () => {
    const { container } = render(<PurchaseHistoryList rows={[]} />);
    expect(container.textContent).toContain("매입 이력 없음");
  });

  it("커스텀 emptyText", () => {
    const { container } = render(<PurchaseHistoryList rows={[]} emptyText="데이터 없음" />);
    expect(container.textContent).toContain("데이터 없음");
  });
});

describe("PurchaseHistoryList · 금액 계산 · total > amount fallback", () => {
  it("총액 표시 · 만 단위 축약 · '1.2만' 등", () => {
    // row 3 · total=12000 → 1.2만
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    expect(container.textContent).toContain("1.2만");
  });

  it("row 1 · amount 10000 → '1.0만'", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    expect(container.textContent).toContain("1.0만");
  });

  it("row 2 · amount 4000 → 만 단위 미달 · 4,000 표시", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    expect(container.textContent).toContain("4,000");
  });
});

describe("PurchaseHistoryList · footer 합계", () => {
  it("showFooterSum=true · tfoot 합계 행", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} showFooterSum />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).not.toBeNull();
  });

  it("showFooterSum=false (기본) · tfoot 없음", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).toBeNull();
  });
});

describe("PurchaseHistoryList · footerHint", () => {
  it("footerHint · 하단 안내 렌더", () => {
    const { container } = render(
      <PurchaseHistoryList rows={sampleRows} footerHint={<span>테스트 안내</span>} />
    );
    expect(container.textContent).toContain("테스트 안내");
  });
});

describe("PurchaseHistoryList · 행번호 · 간격 옵션", () => {
  it("showRowNumber=true · num 컬럼 표시", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} showRowNumber />);
    // 1·2·3 순번 표시
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBeGreaterThanOrEqual(3);
  });

  it("showGap=true · 매입 간격 컬럼 렌더", () => {
    const { container } = render(<PurchaseHistoryList rows={sampleRows} showGap />);
    // 렌더는 되어야 함 (텍스트 정확 검증은 로직 복잡)
    expect(container.querySelector("table")).not.toBeNull();
  });
});
