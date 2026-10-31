import { useState,type FormEvent } from 'react';
import { Boxes } from 'lucide-react';
import {configured,supabase} from './api';
export default function SignIn({done}:{done:()=>void}) {
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(!supabase||busy)return;setBusy(true);setError('');try{const r=await supabase.auth.signInWithPassword({email:email.trim(),password});if(r.error)throw r.error;setPassword('');done();}catch{setError('ログインできませんでした。メールアドレス・パスワードと通信状態を確認してください。');}finally{setBusy(false);}}
 return <section className="signin-card"><div className="brand-icon"><Boxes size={26}/></div><h2>{configured?'運営メンバーのログイン':'保存先の設定を待っています'}</h2><p>{configured?'登録されたメンバーだけが、備品の個数と移動履歴を確認・更新できます。':'画面ファイルの準備はできています。Supabaseへの接続が完了すると、チームで使えるようになります。'}</p>{configured?<form onSubmit={submit}><label>メールアドレス<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>パスワード<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary submit" disabled={busy}>{busy?'確認しています…':'ログインする'}</button><p className="modal-footnote">アカウントの発行やパスワードの再設定は運営管理者へ。</p></form>:<a className="small-button" href="./SETUP.html">管理者向けの設定手順を見る</a>}</section>;
}
