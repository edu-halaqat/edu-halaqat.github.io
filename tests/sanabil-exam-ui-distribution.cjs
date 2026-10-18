'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const distribution=require('../sanabil-exam-distribution.js');
const oneSurah=[{surahNo:1,ayahCount:300,name:'اختبار'}];
const edges=Array.from({length:30},(_,i)=>({juzNo:i+1,fromSurahNo:1,fromAyahNo:i*10+1,fromAyahIndex:i*10+1,toSurahNo:1,toAyahNo:(i+1)*10,toAyahIndex:(i+1)*10}));
const bank=Array.from({length:30},(_,i)=>({id:'q'+(i+1),verified:true,juz_no:i+1,ayah_index:i*10+3,surah_no:1,ayah_no:i*10+3,end_surah_no:1,end_ayah_no:i*10+6}));
for(const d of [
 {mode:'phased',fromJuz:1,toJuz:15,direction:'from_fatiha',want:[1,6,11]},
 {mode:'phased',fromJuz:16,toJuz:30,direction:'from_nas',want:[26,21,16]}
]){
 const bins=distribution.buildBins(bank,d,3,oneSurah,edges),chosen=distribution.pickModel(bins);
 assert.equal(chosen.length,3);
 assert.deepEqual(chosen.map(q=>q.juz_no),d.want);
}
const rangeSyllabus={mode:'activation',fromSurahNo:1,fromAyahNo:1,toSurahNo:1,toAyahNo:300};
assert.deepEqual(distribution.pickModel(distribution.buildBins(bank,rangeSyllabus,3,oneSurah,edges)).map(q=>q.juz_no),[1,11,21]);
assert.throws(()=>distribution.buildBins(bank.filter(q=>q.juz_no>5),{mode:'phased',fromJuz:1,toJuz:15},3,oneSurah,edges),/الشريحة 1/);
assert.throws(()=>distribution.buildBins(bank,{mode:'activation',fromSurahNo:1,fromAyahNo:250,toSurahNo:1,toAyahNo:10},3,oneSurah,edges),/حدود/);
const front=fs.readFileSync('sanabil-live-v12.js','utf8');
const index=fs.readFileSync('index.html','utf8');
assert(index.includes('/sanabil-exam-distribution.js?v=1'),'balanced model must be loaded before the main runtime');
assert(front.includes('await window.SanabilExamEnhanceForm(form);'),'live dialog must initialize contextual fields directly');
assert(front.includes('dist.buildBins(bank,syllabus,count,catalog,boundaries)'),'live exam must sample every section');
assert(!front.includes('أكمل المواضع الباقية يدويًا'),'no invented manual questions to mask missing bank coverage');
const catalog=Array.from({length:114},(_,i)=>({surahNo:i+1,name:i===0?'الفاتحة':i===1?'البقرة':'سورة '+(i+1),ayahCount:i===0?7:i===1?286:6}));
const doc=new JSDOM('<main class="sl-live"></main>',{url:'https://snabilalwahy.com/'});
const window=doc.window;
window.supabaseClient={rpc:async name=>{
 if(name==='quran_surah_catalog')return{data:catalog,error:null};
 if(name==='quran_juz_boundaries')return{data:edges,error:null};
 throw Error('Unexpected RPC '+name);
}};
const context=vm.createContext({window,document:window.document,MutationObserver:window.MutationObserver,console,setTimeout:()=>0,clearTimeout:()=>{},navigator:window.navigator,location:window.location});
new vm.Script(fs.readFileSync('sanabil-v13-enhancements.js','utf8')).runInContext(context);
function event(el,type='change'){el.dispatchEvent(new window.Event(type,{bubbles:true}))}
async function next(){await Promise.resolve();await Promise.resolve();await new Promise(r=>setTimeout(r,5))}
(async()=>{
 const form=window.document.createElement('form');
 form.innerHTML='<label>مقرر الاختبار<select name="type"><option value="activation">تنشيطي</option></select></label>'+
  '<label>المقرر المطلوب<input name="syllabus" required></label>';
 window.document.body.appendChild(form);
 await window.SanabilExamEnhanceForm(form);
 assert.equal(form.querySelectorAll('[name="fromSurah"] option').length,114);
 assert.equal(form.querySelectorAll('[name="fromAyah"] option').length,7);
 assert.equal(form.querySelectorAll('[name="toAyah"] option').length,7);
 const from=form.querySelector('[name="fromSurah"]');from.value='2';event(from);
 assert.equal(form.querySelectorAll('[name="fromAyah"] option').length,286);
 let type=form.querySelector('[name="type"]');type.value='placement';event(type);await next();
 assert.equal(form.querySelectorAll('[name="fromSurah"] option').length,114);
 type.value='juz';event(type);await next();
 assert.equal(form.querySelectorAll('[name="juz"] option').length,30);
 assert.equal(form.querySelectorAll('[name="examDirection"]').length,2);
 form.querySelector('[name="juz"]').value='30';event(form.querySelector('[name="juz"]'));
 const nas=form.querySelector('[name="examDirection"][value="from_nas"]');nas.checked=true;event(nas);
 assert.equal(form.__v13GetSyllabus().juzNo,30);
 assert.equal(form.__v13GetSyllabus().direction,'from_nas');
 type.value='phased';event(type);await next();
 assert.deepEqual([...form.querySelector('[name="branch"]').options].map(o=>Number(o.value)),[5,10,15,20,30]);
 form.querySelector('[name="branch"]').value='15';event(form.querySelector('[name="branch"]'));
 const fromNas=form.querySelector('[name="examDirection"][value="from_nas"]');fromNas.checked=true;event(fromNas);
 const out=form.__v13GetSyllabus();
 assert.equal(out.fromJuz,16);assert.equal(out.toJuz,30);assert.equal(out.branch,3);
 assert(form.querySelector('[data-exam-summary]').textContent.includes('اختبار مرحلي'));
 console.log('PASS: modal shows Quran-aware surah/ayah lists, 30 parts, phased branches, directions, and balanced question sampling');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>window.close());
