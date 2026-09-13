"use client";
import { useState } from "react";
import { SubtitleStudio } from "@/components/SubtitleStudio";
import type { Cue } from "@/lib/video/subtitles";

export function SubtitleLab() {
  const [url, setUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([
    { start: 0, end: 2.5, text: "올해 배, 진짜 달아요!" },
    { start: 2.5, end: 5, text: "하나로마트에서 만나요 🍐" },
  ]);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <label className="label">테스트 mp4 (5~10초)</label>
        <input type="file" accept="video/mp4" className="input" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUrl(URL.createObjectURL(f)); }} />
        <button type="button" className="btn-secondary text-xs" onClick={() => setUrl("/dev/sample.mp4")}>샘플 사용 (/dev/sample.mp4)</button>
      </div>
      {url && (
        <div className="card">
          <SubtitleStudio
            videoUrl={url}
            cues={cues}
            onCuesChange={setCues}
            duration={5}
            ratio="16:9"
            nickname="테스트"
            busy={false}
            onServerFallback={async (st) => setDone(`서버 대체 경로는 실습 화면에서만 동작해요. (스타일: ${st.fontId}/${st.themeId})`)}
            onFinish={async (b) => setDone(`완료 버튼 눌림 (결과 ${b ? Math.round(b.size / 1024) + "KB" : "없음"})`)}
          />
          {done && <p className="hint">{done}</p>}
        </div>
      )}
    </div>
  );
}
