"use client";
import { createClient } from "@/lib/supabase/client";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIDE = 2048;

/** 브라우저에서 리사이즈(최대 2048px) 후 JPEG로 — 업로드 용량·AI 입력 크기를 줄인다 */
export async function resizeImage(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), "image/jpeg", 0.92));
}

/** 브라우저 → Supabase Storage 직접 업로드 (서버 액션 1MB·Vercel 4.5MB 본문 제한 우회) */
export async function uploadToStorage(bucket: "uploads" | "outputs", path: string, blob: Blob, contentType: string): Promise<string> {
  const { error } = await createClient().storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return path;
}
