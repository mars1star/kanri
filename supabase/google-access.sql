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
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'actor',h.actor_name,'detail',h.details,'at',h.created_at) order by h.revision desc),'[]'::jsonb)
 into history from (select * from public.festival_activity where revision<=state.revision order by revision desc limit 100) h;
 return jsonb_build_object('data',state.data,'revision',state.revision,'history',history,'user',jsonb_build_object('name',member.display_name));
end $$;

create or replace function public.festival_change(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 member public.festival_members%rowtype; state public.festival_inventory%rowtype;
 previous_request public.festival_activity%rowtype;
 request_id uuid; expected bigint; change jsonb; kind text; actor text;
 item jsonb; source jsonb; destination jsonb; items jsonb; places jsonb; counts jsonb; targets jsonb;
 quantity integer; old_count integer; target_count integer; note text; name text; unit text; detail jsonb;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='ログインしてください。'; end if;
 member=public.festival_google_member();
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>6000 then
  raise sqlstate 'PT400' using message='入力形式が正しくありません。'; end if;
 begin request_id=(p_request->>'id')::uuid; expected=(p_request->>'revision')::bigint;
 exception when others then raise sqlstate 'PT400' using message='登録IDまたは更新番号が正しくありません。'; end;
 if request_id is null or expected is null or expected<0 or jsonb_typeof(p_request->'revision') is distinct from 'number' then
  raise sqlstate 'PT400' using message='更新番号を確認してください。'; end if;
 if coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb,false) then
  -- Google identity verified by festival_google_member(); never trust a client-supplied name.
  actor=member.display_name;
 elsif coalesce(auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb,false) then
  actor=btrim(coalesce(p_request->>'actor',''));
  if jsonb_typeof(p_request->'actor') is distinct from 'string' or length(actor) not between 1 and 40 then
   raise sqlstate 'PT400' using message='履歴に表示する名前を40文字以内で入力してください。';
  end if;
  actor=actor||'（非常用）';
 else
  raise sqlstate 'PT403' using message='許可された方法でログインし直してください。';
 end if;
 change=p_request->'change'; kind=change->>'type';
 if jsonb_typeof(change) is distinct from 'object' or kind is null or kind not in ('item','place','adjust','transfer','target','targets','delete_place','delete_item') then
  raise sqlstate 'PT400' using message='操作が正しくありません。'; end if;
 -- 行ロックで同時操作を直列化。個数の更新と履歴保存は同一トランザクション。
 select * into strict state from public.festival_inventory where id=1 for update;
 select * into previous_request from public.festival_activity where id=request_id;
 if found then
  if previous_request.actor_id<>auth.uid() or previous_request.request<>p_request then
   raise sqlstate 'PT409' using message='登録IDが重複しています。画面を開き直してください。'; end if;
  return jsonb_build_object('ok',true,'repeated',true);
 end if;
 if state.revision<>expected then raise sqlstate 'PT409' using message='ほかの人が更新しました。最新の個数を確認して再度登録してください。'; end if;
 items=state.data->'items'; places=state.data->'places'; counts=state.data->'counts'; targets=coalesce(state.data->'targets','{}'::jsonb);
 if kind='targets' then
  targets=change->'targets';
  if jsonb_typeof(targets) is distinct from 'object' or octet_length(targets::text)>5000
   or exists(select 1 from jsonb_each(targets) p where not exists(select 1 from jsonb_array_elements(places) v where v->>'id'=p.key) or jsonb_typeof(p.value)<>'object')
   or exists(select 1 from jsonb_each(targets) p cross join lateral jsonb_each(p.value) i where not exists(select 1 from jsonb_array_elements(items) v where v->>'id'=i.key) or jsonb_typeof(i.value)<>'number' or i.value::text !~ '^[0-9]{1,5}$') then raise sqlstate 'PT400' using message='目標数の一覧を確認してください。'; end if;
  detail=jsonb_build_object('type',kind,'title','目標数をまとめて設定','description','場所ごとの目標数を更新しました');
 elsif kind='target' then
  select v into item from jsonb_array_elements(items) v where v->>'id'=change->>'item';
  select v into source from jsonb_array_elements(places) v where v->>'id'=change->>'from';
  if item is null or source is null or jsonb_typeof(change->'quantity') is distinct from 'number' or coalesce(change->>'quantity','') !~ '^[0-9]{1,5}$' then raise sqlstate 'PT400' using message='場所・備品・0〜99,999の目標数を入力してください。'; end if;
  quantity=(change->>'quantity')::integer; targets=targets||jsonb_build_object(source->>'id',coalesce(targets->(source->>'id'),'{}'::jsonb)||jsonb_build_object(item->>'id',quantity));
  detail=jsonb_build_object('type',kind,'title',(source->>'name')||'の'||(item->>'name')||'目標を設定','description','目標：'||quantity||(item->>'unit'));
 elsif kind='delete_place' then
  select v into source from jsonb_array_elements(places) v where v->>'id'=change->>'from';
  if source is null then raise sqlstate 'PT400' using message='場所が見つかりません。'; end if;
  if exists(select 1 from jsonb_each_text(coalesce(counts->(source->>'id'),'{}'::jsonb)) e where e.value::integer<>0) then raise sqlstate 'PT400' using message='個数が残っている場所は削除できません。先に0にしてください。'; end if;
  select coalesce(jsonb_agg(v),'[]'::jsonb) into places from jsonb_array_elements(places) v where v->>'id'<>source->>'id'; counts=counts-(source->>'id'); targets=targets-(source->>'id');
  detail=jsonb_build_object('type',kind,'title',(source->>'name')||'を削除','description','場所を削除しました');
 elsif kind='delete_item' then
  select v into item from jsonb_array_elements(items) v where v->>'id'=change->>'item';
  if item is null then raise sqlstate 'PT400' using message='備品が見つかりません。'; end if;
  if exists(select 1 from jsonb_each(counts) p where coalesce((p.value->>(item->>'id'))::integer,0)<>0) then raise sqlstate 'PT400' using message='個数が残っている備品は削除できません。先に0にしてください。'; end if;
  select coalesce(jsonb_agg(v),'[]'::jsonb) into items from jsonb_array_elements(items) v where v->>'id'<>item->>'id';
  select coalesce(jsonb_object_agg(e.key,e.value-(item->>'id')),'{}'::jsonb) into counts from jsonb_each(counts) e;
  select coalesce(jsonb_object_agg(e.key,e.value-(item->>'id')),'{}'::jsonb) into targets from jsonb_each(targets) e;
  detail=jsonb_build_object('type',kind,'title',(item->>'name')||'を削除','description','備品を削除しました');
 elsif kind in ('item','place') then
  name=btrim(coalesce(change->>'name','')); unit=btrim(coalesce(change->>'unit',''));
  if jsonb_typeof(change->'name') is distinct from 'string' or length(name) not between 1 and 30 then
   raise sqlstate 'PT400' using message='名前を30文字以内で入力してください。'; end if;
  if kind='place' then
   if jsonb_array_length(places)>=100 then raise sqlstate 'PT400' using message='場所は100件まで登録できます。'; end if;
   if exists(select 1 from jsonb_array_elements(places) v where normalize(v->>'name',NFKC)=normalize(name,NFKC)) then
    raise sqlstate 'PT400' using message='同じ名前の場所があります。'; end if;
   places=places||jsonb_build_array(jsonb_build_object('id',request_id::text,'name',name));
  else
   if jsonb_typeof(change->'unit') is distinct from 'string' or length(unit) not between 1 and 5 then raise sqlstate 'PT400' using message='単位を5文字以内で入力してください。'; end if;
   if jsonb_array_length(items)>=100 then raise sqlstate 'PT400' using message='備品は100件まで登録できます。'; end if;
   if exists(select 1 from jsonb_array_elements(items) v where normalize(v->>'name',NFKC)=normalize(name,NFKC)) then
    raise sqlstate 'PT400' using message='同じ名前の備品があります。'; end if;
   items=items||jsonb_build_array(jsonb_build_object('id',request_id::text,'name',name,'unit',unit));
  end if;
  detail=jsonb_build_object('type',kind,'title',name||'を追加','description',case when kind='place' then '管理する場所を追加しました' else '管理する備品を追加しました' end);
 else
  select v into item from jsonb_array_elements(items) v where v->>'id'=change->>'item';
  select v into source from jsonb_array_elements(places) v where v->>'id'=change->>'from';
  if item is null or source is null then raise sqlstate 'PT400' using message='備品と場所を選んでください。'; end if;
  if jsonb_typeof(change->'quantity') is distinct from 'number' or coalesce(change->>'quantity','') !~ '^[0-9]{1,5}$' then
   raise sqlstate 'PT400' using message='個数は0〜99,999の整数で入力してください。'; end if;
  quantity=(change->>'quantity')::integer;
  note=btrim(coalesce(change->>'note',''));
  if (change ? 'note' and jsonb_typeof(change->'note') is distinct from 'string') or length(note)>200 then raise sqlstate 'PT400' using message='メモは200文字以内で入力してください。'; end if;
  old_count=coalesce((counts#>>array[source->>'id',item->>'id'])::integer,0);
  unit=item->>'unit';
  if kind='adjust' then
   if length(note)=0 then raise sqlstate 'PT400' using message='変更理由を入力してください。'; end if;
   if quantity=old_count then raise sqlstate 'PT400' using message='現在の個数と同じです。'; end if;
   counts=counts||jsonb_build_object(source->>'id',coalesce(counts->(source->>'id'),'{}'::jsonb)||jsonb_build_object(item->>'id',quantity));
   detail=jsonb_build_object('type',kind,'title',(item->>'name')||'の個数を設定','description',(source->>'name')||'：'||old_count||unit||' → '||quantity||unit||' ／ '||note,'quantity',quantity,'unit',unit);
  else
   select v into destination from jsonb_array_elements(places) v where v->>'id'=change->>'to';
   if destination is null or destination->>'id'=source->>'id' then raise sqlstate 'PT400' using message='移動先には別の場所を選んでください。'; end if;
   if quantity<1 or old_count<quantity then raise sqlstate 'PT400' using message='移動元の個数が不足しているか、移動個数が0です。'; end if;
   target_count=coalesce((counts#>>array[destination->>'id',item->>'id'])::integer,0);
   if target_count+quantity>99999 then raise sqlstate 'PT400' using message='移動先の個数が上限を超えます。'; end if;
   counts=counts||jsonb_build_object(source->>'id',coalesce(counts->(source->>'id'),'{}'::jsonb)||jsonb_build_object(item->>'id',old_count-quantity));
   counts=counts||jsonb_build_object(destination->>'id',coalesce(counts->(destination->>'id'),'{}'::jsonb)||jsonb_build_object(item->>'id',target_count+quantity));
   detail=jsonb_build_object('type',kind,'title',(item->>'name')||'を'||quantity||unit||'移動','description',(source->>'name')||' → '||(destination->>'name')||case when note='' then '' else ' ／ '||note end,'quantity',quantity,'unit',unit);
  end if;
 end if;
 update public.festival_inventory set data=jsonb_build_object('places',places,'items',items,'counts',counts,'targets',targets),revision=revision+1 where id=1;
 insert into public.festival_activity(id,revision,actor_id,actor_name,request,details) values(request_id,state.revision+1,auth.uid(),actor,p_request,detail);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.festival_snapshot() from public,anon;
revoke all on function public.festival_change(jsonb) from public,anon;
grant execute on function public.festival_snapshot() to authenticated;
grant execute on function public.festival_change(jsonb) to authenticated;
commit;
