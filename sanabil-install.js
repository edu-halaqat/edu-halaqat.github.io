/* Sanabil PWA: persistent dashboard install action and honest cross-browser detection. */
(()=>{'use strict';if(window.SanabilInstaller)return;
const APP_ID='https://snabilalwahy.com/sanabil-app';
let deferred=null,justInstalled=false,checkPending=null;
const buttons=new Set();
const isAppWindow=()=>Boolean(
 (typeof window.matchMedia==='function'&&(
   window.matchMedia('(display-mode: standalone)').matches||
   window.matchMedia('(display-mode: fullscreen)').matches||
   window.matchMedia('(display-mode: minimal-ui)').matches
 ))||navigator.standalone===true
);
const hasRelatedApp=apps=>Array.isArray(apps)&&apps.some(app=>
 app?.platform==='webapp'&&(
   app.id===APP_ID||
   (typeof app.url==='string'&&app.url.includes('/manifest.webmanifest'))
 )
);
const render=installed=>{
 for(const button of buttons){
  if(!button.isConnected){buttons.delete(button);continue}
  button.hidden=!!installed;
  button.disabled=false;
  button.setAttribute('aria-hidden',installed?'true':'false');
 }
};
async function check(){
 if(isAppWindow()||justInstalled){render(true);return true}
 if(checkPending)return checkPending;
 checkPending=(async()=>{
  let installed=false;
  if(typeof navigator.getInstalledRelatedApps==='function'){
   try{
    installed=hasRelatedApp(await navigator.getInstalledRelatedApps());
   }catch{/* Lack of API support must not hide the install help. */}
  }
  render(installed||justInstalled||isAppWindow());
  return installed;
 })().finally(()=>{checkPending=null});
 return checkPending;
}
const mobileApple=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent||'')||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const onAndroid=()=>/Android/i.test(navigator.userAgent||'');
const onEdge=()=>/Edg\//.test(navigator.userAgent||'');
function installHelp(){
 let dialog=document.getElementById('sanabil-install-help');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='sanabil-install-help';dialog.dir='rtl';
  dialog.className='sanabil-install-help';
  dialog.innerHTML='<div class="sl-install-help-head"><strong>تثبيت تطبيق سنابل الوحي</strong><button type="button" data-close aria-label="إغلاق تعليمات التثبيت">✕</button></div>'+
   '<p data-info></p><ol data-steps></ol>'+
   '<p class="sl-install-help-note">التثبيت لا يتطلب ملف APK ولا متجر التطبيقات. إذا لم يظهر خيار التثبيت فتأكد من فتح الموقع في متصفح كامل مثل Chrome أو Edge أو Safari.</p>'+
   '<button type="button" class="sl-install-help-done" data-done>فهمت</button>';
  document.body.appendChild(dialog);
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.querySelector('[data-done]').addEventListener('click',()=>dialog.close());
 }
 const info=dialog.querySelector('[data-info]'),steps=dialog.querySelector('[data-steps]');
 let details;
 if(mobileApple()){
  details=['على iPhone أو iPad استخدم متصفح Safari لفتح snabilalwahy.com.','اضغط زر المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».','اضغط «إضافة»، ثم افتح سنابل الوحي من الشاشة الرئيسية.'];
 }else if(onAndroid()){
  details=['افتح snabilalwahy.com في Chrome أو متصفح سامسونج، وليس داخل نافذة تطبيق آخر.','افتح قائمة المتصفح (⋮ أو ☰) ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».','وافق على التثبيت، ثم افتح سنابل الوحي من أيقونة التطبيقات.'];
 }else if(onEdge()){
  details=['افتح موقع سنابل الوحي في Microsoft Edge.','من قائمة (⋯) اختر «التطبيقات» ثم «تثبيت هذا الموقع كتطبيق».','أكمل التثبيت ثم افتح التطبيق من قائمة التطبيقات.'];
 }else{
  details=['افتح snabilalwahy.com في Google Chrome أو Microsoft Edge.','اضغط أيقونة التثبيت في شريط العنوان، أو افتح قائمة (⋮) واختر «تثبيت الصفحة كتطبيق» بحسب المتصفح.','أكمل التثبيت وافتح سنابل الوحي من سطح المكتب أو قائمة التطبيقات.'];
 }
 info.textContent='لا يعرض متصفحك نافذة التثبيت المباشر الآن. اتبع الخطوات المناسبة لجهازك:';
 steps.replaceChildren(...details.map(line=>{const li=document.createElement('li');li.textContent=line;return li}));
 if(typeof dialog.showModal==='function')dialog.showModal();
 else dialog.setAttribute('open','');
}
async function install(){
 if(isAppWindow()){await check();return}
 const event=deferred;
 if(!event){installHelp();return}
 deferred=null;
 try{
  await event.prompt(); // Call from the user's direct click; do not await a probe first.
  const decision=await event.userChoice;
  if(decision?.outcome==='accepted'){
   // Browsers may dispatch appinstalled after the prompt resolves.
   justInstalled=true;
   render(true);
  }else render(false);
 }catch{
  render(false);
  installHelp();
 }
}
function bind(button){
 if(!button)return;
 buttons.add(button);
 button.hidden=true; // Never flash an install button in a standalone app.
 button.addEventListener('click',install);
 check().catch(()=>{if(!isAppWindow())render(false)});
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();deferred=event;justInstalled=false;
 check().catch(()=>render(false));
});
window.addEventListener('appinstalled',()=>{
 deferred=null;justInstalled=true;render(true);
});
window.addEventListener('pageshow',()=>{check().catch(()=>{})});
window.addEventListener('focus',()=>{check().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check().catch(()=>{})});
if(typeof window.matchMedia==='function'){
 const media=window.matchMedia('(display-mode: standalone)');
 if(media.addEventListener)media.addEventListener('change',()=>check().catch(()=>{}));
}
const css=document.createElement('style');
css.textContent='.sl-install-cta{min-height:48px!important;padding:10px 19px!important;border-radius:12px!important;background:#00808a!important;color:white!important;border:1px solid #d8bd88!important;box-shadow:0 4px 12px #00808a22!important;font-family:Alyamama,Tahoma,sans-serif!important;font-size:1rem!important;font-weight:700!important}.sl-install-cta:hover{background:#006b72!important}.sl-install-cta[hidden]{display:none!important}.sanabil-install-help{direction:rtl;max-width:min(520px,94vw);width:calc(100% - 24px);border:1px solid #d8bd88;border-radius:16px;padding:22px;background:#f7fbf9;color:#173f36;font-family:Alyamama,Tahoma,sans-serif;line-height:1.9;box-shadow:0 16px 55px #0004}.sanabil-install-help::backdrop{background:#081c1aa8}.sl-install-help-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sl-install-help-head strong{font-size:1.15rem;color:#063b34}.sl-install-help-head button{border:0;background:transparent;font-size:1.2rem;color:inherit;cursor:pointer}.sanabil-install-help ol{padding-inline-start:24px}.sanabil-install-help li{margin-bottom:9px}.sl-install-help-note{font-size:.87rem;color:#4a6b61;background:#e9f4ef;padding:11px;border-radius:10px}.sl-install-help-done{background:#00808a;border:0;border-radius:10px;padding:9px 20px;color:#fff;font:inherit;cursor:pointer}html[data-sanabil-theme="dark"] .sanabil-install-help{background:#152b27;color:#eaf5ef;border-color:#d8bd88}html[data-sanabil-theme="dark"] .sl-install-help-head strong{color:#f4f9f5}html[data-sanabil-theme="dark"] .sl-install-help-note{background:#244239;color:#c9e2d5}@media(max-width:600px){.sl-install-cta{width:100%!important;min-height:50px!important}.sanabil-install-help{padding:16px}}';
document.head.appendChild(css);
window.SanabilInstaller={bind,check,install,isAppWindow};
})();
