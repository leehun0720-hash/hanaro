import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RETENTION_DAYS = Math.max(1, Number(process.env.ASSET_RETENTION_DAYS ?? 7) || 7);

/**
 * 실습 자산 삭제 배치 (SPEC §3.2·§13) — Vercel Cron 매일.
 *  1) assets.delete_after 지난 행: Storage 파일 + 행 삭제
 *  2) uploads/{uid}/practice 및 practice-music 폴더의 원본 사진·음악: ASSET_RETENTION_DAYS 지난 파일 삭제
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = adminClient();
  const now = new Date();
  const report = { assets_deleted: 0, uploads_deleted: 0, errors: [] as string[] };

  // 1) 만료 자산
  const { data: expired } = await db.from("assets").select("id, storage_path").lt("delete_after", now.toISOString()).limit(500);
  if (expired?.length) {
    const paths = expired.map((a) => a.storage_path);
    const { error } = await db.storage.from("outputs").remove(paths);
    if (error) report.errors.push(`outputs remove: ${error.message}`);
    const { error: delErr } = await db.from("assets").delete().in("id", expired.map((a) => a.id));
    if (delErr) report.errors.push(`assets delete: ${delErr.message}`);
    else report.assets_deleted = expired.length;
  }

  // 2) 실습 원본 업로드 (uploads/{uid}/practice, practice-music)
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400_000);
  const { data: users } = await db.from("profiles").select("id").limit(2000);
  for (const u of users ?? []) {
    for (const folder of ["practice", "practice-music"]) {
      const prefix = `${u.id}/${folder}`;
      const { data: files, error } = await db.storage.from("uploads").list(prefix, { limit: 1000 });
      if (error || !files?.length) continue;
      const old = files.filter((f) => f.created_at && new Date(f.created_at) < cutoff).map((f) => `${prefix}/${f.name}`);
      if (!old.length) continue;
      const { error: rmErr } = await db.storage.from("uploads").remove(old);
      if (rmErr) report.errors.push(`uploads ${prefix}: ${rmErr.message}`);
      else report.uploads_deleted += old.length;
    }
  }

  return NextResponse.json({ ran_at: now.toISOString(), retention_days: RETENTION_DAYS, ...report });
}
