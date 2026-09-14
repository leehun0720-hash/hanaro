"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ActiveJob = { id: string; type: string; label: string; status: string; step: string | null; notice: string | null; href: string; created_at: string };

const POLL_MS = 5000;
const STEP_KO: Record<string, string> = { plan: "설계 중", draft: "원고 작성 중", image: "이미지 생성 중", music: "음원 생성 중", video: "영상 생성 중", poster: "포스터 생성 중", compose: "합성 중", zip: "묶는 중", hwpx: "한글 파일 조립 중", photo: "이미지 편집 중", prompt: "프롬프트 변환 중" };

/**
 * 스튜디오 전체에 떠 있는 진행 중 작업 표시 + 백그라운드 진행기.
 * 어느 페이지에 있든 5초마다 /api/jobs/active 를 불러 내 작업을 한 단계씩 진행시키고, 오른쪽 아래에 상태를 보여준다.
 */
export function ActiveJobsTicker() {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/jobs/active", { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { jobs: ActiveJob[] };
          if (!cancelled) setJobs(j.jobs);
        }
      } catch {}
      if (!cancelled) setTick((n) => n + 1);
    }, tick === 0 ? 800 : POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tick]);

  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const waiting = jobs.filter((j) => j.status === "waiting");
  if (!jobs.length) return null;

  return (
    <div className="fixed bottom-16 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] md:bottom-4">
      <div className="rounded-xl border border-line bg-white shadow-lg">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 font-medium">
            {running.length > 0 && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand" />}
            진행 중 작업 {jobs.length}건
          </span>
          <span className="text-muted">{open ? "▾" : "▴"}</span>
        </button>
        {open && (
          <ul className="divide-y divide-line border-t border-line">
            {[...running, ...waiting].map((j) => {
              const here = pathname === j.href.split("?")[0];
              const stepKo = j.step ? STEP_KO[j.step.split(":")[0]] ?? j.step : "";
              return (
                <li key={j.id} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{j.label}</span>
                    <span className={`badge ${j.status === "waiting" ? "bg-gold-soft text-gold-deep" : "bg-brand-soft text-brand-deep"}`}>{j.status === "waiting" ? "확인 필요" : stepKo || "진행 중"}</span>
                  </div>
                  {j.notice && <p className="mt-1 text-muted">{j.notice}</p>}
                  {!here && <Link href={j.href} className="mt-1 inline-block text-brand underline">{j.status === "waiting" ? "이어서 하기 →" : "진행 보기 →"}</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
