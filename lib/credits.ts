import type { JobType, Profile } from "@/lib/types";
import { adminClient } from "@/lib/supabase/admin";

/** 1 ro = 정가 100원 (지니젠 벤치마크) */
export const BANANA_KRW = 100;

/** 산출물 단위 ro 소모량 (기본값, 관리자 수정 가능) */
export const DEFAULT_COSTS: Record<string, number> = {
  document: 3,
  newsletter: 8,
  cardnews_page: 5,
  promo_video: 55,
  music_video: 110,
  practice: 40,
};

export const COST_LABEL: Record<string, string> = {
  document: "문서(HWP) 1건",
  newsletter: "뉴스레터 1건 (원고+이미지)",
  cardnews_page: "카드뉴스 1장",
  promo_video: "홍보영상 30초",
  music_video: "뮤직비디오 1분",
  practice: "실습 제작실 1회 (사진→영상)",
};

export const COST_DETAIL: Record<string, string> = {
  document: "Claude 초안 + 한글(HWPX) 조립",
  newsletter: "Claude 5섹션 원고 + GPT Image 카톡 이미지 1장",
  cardnews_page: "문구 설계 + GPT Image 1장",
  promo_video: "3컷 설계 + Kling 3.0 클립 25초 + CTA 포스터 + 자막 합성",
  music_video: "가사·장면 설계 + ElevenLabs 1분 + Kling 3.0 60초 + 합성",
  practice: "GPT 이미지 편집(하드캡 3회) + Claude 프롬프트 + Kling 3.0 한국어 음성 영상(하드캡 2회) + 브라우저 자막",
};

/** 작업 종류·옵션에 따른 ro 소모량 (순수 함수) */
export function costFor(type: JobType, costs: Record<string, number>, opts: { pages?: number } = {}): number {
  if (type === "cardnews") {
    const per = costs.cardnews_page ?? DEFAULT_COSTS.cardnews_page;
    return per * Math.max(1, opts.pages ?? 1);
  }
  return costs[type] ?? DEFAULT_COSTS[type];
}

/** 총 잔여 ro = 월 지급분 + 충전분 */
export const totalBananas = (p: Pick<Profile, "credits" | "banana_purchased">) => (p.credits ?? 0) + (p.banana_purchased ?? 0);

export const krw = (n: number) => n.toLocaleString("ko-KR") + "원";

export async function getCosts(): Promise<Record<string, number>> {
  const { data } = await adminClient().from("plan_settings").select("credit_costs").eq("id", 1).single();
  return { ...DEFAULT_COSTS, ...((data?.credit_costs as Record<string, number> | undefined) ?? {}) };
}

export class InsufficientCredits extends Error {
  constructor() {
    super("ro가 부족합니다. ro를 충전하거나 구독을 시작해 주세요.");
    this.name = "InsufficientCredits";
  }
}

export async function deductCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("deduct_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job: jobId });
  if (error) {
    if (error.message.includes("INSUFFICIENT_CREDITS")) throw new InsufficientCredits();
    throw error;
  }
  return data as number;
}

export async function addCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("add_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job: jobId });
  if (error) throw error;
  return data as number;
}

export async function setCredits(userId: string, amount: number, reason: string) {
  const { data, error } = await adminClient().rpc("set_credits", { p_user: userId, p_amount: amount, p_reason: reason });
  if (error) throw error;
  return data as number;
}
