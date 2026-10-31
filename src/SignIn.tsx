import { useState } from 'react';
import { Boxes } from 'lucide-react';
import {configured,supabase} from './api';
export default function SignIn() {
 const [error,setError]=useState(() => {
  const query=new URLSearchParams(window.location.search);
  const hash=new URLSearchParams(window.location.hash.slice(1));
  return query.has('error')||hash.has('error')?'Googleログインを完了できませんでした。許可されたアカウントでもう一度お試しください。':'';
 });
 const [busy,setBusy]=useState(false);
 const [emergency,setEmergency]=useState(false);
 const [emergencyId,setEmergencyId]=useState('');
 const [password,setPassword]=useState('');
 async function signIn(){
  if(!supabase||busy)return;
  setBusy(true);setError('');
  try {
   const redirectTo=new URL('./',window.location.href).href;
   const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,queryParams:{prompt:'select_account'}}});
   if(error)throw error;
  } catch {
   setError('Googleログインを開始できませんでした。通信状態を確認し、解決しない場合は運営管理者に連絡してください。');
   setBusy(false);
  }
 }
 async function emergencySignIn(event:React.FormEvent){
  event.preventDefault();
  if(!supabase||busy)return;
  if(emergencyId.trim().toLowerCase()!=='emergency'){
   setError('非常用IDまたはパスワードが違います。');return;
  }
  setBusy(true);setError('');
  const {error}=await supabase.auth.signInWithPassword({email:'festival-emergency@seiko.ac.jp',password});
  if(error){setError('非常用IDまたはパスワードが違います。');setBusy(false);}
 }
 return <section className="signin-card">
  <div className="brand-icon"><Boxes size={26}/></div>
  <h2>{configured?'運営メンバーのログイン':'保存先の設定を待っています'}</h2>
  <p>{configured?'利用を許可されたGoogleアカウントでログインしてください。':'管理者による接続設定後に利用できます。'}</p>
  {configured?<>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <button type="button" className="primary submit" onClick={()=>void signIn()} disabled={busy}>{busy?'Googleへ移動しています…':'Googleでログイン'}</button>
   <p className="modal-footnote">学校のアカウントを選んでください。パスワードはGoogleの画面で入力します。</p>
   <div className="signin-divider"><span>非常時のみ</span></div>
   {!emergency?<button type="button" className="small-button emergency-toggle" onClick={()=>setEmergency(true)}>IDとパスワードでログイン</button>:
   <form className="emergency-form" onSubmit={emergencySignIn}>
    <label>非常用ID<input value={emergencyId} onChange={e=>setEmergencyId(e.target.value)} autoComplete="username" required/></label>
    <label>パスワード<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
    <button className="primary submit" disabled={busy}>{busy?'確認しています…':'非常用アカウントでログイン'}</button>
    <button type="button" className="text-button emergency-cancel" onClick={()=>{setEmergency(false);setError('');}}>戻る</button>
   </form>}
  </>:<a className="small-button" href="./SETUP.html">管理者向けの設定手順を見る</a>}
 </section>;
}
