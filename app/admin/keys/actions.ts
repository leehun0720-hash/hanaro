"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteSecret, isSecretName, setSecret } from "@/lib/secrets";

const back = (q: string) => redirect(`/admin/keys?${q}`);

/** 키 저장 (값은 서버에서만 다루고 화면에는 힌트만 보여준다) */
export async function saveSecret(formData: FormData) {
  const me = await requireAdmin();
  const name = String(formData.get("name") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!isSecretName(name)) back("error=" + encodeURIComponent("알 수 없는 항목입니다."));
  if (!value.trim()) back("error=" + encodeURIComponent("값을 입력하세요."));
  try {
    await setSecret(name as never, value, me.id);
  } catch (e) {
    back("error=" + encodeURIComponent(e instanceof Error ? e.message : "저장 실패"));
  }
  revalidatePath("/admin/keys");
  back("ok=" + encodeURIComponent(`${name} 저장됨`));
}

/** DB 값 삭제 → 환경변수 값으로 되돌아간다 */
export async function removeSecret(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "");
  if (!isSecretName(name)) back("error=" + encodeURIComponent("알 수 없는 항목입니다."));
  await deleteSecret(name as never);
  revalidatePath("/admin/keys");
  back("ok=" + encodeURIComponent(`${name} 삭제됨 (환경변수 값 사용)`));
}
