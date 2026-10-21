/* Lightweight on-demand modules. A failed download never changes the teacher's saved work. */
(()=>{'use strict';
 if(window.SanabilLazy)return;
 const pending=new Map();
 const modules=Object.freeze({
  deepPerformance:{
   url:'/sanabil-performance-deep.js?v=20261022-demand1',
   ready:()=>Boolean(window.SanabilDeepPerformance?.run)
  }
 });
 const load=name=>{
  const item=modules[name];if(!item)return Promise.reject(Error('وحدة غير معروفة'));
  if(item.ready())return Promise.resolve(true);
  if(pending.has(name))return pending.get(name);
  const p=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=item.url;
   script.async=true;
   script.onload=()=>item.ready()?resolve(true):reject(Error('تعذر تفعيل الوحدة بعد تنزيلها'));
   script.onerror=()=>reject(Error('تعذر تحميل الوحدة المطلوبة؛ افحص الاتصال وأعد المحاولة.'));
   (document.head||document.documentElement).appendChild(script);
  }).catch(error=>{pending.delete(name);throw error});
  pending.set(name,p);return p;
 };
 window.SanabilLazy={load,loadDeepPerformance:()=>load('deepPerformance')};
})();
