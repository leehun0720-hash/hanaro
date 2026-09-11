import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { setPracticeCredits } from "@/lib/practice-credits";

export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().uuid(), image: z.coerce.number().int().min(0).max(99), video: z.coerce.number().int().min(0).max(99) });

/** 실습 크레딧 충전/설정 (SPEC §10, admin 전용) */
export async function POST(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인하세요." }, { status: 400 });
  await setPracticeCredits(parsed.data.userId, parsed.data.image, parsed.data.video);
  return NextResponse.json({ ok: true });
}
