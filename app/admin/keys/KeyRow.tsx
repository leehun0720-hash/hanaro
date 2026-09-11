"use client";
import { useState } from "react";
import type { SecretStatus } from "@/lib/secrets";
import { removeSecret, saveSecret } from "./actions";

export function KeyRow({ row }: { row: SecretStatus }) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/keys/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: row.name }) });
      setResult((await r.json()) as { ok: boolean; message: string });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  const badge = row.source === "db" ? <span className="badge bg-brand-soft text-brand-deep">관리자 입력</span> : row.source === "env" ? <span className="badge bg-gold-soft text-[#7a5d00]">환경변수</span> : <span className="badge bg-danger-soft text-danger">미설정</span>;

  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold">{row.name}</span>{badge}</div>
          <p className="text-xs text-muted">{row.label}{row.hint ? ` · 현재 ${row.hint}` : ""}{row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString("ko-KR")}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {row.test && (
            <button type="button" onClick={test} disabled={testing || row.source === "none"} className="btn-secondary px-2 py-1 text-xs">{testing ? "테스트 중…" : "연결 테스트"}</button>
          )}
          {row.source === "db" && (
            <form action={removeSecret}>
              <input type="hidden" name="name" value={row.name} />
              <button className="btn-danger px-2 py-1 text-xs">삭제</button>
            </form>
          )}
        </div>
      </div>
      <form action={saveSecret} className="flex items-center gap-2">
        <input type="hidden" name="name" value={row.name} />
        <input name="value" type={row.isSecret && !show ? "password" : "text"} autoComplete="off" spellCheck={false} placeholder={row.source === "none" ? "값 입력" : "새 값으로 교체"} className="input font-mono text-xs" />
        {row.isSecret && <button type="button" onClick={() => setShow((s) => !s)} className="btn-secondary px-2 py-1 text-xs">{show ? "숨김" : "보기"}</button>}
        <button className="btn-primary px-3 py-1 text-xs">저장</button>
      </form>
      {result && <p className={`text-xs ${result.ok ? "text-brand-deep" : "text-danger"}`}>{result.message}</p>}
    </div>
  );
}
