import JSZip from "jszip";
import type { Pipeline } from "@/lib/jobs";
import { generateJSON } from "@/lib/providers/anthropic";
import { generateImage, IMAGE_SIZES } from "@/lib/providers/openai-image";
import { cardnewsImagePrompt, cardnewsInputSchema, cardnewsOutputSchema, cardnewsSystemPrompt, cardnewsUserPrompt, type CardnewsOutput } from "@/lib/prompts/cardnews";
import { adminClient } from "@/lib/supabase/admin";

/** 카드뉴스: plan(장별 문구) → image:0 … image:N-1 (장당 1단계) → zip */
export const cardnewsPipeline: Pipeline = {
  firstStep: "plan",
  async run(ctx, step) {
    const input = cardnewsInputSchema.parse(ctx.job.input);
    if (!ctx.project) throw new Error("카드뉴스는 프로젝트(소재)를 먼저 선택해야 합니다.");

    if (step === "plan") {
      const plan = await generateJSON(cardnewsOutputSchema, {
        system: cardnewsSystemPrompt(),
        user: cardnewsUserPrompt(input, ctx.project, ctx.orgName),
        effort: "medium",
      });
      const pages = plan.pages.slice(0, input.pages);
      if (pages.length < 3) throw new Error("카드뉴스 문구 생성이 부족합니다. 다시 시도해 주세요.");
      await ctx.update({ output: { plan: { pages }, image_asset_ids: [] } });
      return { next: "image:0" };
    }

    if (step.startsWith("image:")) {
      const i = Number(step.split(":")[1]);
      const plan = ctx.job.output.plan as CardnewsOutput | undefined;
      const ids = (ctx.job.output.image_asset_ids as string[] | undefined) ?? [];
      if (!plan) throw new Error("문구 설계가 없습니다.");
      const page = plan.pages[i];
      const prompt = cardnewsImagePrompt(page, i, plan.pages.length, input.style, ctx.orgName);
      const png = await generateImage({ prompt, size: IMAGE_SIZES.portrait34, quality: "high" });
      const asset = await ctx.saveAsset({ kind: "image", ext: "png", data: png, mime: "image/png", meta: { filename: `카드뉴스_${i + 1}.png`, page: i + 1, prompt } });
      await ctx.update({ output: { image_asset_ids: [...ids, asset.id] } });
      return i + 1 < plan.pages.length ? { next: `image:${i + 1}` } : { next: "zip" };
    }

    if (step === "zip") {
      const ids = (ctx.job.output.image_asset_ids as string[] | undefined) ?? [];
      const db = adminClient();
      const { data: assets } = await db.from("assets").select("storage_path, meta").in("id", ids).order("created_at");
      const zip = new JSZip();
      for (const a of assets ?? []) {
        const { data } = await db.storage.from("outputs").download(a.storage_path);
        if (data) zip.file(String((a.meta as { filename?: string }).filename ?? "card.png"), Buffer.from(await data.arrayBuffer()));
      }
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      const z = await ctx.saveAsset({ kind: "zip", ext: "zip", data: buf, mime: "application/zip", meta: { filename: "카드뉴스.zip" } });
      await ctx.update({ output: { zip_asset_id: z.id } });
      return { done: true };
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },
};
