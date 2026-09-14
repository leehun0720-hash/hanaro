import type { Pipeline } from "@/lib/jobs";
import { generateJSON } from "@/lib/providers/anthropic";
import { generateImage, IMAGE_SIZES } from "@/lib/providers/openai-image";
import { newsletterImagePrompt, newsletterInputSchema, newsletterOutputSchema, newsletterSystemPrompt, newsletterUserPrompt, type NewsletterOutput } from "@/lib/prompts/newsletter";

/** 뉴스레터: plan(5섹션 원고 + 이미지 문구) → image(카톡용 3:4 이미지 1장) */
export const newsletterPipeline: Pipeline = {
  firstStep: "plan",
  async run(ctx, step) {
    const input = newsletterInputSchema.parse(ctx.job.input);
    if (!ctx.project) throw new Error("뉴스레터는 프로젝트(소재)를 먼저 선택해야 합니다.");

    if (step === "plan") {
      const draft = await generateJSON(newsletterOutputSchema, {
        system: newsletterSystemPrompt(),
        user: newsletterUserPrompt(input, ctx.project, ctx.orgName),
        effort: "high",
      });
      await ctx.update({ output: { draft } });
      return { next: "image" };
    }

    if (step === "image") {
      const draft = ctx.job.output.draft as NewsletterOutput | undefined;
      if (!draft) throw new Error("원고가 없습니다. 다시 시도해 주세요.");
      const prompt = newsletterImagePrompt(draft.image, ctx.orgName);
      const png = await generateImage({ prompt, size: IMAGE_SIZES.portrait34, quality: "high" });
      const asset = await ctx.saveAsset({ kind: "image", ext: "png", data: png, mime: "image/png", meta: { filename: "뉴스레터.png", prompt } });
      await ctx.update({ output: { image_asset_id: asset.id } });
      return { done: true };
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },
};
