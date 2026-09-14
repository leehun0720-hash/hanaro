import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site";

const PROTECTED = ["/studio", "/admin"];
const CANONICAL_HOST = new URL(SITE_URL).host;

/** 정식 도메인이 아닌 주소(*.vercel.app 등)는 검색엔진 색인에서 제외해 중복 콘텐츠를 막는다 */
function withRobots(request: NextRequest, response: NextResponse) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host && host !== CANONICAL_HOST && !host.startsWith("localhost")) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return withRobots(request, response);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return withRobots(request, response);
}
