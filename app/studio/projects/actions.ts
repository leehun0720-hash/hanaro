"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPII } from "@/lib/pii";

const schema = z.object({
  name: z.string().trim().min(1, "프로젝트 이름을 입력하세요.").max(60),
  what: z.string().trim().min(2, "무엇을 알릴지 입력하세요.").max(200),
  when_text: z.string().trim().max(100).optional(),
  where_text: z.string().trim().max(100).optional(),
  audience: z.string().trim().max(100).optional(),
  cta: z.string().trim().max(100).optional(),
});

const back = (msg: string) => redirect("/studio/projects/new?error=" + encodeURIComponent(msg));

export async function createProject(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const values = parsed.data!;
  const pii = checkPII(Object.values(values).filter(Boolean).join(" "));
  if (pii.blocked) back(pii.warnings[0]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 사진은 브라우저가 저장소에 직접 올리고 경로만 넘어온다 — 본인 폴더 경로만 인정
  const prefix = `${user!.id}/projects/`;
  const photos = formData
    .getAll("photos")
    .map((p) => String(p))
    .filter((p) => p.startsWith(prefix) && /^[\w\-./]+$/.test(p))
    .slice(0, 3);

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...values, user_id: user!.id, photos })
    .select("id")
    .single();
  if (error) back(error.message);
  revalidatePath("/studio");
  redirect(`/studio?project=${data!.id}`);
}

export async function deleteProject(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", id);
  revalidatePath("/studio/projects");
  redirect("/studio/projects");
}
