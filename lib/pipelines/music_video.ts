import path from "node:path";
import fs from "node:fs/promises";
import type { Pipeline } from "@/lib/jobs";
import { generateJSON } from "@/lib/providers/anthropic";
import { composeMusic } from "@/lib/providers/elevenlabs";
import { buildCompositionPlan, mvInputSchema, mvOutputSchema, mvSystemPrompt, mvUserPrompt, MV_SCENE_SECONDS, MV_SCENES, type MvOutput } from "@/lib/prompts/mv";
import { cleanup, concatClips, finalize, normalizeClip, SIZE_169, tmpDir } from "@/lib/video/ffmpeg";
import { cuesFromSegments } from "@/lib/video/subtitles";
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
      await ctx.update({ output: { plan: { ...plan, scenes: plan.scenes.slice(0, MV_SCENES) } } });
      return { next: "music" };
    }

    const plan = ctx.job.output.plan as MvOutput | undefined;
    if (!plan) throw new Error("가사·장면 설계가 없습니다.");

    if (step === "music") {
      const mp3 = await composeMusic(buildCompositionPlan(plan, input.genre));
      const asset = await ctx.saveAsset({ kind: "audio", ext: "mp3", data: mp3, mime: "audio/mpeg", meta: { filename: `${plan.title}_응원송.mp3`, title: plan.title } });
      await ctx.update({ output: { music_asset_id: asset.id } });
      return { next: "video:start" };
    }

    if (step === "video:start") {
      const refs = await referenceUrls(ctx, 1);
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
        const cues = cuesFromSegments(plan.scenes.map((s) => ({ seconds: MV_SCENE_SECONDS, text: s.captionKo })));
        // 마지막 3초: 조합명 카드 자막
        cues[cues.length - 1].end -= 3;
        cues.push({ start: TOTAL - 3, end: TOTAL, text: `${input.orgName} · ${plan.title}` });
        const final = path.join(tmp, "final.mp4");
        await finalize(joined, final, { cues, size: SIZE_169, audio, totalSeconds: TOTAL, fadeOut: true });
        const data = await fs.readFile(final);
        const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: `${plan.title}_뮤직비디오_1분.mp4`, final: true } });
        await ctx.update({ output: { final_asset_id: asset.id } });
        return { done: true };
      } finally {
        await cleanup(tmp);
      }
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },
};
