'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const updater=fs.readFileSync('sanabil-updater.js','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sanabil-offline-sw.js','utf8');
const benchmark=fs.readFileSync('tests/sanabil-peak100-readonly.cjs','utf8');
new vm.Script(updater);new vm.Script(live);new vm.Script(benchmark);
assert(html.includes('sanabil-updater.js?v=20261023-revision1'),'new updater is versioned');
assert(html.includes('sanabil-live-v12.js?v=20261024-student-plans1'),'fresh app asset is versioned');
assert(html.includes('sanabil-build" content="20261024-v13.8.66"'),'HTML build version updated');
assert(live.includes("window.__SanabilLiveBuild='20261024-v13.8.66'"),'JS build version matches HTML');
assert(sw.includes('sanabil-shell-20261024-v45-west-calendar'),'offline shell revision updated');
assert(live.includes("button('تمديد الدرس بالأيام','to-extend-'+i)"),'daily talaqqin card offers current lesson extension');
assert(live.includes("action(box,extend,()=>extendTalaqqinLessonDays(root,r,renderTalaqqin))"),'daily lesson extension button is wired');
assert(live.includes("rpc('extend_talaqqin_lesson_days'"),'daily extension persists independently through its protected server RPC');
assert(benchmark.includes('USERS=100')&&benchmark.includes("testType:'public-read-only'"),'benchmark is strictly read only');
assert(!benchmark.includes("method:'POST'")&&!benchmark.includes("auth.signIn"),'benchmark cannot sign in or modify production');
(async()=>{
 const store=new Map(),nodes=new Map(),events={};
 const makeEl=tag=>{
  const e={tagName:tag,style:{},children:[],attributes:{},isConnected:true,
   setAttribute(k,v){this.attributes[k]=v},append(...children){this.children.push(...children)},
   appendChild(child){this.children.push(child)},addEventListener(k,fn){this['on'+k]=fn},
   remove(){nodes.delete(this.id);this.isConnected=false},textContent:'',disabled:false};
  return e;
 };
 const body={append(el){nodes.set(el.id,el);el.isConnected=true}};
 const doc={body,visibilityState:'visible',
  querySelector(q){if(q==='meta[name="sanabil-build"]')return{content:'20261023-v13.8.62'};
   if(q.includes('script[src*='))return{getAttribute:()=>'/sanabil-live-v12.js?v=20261023-original'};return null},
  getElementById:id=>nodes.get(id)||null,createElement:makeEl,
  addEventListener:(k,fn)=>{events[k]=fn}};
 const remote='/sanabil-live-v12.js?v=20261023-changed';
 let getCount=0;
 const fakeFetch=async url=>{
  getCount++;
  const body=url.startsWith('/index.html')?
   '<html><head><meta name="sanabil-build" content="20261023-v13.8.62"></head><body><script src="'+remote+'"></script></body></html>':
   "window.__SanabilLiveBuild='20261023-v13.8.62';";
  return {ok:true,text:async()=>body};
 };
 const win={__SanabilLiveBuild:'20261023-v13.8.62',addEventListener:(k,fn)=>events[k]=fn};
 const context={window:win,document:doc,navigator:{onLine:true},fetch:fakeFetch,location:{origin:'https://snabilalwahy.com'},
  sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  setTimeout,clearTimeout,setInterval:()=>0,Date,AbortController,URL,Promise,console};
 vm.runInNewContext(updater,context);
 const x=await win.SanabilUpdater.check({force:true});
 assert.equal(x.path,remote,'same meta with changed script must be recognized');
 assert(nodes.has('sanabil-update-available'),'persistent visible update badge must be mounted');
 assert(nodes.has('sanabil-build-notice'),'first release notification must be mounted');
 const notice=nodes.get('sanabil-build-notice');
 const later=notice.children.at(-1);later.onclick();
 assert.equal(nodes.has('sanabil-build-notice'),false,'dismissed notification closes');
 assert.equal(nodes.has('sanabil-update-available'),true,'badge remains after dismissal');
 const badge=nodes.get('sanabil-update-available');badge.onclick();
 assert(nodes.has('sanabil-build-notice'),'clicking badge must reopen update confirmation');
 assert(getCount>=2,'remote HTML and changed asset are both checked');
 console.log('PASS: updater detects identical build metadata with changed JS, exposes persistent icon, reopens dismissed prompt; talaqqin extension visible and wired');
})().catch(e=>{console.error(e);process.exitCode=1});
