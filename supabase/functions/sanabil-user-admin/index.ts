import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.1';
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'https://edu-halaqat.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'الطريقة غير مسموحة'},405);
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const {data:auth,error:ae}=await admin.auth.getUser(token);
  if(ae||!auth.user)return reply({error:'جلسة الدخول غير صالحة'},401);
  const {data:p}=await admin.from('profiles').select('active,org_id').eq('id',auth.user.id).single();
  const {data:ms}=await admin.from('memberships').select('*').eq('user_id',auth.user.id).eq('active',true).eq('role','admin');
  const membership=ms?.find(m=>m.org_id===p?.org_id);
  if(!p?.active||!membership)return reply({error:'هذه الوظيفة متاحة لمدير النظام النشط فقط'},403);
  const org=p.org_id;
  const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const b=await req.json();
  if(b.action==='scopes'){
 const [cx,ci]=await Promise.all([admin.from('complexes').select('id,name,org_id').eq('org_id',org).eq('active',true),admin.from('circles').select('id,name,complex_id,org_id').eq('org_id',org).eq('active',true)]);
 if(cx.error||ci.error)throw cx.error||ci.error;return reply({complexes:cx.data,circles:ci.data});
 }
 if(b.action==='confirm_email'){
 const {data:target}=await admin.from('profiles').select('org_id').eq('id',String(b.user_id||'')).single();if(target?.org_id!==org)throw Error('الحساب خارج المؤسسة');
 const {error}=await admin.auth.admin.updateUserById(String(b.user_id),{email_confirm:true});if(error)throw error;return reply({ok:true});
 }
 if(b.action==='list'){
   // Unassigned profiles must be visible to the platform administrator for repair.
   const {data,error}=await admin.from('profiles').select('id,display_name,email,phone,active,org_id,role,memberships(role,active,org_id,complex_id,circle_id)').or(`org_id.eq.${org},org_id.is.null`).order('display_name');if(error)throw error;
   const users=await Promise.all((data||[]).map(async u=>{const {data:a}=await admin.auth.admin.getUserById(u.id);return {...u,email_confirmed:!!a.user?.email_confirmed_at};}));
   return reply({users});
  }
  if(!['create','update'].includes(b.action))return reply({error:'طلب غير معروف'},400);
  const role=String(b.role||'');
  if(!['admin','supervisor','teacher','examiner'].includes(role))throw Error('اختر دورًا صحيحًا');
  const complex=role==='admin'?null:String(b.complex_id||'');
  const circle=role==='teacher'?String(b.circle_id||''):null;
  if(role!=='admin'&&!complex)throw Error('اختر المجمع');
  if(role==='teacher'&&!circle)throw Error('اختر حلقة المعلم');
  let uid=String(b.user_id||''),created=false;
  if(b.action==='create'){
   const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
   if(!/^\S+@\S+\.\S+$/.test(email)||password.length<10||!String(b.display_name||'').trim())throw Error('أكمل الاسم والبريد وكلمة مرور من 10 أحرف فأكثر');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:String(b.display_name).trim()}});if(error||!data.user)throw error||Error('تعذر إنشاء الحساب');uid=data.user.id;created=true;
  }else{
   if(uid===auth.user.id)throw Error('لا يمكن تغيير صلاحيات الحساب الحالي');
   const {data:target,error}=await admin.from('profiles').select('org_id').eq('id',uid).single();if(error||!target)throw Error('الحساب غير موجود');if(target.org_id&&target.org_id!==org)throw Error('الحساب خارج المؤسسة');
  }
  const {data:existing}=await admin.from('memberships').select('role,org_id,complex_id,circle_id,active').eq('user_id',uid);
  const requested={role,orgId:org,complexId:complex,circleId:circle};
  const memberships=b.preserve_memberships&&existing?.length?existing.map(m=>({role:m.role,orgId:m.org_id,complexId:m.complex_id,circleId:m.circle_id})):[requested];
  const {error}=await userClient.rpc('set_user_access',{p_user_id:uid,p_org_id:org,p_active:b.active!==false,p_display_name:String(b.display_name||'').trim(),p_memberships:memberships});
  if(error){if(created)await admin.auth.admin.deleteUser(uid);throw error;}
  if(b.phone!==undefined){const {error:phoneError}=await admin.from('profiles').update({phone:String(b.phone||'').trim()||null}).eq('id',uid);if(phoneError)throw phoneError;}
  return reply({ok:true,user_id:uid});
 }catch(e){return reply({error:e instanceof Error?e.message:String((e as any)?.message||'تعذر تنفيذ الطلب')},400);}
});
