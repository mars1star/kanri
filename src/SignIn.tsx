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
 return <section className="signin-card">
  <div className="brand-icon"><Boxes size={26}/></div>
  <h2>{configured?'運営メンバーのログイン':'保存先の設定を待っています'}</h2>
  <p>{configured?'利用を許可されたGoogleアカウントでログインしてください。':'管理者による接続設定後に利用できます。'}</p>
  {configured?<>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <button type="button" className="primary submit" onClick={()=>void signIn()} disabled={busy}>{busy?'Googleへ移動しています…':'Googleでログイン'}</button>
   <p className="modal-footnote">学校のアカウントを選んでください。パスワードはGoogleの画面で入力します。</p>
  </>:<a className="small-button" href="./SETUP.html">管理者向けの設定手順を見る</a>}
 </section>;
}
