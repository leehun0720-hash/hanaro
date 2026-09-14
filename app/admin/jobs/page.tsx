import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, type Job } from "@/lib/types";

export const metadata = { title: "관리자 · 작업 로그" };
export const dynamic = "force-dynamic";

type Row = Job & { profiles: { email: string; name: string | null } | null };

export default async function AdminJobs({ searchParams }: PageProps<"/admin/jobs">) {
  const sp = await searchParams;
  const onlyFailed = sp.failed === "1";
  let q = adminClient().from("jobs").select("*, profiles(email,name)").order("created_at", { ascending: false }).limit(100);
  if (onlyFailed) q = q.eq("status", "failed");
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">작업 로그</h1><p className="mt-1 text-sm text-muted">최근 100건 · 실패 원인과 ro 환불 여부를 확인합니다.</p></div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/jobs" className={`btn-secondary ${!onlyFailed ? "border-brand" : ""}`}>전체</Link>
          <Link href="/admin/jobs?failed=1" className={`btn-secondary ${onlyFailed ? "border-brand" : ""}`}>실패만</Link>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-brand-soft text-left text-brand-deep"><tr><th className="px-4 py-2">일시</th><th className="px-4 py-2">회원</th><th className="px-4 py-2">종류</th><th className="px-4 py-2">상태</th><th className="px-4 py-2">단계</th><th className="px-4 py-2">ro</th><th className="px-4 py-2">오류</th></tr></thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="border-t border-line align-top">
                <td className="px-4 py-2 text-xs">{new Date(j.created_at).toLocaleString("ko-KR")}</td>
                <td className="px-4 py-2 text-xs">{j.profiles?.name || j.profiles?.email}</td>
                <td className="px-4 py-2">{JOB_TYPE_LABEL[j.type]}</td>
                <td className="px-4 py-2"><span className={`badge ${j.status === "succeeded" ? "bg-brand-soft text-brand-deep" : j.status === "failed" ? "bg-danger-soft text-danger" : "bg-gold-soft text-gold-deep"}`}>{JOB_STATUS_LABEL[j.status]}</span></td>
                <td className="px-4 py-2 text-xs">{j.step ?? "-"}</td>
                <td className="px-4 py-2">{j.credits}</td>
                <td className="px-4 py-2 text-xs text-danger max-w-sm">{j.error ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">작업이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
