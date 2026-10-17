/* Session-only timings; no user data, request bodies, URLs, or credentials. */
(()=>{'use strict';
const samples=[];let active=0,lastInput=0,generation=0;
for(const event of ['pointerdown','keydown'])window.addEventListener(event,()=>{lastInput=performance.now()},{passive:true,capture:true});
const track=async(name,fn)=>{
 const started=performance.now(),g=generation;let ok=false;active++;
 try{const value=await fn();ok=true;return value}
 finally{active--;if(g===generation){samples.push({name,ms:Math.round(performance.now()-started),ok});if(samples.length>200)samples.shift()}}
};
const summary=()=>{
 const names=[...new Set(samples.map(x=>x.name))];
 return names.map(name=>{const all=samples.filter(x=>x.name===name),good=all.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b);
 return {name,count:good.length,errors:all.length-good.length,p95:good.length?good[Math.ceil(good.length*.95)-1]:null,under2s:good.length?Math.round(100*good.filter(x=>x<2000).length/good.length):null}});
};
async function runProbes(tasks,{signal,onUpdate=()=>{},rounds=3,timeout=12000}={}){
 const results=tasks.map(t=>({name:t.name,count:0,errors:0,mean:null,max:null,under2s:null,values:[]}));
 let done=0;const total=tasks.length*rounds,g=generation;
 onUpdate(results,done,total);
 for(let round=0;round<rounds;round++)for(let i=0;i<tasks.length;i++){
  if(signal?.aborted||g!==generation)return;
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  let timer;const started=performance.now(),r=results[i];active++;
  try{
   await Promise.race([tasks[i].run(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'))},timeout)})]);
   if(signal?.aborted||g!==generation)return;
   r.values.push(performance.now()-started);r.count=r.values.length;
   r.mean=r.values.reduce((a,b)=>a+b,0)/r.count;r.max=Math.max(...r.values);
   r.under2s=Math.round(100*r.values.filter(x=>x<2000).length/r.count);
  }catch(e){if(signal?.aborted||g!==generation)return;r.errors++}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active--}
  done++;onUpdate(results.map(({values,...r})=>({...r})),done,total);
 }
}
// True user-operated measurements only; neither student identifiers nor grades are kept.
const REAL_KEY='sanabil-real-timings-v1',REAL_KINDS=['open','switch','save_student','save_all','save_talaqqin'];
const realSamples=(()=>{
 try{
  const parsed=JSON.parse(sessionStorage.getItem(REAL_KEY)||'{}');
  return Object.fromEntries(REAL_KINDS.map(k=>[k,
   (Array.isArray(parsed[k])?parsed[k]:[]).filter(v=>Number.isFinite(v)&&v>=0&&v<120000).slice(-80)]));
 }catch{return Object.fromEntries(REAL_KINDS.map(k=>[k,[]]))}
})();
const recordActual=(kind,ms)=>{
 if(!REAL_KINDS.includes(kind)||!Number.isFinite(ms)||ms<0||ms>120000)return;
 realSamples[kind].push(Math.round(ms*10)/10);
 if(realSamples[kind].length>80)realSamples[kind].shift();
 try{sessionStorage.setItem(REAL_KEY,JSON.stringify(realSamples))}catch{}
 window.dispatchEvent(new CustomEvent('sanabil-real-performance-updated'));
};
const actualSummary=()=>REAL_KINDS.map(kind=>{
 const v=realSamples[kind].slice().sort((a,b)=>a-b),count=v.length;
 return {kind,count,mean:count?v.reduce((a,b)=>a+b,0)/count:null,
  p95:count?v[Math.ceil(count*.95)-1]:null,
  max:count?v[count-1]:null,
  under2s:count?Math.round(100*v.filter(x=>x<2000).length/count):null};
});
const clearActual=()=>{
 for(const kind of REAL_KINDS)realSamples[kind].length=0;
 try{sessionStorage.removeItem(REAL_KEY)}catch{}
 window.dispatchEvent(new CustomEvent('sanabil-real-performance-updated'));
};
const afterPaintActual=(kind,started,ready=()=>true)=>{
 if(!Number.isFinite(started)||typeof requestAnimationFrame!=='function')return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(document.visibilityState==='hidden'||!ready())return;
  recordActual(kind,performance.now()-started);
 }));
};
window.SanabilPerformance={record:(name,ms)=>{samples.push({name,ms:Math.round(ms),ok:true});if(samples.length>200)samples.shift()},track,summary,runProbes,recordActual,actualSummary,clearActual,afterPaintActual,backgroundReady:()=>active===0&&performance.now()-lastInput>5000};
window.addEventListener('sanabil-session-changed',()=>{generation++;samples.length=0});
})();