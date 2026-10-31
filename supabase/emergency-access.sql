-- Run after google-access.sql. Create the Auth user separately in the dashboard.
begin;
create table if not exists public.festival_emergency_allowlist (
 email text primary key check(email=lower(btrim(email)) and position('@' in email)>1),
 display_name text not null check(length(btrim(display_name)) between 1 and 40),
 active boolean not null default true
);
alter table public.festival_emergency_allowlist enable row level security;
revoke all on public.festival_emergency_allowlist from public,anon,authenticated;

insert into public.festival_emergency_allowlist(email,display_name,active)
values ('festival-emergency@seiko.ac.jp','非常用アカウント',true)
on conflict(email) do update set display_name=excluded.display_name,active=true;

create or replace function public.festival_google_member() returns public.festival_members
language plpgsql security definer set search_path='' as $$
declare
 member public.festival_members%rowtype;
 google_allowed public.festival_google_allowlist%rowtype;
 emergency_allowed public.festival_emergency_allowlist%rowtype;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='ログインしてください。'; end if;
 if coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb,false) then
  select a.* into google_allowed
  from public.festival_google_allowlist a
  join auth.identities i on lower(i.identity_data->>'email')=a.email
  where i.user_id=auth.uid() and i.provider='google'
  and i.identity_data->'email_verified'='true'::jsonb and a.active
  and lower(auth.jwt()->>'email')=a.email limit 1 for share of a;
  if not found then raise sqlstate 'PT403' using message='このGoogleアカウントは利用を許可されていません。'; end if;
  member.user_id=auth.uid();
  select left(btrim(coalesce(i.identity_data->>'full_name',i.identity_data->>'name',google_allowed.display_name)),40)
  into member.display_name from auth.identities i where i.user_id=auth.uid() and i.provider='google' limit 1;
  member.active=true;
  return member;
 end if;
 if coalesce(auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb,false) then
  select a.* into emergency_allowed from public.festival_emergency_allowlist a
  where a.email=lower(auth.jwt()->>'email') and a.active limit 1 for share of a;
  if not found then raise sqlstate 'PT403' using message='この非常用アカウントは利用できません。'; end if;
  member.user_id=auth.uid(); member.display_name=emergency_allowed.display_name; member.active=true;
  return member;
 end if;
 raise sqlstate 'PT403' using message='許可された方法でログインし直してください。';
end $$;
revoke all on function public.festival_google_member() from public,anon,authenticated;
commit;
