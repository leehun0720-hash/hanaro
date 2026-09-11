import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jobWithAssets, resumeJob, ResumeInputError } from "@/lib/jobs";
import { checkPII } from "@/lib/pii";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.string().min(1).max(40),
  data: z.record(z.string(), z.unknown()).default({}),
});

/** 확인 대기(waiting) 중인 작업에 사용자 입력 전달: 사진 승인·재생성, 프롬프트 수정, 자막·음악 편집, 완료 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  const pii = checkPII(JSON.stringify(parsed.data.data));
  if (pii.blocked) return NextResponse.json({ error: pii.warnings[0] }, { status: 400 });

  try {
    await resumeJob(id, user.id, parsed.data.action, parsed.data.data);
    return NextResponse.json(await jobWithAssets(id, user.id));
  } catch (e) {
    const status = e instanceof ResumeInputError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "입력을 처리할 수 없습니다." }, { status });
  }
}
