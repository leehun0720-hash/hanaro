import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts, costFor } from "@/lib/credits";
import type { Project } from "@/lib/types";
import { MvClient } from "./MvClient";

export const metadata = { title: "뮤직비디오 1분" };

export default async function MusicVideoPage({ searchParams }: PageProps<"/studio/music-video">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [costs, supabase] = await Promise.all([getCosts(), createClient()]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">뮤직비디오 1분 — 우리 조합 응원송</h1>
        <p className="mt-1 text-sm text-muted">Claude가 가사(1절·후렴·2절·후렴)를 쓰고, ElevenLabs가 작곡·노래하고, Kling 3.0이 장면 4개를 촬영합니다. 후렴 자막과 조합명 카드로 마무리.</p>
      </div>
      <MvClient projects={projects} preselect={preselect} orgName={profile.org_name} credits={costFor("music_video", costs)} />
    </div>
  );
}
