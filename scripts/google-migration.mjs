// Reuse the tested inventory operations while replacing their authorization checks.
import {readFile,writeFile} from 'node:fs/promises';
const base=(await readFile('supabase/setup.sql','utf8')).replaceAll('\r\n','\n');
let functions=base.slice(base.indexOf('create function public.festival_snapshot()'));
for(const lock of ['', ' for share']) {
 const old=` select * into member from public.festival_members where user_id=auth.uid() and active${lock};\n if not found then raise sqlstate 'PT403' using message='このアカウントはメンバー未登録です。'; end if;`;
 if(!functions.includes(old))throw new Error('Authorization source changed; review migration generation');
 functions=functions.replace(old,' member=public.festival_google_member();');
}
functions=functions.replaceAll('create function public.','create or replace function public.');
const actorSource=` actor=btrim(coalesce(p_request->>'actor',''));
 if jsonb_typeof(p_request->'actor') is distinct from 'string' or length(actor) not between 1 and 40 then
  raise sqlstate 'PT400' using message='担当者名を40文字以内で入力してください。'; end if;`;
const actorReplacement=` if coalesce(auth.jwt()->'amr' @> '[{"method":"oauth"}]'::jsonb,false) then
  actor='Googleログイン利用者';
 elsif coalesce(auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb,false) then
  actor='非常用ログイン利用者';
 else
  raise sqlstate 'PT403' using message='許可された方法でログインし直してください。';
 end if;`;
if(!functions.includes(actorSource))throw new Error('Actor source changed; review forced-name generation');
functions=functions.replace(actorSource,actorReplacement);
const header=await readFile('supabase/google-access-header.sql','utf8');
await writeFile('supabase/google-access.sql',header+'\n'+functions);
const changeStart=functions.indexOf('create or replace function public.festival_change');
const changeEnd=functions.indexOf('\nend $$;',changeStart)+9;
if(changeStart<0||changeEnd<9)throw new Error('Could not extract festival_change');
const forcedActor=functions.slice(changeStart,changeEnd)+`\nrevoke all on function public.festival_change(jsonb) from public,anon;\n`+
 `grant execute on function public.festival_change(jsonb) to authenticated;\n`;
await writeFile('supabase/google-forced-actor.sql',forcedActor);
