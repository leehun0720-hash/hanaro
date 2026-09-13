"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { JobRunner, type JobResult, type ResumeFn } from "@/components/JobRunner";
import { CueEditor, SubtitleStudio } from "@/components/SubtitleStudio";
import type { Cue } from "@/lib/video/subtitles";
import { DIALOGUE_MAX, PRACTICE_DURATIONS, STYLE_PRESETS, type PracticeDuration, type PracticePlan, type SceneInput, type StylePreset } from "@/lib/prompts/practice";
import type { PracticeCredits } from "@/lib/practice-credits";

const STEPS = {
  photo: "② GPT가 사진을 편집하는 중 (30~60초)",
  prompt: "③ Claude가 한국어 설명을 영상 프롬프트로 바꾸는 중",
  video: "④ Kling 3.0이 한국어 음성 영상을 만드는 중 (1.5~3분)",
  compose: "⑤ 서버에서 자막을 입히는 중",
};

type Out = {
  photo_asset_id?: string;
  photo_tries?: number;
  scene?: SceneInput;
  plan?: PracticePlan;
  prompt_error?: string | null;
  video_prompt?: string;
  clip_asset_id?: string;
  cues?: Cue[];
  final_asset_id?: string;
  version?: number;
  queue_position?: number | null;
  eta_seconds?: number | null;
  notice?: string | null;
  credits_used?: { image: number; video: number };
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIDE = 2048;

/** 브라우저에서 리사이즈(최대 2048px) 후 JPEG로 (SPEC §5①) */
async function resizeImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), "image/jpeg", 0.92));
}

/** 브라우저 → Supabase Storage 직접 업로드 (서버리스 본문 제한 우회, SPEC §3.3) */
async function uploadToStorage(bucket: "uploads" | "outputs", path: string, blob: Blob, contentType: string): Promise<string> {
  const { error } = await createClient().storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return path;
}

export function PracticeClient({ userId, nickname, credits, practiceCredits, initial }: { userId: string; nickname: string; credits: number; practiceCredits: PracticeCredits; initial?: JobResult | null }) {
  const [photo, setPhoto] = useState<{ path: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preset, setPreset] = useState<StylePreset>("photo");
  const [instruction, setInstruction] = useState("");
  const [ratio, setRatio] = useState<"16:9" | "9:16">("16:9");
  // 자막 초안은 영상 대기 중에도 작성 가능 → 상위 상태로 유지 (초기값: 진행 중 작업의 저장분)
  const [cues, setCues] = useState<Cue[]>(((initial?.job.output as Out | undefined)?.cues ?? []) as Cue[]);

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      if (!IMAGE_TYPES.includes(file.type)) throw new Error("jpg·png·webp 사진만 올릴 수 있어요.");
      if (file.size > 10 * 1024 * 1024) throw new Error("사진은 10MB 이하만 올릴 수 있어요.");
      const blob = await resizeImage(file);
      const path = await uploadToStorage("uploads", `${userId}/practice/${crypto.randomUUID()}.jpg`, blob, "image/jpeg");
      setPhoto({ path, preview: URL.createObjectURL(blob) });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  const hasActive = Boolean(initial && initial.job.status !== "succeeded" && initial.job.status !== "failed");

  return (
    <div className="space-y-6">
      {!hasActive && (
        <div className="card space-y-5">
          <div>
            <label className="label">① 내 사진 1장 (jpg/png/webp, 10MB 이하)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="input" disabled={uploading} onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)} />
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.preview} alt="내 사진" className="mt-3 h-32 rounded-lg border border-line object-cover" />
            )}
            <p className="hint">얼굴이 정면으로 잘 보이는 본인 사진이 가장 잘 됩니다. 업로드 시 자동으로 2048px 이하로 줄여요.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">② 스타일 프리셋</label>
              <select value={preset} onChange={(e) => setPreset(e.target.value as StylePreset)} className="input">
                {(Object.keys(STYLE_PRESETS) as StylePreset[]).map((k) => <option key={k} value={k}>{STYLE_PRESETS[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">화면 비율</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRatio("16:9")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "16:9" ? "border-brand bg-brand-soft" : "border-line"}`}>16:9 가로</button>
                <button type="button" onClick={() => setRatio("9:16")} className={`rounded-lg border px-3 py-2 text-sm ${ratio === "9:16" ? "border-brand bg-brand-soft" : "border-line"}`}>9:16 세로</button>
              </div>
            </div>
          </div>
          <div>
            <label className="label">추가 지시 (선택, 한국어)</label>
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} className="input" placeholder="예) 가을 배 과수원을 배경으로, 잘 익은 배를 들고 있는 모습" />
            <p className="hint">화면 속 글자(간판·제목)는 넣지 않아요. 글자는 ⑤ 자막 단계에서 우리 앱이 입힙니다.</p>
          </div>
          {uploadError && <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{uploadError}</div>}
        </div>
      )}

      <JobRunner
        type="practice"
        projectId={null}
        credits={credits}
        steps={STEPS}
        initial={initial}
        buttonLabel="② 사진 편집 시작 (이미지 1회)"
        disabled={uploading || hasActive || practiceCredits.image_left <= 0}
        buildInput={() => {
          if (!photo) return { error: "사진을 먼저 올려 주세요." };
          return { photoPath: photo.path, preset, instruction: instruction.trim() || undefined, ratio, allowText: false };
        }}
        renderRunning={(r) => {
          const o = r.job.output as Out;
          const step = r.job.step ?? "";
          if (!step.startsWith("video")) return null;
          return <DraftCuesWhileWaiting cues={cues} setCues={setCues} duration={o.scene?.duration ?? 5} />;
        }}
        renderWaiting={(r, resume, busy) => <WaitingPanel r={r} resume={resume} busy={busy} userId={userId} nickname={nickname} cues={cues} setCues={setCues} />}
        renderResult={({ job, assets }) => {
          const o = job.output as Out;
          const final = assets.find((a) => a.id === o.final_asset_id);
          const clip = assets.find((a) => a.id === o.clip_asset_id);
          return (
            <div className="card space-y-3">
              <h2 className="font-semibold">실습 완료 🎉</h2>
              {final ? (
                <>
                  <p className="text-sm text-muted">자막이 입혀진 완성본</p>
                  <video src={`/api/assets/${final.id}`} controls playsInline className="w-full rounded-lg border border-line bg-black" />
                </>
              ) : clip ? (
                <>
                  <p className="text-sm text-danger">자막을 입히지 않고 완료해서 자막 없는 원본만 남았어요. 아래 원본을 내려받아 다시 시작하거나, 새 실습에서 ‘자막 입히기’ 후 ‘완료’를 누르세요.</p>
                  <video src={`/api/assets/${clip.id}`} controls playsInline className="w-full rounded-lg border border-line bg-black" />
                </>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {final && <a href={`/api/assets/${final.id}?download=1`} className="btn-primary text-xs">보관본 다운로드</a>}
                {clip && <a href={`/api/assets/${clip.id}?download=1`} className="btn-secondary text-xs">자막 없는 원본 다운로드</a>}
                <a href="/studio/practice" className="btn-secondary text-xs">새 실습 시작</a>
              </div>
              <p className="hint">생성물은 실습 종료 후 자동 삭제됩니다. 필요한 파일은 지금 내려받으세요.</p>
            </div>
          );
        }}
      />
    </div>
  );
}

/* ---------- 확인 대기 화면 ---------- */

function WaitingPanel({ r, resume, busy, userId, nickname, cues, setCues }: { r: JobResult; resume: ResumeFn; busy: boolean; userId: string; nickname: string; cues: Cue[]; setCues: (c: Cue[]) => void }) {
  const step = r.job.step;
  const ratio = (r.job.input.ratio === "9:16" ? "9:16" : "16:9") as "16:9" | "9:16";
  if (step === "await:photo") return <PhotoReview r={r} resume={resume} busy={busy} ratio={ratio} />;
  if (step === "await:prompt") return <PromptReview r={r} resume={resume} busy={busy} />;
  if (step === "await:subtitle") return <SubtitlePanel r={r} resume={resume} busy={busy} userId={userId} nickname={nickname} ratio={ratio} cues={cues} setCues={setCues} />;
  return <div className="card text-sm">확인 대기 중: {step}</div>;
}

function CancelButton({ jobId, busy }: { jobId: string; busy: boolean }) {
  const [working, setWorking] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-muted hover:text-danger underline"
      disabled={busy || working}
      onClick={async () => {
        if (!confirm("이 실습을 취소할까요? 진행 중인 단계의 횟수는 돌려받아요.")) return;
        setWorking(true);
        await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
        router.replace("/studio/practice");
        router.refresh();
      }}
    >
      실습 취소
    </button>
  );
}

function PhotoReview({ r, resume, busy, ratio }: { r: JobResult; resume: ResumeFn; busy: boolean; ratio: "16:9" | "9:16" }) {
  const o = r.job.output as Out;
  const photo = r.assets.find((a) => a.id === o.photo_asset_id);
  const [instruction, setInstruction] = useState(String(r.job.input.instruction ?? ""));
  const [sceneKo, setSceneKo] = useState("");
  const [dialogueKo, setDialogueKo] = useState("");
  const [duration, setDuration] = useState<PracticeDuration>(5);
  const dlgLen = [...dialogueKo.trim()].length;
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">② 편집된 이미지 확인 <span className="badge bg-gray-100 text-muted ml-2">{o.photo_tries ?? 1}회째</span></h2>
        <div className="flex items-center gap-3">{photo && <a href={`/api/assets/${photo.id}?download=1`} className="btn-secondary text-xs">다운로드</a>}<CancelButton jobId={r.job.id} busy={busy} /></div>
      </div>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${photo.id}`} alt="편집된 이미지" className={`rounded-lg border border-line ${ratio === "9:16" ? "max-h-[60vh] mx-auto" : "w-full"}`} />
      )}
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">마음에 안 들면 지시를 고쳐 다시 편집 (이미지 1회 사용)</summary>
        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} maxLength={500} className="input mt-2" placeholder="예) 배경을 봄 벚꽃길로, 밝게 웃는 표정으로" />
        <div className="mt-2 flex justify-end"><button type="button" className="btn-secondary" disabled={busy} onClick={() => resume("regenerate", { instruction })}>다시 편집</button></div>
      </details>

      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="font-semibold">③ 이 이미지로 만들 영상을 한국어로 설명하세요</h3>
        <div>
          <label className="label">장면 설명 (무엇을 하고, 어떤 분위기인지)</label>
          <textarea value={sceneKo} onChange={(e) => setSceneKo(e.target.value)} rows={3} maxLength={600} className="input" placeholder="예) 과수원에서 배를 한 입 베어 물고 카메라를 보며 환하게 웃는다. 따뜻한 오후 햇살, 카메라가 천천히 다가온다." />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <div>
            <label className="label">대사 (선택, 한국어 · {duration}초는 {DIALOGUE_MAX[duration]}자 이내)</label>
            <input value={dialogueKo} onChange={(e) => setDialogueKo(e.target.value)} maxLength={120} className="input" placeholder="예) 올해 배, 진짜 달아요!" />
            <p className={`hint ${dlgLen > DIALOGUE_MAX[duration] ? "text-danger" : ""}`}>{dlgLen}자 {dlgLen > DIALOGUE_MAX[duration] ? "— 길면 Claude가 의미를 살려 줄여요" : ""}</p>
          </div>
          <div>
            <label className="label">영상 길이</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value) as PracticeDuration)} className="input">
              {PRACTICE_DURATIONS.map((d) => <option key={d} value={d}>{d}초</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn-primary" disabled={busy || sceneKo.trim().length < 2} onClick={() => resume("accept", { sceneKo, dialogueKo: dialogueKo || undefined, duration })}>③ 영상 프롬프트 만들기 →</button>
        </div>
      </div>
    </div>
  );
}

function PromptReview({ r, resume, busy }: { r: JobResult; resume: ResumeFn; busy: boolean }) {
  const o = r.job.output as Out;
  const photo = r.assets.find((a) => a.id === o.photo_asset_id);
  const duration = (o.scene?.duration === 10 ? 10 : 5) as PracticeDuration;
  const [sceneKo, setSceneKo] = useState(o.scene?.sceneKo ?? "");
  const [dialogueKo, setDialogueKo] = useState(o.plan?.dialogue_ko ?? o.scene?.dialogueKo ?? "");
  const [prompt, setPrompt] = useState(o.plan?.prompt_en ?? "");
  const [quality, setQuality] = useState<"standard" | "pro">("standard");
  const failed = Boolean(o.prompt_error || !o.plan?.prompt_en);
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">③ 영상 프롬프트 확인</h2>
        <CancelButton jobId={r.job.id} busy={busy} />
      </div>
      {failed && <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{o.prompt_error ?? "프롬프트를 만들지 못했어요."} 장면 설명을 고쳐 다시 시도하세요.</div>}
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${photo.id}`} alt="편집된 이미지" className="w-full rounded-lg border border-line object-cover" />
        )}
        <div className="space-y-2">
          <div>
            <label className="label">장면 설명 (한국어)</label>
            <textarea value={sceneKo} onChange={(e) => setSceneKo(e.target.value)} rows={2} maxLength={600} className="input" />
          </div>
          <div>
            <label className="label">대사 (한국어 · {DIALOGUE_MAX[duration]}자 이내 · 영상 속 음성으로 말해요)</label>
            <input value={dialogueKo} onChange={(e) => setDialogueKo(e.target.value)} maxLength={120} className="input" />
          </div>
          <div className="flex justify-end"><button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => resume("retry", { sceneKo, dialogueKo: dialogueKo || undefined, duration })}>설명을 고쳐 다시 변환</button></div>
        </div>
      </div>
      {!failed && (
        <>
          <div>
            <label className="label">Claude가 만든 영상 프롬프트 (영어 · 필요하면 수정)</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={2400} className="input font-mono text-xs" />
            <p className="hint">화면 속 글자 금지 조건과 대사 문장은 서버가 자동으로 붙여요. 길이 {duration}초.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={quality === "pro"} onChange={(e) => setQuality(e.target.checked ? "pro" : "standard")} /> 고품질 1080p (Turbo Pro, 우수작 재생성용)
            </label>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => resume("start", { videoPrompt: prompt, dialogueKo: dialogueKo || "", quality })}>④ Kling 3.0으로 영상 만들기 (영상 1회) →</button>
          </div>
        </>
      )}
    </div>
  );
}

function SubtitlePanel({ r, resume, busy, userId, nickname, ratio, cues, setCues }: { r: JobResult; resume: ResumeFn; busy: boolean; userId: string; nickname: string; ratio: "16:9" | "9:16"; cues: Cue[]; setCues: (c: Cue[]) => void }) {
  const o = r.job.output as Out;
  const duration = o.scene?.duration ?? 5;
  const clip = r.assets.find((a) => a.id === o.clip_asset_id);
  const final = r.assets.find((a) => a.id === o.final_asset_id);
  const [prompt, setPrompt] = useState(o.video_prompt ?? "");
  const [keptPath, setKeptPath] = useState<string | null>(null);
  // 로컬 초안이 비어 있으면 서버에 저장된 자막(대사 기본값) 사용
  const effective = cues.length ? cues : (o.cues ?? []);

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">⑤ 한글 자막 입히기 · ⑥ 다운로드</h2>
        <CancelButton jobId={r.job.id} busy={busy} />
      </div>
      <p className="text-sm text-muted">▼ Kling이 만든 <b>자막 없는 원본</b>입니다. 아래에서 자막을 적고 ‘자막 입히기’를 누르면 결과 영상이 그 아래에 나타납니다.</p>
      {clip && <video key={clip.id} src={`/api/assets/${clip.id}`} controls playsInline className={`w-full rounded-lg border border-line bg-black ${ratio === "9:16" ? "max-h-[60vh] mx-auto" : ""}`} />}
      {o.plan?.dialogue_ko && <p className="text-sm"><span className="text-muted">대사:</span> {o.plan.dialogue_ko}</p>}
      {final && (
        <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3 text-sm">
          서버에서 합성한 자막 영상이 준비됐어요. <a href={`/api/assets/${final.id}?download=1`} className="font-semibold underline">다운로드</a>
        </div>
      )}
      {clip && (
        <SubtitleStudio
          videoUrl={`/api/assets/${clip.id}`}
          cues={effective}
          onCuesChange={setCues}
          duration={duration}
          ratio={ratio}
          nickname={nickname}
          busy={busy}
          onServerFallback={() => resume("burn_server", { cues: effective })}
          onKeep={async (blob) => {
            const path = `${userId}/${r.job.id}/final-${Date.now()}.mp4`;
            await uploadToStorage("outputs", path, blob, "video/mp4");
            setKeptPath(path);
          }}
          onFinish={async (burned) => {
            let finalPath = keptPath;
            if (!finalPath && burned) {
              // 보관 버튼을 누르지 않았어도 완료 시 자막 영상을 저장해 완료 화면·보관함에 남긴다
              finalPath = `${userId}/${r.job.id}/final-${Date.now()}.mp4`;
              await uploadToStorage("outputs", finalPath, burned, "video/mp4");
            }
            await resume("finish", finalPath ? { finalPath, cues: effective } : { cues: effective });
          }}
        />
      )}
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">영상이 마음에 안 들면 프롬프트를 고쳐 다시 생성 (영상 1회 사용)</summary>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={2400} className="input mt-2 font-mono text-xs" />
        <div className="mt-2 flex justify-end"><button type="button" className="btn-secondary" disabled={busy} onClick={() => resume("regenerate_video", { videoPrompt: prompt })}>④ 다시 생성</button></div>
      </details>
    </div>
  );
}

/** 영상 대기 중 자막 미리 작성 (SPEC §5④: 대기 체감 축소) */
function DraftCuesWhileWaiting({ cues, setCues, duration }: { cues: Cue[]; setCues: (c: Cue[]) => void; duration: number }) {
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">기다리는 동안 자막을 미리 적어 두세요</h3>
      <p className="hint">영상이 완성되면 이 자막이 그대로 ⑤ 단계에 들어갑니다. 한 줄 20자 이내.</p>
      <CueEditor cues={cues} onChange={setCues} total={duration} />
    </div>
  );
}
