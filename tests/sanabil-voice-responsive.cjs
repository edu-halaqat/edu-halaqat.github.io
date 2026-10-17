'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const voice=fs.readFileSync('sanabil-voice.js','utf8');
const css=fs.readFileSync('sanabil-identity.css','utf8');
const offline=fs.readFileSync('sanabil-offline-app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(css.includes('13.8.15 — compact'),'responsive action-bar patch shipped');
assert(css.includes('.sl-voice-entry>button::after'),'mobile mic condensed to icon');
assert(css.includes('.mobile-nav>button svg'),'mobile navigation icons normalized');
assert(offline.includes('root.hidden=!needsAttention'),'redundant connected badge must disappear');
assert(html.includes('/sanabil-voice.js'),'voice module loaded on all authenticated views');
class E{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.events={};this.dataset={};this.attributes={};this.className='';this.style={};this.hidden=false;this.isConnected=true;this.classList={add:x=>{if(!this.className.split(/\s+/).includes(x))this.className+=' '+x},remove:x=>{this.className=this.className.split(/\s+/).filter(c=>c&&c!==x).join(' ')},contains:x=>this.className.split(/\s+/).includes(x)};}
 append(...args){for(const child of args){child.parentElement=this;this.children.push(child);if(child.id)this.doc.ids.set(child.id,child)}}
 replaceChildren(...args){this.children=[];this.append(...args)}
 setAttribute(name,value){this.attributes[name]=value}
 addEventListener(event,fn){this.events[event]=fn}
 remove(){this.removed=true;this.isConnected=false;this.doc.ids.delete(this.id)}
 focus(){this.focused=true}
 scrollIntoView(){this.scrolled=true}
 querySelector(selector){return this.local?.[selector]||null}
 getBoundingClientRect(){return {top:190,bottom:690}}
}
let app=true,session=false,observers=[];
const ids=new Map();
const doc={ids,body:null,querySelector(selector){
 if(selector==='.app-content,.mobile-nav,.sl-live')return app?{nodeType:1}:null;
 if(selector==='.sl-live')return session?{nodeType:1}:null;
 if(selector==='[data-sanabil-voice]')return session?this.panel:null;
 if(selector==='[data-sanabil-voice] button[aria-label="تشغيل الموجه الصوتي"]')return session?this.launcher:null;
 return null;
},querySelectorAll(selector){return []},
getElementById:id=>ids.get(id)||null,createElement(tag){return new E(tag,doc)}
};
doc.body=new E('body',doc);
class Observer{
 constructor(cb){this.cb=cb;observers.push(this)}
 observe(){this.active=true}
 disconnect(){this.active=false}
}
const win={MutationObserver:Observer,innerHeight:700};
vm.runInNewContext(voice,{window:win,document:doc,MutationObserver:Observer,Promise,console,Event:class{}});
const mic=win.SanabilVoice.showLauncher();
assert(mic&&mic.id==='sanabil-voice-entry');
assert.equal(mic.hidden,false,'global mic appears on app shell');
assert(mic.children[0].onclick,'tap handler must be registered');
mic.children[0].onclick();assert.equal(mic.children[1].hidden,false,'tap opens useful guidance');
app=true;session=false;
observers.filter(o=>o.active).forEach(o=>o.cb());
Promise.resolve().then(()=>{
 assert.equal(mic.removed,undefined,'transient view remount must not erase mic');
 assert.equal(mic.hidden,false);
 const search=new E('search',doc),box=new E('box',doc);
 const cards=[new E('article',doc),new E('article',doc)];
 box.local={'[data-sanabil-voice]':null,'.sl-outcome-student-search':search,'#sl-outcome-search-input':null};
 session=true;doc.body.append(box);box.append(search);
 win.SanabilVoice.mount(box,{cards,names:['أحمد','خالد'],ids:['student-1','student-2']});
 const panel=search.children.find(node=>node.dataset.sanabilVoice==='true');
 assert(panel,'classroom assistant must mount');
 assert.equal(mic.hidden,true,'global mic yields to classroom button');
 assert.equal(panel.children[0].disabled,undefined,'unsupported speech may not disable all commands');
 panel.children[0].onclick();
 assert(panel.className.includes('sl-voice-open'),'tap opens command input if native speech recognition unavailable');
 const manual=panel.children.find(c=>c.className==='sl-voice-manual');
 assert(manual,'typed command fallback exists');
 const [input,go]=manual.children;
 assert.equal(manual.tag,'div','nested forms must not exist in outcomes');
 assert.equal(go.tag,'button','typed command is a direct button action');
 assert.equal(go.type,'button','must never submit classroom save form');
 input.value='انتقل إلى الطالب خالد';
 assert.equal(typeof go.events.click,'function','typed command has actual click listener');
 go.events.click({preventDefault(){},stopPropagation(){}});
 assert(cards[1].scrolled,'typed voice fallback navigates correct student');
 panel.children[1].onclick();
 assert(!panel.classList.contains('sl-voice-open'),'voice panel stays collapsed after close');
 assert.equal(panel.dataset.expanded,'false','collapse is explicit');
 assert(!panel.children[3].hidden,'typed control stays available after reopening');
 assert.equal(cards[0].scrolled,undefined);
 session=false;doc.panel=null;
 observers.filter(o=>o.active).forEach(o=>o.cb());
 return Promise.resolve().then(()=>{
  assert.equal(mic.hidden,false,'global mic reappears after closing classroom');
  app=false;
  observers.filter(o=>o.active).forEach(o=>o.cb());
  return Promise.resolve().then(()=>{
   assert.equal(mic.removed,true,'logout removes the launcher');
   console.log('PASS: stable mic across view changes, tap response, typed fallback, compact nav, synced badge hidden, logout cleanup');
  });
 });
}).catch(error=>{console.error(error);process.exitCode=1});
