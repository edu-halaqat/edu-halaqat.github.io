'use strict';
// Regression: returning from WhatsApp must not discard a teacher's pending invitation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('sanabil-free-live.js','utf8');
const memory=new Map();
const storage={
 getItem:key=>memory.get(key)||null,
 setItem:(key,value)=>memory.set(key,String(value)),
 removeItem:key=>memory.delete(key)
};
class Element{
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.style={};this.value='';this.isConnected=true;
  this.classList={add(){},remove(){},toggle(){}};
 }
 append(...children){for(const child of children){child.parentElement=this;this.children.push(child)}}
 replaceChildren(...children){this.children=[];this.append(...children)}
 hasChildNodes(){return this.children.length>0}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.isConnected=false}
 get previousElementSibling(){const p=this.parentElement;return p?.children[p.children.indexOf(this)-1]||null}
 insertAdjacentElement(position,child){
  assert.equal(position,'afterend');
  if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);
  const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this)+1,0,child);
  child.parentElement=parent;child.isConnected=true;
 }
 setAttribute(){}addEventListener(){}scrollIntoView(){}
 getBoundingClientRect(){return {height:300,bottom:600}}
}
const root=()=>{
 const el=new Element('root'),bar=new Element('bar'),data=new Element('data'),circle=new Element('select');
 circle.value='c1';circle.options=[{value:'c1'}];
 bar.className='sl-session-filter';el.append(bar,data);
 el.querySelector=query=>query==='.sl-session-filter'?bar:query==='.sl-data'?data:query==='[name="circle"]'?circle:null;
 return el;
};
let signedIn='teacher-1',connections=0;
const makeApp=()=>{
 const listeners={};
 const document={
  createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){},querySelectorAll(){return []}
 };
 const supabase={
  auth:{
   getUser:async()=>({data:{user:{id:signedIn}},error:null}),
   getSession:async()=>({data:{session:signedIn?{user:{id:signedIn}}:null}})
  },
  rpc:async name=>({data:name==='my_access'?{active:true,roles:['teacher']}:{},error:null}),
  from:table=>({
   select(){return this},eq(){return this},order(){return this},
   single:async()=>({data:{id:'c1'},error:null}),
   then(resolve,reject){
    return Promise.resolve({data:table==='students'?[{id:'student-1',full_name:'طالب تجريبي',guardian_phone:'0501234567'}]:[],error:null}).then(resolve,reject);
   }
  }),
  channel:()=>{connections++;return {on(){return this},subscribe(cb){cb('SUBSCRIBED');return this},send:async()=>{}}},
  removeChannel:async()=>{}
 };
 const window={
  RTCPeerConnection:function(){},innerWidth:1100,
  SanabilVideoCrypto:{random:()=>('A'.repeat(43)),importKey:async key=>key,pack:async()=>({})},
  supabaseClient:supabase,
  addEventListener:(event,callback)=>(listeners[event]??=[]).push(callback),
  removeEventListener(){}
 };
 const navigator={onLine:true,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})},clipboard:{writeText:async()=>{}}};
 const random={getRandomValues:array=>{array.fill(1);return array}};
 new Function('window','document','navigator','sessionStorage','crypto','location',
  'setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','URLSearchParams',source)(
  window,document,navigator,storage,random,{origin:'https://snabilalwahy.com'},
  ()=>5,()=>{},()=>1,()=>{},URLSearchParams
 );
 return {window,listeners};
};
async function run(){
 new Function(source);
 const before=makeApp(),page=root();
 await before.window.SanabilFreeLive.open(page,{circleId:'c1'});
 const panel=page.children.find(x=>x.className==='sl-peer-panel');
 assert.ok(panel,'video panel must mount');
 const select=panel.children.find(x=>x.tag==='select');
 const button=panel.children.find(x=>x.textContent==='إنشاء رابط شخصي للطالب');
 select.value='student-1';await button.onclick();
 const key='sanabil-private-teacher-video-v2';
 const original=JSON.parse(storage.getItem(key));
 assert.equal(original.invites.length,1,'one invitation persisted in tab-scoped storage');
 assert.equal(original.selectedStudentId,'student-1');
 for(const callback of before.listeners['sanabil-session-changed'])await callback();
 assert.ok(storage.getItem(key),'refreshing authentication does not invalidate video');
 for(const callback of before.listeners.pagehide)await callback();
 assert.ok(storage.getItem(key),'leaving for WhatsApp does not erase invitation');
 const after=makeApp(),returnPage=root();
 assert.equal(await after.window.SanabilFreeLive.restore(returnPage),true,'session can resume');
 const recovered=JSON.parse(storage.getItem(key));
 assert.equal(recovered.invites[0].room,original.invites[0].room,'same student invitation must survive');
 const returnedPanel=returnPage.children.find(x=>x.className==='sl-peer-panel');
 assert.ok(returnedPanel,'the teacher interface is visible after return');
 const inputs=returnedPanel.children.flatMap(x=>x.children||[]).filter(x=>x.tag==='input');
 assert.ok(inputs.some(x=>x.value.includes(original.invites[0].room)),'original URL is visible to teacher');
 assert.equal(connections,2,'the channel is resubscribed on reloading the app');
 signedIn='other-account';
 for(const callback of after.listeners['sanabil-session-changed'])await callback();
 assert.equal(storage.getItem(key),null,'logout or account switch clears sensitive invitation');
 console.log('PASS: WhatsApp return, auth refresh, preserved invitation, channel reconnection, account isolation');
}
run().catch(error=>{console.error(error);process.exitCode=1});
