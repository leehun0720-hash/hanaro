import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { advanceJob, listActiveJobs } from "@/lib/jobs";
import { JOB_TYPE_LABEL } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ROOM_HREF: Record<string, string> = { document: "/studio/document", newsletter: "/studio/newsletter", cardnews: "/studio/cardnews", promo_video: "/studio/promo-video", music_video: "/studio/music-video", practice: "/studio/practice" };

/**
 * 진행 중 작업 티커 — 스튜디오 어느 페이지에서든 5초마다 호출된다.
 * 내 진행 중 작업을 모두 한 단계씩 진행시키고(잠금으로 중복 방지) 요약을 돌려준다.
 * 덕분에 제작실 페이지를 떠나 있어도 작업이 계속 흘러간다. (fal 웹훅이 있으면 그쪽이 먼저 진행시키고, 이건 백업)
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const jobs = await listActiveJobs(user.id);
  const results = [];
  for (const j of jobs) {
    let job = j;
    if (j.status === "queued" || j.status === "running") {
      try {
        job = await advanceJob(j.id, user.id);
      } catch (e) {
        console.warn(`[ticker] job ${j.id} advance 실패:`, e instanceof Error ? e.message : e);
      }
    }
    results.push({
      id: job.id,
      type: job.type,
      label: JOB_TYPE_LABEL[job.type],
      status: job.status,
      step: job.step,
      notice: typeof job.output?.notice === "string" ? (job.output.notice as string) : null,
      href: job.type === "practice" ? `/studio/practice?job=${job.id}` : ROOM_HREF[job.type],
      created_at: job.created_at,
    });
  }
  return NextResponse.json({ jobs: results });
}
