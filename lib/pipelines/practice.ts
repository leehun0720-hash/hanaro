import path from "node:path";
import fs from "node:fs/promises";
import type { Pipeline, JobContext } from "@/lib/jobs";
import { ResumeInputError } from "@/lib/jobs";
import { generateJSON, type ImageInput } from "@/lib/providers/anthropic";
import { editImage, IMAGE_SIZES } from "@/lib/providers/openai-image";
import { FAL_I2V_AUDIO_ENDPOINT_DEFAULT, FAL_I2V_AUDIO_ENDPOINT_PRO, FAL_VIDEO_ENDPOINT_DEFAULT, FAL_VIDEO_ENDPOINT_PRO, getVideoResult, getVideoStatus, isContentRejection, klingCostUsd, koReasonFor, submitVideo } from "@/lib/providers/fal";
import { isTtsVoice, synthesizeSpeech, ttsCostUsd } from "@/lib/providers/openai-tts";
import { adminClient } from "@/lib/supabase/admin";
import { canStartVideoTasks, countAheadInQueue, estimateWaitSeconds } from "@/lib/concurrency";
import { getPracticeCredits, NoPracticeCredits, refundPracticeCredit, consumePracticeCredit } from "@/lib/practice-credits";
import { getSecret } from "@/lib/secrets";
import { buildNarrationTrack, cleanup, downloadTo, finalize, normalizeClip, SIZE_169, SIZE_916, tmpDir } from "@/lib/video/ffmpeg";
import type { Cue } from "@/lib/video/subtitles";
import { normalizeStyle, type SubtitleStyle } from "@/lib/video/subtitle-style";
import {
  assembleKlingPrompt,
  clampDialogue,
  defaultCues,
  DIALOGUE_MAX,
  normalizeCues,
  normalizeVideoPrompt,
  PRACTICE_SYSTEM_PROMPT,
  practiceInputSchema,
  practicePhotoPrompt,
  practicePlanSchema,
  practiceUserMessage,
  sceneInputSchema,
  type PracticeDuration,
  type PracticePlan,
  type SceneInput,
} from "@/lib/prompts/practice";
import { fetchAssetFile } from "./video-common";

/**
 * 실습 제작실 상태 머신 (SPEC v1.0)
 *   photo → await:photo ─(accept + 장면·대사·길이)→ prompt → await:prompt ─(start)→ video:start → video:wait → await:subtitle ─(finish)→ done
 *                └(regenerate, 이미지 크레딧)→ photo         └(retry, 설명 수정)→ prompt      └(regenerate_video, 영상 크레딧)→ video:start
 *                                                                                                └(burn_server, 브라우저 실패 시)→ compose → await:subtitle
 * ⑤ 자막은 기본적으로 브라우저(ffmpeg.wasm)에서 처리하고, 서버 합성은 대체 경로(compose)다.
 */

const IMAGE_COST_USD = Math.max(0, Number(process.env.PRACTICE_IMAGE_COST_USD ?? 0.08) || 0);
const RETENTION_DAYS = Math.max(1, Number(process.env.ASSET_RETENTION_DAYS ?? 7) || 7);
const deleteAfter = () => new Date(Date.now() + RETENTION_DAYS * 86400_000).toISOString();

export type PracticeOut = {
  photo_asset_id?: string;
  photo_tries?: number;
  photo_prompt?: string;
  scene?: SceneInput;
  plan?: PracticePlan;
  prompt_error?: string | null;
  video_prompt?: string; // Kling에 보낼 최종 영어 프롬프트(사용자 수정 반영)
  video_endpoint?: string;
  /** 현장음(Kling 네이티브 오디오) 켬 — 오디오 지원 엔드포인트 사용 */
  video_sound?: boolean;
  video_tries?: number;
  /** 한국어 내레이션(자막 읽어주기) mp3 자산 */
  narration_asset_id?: string;
  narration_voice?: string;
  clip_asset_id?: string;
  cues?: Cue[];
  subtitle_style?: SubtitleStyle;
  final_asset_id?: string;
  version?: number;
  queue_position?: number | null;
  eta_seconds?: number | null;
  notice?: string | null;
  credits_used?: { image: number; video: number };
};

const out = (ctx: JobContext) => ctx.job.output as PracticeOut;

async function loadUpload(userId: string, p: string) {
  if (!p.startsWith(`${userId}/`)) throw new Error("본인이 올린 사진만 사용할 수 있어요.");
  const { data } = await adminClient().storage.from("uploads").download(p);
  if (!data) throw new Error("업로드한 사진을 찾을 수 없어요. 다시 올려 주세요.");
  const lower = p.toLowerCase();
  const mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return { data: Buffer.from(await data.arrayBuffer()), name: p.split("/").pop() ?? "photo.jpg", mime };
}

async function assetRow(assetId: string) {
  const { data } = await adminClient().from("assets").select("storage_path").eq("id", assetId).single();
  if (!data) throw new Error("파일을 찾을 수 없어요.");
  return data as { storage_path: string };
}

async function outputsSignedUrl(assetId: string, seconds = 60 * 60): Promise<string> {
  const a = await assetRow(assetId);
  const { data } = await adminClient().storage.from("outputs").createSignedUrl(a.storage_path, seconds);
  if (!data?.signedUrl) throw new Error("파일 URL을 만들 수 없어요.");
  return data.signedUrl;
}

async function readAsset(assetId: string): Promise<Buffer> {
  const a = await assetRow(assetId);
  const { data } = await adminClient().storage.from("outputs").download(a.storage_path);
  if (!data) throw new Error("파일 다운로드 실패");
  return Buffer.from(await data.arrayBuffer());
}

const addCost = async (ctx: JobContext, usd: number) => {
  if (!usd) return;
  const next = Math.round(((Number(ctx.job.cost_usd) || 0) + usd) * 10000) / 10000;
  await adminClient().from("jobs").update({ cost_usd: next }).eq("id", ctx.job.id);
  ctx.job.cost_usd = next;
};

const bump = (o: PracticeOut, kind: "image" | "video") => ({ image: (o.credits_used?.image ?? 0) + (kind === "image" ? 1 : 0), video: (o.credits_used?.video ?? 0) + (kind === "video" ? 1 : 0) });

/** Kling 결과 영상 저장 → 자막 단계로. 폴링·웹훅 양쪽에서 호출 */
export async function completePracticeVideo(ctx: JobContext, videoUrl: string): Promise<{ next: string }> {
  const o = out(ctx);
  const tmp = await tmpDir();
  try {
    const file = path.join(tmp, "clip.mp4");
    await downloadTo(videoUrl, file); // 결과 URL은 만료되므로 즉시 Storage로 복사 (SPEC §3.3)
    const data = await fs.readFile(file);
    const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: "실습_원본.mp4", clip: true }, deleteAfter: deleteAfter() });
    const duration = o.scene?.duration ?? 5;
    await ctx.update({ output: { clip_asset_id: asset.id, cues: o.cues?.length ? o.cues : defaultCues(o.plan?.dialogue_ko, duration), queue_position: null, eta_seconds: null, notice: null } });
  } finally {
    await cleanup(tmp);
  }
  return { next: "await:subtitle" };
}

export const practicePipeline: Pipeline = {
  firstStep: "photo",

  async run(ctx, step) {
    const input = practiceInputSchema.parse(ctx.job.input);
    const o = out(ctx);
    const userId = ctx.job.user_id;

    /* ② 이미지 편집/합성 — 이미지 크레딧 1회 */
    if (step === "photo") {
      await consumePracticeCredit(userId, "image");
      try {
        const tries = (o.photo_tries ?? 0) + 1;
        const reference = await loadUpload(userId, input.photoPath);
        const prompt = practicePhotoPrompt(input.preset, o.photo_prompt ?? input.instruction, input.ratio, input.allowText);
        const png = await editImage({ prompt, size: input.ratio === "9:16" ? IMAGE_SIZES.portrait916 : IMAGE_SIZES.landscape169, quality: "high", references: [reference] });
        const asset = await ctx.saveAsset({ kind: "image", ext: "png", data: png, mime: "image/png", meta: { filename: `실습_이미지_v${tries}.png`, stage: "image", try: tries, preset: input.preset }, deleteAfter: deleteAfter() });
        await addCost(ctx, IMAGE_COST_USD);
        await ctx.update({ output: { photo_asset_id: asset.id, photo_tries: tries, credits_used: bump(o, "image"), notice: null } });
        return { next: "await:photo" };
      } catch (e) {
        await refundPracticeCredit(userId, "image"); // 실패(필터/타임아웃) 시 환불 (SPEC §5②)
        throw e;
      }
    }

    /* ③ Claude 프롬프트 변환 (§7 템플릿) — 크레딧 미차감 */
    if (step === "prompt") {
      if (!o.photo_asset_id || !o.scene) throw new Error("승인된 이미지와 장면 설명이 필요해요.");
      const scene = sceneInputSchema.parse(o.scene);
      const image: ImageInput = { data: await readAsset(o.photo_asset_id), mime: "image/png" };
      const plan = await generateJSON(practicePlanSchema, { system: PRACTICE_SYSTEM_PROMPT, user: practiceUserMessage(scene, input.preset), effort: "medium", maxTokens: 4000, images: [image] });
      if (plan.error || !plan.prompt_en) {
        await ctx.update({ output: { plan, prompt_error: plan.error ?? "프롬프트를 만들지 못했어요. 장면 설명을 바꿔 보세요.", video_prompt: undefined } });
        return { next: "await:prompt" };
      }
      const duration = (scene.duration === 10 ? 10 : 5) as PracticeDuration;
      const fixed: PracticePlan = { ...plan, duration, dialogue_ko: clampDialogue(plan.dialogue_ko ?? scene.dialogueKo, duration) };
      await ctx.update({ output: { plan: fixed, prompt_error: null, video_prompt: assembleKlingPrompt({ prompt_en: fixed.prompt_en!, dialogue_ko: fixed.dialogue_ko, negative: fixed.negative }), cues: defaultCues(fixed.dialogue_ko, duration) } });
      return { next: "await:prompt" };
    }

    /* ④ Kling 3.0 제출 — 전체 상한 게이트 + 영상 크레딧 1회 */
    if (step === "video:start") {
      const prompt = o.video_prompt;
      const duration = (o.scene?.duration === 10 ? 10 : 5) as PracticeDuration;
      if (!prompt || !o.photo_asset_id) throw new Error("영상 프롬프트 또는 이미지가 없어요.");
      const gate = await canStartVideoTasks(1);
      if (!gate.ok) {
        const ahead = await countAheadInQueue(ctx.job.id, ctx.job.created_at);
        const eta = estimateWaitSeconds(ahead);
        await ctx.update({ output: { queue_position: ahead + 1, eta_seconds: eta, notice: `영상 생성 순서를 기다리는 중이에요. 내 순번 ${ahead + 1} · 예상 ${Math.ceil(eta / 60)}분 (동시 ${gate.active}/${gate.limit}). 기다리는 동안 아래에서 자막을 미리 적어 두세요.` } });
        return { next: "video:start" };
      }
      await consumePracticeCredit(userId, "video");
      try {
        const imageUrl = await outputsSignedUrl(o.photo_asset_id, 60 * 60 * 6);
        const endpoint = o.video_endpoint ?? FAL_VIDEO_ENDPOINT_DEFAULT;
        const base = (await getSecret("APP_BASE_URL")) ?? process.env.NEXT_PUBLIC_SITE_URL;
        const whSecret = await getSecret("FAL_WEBHOOK_SECRET");
        const webhookUrl = base && whSecret && !/localhost|127\.0\.0\.1/.test(base) ? `${base.replace(/\/$/, "")}/api/webhooks/fal?token=${encodeURIComponent(whSecret)}` : undefined;
        // 현장음을 켜면 Kling이 대사를 영어로 더빙하지 않도록 말소리를 막는다 (한국어 음성은 내레이션으로)
        const finalPrompt = o.video_sound ? `${prompt} Natural ambient sound and light sound effects only, no speech, no singing.`.slice(0, 2500) : prompt;
        const { requestId } = await submitVideo({ imageUrl, prompt: finalPrompt, duration, endpoint, webhookUrl, generateAudio: Boolean(o.video_sound) });
        await addCost(ctx, klingCostUsd(endpoint, duration, Boolean(o.video_sound)));
        await ctx.update({
          provider_task_ids: { clip: requestId },
          output: { video_endpoint: endpoint, video_tries: (o.video_tries ?? 0) + 1, credits_used: bump(o, "video"), fal_request_ids: [requestId], queue_position: null, eta_seconds: null, notice: "Kling에 제출했어요. 5초 클립은 보통 1.5~3분 걸려요. 기다리는 동안 자막을 미리 적어 두세요." },
        });
        return { next: "video:wait" };
      } catch (e) {
        await refundPracticeCredit(userId, "video");
        throw new Error(isContentRejection(e) ? koReasonFor(e) : e instanceof Error ? e.message : String(e));
      }
    }

    if (step === "video:wait") {
      const requestId = ctx.job.provider_task_ids.clip;
      const endpoint = o.video_endpoint ?? FAL_VIDEO_ENDPOINT_DEFAULT;
      if (!requestId) throw new Error("영상 작업 ID가 없어요.");
      let s;
      try {
        s = await getVideoStatus(endpoint, requestId);
      } catch (e) {
        if (isContentRejection(e)) {
          await refundPracticeCredit(userId, "video");
          throw new Error(koReasonFor(e));
        }
        throw e;
      }
      if (s.status === "IN_QUEUE") {
        await ctx.update({ output: { queue_position: s.queuePosition ?? null, notice: `fal 큐 대기 중${typeof s.queuePosition === "number" ? ` · 앞에 ${s.queuePosition}건` : ""}. 자막을 미리 적어 두세요.` } });
        return { next: "video:wait" };
      }
      if (s.status === "IN_PROGRESS") {
        await ctx.update({ output: { queue_position: 0, notice: "Kling이 영상을 만드는 중이에요 (1~3분). 자막을 미리 적어 두세요." } });
        return { next: "video:wait" };
      }
      try {
        const { videoUrl } = await getVideoResult(endpoint, requestId);
        return completePracticeVideo(ctx, videoUrl);
      } catch (e) {
        if (isContentRejection(e)) {
          await refundPracticeCredit(userId, "video");
          throw new Error(koReasonFor(e));
        }
        throw e;
      }
    }

    /* ⑤ 서버 대체 합성 (브라우저 ffmpeg.wasm 실패 시) */
    if (step === "compose") {
      if (!o.clip_asset_id) throw new Error("원본 영상이 없어요.");
      const size = input.ratio === "9:16" ? SIZE_916 : SIZE_169;
      const duration = o.scene?.duration ?? 5;
      const tmp = await tmpDir();
      try {
        const clip = await fetchAssetFile(o.clip_asset_id, tmp, "clip.mp4");
        const norm = path.join(tmp, "norm.mp4");
        await normalizeClip(clip, norm, size, duration, { fadeIn: false, keepAudio: true });
        // 원본 소리(있으면) + 한국어 내레이션(만들어 두었으면)
        const narration = o.narration_asset_id ? await fetchAssetFile(o.narration_asset_id, tmp, "narration.mp3") : undefined;
        const final = path.join(tmp, "final.mp4");
        await finalize(norm, final, { cues: o.cues ?? [], size, totalSeconds: duration, fadeOut: false, style: normalizeStyle(o.subtitle_style), keepSourceAudio: true, narration });
        const version = (o.version ?? 0) + 1;
        const data = await fs.readFile(final);
        const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: `실습_자막_v${version}.mp4`, final: true, version, server: true }, deleteAfter: deleteAfter() });
        await ctx.update({ output: { final_asset_id: asset.id, version, notice: null } });
      } finally {
        await cleanup(tmp);
      }
      return { next: "await:subtitle" };
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },

  async resume(ctx, action, data) {
    practiceInputSchema.parse(ctx.job.input); // 입력 무결성 확인
    const o = out(ctx);
    const step = ctx.job.step;

    if (step === "await:photo") {
      if (action === "regenerate") {
        const c = await getPracticeCredits(ctx.job.user_id);
        if (c.image_left <= 0) throw new ResumeInputError(new NoPracticeCredits("image").message);
        const instr = typeof data.instruction === "string" ? data.instruction.trim().slice(0, 500) : "";
        await ctx.update({ output: { photo_prompt: instr || undefined } });
        return { next: "photo" }; // 크레딧 차감은 photo 단계에서
      }
      if (action === "accept") {
        const parsed = sceneInputSchema.safeParse({ sceneKo: data.sceneKo, dialogueKo: data.dialogueKo, duration: data.duration });
        if (!parsed.success) throw new ResumeInputError(parsed.error.issues[0]?.message ?? "장면 설명을 확인하세요.");
        await ctx.update({ output: { scene: parsed.data } });
        return { next: "prompt" };
      }
    }

    if (step === "await:prompt") {
      if (action === "retry") {
        // 장면 설명·대사·길이를 고쳐 다시 변환
        const parsed = sceneInputSchema.safeParse({ sceneKo: data.sceneKo ?? o.scene?.sceneKo, dialogueKo: data.dialogueKo ?? o.scene?.dialogueKo, duration: data.duration ?? o.scene?.duration });
        if (!parsed.success) throw new ResumeInputError(parsed.error.issues[0]?.message ?? "장면 설명을 확인하세요.");
        await ctx.update({ output: { scene: parsed.data, prompt_error: null } });
        return { next: "prompt" };
      }
      if (action === "start") {
        if (!o.plan?.prompt_en) throw new ResumeInputError("먼저 프롬프트를 만들어 주세요.");
        const c = await getPracticeCredits(ctx.job.user_id);
        if (c.video_left <= 0) throw new ResumeInputError(new NoPracticeCredits("video").message);
        const duration = (o.scene?.duration === 10 ? 10 : 5) as PracticeDuration;
        const vp = normalizeVideoPrompt(data.videoPrompt ?? o.video_prompt);
        if ("error" in vp) throw new ResumeInputError(vp.error);
        const dialogue = data.dialogueKo !== undefined ? clampDialogue(String(data.dialogueKo ?? ""), duration) : o.plan.dialogue_ko;
        if (dialogue && [...dialogue].length > DIALOGUE_MAX[duration]) throw new ResumeInputError(`대사는 ${duration}초 영상에서 ${DIALOGUE_MAX[duration]}자 이하로 적어 주세요.`);
        const plan: PracticePlan = { ...o.plan, dialogue_ko: dialogue };
        const pro = data.quality === "pro";
        const sound = data.sound === true;
        const endpoint = sound ? (pro ? FAL_I2V_AUDIO_ENDPOINT_PRO : FAL_I2V_AUDIO_ENDPOINT_DEFAULT) : pro ? FAL_VIDEO_ENDPOINT_PRO : FAL_VIDEO_ENDPOINT_DEFAULT;
        await ctx.update({ output: { plan, video_prompt: assembleKlingPrompt({ prompt_en: vp.prompt, dialogue_ko: dialogue, negative: plan.negative }), video_endpoint: endpoint, video_sound: sound, cues: o.cues?.length ? o.cues : defaultCues(dialogue, duration) } });
        return { next: "video:start" };
      }
    }

    if (step === "await:subtitle") {
      const duration = o.scene?.duration ?? 5;
      if (action === "save_cues") {
        // 대기 중·자막 단계에서 자막 초안 저장 (브라우저 합성용, 서버 대체 합성에도 사용)
        const cs = normalizeCues(data.cues, duration);
        if ("error" in cs) throw new ResumeInputError(cs.error);
        await ctx.update({ output: { cues: cs.cues } });
        return { next: "await:subtitle" };
      }
      if (action === "narrate") {
        // 한국어 내레이션: 자막 문장을 시작 시각에 맞춰 읽어 mp3 자산으로 저장 (브라우저·서버 합성 모두 사용)
        const cs = normalizeCues(data.cues ?? o.cues, duration);
        if ("error" in cs) throw new ResumeInputError(cs.error);
        const voice = isTtsVoice(data.voice) ? data.voice : undefined;
        const tmp = await tmpDir();
        try {
          const parts: { file: string; start: number; maxSeconds: number }[] = [];
          let chars = 0;
          for (let i = 0; i < cs.cues.length; i++) {
            const c = cs.cues[i];
            const text = c.text.trim();
            if (!text || c.end <= c.start) continue;
            const file = path.join(tmp, `tts_${i}.mp3`);
            await fs.writeFile(file, await synthesizeSpeech({ text, voice }));
            parts.push({ file, start: c.start, maxSeconds: c.end - c.start });
            chars += text.length;
          }
          if (!parts.length) throw new ResumeInputError("읽을 자막이 없어요. 자막을 먼저 적어 주세요.");
          const outFile = path.join(tmp, "narration.mp3");
          await buildNarrationTrack(parts, duration, outFile);
          const mp3 = await fs.readFile(outFile);
          const asset = await ctx.saveAsset({ kind: "audio", ext: "mp3", data: mp3, mime: "audio/mpeg", meta: { filename: "내레이션.mp3", narration: true, intermediate: true }, deleteAfter: deleteAfter() });
          await addCost(ctx, ttsCostUsd(chars));
          await ctx.update({ output: { cues: cs.cues, narration_asset_id: asset.id, narration_voice: voice ?? "nova" } });
        } finally {
          await cleanup(tmp);
        }
        return { next: "await:subtitle" };
      }
      if (action === "burn_server") {
        const cs = normalizeCues(data.cues ?? o.cues, duration);
        if ("error" in cs) throw new ResumeInputError(cs.error);
        await ctx.update({ output: { cues: cs.cues, subtitle_style: normalizeStyle(data.style) } });
        return { next: "compose" };
      }
      if (action === "regenerate_video") {
        const c = await getPracticeCredits(ctx.job.user_id);
        if (c.video_left <= 0) throw new ResumeInputError(new NoPracticeCredits("video").message);
        const vp = normalizeVideoPrompt(data.videoPrompt ?? o.video_prompt);
        if ("error" in vp) throw new ResumeInputError(vp.error);
        await ctx.update({ output: { video_prompt: vp.prompt, clip_asset_id: undefined, final_asset_id: undefined } });
        return { next: "video:start" }; // 영상 크레딧은 video:start에서 검사
      }
      if (action === "finish") {
        if (data.cues !== undefined) {
          const cs = normalizeCues(data.cues, duration);
          if ("cues" in cs) await ctx.update({ output: { cues: cs.cues } });
        }
        // 브라우저에서 만든 최종 파일을 갤러리에 보관한 경우 (선택): outputs/{uid}/{jobId}/... 경로를 assets에 기록
        const p = typeof data.finalPath === "string" ? data.finalPath : "";
        if (p) {
          if (!p.startsWith(`${ctx.job.user_id}/${ctx.job.id}/`)) throw new ResumeInputError("보관 경로가 올바르지 않아요.");
          const { data: obj } = await adminClient().storage.from("outputs").list(path.posix.dirname(p), { search: path.posix.basename(p) });
          const size = obj?.[0]?.metadata?.size as number | undefined;
          const { data: asset } = await adminClient()
            .from("assets")
            .insert({ user_id: ctx.job.user_id, job_id: ctx.job.id, kind: "video", storage_path: p, mime: "video/mp4", size: size ?? null, meta: { filename: `실습_최종.mp4`, final: true, browser: true }, delete_after: deleteAfter() })
            .select("id")
            .single();
          if (asset) await ctx.update({ output: { final_asset_id: asset.id } });
        }
        return { done: true };
      }
    }

    // 사진 승인 전 취소 등 공통
    throw new ResumeInputError("지금 단계에서 할 수 없는 동작이에요.");
  },
};

/** 실패·취소 시 진행 단계에 따라 실습 크레딧을 돌려준다 (photo·video:start 내부 실패는 이미 처리됨) */
export async function refundPracticeOnCancel(job: { user_id: string; step: string | null; provider_task_ids: Record<string, string> }) {
  if (job.step === "video:wait" && job.provider_task_ids.clip) await refundPracticeCredit(job.user_id, "video");
}

export { NoPracticeCredits };
