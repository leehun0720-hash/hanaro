/** 산출물 파일명 — 짧게. 규칙: {종류}_{핵심어 ≤ N자}[_v1].{ext} */

/** 파일명에 못 쓰는 문자 제거 + 공백은 붙이고 + 길이 제한 */
export function shortName(text: string | null | undefined, max = 10): string {
  const t = (text ?? "")
    .replace(/[\/:*?"<>|]/g, "")
    .replace(/[\s·—–-]+/g, "")
    .trim();
  return [...t].slice(0, max).join("");
}

/** 조각을 _로 잇는다 (빈 조각은 건너뜀) */
export function fileName(parts: (string | null | undefined)[], ext: string): string {
  const name = parts.filter((p): p is string => Boolean(p && p.trim())).join("_") || "파일";
  return `${name}.${ext}`;
}
