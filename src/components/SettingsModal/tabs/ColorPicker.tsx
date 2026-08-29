// src/components/SettingsModal/tabs/ColorPicker.tsx
// 2026-08-29 · SettingsModal 분리 · ColorPicker 공용 서브컴포넌트
import React, { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { COLOR_PRESETS, findPresetByBg } from "../../../constants";
import { Card } from "../../common/Card";

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentPreset = findPresetByBg(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 rounded-md border border-zinc-300 shadow-sm hover:ring-2 hover:ring-zinc-300 transition cursor-pointer"
        style={{ backgroundColor: value }}
        title={currentPreset ? `색상: ${currentPreset.label}` : "색상 선택"}
        aria-label="색상 선택"
      />
      {open && (
        <Card
          variant="raw-xl"
          rounded="lg"
          padding="none"
          className="absolute z-20 bottom-full right-0 mb-1 p-2 w-[196px] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {COLOR_PRESETS.map((p) => {
              const selected = p.bg.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.bg); setOpen(false); }}
                  className={`relative w-7 h-7 rounded-md border cursor-pointer transition hover:scale-110 ${
                    selected ? "border-zinc-800 ring-2 ring-zinc-400" : "border-line"
                  }`}
                  style={{ backgroundColor: p.bg }}
                  title={p.label}
                  aria-label={p.label}
                  aria-pressed={selected}
                >
                  {selected && (
                    <Check size={12} className="absolute inset-0 m-auto text-zinc-800" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-zinc-100">
            <span className="text-[10px] font-bold text-zinc-500">직접</span>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-line p-0.5 bg-white"
              title="직접 색상 선택"
            />
            <span className="text-[10px] font-mono text-zinc-400 uppercase">{value}</span>
          </div>
        </Card>
      )}
    </div>
  );
};
