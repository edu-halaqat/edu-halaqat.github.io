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
  // Support Sanabil's new domain while preserving existing client compatibility.
  const requestOrigin=req.headers.get("Origin")||"";
  const approvedOrigins=new Set(["https://edu-halaqat.github.io","https://snabilalwahy.com","https://www.snabilalwahy.com"]);
  const responseHeaders={...cors,"Access-Control-Allow-Origin":approvedOrigins.has(requestOrigin)?requestOrigin:"https://edu-halaqat.github.io","Vary":"Origin"};
  const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:responseHeaders});

  if(req.method==="OPTIONS") return new Response("ok",{headers:responseHeaders});
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


    const operation=String(body.action||"view");
    if(!["view","ack","excuse"].includes(operation)) return out({error:"العملية غير مدعومة."},400);
    const nowRiyadh=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

    if(operation==="ack"){
      const noteType=String(body.noteType||""),noteDate=String(body.noteDate||"");
      if(!["outcome","talaqqin"].includes(noteType)||!/^\d{4}-\d{2}-\d{2}$/.test(noteDate)
        ||noteDate>nowRiyadh()||noteDate<new Date(Date.now()-120*86400000).toISOString().slice(0,10))
        return out({error:"الملاحظة المختارة غير متاحة."},400);
      const query=noteType==="outcome"
        ?db.from("outcomes").select("notes").eq("student_id",s.id).eq("date_key",noteDate).maybeSingle()
        :db.from("talaqqin_assessments").select("notes").eq("student_id",s.id).eq("assessed_on",noteDate).order("created_at",{ascending:false}).limit(1).maybeSingle();
      const {data:noteRow,error:noteError}=await query;
      if(noteError)throw noteError;
      if(!String(noteRow?.notes||"").trim())
        return out({error:"لا توجد ملاحظة معتمدة بهذا التاريخ."},404);
      const {error:ackError}=await db.from("guardian_note_receipts").upsert({
        student_id:s.id,note_type:noteType,note_date:noteDate
      },{onConflict:"student_id,note_type,note_date",ignoreDuplicates:true});
      if(ackError)throw ackError;
      return out({ok:true,acknowledged:true});
    }
    if(operation==="excuse"){
      const requestedDate=String(body.date||""),reason=String(body.reason||""),
        note=String(body.note||"").trim();
      if(requestedDate!==nowRiyadh())return out({error:"يمكن طلب الاستئذان ليوم الحلقة الحالي فقط."},400);
      if(!["health","family","travel","other"].includes(reason)||note.length>240)
        return out({error:"حدد سببًا صحيحًا واختصر الملاحظة إلى 240 حرفًا."},400);
      const [currentAtt,circleKind,studentKind,existing]=await Promise.all([
        db.from("student_attendance").select("status").eq("student_id",s.id).eq("date_key",requestedDate).maybeSingle(),
        db.from("circle_day_types").select("day_type").eq("circle_id",s.circle_id).eq("date_key",requestedDate).maybeSingle(),
        db.from("student_day_types").select("day_type").eq("student_id",s.id).eq("date_key",requestedDate).maybeSingle(),
        db.from("guardian_excuse_requests").select("status").eq("student_id",s.id).eq("date_key",requestedDate).maybeSingle()
      ]);
      for(const r of [currentAtt,circleKind,studentKind,existing])if(r.error)throw r.error;
      const type=studentKind.data?.day_type||circleKind.data?.day_type||"study";
      if(type==="holiday"||type==="unaccounted")
        return out({error:"هذا اليوم إجازة أو غير محتسب؛ لا يلزم طلب استئذان."},409);
      if(currentAtt.data)return out({error:"سبق تسجيل حضور الطالب أو غيابه اليوم. تواصل مع معلم الحلقة لتصحيح السجل."},409);
      if(existing.data)return out({error:"يوجد طلب استئذان سابق لهذا اليوم؛ لا حاجة لإرساله مرة أخرى."},409);
      const {error:requestError}=await db.from("guardian_excuse_requests").insert({
        student_id:s.id,circle_id:s.circle_id,date_key:requestedDate,reason,note,status:"pending"
      });
      if(requestError){
        if(requestError.code==="23505")return out({error:"الاستئذان مسجل بالفعل لهذا اليوم."},409);
        throw requestError;
      }
      return out({ok:true,status:"pending",attendanceChanged:false,
        message:"وصل طلب الاستئذان إلى المعلم للمراجعة، ولم يتغير سجل الحضور تلقائيًا."});
    }

    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const since=new Date(Date.now()-60*86400000).toISOString().slice(0,10);
    const [
      circleRes,teacherRes,outcomesRes,attendanceRes,testsRes,plansRes,planDaysRes,prepPlanDaysRes,awardsRes,announcementsRes
    ]=await Promise.all([
      db.from("circles").select("name,circle_type").eq("id",s.circle_id).maybeSingle(),
      s.teacher_id?db.from("teachers").select("full_name").eq("id",s.teacher_id).maybeSingle():Promise.resolve({data:null,error:null}),
      db.from("outcomes").select("date_key,new_lesson,recent_review,review,memorization_rating,recent_review_rating,review_rating,notes,recitation_metrics")
        .eq("student_id",s.id).gte("date_key",since).order("date_key",{ascending:false}).limit(60),
      db.from("student_attendance").select("date_key,status,note,absence_reason")
        .eq("student_id",s.id).gte("date_key",since).order("date_key",{ascending:false}).limit(60),
      db.from("tests").select("performed_at,type,syllabus_snapshot,scores,public_code,notes")
        .eq("student_id",s.id).order("performed_at",{ascending:false}).limit(10),
      db.from("plans").select("id,name,type,unit,daily_amount,direction,start_date,end_date,status,cycle_enabled,range_end_surah,range_end_rub,linked_plan_id")
        .eq("student_id",s.id).eq("status","active").order("updated_at",{ascending:false}).limit(20),
      db.from("plan_days").select("plan_id,date_key,target_from,target_to,carry_from,carry_in,target_amount,segments,cycle_no,display_label")
        .eq("student_id",s.id).gte("date_key",today).order("date_key",{ascending:true}).limit(60),
      db.from("plan_days").select("plan_id,date_key,target_from,target_to,carry_from,carry_in,target_amount,segments,cycle_no,display_label")
        .eq("student_id",s.id).gt("date_key",today).order("date_key",{ascending:true}).limit(60),
      db.from("student_awards").select("title,category,awarded_on,note")
        .eq("student_id",s.id).order("awarded_on",{ascending:false}).limit(20),
      db.from("announcements").select("title,body,starts_on,ends_on,complex_id,circle_id,active")
        .eq("org_id",g.org_id).eq("active",true).lte("starts_on",today).order("starts_on",{ascending:false}).limit(30)
    ]);
    for(const r of [circleRes,teacherRes,outcomesRes,attendanceRes,testsRes,plansRes,planDaysRes,prepPlanDaysRes,awardsRes,announcementsRes]){
      if(r.error) throw r.error;
    }
    const announcements=(announcementsRes.data||[]).filter((a:any)=>
      (!a.ends_on||a.ends_on>=today)&&(!a.complex_id||a.complex_id===g.complex_id)&&(!a.circle_id||a.circle_id===g.circle_id)
    );

    const [receipts,requests,latestMemDay]=await Promise.all([
      db.from("guardian_note_receipts").select("note_type,note_date,acknowledged_at")
        .eq("student_id",s.id).gte("note_date",since),
      db.from("guardian_excuse_requests").select("date_key,reason,status,note,submitted_at,teacher_note")
        .eq("student_id",s.id).gte("date_key",since).order("date_key",{ascending:false}).limit(8),
      db.from("plan_days").select("plan_id,date_key,target_to,rating")
        .eq("student_id",s.id).in("rating",["ممتاز","جيد جدًا","جيد"])
        .order("date_key",{ascending:false}).limit(35)
    ]);
    for(const r of [receipts,requests,latestMemDay])if(r.error)throw r.error;
    let juzProgress:any=null;
    const memPlan=(plansRes.data||[]).find((x:any)=>x.type==="memorization");
    const latest=(latestMemDay.data||[]).find((x:any)=>x.plan_id===memPlan?.id);
    const lastIndex=Number(latest?.target_to?.ayahIndex||0);
    if(lastIndex>0){
      const {data:verse,error:verseError}=await db.from("quran_ayahs")
        .select("juz_no,ayah_index").eq("ayah_index",lastIndex).maybeSingle();
      if(verseError)throw verseError;
      if(verse){
        const [start,end]=await Promise.all([
          db.from("quran_ayahs").select("ayah_index").eq("juz_no",verse.juz_no)
            .order("ayah_index",{ascending:true}).limit(1).maybeSingle(),
          db.from("quran_ayahs").select("ayah_index").eq("juz_no",verse.juz_no)
            .order("ayah_index",{ascending:false}).limit(1).maybeSingle()
        ]);
        if(start.error)throw start.error;
        if(end.error)throw end.error;
        const lo=Number(start.data?.ayah_index||0),hi=Number(end.data?.ayah_index||0);
        const total=hi-lo+1;
        if(total>0){
          const reached=memPlan?.direction==="toward_fatiha"?hi-lastIndex+1:lastIndex-lo+1;
          juzProgress={juz:Number(verse.juz_no),percent:Math.min(100,Math.max(0,Math.round(reached/total*100))),
            lastCompletedOn:latest.date_key,basis:"موضع آخر درس حفظ مجتاز ضمن الجزء، وليس إثبات ختم الجزء"};
        }
      }
    }
    let talaqqin:any=null;
    let talaqqinHistory:any[]=[];
    if(circleRes.data?.circle_type==="حلقات التلقين"){
      const {data:st,error:ste}=await db.from("talaqqin_student_state")
        .select("current_lesson_no,current_custom_lesson_id,placement_set,placement_note,completed,completed_at,started_at,lesson_started_on,plan_note")
        .eq("student_id",s.id).eq("active",true).maybeSingle();
      if(ste) throw ste;
      if(st){
        const {data:lesson,error:le}=await db.from("talaqqin_lessons")
          .select("lesson_no,unit_no,unit_name,unit_week_start,unit_week_end,lesson_title,skill,book_page_from,book_page_to,media_url,media_label")
          .eq("lesson_no",st.current_lesson_no).maybeSingle();
        if(le) throw le;
        let custom:any=null;
        if(st.current_custom_lesson_id){
          const cr=await db.from("talaqqin_custom_lessons")
            .select("id,title,skill,book_page_from,book_page_to,media_url,planned_weeks,notes,after_pass_action,status")
            .eq("id",st.current_custom_lesson_id).eq("status","active").maybeSingle();
          if(cr.error) throw cr.error; custom=cr.data;
        }
        const {data:pacing,error:pe}=await db.from("talaqqin_student_unit_pacing")
          .select("unit_no,planned_weeks,note").eq("student_id",s.id).order("unit_no");
        if(pe) throw pe;
        const {data:lessonPacing,error:lpe}=await db.from("talaqqin_student_lesson_pacing")
          .select("lesson_no,extra_weeks,note").eq("student_id",s.id);
        if(lpe) throw lpe;
        const baseline=[4,2,4,5,6,7,6,8,7,1];
        const paceMap=new Map((pacing||[]).map((x:any)=>[Number(x.unit_no),Number(x.planned_weeks)]));
        const extraLessonWeeks=(lessonPacing||[]).reduce((sum:number,x:any)=>sum+Number(x.extra_weeks||0),0);
        const currentExtension=(lessonPacing||[]).find((x:any)=>Number(x.lesson_no)===Number(st.current_lesson_no))||null;
        const totalWeeks=baseline.reduce((sum,w,i)=>sum+(paceMap.get(i+1)||w),0)+extraLessonWeeks;
        const {data:assessmentRows,error:historyError}=await db.from("talaqqin_assessments")
          .select("lesson_no,custom_lesson_id,rating,passed,notes,assessed_on,created_at")
          .eq("student_id",s.id).order("created_at",{ascending:false}).limit(30);
        if(historyError) throw historyError;
        const currentHistory=assessmentRows||[];
        const lessonNums=[...new Set(currentHistory.map((a:any)=>a.lesson_no).filter(Boolean))];
        const customIds=[...new Set(currentHistory.map((a:any)=>a.custom_lesson_id).filter(Boolean))];
        const [lessonTitles,customTitles]=await Promise.all([
          lessonNums.length?db.from("talaqqin_lessons").select("lesson_no,lesson_title").in("lesson_no",lessonNums):Promise.resolve({data:[],error:null}),
          customIds.length?db.from("talaqqin_custom_lessons").select("id,title").in("id",customIds):Promise.resolve({data:[],error:null})
        ]);
        if(lessonTitles.error) throw lessonTitles.error;
        if(customTitles.error) throw customTitles.error;
        const lessonMap=new Map((lessonTitles.data||[]).map((l:any)=>[l.lesson_no,l.lesson_title]));
        const customMap=new Map((customTitles.data||[]).map((l:any)=>[l.id,l.title]));
        talaqqinHistory=currentHistory.map((a:any)=>({
          lessonNo:a.lesson_no,assessedOn:a.assessed_on,rating:a.rating,passed:a.passed,
          notes:a.notes,lessonTitle:a.custom_lesson_id?(customMap.get(a.custom_lesson_id)||"درس خاص")
            :(lessonMap.get(a.lesson_no)||"الدرس رقم "+a.lesson_no)
        }));
        const lastAssessment=currentHistory[0]||null;
        const current=st.placement_set?(custom?{
          customLessonId:custom.id,lessonNo:lesson?.lesson_no||st.current_lesson_no,
          unitNo:lesson?.unit_no||null,unitName:lesson?.unit_name||"درس خاص",
          weekStart:lesson?.unit_week_start||null,weekEnd:lesson?.unit_week_end||null,
          title:custom.title,skill:custom.skill,
          pageFrom:custom.book_page_from,pageTo:custom.book_page_to,
          mediaUrl:custom.media_url,mediaLabel:"مادة مساعدة للدرس الخاص",
          plannedWeeks:custom.planned_weeks,notes:custom.notes,
          afterPassAction:custom.after_pass_action,isCustom:true
        }:(lesson?{
          lessonNo:lesson.lesson_no,unitNo:lesson.unit_no,unitName:lesson.unit_name,
          weekStart:lesson.unit_week_start,weekEnd:lesson.unit_week_end,
          title:lesson.lesson_title,skill:lesson.skill,
          pageFrom:lesson.book_page_from,pageTo:lesson.book_page_to,
          mediaUrl:lesson.media_url,mediaLabel:lesson.media_label,
          extraWeeks:Number(currentExtension?.extra_weeks||0),extensionNote:currentExtension?.note||null,isCustom:false
        }:null)):null;
        talaqqin={
          completed:!!st.completed,
          completedAt:st.completed_at||null,
          startedAt:st.started_at||null,
          lessonStartedOn:st.lesson_started_on||null,
          placementSet:!!st.placement_set,
          placementNote:st.placement_note||null,
          planNote:st.plan_note||null,
          totalWeeks,
          extraLessonWeeks,
          lesson:current,
          lastAssessment:lastAssessment||null
        };
      }
    }
    const activePlans=new Map((plansRes.data||[]).map((p:any)=>[p.id,p]));
    const assignment=(d:any,p:any)=>({planId:p.id,planName:p.name||null,type:p.type,date:d.date_key,from:d.carry_from||d.target_from,to:d.target_to,amount:Number(d.target_amount||0)+Number(d.carry_in||0),unit:p.unit,direction:p.direction,segments:d.segments||[],cycleNo:d.cycle_no||1,displayLabel:d.display_label||null});
    const nextAssignments:any[]=[];
    for(const d of (planDaysRes.data||[])){
      const p:any=activePlans.get(d.plan_id);if(!p)continue;
      if(nextAssignments.some(x=>x.planId===p.id))continue;
      nextAssignments.push(assignment(d,p));
    }
    const prepAssignments:any[]=[];
    for(const d of (prepPlanDaysRes.data||[])){
      const p:any=activePlans.get(d.plan_id);if(!p)continue;
      if(prepAssignments.some(x=>x.planId===p.id))continue;
      prepAssignments.push(assignment(d,p));
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
      prepAssignments,
      talaqqin,
      talaqqinHistory,
      acknowledgements:receipts.data||[],
      excuseRequests:requests.data||[],
      juzProgress,
      awards:awardsRes.data||[],
      announcements,
      generatedAt:new Date().toISOString()
    });
  }catch(e){
    return out({error:e instanceof Error?e.message:"تعذر فتح بوابة ولي الأمر."},500);
  }
});
