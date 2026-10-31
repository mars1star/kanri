-- Apply google-access.sql after setup.sql, not this header by itself.
-- Allowed addresses belong in Supabase only, never in public source files.
-- Google must be the only enabled OAuth provider for this application.
begin;
create table if not exists public.festival_google_allowlist (
 email text primary key check(email=lower(btrim(email)) and position('@' in email)>1),
 display_name text not null check(length(btrim(display_name)) between 1 and 40),
 active boolean not null default true
);
alter table public.festival_google_allowlist enable row level security;
revoke all on public.festival_google_allowlist from public,anon,authenticated;

create or replace function public.festival_google_member() returns public.festival_members
language plpgsql security definer set search_path='' as $$
declare
 member public.festival_members%rowtype;
 allowed public.festival_google_allowlist%rowtype;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Googleでログインしてください。'; end if;
 -- A linked Google identity alone is insufficient: password/OTP sessions are denied.
 if not coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb,false) then
  raise sqlstate 'PT403' using message='Googleでログインし直してください。';
 end if;
 -- Identity data is provided by Google. Do not authorize user-editable user_metadata.
 select a.* into allowed
 from public.festival_google_allowlist a
 join auth.identities i on lower(i.identity_data->>'email')=a.email
 where i.user_id=auth.uid() and i.provider='google'
 and i.identity_data->'email_verified'='true'::jsonb and a.active
 and lower(auth.jwt()->>'email')=a.email
 limit 1 for share of a;
 if not found then raise sqlstate 'PT403' using message='このGoogleアカウントは利用を許可されていません。'; end if;
 member.user_id=auth.uid(); member.display_name=allowed.display_name; member.active=true;
 return member;
end $$;
revoke all on function public.festival_google_member() from public,anon,authenticated;
