/* Cross-device operational timing. No form values, student identifiers, grades,
 * free text, URLs, tokens, or raw device identifiers are collected. */
(()=>{'use strict';if(window.SanabilTelemetry)return;
 const queue=[],MAX_QUEUE=180;
 const allowed=new Set(['action','rpc','navigation','render','save','ui']);
 const sanitize=value=>String(value||'').replace(/[0-9a-f]{8}-[0-9a-f-]{24,}/gi,'#').replace(/[0-9]+/g,'#').replace(/[^a-zA-Z0-9_:#-]/g,'_').slice(0,80)||'unknown';
 const area=()=>{const known=['dashboard','students','outcomes','plans','attendance','tests','supervision','reports','settings','inquiries'];const h=(location.hash||'').toLowerCase();return known.find(k=>h.includes(k))||'app'};
 const device=()=>innerWidth<=680?'mobile':innerWidth<=1050?'tablet':'desktop';
 let pending=null,scheduled=null,losses=0;
 const record=(kind,operation,ms=0,status='ok',screen=area())=>{
  if(!allowed.has(kind))return;
  const num=Math.round(Number(ms)||0);
  if(num<0||num>120000)return;
  if(queue.length>=MAX_QUEUE){queue.shift();losses++}
  queue.push({kind,operation:sanitize(operation),area:sanitize(screen).slice(0,32),
   status:['ok','error','queued'].includes(status)?status:'error',
   ms:num,device:device()});
  if(queue.length>=24)void flush();
 };
 const flush=async()=>{
  if(pending||!queue.length||!navigator.onLine||!window.supabaseClient)return;
  const auth=window.supabaseClient.auth;
  const session=await auth?.getSession?.().catch(()=>null);
  if(!session?.data?.session?.user?.id)return;
  const batch=queue.splice(0,30);
  pending=window.supabaseClient.rpc('record_client_performance',{p_events:batch});
  try{const reply=await pending;if(reply?.error)throw reply.error}
  catch(error){
   // On transient network errors keep the bounded unsent queue; never disrupt work.
   queue.unshift(...batch);while(queue.length>MAX_QUEUE){queue.pop();losses++}
  }finally{pending=null}
 };
 const schedule=()=>{if(scheduled)return;scheduled=setInterval(()=>{void flush()},25000)};
 document.addEventListener('click',event=>{
  const b=event.target?.closest?.('button,[role="button"],a[data-action]');
  if(!b)return;
  const action=b.dataset?.action;
  const op=action?'click:'+sanitize(action):'click:generic';
  record('ui',op,0,'ok');
 },{capture:true,passive:true});
 document.addEventListener('change',event=>{
  const el=event.target;if(!el?.matches?.('select,input[type="checkbox"],input[type="radio"],input[type="date"]'))return;
  record('ui','change:'+sanitize(el.type||el.tagName||'input'),0,'ok');
 },{capture:true,passive:true});
 addEventListener('hashchange',()=>record('navigation','view:'+area(),0,'ok'),{passive:true});
 addEventListener('online',()=>void flush(),{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void flush()},{passive:true});
 schedule();
 window.SanabilTelemetry={record,flush,stats:()=>({pending:queue.length,discarded:losses})};
})();
