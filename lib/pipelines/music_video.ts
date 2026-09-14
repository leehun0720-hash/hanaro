import path from "node:path";
import { fileName, shortName } from "@/lib/filename";
import fs from "node:fs/promises";
import type { Pipeline } from "@/lib/jobs";
import { generateJSON } from "@/lib/providers/anthropic";
import { composeMusic } from "@/lib/providers/elevenlabs";
import { buildCompositionPlan, mvEditableSchema, mvInputSchema, mvOutputSchema, mvSystemPrompt, mvUserPrompt, MV_SCENE_SECONDS, MV_SCENES, type MvOutput } from "@/lib/prompts/mv";
import { normalizeMusicOptions } from "@/lib/music-options";
import { normalizeStyle } from "@/lib/video/subtitle-style";
import { ResumeInputError } from "@/lib/jobs";
import { cleanup, concatClips, finalize, normalizeClip, SIZE_169, tmpDir } from "@/lib/video/ffmpeg";
import type { Cue } from "@/lib/video/subtitles";
import { fetchAssetFile, fetchClipFiles, referenceUrls, startClips, waitClips } from "./video-common";

const KEYS = Array.from({ length: MV_SCENES }, (_, i) => `scene${i + 1}`);
const TOTAL = MV_SCENES * MV_SCENE_SECONDS; // 60초

/** 뮤직비디오 1분: plan → music → video:start → video:wait → compose */
export const musicVideoPipeline: Pipeline = {
  firstStep: "plan",
  async run(ctx, step) {
    const input = mvInputSchema.parse(ctx.job.input);

    if (step === "plan") {
      const plan = await generateJSON(mvOutputSchema, { system: mvSystemPrompt(), user: mvUserPrompt(input, ctx.project), effort: "high" });
      if (plan.scenes.length < MV_SCENES) throw new Error("장면 설계가 부족합니다. 다시 시도해 주세요.");
      await ctx.update({ output: { plan: { ...plan, scenes: plan.scenes.slice(0, MV_SCENES) }, notice: null } });
      return { next: "await:plan" }; // 사용자가 가사·장면·음악 설정을 확인·수정한 뒤 시작
    }

    const plan = ctx.job.output.plan as MvOutput | undefined;
    if (!plan) throw new Error("가사·장면 설계가 없습니다.");

    if (step === "music") {
      await ctx.update({ output: { notice: "ElevenLabs가 작곡·녹음하는 중입니다 (1~2분)." } });
      const mp3 = await composeMusic(buildCompositionPlan(plan, input.genre, normalizeMusicOptions(ctx.job.output.music_opts ?? input.music)));
      const asset = await ctx.saveAsset({ kind: "audio", ext: "mp3", data: mp3, mime: "audio/mpeg", meta: { filename: fileName([shortName(plan.title, 8), "음원"], "mp3"), title: plan.title } });
      await ctx.update({ output: { music_asset_id: asset.id } });
      return { next: "video:start" };
    }

    if (step === "video:start") {
      const refs = await referenceUrls(ctx, input.refPhoto, "16:9");
      const started = await startClips(ctx, plan.scenes.map((s, i) => ({ key: KEYS[i], prompt: s.videoPrompt, seconds: MV_SCENE_SECONDS })), "16:9", refs);
      return { next: started ? "video:wait" : "video:start" };
    }

    if (step === "video:wait") {
      const tmp = await tmpDir();
      try {
        const done = await waitClips(ctx, KEYS, tmp);
        return done ? { next: "compose" } : { next: "video:wait" };
      } finally {
        await cleanup(tmp);
      }
    }

    if (step === "compose") {
      await ctx.update({ output: { notice: "장면 4개를 잇고 음원·자막을 입히는 중입니다 (2~4분). 화면을 닫아도 서버에서 계속됩니다." } });
      const tmp = await tmpDir();
      try {
        const files = await fetchClipFiles(ctx, KEYS, tmp);
        const audio = await fetchAssetFile(String(ctx.job.output.music_asset_id), tmp, "song.mp3");
        const parts: string[] = [];
        for (let i = 0; i < KEYS.length; i++) {
          const out = path.join(tmp, `n_${KEYS[i]}.mp4`);
          await normalizeClip(files[KEYS[i]], out, SIZE_169, MV_SCENE_SECONDS, { fadeIn: i === 0 });
          parts.push(out);
        }
        const joined = path.join(tmp, "joined.mp4");
        await concatClips(parts, joined, tmp);
        // 자막 = 가사 한 줄씩 (섹션 15초를 줄 수로 나눠 노래와 맞춘다). 마지막 3초는 조합명 카드
        const sections = [plan.lyrics.verse1, plan.lyrics.chorus, plan.lyrics.verse2, plan.lyrics.chorus2];
        const cues: Cue[] = [];
        sections.forEach((lines, si) => {
          const start = si * MV_SCENE_SECONDS;
          const span = si === sections.length - 1 ? MV_SCENE_SECONDS - 3 : MV_SCENE_SECONDS;
          const ls = lines.map((l) => l.trim()).filter(Boolean);
          const per = span / Math.max(1, ls.length);
          ls.forEach((text, i) => cues.push({ start: start + i * per, end: start + (i + 1) * per - 0.05, text }));
        });
        cues.push({ start: TOTAL - 3, end: TOTAL, text: `${input.orgName} · ${plan.title}` });
        const final = path.join(tmp, "final.mp4");
        await finalize(joined, final, { cues, size: SIZE_169, audio, totalSeconds: TOTAL, fadeOut: true, style: normalizeStyle(ctx.job.output.subtitle_style ?? input.subtitle) });
        const data = await fs.readFile(final);
        const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: fileName([shortName(plan.title, 8), "MV"], "mp4"), final: true } });
        await ctx.update({ output: { final_asset_id: asset.id } });
        return { done: true };
      } finally {
        await cleanup(tmp);
      }
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },

  /** await:plan — 가사·장면·음악 설정·자막 스타일 수정 후 시작 */
  async resume(ctx, action, data) {
    if (ctx.job.step !== "await:plan") throw new ResumeInputError("지금은 수정할 수 있는 단계가 아니에요.");
    const current = ctx.job.output.plan as MvOutput;
    const patch: Record<string, unknown> = {};
    if (data.plan !== undefined) {
      const parsed = mvEditableSchema.safeParse(data.plan);
      if (!parsed.success) throw new ResumeInputError(`수정 내용을 확인하세요: ${parsed.error.issues[0]?.message ?? ""}`);
      const clean = (arr: string[]) => arr.map((l) => l.trim()).filter(Boolean);
      patch.plan = { ...current, title: parsed.data.title, lyrics: { verse1: clean(parsed.data.lyrics.verse1), chorus: clean(parsed.data.lyrics.chorus), verse2: clean(parsed.data.lyrics.verse2), chorus2: clean(parsed.data.lyrics.chorus2) }, scenes: parsed.data.scenes, musicStyles: parsed.data.musicStyles };
    }
    if (data.music !== undefined) patch.music_opts = normalizeMusicOptions(data.music);
    if (data.subtitle !== undefined) patch.subtitle_style = normalizeStyle(data.subtitle);
    if (Object.keys(patch).length) await ctx.update({ output: patch });
    if (action === "save") return { next: "await:plan" };
    if (action === "start") return { next: "music" };
    throw new ResumeInputError("알 수 없는 동작이에요.");
  },
};
