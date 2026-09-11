import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { getGallery } from "@/lib/gallery";
import { SiteHeader } from "@/components/SiteHeader";
import { Logo } from "@/components/Logo";
import { JOB_TYPE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const rooms = [
  { n: "01", title: "문서 · HWP", tool: "Claude → 한글(HWPX)", desc: "기획서·공문·보고서·보도자료. 읽기는 AI가, 쓰기는 규격대로, 확인은 사람이.", href: "/studio/document", credit: "3" },
  { n: "02", title: "뉴스레터", tool: "Claude → GPT Image", desc: "5섹션 황금 구조 원고와 카톡 전송용 이미지 1장. 열지 않아도 읽힙니다.", href: "/studio/newsletter", credit: "8" },
  { n: "03", title: "카드뉴스", tool: "Claude → GPT Image", desc: "첫 장은 후크, 마지막 장은 행동 유도. 스타일 사전 5종, 3~6장.", href: "/studio/cardnews", credit: "장당 5" },
  { n: "04", title: "홍보영상 30초", tool: "Claude → Kling → 자막", desc: "후크 3초 · 메시지 20초 · CTA 7초. 무음으로 봐도 이해되는 3컷.", href: "/studio/promo-video", credit: "55" },
  { n: "05", title: "뮤직비디오 1분", tool: "Claude → ElevenLabs → Kling", desc: "우리 조합 응원송. 가사 → 작곡 → 장면 4개 → 후렴 자막.", href: "/studio/music-video", credit: "110" },
];

const steps = [
  { k: "소재 1개", d: "무엇을 · 언제 · 어디서 · 대상 · 행동. 워크시트 한 장이면 됩니다." },
  { k: "다섯 칸 프롬프트", d: "역할·관련정보·목적·조건·분량을 서버가 자동으로 채웁니다." },
  { k: "최고 품질 모델", d: "Claude Opus 5 · GPT Image 2.5 · Kling 3.0 · ElevenLabs Music." },
  { k: "사람이 확인, 바로 배포", d: "날짜·숫자·연락처 점검 후 카톡·유튜브로. 결과물은 보관함에." },
];

export default async function Home() {
  const [profile, gallery] = await Promise.all([getProfile(), getGallery(8)]);
  const cta = profile ? { href: "/studio", label: "스튜디오 열기" } : { href: "/signup", label: "가입하고 시작하기" };

  return (
    <>
      <SiteHeader profile={profile} />

      {/* HERO */}
      <section className="relative overflow-hidden bg-brand-deep text-white grain">
        <div className="pointer-events-none absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-gold/25 blur-3xl drift" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-[360px] w-[360px] rounded-full bg-brand/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-12 md:py-28">
          <div className="md:col-span-7">
            <p className="rise rise-1 text-xs font-medium uppercase tracking-[0.3em] text-gold">농축협 디지털 프로젝트과정 · 공식 제작 도구</p>
            <h1 className="display rise rise-2 mt-5 text-5xl font-bold leading-[1.12] md:text-7xl">
              소재 하나로,<br />
              산출물 <span className="text-gold">다섯.</span>
            </h1>
            <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              추석 선물세트 예약 한 줄이면 됩니다. 기획서와 뉴스레터, 카드뉴스, 30초 홍보영상, 1분 응원송 뮤직비디오까지 — 외주 없이, 우리 손으로, 오늘 안에.
            </p>
            <div className="rise rise-4 mt-9 flex flex-wrap gap-3">
              <Link href={cta.href} className="btn bg-gold text-brand-deep hover:bg-[#e0b93a] px-6 py-3 text-base font-semibold">{cta.label}</Link>
              <Link href="/pricing" className="btn border border-white/30 text-white hover:bg-white/10 px-6 py-3 text-base">요금 안내</Link>
            </div>
            <p className="rise rise-5 mt-6 text-xs text-white/50">개인정보는 입력하지 않습니다 · AI 결과는 초안, 발송은 사람이 · 사진은 동의 받은 것만</p>
          </div>

          <aside className="rise rise-3 md:col-span-5">
            <div className="relative rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.25em] text-white/50">3일의 레시피 × 1개 프로젝트</p>
              <ol className="mt-4 space-y-4">
                {[
                  ["Day 1 저녁", "뉴스레터 1장 완성 · 단톡방 발송"],
                  ["Day 2 아침", "한글 보고서 30분 안에"],
                  ["Day 2 오후", "홍보영상 30초 · 뮤직비디오 1분"],
                  ["Day 3", "카톡·유튜브 배포 · 데모데이"],
                ].map(([d, t]) => (
                  <li key={d} className="flex gap-4">
                    <span className="display w-24 shrink-0 text-gold">{d}</span>
                    <span className="text-white/85">{t}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t border-white/10 pt-4 text-sm text-white/60">기획 1번, 출력 N번 — 같은 소재를 끝까지 우려내는 것이 프로젝트의 기술입니다.</div>
            </div>
          </aside>
        </div>

        <div className="relative overflow-hidden border-t border-white/10 py-3 text-sm text-white/60">
          <div className="ticker">
            {[...Array(2)].map((_, i) => (
              <span key={i} className="flex gap-12">
                {["Claude Opus 5 · 기획·원고·가사", "GPT Image 2.5 · 한글 포스터", "Kling 3.0 · 720p 영상", "ElevenLabs Music · 응원송 작곡", "한글 HWPX · 공문 규격", "토스페이먼츠 · 월 정액"].map((t) => (
                  <span key={t} className="whitespace-nowrap">◆ {t}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 제작실 */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand">다섯 제작실</p>
            <h2 className="display mt-2 text-3xl font-bold md:text-4xl">강의안의 산출물 3종, 그리고 둘을 더했습니다</h2>
          </div>
          <p className="max-w-sm text-sm text-muted">각 제작실은 강의안의 프롬프트 틀과 체크리스트를 그대로 제품화했습니다. 처음이어도 빈칸만 채우면 됩니다.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-6">
          {rooms.map((r, i) => (
            <Link
              key={r.n}
              href={r.href}
              className={`recipe-card card relative flex flex-col overflow-hidden p-6 ${i < 2 ? "md:col-span-3" : "md:col-span-2"} ${i === 3 ? "bg-brand-deep text-white border-brand-deep" : ""}`}
            >
              <span className={`display text-5xl font-bold ${i === 3 ? "text-gold" : "text-brand/20"}`}>{r.n}</span>
              <h3 className="mt-3 text-xl font-bold">{r.title}</h3>
              <p className={`mt-1 text-xs ${i === 3 ? "text-white/60" : "text-brand"}`}>{r.tool}</p>
              <p className={`mt-3 text-sm leading-relaxed ${i === 3 ? "text-white/80" : "text-muted"}`}>{r.desc}</p>
              <span className={`mt-auto pt-5 text-xs ${i === 3 ? "text-gold" : "text-muted"}`}>ro {r.credit}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 흐름 */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-12">
          <div className="md:col-span-4">
            <p className="text-xs uppercase tracking-[0.3em] text-brand">어떻게 만들어지나</p>
            <h2 className="display mt-2 text-3xl font-bold md:text-4xl">네 걸음이면 끝납니다</h2>
            <p className="mt-4 text-sm text-muted">보여드립니다 → 따라해 봅니다 → 내 것으로 바꿉니다 → 함께 공유합니다. 강의의 학습 방식이 그대로 제품의 흐름입니다.</p>
          </div>
          <ol className="md:col-span-8 grid gap-4 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.k} className="relative rounded-xl border border-line bg-background p-5">
                <span className="display absolute -top-3 left-5 bg-white px-2 text-gold">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-bold">{s.k}</h3>
                <p className="mt-2 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 갤러리 */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand">수강생 결과물</p>
            <h2 className="display mt-2 text-3xl font-bold md:text-4xl">현장에서 바로 쓴 것들</h2>
          </div>
          <p className="text-sm text-muted">관리자가 공개한 결과물만 보입니다</p>
        </div>
        {gallery.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gallery.map((g) => (
              <figure key={g.id} className="card overflow-hidden p-0">
                {g.kind === "video" ? (
                  <video src={`/api/assets/${g.id}`} controls muted playsInline className="aspect-video w-full bg-black object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${g.id}`} alt={g.title} className="aspect-[3/4] w-full object-cover" />
                )}
                <figcaption className="px-4 py-3 text-sm">
                  <span className="font-medium">{g.title || (g.type ? JOB_TYPE_LABEL[g.type] : "")}</span>
                  {g.org && <span className="ml-2 text-muted">{g.org}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["카톡 뉴스레터", "카드뉴스 4장", "홍보영상 30초", "응원송 M/V"].map((t, i) => (
              <div key={t} className={`card flex aspect-[4/5] items-end p-5 ${i % 2 ? "bg-gold-soft" : "bg-brand-soft"}`}>
                <div><p className="display text-2xl font-bold text-brand-deep">{t}</p><p className="text-xs text-muted">첫 수강생 결과물이 곧 걸립니다</p></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gold-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-16">
          <div>
            <h2 className="display text-3xl font-bold text-brand-deep md:text-4xl">잘 만든 사람보다, 끝까지 만든 사람.</h2>
            <p className="mt-2 text-muted">1 ro = 100원. 충전하거나 월 정액으로 받아 다섯 제작실을 모두 씁니다. 가입만 해도 30개.</p>
          </div>
          <div className="flex gap-3">
            <Link href={cta.href} className="btn-primary px-6 py-3 text-base">{cta.label}</Link>
            <Link href="/pricing" className="btn-secondary px-6 py-3 text-base">요금 보기</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
          <Logo />
          <p>절대 수칙 ① 개인정보 입력 금지 ② AI 결과는 초안, 검토는 사람 ③ 저작권·초상권 확인</p>
          <p>© {new Date().getFullYear()} 하나로AI스튜디오</p>
        </div>
      </footer>
    </>
  );
}
