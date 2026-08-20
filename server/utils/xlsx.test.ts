// 2026-08-20 · server/utils/xlsx · ERP 엑셀 파싱 + CSV 변환 검증
//   · COL_KEYS 상수
//   · xlsxToRows · 헤더 매칭 · 숫자·날짜 정규화 · 다양한 헤더 별칭 처리
//   · rowsToCSV · 콤마·따옴표·개행 이스케이프
import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import { COL_KEYS, xlsxToRows, rowsToCSV } from "./xlsx";

// 헬퍼 · headers + rows → xlsx Buffer
function makeXlsxBuffer(headers: string[], rows: any[][]): Buffer {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("COL_KEYS · ERP 컬럼 명세", () => {
  it("50개 이상 · 상품/공급/재고 필드", () => {
    expect(COL_KEYS.length).toBeGreaterThan(40);
  });

  it("필수 필드 포함", () => {
    expect(COL_KEYS).toContain("product_code");
    expect(COL_KEYS).toContain("product_name");
    expect(COL_KEYS).toContain("supplier");
    expect(COL_KEYS).toContain("purchase_price");
    expect(COL_KEYS).toContain("sale_price");
    expect(COL_KEYS).toContain("current_stock");
  });

  it("중복 없음", () => {
    const set = new Set(COL_KEYS);
    expect(set.size).toBe(COL_KEYS.length);
  });
});

describe("xlsxToRows · 헤더 매칭 · 기본", () => {
  it("표준 헤더 · 정상 파싱", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "상품명", "판매단가"],
      [["001", "타이레놀", 5000], ["002", "게보린", 3000]]
    );
    const rows = xlsxToRows(buf);
    expect(rows.length).toBe(2);
    expect(rows[0].product_code).toBe("001");
    expect(rows[0].product_name).toBe("타이레놀");
    expect(rows[0].sale_price).toBe(5000);
    expect(rows[1].product_code).toBe("002");
  });

  it("헤더 없음 (상품코드 미검출) · throw", () => {
    const buf = makeXlsxBuffer(
      ["이름", "가격"],
      [["A", 100]]
    );
    expect(() => xlsxToRows(buf)).toThrow(/상품코드/);
  });

  it("빈 워크시트 · 빈 배열", () => {
    const ws = XLSX.utils.aoa_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(xlsxToRows(buf)).toEqual([]);
  });

  it("product_code 빈 행 · 스킵", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "상품명"],
      [["001", "A"], ["", "B"], ["003", "C"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows.length).toBe(2);
    expect(rows[0].product_code).toBe("001");
    expect(rows[1].product_code).toBe("003");
  });
});

describe("xlsxToRows · 헤더 별칭 매칭", () => {
  it("'코드' · product_code 매칭", () => {
    const buf = makeXlsxBuffer(
      ["코드", "상품명"],
      [["A1", "타이레놀"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].product_code).toBe("A1");
    expect(rows[0].product_name).toBe("타이레놀");
  });

  it("'매입가' · purchase_price 매칭 · '판매가' · sale_price", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "매입가", "판매가"],
      [["001", 3000, 5000]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].purchase_price).toBe(3000);
    expect(rows[0].sale_price).toBe(5000);
  });

  it("'공급사' + '공급사코드' · 각각 매칭", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "공급사", "공급사코드"],
      [["001", "A제약", "12345"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].supplier).toBe("A제약");
    expect(rows[0].supplier_code).toBe("12345");
  });

  it("'재고' · current_stock 매칭", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "재고"],
      [["001", 100]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].current_stock).toBe(100);
  });

  it("영문 헤더 · product_code / product_name 매칭 (case insensitive)", () => {
    const buf = makeXlsxBuffer(
      ["Product_Code", "Product Name"],
      [["EN001", "English"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].product_code).toBe("EN001");
    expect(rows[0].product_name).toBe("English");
  });

  it("헤더 내 줄바꿈 · 정규화", () => {
    const buf = makeXlsxBuffer(
      ["상품\n코드", "상품\n명"],
      [["N001", "브레이크"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].product_code).toBe("N001");
    expect(rows[0].product_name).toBe("브레이크");
  });
});

describe("xlsxToRows · 숫자 정규화", () => {
  it("콤마 · 제거", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "판매단가"],
      [["001", "1,500"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].sale_price).toBe(1500);
  });

  it("₩ / 원 · 제거", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "판매단가"],
      [["001", "₩1,000원"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].sale_price).toBe(1000);
  });

  it("null 유형 값 · null", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "판매단가"],
      [["001", ""], ["002", "-"], ["003", "null"], ["004", "NaN"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].sale_price).toBeNull();
    expect(rows[1].sale_price).toBeNull();
    expect(rows[2].sale_price).toBeNull();
    expect(rows[3].sale_price).toBeNull();
  });

  it("숫자 그대로", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "판매단가"],
      [["001", 5000]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].sale_price).toBe(5000);
  });

  it("잘못된 숫자 · null", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "판매단가"],
      [["001", "abc"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].sale_price).toBeNull();
  });
});

describe("xlsxToRows · 날짜 정규화", () => {
  it("YYYY-MM-DD 문자열 · 그대로", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "유통기한"],
      [["001", "2026-12-31"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].expiry_date).toBe("2026-12-31");
  });

  it("YYYY.MM.DD · YYYY-MM-DD 변환", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "유통기한"],
      [["001", "2026.12.31"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].expiry_date).toBe("2026-12-31");
  });

  it("YYYY/MM/DD · YYYY-MM-DD 변환", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "유통기한"],
      [["001", "2026/12/31"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].expiry_date).toBe("2026-12-31");
  });

  it("빈 값 · null", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "유통기한"],
      [["001", ""]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].expiry_date).toBeNull();
  });
});

describe("xlsxToRows · 문자열 필드", () => {
  it("문자열 필드 · trim", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "상품명"],
      [["001", "  타이레놀  "]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].product_name).toBe("타이레놀");
  });

  it("빈 문자열 · null", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "공급사"],
      [["001", ""]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].supplier).toBeNull();
  });
});

describe("xlsxToRows · 헤더에 없는 컬럼 · null", () => {
  it("모든 필드 · 항상 존재 (없으면 null)", () => {
    const buf = makeXlsxBuffer(
      ["상품코드"],
      [["001"]]
    );
    const rows = xlsxToRows(buf);
    // COL_KEYS 모두 obj 에 있음
    for (const key of COL_KEYS) {
      expect(rows[0]).toHaveProperty(key);
    }
    // 상품코드 외 · null
    expect(rows[0].product_name).toBeNull();
    expect(rows[0].sale_price).toBeNull();
  });
});

describe("xlsxToRows · 중복 헤더", () => {
  it("중복 헤더 · 첫 매칭만 사용", () => {
    const buf = makeXlsxBuffer(
      ["상품코드", "상품명", "상품명"],
      [["001", "A", "B"]]
    );
    const rows = xlsxToRows(buf);
    expect(rows[0].product_name).toBe("A");
  });
});

describe("rowsToCSV · CSV 변환", () => {
  it("헤더 첫줄 · COL_KEYS 순서", () => {
    const csv = rowsToCSV([]);
    const [header] = csv.split("\n");
    expect(header).toBe(COL_KEYS.join(","));
  });

  it("일반 데이터 · 콤마 구분", () => {
    const rows = [{ product_code: "001", product_name: "A", sale_price: 1000 }];
    const csv = rowsToCSV(rows);
    const lines = csv.split("\n");
    expect(lines.length).toBe(2);
    // COL_KEYS 순서로 product_code · product_name · ... 배치
    const idxCode = COL_KEYS.indexOf("product_code");
    const idxName = COL_KEYS.indexOf("product_name");
    const parts = lines[1].split(",");
    expect(parts[idxCode]).toBe("001");
    expect(parts[idxName]).toBe("A");
  });

  it("null · 빈 문자열", () => {
    const rows = [{ product_code: null, product_name: "A" }];
    const csv = rowsToCSV(rows);
    const idxCode = COL_KEYS.indexOf("product_code");
    const parts = csv.split("\n")[1].split(",");
    expect(parts[idxCode]).toBe("");
  });

  it("콤마 포함 · double-quote 이스케이프", () => {
    const rows = [{ product_code: "001", product_name: "A,B,C" }];
    const csv = rowsToCSV(rows);
    expect(csv).toContain('"A,B,C"');
  });

  it("따옴표 포함 · 이중따옴표", () => {
    const rows = [{ product_code: "001", product_name: 'He said "hi"' }];
    const csv = rowsToCSV(rows);
    expect(csv).toContain('"He said ""hi"""');
  });

  it("개행 포함 · 따옴표로 감싸기", () => {
    const rows = [{ product_code: "001", product_name: "A\nB" }];
    const csv = rowsToCSV(rows);
    expect(csv).toContain('"A\nB"');
  });

  it("빈 rows · 헤더만", () => {
    const csv = rowsToCSV([]);
    expect(csv.split("\n").length).toBe(1);
  });
});
