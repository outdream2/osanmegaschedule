// 2026-08-20 · hrForms · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreateHrFormSchema, HR_FORM_CATEGORIES } from "./hrForms";

describe("HR_FORM_CATEGORIES · 상수", () => {
  it("contract/resignation/pledge/etc 4종", () => {
    expect(HR_FORM_CATEGORIES).toEqual(["contract", "resignation", "pledge", "etc"]);
  });
});

describe("CreateHrFormSchema", () => {
  const valid = {
    title: "근로계약서 양식",
    data_url: "data:application/pdf;base64,xxx",
  };

  it("최소 · 성공 · defaults", () => {
    const r = CreateHrFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBe("contract");
      expect(r.data.file_name).toBe("form");
    }
  });

  it("title 없음 · 실패", () => {
    const r = CreateHrFormSchema.safeParse({ data_url: "x" });
    expect(r.success).toBe(false);
  });

  it("title · 200자 초과 · 실패", () => {
    const r = CreateHrFormSchema.safeParse({ ...valid, title: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("data_url · 빈 · 실패", () => {
    const r = CreateHrFormSchema.safeParse({ ...valid, data_url: "" });
    expect(r.success).toBe(false);
  });

  it("category · 4종 만 허용", () => {
    HR_FORM_CATEGORIES.forEach((c) => {
      expect(CreateHrFormSchema.safeParse({ ...valid, category: c }).success).toBe(true);
    });
    expect(CreateHrFormSchema.safeParse({ ...valid, category: "invalid" }).success).toBe(false);
  });

  it("file_name · 200자 초과 · 실패", () => {
    const r = CreateHrFormSchema.safeParse({ ...valid, file_name: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("uploaded_by · null 허용", () => {
    const r = CreateHrFormSchema.safeParse({ ...valid, uploaded_by: null });
    expect(r.success).toBe(true);
  });

  it("uploaded_by_id · number/string 양쪽", () => {
    expect(CreateHrFormSchema.safeParse({ ...valid, uploaded_by_id: 1 }).success).toBe(true);
    expect(CreateHrFormSchema.safeParse({ ...valid, uploaded_by_id: "u1" }).success).toBe(true);
    expect(CreateHrFormSchema.safeParse({ ...valid, uploaded_by_id: null }).success).toBe(true);
  });
});
