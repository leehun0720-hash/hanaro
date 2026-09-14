import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/** 관리자가 바꿀 수 있는 사이트 이름·로고 (site_settings 1행). 마이그레이션 0007 */
export type Branding = {
  name: string; // 예) runiq space
  byline: string; // 예) by tenai
  tagline: string; // 메타 설명·소개 문구
  owner: string; // 저작권·라이선스 보유자 (푸터 ©)
  logoPath: string | null; // storage(branding 버킷) 경로
  logoUrl: string | null; // 공개 URL (캐시 무효화용 ?v= 포함)
  updatedAt: string | null;
};

export const DEFAULT_BRANDING: Branding = { name: SITE_NAME, byline: "by tenai", tagline: SITE_DESCRIPTION, owner: "tenai", logoPath: null, logoUrl: null, updatedAt: null };

type Row = { name: string; byline: string; tagline: string; owner: string; logo_path: string | null; updated_at: string };

let memo: { at: number; v: Branding } | null = null;
const TTL_MS = 30_000;

/** 요청당 1회(react cache) + 프로세스 30초 캐시. 테이블이 없거나 실패하면 기본값 */
export const getBranding = cache(async (): Promise<Branding> => {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.v;
  if (!supabaseConfigured()) return DEFAULT_BRANDING;
  try {
    const db = adminClient();
    const { data, error } = await db.from("site_settings").select("name, byline, tagline, owner, logo_path, updated_at").eq("id", 1).maybeSingle();
    if (error || !data) return DEFAULT_BRANDING;
    const r = data as Row;
    const logoUrl = r.logo_path ? `${db.storage.from("branding").getPublicUrl(r.logo_path).data.publicUrl}?v=${Date.parse(r.updated_at) || 0}` : null;
    const v: Branding = { name: r.name || DEFAULT_BRANDING.name, byline: r.byline ?? "", tagline: r.tagline || DEFAULT_BRANDING.tagline, owner: r.owner || DEFAULT_BRANDING.owner, logoPath: r.logo_path, logoUrl, updatedAt: r.updated_at };
    memo = { at: Date.now(), v };
    return v;
  } catch {
    return DEFAULT_BRANDING;
  }
});

/** 관리자 저장 직후 캐시를 비운다 (같은 인스턴스만; 다른 인스턴스는 30초 안에 갱신) */
export function invalidateBranding() {
  memo = null;
}

/** 이름 + 부제를 한 줄로 (메타 제목·주문명 등) */
export const fullName = (b: Branding) => (b.byline ? `${b.name} ${b.byline}` : b.name);
