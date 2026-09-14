"use client";
import { useState } from "react";
import Link from "next/link";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import type { PromoOutput } from "@/lib/prompts/promo";
import type { Project } from "@/lib/types";
import { RefPhotoPicker } from "@/components/RefPhotoPicker";
import { TTS_VOICES, type TtsVoice } from "@/lib/tts-voices";
import { VIDEO_MODELS, type VideoModel } from "@/lib/video-models";
import { SubtitleStylePicker } from "@/components/SubtitleStylePicker";
import { DEFAULT_STYLE, type SubtitleStyle } from "@/lib/video/subtitle-style";

const STEPS = {
  plan: "Claude가 3컷 설계도를 그리는 중",
  video: "AI가 컷을 촬영하는 중 (2~6분)",
  poster: "행동 유도(CTA) 포스터를 그리는 중",
  compose: "컷을 잇고 자막을 입히는 중 (ffmpeg)",
};

export function PromoClient({ projects, photoUrls, preselect, credits, initial }: { projects: Project[]; photoUrls: Record<string, string>; preselect: string | null; credits: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? projects[0]?.id ?? "");
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  const [refPhoto, setRefPhoto] = useState<string | null>(null); // 기본: 참조 안 함
  const [ambient, setAmbient] = useState(true);
  const [narration, setNarration] = useState(true);
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [quality, setQuality] = useState<"standard" | "pro">("standard");
  const [model, setModel] = useState<VideoModel>("kling");
  const [style, setStyle] = useState<SubtitleStyle>(DEFAULT_STYLE);
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
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.what ? ` · ${p.what.length > 20 ? p.what.slice(0, 20) + "…" : p.what}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="label">화면 비율</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRatio("16:9")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "16:9" ? "border-brand bg-brand-soft" : "border-line"}`}>16:9 유튜브·안내판</button>
            <button type="button" onClick={() => setRatio("9:16")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "9:16" ? "border-brand bg-brand-soft" : "border-line"}`}>9:16 쇼츠·릴스</button>
          </div>
        </div>
        <div>
          <label className="label">첫 장면 참조 사진 (선택)</label>
          <RefPhotoPicker photos={project?.photos ?? []} urls={photoUrls} value={refPhoto} onChange={setRefPhoto} />
          <p className="hint">고른 사진은 <b>첫 컷(후크)의 첫 프레임</b>으로만 쓰이고, 화면 비율에 맞게 가운데를 잘라 사용합니다(세로 영상이면 세로 사진 권장). 나머지 컷은 장면 설명으로 촬영하며 보관함의 이전 자료는 참조하지 않습니다. 동의 받은 사진만, 얼굴 클로즈업은 피하세요.</p>
        </div>
        <div>
          <label className="label">영상 모델</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(VIDEO_MODELS) as VideoModel[]).map((m) => (
              <button key={m} type="button" onClick={() => setModel(m)} className={`rounded-lg border px-3 py-2 text-left text-sm ${model === m ? "border-brand bg-brand-soft" : "border-line"}`}>
                <div className="font-medium">{VIDEO_MODELS[m].label}</div>
                <div className="text-[11px] text-muted">{VIDEO_MODELS[m].desc} · {VIDEO_MODELS[m].priceNote}</div>
              </button>
            ))}
          </div>
          {model === "veo" && <p className="hint">Veo는 클립이 최대 8초라 10초 컷은 살짝 느린 화면(1.25배)으로 채웁니다. 사람·얼굴 관련 안전 필터가 Kling보다 엄격합니다.</p>}
        </div>
        <div>
          <label className="label">품질</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setQuality("standard")} className={`rounded-lg border px-3 py-2 text-sm ${quality === "standard" ? "border-brand bg-brand-soft" : "border-line"}`}>표준 720p (빠름)</button>
            <button type="button" onClick={() => setQuality("pro")} className={`rounded-lg border px-3 py-2 text-sm ${quality === "pro" ? "border-brand bg-brand-soft" : "border-line"}`}>고품질 1080p Pro (느림 · 비용 약 1.3배)</button>
          </div>
        </div>
        <div>
          <label className="label">소리</label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={ambient} onChange={(e) => setAmbient(e.target.checked)} /> 현장음·효과음 (Kling)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={narration} onChange={(e) => setNarration(e.target.checked)} /> 한국어 내레이션 (자막을 읽어줌)</label>
            {narration && (
              <select value={voice} onChange={(e) => setVoice(e.target.value as TtsVoice)} className="input w-auto py-1.5 text-xs">
                {(Object.keys(TTS_VOICES) as TtsVoice[]).map((v) => <option key={v} value={v}>{TTS_VOICES[v]}</option>)}
              </select>
            )}
          </div>
          <p className="hint">현장음을 켜고 참조 사진을 고르면 오디오 지원 모델을 써서 비용이 조금 늘어요. 배경음악이 필요하면 완성본을 실습 제작실의 자막 도구에서 mp3와 섞을 수 있습니다.</p>
        </div>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">자막 폰트·테마 (기본: Noto Sans · 검정 박스)</summary>
          <div className="mt-3"><SubtitleStylePicker style={style} onChange={setStyle} ratio={ratio} sampleText="추석 선물세트 예약 접수 중" compact /></div>
        </details>
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
        buildInput={() => ({ ratio, refPhoto, quality, model, subtitle: style, sound: { ambient, narration, voice }, mood: mood || undefined, extra: extra || undefined })}
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
              <p className="hint">게시 전 점검: 내레이션·자막이 화면과 맞는가 · 무음으로 봐도 이해되는가 · 날짜·전화번호·지점명 오타 0건 · ‘AI 생성’ 표기 권장. 파일명 규칙: 팀명_홍보영상_v1.mp4</p>
            </div>
          );
        }}
      />
    </div>
  );
}
