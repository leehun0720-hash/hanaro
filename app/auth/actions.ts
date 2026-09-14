"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * 돌아올 주소는 반드시 "지금 접속한 주소"여야 한다.
 * OAuth(PKCE)·매직링크는 시작 시 브라우저 쿠키에 검증값을 두고 콜백에서 대조하므로,
 * 환경변수에 고정된 다른 도메인으로 돌아오면 쿠키를 못 찾아 "인증 링크가 만료" 오류가 난다.
 * 여러 도메인(hanaro-tenai · hanaro-eta · www.runiq.space)을 함께 쓰는 배포에서 특히 중요.
 */
async function site(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  } catch {}
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/studio";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  const next = safeNext(formData.get("next"));
  if (error) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}`);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const org = String(formData.get("org_name") ?? "").trim();
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("비밀번호는 8자 이상이어야 합니다.")}`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, org_name: org }, emailRedirectTo: `${await site()}/auth/callback` },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  if (data.session) {
    // 이메일 확인이 꺼진 프로젝트: 바로 로그인됨
    if (org && data.user) await supabase.from("profiles").update({ org_name: org }).eq("id", data.user.id);
    redirect("/studio");
  }
  redirect("/login?message=" + encodeURIComponent("가입 완료. 이메일의 인증 링크를 누른 뒤 로그인하세요."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await site()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("구글 로그인을 시작할 수 없습니다.")}`);
  redirect(data.url);
}
