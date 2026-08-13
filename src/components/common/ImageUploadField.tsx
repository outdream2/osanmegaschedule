// src/components/common/ImageUploadField.tsx
// 2026-08-12 · 공통 이미지 업로드 필드 · Supabase Storage 업로드 + URL 자동 세팅 + 미리보기
//   · 로고 · 파비콘 · QR · 도장 등 브랜딩 관련 이미지 통합 사용
//   · TextField 대체 · URL 직접 입력도 유지 (기존 URL 도 표시)
//   · 업로드 성공 시 · 반환 public URL 을 onChange 콜백으로 즉시 전달 → 저장은 상위 훅이 처리
import React, { useRef, useState } from "react";
import { Upload, Trash, ImageSquare, CircleNotch } from "@phosphor-icons/react";
import { supabase } from "../../supabase/client";

interface Props {
  label: string;
  value: string;                     // 현재 URL (빈 문자열 가능)
  onChange: (nextUrl: string) => void;
  /** Supabase Storage 버킷 이름 · 기본 "branding" */
  bucket?: string;
  /** 저장 경로 접두 · 예: "logo" · "qr" · "stamp_강남성" */
  prefix?: string;
  /** accept · 기본 "image/*" */
  accept?: string;
  placeholder?: string;
  hint?: string;
}

const LABEL_CLS = "text-[11px] font-semibold text-zinc-600 block mb-1.5";
const INPUT_CLS = "flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:border-indigo-500 transition";
const BTN_CLS = "shrink-0 flex items-center gap-1 px-2.5 h-[38px] rounded-lg text-[11px] font-semibold border cursor-pointer transition";

export const ImageUploadField: React.FC<Props> = ({
  label, value, onChange,
  bucket = "branding",
  prefix = "img",
  accept = "image/*",
  placeholder = "URL 또는 파일 업로드",
  hint,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${prefix}_${Date.now()}.${ext}`;
      const { data, error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type || "image/png",
      });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data.path);
      onChange(pub.publicUrl);
    } catch (e: any) {
      setError(e?.message ?? "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <div className="flex items-stretch gap-2">
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT_CLS}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${BTN_CLS} bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50`}
        >
          {uploading ? <CircleNotch size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "업로드 중" : "파일"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={`${BTN_CLS} bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100`}
            title="URL 지우기 (기본 이미지 사용)"
          >
            <Trash size={12} />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>
      {hint && !error && <p className="text-[10px] text-zinc-400 mt-1">{hint}</p>}
      {error && <p className="text-[10px] text-rose-500 mt-1">{error}</p>}
      {value && (
        <div className="mt-2 border border-zinc-200 rounded-md p-2 bg-zinc-50 flex items-center gap-2">
          <ImageSquare size={12} className="text-zinc-400 shrink-0" />
          <img
            src={value}
            alt="preview"
            className="max-h-16 max-w-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageUploadField;
