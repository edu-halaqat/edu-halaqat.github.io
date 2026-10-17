import { withSupabase } from "npm:@supabase/server@1";

/** Server-only Sanabil -> Jadeer request bridge.
 * Firebase receiver MUST persist source_request_id idempotently before sending
 * {acknowledged:true, request_id:"..."}; it must authenticate this shared secret.
 * No delivery is ever reported as successful merely because the local row exists.
 */
const allowedOrigins = new Set([
  "https://snabilalwahy.com",
  "https://www.snabilalwahy.com",
  "https://edu-halaqat.github.io",
]);
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    ...(allowedOrigins.has(origin) ? {"Access-Control-Allow-Origin": origin} : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Vary": "Origin",
  };
}
function reply(req: Request, data: unknown, status=200) {
  return new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(req)}});
}
const endpoint = Deno.env.get("JADEER_REQUEST_ENDPOINT") || "";
const sharedSecret = Deno.env.get("JADEER_SHARED_SECRET") || "";
const configured = /^https:\/\/[^\s]+$/i.test(endpoint) && sharedSecret.length >= 32;
const handler = withSupabase({auth:"user"}, async (req: Request, ctx) => {
  if (req.method === "GET") return reply(req,{configured});
  if (req.method !== "POST") return reply(req,{ok:false,error:"method_not_allowed"},405);
  if (!configured) return reply(req,{ok:false,error:"jadeer_not_configured",message:"لم تُفعَّل قناة الاستلام الموثقة في جدير."},503);
  let id = "";
  try {
    if (Number(req.headers.get("content-length")||"0") > 4096) return reply(req,{ok:false,error:"payload_too_large"},413);
    const body = await req.json();
    id = String(body?.request_id||"").trim();
  } catch { return reply(req,{ok:false,error:"invalid_json"},400); }
  if (!id || id.length > 160) return reply(req,{ok:false,error:"invalid_request_id"},400);
  const actor = String(ctx.userClaims?.id || ctx.jwtClaims?.sub || "");
  if (!actor) return reply(req,{ok:false,error:"identity_missing"},401);
  const admin = ctx.supabaseAdmin;
  const {data: exam, error: requestError} = await admin.from("exam_requests").select("*").eq("id",id).maybeSingle();
  if (requestError || !exam || exam.destination !== "jadeer") return reply(req,{ok:false,error:"jadeer_request_missing"},404);
  const [{data: members,error: memberError},{data: student},{data: teacher},{data: circle},{data: complex}] = await Promise.all([
    admin.from("memberships").select("role,org_id,complex_id,circle_id,active").eq("user_id",actor).eq("active",true),
    admin.from("students").select("id,org_id,complex_id,circle_id,teacher_id,full_name,active").eq("id",exam.student_id).maybeSingle(),
    admin.from("teachers").select("id,org_id,complex_id,circle_id,user_id,full_name,active").eq("id",exam.teacher_id).maybeSingle(),
    admin.from("circles").select("id,org_id,complex_id,name,active").eq("id",exam.circle_id).maybeSingle(),
    admin.from("complexes").select("id,org_id,name,active").eq("id",exam.complex_id).maybeSingle(),
  ]);
  if (memberError) return reply(req,{ok:false,error:"membership_read_failure"},503);
  const authorized = (members||[]).some((m:any) =>
    m.org_id===exam.org_id && (
      m.role==="admin" ||
      (["manager","supervisor"].includes(m.role) && (!m.complex_id || m.complex_id===exam.complex_id) && (!m.circle_id || m.circle_id===exam.circle_id)) ||
      (m.role==="teacher" && teacher?.user_id===actor && teacher?.id===exam.teacher_id)
    )
  );
  if (!authorized) return reply(req,{ok:false,error:"forbidden"},403);
  if (!student?.active || !teacher?.active || !circle?.active || !complex?.active ||
      student.id!==exam.student_id || student.org_id!==exam.org_id ||
      student.complex_id!==exam.complex_id || student.circle_id!==exam.circle_id ||
      student.teacher_id!==exam.teacher_id ||
      teacher.org_id!==exam.org_id || teacher.complex_id!==exam.complex_id || teacher.circle_id!==exam.circle_id ||
      circle.org_id!==exam.org_id || circle.complex_id!==exam.complex_id || complex.org_id!==exam.org_id)
    return reply(req,{ok:false,error:"invalid_scoped_identity",message:"إسناد الطالب أو معلمه أو حلقته غير متطابق."},409);
  const previous = await admin.rpc("jadeer_bridge_delivery_state",{p_request_id:id});
  if (previous.error) return reply(req,{ok:false,error:"bridge_state_unavailable"},503);
  if (previous.data?.state==="accepted")
    return reply(req,{ok:true,acknowledged:true,request_id:previous.data.jadeer_request_id,duplicate:true});
  const markSending = await admin.rpc("jadeer_bridge_record_delivery",{p_request_id:id,p_state:"sending"});
  if (markSending.error) return reply(req,{ok:false,error:"bridge_state_write_failed"},503);
  const payload = {
    source:"sanabil",schema_version:1,snabil_request_id:id,
    student:{id:student.id,name:student.full_name},
    teacher:{id:teacher.id,name:teacher.full_name},
    circle:{id:circle.id,name:circle.name},
    complex:{id:complex.id,name:complex.name},
    exam:{type:exam.type,syllabus:exam.syllabus,question_count:exam.question_count,lines_per_question:exam.lines_per_question}
  };
  try {
    const remote = await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+sharedSecret},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
    });
    if (!remote.ok) throw Error("remote_http_"+remote.status);
    const confirmation = await remote.json();
    const remoteId = String(confirmation?.request_id||"");
    if (confirmation?.acknowledged!==true || !remoteId || remoteId.length>160 ||
       (confirmation.snabil_request_id && confirmation.snabil_request_id!==id))
      throw Error("remote_ack_missing");
    const saved=await admin.rpc("jadeer_bridge_record_delivery",{p_request_id:id,p_state:"accepted",p_remote_id:remoteId});
    if (saved.error) throw Error("ack_not_persisted");
    return reply(req,{ok:true,acknowledged:true,request_id:remoteId,duplicate:false});
  } catch(error) {
    const reason = String(error instanceof Error?error.message:error).slice(0,200);
    await admin.rpc("jadeer_bridge_record_delivery",{p_request_id:id,p_state:"failed",p_error:reason});
    return reply(req,{ok:false,acknowledged:false,error:"remote_delivery_failed",message:"حُفظ الترشيح في سنابل، لكن جدير لم يؤكد استلامه. يمكنك إعادة المحاولة."},502);
  }
});
export default {
  fetch(req: Request) {
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
    return handler(req);
  }
};
