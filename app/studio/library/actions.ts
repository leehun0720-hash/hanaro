"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Asset, Job } from "@/lib/types";

const back = (msg?: string): never => redirect(msg ? `/studio/library?error=${encodeURIComponent(msg)}` : "/studio/library?deleted=1");

/** 저장소 파일 + assets 행 제거. 파일이 이미 없어도 행은 지운다 */
async function removeAssets(assets: Pick<Asset, "id" | "storage_path">[]) {
  if (!assets.length) return;
  const db = adminClient();
  await db.storage.from("outputs").remove(assets.map((a) => a.storage_path)).catch(() => {});
  await db.from("assets").delete().in("id", assets.map((a) => a.id));
}

/** 작업 한 건의 산출물 전체 삭제. 작업 행은 남기되(ro 사용 기록·관리자 로그) 보관함에서는 숨긴다 */
export async function deleteJob(formData: FormData) {
  const me = await requireProfile();
  const jobId = String(formData.get("jobId") ?? "");
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("id, user_id, status").eq("id", jobId).eq("user_id", me.id).maybeSingle();
  if (!job) back("삭제할 작업을 찾을 수 없어요.");
  const j = job as Pick<Job, "id" | "user_id" | "status">;
  if (j.status === "queued" || j.status === "running" || j.status === "waiting") back("진행 중인 작업은 먼저 취소한 뒤 삭제할 수 있어요.");
  const { data: assets } = await db.from("assets").select("id, storage_path").eq("job_id", jobId).eq("user_id", me.id);
  await removeAssets((assets ?? []) as Pick<Asset, "id" | "storage_path">[]);
  const { error } = await db.from("jobs").update({ deleted_at: new Date().toISOString() }).eq("id", jobId);
  if (error) back(`삭제 실패: ${error.message} (마이그레이션 0007 필요)`);
  revalidatePath("/studio/library");
  back();
}

/** 파일 하나만 삭제 */
export async function deleteAsset(formData: FormData) {
  const me = await requireProfile();
  const assetId = String(formData.get("assetId") ?? "");
  const db = adminClient();
  const { data: asset } = await db.from("assets").select("id, storage_path, job_id").eq("id", assetId).eq("user_id", me.id).maybeSingle();
  if (!asset) back("삭제할 파일을 찾을 수 없어요.");
  await removeAssets([asset as Pick<Asset, "id" | "storage_path">]);
  revalidatePath("/studio/library");
  back();
}
