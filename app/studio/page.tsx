import Link from "next/link";
import { requireProfile, getSubscription, isSubscribed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, type Job, type Project } from "@/lib/types";
import { totalBananas } from "@/lib/credits";

export const metadata = { title: "대시보드" };

const rooms = [
  { href: "/studio/document", title: "문서 · HWP", desc: "기획서·공문·보고서를 한글 파일로", day: "Day 2 아침" },
  { href: "/studio/newsletter", title: "뉴스레터", desc: "5섹션 원고 + 카톡용 이미지 1장", day: "Day 1 저녁" },
  { href: "/studio/cardnews", title: "카드뉴스", desc: "장별 문구·이미지 3~6장", day: "Day 1" },
  { href: "/studio/promo-video", title: "홍보영상 30초", desc: "후크·메시지·CTA 3컷, 자막 포함", day: "Day 2 오후" },
  { href: "/studio/music-video", title: "뮤직비디오 1분", desc: "가사 → 응원송 → 장면 4개", day: "Day 2 저녁" },
  { href: "/studio/practice", title: "실습 · 내 사진 영상", desc: "사진 편집 → 한국어 대사 → Kling 3.0 음성 영상 → 브라우저 자막 → 다운로드", day: "실습" },
];

export default async function StudioHome({ searchParams }: PageProps<"/studio">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const sub = await getSubscription(profile.id);
  const supabase = await createClient();
  const [{ data: projects }, { data: jobs }] = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("jobs").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(8),
  ]);
  const highlight = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{profile.name || "환영합니다"}님, 오늘은 무엇을 만들까요?</h1>
          <p className="mt-1 text-sm text-muted">소재 1개를 정하고, 5종 산출물로 뽑아내세요. ‘기획 1번, 출력 N번’이 원칙입니다.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio/projects/new" className="btn-primary">+ 새 프로젝트(소재)</Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-muted">잔여 ro</p><p className="text-3xl font-black mt-1">{totalBananas(profile).toLocaleString()} ro</p></div>
        <div className="card"><p className="text-sm text-muted">구독</p><p className="text-lg font-semibold mt-1">{isSubscribed(sub) ? "구독 중" : "미구독"}</p>
          {sub?.next_billing_at && isSubscribed(sub) && <p className="hint">다음 결제 {new Date(sub.next_billing_at).toLocaleDateString("ko-KR")}</p>}</div>
        <div className="card"><p className="text-sm text-muted">프로젝트</p><p className="text-3xl font-black mt-1">{projects?.length ?? 0}</p></div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">제작실</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <Link key={r.href} href={r.href} className="card hover:border-brand transition">
              <div className="flex items-center justify-between"><h3 className="font-semibold">{r.title}</h3><span className="badge bg-gray-100 text-muted">{r.day}</span></div>
              <p className="mt-1 text-sm text-muted">{r.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">내 프로젝트(소재)</h2>
          <Link href="/studio/projects" className="text-sm text-brand hover:underline">전체 보기</Link>
        </div>
        {projects?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(projects as Project[]).map((p) => (
              <div key={p.id} className={`card ${highlight === p.id ? "border-brand" : ""}`}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm">{p.what}</p>
                <p className="hint">{[p.when_text, p.where_text].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-sm text-muted">아직 프로젝트가 없습니다. 먼저 ‘무엇을·언제·어디서’ 한 줄 소재를 등록하세요.</div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3">최근 작업</h2>
        {jobs?.length ? (
          <div className="card divide-y divide-line p-0">
            {(jobs as Job[]).map((j) => (
              <div key={j.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div><span className="font-medium">{JOB_TYPE_LABEL[j.type]}</span><span className="ml-2 text-muted">{new Date(j.created_at).toLocaleString("ko-KR")}</span></div>
                <span className={`badge ${j.status === "succeeded" ? "bg-brand-soft text-brand-deep" : j.status === "failed" ? "bg-danger-soft text-danger" : "bg-gold-soft text-gold-deep"}`}>{JOB_STATUS_LABEL[j.status]}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-sm text-muted">아직 만든 산출물이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
