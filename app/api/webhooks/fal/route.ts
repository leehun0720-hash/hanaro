import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { advanceJobSystem, applyStepResult, buildContext, failJob, tryLockJob } from "@/lib/jobs";
import { verifyFalWebhook, koReasonFor, type FalWebhookBody } from "@/lib/providers/fal";
import { completePracticeVideo } from "@/lib/pipelines/practice";
import { refundPracticeCredit } from "@/lib/practice-credits";
import type { Job } from "@/lib/types";
import { getSecret } from "@/lib/secrets";
import { safeEqual } from "@/lib/safe-compare";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * fal.ai 완료 콜백 (SPEC §4·§10). 폴링이 백업이므로 여기서 실패해도 작업은 이어진다.
 *  - 토큰(?token=FAL_WEBHOOK_SECRET) + ED25519 서명 검증
 *  - request_id로 job을 찾아 잠금 → 결과 영상 Storage 복사 → await:subtitle
 *  - 항상 2xx를 돌려 재전송 폭주를 막고, 검증 실패만 4xx
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = await getSecret("FAL_WEBHOOK_SECRET");
  if (!secret || !safeEqual(url.searchParams.get("token"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = Buffer.from(await request.arrayBuffer());
  const strict = process.env.FAL_WEBHOOK_VERIFY !== "off";
  const v = await verifyFalWebhook(request.headers, raw);
  if (!v.ok) {
    console.warn("[fal webhook] 서명 검증 실패:", v.reason);
    if (strict) return NextResponse.json({ error: `signature: ${v.reason}` }, { status: 401 });
  }

  let body: FalWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as FalWebhookBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const requestId = body.request_id;
  if (!requestId) return NextResponse.json({ ok: true, ignored: "no request_id" });

  const db = adminClient();
  const { data: found } = await db.from("jobs").select("*").eq("step", "video:wait").in("status", ["running", "queued"]).contains("output", { fal_request_ids: [requestId] }).limit(1).maybeSingle();
  if (!found) return NextResponse.json({ ok: true, ignored: "job not found or already advanced" });
  const job = found as Job;

  // 홍보영상·뮤직비디오: 해당 단계를 한 번 진행시키면 완료된 클립을 거둬 간다 (여러 클립 중 일부만 끝났어도 안전)
  if (job.type !== "practice") {
    try {
      await advanceJobSystem(job.id);
      return NextResponse.json({ ok: true, advanced: true });
    } catch (e) {
      console.error("[fal webhook] advance 실패, 폴링이 이어받음:", e);
      return NextResponse.json({ ok: true, deferred: true });
    }
  }

  const locked = await tryLockJob(job.id, "video:wait");
  if (!locked) return NextResponse.json({ ok: true, ignored: "locked by poller" });

  try {
    if (body.status === "ERROR" || body.payload_error) {
      const msg = body.error ?? body.payload_error ?? "unknown";
      await refundPracticeCredit(job.user_id, "video");
      await failJob(locked, koReasonFor(new Error(msg)));
      return NextResponse.json({ ok: true, failed: true });
    }
    const videoUrl = (body.payload as { video?: { url?: string } } | undefined)?.video?.url;
    if (!videoUrl) {
      // 결과 없이 OK → 폴링이 result API로 가져가도록 잠금만 푼다
      await db.from("jobs").update({ lock_until: null }).eq("id", job.id);
      return NextResponse.json({ ok: true, ignored: "no video url in payload" });
    }
    const ctx = await buildContext(locked, job.user_id);
    const result = await completePracticeVideo(ctx, videoUrl);
    await applyStepResult(job.id, result);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[fal webhook] 처리 실패, 폴링이 이어받음:", e);
    await db.from("jobs").update({ lock_until: null }).eq("id", job.id);
    return NextResponse.json({ ok: true, deferred: true });
  }
}
