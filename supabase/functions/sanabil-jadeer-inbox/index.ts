import { withSupabase } from "npm:@supabase/server@1";

/** Firebase -> Sanabil result inbox. Only signed, approved results can enter.
 * This function stages matching results; it NEVER publishes a student score.
 */
const secret = Deno.env.get("JADEER_RESULT_SECRET") || "";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function safeEqual(a:string,b:string):boolean {
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) diff |= (x[i]||0)^(y[i]||0);
  return diff===0;
}
async function shaHmac(body:string,timestamp:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+body));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
const handler=withSupabase({auth:"none"},async(req:Request,ctx)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(secret.length<32)return json({ok:false,error:"not_configured"},503);
  const timestamp=req.headers.get("x-jadeer-timestamp")||"";
  const signature=(req.headers.get("x-jadeer-signature")||"").replace(/^v1=/,"").toLowerCase();
  const sent=Number(timestamp);
  if(!/^\d{10}$/.test(timestamp)||!Number.isFinite(sent)||Math.abs(Date.now()/1000-sent)>300)
    return json({ok:false,error:"stale_signature"},401);
  if(!/^[0-9a-f]{64}$/.test(signature))return json({ok:false,error:"invalid_signature"},401);
  if(Number(req.headers.get("content-length")||0)>65536)return json({ok:false,error:"payload_too_large"},413);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>65536)return json({ok:false,error:"payload_too_large"},413);
  if(!safeEqual(signature,await shaHmac(raw,timestamp)))
    return json({ok:false,error:"bad_signature"},401);
  let body:any;
  try{body=JSON.parse(raw)}catch{return json({ok:false,error:"invalid_json"},400)}
  if(body?.source_project!=="quran-tests-program")
    return json({ok:false,error:"wrong_project"},403);
  if(body?.publish_mode!=="jadeer_and_snabil")
    return json({ok:false,error:"not_authorized_for_snabil_publication"},400);
  const result=body?.result;
  if(!result || typeof result!=="object" || result.status!=="completed" || result.approved!==true)
    return json({ok:false,error:"result_not_approved"},409);
  const scores=result.scores||{};
  for(const [k,max] of [["memorization",80],["tajweed",20],["total",100]] as const) {
    if(typeof scores[k]!=="number" || !Number.isFinite(scores[k]) || scores[k]<0 || scores[k]>max)
      return json({ok:false,error:"invalid_score"},400);
  }
  if(Math.abs(scores.total-scores.memorization-scores.tajweed)>.01)
    return json({ok:false,error:"inconsistent_scores"},400);
  const resultId=String(body?.jadeer_result_id||"").trim();
  if(!resultId || resultId.length>128) return json({ok:false,error:"invalid_result_id"},400);
  const {data,error}=await ctx.supabaseAdmin.rpc("jadeer_bridge_receive_result",{
    p_result_id:resultId,p_publish_mode:"jadeer_and_snabil",p_payload:body
  });
  if(error)return json({ok:false,error:"inbox_unavailable"},503);
  if(data?.ok===false)return json({ok:false,error:data.code,message:data.message},409);
  const status=data?.state||"unmatched";
  // An inbox acknowledgement is never a publication acknowledgement.
  return json({
    ok:true,received:true,published:false,
    state:status,
    message:status==="unmatched" ? (data?.match?.message||"بيانات المجمع أو الحلقة أو المعلم أو الطالب غير مدرجة في سنابل الوحي؛ يرجى تصحيحها قبل نشر النتيجة.") :
      "تم استقبال النتيجة للتحقق، ولم تُنشر في سنابل الوحي بعد."
  },status==="unmatched"?202:202);
});
export default {fetch:handler};
