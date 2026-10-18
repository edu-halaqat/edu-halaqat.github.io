'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=fs.readFileSync('sanabil-voice.js','utf8');
const global=fs.readFileSync('sanabil-voice-global.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('/sanabil-voice-global.js?v=20261019-v1'),'global assistant loads after base');
assert(base.includes('const SILENCE_MS=2000'),'classroom stops two seconds after speech');
assert(global.includes('quiet(!!heard.trim())'),'global recorder resets its timer after a transcript');
assert(global.includes('quiet=heard=>{clearTimeout(silence);silence=setTimeout(stop,heard?2000:7500)}'),'global stops two seconds after speech');
let view='dashboard',selectedCircle=true,clicks={nav:[],in:0,out:0,load:0},messages=[],timeouts=[];
const titles={dashboard:'الرئيسية',outcomes:'الحصيلة اليومية',attendance:'الحضور والبصمة',tests:'الاختبارات'};
const navLabels={dashboard:'الرئيسية',outcomes:'الحصيلة',attendance:'البصمة',tests:'الاختبارات'};
const actions={in:()=>clicks.in++,out:()=>clicks.out++,load:()=>clicks.load++};
const el=(label,click)=>({textContent:label,disabled:false,hidden:false,
 getAttribute:()=>'',closest:()=>null,click});
const buttons=Object.keys(navLabels).map(key=>el(navLabels[key],()=>{view=key;clicks.nav.push(key)}));
const document={
 querySelectorAll(selector){
  if(selector==='button,a,[role="tab"]')return buttons;
  const match=selector.match(/^\.(?:sl-live) \[data-action="(.*?)"\]$/);
  if(match&&((view==='attendance'&&['in','out'].includes(match[1]))||(view==='outcomes'&&match[1]==='load')))
   return [el(match[1],actions[match[1]])];
  return [];
 },
 querySelector(selector){
  if(selector==='.sl-live > h1')return {textContent:titles[view]};
  if(selector==='.app-content,.mobile-nav,.sl-live')return {};
  if(selector==='.sl-live select[name="circle"],.sl-live select[data-field="circle"]')return {value:selectedCircle?'circle-1':''};
  return null;
 }
};
const window={};
const context={window,document,console,setTimeout:cb=>{timeouts.push(cb);return timeouts.length},clearTimeout:()=>{}};
vm.runInNewContext(base,context);vm.runInNewContext(global,context);
const api=window.SanabilVoiceGlobal,voice=window.SanabilVoice;
const drain=()=>{let count=0;while(timeouts.length){assert(++count<30,'too many polls');timeouts.shift()()}};
for(const [cmd,type,key] of [
 ['تسجيل حضور','punch','in'],['تسجيل انصراف','punch','out'],
 ['افتح جلسة اليوم','session'],['انتقل إلى الاختبارات','section','tests'],
 ['انتقل إلى الحصيلة','section','outcomes'],['الخطط','section','plans'],
 ['تسجيل حضور الغائبين','unknown'],['الحفظ ممتاز ومرة السمك','unknown']]){
  const got=api.parse(cmd);assert.equal(got.type,type,cmd);
  if(key)assert.equal(got.kind||got.key,key,cmd);
 }
assert.equal(voice.intentOf('الحفظ ممتاز كلام غير مفهوم',['أحمد']),Object(voice.intentOf('الحفظ ممتاز كلام غير مفهوم',['أحمد'])),'parser available');
assert.equal(voice.intentOf('الحفظ ممتاز كلام غير مفهوم',['أحمد']).type,'unknown','no partial grade');
assert.equal(voice.intentOf('تسجيل حضور',['أحمد']).type,'global','global command must not mark student present');
assert.equal(voice.fixStudentEcho('أحمد أحمد أحمد دحمان حاضر',['أحمد دحمان']),'أحمد دحمان حاضر','repair three repeated names');
assert.equal(voice.intentOf('الحفظ ممتاز',['أحمد']).type,'grade','valid lesson command survives safety checks');
let before=JSON.stringify(clicks);
assert.equal(api.run('تسجيل حضور الغائبين',m=>messages.push(m)).ok,false);
assert.equal(JSON.stringify(clicks),before,'nonsensical command causes no mutation');
assert(api.run('تسجيل حضور',m=>messages.push(m)).ok);drain();
assert.equal(clicks.in,1,'teacher check-in calls existing platform button');
assert(api.run('تسجيل انصراف',m=>messages.push(m)).ok);drain();
assert.equal(clicks.out,1,'teacher checkout calls existing platform button');
assert(api.run('افتح جلسة اليوم',m=>messages.push(m)).ok);drain();
assert.equal(clicks.load,1,'opening session calls the actual today-session button');
selectedCircle=false;
assert(api.run('افتح جلسة اليوم',m=>messages.push(m)).ok);drain();
assert.equal(clicks.load,1,'unspecified circle blocks opening session');
assert(messages.some(m=>m.includes('حدّد الحلقة')),'clarification should explain missing circle');
assert(api.run('انتقل إلى الاختبارات',m=>messages.push(m)).ok);
assert.equal(view,'tests','global navigation opens authorized UI navigation');
assert(messages.some(m=>m.includes('انتظر رسالة النجاح من الخادم')),'biometric request must not claim cloud save');
console.log('PASS: global navigation, accurate intents, no nonsensical actions, role UI gates, and session/fingerprint existing controls');
