import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, type Asset, type Job } from "@/lib/types";

export const metadata = { title: "보관함" };

type Row = Job & { assets: Asset[] };

const ROOM_HREF: Record<Job["type"], string> = { document: "/studio/document", newsletter: "/studio/newsletter", cardnews: "/studio/cardnews", promo_video: "/studio/promo-video", music_video: "/studio/music-video", practice: "/studio/practice" };

export default async function LibraryPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("*, assets(*)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">보관함</h1>
        <p className="mt-1 text-sm text-muted">만든 산출물을 다시 내려받습니다. 파일명 규칙: 팀명_산출물_v1 — ‘진짜최종_2’ 금지.</p>
      </div>
      {rows.length === 0 ? (
        <div className="card text-sm text-muted">아직 만든 산출물이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((j) => (
            <div key={j.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{JOB_TYPE_LABEL[j.type]}</span>
                  <span className="ml-2 text-xs text-muted">{new Date(j.created_at).toLocaleString("ko-KR")} · ro {j.credits}</span>
                </div>
                <span className={`badge ${j.status === "succeeded" ? "bg-brand-soft text-brand-deep" : j.status === "failed" ? "bg-danger-soft text-danger" : "bg-gold-soft text-[#7a5d00]"}`}>{JOB_STATUS_LABEL[j.status]}</span>
              </div>
              {j.error && <p className="mt-2 text-sm text-danger">{j.error}</p>}
              {(j.status === "waiting" || j.status === "running" || j.status === "queued") && (
                <Link href={j.type === "practice" ? `/studio/practice?job=${j.id}` : ROOM_HREF[j.type]} className="btn-primary mt-3 text-xs">{j.status === "waiting" ? "이어서 하기 →" : "진행 상황 보기 →"}</Link>
              )}
              {j.assets?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {j.assets.map((a) => (
                    <a key={a.id} href={`/api/assets/${a.id}?download=1`} className="btn-secondary text-xs">
                      {(a.meta as { filename?: string }).filename ?? a.kind}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
