import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 결과 파일 다운로드/미리보기: 소유자(또는 공개 자산)만 서명 URL로 리다이렉트 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = adminClient();
  const { data: asset } = await db.from("assets").select("*").eq("id", id).maybeSingle();
  if (!asset) return NextResponse.json({ error: "파일이 없습니다." }, { status: 404 });
  const isOwner = user && asset.user_id === user.id;
  let isAdmin = false;
  if (user && !isOwner) {
    const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = p?.role === "admin";
  }
  if (!isOwner && !isAdmin && !asset.is_public) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const download = searchParams.get("download") === "1";
  const filename = (asset.meta as { filename?: string })?.filename ?? `file.${asset.storage_path.split(".").pop()}`;
  const { data, error } = await db.storage.from("outputs").createSignedUrl(asset.storage_path, 60 * 30);
  if (error || !data) return NextResponse.json({ error: "서명 URL 생성 실패" }, { status: 500 });
  // supabase-js의 { download: filename } 옵션은 한글을 두 번 인코딩해 파일명이 %ED%99…으로 깨진다 → 직접 한 번만 붙인다
  const url = download ? `${data.signedUrl}&download=${encodeURIComponent(filename)}` : data.signedUrl;
  return NextResponse.redirect(url, 302);
}
