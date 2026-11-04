"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, Boxes, Check, ChevronLeft, ChevronRight, Clock3, ClipboardList, LayoutGrid, MapPin, Package, Plus, RefreshCw, Search, Settings2, Target, Trash2, UserCircle, Users, X } from "lucide-react";
import { countAt, type Change, type Detail, type Floor, type Inventory } from "./inventory";
import { ApiError, configured, inventoryRequest, presenceRequest, supabase } from './api';
import SignIn from './SignIn';

type Snapshot = { data: Inventory; revision: number; history: { id: string; actor: string; detail: Detail; at: string }[]; user: { name: string; email: string } };
type OnlineUser = { id: string; name: string; method: string; seenAt: string };
type Mode = "transfer" | "adjust" | "place" | "item" | "target" | "targets";
type RequestBody = { id: string; revision: number; actor: string; change: Change };
const formatTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(value));

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState("inventory");
  const [query, setQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [settingsPlaceQuery, setSettingsPlaceQuery] = useState("");
  const [settingsItemQuery, setSettingsItemQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState<"all"|Floor>("all");
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const authEpoch = useRef(0);
  const [updated, setUpdated] = useState("");
  const [toast, setToast] = useState("");
  const [actor, setActor] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [item, setItem] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("個");
  const [floor, setFloor] = useState<Floor>("1F");
  const [overviewItem, setOverviewItem] = useState("");
  const [targetDraft, setTargetDraft] = useState<Record<string,Record<string,number>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<RequestBody | null>(null);
  const formRevision = useRef<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const summaryCarousel = useRef<HTMLElement>(null);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current || !configured) return;
    refreshing.current = true;
    const epoch = authEpoch.current;
    try {
      const result = await inventoryRequest() as Snapshot;
      if(epoch !== authEpoch.current) return;
      setSnapshot(old => !old || result.revision >= old.revision ? result : old);
      try { setOnlineUsers(await presenceRequest() as OnlineUser[]); } catch {}
      if(result.user.name!=='非常用アカウント'){
        setActor(result.user.name);
        try { localStorage.setItem('festival-actor',result.user.name); } catch {}
      }
      setLogin(false); setError(""); setUpdated(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }));
    } catch (e) { if(epoch !== authEpoch.current)return; if(e instanceof ApiError && e.status===401){setLogin(true);setSignedIn(false);setSnapshot(null);setMode(null);setError('');} else {if(e instanceof ApiError && e.status===403){setSnapshot(null);setMode(null);}setError(e instanceof Error ? e.message : "接続できません。再読み込みしてください。");} }
    finally { refreshing.current = false; }
  }, []);
  useEffect(() => {
    try { setActor(localStorage.getItem("festival-actor") || ""); } catch {}
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refresh]);
  useEffect(() => {
    if(!supabase)return;
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      setSignedIn(!!session);setLogin(!session);setGoogleUser(session?.user.app_metadata?.provider==='google');
      if(!session){authEpoch.current++;setSnapshot(null);setOnlineUsers([]);setMode(null);setError('');setGoogleUser(false);}
      else if(event==='SIGNED_IN')setTimeout(()=>void refresh(),0);
    });
    return ()=>data.subscription.unsubscribe();
  },[refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (mode) dialog.current?.showModal(); else dialog.current?.close(); }, [mode]);
  function open(next: Mode, place?: string, itemId?: string) {
    if (!snapshot) return;
    formRevision.current = snapshot.revision;
    const selectedFrom = place || snapshot.data.places[0]?.id || "";
    const selectedItem = itemId || snapshot.data.items[0]?.id || "";
    setFrom(selectedFrom); setItem(selectedItem);
    setTo(snapshot.data.places.find(p => p.id !== selectedFrom)?.id || "");
    setQuantity(next === "adjust" ? String(countAt(snapshot.data, selectedFrom, selectedItem)) : next === "target" ? String(snapshot.data.targets?.[selectedFrom]?.[selectedItem] ?? 0) : "1");
    if(next==="targets") setTargetDraft(structuredClone(snapshot.data.targets||{}));
    setNote(""); setName(""); setUnit("個"); setFloor("1F"); setFormError(""); setUncertain(false); pending.current = null; setMode(next);
  }
  function close() { if (!busy && !uncertain) setMode(null); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snapshot || !mode || busy) return;
    setBusy(true); setFormError("");
    const change: Change = mode === "place" ? { type: mode, name, floor } : mode === "item" ? { type: mode, name, unit } : mode === "targets" ? { type: mode, targets: targetDraft } : mode === "target" ? { type: mode, item, from, quantity: Number(quantity) } : { type: mode, item, from, to, quantity: Number(quantity), note };
    // The server ignores this value for Google sessions and derives the verified Google profile name itself.
    const body = pending.current || { id: crypto.randomUUID(), revision: formRevision.current ?? snapshot.revision, actor: actor.trim(), change };
    pending.current = body;
    try {
      await inventoryRequest(body);
      try { localStorage.setItem("festival-actor", actor.trim()); } catch {}
      pending.current = null; setUncertain(false); setMode(null);
      setToast("登録しました。履歴にも記録されています。");
      await refresh();
    } catch (e) {
      if(e instanceof ApiError && e.status<500){pending.current=null;setUncertain(false);}
      if(e instanceof ApiError && e.status===409){formRevision.current=null;await refresh();}
      if(e instanceof ApiError && e.status===401){setLogin(true);setSnapshot(null);setMode(null);}
      if (pending.current) setUncertain(true);
      setFormError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "通信が途切れました。同じ内容で再送して結果を確認してください。");
    } finally { setBusy(false); }
  }
  async function quickChange(change: Change, message: string) {
    if (!snapshot || busy) return;
    setBusy(true); setError("");
    try {
      await inventoryRequest({ id: crypto.randomUUID(), revision: snapshot.revision, actor: actor.trim(), change });
      setToast(message); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  function exportCSV() {
    if (!snapshot) return;
    const cell = (v: unknown) => '"' + String(v).replace(/^[=+@\-\t\r]/, m => "'" + m).replaceAll('"', '""') + '"';
    const rows = [["階", "場所", "備品", "個数", "単位"], ...snapshot.data.places.flatMap(p => snapshot.data.items.map(i => [p.floor||"未設定", p.name, i.name, countAt(snapshot.data, p.id, i.id), i.unit]))];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "文化祭_備品一覧.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const data = snapshot?.data;
  const selectedItem = data?.items.find(i => i.id === item);
  const available = data ? countAt(data, from, item) : 0;
  const visiblePlaces = data?.places.filter(p => (floorFilter === "all" || p.floor === floorFilter) && (filter === "all" || filter === p.id) && (p.name.includes(query) || data.items.some(i => i.name.includes(query)))) || [];
  const itemsFor = (placeName: string) => data?.items.filter(i => !query || i.name.includes(query) || placeName.includes(query)) || [];
  const totalFor = (itemId: string) => data?.places.reduce((sum, p) => sum + countAt(data, p.id, itemId), 0) || 0;
  const targetAt = (placeId: string, itemId: string) => data?.targets?.[placeId]?.[itemId] ?? 0;
  const totalTargetFor = (itemId: string) => data?.places.reduce((sum,p)=>sum+targetAt(p.id,itemId),0)||0;
  const differenceFor = (itemId: string) => totalFor(itemId) - totalTargetFor(itemId);
  const overview = data?.items.find(i => i.id === overviewItem);
  return <div className="shell">
    <aside className="sidebar">
      <a href="./" className="brand"><span className="brand-icon"><Boxes size={24}/></span><span>管理システム<small>文化祭 備品管理</small></span></a>
      <div className="workspace-tag"><span className="tiny-dot"/> CULTURE FESTIVAL <span className="tag">運営</span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="メインメニュー">
        <button className={tab === "inventory" ? "selected" : ""} onClick={() => setTab("inventory")}><LayoutGrid size={19}/>備品のいま<ChevronRight size={15}/></button>
        <button className={tab === "history" ? "selected" : ""} onClick={() => setTab("history")}><Clock3 size={19}/>移動・変更の履歴</button>
        <button className={tab === "settings" ? "selected" : ""} onClick={() => setTab("settings")}><Settings2 size={19}/>場所と備品の設定</button>
        <button className={tab === "online" ? "selected" : ""} onClick={() => setTab("online")}><Users size={19}/>ログイン中{onlineUsers.length>0&&<span className="online-count">{onlineUsers.length}</span>}</button>
        <button className={tab === "profile" ? "selected" : ""} onClick={() => setTab("profile")}><UserCircle size={19}/>プロフィール</button>
      </nav>
      <div className="sidebar-bottom"><span className="avatar">祭</span><span>管理システム</span></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><span><b>{tab === "inventory" ? "備品" : tab === "history" ? "履歴" : tab === "settings" ? "設定" : tab === "online" ? "ログイン中" : "プロフィール"}</b></span><div className={`sync ${error ? "offline" : ""}`}><i/>{error ? "接続エラー" : snapshot ? "同期中" : "ログイン前"}</div>{signedIn && <button className="profile-shortcut" onClick={() => setTab("profile")}><UserCircle size={18}/>{snapshot?.user.name}</button>}</header>
      <main>
        <div className="page-heading"><div><h1>{tab === "inventory" ? "備品管理" : tab === "history" ? "変更履歴" : tab === "settings" ? "場所・備品の設定" : tab === "online" ? "ログイン中の利用者" : "プロフィール"}</h1></div>{tab === "inventory" && <div className="main-actions"><button className="small-button initial-count-button" onClick={() => open("adjust")} disabled={!data}><ClipboardList size={18}/>初期個数を登録</button><button className="primary main-action" onClick={() => open("transfer")} disabled={!data}><ArrowLeftRight size={18}/>移動を記録</button></div>}</div>
        {error && <div className="error-banner" role="alert"><span>{error}{snapshot && " 表示中の個数は最新でない可能性があります。"}</span><button className="small-button" onClick={() => void refresh()}>再読み込み</button></div>}
        {(!configured || login) && <SignIn/>}{configured && !data && !error && !login && <div className="loading">備品の情報を読み込んでいます…</div>}
        {data && tab === "inventory" && <>
          <div className="section-heading item-summary-heading"><h2>備品の合計</h2><div className="summary-tools"><button onClick={()=>summaryCarousel.current?.scrollBy({left:-summaryCarousel.current.clientWidth,behavior:'smooth'})} aria-label="前の備品"><ChevronLeft/></button><button onClick={()=>summaryCarousel.current?.scrollBy({left:summaryCarousel.current.clientWidth,behavior:'smooth'})} aria-label="次の備品"><ChevronRight/></button><label className="search compact-search"><Search size={17}/><input aria-label="備品を検索" value={itemQuery} onChange={e=>setItemQuery(e.target.value)} placeholder="備品を検索"/></label></div></div>
          <section className="summary" aria-label="備品の合計" ref={summaryCarousel}>
            {data.items.filter(i=>i.name.includes(itemQuery)).map((i, n) => { const diff=differenceFor(i.id), target=totalTargetFor(i.id); return <button className={`stat stat-${n%3}`} key={i.id} onClick={() => setOverviewItem(i.id)}><div className="stat-top"><span>{i.name}</span><Package size={19}/></div><div className="stat-number">{totalFor(i.id).toLocaleString()}<small>{i.unit}</small></div><div className="target-line"><span className="summary-target">目標 <strong>{target}</strong>{i.unit}</span>{target>0&&<b className={`difference ${diff>0?'over':diff<0?'short':'just'}`}>{diff!==0&&<strong>{diff>0?`+${diff}`:`-${Math.abs(diff)}`}</strong>}<small>{diff>0?'超過':diff<0?'不足':'達成'}</small></b>}</div></button>})}
            <button className="stat places-stat" onClick={() => setTab("settings")}><div className="stat-top"><span>場所</span><MapPin size={19}/></div><div className="stat-number">{data.places.length}<small>か所</small></div><div className="target-line">設定を開く <ArrowRight size={15}/></div></button>
          </section>
          {snapshot?.revision === 0 && <div className="setup-banner"><span className="setup-icon"><ClipboardList size={23}/></span><div><strong>最初に、いまある個数を登録しましょう。</strong><p>場所と備品は仮の名前です。設定から追加でき、個数は各カードの「個数を設定」から登録できます。</p></div><button className="small-button" onClick={() => open("adjust")}>はじめる <ArrowRight size={15}/></button></div>}
          <section className="inventory-section"><div className="section-heading"><h2>場所ごとの備品 <span>{data.places.length}</span></h2><div className="carousel-controls"><button onClick={()=>carousel.current?.scrollBy({left:-carousel.current.clientWidth,behavior:'smooth'})} aria-label="前の場所"><ChevronLeft/></button><button onClick={()=>carousel.current?.scrollBy({left:carousel.current.clientWidth,behavior:'smooth'})} aria-label="次の場所"><ChevronRight/></button><button className="text-button export" onClick={exportCSV}><ArrowDownToLine size={16}/>CSV</button></div></div>
            <div className="floor-tabs" aria-label="階で絞り込み">{(["all","1F","2F","3F","4F"] as const).map(value=><button key={value} className={floorFilter===value?'selected':''} onClick={()=>setFloorFilter(value)}>{value==='all'?'すべて':value}</button>)}</div>
            <div className="toolbar"><label className="search"><Search size={18}/><input aria-label="場所や備品を検索" value={query} onChange={e => setQuery(e.target.value)} placeholder="場所や備品を検索"/>{query && <button aria-label="検索をクリア" onClick={() => setQuery("")}><X size={16}/></button>}</label><select aria-label="場所で絞り込み" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">すべての場所</option>{data.places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" onClick={() => void refresh()} aria-label="最新の情報に更新"><RefreshCw size={17}/></button></div>
            <div className="location-grid" ref={carousel}>{visiblePlaces.map((p, index) => <article className="location-card" key={p.id}><div className="location-header"><span className="place-icon"><MapPin size={20}/></span><div><span className="floor-badge">{p.floor||"未設定"}</span><h3>{p.name}</h3></div><span className="place-number">{index+1}</span></div><div className="stock-list">{itemsFor(p.name).map(i => {const current=countAt(data,p.id,i.id),target=targetAt(p.id,i.id),diff=current-target;return <button className="stock-row" key={i.id} onClick={()=>setOverviewItem(i.id)}><span>{i.name}</span><span className="stock-count"><b>{current.toLocaleString()}<small>{i.unit}</small></b><span className="inline-target">目標 <strong>{target}</strong>{i.unit}</span>{target>0&&<em className={diff>0?'over':diff<0?'short':'just'}>{diff!==0&&<strong>{diff>0?`+${diff}`:`-${Math.abs(diff)}`}</strong>}<small>{diff>0?'超過':diff<0?'不足':'達成'}</small></em>}</span></button>})}</div><div className="location-actions"><button onClick={() => open("adjust", p.id)}>個数設定</button><button onClick={() => open("transfer", p.id)}>移動 <ArrowRight size={15}/></button></div></article>)}</div>
            {visiblePlaces.length === 0 && <div className="empty"><Search size={30}/><h3>一致する場所・備品がありません</h3><p>検索キーワードや絞り込みを変えてみてください。</p></div>}
            <div className="inventory-foot"><span><span className="tiny-dot"/> 数字は各場所の現在の個数です</span><span>最終取得 {updated}（日本時間）</span></div>
          </section>
          <section className="history-preview"><div className="section-heading"><h2>最近の記録</h2><button className="text-button" onClick={() => setTab("history")}>すべて見る <ArrowRight size={15}/></button></div><History entries={snapshot!.history.slice(0, 3)}/></section>
        </>}
        {data && tab === "history" && <section className="history-full"><div className="section-heading"><h2>チームの活動記録</h2><span className="muted">最新100件を表示</span></div><History entries={snapshot!.history}/></section>}
        {data && tab === "settings" && <section className="floor-settings"><div className="section-heading"><h2><MapPin size={20}/>場所の階を設定</h2><span className="muted">1F〜4Fから選択</span></div><div className="floor-setting-list">{data.places.map(p=><label key={p.id}><span>{p.name}</span><select aria-label={`${p.name}の階`} value={p.floor||""} disabled={busy} onChange={e=>void quickChange({type:'place_floor',from:p.id,floor:e.target.value as Floor|""},`${p.name}の階を設定しました。`)}><option value="">未設定</option><option>1F</option><option>2F</option><option>3F</option><option>4F</option></select></label>)}</div></section>}
        {data && tab === "settings" && <div className="settings-grid"><section className="settings-panel"><div className="section-heading"><h2><MapPin size={20}/>管理する場所</h2><button className="small-button" onClick={() => open("place")}><Plus size={16}/>追加</button></div><label className="search settings-search"><Search size={16}/><input value={settingsPlaceQuery} onChange={e=>setSettingsPlaceQuery(e.target.value)} placeholder="場所を検索"/></label><div className="settings-list">{data.places.filter(p=>p.name.includes(settingsPlaceQuery)).map(p => <div className="setting-row" key={p.id}><span>{p.name}</span><button className="danger-icon" disabled={busy} onClick={()=>{if(confirm(`${p.name}を削除しますか？`))void quickChange({type:'delete_place',from:p.id},'場所を削除しました。')}} aria-label={`${p.name}を削除`}><Trash2 size={17}/></button></div>)}</div></section><section className="settings-panel"><div className="section-heading"><h2><Package size={20}/>管理する備品</h2><span className="setting-head-actions"><button className="small-button" onClick={()=>open('targets')}><Target size={16}/>目標をまとめて設定</button><button className="small-button" onClick={() => open("item")}><Plus size={16}/>追加</button></span></div><label className="search settings-search"><Search size={16}/><input value={settingsItemQuery} onChange={e=>setSettingsItemQuery(e.target.value)} placeholder="備品を検索"/></label><div className="settings-list">{data.items.filter(i=>i.name.includes(settingsItemQuery)).map(i => <div className="setting-row" key={i.id}><span><b>{i.name}</b><small>{i.unit}</small></span><span className="setting-actions"><button onClick={()=>open('target',data.places[0]?.id,i.id)}><Target size={16}/>目標</button><button className="danger-icon" disabled={busy} onClick={()=>{if(confirm(`${i.name}を削除しますか？`))void quickChange({type:'delete_item',item:i.id},'備品を削除しました。')}} aria-label={`${i.name}を削除`}><Trash2 size={17}/></button></span></div>)}</div></section></div>}
        {data && tab === "online" && <section className="online-panel"><div className="online-summary"><span className="online-pulse"/><strong>{onlineUsers.length}人がログイン中</strong><button className="small-button" onClick={()=>void refresh()}><RefreshCw size={16}/>更新</button></div><div className="online-list">{onlineUsers.map(user=><div className="online-user" key={user.id}><span className="online-avatar"><UserCircle size={24}/></span><div><strong>{user.name}</strong><p>{user.method==='google'?'Google学校アカウント':'非常用アカウント'}</p></div><time dateTime={user.seenAt}>オンライン</time></div>)}</div><p className="online-note">画面を閉じた利用者は約2分後に一覧から消えます。</p></section>}
        {data && tab === "profile" && <section className="profile-card"><span className="profile-avatar"><UserCircle size={42}/></span><div><h2>{snapshot?.user.name}</h2><p>{googleUser?'Google学校アカウント':'非常用アカウント'}</p></div><dl><div><dt>権限</dt><dd>在庫の閲覧・更新</dd></div><div><dt>最終同期</dt><dd>{updated||'確認中'}</dd></div></dl><button className="danger-outline" onClick={async()=>{const r=await supabase?.auth.signOut({scope:'local'});if(r?.error)setError('ログアウトできませんでした。');}}>ログアウト</button></section>}
        <footer>管理システム</footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={19}/>{toast}</div>}
    <dialog ref={dialog} className={mode==='targets'?'target-dialog':''} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {mode && data && <form onSubmit={submit} className={`modal-content ${mode==='targets'?'target-fullscreen':''}`}><div className="modal-heading"><span className="modal-icon">{mode === "transfer" ? <ArrowLeftRight/> : mode === "target"||mode==='targets' ? <Target/> : mode === "adjust" ? <ClipboardList/> : <Plus/>}</span><button type="button" className="icon-button" aria-label="閉じる" disabled={busy || uncertain} onClick={close}><X size={20}/></button></div><h2>{mode === "transfer" ? "移動を記録" : mode === "adjust" ? "個数を設定" : mode === "targets" ? "目標数をまとめて設定" : mode === "target" ? "目標数を設定" : mode === "place" ? "場所を追加" : "備品を追加"}</h2>
      <fieldset disabled={busy || uncertain}>
        <label>履歴に表示する名前<span className="required">必須</span><input value={actor} onChange={e => setActor(e.target.value)} placeholder="例：2年A組 山田" required maxLength={40} autoComplete="name" readOnly={googleUser}/><small className="locked-name">{googleUser ? "Googleアカウントの氏名を使用します（変更不可）" : "非常用ログインとして履歴に記録されます"}</small></label>
        {(mode === "item" || mode === "place") ? <><label>{mode === "place" ? "場所の名前" : "備品の名前"}<input autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder={mode === "place" ? "例：2年A組・中庭" : "例：長机・パイプ椅子"} maxLength={30} required/></label>{mode === "item" && <label>単位<input value={unit} onChange={e => setUnit(e.target.value)} placeholder="個・台・脚" required maxLength={5}/></label>}</> : mode === "targets" ? <div className="target-matrix" style={{'--matrix-cols':data.items.length} as CSSProperties}><div className="matrix-row matrix-head"><b>場所</b>{data.items.map(i=><b key={i.id}>{i.name}<small>{i.unit}</small></b>)}</div>{data.places.map(p=><div className="matrix-row" key={p.id}><strong>{p.name}</strong>{data.items.map(i=><input key={i.id} aria-label={`${p.name}の${i.name}目標`} type="number" min="0" max="99999" step="1" value={targetDraft[p.id]?.[i.id]??0} onChange={e=>setTargetDraft(old=>({...old,[p.id]:{...(old[p.id]||{}),[i.id]:Math.max(0,Math.min(99999,Number(e.target.value)||0))}}))}/>)}</div>)}</div> : mode === "target" ? <><label>場所<select value={from} onChange={e=>{setFrom(e.target.value);setQuantity(String(data.targets?.[e.target.value]?.[item]??0))}}>{data.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>備品<select value={item} onChange={e=>{setItem(e.target.value);setQuantity(String(data.targets?.[from]?.[e.target.value]??0))}}>{data.items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label>この場所の目標数<input type="number" min="0" max="99999" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label></> : <>
          <label>備品<select value={item} onChange={e => { setItem(e.target.value); if (mode === "adjust") setQuantity(String(countAt(data, from, e.target.value))); }}>{data.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          <div className={mode === "transfer" ? "route-fields" : ""}><label>{mode === "transfer" ? "移動元" : "場所"}<select value={from} onChange={e => { setFrom(e.target.value); if (mode === "adjust") setQuantity(String(countAt(data, e.target.value, item))); if (e.target.value === to) setTo(data.places.find(p => p.id !== e.target.value)?.id || ""); }}>{data.places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{mode === "transfer" && <><ArrowRight size={18}/><label>移動先<select value={to} onChange={e => setTo(e.target.value)} required><option value="" disabled>選択してください</option>{data.places.filter(p => p.id !== from).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}</div>
          <label>{mode === "transfer" ? "移動する個数" : "確認した現在の個数"}<div className="quantity-control"><button type="button" aria-label="個数を1減らす" onClick={() => setQuantity(String(Math.max(mode === "transfer" ? 1 : 0, Number(quantity) - 1)))}>−</button><input type="number" inputMode="numeric" min={mode === "transfer" ? 1 : 0} max={mode === "transfer" ? Math.max(1, available) : 99999} step={1} required value={quantity} onChange={e => setQuantity(e.target.value)}/><span>{selectedItem?.unit}</span><button type="button" aria-label="個数を1増やす" onClick={() => setQuantity(String(Math.min(mode === "transfer" ? Math.max(1, available) : 99999, Number(quantity) + 1)))}>＋</button></div></label>
          <div className="count-preview"><span>現在 {available}{selectedItem?.unit}</span>{mode === "transfer" && <span>移動後 <b>{Math.max(0, available - Number(quantity))}</b>{selectedItem?.unit}</span>}</div>
          <label>{mode === "adjust" ? "変更理由" : "メモ"}<span className="optional">任意</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder={mode === "adjust" ? "例：準備前の初期登録・現地で数え直したため" : "例：クラス企画で使用するため"}/></label>
        </>}
      </fieldset>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {uncertain && <p className="retry-note">二重登録を防ぐため、入力を固定しています。「同じ内容で再送」から保存結果を確認してください。</p>}
      <button type="submit" className="primary submit" disabled={busy}>{busy ? "保存中…" : uncertain ? "同じ内容で再送" : "保存する"}{!busy && <ArrowRight size={17}/>}</button></form>}
    </dialog>
    {overview&&<dialog open className="overview-dialog" onClick={e=>{if(e.target===e.currentTarget)setOverviewItem('')}}><div className="overview-content"><button className="overview-close" onClick={()=>setOverviewItem('')}><X/></button><Package size={28}/><h2>{overview.name}</h2><div className="overview-total">合計 <b>{totalFor(overview.id)}</b>{overview.unit} ／ 目標 {totalTargetFor(overview.id)}{overview.unit}</div>{data!.places.map(p=>{const current=countAt(data!,p.id,overview.id),target=targetAt(p.id,overview.id),diff=current-target;return <div className="overview-row" key={p.id}><span><MapPin size={16}/>{p.name}<small>目標 {target}{overview.unit}</small></span><b className={target>0?(diff>0?'over':diff<0?'short':'just'):''}>{current}{overview.unit}</b></div>})}</div></dialog>}
  </div>;
}
function History({ entries }: { entries: Snapshot["history"] }) {
  if (!entries.length) return <div className="empty history-empty"><Clock3 size={27}/><div><h3>まだ記録はありません</h3><p>備品を登録・移動すると、ここに履歴が残ります。</p></div></div>;
  return <div className="history-list">{entries.map(entry => <div className="history-row" key={entry.id}><span className={`history-icon ${entry.detail.type}`}>{entry.detail.type === "transfer" ? <ArrowLeftRight size={19}/> : <ClipboardList size={19}/>}</span><div className="history-detail"><strong>{entry.detail.title}</strong><p>{entry.detail.description}</p><span className="history-person">{entry.actor}</span></div><time dateTime={entry.at}>{formatTime(entry.at)}</time></div>)}</div>;
}

