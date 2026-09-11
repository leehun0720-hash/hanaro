import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { cancelJob, jobWithAssets, ResumeInputError } from "@/lib/jobs";
import { refundPracticeOnCancel } from "@/lib/pipelines/practice";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 취소·환불 (SPEC §10): 본인 또는 관리자 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const db = adminClient();
  const [{ data: job }, { data: me }] = await Promise.all([db.from("jobs").select("*").eq("id", id).maybeSingle(), db.from("profiles").select("role").eq("id", user.id).single()]);
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없어요." }, { status: 404 });
  const isAdmin = me?.role === "admin";
  if (job.user_id !== user.id && !isAdmin) return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });

  try {
    const j = job as Job;
    if (j.type === "practice" && (j.status === "queued" || j.status === "running" || j.status === "waiting")) await refundPracticeOnCancel(j);
    await cancelJob(id, isAdmin && job.user_id !== user.id ? "admin" : "user");
    return NextResponse.json(await jobWithAssets(id, job.user_id));
  } catch (e) {
    const status = e instanceof ResumeInputError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "취소할 수 없어요." }, { status });
  }
}
