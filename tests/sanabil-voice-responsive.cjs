'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const voice=fs.readFileSync('sanabil-voice.js','utf8');
const css=fs.readFileSync('sanabil-identity.css','utf8');
const offline=fs.readFileSync('sanabil-offline-app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const badge=fs.readFileSync('assets/sanabil-voice-mic-clean.svg','utf8');
assert(badge.startsWith('<svg'), 'microphone badge is native SVG');
assert(!/<image\b|data:image|<foreignObject\b|<rect[^>]*\bwidth="128"/i.test(badge),
 'icon must not contain an embedded PNG or a background-filling rectangle');
assert(badge.includes('<circle')&&badge.includes('clipPath'),
 'only the teal/gold circular emblem and microphone geometry should be painted');
assert(!/<rect[^>]*fill=["']#(?:000|000000)["']/i.test(badge),
 'no opaque black tile may be painted around the emblem');


// Android Chrome's native manual-popover user-agent background is opaque
// Canvas in dark mode; only resetting the button is insufficient.
const popoverRule=css.slice(css.indexOf('/* 13.8.24: native'));
assert(popoverRule.includes('body>.sl-voice-entry:popover-open'),'top layer launcher host is explicitly reset');
assert(popoverRule.includes('body>.sl-voice-panel:not(.sl-voice-open):popover-open'),'collapsed classroom host is explicitly reset');
for(const decl of ['background:transparent!important','border:0!important','padding:0!important','box-shadow:none!important','overflow:visible!important'])
 assert(popoverRule.includes(decl),'native popover host missing reset: '+decl);
assert(popoverRule.includes('body>.sl-voice-entry::backdrop'),'no opaque top-layer backdrop');
assert(!popoverRule.includes('.sl-voice-panel.sl-voice-open:popover-open'),'open full-size command panel keeps intentional background');

assert(css.includes('13.8.15 — compact'),'responsive action-bar patch shipped');
assert(css.includes('.sl-voice-entry>button::after'),'mobile mic condensed to icon');
assert(css.includes("background-image:url('/assets/sanabil-voice-mic-clean.svg?v=20261018-23')"),'mic icon uses the supplied transparent badge');
assert(css.includes('background:transparent!important'),'voice dock has no black rectangular background');
assert(html.includes('/sanabil-identity.css?v=32'),'new mic badge styling bypasses stale PWA cache');
assert(css.includes('body>.sl-voice-panel{'),'assistant uses global body stacking context');
assert(css.includes('z-index:2147483647!important'),'assistant overlays bulk attendance/student controls');
assert(css.includes('body>.sl-voice-panel:popover-open'),'manual popover resets default positioning');
assert(voice.includes("node.setAttribute('popover','manual')"),'supported browsers render assistant in native top layer');
assert(voice.includes('document.body.append(panel)'),'assistant is portalled outside nested student grid');
assert(voice.includes('disposeMountedSession()'),'no stale assistant when changing sessions');
assert(css.includes('.mobile-nav>button svg'),'mobile navigation icons normalized');
assert(offline.includes('root.hidden=!needsAttention'),'redundant connected badge must disappear');
assert(html.includes('/sanabil-voice.js'),'voice module loaded on all authenticated views');
class E{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.events={};this.dataset={};this.attributes={};this.className='';this.style={};this.hidden=false;this.isConnected=true;this.classList={add:x=>{if(!this.className.split(/\s+/).includes(x))this.className+=' '+x},remove:x=>{this.className=this.className.split(/\s+/).filter(c=>c&&c!==x).join(' ')},contains:x=>this.className.split(/\s+/).includes(x)};}
 append(...args){for(const child of args){child.parentElement=this;this.children.push(child);if(child.id)this.doc.ids.set(child.id,child)}}
 replaceChildren(...args){this.children=[];this.append(...args)}
 setAttribute(name,value){this.attributes[name]=value}
 addEventListener(event,fn){this.events[event]=fn}
 showPopover(){assert(this.parentElement,'popover must be mounted before showing');assert.equal(this.attributes.popover,'manual');this.topLayer=true}
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
class FakeSpeech{
 constructor(){FakeSpeech.all.push(this)}
 start(){this.started=true}
 stop(){this.onend?.()}
 abort(){this.aborted=true}
}
FakeSpeech.all=[];
const fakeTimers=new Map();let timerId=0;
const fakeSetTimeout=(cb,ms)=>{const id=++timerId;fakeTimers.set(id,{cb,ms});return id};
const fakeClearTimeout=id=>fakeTimers.delete(id);
const win={MutationObserver:Observer,SpeechRecognition:FakeSpeech,innerHeight:700};
vm.runInNewContext(voice,{window:win,document:doc,MutationObserver:Observer,Promise,console,Event:class{},setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout});
const mic=win.SanabilVoice.showLauncher();
assert(mic&&mic.id==='sanabil-voice-entry');
assert.equal(mic.hidden,false,'global mic appears on app shell');
assert.equal(mic.topLayer,true,'global voice launcher enters the native top layer');
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
 const panel=doc.body.children.find(node=>node.dataset.sanabilVoice==='true');
 assert.equal(panel.parentElement,doc.body,'assistant is outside nested student stacking context');
 assert(panel,'classroom assistant must mount');
assert.equal(panel.topLayer,true,'classroom voice assistant enters the native top layer');
 assert.equal(mic.hidden,true,'global mic yields to classroom button');
 const record=panel.children.find(node=>node.className.includes('sl-voice-record'));
 assert(record&&record.events.click,'separate reusable recording button is available');
 record.events.click();
 assert.equal(FakeSpeech.all.length,1,'first recording session starts');
 FakeSpeech.all[0].onresult({results:[{'0':{transcript:'انتقل إلى الطالب خالد'},isFinal:true}]});
 const quiet=[...fakeTimers.values()].find(item=>item.ms===2100);
 assert(quiet,'a two-second silence cutoff is armed on speech progress');
 quiet.cb();
 assert.equal(record.textContent,'🎙 بدء التسجيل','recording control resets without closing the assistant');
 assert(cards[1].scrolled,'first voice batch executes without confirmation');
 record.events.click();
 assert.equal(FakeSpeech.all.length,2,'second recording starts with the same open assistant');
 FakeSpeech.all[1].onresult({results:[{'0':{transcript:'انتقل إلى الطالب أحمد'},isFinal:true}]});
 [...fakeTimers.values()].find(item=>item.ms===2100).cb();
 assert(cards[0].scrolled,'second recording executes without closing and reopening');
 panel.children[1].onclick(); // Close once before checking the normal launcher toggle.

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
 assert(cards[0].scrolled,'voice recording navigated to Ahmed before typed navigation');
 // Re-render the classroom on the same box: old portal must be removed
 // before opening a new session, never accumulating stale buttons.
 cards.forEach(card=>card.isConnected=false);
 const replacement=[new E('article',doc),new E('article',doc)];
 win.SanabilVoice.mount(box,{cards:replacement,names:['أحمد','خالد'],ids:['new-1','new-2']});
 const portals=doc.body.children.filter(node=>node.dataset.sanabilVoice==='true'&&!node.removed);
 assert.equal(portals.length,1,'only one active voice portal on session replacement');
 assert.notEqual(portals[0],panel,'old session voice portal disposed');
 session=false;doc.panel=null;box.isConnected=false;
 replacement.forEach(card=>card.isConnected=false);
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
