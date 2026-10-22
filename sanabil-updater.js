/* Sanabil release notifier: one verified prompt per newly deployed release per tab.
 * Avoids false alerts when the application script is delayed or temporarily stale.
 * Never clears user drafts, IndexedDB or Service Worker offline operations.
 */
(()=>{'use strict';if(window.SanabilUpdater)return;
const META='meta[name="sanabil-build"]',KEY='sanabil-update-prompt-v3';
const currentMeta=()=>document.querySelector(META)?.content||'';
const currentApp=()=>window.__SanabilLiveBuild||'';
const currentScriptPath=()=>{
 const tag=document.querySelector('script[src*="/sanabil-live-v12.js"]');
 const src=tag?.getAttribute('src')||'';
 return src.startsWith('/')?src:'';
};
const releaseKey=(version,path)=>version+'|'+path;
const getState=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'{}')||{}}catch{return{}}};
const setState=patch=>{try{sessionStorage.setItem(KEY,JSON.stringify({...getState(),...patch}))}catch{}};
const releaseParts=v=>{
 const m=String(v||'').match(/^(\d{8})-v(\d+)\.(\d+)\.(\d+)$/);
 return m?m.slice(1).map(Number):null;
};
const newer=(remote,local)=>{
 if(!remote||!local)return remote!==local;
 const r=releaseParts(remote),l=releaseParts(local);
 if(r&&l){for(let i=0;i<4;i++){if(r[i]!==l[i])return r[i]>l[i]}return false}
 return remote!==local;
};
let checking=false,lastCheck=0,notice=null,badge=null,lastRemote=null;
const getHtmlVersion=html=>String(html).match(/<meta\s+name=["']sanabil-build["']\s+content=["']([^"']+)["']/i)?.[1]||'';
const scriptPath=html=>String(html).match(/<script\b[^>]*\bsrc=["'](\/sanabil-live-v12\.js\?[^"']+)["']/i)?.[1]||'';
async function loadText(path){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),7000);
 try{
  const url=path+(path.includes('?')?'&':'?')+'sanabil_check='+Date.now();
  const res=await fetch(url,{cache:'no-store',signal:controller.signal});
  if(!res.ok)throw Error('Network response '+res.status);
  return await res.text();
 }finally{clearTimeout(timeout)}
}
const clear=()=>{document.getElementById('sanabil-build-notice')?.remove();notice=null};
const clearBadge=()=>{document.getElementById('sanabil-update-available')?.remove();badge=null};
const isRemoteNew=remote=>{
 const local=currentApp()||currentMeta();
 return newer(remote.version,local)||
   (remote.version===local&&!!remote.path&&remote.path!==currentScriptPath());
};
function showBadge(remote){
 if(!remote||!document.body)return;
 lastRemote=remote;
 if(badge?.isConnected)return;
 badge=document.createElement('button');
 badge.id='sanabil-update-available';
 badge.type='button';badge.dir='rtl';badge.title='توفر إصدار جديد من سنابل الوحي';
 badge.textContent='⟳ تحديث المنصة';
 badge.setAttribute('aria-label','تحديث المنصة إلى الإصدار الجديد');
 badge.style.cssText='position:fixed;top:186px;left:12px;z-index:2147483001;padding:9px 13px;min-height:44px;border-radius:24px;border:2px solid #d8bd88;background:#00594c;color:#fff;box-shadow:0 6px 22px #0005;cursor:pointer;font:700 14px/1.5 Tahoma,system-ui,sans-serif';
 badge.onclick=()=>banner(lastRemote?.signature,{force:true});
 document.body.append(badge);
}
function banner(target,{force=false}={}){
 if(!target||!document.body)return;
 if(getState().applied===target)return;
 if(!force&&getState().shown===target)return;
 if(document.getElementById('sanabil-build-notice'))return;
 // Remember even after the user dismisses; do not nag about the same release.
 setState({shown:target});
 const root=document.createElement('aside');root.id='sanabil-build-notice';
 root.setAttribute('role','status');root.setAttribute('aria-live','polite');root.dir='rtl';
 root.style.cssText='position:fixed;bottom:75px;right:12px;left:12px;z-index:2147483000;max-width:680px;margin:auto;background:#063b34;color:#fff;border:2px solid #d8bd88;border-radius:14px;padding:14px;box-shadow:0 8px 30px #0004;font:600 15px/1.8 system-ui,sans-serif;text-align:right';
 const msg=document.createElement('p');msg.textContent='صدر تحديث جديد لسنابل الوحي. احفظ حصائلك غير المؤكدة أولًا ثم اضغط «تحديث المنصة» مرة واحدة للانتقال إلى الإصدار الجديد.';msg.style.margin='0 0 10px';
 const apply=document.createElement('button'),later=document.createElement('button');
 apply.type=later.type='button';apply.textContent='تحديث المنصة';later.textContent='لاحقًا';
 apply.style.cssText='background:#d8bd88;color:#063b34;border:0;border-radius:9px;padding:9px 18px;font:inherit;cursor:pointer;margin-inline-end:10px';
 later.style.cssText='background:transparent;color:white;border:1px solid #d8bd88;border-radius:9px;padding:9px 18px;font:inherit;cursor:pointer';
 apply.onclick=async()=>{
  if(apply.disabled)return;
  apply.disabled=true;apply.textContent='جارٍ تجهيز التحديث…';
  try{
   // Confirm the release still exists before replacing the current document.
   const newest=await inspect();
   if(!newest||newest.signature!==target){
    if(newest&&isRemoteNew(newest)){
     clear();setState({shown:''});showBadge(newest);banner(newest.signature,{force:true});return;
    }
    throw Error('التحديث لم يكتمل وصوله بعد؛ لن أعيد تحميل الصفحة الآن.');
   }
   const stats=await window.SanabilOffline?.status?.(true).catch(()=>null);
   if((stats?.count||0)+(stats?.legacyCount||0)>0&&
     !confirm('توجد سجلات محلية بانتظار المزامنة. لن تُحذف، ولكن يُفضّل إرسالها أولًا. هل تريد تحديث الصفحة الآن؟')){
    apply.disabled=false;apply.textContent='تحديث المنصة';return;
   }
   try{const reg=await navigator.serviceWorker?.getRegistration?.();if(reg)await reg.update()}catch{}
   setState({applied:target});clearBadge();
   const url=new URL('/',location.origin);
   url.searchParams.set('sanabil_refresh',target);
   url.searchParams.set('t',String(Date.now()));
   location.replace(url.pathname+url.search);
  }catch(error){
   msg.textContent=(error?.message||'تعذر التحقق من التحديث')+' حاول لاحقًا من زر تحديث الصفحة في المتصفح.';
   apply.disabled=false;apply.textContent='إعادة المحاولة';
  }
 };
 later.onclick=()=>clear();
 root.append(msg,apply,later);document.body.append(root);notice=root;
}
async function inspect(){
 const html=await loadText('/index.html');
 const version=getHtmlVersion(html),path=scriptPath(html);
 if(!version||!path)return null;
 const remote={version,path,signature:releaseKey(version,path),valid:true};
 // Distinguish a release by its actual application asset, even when the
 // old build meta accidentally stayed unchanged between deployments.
 if(!isRemoteNew(remote))return remote;
 const js=await loadText(path);
 if(!js.includes("window.__SanabilLiveBuild='"+version+"'"))return null;
 return remote;
}
async function check({force=false}={}){
 if(checking||document.visibilityState==='hidden')return null;
 if(!force&&Date.now()-lastCheck<2*60*1000)return null;
 checking=true;lastCheck=Date.now();
 try{
  const remote=await inspect();
  if(!remote||!remote.valid)return null;
  const state=getState();
  if(!isRemoteNew(remote)){
   clear();clearBadge();return remote;
  }
  if(state.applied===remote.signature)return remote;
  showBadge(remote);
  if(state.shown!==remote.signature)banner(remote.signature);
  return remote;
 }catch{return null}finally{checking=false}
}
window.SanabilUpdater={check,inspect,newer,getState,currentScriptPath,releaseKey};
setInterval(()=>check().catch(()=>{}),2*60*1000);
window.addEventListener('load',()=>setTimeout(()=>check({force:true}),2500),{once:true});
window.addEventListener('focus',()=>check());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check()});
})();