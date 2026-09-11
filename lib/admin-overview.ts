import { adminClient } from "@/lib/supabase/admin";
import { MAX_CONCURRENT_VIDEO_JOBS } from "@/lib/concurrency";
import { DEFAULT_IMAGE_CREDITS, DEFAULT_VIDEO_CREDITS } from "@/lib/practice-credits";
import type { Job } from "@/lib/types";

export type OverviewUser = { id: string; name: string | null; email: string; consent_at: string | null; image_left: number; video_left: number; jobs: number; cost_usd: number; active_job: { id: string; status: string; step: string | null } | null };

export type AdminOverview = {
  now: string;
  limit: number;
  budget_alert_usd: number;
  totals: { cost_usd: number; today_cost_usd: number; jobs: number; failed: number; succeeded: number };
  queue: { id: string; user: string; step: string | null; status: string; queue_position: number | null; created_at: string; cost_usd: number; notice: string | null }[];
  users: OverviewUser[];
};

export const BUDGET_ALERT_USD = Math.max(0, Number(process.env.BUDGET_ALERT_USD ?? 60) || 60);

/** 실습 현황 집계 (SPEC §3.4 실시간 누적 비용 · §8 큐) */
export async function getAdminOverview(): Promise<AdminOverview> {
  const db = adminClient();
  const [{ data: profiles }, { data: credits }, { data: jobs }] = await Promise.all([
    db.from("profiles").select("id, name, email, consent_at").order("created_at", { ascending: true }).limit(500),
    db.from("practice_credits").select("user_id, image_left, video_left"),
    db.from("jobs").select("*").eq("type", "practice").order("created_at", { ascending: false }).limit(1000),
  ]);
  const creditMap = new Map((credits ?? []).map((c) => [c.user_id as string, c as { image_left: number; video_left: number }]));
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.name as string | null) || (p.email as string)]));
  const all = (jobs ?? []) as Job[];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const users: OverviewUser[] = (profiles ?? []).map((p) => {
    const mine = all.filter((j) => j.user_id === p.id);
    const active = mine.find((j) => j.status === "queued" || j.status === "running" || j.status === "waiting") ?? null;
    const c = creditMap.get(p.id as string);
    return {
      id: p.id as string,
      name: (p.name as string | null) ?? null,
      email: p.email as string,
      consent_at: (p.consent_at as string | null) ?? null,
      image_left: c?.image_left ?? DEFAULT_IMAGE_CREDITS,
      video_left: c?.video_left ?? DEFAULT_VIDEO_CREDITS,
      jobs: mine.length,
      cost_usd: round4(mine.reduce((a, j) => a + (Number(j.cost_usd) || 0), 0)),
      active_job: active ? { id: active.id, status: active.status, step: active.step } : null,
    };
  });

  const queue = all
    .filter((j) => j.status === "queued" || j.status === "running")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((j) => ({ id: j.id, user: nameOf.get(j.user_id) ?? j.user_id, step: j.step, status: j.status, queue_position: (j.output as { queue_position?: number | null }).queue_position ?? null, created_at: j.created_at, cost_usd: Number(j.cost_usd) || 0, notice: ((j.output as { notice?: string | null }).notice ?? null) as string | null }));

  return {
    now: new Date().toISOString(),
    limit: MAX_CONCURRENT_VIDEO_JOBS,
    budget_alert_usd: BUDGET_ALERT_USD,
    totals: {
      cost_usd: round4(all.reduce((a, j) => a + (Number(j.cost_usd) || 0), 0)),
      today_cost_usd: round4(all.filter((j) => new Date(j.created_at) >= startOfDay).reduce((a, j) => a + (Number(j.cost_usd) || 0), 0)),
      jobs: all.length,
      failed: all.filter((j) => j.status === "failed").length,
      succeeded: all.filter((j) => j.status === "succeeded").length,
    },
    queue,
    users,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
