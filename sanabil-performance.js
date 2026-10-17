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
window.SanabilPerformance={track,summary,backgroundReady:()=>active===0&&performance.now()-lastInput>5000};
window.addEventListener('sanabil-session-changed',()=>{generation++;samples.length=0});
})();