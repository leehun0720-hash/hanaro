"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";
import { errText } from "@/lib/admin-diag";

const fail = (msg: string) => redirect("/admin?error=" + encodeURIComponent(msg));

export async function adjustCredits(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim() || "관리자 조정";
  if (!userId || !Number.isInteger(delta) || delta === 0) fail("조정 값을 확인하세요.");
  try {
    await addCredits(userId, delta, `admin:${admin.email}:${reason}`, null);
  } catch (e) {
    fail(`ro 조정 실패: ${errText(e)}`);
  }
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

export async function setRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role")) === "admin" ? "admin" : "member";
  if (userId === admin.id) fail("본인 권한은 바꿀 수 없습니다.");
  const { error } = await adminClient().from("profiles").update({ role }).eq("id", userId);
  if (error) fail(`역할 변경 실패: ${error.message}`);
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

export async function setSubscriptionStatus(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status"));
  if (!["active", "canceled", "past_due", "none"].includes(status)) redirect("/admin");
  const db = adminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    const { data: s } = await db.from("subscriptions").select("next_billing_at").eq("user_id", userId).maybeSingle();
    if (!s?.next_billing_at) {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1);
      patch.started_at = new Date().toISOString(); patch.next_billing_at = d.toISOString();
    }
  }
  const { error } = await db.from("subscriptions").upsert({ user_id: userId, customer_key: `cust_${userId}`, ...patch }, { onConflict: "user_id" });
  if (error) fail(`구독 변경 실패: ${error.message}`);
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

/** 회원 정보 수정: 이름·소속. 이메일은 인증 계정과 묶여 있어 여기서 바꾸지 않는다 */
export async function updateMember(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const org_name = String(formData.get("org_name") ?? "").trim().slice(0, 60);
  if (!userId) redirect("/admin?error=" + encodeURIComponent("회원을 찾을 수 없습니다."));
  const { error } = await adminClient().from("profiles").update({ name: name || null, org_name: org_name || null }).eq("id", userId);
  if (error) redirect("/admin?error=" + encodeURIComponent(error.message));
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

/**
 * 회원 삭제: 인증 계정을 지우면 profiles·jobs·assets·practice_credits가 연쇄 삭제된다.
 * Storage의 본인 폴더(uploads/outputs)도 함께 비운다. 본인 계정은 삭제 불가.
 */
export async function deleteMember(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) redirect("/admin?error=" + encodeURIComponent("회원을 찾을 수 없습니다."));
  if (userId === admin.id) redirect("/admin?error=" + encodeURIComponent("본인 계정은 삭제할 수 없습니다."));
  const db = adminClient();

  // Storage 정리 (실패해도 계정 삭제는 진행)
  for (const bucket of ["uploads", "outputs"] as const) {
    try {
      const paths: string[] = [];
      const walk = async (prefix: string) => {
        const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
        for (const f of data ?? []) {
          const p = `${prefix}/${f.name}`;
          if (f.id) paths.push(p);
          else await walk(p); // 폴더
        }
      };
      await walk(userId);
      if (paths.length) await db.storage.from(bucket).remove(paths);
    } catch (e) {
      console.warn(`[admin] ${bucket} 정리 실패 (계속 진행):`, e instanceof Error ? e.message : e);
    }
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) redirect("/admin?error=" + encodeURIComponent(`삭제 실패: ${error.message}`));
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}
