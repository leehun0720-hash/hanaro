import { Alert } from "@/components/Alert";
import { createProject } from "../actions";
import { requireProfile } from "@/lib/auth";
import { ProjectPhotos } from "./ProjectPhotos";

export const metadata = { title: "새 프로젝트(소재)" };

export default async function NewProjectPage({ searchParams }: PageProps<"/studio/projects/new">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">새 프로젝트 — 우리 조합 소재 워크시트</h1>
        <p className="mt-1 text-sm text-muted">강의안의 현황 진단 워크시트입니다. 이 한 장이 뉴스레터·영상·뮤직비디오의 공통 원료가 됩니다.</p>
      </div>
      <Alert kind="warn">
        <b>개인정보 절대 입력 금지</b> — 조합원 이름·주민번호·계좌·개인 연락처는 넣지 마세요. ‘60대 조합원’처럼 속성만 적습니다. 대표 전화번호는 괜찮습니다.
      </Alert>
      {error && <Alert kind="error">{error}</Alert>}

      <form action={createProject} className="card space-y-5">
        <div>
          <label className="label" htmlFor="name">프로젝트 이름</label>
          <input id="name" name="name" required maxLength={60} className="input" placeholder="예) 추석 선물세트 예약" />
        </div>
        <div>
          <label className="label" htmlFor="what">① 무엇을 — 알려야 할 것 한 줄</label>
          <input id="what" name="what" required maxLength={200} className="input" placeholder="예) 안성배 추석 선물세트 예약, 조합원 10% 할인" />
          <p className="hint">이번 호의 ‘단 하나’. 둘이면 둘 다 안 읽힙니다.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="when_text">② 언제</label>
            <input id="when_text" name="when_text" maxLength={100} className="input" placeholder="예) 9월 20일까지" />
          </div>
          <div>
            <label className="label" htmlFor="where_text">③ 어디서</label>
            <input id="where_text" name="where_text" maxLength={100} className="input" placeholder="예) 하나로마트 본점 2층" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="audience">④ 대상</label>
            <input id="audience" name="audience" maxLength={100} className="input" placeholder="예) 60대 이상 조합원과 지역 주민" />
          </div>
          <div>
            <label className="label" htmlFor="cta">⑤ 원하는 행동 (CTA)</label>
            <input id="cta" name="cta" maxLength={100} className="input" placeholder="예) 031-000-0000으로 전화 예약" />
          </div>
        </div>
        <ProjectPhotos userId={profile.id} />
        <div className="flex justify-end gap-2">
          <a href="/studio" className="btn-secondary">취소</a>
          <button type="submit" className="btn-primary">프로젝트 저장</button>
        </div>
      </form>
    </div>
  );
}
