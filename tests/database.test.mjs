import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Supabase schema and access rules on PostgreSQL',async t=>{
 const db=new PGlite();
 const user='00000000-0000-4000-8000-000000000001';
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${user}','test@example.invalid');`);
 await db.exec(await readFile('supabase/setup.sql','utf8'));
 await db.exec(`insert into public.festival_members values('${user}','テスト担当',true);`);
 const who=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const read=async()=> (await db.query('select public.festival_snapshot() as value')).rows[0].value;
 const write=async body=> (await db.query('select public.festival_change($1::jsonb) as value',[JSON.stringify(body)])).rows[0].value;
 const request=(revision,change,id=crypto.randomUUID())=>({id,revision,actor:'テスト担当',change});
 await t.test('未ログインと非メンバーのアクセスを拒否',async()=>{
  await assert.rejects(read,{code:'PT401'});
  await who('00000000-0000-4000-8000-000000000099');await assert.rejects(read,{code:'PT403'});
  await who(user);await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from public.festival_inventory'),{code:'42501'});
  await assert.rejects(()=>db.query('select * from public.festival_members'),{code:'42501'});
  const result=await read();assert.equal(result.revision,0);
  await db.exec('reset role');
 });
 await t.test('初期登録・移動・重複再送・履歴の原子性',async()=>{
  await write(request(0,{type:'adjust',item:'desk',from:'storage',quantity:20,note:'初期登録'}));
  const move=request(1,{type:'transfer',item:'desk',from:'storage',to:'gym',quantity:5});
  assert.equal((await write(move)).ok,true);assert.equal((await write(move)).repeated,true);
  const state=await read();assert.equal(state.revision,2);assert.equal(state.data.counts.storage.desk,15);assert.equal(state.data.counts.gym.desk,5);assert.equal(state.history.length,2);
  await assert.rejects(()=>write({...move,change:{...move.change,quantity:6}}),{code:'PT409'});
 });
 await t.test('同じリビジョンの2操作では1件のみ反映',async()=>{
  const results=await Promise.allSettled([1,2].map(()=>write(request(2,{type:'transfer',item:'desk',from:'storage',to:'gym',quantity:1}))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409');
  const state=await read();assert.equal(state.revision,3);assert.equal(state.data.counts.storage.desk,14);assert.equal(state.data.counts.gym.desk,6);
 });
 await t.test('不足・負数・小数・同じ場所を拒否',async()=>{
  for(const quantity of [-1,0,1.5,99999,'1',null]) await assert.rejects(()=>write(request(3,{type:'transfer',item:'desk',from:'storage',to:'gym',quantity})),{code:'PT400'});
  await assert.rejects(()=>write(request(3,{type:'transfer',item:'desk',from:'storage',to:'storage',quantity:1})),{code:'PT400'});
  assert.equal((await read()).revision,3);
 });
 await t.test('場所と備品の追加・メンバー無効化',async()=>{
  await write(request(3,{type:'place',name:'中庭'}));
  await assert.rejects(()=>write(request(4,{type:'place',name:'中庭'})),{code:'PT400'});
  await write(request(4,{type:'item',name:'長机',unit:'台'}));
  const state=await read();assert.equal(state.data.places.length,4);assert.equal(state.data.items.length,4);
  await db.exec('update public.festival_members set active=false');
  await assert.rejects(read,{code:'PT403'});
  await assert.rejects(()=>write(request(5,{type:'place',name:'昇降口'})),{code:'PT403'});
 });
 await db.close();
});
