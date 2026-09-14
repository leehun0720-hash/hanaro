import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts, costFor } from "@/lib/credits";
import { latestJobForRoom } from "@/lib/jobs";
import type { Project } from "@/lib/types";
import { PromoClient } from "./PromoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "홍보영상 30초" };

export default async function PromoVideoPage({ searchParams }: PageProps<"/studio/promo-video">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [costs, supabase, initial] = await Promise.all([getCosts(), createClient(), latestJobForRoom(profile.id, "promo_video")]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">홍보영상 30초</h1>
        <p className="mt-1 text-sm text-muted">30초 황금 구조 — 후크 3초 · 메시지 20초 · 행동 유도 7초. Claude가 3컷을 설계하고 Kling 3.0이 촬영, 자막을 입혀 무음으로도 읽히게 만듭니다.</p>
      </div>
      <PromoClient initial={initial} projects={projects} preselect={preselect} credits={costFor("promo_video", costs)} />
    </div>
  );
}
