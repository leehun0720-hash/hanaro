"use client";
import { useState } from "react";
import type { JobResult, ResumeFn } from "@/components/JobRunner";
import { SubtitleStylePicker } from "@/components/SubtitleStylePicker";
import type { MvOutput } from "@/lib/prompts/mv";
import { DEFAULT_MUSIC_OPTIONS, MOOD_OPTIONS, TEMPO_OPTIONS, VOCAL_OPTIONS, normalizeMusicOptions, type MoodOption, type MusicOptions, type TempoOption, type VocalOption } from "@/lib/music-options";
import { DEFAULT_STYLE, normalizeStyle, type SubtitleStyle } from "@/lib/video/subtitle-style";

const SECTION_LABEL = { verse1: "1절", chorus: "후렴", verse2: "2절", chorus2: "후렴 (반복)" } as const;
type SectionKey = keyof typeof SECTION_LABEL;

/** await:plan — Claude가 쓴 가사·장면과 음악 설정을 확인·수정한 뒤 작곡·촬영을 시작 */
export function MvPlanReview({ r, resume, busy, initialMusic, initialStyle }: { r: JobResult; resume: ResumeFn; busy: boolean; initialMusic: MusicOptions; initialStyle: SubtitleStyle }) {
  const plan = r.job.output.plan as MvOutput;
  const [title, setTitle] = useState(plan.title);
  const [lyrics, setLyrics] = useState<Record<SectionKey, string>>({ verse1: plan.lyrics.verse1.join("\n"), chorus: plan.lyrics.chorus.join("\n"), verse2: plan.lyrics.verse2.join("\n"), chorus2: plan.lyrics.chorus2.join("\n") });
  const [scenes, setScenes] = useState(plan.scenes.map((s) => ({ ...s })));
  const [tags, setTags] = useState((plan.musicStyles ?? []).join(", "));
  const [music, setMusic] = useState<MusicOptions>(normalizeMusicOptions(r.job.output.music_opts ?? initialMusic));
  const [style, setStyle] = useState<SubtitleStyle>(normalizeStyle(r.job.output.subtitle_style ?? initialStyle));
  const [msg, setMsg] = useState<string | null>(null);

  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const payload = () => ({
    plan: { title: title.trim(), lyrics: { verse1: lines(lyrics.verse1), chorus: lines(lyrics.chorus), verse2: lines(lyrics.verse2), chorus2: lines(lyrics.chorus2) }, scenes: scenes.map((s) => ({ captionKo: s.captionKo.trim(), videoPrompt: s.videoPrompt.trim() })), musicStyles: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12) },
    music,
    subtitle: style,
  });
  const totalChars = (Object.values(lyrics) as string[]).reduce((a, t) => a + lines(t).join("").length, 0);

  async function go(action: "save" | "start") {
    setMsg(null);
    for (const k of Object.keys(lyrics) as SectionKey[]) if (!lines(lyrics[k]).length && music.vocal !== "instrumental") return setMsg(`${SECTION_LABEL[k]} 가사가 비어 있어요.`);
    try {
      await resume(action, payload());
      if (action === "save") setMsg("저장했어요.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">가사·장면 확인 — 마음에 들 때까지 고친 뒤 시작하세요</h2>
          <span className="badge bg-gold-soft text-gold-deep">아직 작곡·촬영 전 · 비용 발생 없음</span>
        </div>
        <div>
          <label className="label">노래 제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} className="input" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
            <div key={k}>
              <label className="label">{SECTION_LABEL[k]} <span className="font-normal text-muted">({lines(lyrics[k]).length}줄 · 15초)</span></label>
              <textarea value={lyrics[k]} onChange={(e) => setLyrics({ ...lyrics, [k]: e.target.value })} rows={4} className="input font-medium" placeholder="한 줄에 가사 한 줄" />
            </div>
          ))}
        </div>
        <p className="hint">한 줄 = 자막 한 줄. 각 절 15초를 줄 수로 나눠 노래와 맞춰 띄웁니다 (4줄이면 3.75초씩). 전체 {totalChars}자 · 200자 내외 권장, 줄이 많으면 노래가 빨라져요.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">음악 세부 설정</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">보컬</label>
            <select value={music.vocal} onChange={(e) => setMusic({ ...music, vocal: e.target.value as VocalOption })} className="input">
              {(Object.keys(VOCAL_OPTIONS) as VocalOption[]).map((k) => <option key={k} value={k}>{VOCAL_OPTIONS[k].label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">템포</label>
            <select value={music.tempo} onChange={(e) => setMusic({ ...music, tempo: e.target.value as TempoOption })} className="input">
              {(Object.keys(TEMPO_OPTIONS) as TempoOption[]).map((k) => <option key={k} value={k}>{TEMPO_OPTIONS[k].label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">분위기</label>
            <select value={music.mood} onChange={(e) => setMusic({ ...music, mood: e.target.value as MoodOption })} className="input">
              {(Object.keys(MOOD_OPTIONS) as MoodOption[]).map((k) => <option key={k} value={k}>{MOOD_OPTIONS[k].label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">강조할 악기 (선택, 쉼표로 구분)</label>
            <input value={music.instruments ?? ""} onChange={(e) => setMusic({ ...music, instruments: e.target.value })} maxLength={120} className="input" placeholder="예) accordion, brass, 장구" />
          </div>
          <div>
            <label className="label">Claude가 제안한 스타일 태그 (영문, 수정 가능)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input font-mono text-xs" placeholder="warm brass stabs, bright acoustic strum" />
          </div>
        </div>
        <div>
          <label className="label">추가 지시 (선택)</label>
          <input value={music.extra ?? ""} onChange={(e) => setMusic({ ...music, extra: e.target.value })} maxLength={300} className="input" placeholder="예) 후렴에서 떼창 느낌, 마지막에 조용히 마무리" />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">장면 4개 (각 15초)</h2>
        {scenes.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[6rem_1fr]">
            <div className="text-sm font-medium">장면 {i + 1}</div>
            <div className="space-y-2">
              <div>
                <label className="label">Kling 프롬프트 (영문)</label>
                <textarea value={s.videoPrompt} onChange={(e) => setScenes(scenes.map((x, j) => (j === i ? { ...x, videoPrompt: e.target.value } : x)))} rows={3} maxLength={1200} className="input font-mono text-xs" />
              </div>
            </div>
          </div>
        ))}
        <p className="hint">장면 자막은 위 가사 줄이 자동으로 들어갑니다. 마지막 3초에는 조합명·제목 카드가 붙어요.</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">자막 폰트·테마</h2>
        <SubtitleStylePicker style={style} onChange={setStyle} ratio="16:9" sampleText={lines(lyrics.chorus)[0] ?? title} compact />
      </div>

      {msg && <p className={`text-sm ${msg === "저장했어요." ? "text-brand-deep" : "text-danger"}`}>{msg}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => go("save")}>임시 저장</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => go("start")}>이대로 작곡·촬영 시작 →</button>
      </div>
    </div>
  );
}

export { DEFAULT_MUSIC_OPTIONS, DEFAULT_STYLE };
