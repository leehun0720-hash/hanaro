import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { advanceJobSystem } from "@/lib/jobs";
import type { Job } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 240_000; // 함수 제한(300초) 안에서 여유 있게

/**
 * 작업 진행기 (Vercel Cron, 매분) — 브라우저가 닫혀 있어도 진행 중 작업을 한 단계씩 밀어준다.
 * 잠금(lock_until)으로 화면 폴링·티커·웹훅과 중복 실행되지 않는다. waiting(사용자 확인 대기)은 건드리지 않는다.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const { data } = await adminClient().from("jobs").select("id, type, step, created_at").in("status", ["queued", "running"]).order("created_at", { ascending: true }).limit(50);
  const jobs = (data ?? []) as Pick<Job, "id" | "type" | "step" | "created_at">[];
  const report: { id: string; type: string; from: string | null; to: string | null; status: string }[] = [];
  let skipped = 0;
  for (const j of jobs) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      skipped++;
      continue;
    }
    try {
      const after = await advanceJobSystem(j.id);
      report.push({ id: j.id, type: j.type, from: j.step, to: after?.step ?? null, status: after?.status ?? "?" });
    } catch (e) {
      report.push({ id: j.id, type: j.type, from: j.step, to: null, status: `error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return NextResponse.json({ ran_at: new Date().toISOString(), active: jobs.length, advanced: report.length, skipped, ms: Date.now() - started, report });
}
