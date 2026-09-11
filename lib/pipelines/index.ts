import type { JobType } from "@/lib/types";
import type { Pipeline } from "@/lib/jobs";
import { documentPipeline } from "./document";
import { newsletterPipeline } from "./newsletter";
import { cardnewsPipeline } from "./cardnews";
import { promoVideoPipeline } from "./promo_video";
import { musicVideoPipeline } from "./music_video";
import { practicePipeline } from "./practice";

const registry: Record<JobType, Pipeline> = {
  document: documentPipeline,
  newsletter: newsletterPipeline,
  cardnews: cardnewsPipeline,
  promo_video: promoVideoPipeline,
  music_video: musicVideoPipeline,
  practice: practicePipeline,
};

export function getPipeline(type: JobType): Pipeline {
  const p = registry[type];
  if (!p) throw new Error(`아직 지원하지 않는 작업 유형입니다: ${type}`);
  return p;
}
