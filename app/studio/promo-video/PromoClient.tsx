"use client";
import { useState } from "react";
import Link from "next/link";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import type { PromoOutput } from "@/lib/prompts/promo";
import type { Project } from "@/lib/types";

const STEPS = {
  plan: "Claude가 3컷 설계도를 그리는 중",
  video: "Kling이 컷을 촬영하는 중 (2~6분)",
  poster: "행동 유도(CTA) 포스터를 그리는 중",
  compose: "컷을 잇고 자막을 입히는 중 (ffmpeg)",
};

export function PromoClient({ projects, preselect, credits, initial }: { projects: Project[]; preselect: string | null; credits: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? projects[0]?.id ?? "");
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  const [usePhotos, setUsePhotos] = useState(true);
  const [mood, setMood] = useState("");
  const [extra, setExtra] = useState("");

  if (projects.length === 0 && !initial) {
    return <div className="card text-sm">먼저 프로젝트(소재)를 등록하세요. <Link href="/studio/projects/new" className="font-semibold text-brand underline">새 프로젝트 만들기</Link></div>;
  }
  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <div>
          <label className="label">프로젝트(소재)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.what}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">화면 비율</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRatio("16:9")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "16:9" ? "border-brand bg-brand-soft" : "border-line"}`}>16:9 유튜브·안내판</button>
              <button type="button" onClick={() => setRatio("9:16")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "9:16" ? "border-brand bg-brand-soft" : "border-line"}`}>9:16 쇼츠·릴스</button>
            </div>
          </div>
          <div>
            <label className="label">우리 조합 사진 참조</label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usePhotos} onChange={(e) => setUsePhotos(e.target.checked)} disabled={!project?.photos.length} />
              프로젝트 사진 {project?.photos.length ?? 0}장 중 1장을 장면 참조로 사용
            </label>
            <p className="hint">동의 받은 사진만. 얼굴 클로즈업은 피합니다.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">분위기 (선택)</label><input value={mood} onChange={(e) => setMood(e.target.value)} className="input" placeholder="예) 황금빛 과수원, 따뜻하고 웅장하게" /></div>
          <div><label className="label">추가 정보 (선택)</label><input value={extra} onChange={(e) => setExtra(e.target.value)} className="input" placeholder="예) 택배 가능, 본점 2층" /></div>
        </div>
      </div>

      <JobRunner
        initial={initial}
        type="promo_video"
        projectId={projectId}
        credits={credits}
        steps={STEPS}
        buttonLabel="홍보영상 만들기"
        buildInput={() => ({ ratio, usePhotos, mood: mood || undefined, extra: extra || undefined })}
        renderResult={({ job, assets }) => {
          const plan = job.output.plan as PromoOutput | undefined;
          const final = assets.find((a) => a.kind === "video" && (a.meta as { final?: boolean }).final);
          return (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">홍보영상 30초 · {ratio}</h2>
                {final && <a href={`/api/assets/${final.id}?download=1`} className="btn-primary text-xs">mp4 다운로드</a>}
              </div>
              {final && <video src={`/api/assets/${final.id}`} controls playsInline className={`w-full rounded-lg border border-line bg-black ${ratio === "9:16" ? "max-h-[70vh] mx-auto" : ""}`} />}
              {plan && (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted"><tr><th className="py-1">컷</th><th>자막</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-line"><td className="py-1.5">① 후크 3초</td><td>{plan.cuts.hook.caption}</td></tr>
                    <tr className="border-t border-line"><td className="py-1.5">② 메시지 10초</td><td>{plan.cuts.messageA.caption}</td></tr>
                    <tr className="border-t border-line"><td className="py-1.5">③ 메시지 10초</td><td>{plan.cuts.messageB.caption}</td></tr>
                    <tr className="border-t border-line"><td className="py-1.5">④ CTA 7초</td><td>{plan.cuts.cta.caption}</td></tr>
                  </tbody>
                </table>
              )}
              <p className="hint">게시 전 점검: 무음으로 봐도 이해되는가 · 날짜·전화번호·지점명 오타 0건 · ‘AI 생성’ 표기 권장. 파일명 규칙: 팀명_홍보영상_v1.mp4</p>
            </div>
          );
        }}
      />
    </div>
  );
}
