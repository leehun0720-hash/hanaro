"use client";
import { useState } from "react";
import { IMAGE_TYPES, resizeImage, uploadToStorage } from "@/lib/client-upload";

const MAX_PHOTOS = 3;

/**
 * 프로젝트 사진 업로드 — 브라우저에서 리사이즈 후 저장소로 직접 올리고, 폼에는 경로만 hidden으로 넣는다.
 * (사진을 서버 액션 본문에 실으면 1MB/4.5MB 제한으로 500이 난다)
 */
export function ProjectPhotos({ userId }: { userId: string }) {
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...photos];
      for (const f of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) break;
        if (!IMAGE_TYPES.includes(f.type)) {
          setError("JPG·PNG·WebP만 올릴 수 있어요.");
          continue;
        }
        if (f.size > 20 * 1024 * 1024) {
          setError("사진 한 장은 20MB 이하여야 해요.");
          continue;
        }
        const blob = await resizeImage(f);
        const path = `${userId}/projects/${crypto.randomUUID()}.jpg`;
        await uploadToStorage("uploads", path, blob, "image/jpeg");
        next.push({ path, preview: URL.createObjectURL(blob) });
      }
      setPhotos(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label" htmlFor="photos">우리 조합 사진 최대 {MAX_PHOTOS}장 (선택, jpg/png/webp)</label>
      <input id="photos" type="file" accept={IMAGE_TYPES.join(",")} multiple className="input" disabled={busy || photos.length >= MAX_PHOTOS} onChange={(e) => void onPick(e.target.files)} />
      {photos.map((p) => <input key={p.path} type="hidden" name="photos" value={p.path} />)}
      <p className="hint">{busy ? "올리는 중… (브라우저에서 2048px로 줄여 올립니다)" : "매장·과수원·행사 사진. 사람 얼굴이 있는 사진은 동의 받은 것만 올리세요."}</p>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <span key={p.path} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`사진 ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((x) => x.path !== p.path))} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white" aria-label="사진 제거">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
