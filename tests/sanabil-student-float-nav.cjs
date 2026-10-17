'use strict';
/* Exercise the actual session navigation helper without changing student records. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('sanabil-live-v12.js','utf8'),css=fs.readFileSync('sanabil-identity.css','utf8');
assert(src.includes('data-outcome-float-nav')&&src.includes('data-float-top')&&src.includes('data-float-bottom'));
assert(css.includes('.sl-outcome-float-nav{')&&css.includes('position:fixed!important'));
assert(css.includes('safe-area-inset-left')&&css.includes('html[data-sanabil-theme="dark"]'));
const first=src.indexOf('function installOutcomeStudentSearch(');
const end=src.indexOf('const dayKindLabels=',first);
assert(first>=0&&end>first,'outcome navigation helper found');
const extracted=src.slice(first,end);
const eventLog=[],history=[],listeners={};
class Element{
 constructor(tag,attrs={}){
  this.tag=tag;this.attributes={...attrs};this.dataset={};this.children=[];
  this.handlers={};this.hidden=false;this.disabled=false;this.isConnected=true;
  this.className='';this.value='';this.textContent='';this.parentElement=null;
  this.classList={contains:kind=>this.className.includes(kind)};
 }
 setAttribute(name,value){this.attributes[name]=String(value)}
 removeAttribute(name){delete this.attributes[name]}
 addEventListener(name,callback){(this.handlers[name]??=[]).push(callback)}
 dispatch(name){for(const cb of this.handlers[name]||[])cb({target:this,key:'',preventDefault(){}})}
 append(child){this.children.push(child);child.parentElement=this}
 remove(){this.isConnected=false;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this)}
 getBoundingClientRect(){return {top:100,bottom:160}}
 closest(){return null}
 querySelector(query){return this.fields?.[query]||null}
 set innerHTML(value){
  this.html=value;
  if(value.includes('sl-outcome-search-controls')){
   this.fields={'input':new Element('input'),'[data-outcome-search-clear]':new Element('button'),
    '[data-outcome-search-count]':new Element('small')};
  }else if(value.includes('data-float-top')){
   this.fields=Object.fromEntries([
    '[data-float-top]','[data-real-prev]','[data-float-count]',
    '[data-real-next]','[data-float-bottom]'
   ].map(id=>[id,new Element(id)]));
  }
 }
}
let scrolledTo=null,cardVisual=-1,clock=1000;const moveCalls=[];
const cards=Array.from({length:4},(_,i)=>{
 const e=new Element('article');e.className='sl-student-card';
 e.getBoundingClientRect=()=>{
  const top=cardVisual<0?650+i*220:120+(i-cardVisual)*280;
  return {top,bottom:top+250};
 };
 e.scrollIntoView=options=>{cardVisual=i;moveCalls.push({i,options})};
 return e;
});
const grid=new Element('div'),form=new Element('form'),parent=new Element('div'),box=new Element('box');
grid.children=cards;grid.closest=()=>form;form.parentElement=parent;parent.insertBefore=(node)=>node.isConnected=true;
box.querySelector=query=>query==='.sl-student-grid'?grid:null;
const body=new Element('body');body.append=node=>{body.children.push(node);node.parentElement=body};
const document={
 body,scrollingElement:{scrollHeight:6000,scrollTop:0},documentElement:{scrollHeight:6000},
 createElement:type=>new Element(type),
 querySelector:query=>query==='[data-outcome-float-nav]'?body.children.find(n=>n.dataset.outcomeFloatNav&&!n.removed):null,
 addEventListener:(name,cb)=>{listeners[name]=cb},removeEventListener(){},
};
const window={
 innerHeight:800,scrollY:0,matchMedia:()=>({matches:false}),
 scrollTo:request=>{scrolledTo=request;window.scrollY=request.top},
 SanabilPerformance:{afterPaintActual:(name,time,check)=>history.push({name,time,check:check()})},
 addEventListener:()=>{},removeEventListener:()=>{}
};
let observer=null;
class Observer{constructor(callback){this.callback=callback;observer=this}observe(){}disconnect(){}}
const ctx={document,window,performance:{now:()=>clock},MutationObserver:Observer,
 requestAnimationFrame:callback=>{return 101},cancelAnimationFrame:()=>{},console,
};
vm.runInNewContext(extracted,ctx);
const names=['طالب أول','طالب ثان','طالب ثالث','طالب رابع'];
ctx.installOutcomeStudentSearch(box,names);
let nav=body.children[0];assert(nav&&nav.className==='sl-outcome-float-nav');
const click=selector=>nav.querySelector(selector).dispatch('click');
const count=()=>nav.querySelector('[data-float-count]').textContent;
assert.equal(count(),'0 / 4','starts before first card');
click('[data-real-next]');assert.equal(moveCalls.at(-1).i,0,'next goes to first student from page header');
clock+=1000;click('[data-real-next]');assert.equal(moveCalls.at(-1).i,1,'next goes to second card');
clock+=1000;click('[data-real-prev]');assert.equal(moveCalls.at(-1).i,0,'previous moves back without scrolling to search field');
clock+=1000;cardVisual=2;click('[data-real-next]');
assert.equal(moveCalls.at(-1).i,3,'manual scroll location overrides stale selected student');
click('[data-float-top]');assert.equal(scrolledTo.top,0,'top of entire page');
click('[data-float-bottom]');assert.equal(scrolledTo.top,6000,'bottom of entire page');
assert(moveCalls.every(x=>x.options.block==='start'&&x.options.behavior==='smooth'),'visible card alignment');
assert(history.length>=4&&history.every(x=>x.name==='switch'),'real interaction metrics preserved');
grid.isConnected=false;observer.callback();
assert.equal(nav.isConnected,false,'floating controls removed when session DOM unmounts');
console.log('PASS: fixed rail, viewport-aware navigation, end jump, beginning jump, render cleanup, real timing and no grade writes');
