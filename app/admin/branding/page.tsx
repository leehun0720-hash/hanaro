import { Alert } from "@/components/Alert";
import { getBranding } from "@/lib/branding";
import { removeLogo, saveBranding } from "./actions";
import { THEMES, type ThemeId } from "@/lib/themes";

export const metadata = { title: "관리자 · 브랜딩" };
export const dynamic = "force-dynamic";

export default async function AdminBranding({ searchParams }: PageProps<"/admin/branding">) {
  const sp = await searchParams;
  const b = await getBranding();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">브랜딩 — 이름·로고</h1>
        <p className="mt-1 text-sm text-muted">사이트 제목, 로고, 소개 문구, 저작권 표기를 바꿉니다. 저장하면 모든 화면·검색 카드·주문명에 바로 반영됩니다.</p>
      </div>
      {sp.ok && <Alert kind="success">저장되었습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}

      <form action={saveBranding} className="card space-y-5">
        <div className="flex items-center gap-4 rounded-lg border border-line bg-[var(--background)] p-4">
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt={b.name} className="h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-brand text-lg font-black text-white">{(b.name[0] ?? "R").toUpperCase()}</span>
          )}
          <div>
            <p className="font-black">{b.name} <span className="text-xs font-medium text-muted">{b.byline}</span></p>
            <p className="text-xs text-muted">현재 표시 모습</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">사이트 이름</label><input name="name" defaultValue={b.name} maxLength={40} className="input" required /><p className="hint">예) runiq space</p></div>
          <div><label className="label">부제 (선택)</label><input name="byline" defaultValue={b.byline} maxLength={40} className="input" /><p className="hint">이름 옆에 작게 표시. 예) by tenai</p></div>
        </div>
        <div><label className="label">소개 문구 (검색 결과·공유 카드 설명)</label><textarea name="tagline" defaultValue={b.tagline} maxLength={200} className="input min-h-20" required /></div>
        <div><label className="label">저작권·라이선스 보유자</label><input name="owner" defaultValue={b.owner} maxLength={60} className="input" required /><p className="hint">푸터에 “© {new Date().getFullYear()} {b.owner}. All rights reserved.”로 표시됩니다.</p></div>
        <div>
          <label className="label">색 테마</label>
          <div className="grid gap-2 sm:grid-cols-5">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => {
              const t = THEMES[id];
              return (
                <label key={id} className={`cursor-pointer rounded-lg border p-3 text-sm ${b.theme === id ? "border-brand bg-brand-soft" : "border-line"}`}>
                  <input type="radio" name="theme" value={id} defaultChecked={b.theme === id} className="sr-only" />
                  <span className="flex gap-1">
                    <span className="h-6 w-6 rounded-full" style={{ background: t.colors.brand }} />
                    <span className="h-6 w-6 rounded-full" style={{ background: t.colors.brandDeep }} />
                    <span className="h-6 w-6 rounded-full" style={{ background: t.colors.accent }} />
                  </span>
                  <span className="mt-2 block font-medium">{t.label}</span>
                  <span className="block text-[11px] text-muted">{t.desc}</span>
                </label>
              );
            })}
          </div>
          <p className="hint">버튼·링크·히어로 배경·배지·공유 이미지 색이 함께 바뀝니다.</p>
        </div>
        <div>
          <label className="label" htmlFor="logo">로고 이미지 (선택 · PNG/JPG/WebP/SVG · 1MB 이하)</label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input" />
          <p className="hint">배경이 투명한 가로형 로고를 권장합니다 (높이 32px로 표시). 올리지 않으면 이름 첫 글자 배지가 나옵니다.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary">저장</button>
        </div>
      </form>

      {b.logoPath && (
        <form action={removeLogo} className="card flex items-center justify-between gap-4">
          <p className="text-sm">로고 이미지를 지우고 이름 첫 글자 배지로 돌아갑니다.</p>
          <button className="btn-danger px-3 py-1.5 text-xs">로고 제거</button>
        </form>
      )}
    </div>
  );
}
