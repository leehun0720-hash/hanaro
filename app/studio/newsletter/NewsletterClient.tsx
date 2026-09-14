"use client";
import { useState } from "react";
import Link from "next/link";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import { TONES, type NewsletterOutput } from "@/lib/prompts/newsletter";
import type { Project } from "@/lib/types";

const STEPS = { plan: "Claude가 5섹션 원고를 쓰는 중", image: "카톡용 이미지를 그리는 중 (GPT Image)" };

export function NewsletterClient({ projects, preselect, credits, initial }: { projects: Project[]; preselect: string | null; credits: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? projects[0]?.id ?? "");
  const [tone, setTone] = useState<keyof typeof TONES>("warm");
  const [season, setSeason] = useState("");
  const [phone, setPhone] = useState("");
  const [extra, setExtra] = useState("");
  const [copied, setCopied] = useState(false);

  if (projects.length === 0 && !initial) {
    return (
      <div className="card text-sm">먼저 프로젝트(소재)를 등록하세요. <Link href="/studio/projects/new" className="font-semibold text-brand underline">새 프로젝트 만들기</Link></div>
    );
  }

  const textOf = (d: NewsletterOutput) =>
    [`${d.titles[0] ?? ""}`, "", d.sections.greeting, "", d.sections.main, "", ...d.sections.info.map((i) => `· ${i}`), "", d.sections.story, "", d.sections.cta].join("\n");

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <div>
          <label className="label">프로젝트(소재)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.what}</option>)}
          </select>
        </div>
        <div>
          <label className="label">말투</label>
          <div className="flex gap-2">
            {(Object.keys(TONES) as (keyof typeof TONES)[]).map((k) => (
              <button key={k} type="button" onClick={() => setTone(k)} className={`rounded-lg border px-3 py-2 text-sm ${tone === k ? "border-brand bg-brand-soft" : "border-line"}`}>{TONES[k].label}</button>
            ))}
          </div>
          <p className="hint">{TONES[tone].desc}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">계절·시기 (선택)</label><input value={season} onChange={(e) => setSeason(e.target.value)} className="input" placeholder="예) 추석을 앞둔 9월 중순" /></div>
          <div><label className="label">대표 연락처 (선택)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="예) 031-000-0000" /></div>
        </div>
        <div>
          <label className="label">알짜 정보·추가 내용 (선택)</label>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} className="input min-h-24" maxLength={1500} placeholder="예) 금주 배 시세 20kg 45,000원 · 영농교육 9/25(목) 본점 2층 · 조합원 이야기: 30년째 배 농사 조합원, 올해 첫 수확" />
        </div>
      </div>

      <JobRunner
        initial={initial}
        type="newsletter"
        projectId={projectId}
        credits={credits}
        steps={STEPS}
        buttonLabel="뉴스레터 만들기"
        buildInput={() => ({ tone, season: season || undefined, phone: phone || undefined, extra: extra || undefined })}
        renderResult={({ job, assets }) => {
          const d = job.output.draft as NewsletterOutput | undefined;
          const img = assets.find((a) => a.kind === "image");
          if (!d) return null;
          return (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">원고</h2>
                  <button className="btn-secondary text-xs" onClick={async () => { await navigator.clipboard.writeText(textOf(d)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "복사됨" : "원고 복사"}</button>
                </div>
                <div>
                  <p className="text-xs text-muted">제목 후보</p>
                  <ul className="text-sm font-medium">{d.titles.map((t, i) => <li key={i}>· {t}</li>)}</ul>
                </div>
                <Section label="① 인사" text={d.sections.greeting} />
                <Section label="② 메인 기사" text={d.sections.main} />
                <div><p className="text-xs text-muted">③ 알짜 정보</p><ul className="text-sm">{d.sections.info.map((i, k) => <li key={k}>· {i}</li>)}</ul></div>
                <Section label="④ 조합원 이야기" text={d.sections.story} />
                <Section label="⑤ 행동 유도" text={d.sections.cta} />
              </div>
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">카톡 전송용 이미지</h2>
                  {img && <a href={`/api/assets/${img.id}?download=1`} className="btn-primary text-xs">다운로드</a>}
                </div>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${img.id}`} alt="뉴스레터 이미지" className="w-full rounded-lg border border-line" />
                ) : (
                  <p className="text-sm text-muted">이미지가 없습니다.</p>
                )}
                <p className="hint">발송 전 점검: 무음으로 봐도 이해되는가 · 날짜·전화번호·지점명 오타 0건 · 초상권·저작권 문제 없음. 이미지의 한글이 틀렸다면 다시 생성하세요.</p>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="whitespace-pre-line text-sm">{text}</p>
    </div>
  );
}
