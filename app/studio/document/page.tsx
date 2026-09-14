import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts, costFor } from "@/lib/credits";
import { latestJobForRoom } from "@/lib/jobs";
import type { Project } from "@/lib/types";
import { DocumentClient } from "./DocumentClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "문서 · HWP" };

export default async function DocumentPage({ searchParams }: PageProps<"/studio/document">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [costs, supabase, initial] = await Promise.all([getCosts(), createClient(), latestJobForRoom(profile.id, "document")]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">문서 · HWP</h1>
        <p className="mt-1 text-sm text-muted">기획서·공문·보고서·보도자료를 Claude가 초안 작성하고 한글(HWPX) 파일로 내려받습니다. 읽기는 AI가, 확인은 사람이.</p>
      </div>
      <DocumentClient initial={initial}
        projects={projects}
        preselect={preselect}
        orgName={profile.org_name}
        credits={costFor("document", costs)}
       
      />
    </div>
  );
}
