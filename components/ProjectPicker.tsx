import Link from "next/link";
import type { Project } from "@/lib/types";

export function ProjectPicker({ projects, value, name = "projectId", required = true }: { projects: Project[]; value?: string | null; name?: string; required?: boolean }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold-deep">
        먼저 프로젝트(소재)를 등록하세요. <Link href="/studio/projects/new" className="font-semibold underline">새 프로젝트 만들기</Link>
      </div>
    );
  }
  return (
    <div>
      <label className="label" htmlFor={name}>프로젝트(소재)</label>
      <select id={name} name={name} defaultValue={value ?? projects[0].id} className="input" required={required}>
        {!required && <option value="">(선택 안 함)</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name} — {p.what}</option>
        ))}
      </select>
    </div>
  );
}
