import { adminClient } from "@/lib/supabase/admin";
import type { Project } from "@/lib/types";

/** 프로젝트 사진 미리보기용 서명 URL (선택 화면 썸네일). 본인 프로젝트 사진만 넘길 것 */
export async function projectPhotoUrls(projects: Project[], seconds = 60 * 60): Promise<Record<string, string>> {
  const paths = [...new Set(projects.flatMap((p) => p.photos ?? []))];
  if (!paths.length) return {};
  const { data } = await adminClient().storage.from("uploads").createSignedUrls(paths, seconds);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}
