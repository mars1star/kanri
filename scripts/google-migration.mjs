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
const header=await readFile('supabase/google-access-header.sql','utf8');
await writeFile('supabase/google-access.sql',header+'\n'+functions);
