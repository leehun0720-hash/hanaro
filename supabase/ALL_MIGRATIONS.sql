-- 하나로AI스튜디오 전체 마이그레이션 (0001~0006 순서대로 합침). Supabase SQL Editor에 통째로 붙여넣고 Run.

-- ===== supabase/migrations\0001_init.sql =====
-- 하나로AI스튜디오 초기 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣어 실행하세요.

create extension if not exists pgcrypto;

-- ---------- 테이블 ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  org_name text,
  role text not null default 'member' check (role in ('member','admin')),
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists plan_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default '하나로AI스튜디오 월 정액',
  price_krw integer not null default 99000,
  monthly_credits integer not null default 200,
  credit_costs jsonb not null default '{"document":1,"newsletter":2,"cardnews_page":1,"promo_video":20,"music_video":30}',
  updated_at timestamptz not null default now()
);
insert into plan_settings (id) values (1) on conflict do nothing;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'none' check (status in ('none','active','past_due','canceled')),
  customer_key text not null,
  billing_key text,
  card_company text,
  card_number_masked text,
  started_at timestamptz,
  next_billing_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  order_id text not null unique,
  amount integer not null,
  status text not null,
  toss_payment_key text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  job_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  what text not null,
  when_text text,
  where_text text,
  audience text,
  cta text,
  photos jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  type text not null check (type in ('document','newsletter','cardnews','promo_video','music_video')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  step text,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  credits integer not null default 0,
  provider_task_ids jsonb not null default '{}',
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_user_created on jobs (user_id, created_at desc);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','hwpx','zip')),
  storage_path text not null,
  mime text not null,
  size integer,
  meta jsonb not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 함수 ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function deduct_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  update profiles set credits = credits - p_amount
    where id = p_user and credits >= p_amount
    returning credits into v_balance;
  if v_balance is null then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, -p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

create or replace function add_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  update profiles set credits = credits + p_amount where id = p_user returning credits into v_balance;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

create or replace function set_credits(p_user uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_old integer; v_new integer;
begin
  select credits into v_old from profiles where id = p_user for update;
  update profiles set credits = p_amount where id = p_user returning credits into v_new;
  insert into credit_ledger (user_id, delta, balance_after, reason)
    values (p_user, v_new - v_old, v_new, p_reason);
  return v_new;
end $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists jobs_touch on jobs;
create trigger jobs_touch before update on jobs for each row execute procedure touch_updated_at();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table plan_settings enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table credit_ledger enable row level security;
alter table projects enable row level security;
alter table jobs enable row level security;
alter table assets enable row level security;

drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "plan readable" on plan_settings;
create policy "plan readable" on plan_settings for select using (true);

drop policy if exists "subscriptions select" on subscriptions;
create policy "subscriptions select" on subscriptions for select using (user_id = auth.uid() or is_admin());
drop policy if exists "payments select" on payments;
create policy "payments select" on payments for select using (user_id = auth.uid() or is_admin());
drop policy if exists "ledger select" on credit_ledger;
create policy "ledger select" on credit_ledger for select using (user_id = auth.uid() or is_admin());

drop policy if exists "projects own" on projects;
create policy "projects own" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "projects admin read" on projects;
create policy "projects admin read" on projects for select using (is_admin());

drop policy if exists "jobs select" on jobs;
create policy "jobs select" on jobs for select using (user_id = auth.uid() or is_admin());
drop policy if exists "assets select" on assets;
create policy "assets select" on assets for select using (user_id = auth.uid() or is_admin() or is_public);

-- role 컬럼은 본인이 바꿀 수 없도록 트리거로 보호
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
  if new.role <> old.role and not is_admin() and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if new.credits <> old.credits and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'CREDITS_CHANGE_FORBIDDEN';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles for each row execute procedure protect_profile_role();

-- ---------- Storage ----------
insert into storage.buckets (id, name, public)
  values ('uploads','uploads',false), ('outputs','outputs',false)
  on conflict (id) do nothing;

drop policy if exists "storage own folder" on storage.objects;
create policy "storage own folder" on storage.objects for all
  using (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 최초 관리자 지정 (이메일 수정 후 실행) ----------
-- SQL Editor에서는 보호 트리거를 잠깐 꺼야 한다:
-- alter table profiles disable trigger profiles_protect;
-- update profiles set role = 'admin' where email = 'admin@example.com';
-- alter table profiles enable trigger profiles_protect;


-- ===== supabase/migrations\0002_banana.sql =====
-- ro 요금정책 (지니젠 벤치마크) — 0001 적용 후 실행

-- 1) 충전분 잔고 분리: credits = 월 지급(구독, 결제일마다 재설정) / banana_purchased = 충전분(무기한)
alter table profiles add column if not exists banana_purchased integer not null default 0;

-- 2) 단가 기본값 갱신 (ro 단위)
update plan_settings set
  name = '하나로AI스튜디오 월 정액',
  price_krw = 99000,
  monthly_credits = 1300,
  credit_costs = '{"document":3,"newsletter":8,"cardnews_page":5,"promo_video":55,"music_video":110}'::jsonb,
  updated_at = now()
where id = 1;

-- 3) 충전 패키지
create table if not exists banana_packages (
  id text primary key,
  name text not null,
  bananas integer not null,
  price_krw integer not null,
  list_price_krw integer not null,
  description text,
  sort integer not null default 0,
  active boolean not null default true
);
insert into banana_packages (id, name, bananas, price_krw, list_price_krw, description, sort) values
  ('basic',      '베이직',      120,   10000,   12000, '가장 인기 있는 패키지', 1),
  ('value',      '밸류',        625,   50000,   62500, '정기 사용자 추천', 2),
  ('pro',        '프로',        1300,  100000,  130000, '전문가용 ro 패키지', 3),
  ('business',   '비즈니스',    6750,  500000,  675000, '기업·조합 단위 대용량', 4),
  ('enterprise', '엔터프라이즈', 14300, 1000000, 1430000, '최상위 기업용', 5)
on conflict (id) do update set name = excluded.name, bananas = excluded.bananas, price_krw = excluded.price_krw, list_price_krw = excluded.list_price_krw, description = excluded.description, sort = excluded.sort;

alter table banana_packages enable row level security;
drop policy if exists "packages readable" on banana_packages;
create policy "packages readable" on banana_packages for select using (true);

-- 4) 구매 기록 (토스 일반결제)
create table if not exists banana_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  package_id text not null references banana_packages(id),
  order_id text not null unique,
  bananas integer not null,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  toss_payment_key text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table banana_purchases enable row level security;
drop policy if exists "purchases select" on banana_purchases;
create policy "purchases select" on banana_purchases for select using (user_id = auth.uid() or is_admin());

-- 5) 차감: 월 지급분 → 충전분 순서. 부족하면 예외
create or replace function deduct_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_m integer; v_p integer; v_from_m integer; v_from_p integer;
begin
  select credits, banana_purchased into v_m, v_p from profiles where id = p_user for update;
  if v_m is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_m + v_p < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
  v_from_m := least(v_m, p_amount);
  v_from_p := p_amount - v_from_m;
  update profiles set credits = credits - v_from_m, banana_purchased = banana_purchased - v_from_p where id = p_user;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, -p_amount, (v_m - v_from_m) + (v_p - v_from_p), p_reason, p_job);
  return (v_m - v_from_m) + (v_p - v_from_p);
end $$;

-- 6) 증가: 환불(refund:*)·구매(purchase:*)·보너스는 충전분에, 그 외(관리자 조정 등)는 월 지급분에
create or replace function add_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_m integer; v_p integer;
begin
  if p_reason like 'refund:%' or p_reason like 'purchase:%' or p_reason like 'bonus:%' then
    update profiles set banana_purchased = banana_purchased + p_amount where id = p_user returning credits, banana_purchased into v_m, v_p;
  else
    update profiles set credits = credits + p_amount where id = p_user returning credits, banana_purchased into v_m, v_p;
  end if;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id) values (p_user, p_amount, v_m + v_p, p_reason, p_job);
  return v_m + v_p;
end $$;

-- 7) 월 지급분 재설정 (충전분 보존)
create or replace function set_credits(p_user uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_old integer; v_p integer;
begin
  select credits, banana_purchased into v_old, v_p from profiles where id = p_user for update;
  update profiles set credits = p_amount where id = p_user;
  insert into credit_ledger (user_id, delta, balance_after, reason) values (p_user, p_amount - v_old, p_amount + v_p, p_reason);
  return p_amount + v_p;
end $$;

-- 8) 가입 보너스 30B
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, banana_purchased)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''), 30)
  on conflict (id) do nothing;
  insert into credit_ledger (user_id, delta, balance_after, reason) values (new.id, 30, 30, 'bonus:signup');
  return new;
end $$;

-- 9) 구매 확정 (멱등): pending → paid + 충전
create or replace function confirm_banana_purchase(p_order_id text, p_payment_key text, p_raw jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare r banana_purchases%rowtype; v_bal integer;
begin
  select * into r from banana_purchases where order_id = p_order_id for update;
  if r.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if r.status = 'paid' then
    select credits + banana_purchased into v_bal from profiles where id = r.user_id; return v_bal;
  end if;
  update banana_purchases set status = 'paid', toss_payment_key = p_payment_key, raw = p_raw, paid_at = now() where id = r.id;
  v_bal := add_credits(r.user_id, r.bananas, 'purchase:' || r.package_id, null);
  return v_bal;
end $$;

-- profiles 보호 트리거에 banana_purchased도 포함
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
  if new.role <> old.role and not is_admin() and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if (new.credits <> old.credits or new.banana_purchased <> old.banana_purchased) and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'CREDITS_CHANGE_FORBIDDEN';
  end if;
  return new;
end $$;


-- ===== supabase/migrations\0003_practice.sql =====
-- 실습 제작실(사진→영상) + 사용자 확인 대기 상태
-- 0001_init.sql, 0002_banana.sql 다음에 실행

alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('document','newsletter','cardnews','promo_video','music_video','practice'));

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued','running','waiting','succeeded','failed'));

-- Seedance 동시 실행 게이트가 빠르게 세도록
create index if not exists jobs_step_status on jobs (step, status);


-- ===== supabase/migrations\0004_practice_spec.sql =====
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


-- ===== supabase/migrations\0005_app_secrets.sql =====
-- 관리자 화면에서 입력하는 API 키 저장소 (서비스 롤 전용)
-- 값은 서버에서 AES-256-GCM으로 암호화해 저장한다 (키 파생: SUPABASE_SERVICE_ROLE_KEY)
create table if not exists app_secrets (
  name text primary key,
  ciphertext text not null,
  hint text,                       -- 마지막 4자리 등 표시용
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
-- 정책 없음: anon/authenticated 접근 불가, 서비스 롤만 읽고 쓴다


-- ===== supabase/migrations\0006_service_role_check.sql =====
-- profiles 보호 트리거의 서비스 롤 판별 수정
-- 옛 PostgREST 설정(request.jwt.claim.role)은 더 이상 채워지지 않아 서버(서비스 키)의 크레딧·역할 변경이 전부 막혔다.
-- 현재 값(request.jwt.claims JSON)과 auth.role()을 모두 확인한다. 0001~0005 다음에 실행.

create or replace function is_service_role() returns boolean
language plpgsql stable as $$
declare v text;
begin
  -- 1) 새 방식: JSON claims
  begin
    v := current_setting('request.jwt.claims', true)::json ->> 'role';
  exception when others then v := null;
  end;
  if v = 'service_role' then return true; end if;
  -- 2) 옛 방식
  if current_setting('request.jwt.claim.role', true) = 'service_role' then return true; end if;
  -- 3) Supabase 헬퍼
  begin
    if auth.role() = 'service_role' then return true; end if;
  exception when others then null;
  end;
  -- 4) SQL Editor·마이그레이션(postgres 슈퍼유저)에서 직접 실행하는 경우
  if current_user in ('postgres', 'supabase_admin') and current_setting('request.jwt.claims', true) is null then return true; end if;
  return false;
end $$;

create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
  if is_service_role() then return new; end if;
  if new.role <> old.role and not is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if new.credits <> old.credits or new.banana_purchased <> old.banana_purchased then
    raise exception 'CREDITS_CHANGE_FORBIDDEN';
  end if;
  return new;
end $$;

-- ===== 0007_branding_library.sql =====
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

-- ===== 0008_theme.sql =====
-- 0008: 사이트 색 테마 (관리자 브랜딩에서 선택: green·navy·purple·red·pink)
alter table site_settings add column if not exists theme text not null default 'green';
