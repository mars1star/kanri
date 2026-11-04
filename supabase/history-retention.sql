-- 履歴は2日間だけ保持します。画面の表示・更新時にも古い履歴を削除します。
create or replace function public.festival_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 member public.festival_members%rowtype;
 state public.festival_inventory%rowtype;
 history jsonb;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='ログインしてください。'; end if;
 member=public.festival_google_member();
 select * into strict state from public.festival_inventory where id=1;
 delete from public.festival_activity where created_at < now()-interval '2 days';
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'actor',h.actor_name,'detail',h.details,'at',h.created_at) order by h.revision desc),'[]'::jsonb)
 into history from (select * from public.festival_activity where revision<=state.revision order by revision desc limit 100) h;
 return jsonb_build_object('data',state.data,'revision',state.revision,'history',history,'user',jsonb_build_object('name',member.display_name));
end $$;

revoke all on function public.festival_snapshot() from public,anon;
grant execute on function public.festival_snapshot() to authenticated;
