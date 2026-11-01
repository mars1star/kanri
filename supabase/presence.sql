begin;
create table if not exists public.festival_presence_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 1 and 40),
 login_method text not null check(login_method in ('google','emergency')),
 last_seen timestamptz not null default now()
);
alter table public.festival_presence_state enable row level security;
revoke all on public.festival_presence_state from public,anon,authenticated;

create or replace function public.festival_presence() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 member public.festival_members%rowtype;
 method text;
 result jsonb;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='ログインしてください。'; end if;
 member=public.festival_google_member();
 method=case when coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb,false) then 'google' else 'emergency' end;
 insert into public.festival_presence_state(user_id,display_name,login_method,last_seen)
 values(auth.uid(),member.display_name,method,now())
 on conflict(user_id) do update set display_name=excluded.display_name,login_method=excluded.login_method,last_seen=excluded.last_seen;
 delete from public.festival_presence_state where last_seen<now()-interval '1 day';
 select coalesce(jsonb_agg(jsonb_build_object('id',p.user_id,'name',p.display_name,'method',p.login_method,'seenAt',p.last_seen) order by p.display_name),'[]'::jsonb)
 into result from public.festival_presence_state p where p.last_seen>=now()-interval '2 minutes';
 return result;
end $$;
revoke all on function public.festival_presence() from public,anon;
grant execute on function public.festival_presence() to authenticated;
commit;
