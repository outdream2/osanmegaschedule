// src/components/HrFormsPage/utils.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · HrFormsPage 유틸 이관
import React from "react";
import {
  FileText, FileImage, FileSpreadsheet, FileArchive, File,
} from "lucide-react";
import { api } from "../../lib/apiClient";

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${dd} ${hh}:${mm}`;
  } catch { return String(iso); }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}

// 다운로드 · 원본 파일명 유지 · api.getBlob → blob → object URL
// 외부 URL(Supabase Storage 등) 포함 · CORS-safe fetch 사용 (withCredentials 없음)
export async function downloadFile(url: string, filename: string) {
  try {
    const blob = await api.getBlob(url);
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "form";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    // fallback · 새 탭 열기
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** MIME/확장자 기반 파일 아이콘 + 색상 */
export function fileIconInfo(fileName: string | null, mimeType?: string | null): {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
  label: string;
} {
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const mime = (mimeType ?? "").toLowerCase();

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return { Icon: FileImage, colorClass: "text-pink-500 bg-pink-50", label: "이미지" };
  }
  if (["xlsx", "xls", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return { Icon: FileSpreadsheet, colorClass: "text-green-600 bg-green-50", label: "스프레드시트" };
  }
  if (["pdf"].includes(ext) || mime === "application/pdf") {
    return { Icon: File, colorClass: "text-red-500 bg-red-50", label: "PDF" };
  }
  if (["hwp", "hwpx"].includes(ext)) {
    return { Icon: FileText, colorClass: "text-blue-500 bg-blue-50", label: "한글" };
  }
  if (["doc", "docx"].includes(ext) || mime.includes("word")) {
    return { Icon: FileText, colorClass: "text-blue-600 bg-blue-50", label: "Word" };
  }
  if (["ppt", "pptx"].includes(ext) || mime.includes("presentation")) {
    return { Icon: FileText, colorClass: "text-orange-500 bg-orange-50", label: "PPT" };
  }
  return { Icon: FileArchive, colorClass: "text-zinc-500 bg-zinc-100", label: "파일" };
}
