import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });

const headers = {
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":"https://edu-halaqat.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});

function localParts(timeZone:string){
  const now=new Date();
  const p=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(now);
  const get=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return {
    apiDate:`${get("day")}-${get("month")}-${get("year")}`,
    dateKey:`${get("year")}-${get("month")}-${get("day")}`,
    minutes:Number(get("hour"))*60+Number(get("minute")),
  };
}
const cleanTime=(v:unknown,fallback:string)=>{
  const m=String(v??"").match(/^(\d{1,2}):(\d{2})/);
  if(!m)return fallback;
  return `${String(Math.max(0,Math.min(23,Number(m[1])))).padStart(2,"0")}:${String(Math.max(0,Math.min(59,Number(m[2])))).padStart(2,"0")}`;
};
const toMin=(t:string)=>{const [h,m]=t.split(":").map(Number);return h*60+m};
const fmt=(n:number)=>{n=((n%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`};

async function timings(lat:number,lng:number,timeZone:string){
  const {apiDate,dateKey}=localParts(timeZone);
  try{
    const u=`https://api.aladhan.com/v1/timings/${encodeURIComponent(apiDate)}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=4&school=0&timezonestring=${encodeURIComponent(timeZone)}&calendarMethod=UAQ`;
    const r=await fetch(u,{headers:{"user-agent":"Sanabil-AlWahy/2.1"},signal:AbortSignal.timeout(6000)});
    if(!r.ok)throw Error('prayer service');
    const j=await r.json(),t=j?.data?.timings;
    if(j?.code!==200||!t)throw Error('prayer response');
    const times:any={};
    for(const name of ['Fajr','Dhuhr','Asr','Maghrib','Isha']){
      const raw=String(t[name]||'');
      if(!/^([01]\d|2[0-3]):[0-5]\d(?:$|\s)/.test(raw))throw Error('invalid prayer time');
      times[name]=raw.slice(0,5);
    }
    return {dateKey,source:'aladhan-umm-al-qura',times};
  }catch{throw Error('تعذر جلب مواقيت الصلاة المعتمدة اليوم؛ أعد المحاولة. لم تُستخدم أوقات افتراضية لتسجيل البصمة.');}
}

function cfgFrom(mosque:any){
  const first=Array.isArray(mosque.attendance_windows)&&mosque.attendance_windows[0]&&typeof mosque.attendance_windows[0]==="object"?mosque.attendance_windows[0]:{};
  const weekdays=Array.isArray(first.weekdays)&&first.weekdays.length?first.weekdays.map(String):["0","1","2","3","4"];
  return {
    startPrayer:["Fajr","Dhuhr","Asr","Maghrib","Isha"].includes(first.startPrayer)?first.startPrayer:"Asr",
    endPrayer:["Fajr","Dhuhr","Asr","Maghrib","Isha"].includes(first.endPrayer)?first.endPrayer:"Maghrib",
    lateAllowMinutes:Number.isFinite(Number(first.lateAllowMinutes))?Math.max(0,Math.min(180,Number(first.lateAllowMinutes))):15,
    earlyArrivalMinutes:Number.isFinite(Number(first.earlyArrivalMinutes))?Math.max(0,Math.min(180,Number(first.earlyArrivalMinutes))):15,
    earlyLeaveMinutes:Number.isFinite(Number(first.earlyLeaveMinutes))?Math.max(0,Math.min(180,Number(first.earlyLeaveMinutes))):15,
    absenceAfterMinutes:Number.isFinite(Number(first.absenceAfterMinutes))?Math.max(0,Math.min(360,Number(first.absenceAfterMinutes))):60,
    checkoutGraceMinutes:Number.isFinite(Number(first.checkoutGraceMinutes))?Math.max(0,Math.min(360,Number(first.checkoutGraceMinutes))):120,
    weekdays
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return reply({error:"الطريقة غير مدعومة."},405);
  try{
    const authHeader=req.headers.get("Authorization")||"";
    if(!authHeader.startsWith("Bearer "))return reply({error:"يلزم تسجيل الدخول."},401);
    const token=authHeader.slice(7);
    const {data:auth,error:ae}=await admin.auth.getUser(token);
    if(ae||!auth.user)return reply({error:"جلسة الدخول غير صالحة."},401);
    const user=auth.user;
    const {data:profile,error:pe}=await admin.from('profiles').select('active').eq('id',user.id).maybeSingle();
    if(pe||!profile?.active)return reply({error:'الحساب غير نشط.'},403);
    const b=await req.json().catch(()=>({}));
    const action=String(b.action||"");
    const mosqueId=String(b.mosqueId||b.mosque_id||"");
    const circleId=String(b.circleId||b.circle_id||"");
    if(!["checkIn","checkOut","window"].includes(action))throw Error("نوع الطلب غير صالح.");
    if(!mosqueId||!circleId)throw Error("بيانات المسجد أو الحلقة غير مكتملة.");

    const [{data:circle,error:ce},{data:mosque,error:me}]=await Promise.all([
      admin.from("circles").select("id,org_id,complex_id,mosque_id,active").eq("id",circleId).eq("active",true).maybeSingle(),
      admin.from("mosques").select("id,org_id,complex_id,name,latitude,longitude,radius_meters,timezone,attendance_windows,active").eq("id",mosqueId).eq("active",true).maybeSingle()
    ]);
    if(ce)throw ce;if(me)throw me;
    if(!circle||!mosque)throw Error("المسجد أو الحلقة غير موجود أو غير نشط.");
    if(circle.mosque_id!==mosque.id||circle.org_id!==mosque.org_id||circle.complex_id!==mosque.complex_id)throw Error("الحلقة لا تتبع هذا المسجد.");

    const {data:memberships,error:mse}=await admin.from("memberships").select("role,org_id,complex_id,circle_id,active").eq("user_id",user.id).eq("active",true);
    if(mse)throw mse;
    const allowed=(memberships||[]).some((m:any)=>{
      if(m.org_id!==mosque.org_id)return false;
      if(m.role==="admin"||m.role==="manager")return true;
      if(m.role==="supervisor")return m.complex_id===mosque.complex_id;
      if(m.role==="teacher")return m.circle_id===circle.id;
      return false;
    });
    if(!allowed)throw Error("لا تملك صلاحية الوصول إلى هذه الحلقة.");

    const timeZone=String(mosque.timezone||"Asia/Riyadh");
    const cfg=cfgFrom(mosque);
    const prayer=await timings(Number(mosque.latitude),Number(mosque.longitude),timeZone);
    let start=toMin(prayer.times[cfg.startPrayer as keyof typeof prayer.times]);
    let end=toMin(prayer.times[cfg.endPrayer as keyof typeof prayer.times]);
    if(end<=start)end+=1440;
    const checkInOpen=start-cfg.earlyArrivalMinutes;
    const lateUntil=start+cfg.lateAllowMinutes;
    const absenceAt=start+cfg.absenceAfterMinutes;
    const checkInClose=Math.min(end,absenceAt);
    const checkOutOpen=Math.max(start,end-cfg.earlyLeaveMinutes);
    const checkOutClose=end+cfg.checkoutGraceMinutes;

    const windows=[
      {action:"checkIn",weekdays:cfg.weekdays,start:fmt(checkInOpen),end:fmt(checkInClose),startPrayer:cfg.startPrayer,endPrayer:cfg.endPrayer,
       prayerStart:fmt(start),prayerEnd:fmt(end),lateUntil:fmt(lateUntil),absenceAt:fmt(absenceAt),
       lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,earlyLeaveMinutes:cfg.earlyLeaveMinutes,
       absenceAfterMinutes:cfg.absenceAfterMinutes,checkoutGraceMinutes:cfg.checkoutGraceMinutes,source:prayer.source,dateKey:prayer.dateKey},
      {action:"checkOut",weekdays:cfg.weekdays,start:fmt(checkOutOpen),end:fmt(checkOutClose),startPrayer:cfg.startPrayer,endPrayer:cfg.endPrayer,
       prayerStart:fmt(start),prayerEnd:fmt(end),checkoutOpen:fmt(checkOutOpen),
       lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,earlyLeaveMinutes:cfg.earlyLeaveMinutes,
       absenceAfterMinutes:cfg.absenceAfterMinutes,checkoutGraceMinutes:cfg.checkoutGraceMinutes,source:prayer.source,dateKey:prayer.dateKey}
    ];
    const {error:uwe}=await admin.from("mosques").update({attendance_windows:windows,updated_at:new Date().toISOString()}).eq("id",mosque.id);
    if(uwe)throw uwe;

    const lp=localParts(timeZone);
    const current=lp.minutes;
    const normalizedCurrent=current<start-720?current+1440:current;
    const info={
      mosqueId:mosque.id,mosqueName:mosque.name,dateKey:prayer.dateKey,
      start:fmt(start),end:fmt(end),source:prayer.source,
      prayerStart:fmt(start),prayerEnd:fmt(end),
      checkInOpen:fmt(checkInOpen),lateUntil:fmt(lateUntil),checkInClose:fmt(checkInClose),absenceAt:fmt(absenceAt),
      checkOutOpen:fmt(checkOutOpen),checkOutClose:fmt(checkOutClose),
      lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,
      earlyLeaveMinutes:cfg.earlyLeaveMinutes,absenceAfterMinutes:cfg.absenceAfterMinutes,
      checkoutGraceMinutes:cfg.checkoutGraceMinutes,radiusMeters:mosque.radius_meters,weekdays:cfg.weekdays,
      latitude:Number(mosque.latitude),longitude:Number(mosque.longitude)
    };
    if(action==="window")return reply({ok:true,window:info});

    const dayName=new Intl.DateTimeFormat("en-US",{timeZone,weekday:"short"}).format(new Date());
    const dow={Sun:"0",Mon:"1",Tue:"2",Wed:"3",Thu:"4",Fri:"5",Sat:"6"}[dayName]??"";
    if(!cfg.weekdays.includes(dow)) throw Error("هذا اليوم ليس من أيام الدوام المعتمدة للحلقة.");

    const inOpen=checkInOpen<0?checkInOpen+1440:checkInOpen;
    const inClose=checkInClose<0?checkInClose+1440:checkInClose;
    const outOpen=checkOutOpen<0?checkOutOpen+1440:checkOutOpen;
    const outClose=checkOutClose<0?checkOutClose+1440:checkOutClose;
    if(action==="checkIn" && (normalizedCurrent<inOpen || normalizedCurrent>inClose)){
      throw Error(`تسجيل الحضور متاح من ${fmt(checkInOpen)} إلى ${fmt(checkInClose)}. وقت أذان ${cfg.startPrayer==="Asr"?"العصر":cfg.startPrayer==="Fajr"?"الفجر":cfg.startPrayer==="Dhuhr"?"الظهر":cfg.startPrayer==="Maghrib"?"المغرب":"العشاء"} اليوم ${fmt(start)}.`);
    }
    if(action==="checkOut" && (normalizedCurrent<outOpen || normalizedCurrent>outClose)){
      throw Error(`تسجيل الانصراف متاح من ${fmt(checkOutOpen)} إلى ${fmt(checkOutClose)}. وقت أذان ${cfg.endPrayer==="Maghrib"?"المغرب":cfg.endPrayer==="Isha"?"العشاء":cfg.endPrayer==="Asr"?"العصر":cfg.endPrayer==="Dhuhr"?"الظهر":"الفجر"} اليوم ${fmt(end)}.`);
    }

    const latitude=Number(b.latitude),longitude=Number(b.longitude),accuracy=Number(b.accuracy);
    if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180||!Number.isFinite(accuracy)||accuracy<0)
      throw Error("تعذر اعتماد بيانات الموقع الحالية.");

    const {data:teacher,error:te}=await admin.from("teachers").select("id").eq("user_id",user.id).eq("org_id",mosque.org_id).eq("complex_id",mosque.complex_id).eq("circle_id",circle.id).eq("active",true).maybeSingle();
    if(te)throw te;if(!teacher)throw Error("الخدمة متاحة للمعلم المسند إلى الحلقة فقط.");

    const caller=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await caller.rpc("register_attendance",{p_action:action,p_mosque_id:mosque.id,p_circle_id:circle.id,p_latitude:latitude,p_longitude:longitude,p_accuracy:accuracy});
    if(error)throw error;

    const late=action==="checkIn"?Math.max(0,normalizedCurrent-(start+cfg.lateAllowMinutes)):undefined;
    const earlyArrival=action==="checkIn"?Math.max(0,start-normalizedCurrent):undefined;
    const earlyLeave=action==="checkOut"?Math.max(0,end-normalizedCurrent):undefined;
    const patch:any={updated_at:new Date().toISOString()};
    if(action==="checkIn"){patch.late_minutes=late;patch.early_arrival_minutes=earlyArrival;}
    if(action==="checkOut"){patch.early_leave_minutes=earlyLeave;}
    if(!data?.duplicate)await admin.from("attendance").update(patch).eq("user_id",user.id).eq("circle_id",circle.id).eq("date_key",data?.dateKey||prayer.dateKey);

    return reply({...data,window:info,lateMinutes:late,earlyArrivalMinutes:earlyArrival,earlyLeaveMinutes:earlyLeave});
  }catch(e){
    return reply({error:e instanceof Error?e.message:"تعذر تنفيذ طلب الحضور."},400);
  }
});

