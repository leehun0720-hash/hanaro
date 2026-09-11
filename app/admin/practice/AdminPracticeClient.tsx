"use client";
import { useEffect, useState } from "react";
import type { AdminOverview } from "@/lib/admin-overview";

const STEP_KO: Record<string, string> = { photo: "② 이미지 편집", "await:photo": "② 이미지 확인 대기", prompt: "③ 프롬프트 변환", "await:prompt": "③ 프롬프트 확인 대기", "video:start": "④ 제출 대기(순번)", "video:wait": "④ Kling 생성 중", compose: "⑤ 서버 자막 합성", "await:subtitle": "⑤ 자막 작업 중(브라우저)", done: "완료" };

export function AdminPracticeClient({ initial }: { initial: AdminOverview }) {
  const [ov, setOv] = useState<AdminOverview>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/admin/overview", { cache: "no-store" });
        if (r.ok) setOv(await r.json());
      } catch {}
      setTick((n) => n + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [tick]);

  async function setCredits(userId: string, image: number, video: number) {
    setMsg(null);
    const r = await fetch("/api/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, image, video }) });
    setMsg(r.ok ? "크레딧을 반영했어요." : "실패했어요.");
    setTick((n) => n + 1);
  }

  async function cancel(jobId: string) {
    if (!confirm("이 작업을 강제 취소할까요? ro와 진행 중 단계의 크레딧이 환불됩니다.")) return;
    const r = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
    setMsg(r.ok ? "취소했어요." : "취소 실패");
    setTick((n) => n + 1);
  }

  const over = ov.totals.cost_usd >= ov.budget_alert_usd;

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-lg border border-line bg-white px-4 py-2 text-sm">{msg}</div>}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className={`card ${over ? "border-danger" : ""}`}><p className="text-sm text-muted">누적 비용(추정)</p><p className={`mt-1 text-3xl font-black ${over ? "text-danger" : ""}`}>${ov.totals.cost_usd.toFixed(2)}</p>{over && <p className="hint text-danger">임계치 초과!</p>}</div>
        <div className="card"><p className="text-sm text-muted">오늘 비용</p><p className="mt-1 text-3xl font-black">${ov.totals.today_cost_usd.toFixed(2)}</p></div>
        <div className="card"><p className="text-sm text-muted">진행 중 / 전체</p><p className="mt-1 text-3xl font-black">{ov.queue.length} <span className="text-base font-normal text-muted">/ {ov.totals.jobs}</span></p></div>
        <div className="card"><p className="text-sm text-muted">완료 · 실패</p><p className="mt-1 text-3xl font-black">{ov.totals.succeeded} <span className="text-base font-normal text-muted">· {ov.totals.failed}</span></p></div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">진행 중 큐 (제출 순)</h2>
        {ov.queue.length === 0 ? (
          <div className="card text-sm text-muted">진행 중인 작업이 없어요.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-brand-soft text-left text-brand-deep"><tr><th className="px-4 py-2">수강생</th><th className="px-4 py-2">단계</th><th className="px-4 py-2">순번</th><th className="px-4 py-2">시작</th><th className="px-4 py-2">비용</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>
                {ov.queue.map((q) => (
                  <tr key={q.id} className="border-t border-line">
                    <td className="px-4 py-2">{q.user}</td>
                    <td className="px-4 py-2">{STEP_KO[q.step ?? ""] ?? q.step}{q.notice && <div className="text-xs text-muted">{q.notice}</div>}</td>
                    <td className="px-4 py-2">{q.queue_position ?? "-"}</td>
                    <td className="px-4 py-2 text-xs">{new Date(q.created_at).toLocaleTimeString("ko-KR")}</td>
                    <td className="px-4 py-2">${q.cost_usd.toFixed(2)}</td>
                    <td className="px-4 py-2"><button className="btn-danger px-2 py-1 text-xs" onClick={() => cancel(q.id)}>강제 취소</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">수강생 · 크레딧</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-brand-soft text-left text-brand-deep"><tr><th className="px-4 py-2">수강생</th><th className="px-4 py-2">동의</th><th className="px-4 py-2">이미지 남음</th><th className="px-4 py-2">영상 남음</th><th className="px-4 py-2">작업</th><th className="px-4 py-2">비용</th><th className="px-4 py-2">충전</th></tr></thead>
            <tbody>
              {ov.users.map((u) => (
                <UserRow key={u.id} u={u} onSet={setCredits} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UserRow({ u, onSet }: { u: AdminOverview["users"][number]; onSet: (id: string, image: number, video: number) => Promise<void> }) {
  const [image, setImage] = useState(u.image_left);
  const [video, setVideo] = useState(u.video_left);
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-2"><div className="font-medium">{u.name || "-"}</div><div className="text-xs text-muted">{u.email}</div></td>
      <td className="px-4 py-2 text-xs">{u.consent_at ? "✓" : <span className="text-danger">미동의</span>}</td>
      <td className="px-4 py-2 font-semibold">{u.image_left}</td>
      <td className="px-4 py-2 font-semibold">{u.video_left}</td>
      <td className="px-4 py-2 text-xs">{u.jobs}건{u.active_job && <div className="text-muted">{STEP_KO[u.active_job.step ?? ""] ?? u.active_job.step}</div>}</td>
      <td className="px-4 py-2">${u.cost_usd.toFixed(2)}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <input type="number" min={0} max={99} value={image} onChange={(e) => setImage(Number(e.target.value))} className="input w-16 py-1 text-xs" aria-label="이미지" />
          <input type="number" min={0} max={99} value={video} onChange={(e) => setVideo(Number(e.target.value))} className="input w-16 py-1 text-xs" aria-label="영상" />
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => onSet(u.id, image, video)}>설정</button>
        </div>
      </td>
    </tr>
  );
}
