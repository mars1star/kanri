import { createClient } from '@supabase/supabase-js';
declare global { interface Window { FESTIVAL_CONFIG?: {supabaseUrl?:string;supabasePublishableKey?:string} } }
const config=window.FESTIVAL_CONFIG || {};
const url=config.supabaseUrl || '';
const key=config.supabasePublishableKey || '';
let keyAllowed=key.startsWith('sb_publishable_');
if(key.startsWith('eyJ')) { try { keyAllowed=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon'; } catch {} }
export const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && keyAllowed;
export const supabase=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}}):null;
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function inventoryRequest(body?:unknown) {
  if(!supabase) throw new ApiError('保存先が未設定です。管理者の初期設定後に利用できます。',503);
  const session=await supabase.auth.getSession();
  if(!session.data.session) throw new ApiError('ログインしてください。',401);
  const rpc=body ? supabase.rpc('festival_change',{p_request:body}) : supabase.rpc('festival_snapshot');
  const {data,error,status}=await rpc.abortSignal(AbortSignal.timeout(20000));
  if(error) {
    const code=error.code?.startsWith('PT')?Number(error.code.slice(2)):status;
    const message=code===401?'ログインの有効期限が切れました。もう一度ログインしてください。':code===403?'このアカウントでは利用できません。許可されたアカウントでログインし直してください。':(code>=500||!code)?'保存先に接続できません。時間をおいて再試行してください。':error.message;
    throw new ApiError(message,code||503);
  }
  return data;
}
