"use client";

/**
 * 참조 사진 선택 — 프로젝트 사진 중 첫 프레임으로 쓸 1장을 명시적으로 고른다.
 * 기본값은 "참조 안 함". 고르지 않은 사진·보관함 자료는 생성에 쓰이지 않는다.
 */
export function RefPhotoPicker({ photos, urls, value, onChange }: { photos: string[]; urls: Record<string, string>; value: string | null; onChange: (p: string | null) => void }) {
  if (!photos.length) return <p className="hint">이 프로젝트에 올린 사진이 없어요. 참조 없이 장면 설명만으로 만듭니다.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange(null)} className={`grid h-20 w-20 place-items-center rounded-lg border text-xs ${value === null ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}>
        참조 안 함
      </button>
      {photos.map((p, i) => {
        const selected = value === p;
        return (
          <button key={p} type="button" onClick={() => onChange(selected ? null : p)} className={`relative h-20 w-20 overflow-hidden rounded-lg border-2 ${selected ? "border-brand" : "border-line"}`} title={`사진 ${i + 1}`}>
            {urls[p] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p]} alt={`프로젝트 사진 ${i + 1}`} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-xs text-muted">사진 {i + 1}</span>
            )}
            {selected && <span className="absolute right-1 top-1 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
