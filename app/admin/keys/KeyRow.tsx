"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SecretStatus } from "@/lib/secrets";

export function KeyRow({ row }: { row: SecretStatus }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"save" | "delete" | "test" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const r = await fetch("/api/admin/keys", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `요청 실패 (${r.status})`);
  }

  async function save() {
    setMsg(null);
    setBusy("save");
    try {
      await call("POST", { name: row.name, value });
      setValue("");
      setMsg({ ok: true, text: "저장했어요. 최대 1분 안에 반영됩니다." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`${row.name} 저장값을 삭제할까요? 환경변수 값이 있으면 그 값으로 돌아갑니다.`)) return;
    setMsg(null);
    setBusy("delete");
    try {
      await call("DELETE", { name: row.name });
      setMsg({ ok: true, text: "삭제했어요." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setMsg(null);
    setBusy("test");
    try {
      const r = await fetch("/api/admin/keys/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: row.name }) });
      const j = (await r.json()) as { ok: boolean; message: string; error?: string };
      setMsg({ ok: Boolean(j.ok), text: j.message ?? j.error ?? "" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const badge =
    row.source === "db" ? <span className="badge bg-brand-soft text-brand-deep">관리자 입력</span>
    : row.source === "broken" ? <span className="badge bg-danger-soft text-danger">다시 입력 필요 (암호화 키 변경)</span>
    : row.source === "env" ? <span className="badge bg-gold-soft text-[#7a5d00]">환경변수</span>
    : <span className="badge bg-danger-soft text-danger">미설정</span>;

  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold">{row.name}</span>{badge}</div>
          <p className="text-xs text-muted">{row.label}{row.hint ? ` · 현재 ${row.hint}` : ""}{row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString("ko-KR")}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {row.test && <button type="button" onClick={test} disabled={busy !== null || row.source === "none"} className="btn-secondary px-2 py-1 text-xs">{busy === "test" ? "테스트 중…" : "연결 테스트"}</button>}
          {(row.source === "db" || row.source === "broken") && <button type="button" onClick={remove} disabled={busy !== null} className="btn-danger px-2 py-1 text-xs">삭제</button>}
        </div>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type={row.isSecret && !show ? "password" : "text"}
          autoComplete="off"
          spellCheck={false}
          placeholder={row.source === "none" ? "값 입력" : "새 값으로 교체"}
          className="input font-mono text-xs"
        />
        {row.isSecret && <button type="button" onClick={() => setShow((s) => !s)} className="btn-secondary px-2 py-1 text-xs">{show ? "숨김" : "보기"}</button>}
        <button className="btn-primary px-3 py-1 text-xs" disabled={busy !== null || !value.trim()}>{busy === "save" ? "저장 중…" : "저장"}</button>
      </form>
      {msg && <p className={`text-xs ${msg.ok ? "text-brand-deep" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
