import type { Pipeline } from "@/lib/jobs";
import { fileName, shortName } from "@/lib/filename";
import { generateJSON } from "@/lib/providers/anthropic";
import { documentInputSchema, documentOutputSchema, documentSystemPrompt, documentUserPrompt, DOC_TYPES, type DocumentOutput } from "@/lib/prompts/document";
import { buildHwpx, type DocumentJSON } from "@/lib/hwpx/build";

/** 문서: plan(Claude → 구조화 JSON) → build(HWPX 조립·저장) */
export const documentPipeline: Pipeline = {
  firstStep: "plan",
  async run(ctx, step) {
    const input = documentInputSchema.parse(ctx.job.input);

    if (step === "plan") {
      const doc = await generateJSON(documentOutputSchema, {
        system: documentSystemPrompt(),
        user: documentUserPrompt(input, ctx.project, ctx.orgName),
        effort: "high",
      });
      await ctx.update({ output: { doc } });
      return { next: "build" };
    }

    if (step === "build") {
      const doc = ctx.job.output.doc as DocumentOutput | undefined;
      if (!doc) throw new Error("문서 초안이 없습니다. 다시 시도해 주세요.");
      const json: DocumentJSON = {
        title: doc.title,
        meta: { to: doc.meta.to ?? input.to, from: doc.meta.from ?? input.from ?? ctx.orgName ?? undefined, date: doc.meta.date ?? input.date },
        blocks: doc.blocks,
        attachments: doc.attachments,
        closing: doc.closing || undefined,
      };
      const buf = await buildHwpx(json);
      const asset = await ctx.saveAsset({ kind: "hwpx", ext: "hwpx", data: buf, mime: "application/hwp+zip", meta: { filename: fileName([DOC_TYPES[input.docType].label, shortName(doc.title, 10)], "hwpx"), docType: input.docType } });
      await ctx.update({ output: { hwpx_asset_id: asset.id } });
      return { done: true };
    }

    throw new Error(`알 수 없는 단계: ${step}`);
  },
};
