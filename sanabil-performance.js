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
window.SanabilPerformance={record:(name,ms)=>{samples.push({name,ms:Math.round(ms),ok:true});if(samples.length>200)samples.shift()},track,summary,runProbes,backgroundReady:()=>active===0&&performance.now()-lastInput>5000};
window.addEventListener('sanabil-session-changed',()=>{generation++;samples.length=0});
})();