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
const PRAYERS=["Fajr","Dhuhr","Asr","Maghrib","Isha"];

function localParts(timeZone:string){
  const now=new Date();
  const p=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",weekday:"short"}).formatToParts(now);
  const get=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return {apiDate:`${get("day")}-${get("month")}-${get("year")}`,dateKey:`${get("year")}-${get("month")}-${get("day")}`,minutes:Number(get("hour"))*60+Number(get("minute"))};
}
const toMin=(t:string)=>{const [h,m]=String(t||"00:00").split(":").map(Number);return h*60+m};
const fmt=(n:number)=>{n=((n%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`};

async function timings(lat:number,lng:number,timeZone:string){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error("موقع المسجد غير مضبوط؛ حدده من إعدادات البصمة.");
  const {apiDate,dateKey}=localParts(timeZone);
  try{
    const u=`https://api.aladhan.com/v1/timings/${encodeURIComponent(apiDate)}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&method=4&school=0&timezonestring=${encodeURIComponent(timeZone)}&calendarMethod=UAQ`;
    const r=await fetch(u,{headers:{"user-agent":"Sanabil-AlWahy/3.0"},signal:AbortSignal.timeout(6000)});
    if(!r.ok)throw Error("prayer service");
    const j=await r.json(),t=j?.data?.timings;
    if(j?.code!==200||!t)throw Error("prayer response");
    const times:any={};
    for(const name of PRAYERS){
      const raw=String(t[name]||"");
      if(!/^([01]\d|2[0-3]):[0-5]\d(?:$|\s)/.test(raw))throw Error("invalid prayer time");
      times[name]=raw.slice(0,5);
    }
    return {dateKey,source:"aladhan-umm-al-qura",times};
  }catch{throw Error("تعذر جلب مواقيت الصلاة المعتمدة اليوم؛ أعد المحاولة.");}
}

function defaultsForPeriod(period:string){
  if(period.includes("الفجر"))return {startPrayer:"Fajr",endPrayer:"Dhuhr",durationMinutes:90};
  if(period.includes("الظهر"))return {startPrayer:"Dhuhr",endPrayer:"Asr",durationMinutes:0};
  if(period.includes("العصر"))return {startPrayer:"Asr",endPrayer:"Maghrib",durationMinutes:0};
  if(period.includes("المغرب"))return {startPrayer:"Maghrib",endPrayer:"Isha",durationMinutes:0};
  if(period.includes("العشاء"))return {startPrayer:"Isha",endPrayer:"Isha",durationMinutes:90};
  return {startPrayer:"Asr",endPrayer:"Maghrib",durationMinutes:120};
}
function cfgFrom(mosque:any,circle:any){
  const period=String(circle?.session_period||"غير محدد");
  const raw=Array.isArray(mosque.attendance_windows)?mosque.attendance_windows.filter((x:any)=>x&&typeof x==="object"):[];
  const config=raw.find((x:any)=>x.kind==="config"&&String(x.period||"")===period)
    || raw.find((x:any)=>!x.dateKey&&String(x.period||"")===period)
    || raw.find((x:any)=>x.kind==="config"&&!x.period)
    || {};
  const legacy=raw.find((x:any)=>x.dateKey)||{};
  const d=defaultsForPeriod(period),src=Object.keys(config).length?config:legacy;
  const weekdays=Array.isArray(src.weekdays)&&src.weekdays.length?src.weekdays.map(String):["0","1","2","3","4"];
  return {
    period,
    startPrayer:PRAYERS.includes(src.startPrayer)?src.startPrayer:d.startPrayer,
    endPrayer:PRAYERS.includes(src.endPrayer)?src.endPrayer:d.endPrayer,
    durationMinutes:Number.isFinite(Number(src.durationMinutes))?Math.max(0,Math.min(360,Number(src.durationMinutes))):d.durationMinutes,
    lateAllowMinutes:Number.isFinite(Number(src.lateAllowMinutes))?Math.max(0,Math.min(180,Number(src.lateAllowMinutes))):15,
    earlyArrivalMinutes:Number.isFinite(Number(src.earlyArrivalMinutes))?Math.max(0,Math.min(180,Number(src.earlyArrivalMinutes))):15,
    earlyLeaveMinutes:Number.isFinite(Number(src.earlyLeaveMinutes))?Math.max(0,Math.min(180,Number(src.earlyLeaveMinutes))):15,
    absenceAfterMinutes:Number.isFinite(Number(src.absenceAfterMinutes))?Math.max(0,Math.min(360,Number(src.absenceAfterMinutes))):60,
    checkoutGraceMinutes:Number.isFinite(Number(src.checkoutGraceMinutes))?Math.max(0,Math.min(360,Number(src.checkoutGraceMinutes))):120,
    weekdays
  };
}
function extractCoords(raw:string){
  const candidates=[
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query)=(-?\d{1,2}\.\d+)%?2C(-?\d{1,3}\.\d+)/i,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/i
  ];
  for(const re of candidates){const m=raw.match(re);if(m){const latitude=Number(m[1]),longitude=Number(m[2]);if(latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180)return {latitude,longitude};}}
  return null;
}
async function resolveGoogleMapUrl(input:string){
  let u:URL;try{u=new URL(input)}catch{throw Error("ألصق رابط خرائط Google صحيحًا.");}
  const allowed=["maps.google.com","www.google.com","google.com","maps.app.goo.gl","goo.gl"];
  if(!allowed.some(h=>u.hostname===h||u.hostname.endsWith("."+h)))throw Error("يجب أن يكون الرابط من خرائط Google.");
  let c=extractCoords(u.toString()); if(c)return c;
  const r=await fetch(u.toString(),{redirect:"follow",signal:AbortSignal.timeout(7000),headers:{"user-agent":"Mozilla/5.0 Sanabil-AlWahy/3.0"}});
  c=extractCoords(r.url); if(c)return c;
  const body=(await r.text()).slice(0,500000); c=extractCoords(body); if(c)return c;
  throw Error("لم أستطع استخراج الإحداثيات من الرابط؛ افتح النقطة في خرائط Google ثم انسخ رابط المشاركة مجددًا.");
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
    const {data:profile,error:pe}=await admin.from("profiles").select("active").eq("id",user.id).maybeSingle();
    if(pe||!profile?.active)return reply({error:"الحساب غير نشط."},403);
    const b=await req.json().catch(()=>({}));
    const action=String(b.action||"");

    if(action==="resolveMapUrl"){
      const coords=await resolveGoogleMapUrl(String(b.url||""));
      return reply({ok:true,...coords});
    }

    const mosqueId=String(b.mosqueId||b.mosque_id||"");
    const circleId=String(b.circleId||b.circle_id||"");
    if(!["checkIn","checkOut","window"].includes(action))throw Error("نوع الطلب غير صالح.");
    if(!mosqueId||!circleId)throw Error("بيانات المسجد أو الحلقة غير مكتملة.");

    const [{data:circle,error:ce},{data:mosque,error:me}]=await Promise.all([
      admin.from("circles").select("id,org_id,complex_id,mosque_id,active,session_period").eq("id",circleId).eq("active",true).maybeSingle(),
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
      if(m.role==="teacher")return m.complex_id===mosque.complex_id;
      return false;
    });
    if(!allowed)throw Error("لا تملك صلاحية الوصول إلى هذه الحلقة.");

    const timeZone=String(mosque.timezone||"Asia/Riyadh");
    const cfg=cfgFrom(mosque,circle);
    const prayer=await timings(Number(mosque.latitude),Number(mosque.longitude),timeZone);
    let start=toMin(prayer.times[cfg.startPrayer]);
    let end=cfg.durationMinutes>0?start+cfg.durationMinutes:toMin(prayer.times[cfg.endPrayer]);
    if(end<=start)end+=1440;
    const checkInOpen=start-cfg.earlyArrivalMinutes;
    const lateUntil=start+cfg.lateAllowMinutes;
    const absenceAt=start+cfg.absenceAfterMinutes;
    const checkInClose=Math.min(end,absenceAt);
    // استثناء الخميس: يبدأ وقت الانصراف قبل نهاية الفترة بثلاثين دقيقة.
    const isThursday=new Date(prayer.dateKey+'T12:00:00Z').getUTCDay()===4;
    const checkoutEarlyMinutes=isThursday?Math.max(30,cfg.earlyLeaveMinutes):cfg.earlyLeaveMinutes;
    const checkOutOpen=Math.max(start,end-checkoutEarlyMinutes);
    const checkOutClose=end+cfg.checkoutGraceMinutes;

    const windows=[
      {kind:"runtime",period:cfg.period,action:"checkIn",weekdays:cfg.weekdays,start:fmt(checkInOpen),end:fmt(checkInClose),startPrayer:cfg.startPrayer,endPrayer:cfg.endPrayer,prayerStart:fmt(start),prayerEnd:fmt(end),lateUntil:fmt(lateUntil),absenceAt:fmt(absenceAt),lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,earlyLeaveMinutes:checkoutEarlyMinutes,absenceAfterMinutes:cfg.absenceAfterMinutes,checkoutGraceMinutes:cfg.checkoutGraceMinutes,durationMinutes:cfg.durationMinutes,source:prayer.source,dateKey:prayer.dateKey},
      {kind:"runtime",period:cfg.period,action:"checkOut",weekdays:cfg.weekdays,start:fmt(checkOutOpen),end:fmt(checkOutClose),startPrayer:cfg.startPrayer,endPrayer:cfg.endPrayer,prayerStart:fmt(start),prayerEnd:fmt(end),checkoutOpen:fmt(checkOutOpen),lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,earlyLeaveMinutes:checkoutEarlyMinutes,absenceAfterMinutes:cfg.absenceAfterMinutes,checkoutGraceMinutes:cfg.checkoutGraceMinutes,durationMinutes:cfg.durationMinutes,source:prayer.source,dateKey:prayer.dateKey}
    ];
    const existing=Array.isArray(mosque.attendance_windows)?mosque.attendance_windows.filter((x:any)=>x&&typeof x==="object"):[];
    const kept=existing.filter((x:any)=>{
      if(x.kind==="config"||!x.dateKey)return true;
      return !(String(x.period||"")===cfg.period && String(x.dateKey||"")===prayer.dateKey);
    });
    const merged=[...kept,...windows].slice(-80);
    const {error:uwe}=await admin.from("mosques").update({attendance_windows:merged,updated_at:new Date().toISOString()}).eq("id",mosque.id);
    if(uwe)throw uwe;

    const lp=localParts(timeZone),current=lp.minutes,normalizedCurrent=current<start-720?current+1440:current;
    const info={mosqueId:mosque.id,mosqueName:mosque.name,dateKey:prayer.dateKey,period:cfg.period,start:fmt(start),end:fmt(end),source:prayer.source,prayerStart:fmt(start),prayerEnd:fmt(end),checkInOpen:fmt(checkInOpen),lateUntil:fmt(lateUntil),checkInClose:fmt(checkInClose),absenceAt:fmt(absenceAt),checkOutOpen:fmt(checkOutOpen),checkOutClose:fmt(checkOutClose),lateAllowMinutes:cfg.lateAllowMinutes,earlyArrivalMinutes:cfg.earlyArrivalMinutes,earlyLeaveMinutes:checkoutEarlyMinutes,absenceAfterMinutes:cfg.absenceAfterMinutes,checkoutGraceMinutes:cfg.checkoutGraceMinutes,radiusMeters:mosque.radius_meters,weekdays:cfg.weekdays,latitude:Number(mosque.latitude),longitude:Number(mosque.longitude)};
    if(action==="window")return reply({ok:true,window:info});

    const dayName=new Intl.DateTimeFormat("en-US",{timeZone,weekday:"short"}).format(new Date());
    const dow={Sun:"0",Mon:"1",Tue:"2",Wed:"3",Thu:"4",Fri:"5",Sat:"6"}[dayName]??"";
    if(!cfg.weekdays.includes(dow))throw Error("هذا اليوم ليس من أيام الدوام المعتمدة للحلقة.");
    const inOpen=checkInOpen<0?checkInOpen+1440:checkInOpen,inClose=checkInClose<0?checkInClose+1440:checkInClose,outOpen=checkOutOpen<0?checkOutOpen+1440:checkOutOpen,outClose=checkOutClose<0?checkOutClose+1440:checkOutClose;
    if(action==="checkIn"&&(normalizedCurrent<inOpen||normalizedCurrent>inClose))throw Error(`تسجيل الحضور لفترة «${cfg.period}» متاح من ${fmt(checkInOpen)} إلى ${fmt(checkInClose)}.`);
    if(action==="checkOut"&&(normalizedCurrent<outOpen||normalizedCurrent>outClose))throw Error(`تسجيل الانصراف لفترة «${cfg.period}» متاح من ${fmt(checkOutOpen)} إلى ${fmt(checkOutClose)}.`);

    const latitude=Number(b.latitude),longitude=Number(b.longitude),accuracy=Number(b.accuracy);
    if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180||!Number.isFinite(accuracy)||accuracy<0)throw Error("تعذر اعتماد بيانات الموقع الحالية.");
    const {data:teacherRows,error:te}=await admin.from("teachers").select("id,circle_id").eq("user_id",user.id).eq("org_id",mosque.org_id).eq("complex_id",mosque.complex_id).eq("active",true);
    if(te)throw te;
    let teacher=(teacherRows||[]).find((t:any)=>t.circle_id===circle.id)||null;
    if(!teacher&&teacherRows?.length){
      const ids=teacherRows.map((t:any)=>t.id);
      const {data:links,error:le}=await admin.from("circle_teachers").select("teacher_id").eq("circle_id",circle.id).eq("active",true).in("teacher_id",ids);
      if(le)throw le;
      if(links?.length)teacher=teacherRows.find((t:any)=>t.id===links[0].teacher_id)||null;
    }
    if(!teacher)throw Error("الخدمة متاحة للمعلم المسند إلى الحلقة فقط.");

    const late=action==="checkIn"?Math.max(0,normalizedCurrent-(start+cfg.lateAllowMinutes)):undefined;
    const earlyArrival=action==="checkIn"?Math.max(0,start-normalizedCurrent):undefined;
    const earlyLeave=action==="checkOut"?Math.max(0,end-normalizedCurrent):undefined;

    let data:any=null;
    if(teacher.circle_id===circle.id){
      const caller=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      const r=await caller.rpc("register_attendance",{p_action:action,p_mosque_id:mosque.id,p_circle_id:circle.id,p_latitude:latitude,p_longitude:longitude,p_accuracy:accuracy});
      if(r.error)throw r.error;
      data=r.data;
    }else{
      const maxAccuracy=150;
      if(accuracy>maxAccuracy)throw Error(`دقة الموقع الحالية (${Math.round(accuracy)} متر) أضعف من الحد المطلوب (${maxAccuracy} متر).`);
      const rad=(v:number)=>v*Math.PI/180;
      const a=Math.sin(rad(Number(mosque.latitude)-latitude)/2)**2
        + Math.cos(rad(latitude))*Math.cos(rad(Number(mosque.latitude)))
        * Math.sin(rad(Number(mosque.longitude)-longitude)/2)**2;
      const distance=6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,a))));
      if(distance>Number(mosque.radius_meters))throw Error(`أنت خارج النطاق المسموح (${Math.round(distance)} متر).`);
      const {data:existing,error:xe}=await admin.from("attendance").select("*").eq("user_id",user.id).eq("circle_id",circle.id).eq("date_key",prayer.dateKey).maybeSingle();
      if(xe)throw xe;
      let duplicate=false,worked=0;
      if(action==="checkIn"){
        if(existing){duplicate=true}
        else{
          const row={org_id:mosque.org_id,complex_id:mosque.complex_id,circle_id:circle.id,mosque_id:mosque.id,teacher_id:teacher.id,user_id:user.id,date_key:prayer.dateKey,check_in_at:new Date().toISOString(),check_in_location:{latitude,longitude,accuracy,distanceM:Math.round(distance)},status:"checked_in",created_by:user.id,updated_by:user.id,late_minutes:late||0,early_arrival_minutes:earlyArrival||0};
          const ir=await admin.from("attendance").insert(row).select("id,status").single();if(ir.error)throw ir.error;
        }
      }else{
        if(!existing?.check_in_at)throw Error("سجل الحضور أولًا.");
        if(existing.check_out_at){duplicate=true;worked=Number(existing.worked_minutes||0)}
        else{
          worked=Math.max(0,Math.round((Date.now()-new Date(existing.check_in_at).getTime())/60000));
          const ur=await admin.from("attendance").update({check_out_at:new Date().toISOString(),check_out_location:{latitude,longitude,accuracy,distanceM:Math.round(distance)},worked_minutes:worked,status:"completed",early_leave_minutes:earlyLeave||0,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",existing.id);if(ur.error)throw ur.error;
        }
      }
      data={ok:true,dateKey:prayer.dateKey,distanceM:Math.round(distance),radiusM:mosque.radius_meters,accuracyM:Math.round(accuracy),accuracyMaxM:maxAccuracy,workedMinutes:worked,duplicate,status:action==="checkIn"?"checked_in":"completed"};
    }

    const patch:any={updated_at:new Date().toISOString()};
    if(action==="checkIn"){patch.late_minutes=late;patch.early_arrival_minutes=earlyArrival;}
    if(action==="checkOut"){patch.early_leave_minutes=earlyLeave;}
    if(!data?.duplicate)await admin.from("attendance").update(patch).eq("user_id",user.id).eq("circle_id",circle.id).eq("date_key",data?.dateKey||prayer.dateKey);
    return reply({...data,window:info,lateMinutes:late,earlyArrivalMinutes:earlyArrival,earlyLeaveMinutes:earlyLeave});
  }catch(e){
    return reply({error:e instanceof Error?e.message:"تعذر تنفيذ طلب الحضور."},400);
  }
});
