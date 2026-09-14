import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts, costFor } from "@/lib/credits";
import { latestJobForRoom } from "@/lib/jobs";
import type { Project } from "@/lib/types";
import { NewsletterClient } from "./NewsletterClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "뉴스레터" };

export default async function NewsletterPage({ searchParams }: PageProps<"/studio/newsletter">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [costs, supabase, initial] = await Promise.all([getCosts(), createClient(), latestJobForRoom(profile.id, "newsletter")]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">뉴스레터</h1>
        <p className="mt-1 text-sm text-muted">5섹션 황금 구조(인사·메인·알짜정보·조합원 이야기·행동 유도) 원고와 카톡 전송용 이미지 1장. SNS는 스쳐가지만 카톡은 도착합니다.</p>
      </div>
      <NewsletterClient initial={initial} projects={projects} preselect={preselect} credits={costFor("newsletter", costs)} />
    </div>
  );
}
