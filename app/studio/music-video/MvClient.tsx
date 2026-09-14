"use client";
import { useState } from "react";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import { MV_GENRES, type MvGenre, type MvOutput } from "@/lib/prompts/mv";
import type { Project } from "@/lib/types";
import { RefPhotoPicker } from "@/components/RefPhotoPicker";

const STEPS = {
  plan: "Claude가 가사와 장면 4개를 쓰는 중",
  music: "ElevenLabs가 응원송을 작곡·녹음하는 중 (1~2분)",
  video: "Kling이 장면 4개를 촬영하는 중 (3~8분)",
  compose: "장면을 잇고 음원·자막을 입히는 중 (ffmpeg)",
};

export function MvClient({ projects, photoUrls, preselect, orgName, credits, initial }: { projects: Project[]; photoUrls: Record<string, string>; preselect: string | null; orgName: string | null; credits: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? "");
  const [genre, setGenre] = useState<MvGenre>("trot");
  const [org, setOrg] = useState(orgName ?? "");
  const [specialty, setSpecialty] = useState("");
  const [region, setRegion] = useState("");
  const [extra, setExtra] = useState("");
  const [refPhoto, setRefPhoto] = useState<string | null>(null); // 기본: 참조 안 함

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">조합명</label><input value={org} onChange={(e) => setOrg(e.target.value)} className="input" placeholder="예) 안성농협" maxLength={60} /></div>
          <div><label className="label">지역 특산물</label><input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="input" placeholder="예) 안성배" maxLength={60} /></div>
          <div><label className="label">지역명 (선택)</label><input value={region} onChange={(e) => setRegion(e.target.value)} className="input" placeholder="예) 경기 안성" maxLength={60} /></div>
        </div>
        <div>
          <label className="label">장르 고르기</label>
          <div className="grid gap-2 sm:grid-cols-5">
            {(Object.keys(MV_GENRES) as MvGenre[]).map((k) => (
              <button key={k} type="button" onClick={() => setGenre(k)} className={`rounded-lg border px-3 py-2 text-left text-sm ${genre === k ? "border-brand bg-brand-soft" : "border-line"}`}>
                <div className="font-medium">{MV_GENRES[k].label}</div>
                <div className="text-[11px] text-muted">{MV_GENRES[k].use}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">프로젝트(소재) — 선택</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            <option value="">(선택 안 함 — 조합 자체 응원송)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.what ? ` · ${p.what.length > 20 ? p.what.slice(0, 20) + "…" : p.what}` : ""}</option>)}
          </select>
          <p className="hint">선택하면 소재(행사·상품)가 가사에 살짝 들어갑니다.</p>
        </div>
        {projectId && (
          <div>
            <label className="label">첫 장면 참조 사진 (선택)</label>
            <RefPhotoPicker photos={projects.find((p) => p.id === projectId)?.photos ?? []} urls={photoUrls} value={refPhoto} onChange={setRefPhoto} />
            <p className="hint">고른 사진 1장만 장면의 첫 프레임으로 씁니다. 고르지 않으면 가사 장면만으로 촬영합니다.</p>
          </div>
        )}
        <div><label className="label">담고 싶은 이야기 (선택)</label><textarea value={extra} onChange={(e) => setExtra(e.target.value)} className="input min-h-20" maxLength={1000} placeholder="예) 60년 역사, 조합원 3천 명, 새벽 경매, 로컬푸드 직매장" /></div>
      </div>

      <JobRunner
        initial={initial}
        type="music_video"
        projectId={projectId || null}
        credits={credits}
        steps={STEPS}
        buttonLabel="뮤직비디오 만들기"
        buildInput={() => {
          if (!org.trim()) return { error: "조합명을 입력하세요." };
          if (!specialty.trim()) return { error: "지역 특산물을 입력하세요." };
          return { genre, orgName: org.trim(), specialty: specialty.trim(), region: region || undefined, extra: extra || undefined, refPhoto: projectId ? refPhoto : null };
        }}
        renderResult={({ job, assets }) => {
          const plan = job.output.plan as MvOutput | undefined;
          const final = assets.find((a) => a.kind === "video" && (a.meta as { final?: boolean }).final);
          const audio = assets.find((a) => a.kind === "audio");
          return (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{plan?.title ?? "뮤직비디오"}</h2>
                  {final && <a href={`/api/assets/${final.id}?download=1`} className="btn-primary text-xs">mp4 다운로드</a>}
                </div>
                {final && <video src={`/api/assets/${final.id}`} controls playsInline className="w-full rounded-lg border border-line bg-black" />}
                {audio && (
                  <div>
                    <p className="text-xs text-muted mb-1">음원만 듣기 · <a href={`/api/assets/${audio.id}?download=1`} className="text-brand hover:underline">mp3 다운로드</a></p>
                    <audio src={`/api/assets/${audio.id}`} controls className="w-full" />
                  </div>
                )}
                <p className="hint">저작권: 이 곡은 AI 생성곡으로 조합 행사·SNS에 쓸 수 있습니다. ‘AI 생성’ 표기를 권장합니다.</p>
              </div>
              <div className="card space-y-2 text-sm">
                <h2 className="font-semibold">가사</h2>
                {plan && (["verse1", "chorus", "verse2", "chorus2"] as const).map((k) => (
                  <div key={k}>
                    <p className="text-xs text-muted">{{ verse1: "1절", chorus: "후렴", verse2: "2절", chorus2: "후렴" }[k]}</p>
                    {plan.lyrics[k].map((l, i) => <p key={i}>{l}</p>)}
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
