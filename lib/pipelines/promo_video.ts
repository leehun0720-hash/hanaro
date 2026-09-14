import path from "node:path";
import fs from "node:fs/promises";
import type { Pipeline } from "@/lib/jobs";
import { generateJSON } from "@/lib/providers/anthropic";
import { generateImage, IMAGE_SIZES } from "@/lib/providers/openai-image";
import { promoInputSchema, promoOutputSchema, promoPosterPrompt, promoSystemPrompt, promoUserPrompt, PROMO_CUTS, type PromoOutput } from "@/lib/prompts/promo";
import { buildNarrationTrack, cleanup, concatClips, finalize, imageToClip, normalizeClip, SIZE_169, SIZE_916, tmpDir } from "@/lib/video/ffmpeg";
import { isTtsVoice, synthesizeSpeech, ttsCostUsd } from "@/lib/providers/openai-tts";
import { adminClient } from "@/lib/supabase/admin";
import { cuesFromSegments } from "@/lib/video/subtitles";
import { fetchAssetFile, fetchClipFiles, referenceUrls, startClips, waitClips } from "./video-common";

const CLIP_KEYS = ["hook", "messageA", "messageB"] as const;

/** 홍보영상 30초: plan → video:start → video:wait → poster → compose */
export const promoVideoPipeline: Pipeline = {
  firstStep: "plan",
  async run(ctx, step) {
    const input = promoInputSchema.parse(ctx.job.input);
    if (!ctx.project) throw new Error("홍보영상은 프로젝트(소재)를 먼저 선택해야 합니다.");

    if (step === "plan") {
      const plan = await generateJSON(promoOutputSchema, { system: promoSystemPrompt(), user: promoUserPrompt(input, ctx.project, ctx.orgName), effort: "high" });
      await ctx.update({ output: { plan } });
      return { next: "video:start" };
    }

    const plan = ctx.job.output.plan as PromoOutput | undefined;
    if (!plan) throw new Error("3컷 설계가 없습니다. 다시 시도해 주세요.");

    if (step === "video:start") {
      const refs = await referenceUrls(ctx, input.refPhoto);
      const started = await startClips(
        ctx,
        [
          { key: "hook", prompt: plan.cuts.hook.videoPrompt, seconds: 5 },
          { key: "messageA", prompt: plan.cuts.messageA.videoPrompt, seconds: 10 },
          { key: "messageB", prompt: plan.cuts.messageB.videoPrompt, seconds: 10 },
        ],
        input.ratio,
        refs,
        { ambient: input.sound.ambient },
      );
      return { next: started ? "video:wait" : "video:start" };
    }

    if (step === "video:wait") {
      const tmp = await tmpDir();
      try {
        const done = await waitClips(ctx, [...CLIP_KEYS], tmp);
        return done ? { next: "poster" } : { next: "video:wait" };
      } finally {
        await cleanup(tmp);
      }
    }

    if (step === "poster") {
      await ctx.update({ output: { notice: "클립 3개 완성. 마지막 장면용 포스터를 그리는 중입니다 (약 1분)." } });
      const png = await generateImage({ prompt: promoPosterPrompt(plan.poster, input.ratio, ctx.orgName), size: input.ratio === "9:16" ? IMAGE_SIZES.portrait916 : IMAGE_SIZES.landscape169, quality: "high" });
      const asset = await ctx.saveAsset({ kind: "image", ext: "png", data: png, mime: "image/png", meta: { filename: "홍보영상_CTA포스터.png", intermediate: true } });
      await ctx.update({ output: { poster_asset_id: asset.id } });
      return { next: "compose" };
    }

    if (step === "compose") {
      await ctx.update({ output: { notice: `컷 4개를 잇고 자막${input.sound.narration ? "·내레이션" : ""}을 입히는 중입니다 (2~4분). 화면을 닫아도 서버에서 계속됩니다.` } });
      const size = input.ratio === "9:16" ? SIZE_916 : SIZE_169;
      const tmp = await tmpDir();
      try {
        const files = await fetchClipFiles(ctx, [...CLIP_KEYS], tmp);
        const poster = await fetchAssetFile(String(ctx.job.output.poster_asset_id), tmp, "poster.png");
        const parts: string[] = [];
        for (const cut of PROMO_CUTS) {
          const out = path.join(tmp, `n_${cut.key}.mp4`);
          if (cut.key === "cta") await imageToClip(poster, out, size, cut.seconds);
          else await normalizeClip(files[cut.key], out, size, cut.seconds, { fadeIn: cut.key === "hook", keepAudio: input.sound.ambient });
          parts.push(out);
        }
        const joined = path.join(tmp, "joined.mp4");
        await concatClips(parts, joined, tmp);
        const segments = [
          { seconds: 3, text: plan.cuts.hook.caption },
          { seconds: 10, text: plan.cuts.messageA.caption },
          { seconds: 10, text: plan.cuts.messageB.caption },
          { seconds: 7, text: plan.cuts.cta.caption },
        ];
        const cues = cuesFromSegments(segments);

        // 한국어 내레이션: 자막 문장을 컷 시작 시각에 읽어준다 (Kling 음성은 한국어 미지원)
        let narration: string | undefined;
        if (input.sound.narration) {
          const voice = isTtsVoice(input.sound.voice) ? input.sound.voice : undefined;
          const spoken: { file: string; start: number; maxSeconds: number }[] = [];
          let chars = 0;
          for (let i = 0; i < cues.length; i++) {
            const text = cues[i].text.trim();
            if (!text) continue;
            const file = path.join(tmp, `tts_${i}.mp3`);
            await fs.writeFile(file, await synthesizeSpeech({ text, voice, speed: i === 0 ? 1.1 : 1 }));
            spoken.push({ file, start: cues[i].start, maxSeconds: cues[i].end - cues[i].start });
            chars += text.length;
          }
          if (spoken.length) {
            narration = path.join(tmp, "narration.mp3");
            await buildNarrationTrack(spoken, 30, narration);
            const nextCost = Math.round(((Number(ctx.job.cost_usd) || 0) + ttsCostUsd(chars)) * 10000) / 10000;
            await adminClient().from("jobs").update({ cost_usd: nextCost }).eq("id", ctx.job.id);
          }
        }
        const final = path.join(tmp, "final.mp4");
        await finalize(joined, final, { cues, size, totalSeconds: 30, fadeOut: true, keepSourceAudio: input.sound.ambient, narration });
        const data = await fs.readFile(final);
        const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: `홍보영상_30초_${input.ratio.replace(":", "x")}.mp4`, final: true } });
        await ctx.update({ output: { final_asset_id: asset.id } });
        return { done: true };
      } finally {
        await cleanup(tmp);
      }
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },
};
