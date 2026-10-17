'use strict';
/* PWA install UI never depends on browser-generated install banners. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const script=fs.readFileSync('sanabil-install.js','utf8');
const offline=fs.readFileSync('sanabil-offline-app.js','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const index=fs.readFileSync('index.html','utf8');
class Element{
 constructor(tag='div'){
  this.tagName=tag;this.hidden=false;this.disabled=false;this.isConnected=true;
  this.style={};this.attributes={};this.callbacks={};this.children=[];
 }
 setAttribute(name,value){this.attributes[name]=String(value)}
 addEventListener(name,callback){(this.callbacks[name]??=[]).push(callback)}
 appendChild(child){this.children.push(child);return child}
 replaceChildren(...nodes){this.children=[...nodes]}
 querySelector(key){return this.fields?.[key]||null}
 showModal(){this.open=true}
 close(){this.open=false}
}
async function run(){
 assert(manifest.related_applications?.some(x=>x.platform==='webapp'&&x.id==='https://snabilalwahy.com/sanabil-app'),'self-related manifest declared');
 assert(index.includes('/sanabil-install.js'),'installer loaded into main platform');
 assert(live.includes('data-action="install-pwa"'),'button appears in dashboard markup');
 assert(live.includes('SanabilInstaller.bind(installButton)'),'dashboard button binds to installer');
 assert(!offline.includes("window.addEventListener('beforeinstallprompt'"),'old install handler does not consume event');
 const listeners={};const nodes={};
 const doc={
  head:new Element('head'),body:new Element('body'),hidden:false,
  createElement(tag){const e=new Element(tag);if(tag==='dialog'){
    const fields={};for(const id of ['[data-close]','[data-done]','[data-info]','[data-steps]'])fields[id]=new Element(id);
    e.fields=fields;
  }return e},
  getElementById(id){return nodes[id]||null},
  addEventListener(name,callback){(listeners['document:'+name]??=[]).push(callback)}
 };
 let installedApps=[],standalone=false,prompted=0,time=1000000,helpOpen=false;
 const nav={
  userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/140',
  platform:'Linux arm',maxTouchPoints:1,standalone:false,
  getInstalledRelatedApps:async()=>installedApps
 };
 const window={
  matchMedia:()=>({matches:standalone,addEventListener(){}}),
  addEventListener(name,callback){(listeners[name]??=[]).push(callback)}
 };
 const FakeDate={now:()=>time};
 // Queryable modal: no install event must still open a helpful instruction dialog.
 const originalCreate=doc.createElement.bind(doc);
 doc.createElement=tag=>{
  const e=originalCreate(tag);
  if(tag==='dialog'){
   const origShow=e.showModal.bind(e);
   e.showModal=()=>{origShow();helpOpen=true};
  }
  return e;
 };
 new Function('window','document','navigator','Date',script)(window,doc,nav,FakeDate);
 const installer=window.SanabilInstaller;
 assert(installer,'installer module initialized');
 const button=new Element('button');
 installer.bind(button);
 await installer.check();
 assert.equal(button.hidden,false,'browser homepage always offers install when not installed');
 await installer.install();
 assert.equal(helpOpen,true,'when direct prompt unavailable, help opens rather than disappearing');
 installedApps=[{platform:'webapp',id:'https://snabilalwahy.com/sanabil-app',url:'https://snabilalwahy.com/manifest.webmanifest'}];
 await installer.check();
 assert.equal(button.hidden,true,'install button disappears when PWA is installed in separate window');
 installedApps=[];
 await installer.check();
 assert.equal(button.hidden,false,'after uninstall, button returns on normal browser page');
 let prevented=false;
 for(const listener of listeners.beforeinstallprompt||[])listener({
  preventDefault(){prevented=true},
  async prompt(){prompted++},
  userChoice:Promise.resolve({outcome:'accepted'})
 });
 assert.equal(prevented,true,'browser prompt is retained');
 await installer.install();
 assert.equal(prompted,1,'click triggers native install prompt');
 assert.equal(button.hidden,true,'after accepted install button hides');
 time+=40000;
 await installer.check();
 assert.equal(button.hidden,false,'missing installed PWA is rediscovered after uninstall without stale permanent flag');
 standalone=true;
 await installer.check();
 assert.equal(button.hidden,true,'inside installed PWA its own install button stays hidden');
 console.log('PASS: persistent installation action, native prompt, help, installed/uninstalled detection, standalone hiding');
}
run().catch(error=>{console.error(error);process.exitCode=1});
