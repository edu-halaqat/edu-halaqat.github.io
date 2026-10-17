/* Sanabil -> Jadeer: UI client never holds the Firebase shared secret.
 * Only a server-verified acknowledgement counts as delivered. */
(function(){
 "use strict";
 let lastCheck=0,ready=false;
 const available=async function(supabase){
   if(Date.now()-lastCheck<60000)return ready;
   lastCheck=Date.now();ready=false;
   try{
     const {data,error}=await supabase.functions.invoke("sanabil-jadeer-send",{method:"GET"});
     ready=!error&&data?.configured===true;
   }catch{}
   return ready;
 };
 const send=async function(supabase,requestId){
   if(!requestId)throw Error("رقم طلب الاختبار غير صالح.");
   const {data,error}=await supabase.functions.invoke("sanabil-jadeer-send",{body:{request_id:requestId}});
   if(error||data?.acknowledged!==true||data?.ok!==true||!data?.request_id)
     throw Error(data?.message||"حُفظ الترشيح في سنابل، لكن جدير لم يؤكد استلامه. استخدم إعادة الإرسال بعد إصلاح الاتصال.");
   return {remoteId:data.request_id,duplicate:!!data.duplicate};
 };
 window.SanabilJadeer=Object.freeze({available,send});
})();
