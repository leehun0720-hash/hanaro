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
