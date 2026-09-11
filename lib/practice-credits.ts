import { adminClient } from "@/lib/supabase/admin";

/**
 * 실습 하드캡 크레딧 (SPEC §3.4): 1인 이미지 3회 · 영상 2회. ro와 별개로 관리한다.
 * 기본값은 환경변수 DEFAULT_IMAGE_CREDITS / DEFAULT_VIDEO_CREDITS (테이블 default는 3/2).
 */
export type PracticeKind = "image" | "video";
export type PracticeCredits = { image_left: number; video_left: number };

export const DEFAULT_IMAGE_CREDITS = Math.max(0, Number(process.env.DEFAULT_IMAGE_CREDITS ?? 3) || 3);
export const DEFAULT_VIDEO_CREDITS = Math.max(0, Number(process.env.DEFAULT_VIDEO_CREDITS ?? 2) || 2);

export class NoPracticeCredits extends Error {
  kind: PracticeKind;
  constructor(kind: PracticeKind) {
    super(kind === "image" ? "이미지 편집 횟수를 모두 사용했습니다. 강사에게 충전을 요청하세요." : "영상 생성 횟수를 모두 사용했습니다. 강사에게 충전을 요청하세요.");
    this.name = "NoPracticeCredits";
    this.kind = kind;
  }
}

/** 없으면 기본값으로 만들고 현재 잔여 횟수를 돌려준다 */
export async function getPracticeCredits(userId: string): Promise<PracticeCredits> {
  const db = adminClient();
  const { data } = await db.from("practice_credits").select("image_left, video_left").eq("user_id", userId).maybeSingle();
  if (data) return data as PracticeCredits;
  await db.from("practice_credits").insert({ user_id: userId, image_left: DEFAULT_IMAGE_CREDITS, video_left: DEFAULT_VIDEO_CREDITS }).select().maybeSingle();
  return { image_left: DEFAULT_IMAGE_CREDITS, video_left: DEFAULT_VIDEO_CREDITS };
}

export async function consumePracticeCredit(userId: string, kind: PracticeKind): Promise<number> {
  await getPracticeCredits(userId); // 행 보장 (기본값 적용)
  const { data, error } = await adminClient().rpc("practice_use", { p_user: userId, p_kind: kind });
  if (error) {
    if (error.message.includes("NO_PRACTICE_CREDITS")) throw new NoPracticeCredits(kind);
    throw error;
  }
  return data as number;
}

export async function refundPracticeCredit(userId: string, kind: PracticeKind): Promise<void> {
  const { error } = await adminClient().rpc("practice_refund", { p_user: userId, p_kind: kind });
  if (error) console.error("practice refund failed", error);
}

export async function setPracticeCredits(userId: string, image: number, video: number): Promise<void> {
  const { error } = await adminClient().rpc("practice_set", { p_user: userId, p_image: Math.max(0, image), p_video: Math.max(0, video) });
  if (error) throw error;
}
