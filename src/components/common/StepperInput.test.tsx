// @vitest-environment jsdom
// 2026-08-18 · StepperInput · 렌더 + increment/decrement/min/max
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { StepperInput } from "./StepperInput";

describe("StepperInput · 기본 렌더", () => {
  it("input · button − · button + · 3요소 렌더", () => {
    const { container } = render(<StepperInput value={0} onChange={() => {}} />);
    expect(container.querySelectorAll("button").length).toBe(2);
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("value 표시 · 5 · 렌더에 반영", () => {
    const { container } = render(<StepperInput value={5} onChange={() => {}} />);
    const input = container.querySelector("input")! as HTMLInputElement;
    expect(input.value).toBe("5");
  });

  it("value=''· input.value=''", () => {
    const { container } = render(<StepperInput value="" onChange={() => {}} />);
    const input = container.querySelector("input")! as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("StepperInput · +/- 콜백", () => {
  it("+ 클릭 · onChange(1) 호출", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={0} onChange={fn} />);
    const btns = container.querySelectorAll("button");
    (btns[1] as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("- 클릭 · onChange(0) 호출 · value=1", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={1} onChange={fn} />);
    const btns = container.querySelectorAll("button");
    (btns[0] as HTMLElement).click();
    expect(fn).toHaveBeenCalledWith(0);
  });

  it("- 클릭 · value=0 min=0 · 콜백 안 호출", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={0} onChange={fn} />);
    const btns = container.querySelectorAll("button");
    (btns[0] as HTMLElement).click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("input onChange · Number 변환", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={0} onChange={fn} />);
    const input = container.querySelector("input")! as HTMLInputElement;
    fireEvent.change(input, { target: { value: "42" } });
    expect(fn).toHaveBeenCalledWith(42);
  });

  it("input clear · onChange('') 호출", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={5} onChange={fn} />);
    const input = container.querySelector("input")! as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(fn).toHaveBeenCalledWith("");
  });
});

describe("StepperInput · min/max", () => {
  it("max=10 · value=10 · + 안 눌림", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={10} onChange={fn} max={10} />);
    const btns = container.querySelectorAll("button");
    (btns[1] as HTMLElement).click();
    expect(fn).not.toHaveBeenCalled();
  });

  it("min=2 · value=2 · - 안 눌림", () => {
    const fn = vi.fn();
    const { container } = render(<StepperInput value={2} onChange={fn} min={2} />);
    const btns = container.querySelectorAll("button");
    (btns[0] as HTMLElement).click();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("StepperInput · size · disabled", () => {
  it("size='sm' · h-9", () => {
    const { container } = render(<StepperInput value={0} onChange={() => {}} size="sm" />);
    expect(container.querySelector("div")!.className).toContain("h-9");
  });
  it("size='lg' · h-11", () => {
    const { container } = render(<StepperInput value={0} onChange={() => {}} size="lg" />);
    expect(container.querySelector("div")!.className).toContain("h-11");
  });
  it("disabled · opacity-50 + input disabled", () => {
    const { container } = render(<StepperInput value={0} onChange={() => {}} disabled />);
    expect(container.querySelector("div")!.className).toContain("opacity-50");
    expect((container.querySelector("input") as HTMLInputElement).disabled).toBe(true);
  });
});
