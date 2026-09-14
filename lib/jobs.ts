import { adminClient } from "@/lib/supabase/admin";
import { usageContext } from "@/lib/usage";
import { addCredits, deductCredits, InsufficientCredits } from "@/lib/credits";
import type { AssetKind, Job, JobType, Project } from "@/lib/types";
import { getPipeline } from "@/lib/pipelines";

export type JobContext = {
  job: Job;
  project: Project | null;
  orgName: string | null;
  /** 진행 상태 갱신 (step·output 병합) */
  update: (patch: { step?: string; output?: Record<string, unknown>; provider_task_ids?: Record<string, string> }) => Promise<Job>;
  /** 파일을 outputs 버킷에 저장하고 assets에 기록 */
  saveAsset: (p: { kind: AssetKind; ext: string; data: Buffer; mime: string; meta?: Record<string, unknown>; deleteAfter?: string | null }) => Promise<{ id: string; storage_path: string }>;
  /** 업로드된 프로젝트 사진을 읽어온다 */
  loadPhotos: () => Promise<{ data: Buffer; name: string; mime: string }[]>;
};

/**
 * 파이프라인 단계 실행 결과: 다음 step 또는 완료.
 * next가 "await:"로 시작하면 작업은 waiting 상태가 되어 사용자의 확인(resume)을 기다린다.
 */
export type StepResult = { next: string } | { done: true };

export const isAwaitStep = (step: string | null | undefined) => Boolean(step && step.startsWith("await:"));

export type Pipeline = {
  firstStep: string;
  /** 단계 실행. 예외를 던지면 job 실패 + ro 환불 */
  run: (ctx: JobContext, step: string) => Promise<StepResult>;
  /** waiting 상태에서 사용자의 입력을 받아 다음 단계를 정한다. 예외는 사용자에게 400으로 전달(작업은 실패하지 않음) */
  resume?: (ctx: JobContext, action: string, data: Record<string, unknown>) => Promise<StepResult>;
};

const LOCK_SECONDS = 150;
/** 서버 ffmpeg 합성은 1080p 30초 인코딩이라 2~4분 걸린다 — 잠금이 먼저 풀려 다른 진행기가 겹치지 않게 함수 제한(300초)에 맞춘다 */
const LOCK_SECONDS_HEAVY = 290;
const lockSecondsFor = (step: string | null | undefined) => (step === "compose" ? LOCK_SECONDS_HEAVY : LOCK_SECONDS);

export class SubscriptionRequired extends Error {
  constructor() {
    super("구독 중인 회원만 사용할 수 있습니다. 구독을 시작해 주세요.");
    this.name = "SubscriptionRequired";
  }
}

/** resume 입력이 잘못되었을 때 (작업은 유지, 사용자에게만 알림) */
export class ResumeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeInputError";
  }
}

export async function createJob(p: { userId: string; type: JobType; projectId: string | null; input: Record<string, unknown>; credits: number }): Promise<Job> {
  const db = adminClient();
  // 구독은 게이트가 아니다: 충전 ro만으로도 사용 가능. 잔고 부족은 deduct_credits가 판단.
  const { data: job, error } = await db
    .from("jobs")
    .insert({ user_id: p.userId, type: p.type, project_id: p.projectId, input: p.input, credits: p.credits, status: "queued", step: getPipeline(p.type).firstStep })
    .select("*")
    .single();
  if (error) throw error;

  try {
    await deductCredits(p.userId, p.credits, `job:${p.type}`, job.id);
  } catch (e) {
    await db.from("jobs").update({ status: "failed", error: e instanceof InsufficientCredits ? e.message : String(e), finished_at: new Date().toISOString() }).eq("id", job.id);
    throw e;
  }
  return job as Job;
}

/** 파이프라인에 넘길 컨텍스트 구성 (advanceJob·resumeJob·웹훅 공용) */
export async function buildContext(job: Job, userId: string): Promise<JobContext> {
  const db = adminClient();
  const jobId = job.id;
  let current = job;
  const [{ data: project }, { data: profile }] = await Promise.all([
    current.project_id ? db.from("projects").select("*").eq("id", current.project_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("profiles").select("org_name").eq("id", userId).single(),
  ]);

  const ctx: JobContext = {
    job: current,
    project: (project as Project | null) ?? null,
    orgName: profile?.org_name ?? null,
    update: async (patch) => {
      const merged = {
        ...(patch.step !== undefined ? { step: patch.step } : {}),
        ...(patch.output ? { output: { ...current.output, ...patch.output } } : {}),
        ...(patch.provider_task_ids ? { provider_task_ids: { ...current.provider_task_ids, ...patch.provider_task_ids } } : {}),
      };
      const { data } = await db.from("jobs").update(merged).eq("id", jobId).select("*").single();
      current = data as Job;
      ctx.job = current;
      return current;
    },
    saveAsset: async ({ kind, ext, data, mime, meta, deleteAfter }) => {
      const path = `${userId}/${jobId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from("outputs").upload(path, data, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`파일 저장 실패: ${upErr.message}`);
      const { data: asset, error } = await db
        .from("assets")
        .insert({ user_id: userId, job_id: jobId, kind, storage_path: path, mime, size: data.length, meta: meta ?? {}, ...(deleteAfter ? { delete_after: deleteAfter } : {}) })
        .select("id, storage_path")
        .single();
      if (error) throw error;
      return asset;
    },
    loadPhotos: async () => {
      const paths = (project as Project | null)?.photos ?? [];
      const out: { data: Buffer; name: string; mime: string }[] = [];
      for (const p of paths.slice(0, 3)) {
        const { data } = await db.storage.from("uploads").download(p);
        if (!data) continue;
        out.push({ data: Buffer.from(await data.arrayBuffer()), name: p.split("/").pop() ?? "photo.jpg", mime: p.endsWith(".png") ? "image/png" : "image/jpeg" });
      }
      return out;
    },
  };
  return ctx;
}

/** 폴링 시 호출: 잠금을 잡고 현재 단계를 한 번 실행 */
export async function advanceJob(jobId: string, userId: string): Promise<Job> {
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single();
  if (!job) throw new Error("작업을 찾을 수 없습니다.");
  return advanceLoaded(job as Job);
}

/** 시스템 경로(웹훅·티커)용: 소유자 확인 없이 진행 */
export async function advanceJobSystem(jobId: string): Promise<Job | null> {
  const { data: job } = await adminClient().from("jobs").select("*").eq("id", jobId).single();
  if (!job) return null;
  return advanceLoaded(job as Job);
}

async function advanceLoaded(j: Job): Promise<Job> {
  const db = adminClient();
  const jobId = j.id;
  const userId = j.user_id;
  // 완료·실패·사용자 확인 대기 중이면 실행하지 않는다
  if (j.status === "succeeded" || j.status === "failed" || j.status === "waiting") return j;

  // 잠금: lock_until이 미래면 다른 요청이 실행 중
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockSecondsFor(j.step) * 1000).toISOString();
  const { data: locked } = await db
    .from("jobs")
    .update({ status: "running", lock_until: lockUntil })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  if (!locked) return j; // 다른 요청이 처리 중 → 현재 상태 반환

  const current = locked as Job;
  const ctx = await buildContext(current, userId);

  try {
    const result = await usageContext.run({ jobId, userId: current.user_id, jobType: current.type }, () => getPipeline(current.type).run(ctx, current.step ?? getPipeline(current.type).firstStep));
    if ("done" in result) {
      const { data } = await db.from("jobs").update({ status: "succeeded", step: "done", lock_until: null, finished_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
      return data as Job;
    }
    const status = isAwaitStep(result.next) ? "waiting" : "running";
    const { data } = await db.from("jobs").update({ step: result.next, status, lock_until: null }).eq("id", jobId).select("*").single();
    return data as Job;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[job ${jobId}] step ${current.step} failed:`, e);
    await failJob(ctx.job, message);
    const { data } = await db.from("jobs").select("*").eq("id", jobId).single();
    return data as Job;
  }
}

/**
 * waiting 상태의 작업에 사용자 입력을 전달해 다음 단계로 보낸다.
 * 단계 실행은 하지 않고 step·status만 바꾼다 → 화면의 다음 폴링에서 advanceJob이 실행한다.
 */
export async function resumeJob(jobId: string, userId: string, action: string, data: Record<string, unknown>): Promise<Job> {
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single();
  if (!job) throw new ResumeInputError("작업을 찾을 수 없습니다.");
  const j = job as Job;
  if (j.status !== "waiting" || !isAwaitStep(j.step)) throw new ResumeInputError("지금은 입력을 받을 수 있는 단계가 아닙니다.");
  const pipeline = getPipeline(j.type);
  if (!pipeline.resume) throw new ResumeInputError("이 작업 유형은 중간 입력을 지원하지 않습니다.");

  const ctx = await buildContext(j, userId);
  const result = await usageContext.run({ jobId, userId: j.user_id, jobType: j.type }, () => pipeline.resume!(ctx, action, data));
  if ("done" in result) {
    const { data: done } = await db.from("jobs").update({ status: "succeeded", step: "done", lock_until: null, finished_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
    return done as Job;
  }
  const status = isAwaitStep(result.next) ? "waiting" : "queued";
  const { data: next } = await db.from("jobs").update({ step: result.next, status, lock_until: null }).eq("id", jobId).select("*").single();
  return next as Job;
}

/**
 * 잠금을 잡는다 (advanceJob과 동일 규칙). 성공하면 잠긴 최신 job, 아니면 null.
 * 웹훅 처리처럼 폴링과 경쟁하는 경로에서 사용.
 */
export async function tryLockJob(jobId: string, expectStep?: string): Promise<Job | null> {
  const db = adminClient();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockSecondsFor(expectStep) * 1000).toISOString();
  let q = db.from("jobs").update({ status: "running", lock_until: lockUntil }).eq("id", jobId).in("status", ["queued", "running"]).or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`);
  if (expectStep) q = q.eq("step", expectStep);
  const { data } = await q.select("*").maybeSingle();
  return (data as Job | null) ?? null;
}

/** 잠금 안에서 단계 결과를 반영 (웹훅 등 외부 경로용) */
export async function applyStepResult(jobId: string, result: StepResult): Promise<Job> {
  const db = adminClient();
  if ("done" in result) {
    const { data } = await db.from("jobs").update({ status: "succeeded", step: "done", lock_until: null, finished_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
    return data as Job;
  }
  const status = isAwaitStep(result.next) ? "waiting" : "running";
  const { data } = await db.from("jobs").update({ step: result.next, status, lock_until: null }).eq("id", jobId).select("*").single();
  return data as Job;
}

/** 사용자·관리자 취소: 진행 중 작업을 실패 처리하고 ro 환불 (SPEC §10 cancel) */
export async function cancelJob(jobId: string, by: "user" | "admin"): Promise<Job> {
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).single();
  if (!job) throw new ResumeInputError("작업을 찾을 수 없어요.");
  const j = job as Job;
  if (j.status === "succeeded" || j.status === "failed") return j;
  await failJob(j, by === "admin" ? "강사가 작업을 취소했어요." : "작업을 취소했어요.");
  const { data } = await db.from("jobs").select("*").eq("id", jobId).single();
  return data as Job;
}

export async function failJob(job: Job, message: string) {
  const db = adminClient();
  await db.from("jobs").update({ status: "failed", error: message, lock_until: null, finished_at: new Date().toISOString() }).eq("id", job.id);
  if (job.credits > 0) {
    try {
      await addCredits(job.user_id, job.credits, `refund:${job.type}`, job.id);
    } catch (e) {
      console.error("refund failed", e);
    }
  }
}

/** 사용자의 진행 중 작업(queued·running·waiting) 목록 */
export async function listActiveJobs(userId: string): Promise<Job[]> {
  const { data } = await adminClient().from("jobs").select("*").eq("user_id", userId).is("deleted_at", null).in("status", ["queued", "running", "waiting"]).order("created_at", { ascending: true }).limit(20);
  return (data ?? []) as Job[];
}

/**
 * 제작실 페이지가 열릴 때 이어서 보여줄 작업: 진행 중이면 항상, 완료·실패는 최근 12시간 이내 것만.
 */
export async function latestJobForRoom(userId: string, type: JobType): Promise<{ job: Job; assets: import("@/lib/types").Asset[] } | null> {
  const db = adminClient();
  const { data } = await db.from("jobs").select("*").eq("user_id", userId).eq("type", type).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const job = data as Job;
  const active = job.status === "queued" || job.status === "running" || job.status === "waiting";
  const recent = Date.now() - new Date(job.created_at).getTime() < 12 * 3600_000;
  if (!active && !recent) return null;
  return jobWithAssets(job.id, userId);
}

/** 클라이언트에 보낼 작업 + 자산 목록 */
export async function jobWithAssets(jobId: string, userId: string) {
  const db = adminClient();
  const [{ data: job }, { data: assets }] = await Promise.all([
    db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single(),
    db.from("assets").select("*").eq("job_id", jobId).order("created_at"),
  ]);
  return { job: job as Job, assets: assets ?? [] };
}
