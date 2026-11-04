import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Google allowlist protects both inventory RPCs',async t=>{
 const db=new PGlite();
 const uid='00000000-0000-4000-8000-000000000001';
 const email='allowed@example.invalid';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text);
 create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 insert into auth.users values('${uid}','${email}');`);
 await db.exec(await readFile('supabase/setup.sql','utf8'));
 // A legacy member must not bypass Google authentication after migration.
 await db.exec(`insert into public.festival_members values('${uid}','旧メンバー',true);`);
 await db.exec(await readFile('supabase/google-access.sql','utf8'));
 await db.query('insert into public.festival_google_allowlist values($1,$2,true)',[email,'運営メンバー']);
 const claims=async(method='oauth',address=email,user=uid)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email:address,amr:[{method}],user_metadata:{email,email_verified:true,provider:'google'}})]);
 };
 const identity=async(provider='google',verified=true,address=email)=>{
  await db.exec('reset role;delete from auth.identities');
  await db.query('insert into auth.identities values($1,$2,$3)',[uid,provider,JSON.stringify({email:address,email_verified:verified,full_name:'Google 本名'})]);
  await db.exec('set role authenticated');
 };
 const read=async()=> (await db.query('select public.festival_snapshot() as value')).rows[0].value;
 const body={id:crypto.randomUUID(),revision:0,actor:'書き換えた偽名',change:{type:'adjust',item:'desk',from:'storage',quantity:2,note:'初期登録'}};
 const write=async()=>db.query('select public.festival_change($1::jsonb)',[JSON.stringify(body)]);
 const denied=async()=>{await assert.rejects(read,{code:'PT403'});await assert.rejects(write,{code:'PT403'});};
 await t.test('未ログインは拒否',async()=>{
  await assert.rejects(read,{code:'PT401'});
 });
 await t.test('自己申告メタデータでは許可されない',async()=>{
  await claims();await db.exec('set role authenticated');await denied();
 });
 await t.test('他社のidentity、未確認メール、別メールは拒否',async()=>{
  await identity('github');await denied();
  await identity('google',false);await denied();
  await identity('google',true,'other@example.invalid');await denied();
 });
 await t.test('旧メンバーとGoogle連携済みでもpassword/OTP/recoveryは拒否',async()=>{
  await identity();
  for(const method of ['password','otp','recovery']){await claims(method);await denied();}
 });
 await t.test('許可アドレスの確認済みGoogle identityとOAuthセッションで保存できる',async()=>{
  await claims();const state=await read();assert.equal(state.user.name,'運営メンバー');
  await write();const updated=await read();assert.equal(updated.data.counts.storage.desk,2);assert.equal(updated.history[0].actor,'運営メンバー');
 });
 await t.test('別メールのセッションは連携済みGoogle identityを借用できない',async()=>{
  await claims('oauth','other@example.invalid');await denied();
 });
 await t.test('allowlist直接読取・自己追加・認証補助関数の直接実行を拒否',async()=>{
  await claims();
  for(const sql of ['select * from public.festival_google_allowlist',"insert into public.festival_google_allowlist values('x@example.invalid','x',true)",'select public.festival_google_member()'])await assert.rejects(()=>db.query(sql),{code:'42501'});
 });
 await t.test('allowlistの無効化で既存セッションも直ちに拒否',async()=>{
  await db.exec('reset role;update public.festival_google_allowlist set active=false;set role authenticated');await denied();
 });
 await db.exec('reset role');
 await db.exec(await readFile('supabase/emergency-access.sql','utf8'));
 await db.exec(await readFile('supabase/presence.sql','utf8'));
 await t.test('Googleプロフィールの本名を表示名に使う',async()=>{
  await db.exec('update public.festival_google_allowlist set active=true');
  await claims();await identity();assert.equal((await read()).user.name,'Google 本名');
 });
 await t.test('非常用パスワードアカウントだけを許可',async()=>{
  await claims('password','festival-emergency@seiko.ac.jp');await db.exec('set role authenticated');
  assert.equal((await read()).user.name,'非常用アカウント');
  const emergencyBody={id:crypto.randomUUID(),revision:1,actor:'非常時の入力名',change:{type:'adjust',item:'desk',from:'storage',quantity:3,note:'非常用テスト'}};
  await db.query('select public.festival_change($1::jsonb)',[JSON.stringify(emergencyBody)]);
  assert.equal((await read()).history[0].actor,'非常時の入力名（非常用）');
  await claims('password','other@example.invalid');await denied();
  await claims('otp','festival-emergency@seiko.ac.jp');await denied();
 });
 await t.test('非常用allowlistの直接読取を拒否',async()=>{
  await assert.rejects(()=>db.query('select * from public.festival_emergency_allowlist'),{code:'42501'});
 });
 await t.test('ログイン中の利用者だけを安全に表示',async()=>{
  await claims();await identity();
  const online=(await db.query('select public.festival_presence() as value')).rows[0].value;
  assert.equal(online.length,1);assert.equal(online[0].name,'Google 本名');assert.equal(online[0].method,'google');
  await assert.rejects(()=>db.query('select * from public.festival_presence_state'),{code:'42501'});
 });
 await t.test('2日を過ぎた履歴は画面更新時に自動削除',async()=>{
  await claims();await identity();
  await db.exec('reset role');
  await db.query("update public.festival_activity set created_at=now()-interval '3 days' where revision=(select min(revision) from public.festival_activity)");
  await db.exec('set role authenticated');
  await read();
  await db.exec('reset role');
  const old=(await db.query("select count(*)::int as count from public.festival_activity where created_at < now()-interval '2 days'")).rows[0].count;
  assert.equal(old,0);
  await db.exec('set role authenticated');
 });
 await t.test('目標数を保存し、確認後は個数が残る場所も安全に削除',async()=>{
  await claims();await identity();
  let state=await read();
  const change=async body=>db.query('select public.festival_change($1::jsonb)',[JSON.stringify({id:crypto.randomUUID(),revision:state.revision,actor:'偽名',change:body})]);
  await change({type:'place_floor',from:'gym',floor:'2F'}); state=await read(); assert.equal(state.data.places.find(p=>p.id==='gym').floor,'2F');
  await assert.rejects(change({type:'place_floor',from:'gym',floor:'5F'}),{code:'PT400'});
  const firstPlace=state.data.places[0].id, secondPlace=state.data.places[1].id;
  await change({type:'reorder_place',from:firstPlace,to:secondPlace}); state=await read(); assert.deepEqual(state.data.places.slice(0,2).map(p=>p.id),[secondPlace,firstPlace]);
  const firstItem=state.data.items[0].id, secondItem=state.data.items[1].id;
  await change({type:'reorder_item',from:firstItem,to:secondItem}); state=await read(); assert.deepEqual(state.data.items.slice(0,2).map(i=>i.id),[secondItem,firstItem]);
  await change({type:'batch',operation:'adjust',from:'gym',entries:[{item:'chair',quantity:12},{item:'tent',quantity:4}],note:'一括設定'}); state=await read(); assert.equal(state.data.counts.gym.chair,12);assert.equal(state.data.counts.gym.tent,4);
  await change({type:'batch',operation:'transfer',from:'gym',to:'classroom',entries:[{item:'chair',quantity:5},{item:'tent',quantity:2}],note:'一括移動'}); state=await read(); assert.equal(state.data.counts.gym.chair,7);assert.equal(state.data.counts.classroom.chair,5);assert.equal(state.data.counts.gym.tent,2);assert.equal(state.data.counts.classroom.tent,2);
  await change({type:'bulk_add',category:'place',additions:[{name:'音楽室'},{name:'図書室'}]}); state=await read(); assert.equal(state.data.places.some(p=>p.name==='音楽室'),true);assert.equal(state.data.places.some(p=>p.name==='図書室'),true);
  await change({type:'bulk_add',category:'item',additions:[{name:'看板',unit:'枚'},{name:'台車',unit:'台'}]}); state=await read(); assert.equal(state.data.items.find(i=>i.name==='看板').unit,'枚');assert.equal(state.data.items.find(i=>i.name==='台車').unit,'台');
  await change({type:'targets',targets:{storage:{desk:5,chair:10},gym:{desk:2},classroom:{}}}); state=await read(); assert.equal(state.data.targets.storage.desk,5);assert.equal(state.data.targets.gym.desk,2);
  await assert.rejects(change({type:'delete_item',item:'desk'}),{code:'PT400'});
  await change({type:'adjust',item:'desk',from:'storage',quantity:0,note:'削除前確認'}); state=await read();
  await change({type:'delete_item',item:'desk'}); state=await read(); assert.equal(state.data.items.some(i=>i.id==='desk'),false); assert.equal(state.data.targets.storage.desk,undefined);
  await change({type:'adjust',item:'chair',from:'storage',quantity:54321,note:'場所削除の確認'}); state=await read();
  await change({type:'delete_place',from:'storage'}); state=await read(); assert.equal(state.data.places.some(p=>p.id==='storage'),false); assert.equal(state.data.counts.storage,undefined);
 });
 await db.close();
});
