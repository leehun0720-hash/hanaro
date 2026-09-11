"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  price_krw: z.coerce.number().int().min(0),
  monthly_credits: z.coerce.number().int().min(0),
  document: z.coerce.number().int().min(0),
  newsletter: z.coerce.number().int().min(0),
  cardnews_page: z.coerce.number().int().min(0),
  promo_video: z.coerce.number().int().min(0),
  music_video: z.coerce.number().int().min(0),
  practice: z.coerce.number().int().min(0).default(40),
});

export async function savePlanSettings(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/settings?error=" + encodeURIComponent("입력값을 확인하세요."));
  const { name, price_krw, monthly_credits, ...costs } = parsed.data!;
  const { error } = await adminClient()
    .from("plan_settings")
    .update({ name, price_krw, monthly_credits, credit_costs: costs, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) redirect("/admin/settings?error=" + encodeURIComponent(error.message));
  revalidatePath("/pricing");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=1");
}
