import { adminClient } from "@/lib/supabase/admin";

/**
 * 외부 제공자 동시 실행 게이트 — 20명 동시 실습 대응.
 * fal.ai Kling v3는 계정 단위 동시 실행 한도(기본 1, 요청으로 상향)가 있어 한도를 넘는 요청은 큐에 쌓이거나 429가 난다.
 * DB에 기록된 진행 중 task 수를 세어 한도 안에서만 새 요청을 보내고, 나머지는 폴링 때마다 다시 확인한다.
 * (서버리스라 프로세스 내 세마포어는 쓸 수 없다. 폴링 간격 4초 안의 경쟁으로 1~2건 초과할 수 있으나 재시도가 흡수한다.)
 */
/** SPEC §8: 전체 진행 중 영상 클립 상한 = fal 승인 동시 실행 수 (MAX_CONCURRENT_VIDEO_JOBS) */
export const MAX_CONCURRENT_VIDEO_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_VIDEO_JOBS ?? 3) || 3);
/** 평균 생성 시간(초) — 순번 예상시간 계산용 (Kling 5초 클립 약 1.5~3분) */
export const AVG_VIDEO_SECONDS = Math.max(30, Number(process.env.AVG_VIDEO_SECONDS ?? 120) || 120);

/** 순수 함수: 새로 시작할 수 있는가 */
/** 순수 함수: 새로 시작할 수 있는가. 아무것도 돌고 있지 않으면 한도보다 큰 묶음(뮤직비디오 4클립 등)도 시작한다 — fal이 자체 큐로 처리 */
export const hasCapacity = (active: number, needed: number, limit: number) => active === 0 || active + needed <= limit;

/** 진행 중(video:wait) 작업들의 Kling 클립 요청 수 합계 */
export async function countActiveVideoTasks(): Promise<number> {
  const db = adminClient();
  const { data } = await db.from("jobs").select("provider_task_ids").eq("step", "video:wait").in("status", ["running", "queued"]);
  return (data ?? []).reduce((sum, row) => sum + Object.keys((row.provider_task_ids as Record<string, string> | null) ?? {}).length, 0);
}

/** needed개 클립을 지금 시작해도 되는지. 아니면 대기 중인 task 수를 돌려준다 */
export async function canStartVideoTasks(needed: number): Promise<{ ok: boolean; active: number; limit: number }> {
  const active = await countActiveVideoTasks();
  return { ok: hasCapacity(active, needed, MAX_CONCURRENT_VIDEO_JOBS), active, limit: MAX_CONCURRENT_VIDEO_JOBS };
}

/** 내 앞에서 제출을 기다리는 작업 수 (video:start 단계에 머무는, 나보다 먼저 만든 작업) */
export async function countAheadInQueue(jobId: string, createdAt: string): Promise<number> {
  const db = adminClient();
  const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("step", "video:start").in("status", ["running", "queued"]).lt("created_at", createdAt).neq("id", jobId);
  return count ?? 0;
}

/** 순수 함수: 예상 대기(초) = 앞선 대기 수 × 평균 생성시간 / 동시 실행 수 (SPEC §8) */
export const estimateWaitSeconds = (ahead: number, avgSeconds = AVG_VIDEO_SECONDS, limit = MAX_CONCURRENT_VIDEO_JOBS) => Math.ceil(((ahead + 1) * avgSeconds) / Math.max(1, limit));

/** 사용자당 진행 중(queued·running·waiting) 실습 작업 1개 제한 (SPEC §3.4·§8) */
export async function hasActivePracticeJob(userId: string): Promise<string | null> {
  const db = adminClient();
  const { data } = await db.from("jobs").select("id").eq("user_id", userId).eq("type", "practice").in("status", ["queued", "running", "waiting"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}
