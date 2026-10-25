'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sanabil-plan-calendar.js','utf8');
const html=fs.readFileSync('index.html','utf8');
new vm.Script(source);
assert(!source.includes("make('a'"),'calendar must have no external touch targets near month navigation');
assert(source.includes('event?.preventDefault?.()')&&source.includes('event?.stopPropagation?.()'),
 'navigation controls block parent or default click navigation');
assert(source.includes("previous.type='button';next.type='button'"),'navigation buttons must not submit forms');
assert(source.includes("touch-action:manipulation"),'avoid double-tap delay or ghost taps');
assert(source.includes('renderSequence'),'discard late response from a previous month');
assert(source.includes('monthlyCache'),'revisiting month should avoid repeated database reads');
assert(html.includes('/sanabil-plan-calendar.js?v=20261025-month-nav2'),'new calendar asset cache-busted');
class FakeNode {
 constructor(tag){
  this.tagName=String(tag).toLowerCase();this.children=[];this.style={};
  this.attrs={};this.className='';this.textContent='';this.dataset={};
  this.classList={add:(...names)=>{this.className=[this.className,...names].join(' ').trim()}};
 }
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(k,v){this.attrs[k]=String(v)}
 getAttribute(k){return this.attrs[k]}
 addEventListener(type,fn){this['on'+type]=fn}
 remove(){this.removed=true}
 showModal(){this.open=true}
 close(){this.open=false;this.onclose?.()}
}
const body=new FakeNode('body'),head=new FakeNode('head');
const document={
 body,head,createElement:tag=>new FakeNode(tag),getElementById:()=>null
};
const pending=[];
let reads=0;
const client={rpc:async(name,args)=>{
 if(name==='get_calendar_management_scope_guarded')
  return {data:[{id:'complex-A',name:'مجمّع تجريبي',circles:[{id:'circle-A',name:'حلقة تجريبية'}]}],error:null};
 if(name==='get_circle_day_types_range_guarded'){
  reads++;
  if(reads===1)return {data:[],error:null};
  return new Promise(resolve=>pending.push({args,resolve}));
 }
 throw Error('unexpected read: '+name);
}};
const window={supabaseClient:client,confirm:()=>true,location:{href:'https://snabilalwahy.com/'}};
vm.runInNewContext(source,{window,document,console,Date,Intl},{timeout:1500});
const flatten=node=>[node,...node.children.flatMap(flatten)];
const byText=value=>flatten(body).find(n=>n.textContent===value);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const cal=window.SanabilPlanCalendar;
 await cal.open({selectedCircle:'circle-A'});
 const dialog=body.children.find(n=>n.tagName==='dialog');
 assert(dialog?.open,'calendar modal should open');
 assert.equal(flatten(dialog).filter(n=>n.tagName==='a').length,0,
  'there are no clickable links in the calendar dialog');
 const next=byText('الشهر التالي'),previous=byText('الشهر السابق');
 assert(next&&previous);
 assert.equal(next.type,'button');
 const monthLabel=next.parentLabelUnused||flatten(dialog).find(n=>n.tagName==='strong'&&/\d/.test(n.textContent));
 assert(monthLabel,'month heading exists');
 const original=monthLabel.textContent;let prevented=0,stopped=0;
 const event={preventDefault(){prevented++},stopPropagation(){stopped++}};
 next.onclick(event);
 const firstFuture=monthLabel.textContent;
 assert.notEqual(firstFuture,original,'first tap switches months immediately before request resolves');
 assert.equal(pending.length,1,'only one deferred read for first new month');
 next.onclick(event);
 const secondFuture=monthLabel.textContent;
 assert.notEqual(secondFuture,firstFuture,'second immediate tap advances again despite pending read');
 assert.equal(pending.length,2);
 assert.equal(prevented,2);assert.equal(stopped,2);
 // Responses may be returned in the opposite order on mobile connections.
 pending[0].resolve({data:[],error:null});
 await tick();
 assert.equal(monthLabel.textContent,secondFuture,'stale response must not roll month back');
 pending[1].resolve({data:[],error:null});
 await tick();
 assert.equal(monthLabel.textContent,secondFuture,'final response keeps current month');
 previous.onclick(event);
 assert.equal(monthLabel.textContent,firstFuture,'previous month button navigates inside dialog');
 assert.equal(reads,3,'previous month reuses cached previous response');
 assert.equal(window.location.href,'https://snabilalwahy.com/','no external navigation occurs');
 assert.equal(flatten(dialog).filter(n=>n.tagName==='a').length,0);
 console.log('PASS: first tap, rapid successive taps, reversed network responses, cached back navigation, no external link');
})().catch(error=>{console.error(error);process.exitCode=1});
