"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/** 사진 업로드·AI 처리·N일 후 삭제 동의 기록 (SPEC §13) */
export async function recordConsent(formData: FormData) {
  if (formData.get("agree") !== "on") redirect("/studio/practice?error=" + encodeURIComponent("동의 항목에 체크해 주세요."));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await adminClient().from("profiles").update({ consent_at: new Date().toISOString() }).eq("id", user!.id);
  revalidatePath("/studio/practice");
  redirect("/studio/practice");
}
