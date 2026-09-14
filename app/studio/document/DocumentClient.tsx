"use client";
import { useState } from "react";
import { JobRunner, type JobResult } from "@/components/JobRunner";
import { DOC_TYPES, type DocType, type DocumentOutput } from "@/lib/prompts/document";
import type { Project } from "@/lib/types";

const STEPS = { plan: "Claude가 문서 초안을 작성하는 중", build: "한글(HWPX) 파일로 조립하는 중" };

export function DocumentClient({ projects, preselect, orgName, credits, initial }: { projects: Project[]; preselect: string | null; orgName: string | null; credits: number; initial?: JobResult | null }) {
  const [projectId, setProjectId] = useState<string>(preselect ?? "");
  const [docType, setDocType] = useState<DocType>("plan");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(orgName ?? "");
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`; });
  const [attachments, setAttachments] = useState("");

  return (
    <div className="space-y-6">
      <div className="card space-y-5">
        <div>
          <label className="label">문서 유형</label>
          <div className="grid gap-2 sm:grid-cols-4">
            {(Object.keys(DOC_TYPES) as DocType[]).map((k) => (
              <button key={k} type="button" onClick={() => setDocType(k)} className={`rounded-lg border px-3 py-2 text-sm text-left ${docType === k ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}>
                <div className="font-medium">{DOC_TYPES[k].label}</div>
              </button>
            ))}
          </div>
          <p className="hint">{DOC_TYPES[docType].desc}</p>
        </div>
        <div>
          <label className="label">프로젝트(소재) — 선택</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            <option value="">(선택 안 함)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.what}</option>)}
          </select>
        </div>
        <div>
          <label className="label">제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="예) 2026년 추석 선물세트 예약 판매 계획" maxLength={120} />
        </div>
        <div>
          <label className="label">핵심 내용 (메모처럼 자유롭게)</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} className="input min-h-32" maxLength={3000} placeholder={"예) 9/1~9/20 예약 접수, 배 5kg 45,000원·7.5kg 65,000원, 조합원 10% 할인, 본점 2층, 담당 하나로마트 사업소. 지점 홍보 협조 요청."} />
          <p className="hint">날짜·금액·연락처는 여기 적은 값만 씁니다. AI는 없는 숫자를 지어내지 않고 빈칸(____)으로 둡니다.</p>
        </div>
        {(docType === "official" || docType === "report") && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className="label">수신</label><input value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="예) 각 지점장" /></div>
            <div><label className="label">발신</label><input value={from} onChange={(e) => setFrom(e.target.value)} className="input" placeholder="예) 안성농협 하나로마트 사업소" /></div>
            <div><label className="label">시행일</label><input value={date} onChange={(e) => setDate(e.target.value)} className="input" placeholder="2026. 9. 10." /></div>
          </div>
        )}
        {docType === "official" && (
          <div><label className="label">붙임 (쉼표로 구분)</label><input value={attachments} onChange={(e) => setAttachments(e.target.value)} className="input" placeholder="예) 선물세트 구성표 1부, 홍보 포스터 1부" /></div>
        )}
      </div>

      <JobRunner
        initial={initial}
        type="document"
        projectId={projectId || null}
        credits={credits}
        steps={STEPS}
        buttonLabel="문서 만들기"
        buildInput={() => {
          if (title.trim().length < 2) return { error: "제목을 입력하세요." };
          if (brief.trim().length < 5) return { error: "핵심 내용을 조금 더 적어 주세요." };
          return { docType, title: title.trim(), brief: brief.trim(), to: to || undefined, from: from || undefined, date: date || undefined, attachments: attachments || undefined };
        }}
        renderResult={({ job, assets }) => {
          const doc = job.output.doc as DocumentOutput | undefined;
          const hwpx = assets.find((a) => a.kind === "hwpx");
          return (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{doc?.title}</h2>
                {hwpx && <a href={`/api/assets/${hwpx.id}?download=1`} className="btn-primary">HWPX 다운로드</a>}
              </div>
              {doc?.summary && <p className="text-sm text-muted">{doc.summary}</p>}
              <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-2 max-h-96 overflow-auto">
                {doc?.blocks.map((b, i) => {
                  if (b.type === "heading") return <p key={i} className="font-semibold mt-2">{b.text}</p>;
                  if (b.type === "paragraph") return <p key={i}>{b.text}</p>;
                  if (b.type === "bullets") return <ul key={i} className="list-disc pl-5">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
                  return (
                    <table key={i} className="w-full text-xs border border-line"><thead><tr>{b.table.header.map((h, j) => <th key={j} className="border border-line bg-brand-soft px-2 py-1">{h}</th>)}</tr></thead>
                      <tbody>{b.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="border border-line px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
                  );
                })}
              </div>
              <p className="hint">한글 2014 이상에서 열립니다. 날짜·숫자·수신처는 반드시 사람이 확인한 뒤 결재·발송하세요.</p>
            </div>
          );
        }}
      />
    </div>
  );
}
