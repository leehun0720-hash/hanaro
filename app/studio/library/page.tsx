import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/Alert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, type Asset, type Job } from "@/lib/types";
import { deleteAsset, deleteJob } from "./actions";

export const metadata = { title: "보관함" };
export const dynamic = "force-dynamic";

type Row = Job & { assets: Asset[] };

const ROOM_HREF: Record<Job["type"], string> = { document: "/studio/document", newsletter: "/studio/newsletter", cardnews: "/studio/cardnews", promo_video: "/studio/promo-video", music_video: "/studio/music-video", practice: "/studio/practice" };

export default async function LibraryPage({ searchParams }: PageProps<"/studio/library">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("*, assets(*)")
    .eq("user_id", profile.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">보관함</h1>
        <p className="mt-1 text-sm text-muted">만든 산출물을 다시 내려받거나 지웁니다. 삭제한 파일은 복구할 수 없고, 보관함의 자료는 새 작업에 참조되지 않습니다.</p>
      </div>
      {sp.deleted && <Alert kind="success">삭제했습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}
      {rows.length === 0 ? (
        <div className="card text-sm text-muted">아직 만든 산출물이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((j) => {
            const active = j.status === "waiting" || j.status === "running" || j.status === "queued";
            return (
              <div key={j.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{JOB_TYPE_LABEL[j.type]}</span>
                    <span className="ml-2 text-xs text-muted">{new Date(j.created_at).toLocaleString("ko-KR")} · ro {j.credits}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${j.status === "succeeded" ? "bg-brand-soft text-brand-deep" : j.status === "failed" ? "bg-danger-soft text-danger" : "bg-gold-soft text-[#7a5d00]"}`}>{JOB_STATUS_LABEL[j.status]}</span>
                    {!active && (
                      <ConfirmForm action={deleteJob} message={`이 ${JOB_TYPE_LABEL[j.type]} 작업의 파일 ${j.assets?.length ?? 0}개를 모두 삭제할까요? 복구할 수 없습니다.`}>
                        <input type="hidden" name="jobId" value={j.id} />
                        <button className="btn-danger px-2.5 py-1 text-xs">삭제</button>
                      </ConfirmForm>
                    )}
                  </div>
                </div>
                {j.error && <p className="mt-2 text-sm text-danger">{j.error}</p>}
                {active && (
                  <Link href={j.type === "practice" ? `/studio/practice?job=${j.id}` : ROOM_HREF[j.type]} className="btn-primary mt-3 text-xs">{j.status === "waiting" ? "이어서 하기 →" : "진행 상황 보기 →"}</Link>
                )}
                {j.assets?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {j.assets.map((a) => (
                      <span key={a.id} className="inline-flex items-stretch overflow-hidden rounded-lg border border-line bg-white text-xs">
                        <a href={`/api/assets/${a.id}?download=1`} className="px-3 py-1.5 hover:bg-brand-soft">{(a.meta as { filename?: string }).filename ?? a.kind}</a>
                        {!active && (
                          <ConfirmForm action={deleteAsset} message="이 파일을 삭제할까요? 복구할 수 없습니다." className="flex">
                            <input type="hidden" name="assetId" value={a.id} />
                            <button className="border-l border-line px-2 text-muted hover:bg-danger-soft hover:text-danger" title="파일 삭제" aria-label="파일 삭제">×</button>
                          </ConfirmForm>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
