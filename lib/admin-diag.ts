import { adminClient } from "@/lib/supabase/admin";

/** 서비스 롤 키가 실제로 동작하는지 (RLS 우회 조회). 실패하면 Vercel 환경변수 문제 */
export async function serviceKeyCheck(): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.";
  try {
    const { error } = await adminClient().from("app_secrets").select("name", { count: "exact", head: true });
    return error ? `${error.message}${error.code ? ` [${error.code}]` : ""}` : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 오류를 사용자에게 보여줄 한 줄로 */
export const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
