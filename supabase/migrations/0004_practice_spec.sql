-- 실습 제작실 SPEC v1.0 반영 (Kling 3.0 via fal.ai · 하드캡 크레딧 · 동의 · 삭제 예정일 · 비용)
-- 0001 → 0002 → 0003 다음에 실행

-- 사진 업로드·AI 처리·N일 후 삭제 동의 시각
alter table profiles add column if not exists consent_at timestamptz;

-- 실습 하드캡 크레딧 (ro와 별개): 이미지 3회 · 영상 2회
create table if not exists practice_credits (
  user_id uuid primary key references profiles(id) on delete cascade,
  image_left integer not null default 3 check (image_left >= 0),
  video_left integer not null default 2 check (video_left >= 0),
  updated_at timestamptz not null default now()
);
alter table practice_credits enable row level security;
drop policy if exists "practice_credits select own" on practice_credits;
create policy "practice_credits select own" on practice_credits for select using (user_id = auth.uid() or is_admin());

-- 작업: 비용·큐 순번
alter table jobs add column if not exists cost_usd numeric(10,4) not null default 0;
alter table jobs add column if not exists queue_position integer;

-- 자산: 실습 종료 후 삭제 예정일
alter table assets add column if not exists delete_after timestamptz;
create index if not exists assets_delete_after on assets (delete_after) where delete_after is not null;

-- 크레딧 원자적 차감/환불/설정
create or replace function practice_use(p_user uuid, p_kind text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_left integer;
begin
  insert into practice_credits (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_kind = 'image' then
    update practice_credits set image_left = image_left - 1, updated_at = now()
      where user_id = p_user and image_left > 0 returning image_left into v_left;
  elsif p_kind = 'video' then
    update practice_credits set video_left = video_left - 1, updated_at = now()
      where user_id = p_user and video_left > 0 returning video_left into v_left;
  else
    raise exception 'BAD_KIND';
  end if;
  if v_left is null then raise exception 'NO_PRACTICE_CREDITS'; end if;
  return v_left;
end $$;

create or replace function practice_refund(p_user uuid, p_kind text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_left integer;
begin
  insert into practice_credits (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_kind = 'image' then
    update practice_credits set image_left = image_left + 1, updated_at = now() where user_id = p_user returning image_left into v_left;
  elsif p_kind = 'video' then
    update practice_credits set video_left = video_left + 1, updated_at = now() where user_id = p_user returning video_left into v_left;
  else
    raise exception 'BAD_KIND';
  end if;
  return v_left;
end $$;

create or replace function practice_set(p_user uuid, p_image integer, p_video integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into practice_credits (user_id, image_left, video_left) values (p_user, p_image, p_video)
    on conflict (user_id) do update set image_left = excluded.image_left, video_left = excluded.video_left, updated_at = now();
end $$;
