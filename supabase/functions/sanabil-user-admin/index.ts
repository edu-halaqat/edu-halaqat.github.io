import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.1';
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'https://edu-halaqat.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 const allowedOrigins=new Set(['https://edu-halaqat.github.io','https://snabilalwahy.com','https://www.snabilalwahy.com']);
 const responseHeaders={...headers,'Access-Control-Allow-Origin': origin===null?'https://edu-halaqat.github.io':(allowedOrigins.has(origin)?origin:'null'),'Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:responseHeaders});
 if(req.method==='OPTIONS')return new Response('ok',{headers:responseHeaders});
 if(req.method!=='POST')return reply({error:'الطريقة غير مسموحة'},405);
 try{
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const {data:auth,error:ae}=await admin.auth.getUser(token);
  if(ae||!auth.user)return reply({error:'جلسة الدخول غير صالحة'},401);
  const {data:p}=await admin.from('profiles').select('active,org_id').eq('id',auth.user.id).single();
  const {data:ms}=await admin.from('memberships').select('*').eq('user_id',auth.user.id).eq('active',true);
  const membership=ms?.find(m=>m.org_id===p?.org_id&&m.role==='admin');
  const b=await req.json();

  // Dedicated complex-scoped administrative staff onboarding.
  // The administrator controls creation per complex. Supervisors cannot grant manager/admin roles.
  const isSystemAdmin=Boolean(p?.active&&ms?.some(m=>m.org_id===p.org_id&&m.role==='admin'));
  const supervisorComplexes=new Set(
    (p?.active?ms:[]).filter(m=>m.org_id===p?.org_id&&m.role==='supervisor'&&m.complex_id&&!m.circle_id).map(m=>m.complex_id)
  );
  const canStaffManage=isSystemAdmin||supervisorComplexes.size>0;
  if(['staff_scopes','staff_policy_update','staff_list','create_staff'].includes(b.action)){
    if(!p?.active||!p.org_id||!canStaffManage)
      return reply({error:'هذه الميزة متاحة لمشرف المجمع المعتمد أو مدير النظام فقط.'},403);
    const org=p.org_id;
    const cx=await admin.from('complexes').select('id,name,org_id,active').eq('org_id',org).eq('active',true);
    if(cx.error)throw cx.error;
    const scoped=(cx.data||[]).filter(c=>isSystemAdmin||supervisorComplexes.has(c.id));
    if(b.action==='staff_scopes'){
      const ids=scoped.map(c=>c.id);
      const flags=ids.length?await admin.from('complex_staff_creation_policy')
        .select('complex_id,allow_supervisor_staff_creation').eq('org_id',org).in('complex_id',ids):{data:[],error:null};
      if(flags.error)throw flags.error;
      const settings=new Map((flags.data||[]).map(x=>[x.complex_id,x.allow_supervisor_staff_creation]));
      return reply({is_admin:isSystemAdmin,complexes:scoped.map(c=>({
        id:c.id,name:c.name,allow_staff_creation:settings.get(c.id)!==false
      }))});
    }
    if(b.action==='staff_policy_update'){
      if(!isSystemAdmin)return reply({error:'تغيير صلاحيات المجمع خاص بمدير النظام.'},403);
      if(typeof b.allow_staff_creation!=='boolean')throw Error('اختر تمكين الصلاحية أو تعطيلها.');
      const complex=scoped.find(c=>c.id===String(b.complex_id||''));
      if(!complex)throw Error('المجمع خارج نطاق الإدارة.');
      const write=await admin.from('complex_staff_creation_policy').upsert({
        complex_id:complex.id,org_id:org,
        allow_supervisor_staff_creation:b.allow_staff_creation,
        updated_at:new Date().toISOString(),updated_by:auth.user.id
      },{onConflict:'complex_id'});
      if(write.error)throw write.error;
      const audit=await admin.from('audit_logs').insert({
        org_id:org,action:'complex.staff_creation_permission.updated',
        actor_uid:auth.user.id,entity_table:'complexes',entity_id:complex.id,
        details:{enabled:b.allow_staff_creation}
      });
      if(audit.error)throw audit.error;
      return reply({ok:true,complex_id:complex.id,allow_staff_creation:b.allow_staff_creation});
    }
    if(b.action==='staff_list'){
      const ids=scoped.map(c=>c.id);
      if(!ids.length)return reply({staff:[]});
      const members=await admin.from('memberships')
        .select('user_id,complex_id,active,role').eq('org_id',org).eq('role','staff').in('complex_id',ids);
      if(members.error)throw members.error;
      const userIds=[...new Set((members.data||[]).map(m=>m.user_id))];
      if(!userIds.length)return reply({staff:[]});
      const [profiles,directory]=await Promise.all([
        admin.from('profiles').select('id,display_name,email,phone,active,org_id').in('id',userIds).eq('org_id',org),
        admin.from('complex_staff_directory').select('user_id,complex_id,job_title').in('user_id',userIds).eq('org_id',org)
      ]);
      if(profiles.error||directory.error)throw profiles.error||directory.error;
      const byId=new Map((profiles.data||[]).map(u=>[u.id,u]));
      const titles=new Map((directory.data||[]).map(x=>[x.user_id,x.job_title]));
      return reply({staff:(members.data||[]).flatMap(m=>{
        const u=byId.get(m.user_id);
        return u?[{id:u.id,display_name:u.display_name,email:u.email,phone:u.phone,
          active:!!u.active&&!!m.active,complex_id:m.complex_id,
          complex_name:scoped.find(c=>c.id===m.complex_id)?.name||'',job_title:titles.get(u.id)||'إداري مجمع'}]:[];
      })});
    }
    // Creation is only for a new, least-privilege staff account; supplied roles are ignored/denied.
    const complex=scoped.find(c=>c.id===String(b.complex_id||''));
    if(!complex)throw Error('لا يمكنك إنشاء حساب خارج مجمعك.');
    if(b.role!==undefined&&b.role!=='staff')throw Error('إنشاء الإداريين يمنح دور إداري مجمع فقط.');
    const policy=await admin.from('complex_staff_creation_policy')
      .select('allow_supervisor_staff_creation').eq('org_id',org).eq('complex_id',complex.id).maybeSingle();
    if(policy.error)throw policy.error;
    if(!isSystemAdmin&&policy.data?.allow_supervisor_staff_creation===false)
      return reply({error:'عطّل مدير النظام إنشاء حسابات إداريين لهذا المجمع.'},403);
    const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
    const name=String(b.display_name||'').trim(),phone=String(b.phone||'').trim();
    const title=String(b.job_title||'إداري مجمع').trim();
    if(!/^\S+@\S+\.\S+$/.test(email)||password.length<10||!name||name.length>150
       ||title.length>100||phone.length>30)
      throw Error('أكمل الاسم والبريد وكلمة مرور من 10 أحرف فأكثر، وتحقق من البيانات.');
    const created=await admin.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{display_name:name}
    });
    if(created.error||!created.data.user)throw created.error||Error('تعذر إنشاء حساب الإداري.');
    const uid=created.data.user.id;
    const provision=await admin.rpc('provision_complex_staff',{
      p_actor:auth.user.id,p_user:uid,p_org:org,p_complex:complex.id,
      p_name:name,p_phone:phone,p_title:title
    });
    if(provision.error){
      const cleanup=await admin.auth.admin.deleteUser(uid);
      if(cleanup.error)console.error('Staff creation rollback failed',uid);
      throw provision.error;
    }
    return reply({ok:true,user_id:uid,role:'staff',complex_id:complex.id});
  }
  if(b.action==='create_teacher'){
   const org=p?.org_id,complex=String(b.complex_id||''),circle=String(b.circle_id||'');
   if(!p?.active||!org||!complex||!circle||!ms?.some(m=>m.org_id===org&&(m.role==='admin'||(m.role==='supervisor'&&m.complex_id===complex&&!m.circle_id))))
    return reply({error:'إضافة المعلمين متاحة داخل المجمع المسند إليك فقط.'},403);
   if(b.role&&b.role!=='teacher')return reply({error:'يمكن إنشاء حساب معلم فقط.'},403);
   const {data:c,error:ce}=await admin.from('circles').select('id').eq('id',circle).eq('org_id',org).eq('complex_id',complex).eq('active',true).maybeSingle();
   if(ce||!c)return reply({error:'اختر حلقة نشطة من المجمع نفسه.'},403);
   const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),name=String(b.display_name||'').trim();
   if(!/^\S+@\S+\.\S+$/.test(email)||password.length<10||!name)throw Error('أكمل الاسم والبريد وكلمة مرور من 10 أحرف فأكثر');
   const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:name}});
   if(createError||!created.user)throw createError||Error('تعذر إنشاء الحساب');
   const uid=created.user.id;
   const {data:result,error:provisionError}=await admin.rpc('provision_complex_teacher',{p_actor:auth.user.id,p_user:uid,p_org:org,p_complex:complex,p_circle:circle,p_name:name,p_phone:String(b.phone||'').trim()});
   if(provisionError){const {error:cleanupError}=await admin.auth.admin.deleteUser(uid);if(cleanupError)console.error('New teacher cleanup failed',uid);throw provisionError}
   return reply({ok:true,user_id:uid,primary:result?.primary===true});
  }
  if(!p?.active||!membership)return reply({error:'هذه الوظيفة متاحة لمدير النظام النشط فقط'},403);
  const org=p.org_id;
  const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
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
  if(!['admin','manager','supervisor','teacher','examiner'].includes(role))throw Error('اختر دورًا صحيحًا');
  const complex=['admin','manager'].includes(role)?null:String(b.complex_id||'');
  const circle=role==='teacher'?String(b.circle_id||''):null;
  if(!['admin','manager'].includes(role)&&!complex)throw Error('اختر المجمع');
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
