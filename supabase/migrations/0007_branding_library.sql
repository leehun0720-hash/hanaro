-- 0007: 브랜딩(이름·로고 관리자 설정) + 보관함 삭제
-- Supabase SQL Editor에서 그대로 실행

-- ---------- 사이트 브랜딩 ----------
create table if not exists site_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'runiq space',
  byline text not null default 'by tenai',
  tagline text not null default '농축협 현장을 위한 AI 콘텐츠 스튜디오 — 기획서·뉴스레터·카드뉴스·홍보영상·뮤직비디오를 소재 하나로, 오늘 안에.',
  owner text not null default 'tenai',
  logo_path text,
  updated_at timestamptz not null default now()
);
insert into site_settings (id) values (1) on conflict (id) do nothing;

alter table site_settings enable row level security;
drop policy if exists "site_settings read" on site_settings;
create policy "site_settings read" on site_settings for select using (true);
-- 쓰기는 서비스 키(관리자 화면)만

-- 로고 파일: 공개 버킷
insert into storage.buckets (id, name, public)
  values ('branding','branding',true)
  on conflict (id) do nothing;
drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects for select using (bucket_id = 'branding');

-- ---------- 보관함 삭제 (작업 기록은 남기고 목록에서만 숨김) ----------
alter table jobs add column if not exists deleted_at timestamptz;
create index if not exists jobs_user_deleted_idx on jobs (user_id, deleted_at);
