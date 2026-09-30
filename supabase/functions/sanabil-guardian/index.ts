import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.1";

const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={
  "Access-Control-Allow-Origin":"https://edu-halaqat.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer"
};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return out({error:"الطريقة غير مدعومة."},405);
  try{
    const body=await req.json().catch(()=>({}));
    const code=String(body.code||"").trim().toUpperCase();
    if(!/^[A-F0-9]{32}$/.test(code)) return out({error:"رمز ولي الأمر غير صالح."},400);

    const {data:g,error:ge}=await db.from("guardian_access")
      .select("student_id,org_id,complex_id,circle_id,active,expires_at")
      .eq("access_code",code).maybeSingle();
    if(ge) throw ge;
    if(!g||!g.active||new Date(g.expires_at).getTime()<=Date.now())
      return out({error:"الرابط غير صالح أو انتهت صلاحيته."},404);

    const {data:s,error:se}=await db.from("students")
      .select("id,full_name,circle_id,teacher_id,active")
      .eq("id",g.student_id).maybeSingle();
    if(se) throw se;
    if(!s||!s.active) return out({error:"سجل الطالب غير متاح."},404);

    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const since=new Date(Date.now()-60*86400000).toISOString().slice(0,10);
    const [
      circleRes,teacherRes,outcomesRes,attendanceRes,testsRes,plansRes,planDaysRes,awardsRes,announcementsRes
    ]=await Promise.all([
      db.from("circles").select("name,circle_type").eq("id",s.circle_id).maybeSingle(),
      s.teacher_id?db.from("teachers").select("full_name").eq("id",s.teacher_id).maybeSingle():Promise.resolve({data:null,error:null}),
      db.from("outcomes").select("date_key,new_lesson,recent_review,review,memorization_rating,recent_review_rating,review_rating,notes,recitation_metrics")
        .eq("student_id",s.id).gte("date_key",since).order("date_key",{ascending:false}).limit(60),
      db.from("student_attendance").select("date_key,status,note")
        .eq("student_id",s.id).gte("date_key",since).order("date_key",{ascending:false}).limit(60),
      db.from("tests").select("performed_at,type,syllabus_snapshot,scores,public_code,notes")
        .eq("student_id",s.id).order("performed_at",{ascending:false}).limit(10),
      db.from("plans").select("id,name,type,unit,daily_amount,direction,start_date,end_date,status,cycle_enabled,range_end_surah,range_end_rub,linked_plan_id")
        .eq("student_id",s.id).eq("status","active").order("updated_at",{ascending:false}).limit(20),
      db.from("plan_days").select("plan_id,date_key,target_from,target_to,carry_from,carry_in,target_amount,segments,cycle_no,display_label")
        .eq("student_id",s.id).gte("date_key",today).order("date_key",{ascending:true}).limit(60),
      db.from("student_awards").select("title,category,awarded_on,note")
        .eq("student_id",s.id).order("awarded_on",{ascending:false}).limit(20),
      db.from("announcements").select("title,body,starts_on,ends_on,complex_id,circle_id,active")
        .eq("org_id",g.org_id).eq("active",true).lte("starts_on",today).order("starts_on",{ascending:false}).limit(30)
    ]);
    for(const r of [circleRes,teacherRes,outcomesRes,attendanceRes,testsRes,plansRes,planDaysRes,awardsRes,announcementsRes]){
      if(r.error) throw r.error;
    }
    const announcements=(announcementsRes.data||[]).filter((a:any)=>
      (!a.ends_on||a.ends_on>=today)&&(!a.complex_id||a.complex_id===g.complex_id)&&(!a.circle_id||a.circle_id===g.circle_id)
    );

    let talaqqin:any=null;
    if(circleRes.data?.circle_type==="حلقات التلقين"){
      const {data:st,error:ste}=await db.from("talaqqin_student_state")
        .select("current_lesson_no,completed,completed_at,started_at")
        .eq("student_id",s.id).eq("active",true).maybeSingle();
      if(ste) throw ste;
      if(st){
        const {data:lesson,error:le}=await db.from("talaqqin_lessons")
          .select("lesson_no,unit_no,unit_name,unit_week_start,unit_week_end,lesson_title,skill,book_page_from,book_page_to,media_url,media_label")
          .eq("lesson_no",st.current_lesson_no).maybeSingle();
        if(le) throw le;
        const {data:lastAssessment,error:lae}=await db.from("talaqqin_assessments")
          .select("lesson_no,rating,passed,notes,assessed_on")
          .eq("student_id",s.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(lae) throw lae;
        talaqqin={
          completed:!!st.completed,
          completedAt:st.completed_at||null,
          startedAt:st.started_at||null,
          lesson:lesson?{
            lessonNo:lesson.lesson_no,unitNo:lesson.unit_no,unitName:lesson.unit_name,
            weekStart:lesson.unit_week_start,weekEnd:lesson.unit_week_end,
            title:lesson.lesson_title,skill:lesson.skill,
            pageFrom:lesson.book_page_from,pageTo:lesson.book_page_to,
            mediaUrl:lesson.media_url,mediaLabel:lesson.media_label
          }:null,
          lastAssessment:lastAssessment||null
        };
      }
    }
    const activePlans=new Map((plansRes.data||[]).map((p:any)=>[p.id,p]));
    const nextAssignments:any[]=[];
    for(const d of (planDaysRes.data||[])){
      const p:any=activePlans.get(d.plan_id);if(!p)continue;
      if(nextAssignments.some(x=>x.planId===p.id))continue;
      nextAssignments.push({planId:p.id,planName:p.name||null,type:p.type,date:d.date_key,from:d.carry_from||d.target_from,to:d.target_to,amount:Number(d.target_amount||0)+Number(d.carry_in||0),unit:p.unit,direction:p.direction,segments:d.segments||[],cycleNo:d.cycle_no||1,displayLabel:d.display_label||null});
    }

    return out({
      ok:true,
      student:{
        fullName:s.full_name,
        circleName:circleRes.data?.name||"",
        circleType:circleRes.data?.circle_type||"",
        teacherName:teacherRes.data?.full_name||""
      },
      outcomes:outcomesRes.data||[],
      attendance:attendanceRes.data||[],
      tests:testsRes.data||[],
      plans:plansRes.data||[],
      nextAssignments,
      talaqqin,
      awards:awardsRes.data||[],
      announcements,
      generatedAt:new Date().toISOString()
    });
  }catch(e){
    return out({error:e instanceof Error?e.message:"تعذر فتح بوابة ولي الأمر."},500);
  }
});
