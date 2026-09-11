"use client";
import { useEffect, useState } from "react";
import type { Asset, Job, JobType } from "@/lib/types";

export type JobResult = { job: Job; assets: Asset[] };
export type ResumeFn = (action: string, data?: Record<string, unknown>) => Promise<void>;

type Props = {
  type: JobType;
  projectId: string | null;
  buildInput: () => Record<string, unknown> | { error: string };
  credits: number;
  steps: Record<string, string>; // step → 표시 문구
  renderResult: (r: JobResult) => React.ReactNode;
  /** waiting(사용자 확인 대기) 단계 화면. resume으로 입력을 보내면 폴링이 다시 시작된다 */
  renderWaiting?: (r: JobResult, resume: ResumeFn, busy: boolean) => React.ReactNode;
  /** 진행 중 카드 아래에 붙일 추가 화면 (예: 대기 중 자막 미리 작성) */
  renderRunning?: (r: JobResult) => React.ReactNode;
  buttonLabel?: string;
  disabled?: boolean;
  initial?: JobResult | null;
};

const POLL_MS = 4000;
/** 폴링을 멈추는 상태: 완료·실패·사용자 확인 대기 */
const TERMINAL = new Set(["succeeded", "failed", "waiting"]);

type PollPlan = { id: string; delay: number; seq: number };

export function JobRunner({ type, projectId, buildInput, credits, steps, renderResult, renderWaiting, renderRunning, buttonLabel, disabled, initial }: Props) {
  const [result, setResult] = useState<JobResult | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  // 보관함에서 "이어서 하기"로 진행 중인 작업을 불러온 경우 처음부터 폴링 상태로 시작
  const resumeInitial = Boolean(initial && !TERMINAL.has(initial.job.status));
  const [busy, setBusy] = useState(resumeInitial);
  // 폴링 예약은 state로 관리 → effect가 타이머를 잡고 정리한다 (렌더 중 ref 접근 없음)
  const [plan, setPlan] = useState<PollPlan | null>(() => (resumeInitial && initial ? { id: initial.job.id, delay: 0, seq: 1 } : null));

  const schedule = (id: string, delay: number) => setPlan((p) => ({ id, delay, seq: (p?.seq ?? 0) + 1 }));

  useEffect(() => {
    if (!plan) return;
    const { id } = plan;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        const j = (await r.json()) as JobResult & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "상태 확인 실패");
        setResult(j);
        if (TERMINAL.has(j.job.status)) setBusy(false);
        else schedule(id, POLL_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
    }, plan.delay);
    return () => clearTimeout(t);
  }, [plan]);

  async function start() {
    setError(null);
    const input = buildInput();
    if ("error" in input) { setError(String(input.error)); return; }
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, projectId, input }) });
      const j = (await r.json()) as { job?: Job; error?: string };
      if (!r.ok || !j.job) throw new Error(j.error ?? "작업을 시작할 수 없습니다.");
      setResult({ job: j.job, assets: [] });
      schedule(j.job.id, TERMINAL.has(j.job.status) ? 0 : 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const resume: ResumeFn = async (action, data = {}) => {
    const id = result?.job.id;
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
      const j = (await r.json()) as JobResult & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "입력을 처리할 수 없습니다.");
      setResult(j);
      if (TERMINAL.has(j.job.status)) setBusy(false);
      else schedule(id, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const job = result?.job;
  const running = job && (job.status === "queued" || job.status === "running");
  const stepLabel = job?.step ? steps[job.step] ?? steps[job.step.split(":")[0]] ?? job.step : "";
  const notice = typeof job?.output?.notice === "string" ? (job.output.notice as string) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={start} disabled={busy || disabled} className="btn-primary">
          {busy ? "생성 중…" : buttonLabel ?? "생성하기"}
        </button>
        <span className="text-sm text-muted">ro {credits} 차감 · 실패 시 자동 환불</span>
      </div>
      {error && <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {running && (
        <>
          <div className="card flex items-center gap-4">
            <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
            <div>
              <p className="font-medium">{stepLabel || "준비 중"}</p>
              <p className="hint">{notice ?? "AI가 작업 중입니다. 이 화면을 열어 두세요. 보통 1~3분 걸립니다."}</p>
            </div>
          </div>
          {result && renderRunning?.(result)}
        </>
      )}
      {job?.status === "failed" && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <b>실패:</b> {job.error ?? "알 수 없는 오류"} · ro는 환불되었습니다.
        </div>
      )}
      {job?.status === "waiting" && result && (renderWaiting ? renderWaiting(result, resume, busy) : <div className="card text-sm">확인 대기 중입니다.</div>)}
      {job?.status === "succeeded" && result && renderResult(result)}
    </div>
  );
}
