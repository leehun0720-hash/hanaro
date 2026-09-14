"use client";
import { useState } from "react";
import Link from "next/link";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import { CARD_STYLES, type CardStyle, type CardnewsOutput } from "@/lib/prompts/cardnews";
import type { Project } from "@/lib/types";

const STEPS = { plan: "Claude가 장별 문구를 설계하는 중", image: "장별 이미지를 그리는 중 (GPT Image)", zip: "ZIP으로 묶는 중" };

export function CardnewsClient({ projects, preselect, perPage, initial }: { projects: Project[]; preselect: string | null; perPage: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? projects[0]?.id ?? "");
  const [pages, setPages] = useState(4);
  const [style, setStyle] = useState<CardStyle>("poster");
  const [extra, setExtra] = useState("");

  if (projects.length === 0 && !initial) {
    return <div className="card text-sm">먼저 프로젝트(소재)를 등록하세요. <Link href="/studio/projects/new" className="font-semibold text-brand underline">새 프로젝트 만들기</Link></div>;
  }

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
          <label className="label">장수: {pages}장</label>
          <input type="range" min={3} max={6} value={pages} onChange={(e) => setPages(Number(e.target.value))} className="w-full accent-[var(--brand)]" />
        </div>
        <div>
          <label className="label">스타일 사전</label>
          <div className="grid gap-2 sm:grid-cols-5">
            {(Object.keys(CARD_STYLES) as CardStyle[]).map((k) => (
              <button key={k} type="button" onClick={() => setStyle(k)} className={`rounded-lg border px-3 py-2 text-left text-sm ${style === k ? "border-brand bg-brand-soft" : "border-line"}`}>
                <div className="font-medium">{CARD_STYLES[k].label}</div>
                <div className="text-[11px] text-muted">{CARD_STYLES[k].use}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">추가 내용 (선택)</label>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} className="input min-h-20" maxLength={1500} placeholder="예) 5kg 45,000원 / 7.5kg 65,000원 · 택배 가능 · 조합원 10% 할인" />
        </div>
      </div>

      <JobRunner
        initial={initial}
        type="cardnews"
        projectId={projectId}
        credits={perPage * pages}
        steps={STEPS}
        buttonLabel={`카드뉴스 ${pages}장 만들기`}
        buildInput={() => ({ pages, style, extra: extra || undefined })}
        renderResult={({ job, assets }) => {
          const plan = job.output.plan as CardnewsOutput | undefined;
          const images = assets.filter((a) => a.kind === "image");
          const zip = assets.find((a) => a.kind === "zip");
          return (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">카드뉴스 {images.length}장</h2>
                {zip && <a href={`/api/assets/${zip.id}?download=1`} className="btn-primary text-xs">ZIP 다운로드</a>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((a, i) => (
                  <div key={a.id} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/${a.id}`} alt={`카드뉴스 ${i + 1}`} className="w-full rounded-lg border border-line" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">{i + 1}장 · {plan?.pages[i]?.headline}</span>
                      <a href={`/api/assets/${a.id}?download=1`} className="text-brand hover:underline">저장</a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="hint">이미지 속 한글 문구를 꼭 확인하세요. 틀린 장이 있으면 다시 생성하거나 해당 장만 다른 스타일로 재시도하세요.</p>
            </div>
          );
        }}
      />
    </div>
  );
}
