// @vitest-environment jsdom
// 2026-08-20 · VendorInfoHeader · 공급사 정보 헤더 공통 컴포넌트
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { VendorInfoHeader, type VendorInfoFull, type VendorKpis } from "./VendorInfoHeader";

const baseVendor: VendorInfoFull = {
  id: 1,
  company_name: "코스트팜(주)",
  category: "60회전",
  contact_name: "홍길동",
  phone: "01012345678",
  email: "test@example.com",
  business_number: "1234567890",
  created_at: "2026-01-15",
  vat_included: true,
};

describe("VendorInfoHeader · 공급사명·사업자번호", () => {
  it("h2 · title 속성 · 원본 공급사명", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.getAttribute("title")).toBe("코스트팜(주)");
  });

  it("사업자번호 · 하이픈 포맷 (123-45-67890)", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).toContain("123-45-67890");
  });

  it("사업자번호 없음 · 미표시", () => {
    const { container } = render(
      <VendorInfoHeader vendor={{ ...baseVendor, business_number: null }} />
    );
    expect(container.textContent).not.toMatch(/\d{3}-\d{2}-\d{5}/);
  });
});

describe("VendorInfoHeader · VAT 표시", () => {
  it("vat_included=true · 'VAT 포함' 텍스트", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).toContain("VAT 포함");
  });

  it("vat_included=false · '부가세 별도' 텍스트", () => {
    const { container } = render(
      <VendorInfoHeader vendor={{ ...baseVendor, vat_included: false }} />
    );
    expect(container.textContent).toContain("부가세 별도");
  });

  it("vat_included=null + 이름 힌트 없음 · 기본 'VAT 포함'", () => {
    const { container } = render(
      <VendorInfoHeader vendor={{ ...baseVendor, vat_included: null }} />
    );
    expect(container.textContent).toContain("VAT 포함");
  });

  it("vat_included=null + 이름에 'vat미포함' · 자동 부가세 별도", () => {
    const { container } = render(
      <VendorInfoHeader
        vendor={{ ...baseVendor, company_name: "코스트팜(주) vat미포함", vat_included: null }}
      />
    );
    expect(container.textContent).toContain("부가세 별도");
  });
});

describe("VendorInfoHeader · 담당자·전화·이메일·등록일", () => {
  it("담당자 이름 표시", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).toContain("홍길동");
  });

  it("전화번호 · 11자리 포맷", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).toContain("010-1234-5678");
  });

  it("전화번호 · tel: href", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    const link = container.querySelector('a[href^="tel:"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("tel:01012345678");
  });

  it("전화번호 · 10자리 · 하이픈 포맷", () => {
    const { container } = render(
      <VendorInfoHeader vendor={{ ...baseVendor, phone: "0212345678" }} />
    );
    expect(container.textContent).toContain("021-234-5678");
  });

  it("등록일 · '등록' 텍스트 포함", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).toContain("등록");
  });
});

describe("VendorInfoHeader · onEdit 버튼", () => {
  it("onEdit 없음 · 버튼 미렌더", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).not.toContain("조회·수정");
  });

  it("onEdit 있음 · 클릭 시 콜백", () => {
    const onEdit = vi.fn();
    const { container } = render(<VendorInfoHeader vendor={baseVendor} onEdit={onEdit} />);
    const btn = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes("조회·수정"));
    expect(btn).toBeDefined();
    fireEvent.click(btn!);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

// 2026-09-08 · 사용자 지시 · KPI 재디자인 · 3개월/이번달/잔고 텍스트 라인
//   · 이전 · 누적/평균주기/활성상품 미니카드 (제거됨)
describe("VendorInfoHeader · KPI (2026-09-08 재디자인)", () => {
  const kpis: VendorKpis = {
    totalAmount: 1_000_000,
    thisMonthAmount: 200_000,
    lastMonthAmount: 150_000,
    threeMonthAmount: 500_000,
    momPct: 33.3,
    avgCycleDays: 7,
    activeSkuCount: 42,
    balance: 50_000,
  };

  it("kpis 없음 · KPI 라인 미렌더", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.textContent).not.toContain("3개월 매입");
    expect(container.textContent).not.toContain("잔고");
  });

  it("kpis 있음 · '3개월 매입' · '이번달 매입' · '잔고' 표시", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} kpis={kpis} />);
    expect(container.textContent).toContain("3개월 매입");
    expect(container.textContent).toContain("이번달 매입");
    expect(container.textContent).toContain("잔고");
  });

  it("MoM > 5 · '전월 대비 +33.3%'", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} kpis={kpis} />);
    expect(container.textContent).toContain("전월 대비 +33.3%");
  });

  it("MoM=null · MoM 라벨 미표시", () => {
    const { container } = render(
      <VendorInfoHeader vendor={baseVendor} kpis={{ ...kpis, momPct: null }} />
    );
    expect(container.textContent).not.toContain("전월 대비");
  });

  it("balance > 0 · '미결제' 배지", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} kpis={kpis} />);
    expect(container.textContent).toContain("미결제");
  });

  it("balance < 0 · '선결제' 배지", () => {
    const { container } = render(
      <VendorInfoHeader vendor={baseVendor} kpis={{ ...kpis, balance: -10_000 }} />
    );
    expect(container.textContent).toContain("선결제");
  });

  it("balance = null · '-' 표시", () => {
    const { container } = render(
      <VendorInfoHeader vendor={baseVendor} kpis={{ ...kpis, balance: null }} />
    );
    // 잔고 라벨 뒤 "-"
    expect(container.textContent).toContain("잔고");
    expect(container.textContent).toMatch(/잔고.*[-]/s);
  });
});

describe("VendorInfoHeader · dense mode", () => {
  it("dense=true · p-2.5 클래스", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} dense />);
    expect(container.querySelector(".p-2\\.5")).not.toBeNull();
  });

  it("dense=false · p-3 클래스", () => {
    const { container } = render(<VendorInfoHeader vendor={baseVendor} />);
    expect(container.querySelector(".p-3")).not.toBeNull();
  });
});
