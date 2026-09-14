"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getBranding, invalidateBranding } from "@/lib/branding";

const schema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(40),
  byline: z.string().trim().max(40).default(""),
  tagline: z.string().trim().min(1, "소개 문구를 입력하세요.").max(200),
  owner: z.string().trim().min(1, "저작권 표기를 입력하세요.").max(60),
});

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const LOGO_MAX = 1024 * 1024;

const fail = (msg: string): never => redirect("/admin/branding?error=" + encodeURIComponent(msg));

function afterChange() {
  invalidateBranding();
  revalidatePath("/", "layout");
}

/** 이름·부제·소개·저작권 + (선택) 로고 파일 저장 */
export async function saveBranding(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const db = adminClient();
  const patch: Record<string, unknown> = { ...parsed.data!, updated_at: new Date().toISOString() };

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) fail("로고는 PNG·JPG·WebP·SVG만 올릴 수 있어요.");
    if (file.size > LOGO_MAX) fail("로고 파일은 1MB 이하여야 해요.");
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from("branding").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (upErr) fail(`로고 업로드 실패: ${upErr.message} (마이그레이션 0007을 실행했는지 확인)`);
    const prev = (await getBranding()).logoPath;
    if (prev && prev !== path) await db.storage.from("branding").remove([prev]).catch(() => {});
    patch.logo_path = path;
  }

  const { error } = await db.from("site_settings").upsert({ id: 1, ...patch }, { onConflict: "id" });
  if (error) fail(`저장 실패: ${error.message} (마이그레이션 0007을 실행했는지 확인)`);
  afterChange();
  redirect("/admin/branding?ok=1");
}

/** 로고 이미지 제거 → 이름 첫 글자 배지로 돌아간다 */
export async function removeLogo() {
  await requireAdmin();
  const db = adminClient();
  const prev = (await getBranding()).logoPath;
  if (prev) await db.storage.from("branding").remove([prev]).catch(() => {});
  const { error } = await db.from("site_settings").update({ logo_path: null, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) fail(`저장 실패: ${error.message}`);
  afterChange();
  redirect("/admin/branding?ok=1");
}
