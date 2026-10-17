'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const updater=fs.readFileSync('sanabil-updater.js','utf8');
const voice=fs.readFileSync('sanabil-voice.js','utf8');
const ui=fs.readFileSync('sanabil-live-v12.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('/sanabil-updater.js?v=20261018-v1'),'Updater must be loaded');
assert(!html.includes("if(window.__SanabilLiveBuild!==expected)showUpdate()"),'Old delayed-script banner must be removed');
assert(html.includes('/sanabil-voice.js?v=20261018-v3'),'Updated voice module loaded');
assert(ui.includes('window.SanabilVoice?.showLauncher?.()'),'Home screen must show launcher after authentication');
assert(voice.includes('function showLauncher()'),'Voice entry function exists');
assert(voice.includes("entry.hidden=!!document.querySelector('[data-sanabil-voice]')"),'Home launcher yields to classroom microphone');
assert(!updater.includes('localStorage.clear(')&&!updater.includes('caches.delete('),'Update cannot wipe local drafts and caches');

class Node{
 constructor(tag,document){this.tagName=tag;this.ownerDocument=document;this.children=[];this.hidden=false;this.style={};this.attributes={};this.textContent='';this.onclick=null;}
 setAttribute(k,v){this.attributes[k]=v}
 append(...items){for(const i of items){this.children.push(i);if(i.id)this.ownerDocument.ids.set(i.id,i)}}
 remove(){this.ownerDocument.ids.delete(this.id);this.removed=true}
}
function environment({current='20261018-v13.8.13',published='20261018-v13.8.14',publishedJs=published}={}){
 const ids=new Map(),listeners={};
 const doc={
  ids,visibilityState:'visible',
  body:null,
  querySelector(query){
   if(query==='meta[name="sanabil-build"]')return {content:current};
   if(query==='.sl-live')return {className:'sl-live'};
   if(query==='.app-content,.mobile-nav,.sl-live')return {className:'app-content'};
   if(query==='[data-sanabil-voice]')return null;
   if(query==='[data-sanabil-voice] button[aria-label="تشغيل الموجه الصوتي"]')return null;
   if(query==='button,[role="tab"],a')return null;
   return null;
  },
  querySelectorAll(query){return query==='button,[role="tab"],a'?[]:[]},
  getElementById(id){return ids.get(id)||null},
  createElement(tag){return new Node(tag,doc)},
  addEventListener(name,cb){(listeners['document:'+name]??=[]).push(cb)}
 };
 doc.body=new Node('body',doc);
 const storage=new Map();
 const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const fetchCalls=[];
 const fetchMock=async(url,opts)=>{
  fetchCalls.push(String(url));
  if(String(url).startsWith('/index.html'))return {ok:true,text:async()=>'<meta name="sanabil-build" content="'+published+'"><script src="/sanabil-live-v12.js?v=90" defer></script>'};
  if(String(url).startsWith('/sanabil-live-v12.js'))return {ok:true,text:async()=> 'window.__SanabilLiveBuild=\''+publishedJs+'\';'};
  throw Error('Unexpected URL '+url);
 };
 const replaces=[],loc={origin:'https://snabilalwahy.com',replace:url=>replaces.push(url)};
 const window={__SanabilLiveBuild:current,addEventListener:(n,cb)=>{(listeners[n]??=[]).push(cb)}};
 const ctx={window,document:doc,sessionStorage,navigator:{serviceWorker:{}},location:loc,fetch:fetchMock,AbortController,Date,URL,Promise,setTimeout,clearTimeout,console,confirm:()=>true};
 vm.runInNewContext(updater,ctx);
 return {doc,window,storage,fetchCalls,replaces,api:window.SanabilUpdater};
}
(async()=>{
 const unchanged=environment({current:'20261018-v13.8.14'});
 await unchanged.api.check({force:true});
 assert.equal(unchanged.doc.getElementById('sanabil-build-notice'),null,'No alert when latest build is active');
 const missing=environment({publishedJs:'20261018-v13.8.13'});
 await missing.api.check({force:true});
 assert.equal(missing.doc.getElementById('sanabil-build-notice'),null,'Incomplete server deployment must not prompt');
 const old=environment();
 await old.api.check({force:true});
 const banner=old.doc.getElementById('sanabil-build-notice');
 assert(banner,'One verified new release prompts user');
 assert.equal(banner.children.length,3);
 await old.api.check({force:true});
 assert.equal(old.doc.body.children.filter(x=>!x.removed&&x.id==='sanabil-build-notice').length,1,'Repeated focus never creates second prompt');
 banner.children[2].onclick();
 assert.equal(old.doc.getElementById('sanabil-build-notice'),null,'Dismiss is quiet');
 await old.api.check({force:true});
 assert.equal(old.doc.getElementById('sanabil-build-notice'),null,'Do not nag again for same version after later');
 const confirmUpdate=environment();
 await confirmUpdate.api.check({force:true});
 const notice=confirmUpdate.doc.getElementById('sanabil-build-notice');
 await notice.children[1].onclick();
 assert.equal(confirmUpdate.replaces.length,1,'Single click triggers one navigation');
 assert(confirmUpdate.replaces[0].includes('sanabil_refresh=20261018-v13.8.14'),'Navigation requests verified version');
 await confirmUpdate.api.check({force:true});
 assert.equal(confirmUpdate.doc.body.children.filter(x=>!x.removed&&x.id==='sanabil-build-notice').length,1,'Clicking once does not add another banner');
 // Dashboard icon is visible before opening a circle.
 const dock=environment({current:'20261018-v13.8.14'});
 vm.runInNewContext(voice,{window:dock.window,document:dock.doc,console,Promise});
 const entry=dock.window.SanabilVoice.showLauncher();
 assert(entry&&entry.id==='sanabil-voice-entry');
 assert.equal(entry.hidden,false);
 assert.equal(entry.children[0].textContent,'🎙 الموجه الصوتي');
 entry.children[0].onclick();
 assert.equal(entry.children[1].hidden,false,'Mic explains how to enter classroom');
 console.log('PASS: verified updates once per release, no delayed JS false alerts, safe one-click reload, mic appears on authenticated home');
})().catch(err=>{console.error(err);process.exitCode=1});
