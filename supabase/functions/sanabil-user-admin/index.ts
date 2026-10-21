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


  // A single, scoped API for all user roles; passwords are created on the server.
  if(['users_scopes','users_list','users_policy_update','users_create','users_update','users_reassign'].includes(b.action)){
    if(!p?.active||!p.org_id)return reply({error:'حساب غير نشط.'},403);
    const org=p.org_id;
    const adminRole=ms?.some(m=>m.org_id===org&&m.role==='admin')===true;
    const myComplexes=new Set((ms||[]).filter(m=>m.org_id===org&&m.role==='supervisor'&&m.complex_id&&!m.circle_id).map(m=>m.complex_id));
    if(!adminRole&&!myComplexes.size)return reply({error:'إدارة المستخدمين متاحة لمدير النظام ومشرف المجمع فقط.'},403);
    const {data:allComplexes,error:complexError}=await admin.from('complexes').select('id,name,org_id')
       .eq('org_id',org).eq('active',true).order('name');
    if(complexError)throw complexError;
    const complexes=(allComplexes||[]).filter(c=>adminRole||myComplexes.has(c.id));
    const ids=complexes.map(c=>c.id);
    const {data:policyRows,error:policyError}=ids.length
      ?await admin.from('complex_staff_creation_policy')
       .select('complex_id,allow_supervisor_teacher_creation,allow_supervisor_staff_creation,allow_supervisor_examiner_creation')
       .eq('org_id',org).in('complex_id',ids)
      :{data:[],error:null};
    if(policyError)throw policyError;
    const policyMap=new Map((policyRows||[]).map(x=>[x.complex_id,x]));
    const flags=id=>{
      const x=policyMap.get(id)||{};
      return {teacher:x.allow_supervisor_teacher_creation!==false,
        staff:x.allow_supervisor_staff_creation!==false,
        examiner:x.allow_supervisor_examiner_creation===true};
    };
    const allowedRole=(role,complexId)=>adminRole||
      (myComplexes.has(complexId)&&['teacher','staff','examiner'].includes(role)&&flags(complexId)[role]===true);
    if(b.action==='users_scopes'){
      const {data:circles,error:ce}=ids.length
        ?await admin.from('circles').select('id,name,complex_id').eq('org_id',org).eq('active',true).in('complex_id',ids)
        :{data:[],error:null};
      if(ce)throw ce;
      return reply({is_admin:adminRole,
        complexes:complexes.map(c=>({id:c.id,name:c.name,roles:flags(c.id)})),circles:circles||[]});
    }
    if(b.action==='users_policy_update'){
      if(!adminRole)return reply({error:'تعديل منح الأدوار خاص بمدير النظام.'},403);
      const c=complexes.find(x=>x.id===String(b.complex_id||''));
      const role=String(b.role||''),enabled=b.enabled;
      if(!c||!['teacher','staff','examiner'].includes(role)||typeof enabled!=='boolean')
        throw Error('حدد المجمع والدور وحالة الصلاحية.');
      const key={teacher:'allow_supervisor_teacher_creation',staff:'allow_supervisor_staff_creation',
        examiner:'allow_supervisor_examiner_creation'}[role];
      const write=await admin.from('complex_staff_creation_policy')
        .upsert({complex_id:c.id,org_id:org,[key]:enabled,
          updated_by:auth.user.id,updated_at:new Date().toISOString()},{onConflict:'complex_id'});
      if(write.error)throw write.error;
      const audit=await admin.from('audit_logs').insert({
        org_id:org,action:'complex.user_creation_role.updated',actor_uid:auth.user.id,
        entity_table:'complexes',entity_id:c.id,details:{role,enabled}});
      if(audit.error)throw audit.error;
      return reply({ok:true,complex_id:c.id,role,enabled});
    }
    if(b.action==='users_list'){
      const complexFilter=String(b.complex_id||'');
      if(complexFilter&&!ids.includes(complexFilter))return reply({error:'المجمع خارج نطاقك.'},403);
      const page=Math.min(100000,Math.max(0,Math.floor(Number(b.page)||0))),size=60;
      let q=admin.from('memberships').select('id,user_id,role,org_id,complex_id,circle_id,active',{count:'exact'})
        .eq('org_id',org).order('id',{ascending:false}).range(page*size,page*size+size-1);
      if(complexFilter)q=q.eq('complex_id',complexFilter);
      else if(!adminRole)q=q.in('complex_id',ids);
      if(!adminRole)q=q.in('role',['teacher','staff','examiner']);
      const {data:members,count,error:listError}=await q;
      if(listError)throw listError;
      const userIds=[...new Set((members||[]).map(m=>m.user_id))];
      if(!userIds.length)return reply({users:[],total:count||0,page,page_size:size});
      const [pr,staffDirs]=await Promise.all([
        admin.from('profiles').select('id,display_name,email,phone,active').eq('org_id',org).in('id',userIds),
        admin.from('complex_staff_directory').select('user_id,job_title').eq('org_id',org).in('user_id',userIds)
      ]);
      if(pr.error||staffDirs.error)throw pr.error||staffDirs.error;
      const byUser=new Map((pr.data||[]).map(u=>[u.id,u]));
      const jobTitles=new Map((staffDirs.data||[]).map(u=>[u.user_id,u.job_title]));
      return reply({users:(members||[]).flatMap(m=>{
        const u=byUser.get(m.user_id);if(!u)return[];
        return [{...u,role:m.role,complex_id:m.complex_id,circle_id:m.circle_id,
          active:u.active&&m.active,membership_active:m.active,profile_active:u.active,membership_id:m.id,
          job_title:jobTitles.get(u.id)||null}];
      }),total:count||0,page,page_size:size});
    }
    if(b.action==='users_reassign'){
      const uid=String(b.user_id||'');
      const membershipId=Number(b.membership_id);
      const targetComplex=String(b.complex_id||'');
      const targetCircle=String(b.circle_id||'').trim();
      const mode=String(b.mode||'transfer');
      if(!uid||!Number.isSafeInteger(membershipId)||membershipId<1||!['transfer','add'].includes(mode))
        throw Error('تحقق من بيانات الإسناد ونوع الإجراء.');
      if(!ids.includes(targetComplex))
        return reply({error:'ليس لديك صلاحية لإسناد مستخدم إلى المجمع المختار.'},403);
      const {data,error}=await admin.rpc('reassign_complex_user',{
        p_actor:auth.user.id,p_user:uid,p_membership_id:membershipId,
        p_target_complex:targetComplex,p_target_circle:targetCircle||null,p_mode:mode
      });
      if(error)throw error;
      return reply(data||{ok:true});
    }
    if(b.action==='users_update'){
      const uid=String(b.user_id||'');
      if(uid===auth.user.id)return reply({error:'لا يمكن تغيير حسابك بهذه النافذة.'},403);
      const {data:profile,error:pe}=await admin.from('profiles').select('id,org_id,display_name,active')
        .eq('id',uid).maybeSingle();
      if(pe||!profile||profile.org_id!==org)return reply({error:'الحساب خارج المؤسسة.'},403);
      const {data:members,error:me}=await admin.from('memberships').select('role,org_id,complex_id,circle_id,active')
        .eq('user_id',uid);
      if(me)throw me;
      if(!adminRole){
        if((members||[]).length!==1||!['teacher','staff','examiner'].includes(members[0].role)
          ||!myComplexes.has(members[0].complex_id)||members[0].org_id!==org)
          return reply({error:'لا يسمح بتحرير حسابات الإدارة أو الحسابات المشتركة بين المجمعات.'},403);
      }
      const name=String(b.display_name||profile.display_name||'').trim();
      const phone=String(b.phone||'').trim();
      if(!name||name.length>150||phone.length>30)throw Error('تحقق من الاسم ورقم الجوال.');
      const active=typeof b.active==='boolean'?b.active:profile.active;
      const {error:ue}=await admin.from('profiles').update({display_name:name,phone:phone||null,active}).eq('id',uid);
      if(ue)throw ue;
      // Account activation is global; inactive memberships record past assignments.
       // A profile edit must never reactivate previously transferred memberships/teachers.
       const {error:ta}=await admin.from('teachers').update({full_name:name,phone:phone||null}).eq('user_id',uid).eq('org_id',org);
       if(ta)throw ta;
       const {error:ea}=await admin.from('examiners').update({full_name:name,phone:phone||null}).eq('user_id',uid).eq('org_id',org);
       if(ea)throw ea;
      await admin.from('audit_logs').insert({org_id:org,action:'user.scoped_account.updated',actor_uid:auth.user.id,
        entity_table:'profiles',entity_id:uid,details:{active,scope:adminRole?'system':members?.[0]?.complex_id}});
      return reply({ok:true});
    }
    // users_create: generate a strong, one-time visible initial password; never store it in application tables.
    const role=String(b.role||'');
    if(!['teacher','staff','examiner','supervisor','manager','admin'].includes(role))
      throw Error('اختر دورًا معتمدًا.');
    if(!adminRole&&!['teacher','staff','examiner'].includes(role))
      return reply({error:'لا يمكن لمشرف المجمع إنشاء أدوار الإدارة العليا.'},403);
    const complex=String(b.complex_id||'');
    const chosen=complexes.find(c=>c.id===complex);
    if(['teacher','staff','examiner','supervisor'].includes(role)&&!chosen)
      throw Error('اختر مجمعًا نشطًا ضمن نطاقك.');
    if(!allowedRole(role,complex))
      return reply({error:'مدير النظام لم يمنح مجمعك صلاحية إنشاء هذا الدور.'},403);
    const circle=String(b.circle_id||'');
    if(role==='teacher'){
      const {data:c,error:circleError}=await admin.from('circles').select('id')
        .eq('id',circle).eq('org_id',org).eq('complex_id',complex).eq('active',true).maybeSingle();
      if(circleError||!c)throw Error('اختر حلقة نشطة تتبع المجمع نفسه.');
    }
    const name=String(b.display_name||'').trim(),phone=String(b.phone||'').trim();
    const email=String(b.email||'').trim().toLowerCase(),title=String(b.job_title||'إداري مجمع').trim();
    if(!name||name.length>150||!/^\S+@\S+\.\S+$/.test(email)||phone.length>30
      ||title.length>100)throw Error('أكمل الاسم والبريد الإلكتروني وتحقق من المدخلات.');
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
    const password=Array.from(bytes.slice(0,20),x=>alphabet[x%alphabet.length]).join('');
    const created=await admin.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{display_name:name}
    });
    if(created.error||!created.data.user)throw created.error||Error('تعذر إنشاء الحساب.');
    const uid=created.data.user.id;
    try{
      if(role==='teacher'){
        const r=await admin.rpc('provision_complex_teacher',{
          p_actor:auth.user.id,p_user:uid,p_org:org,p_complex:complex,p_circle:circle,p_name:name,p_phone:phone});
        if(r.error)throw r.error;
      }else if(role==='staff'){
        const r=await admin.rpc('provision_complex_staff',{
          p_actor:auth.user.id,p_user:uid,p_org:org,p_complex:complex,p_name:name,p_phone:phone,p_title:title});
        if(r.error)throw r.error;
      }else if(role==='examiner'){
        const r=await admin.rpc('provision_complex_examiner',{
          p_actor:auth.user.id,p_user:uid,p_org:org,p_complex:complex,p_name:name,p_phone:phone});
        if(r.error)throw r.error;
      }else{
        if(!adminRole)throw Error('إنشاء حسابات الإدارة العليا خاص بمدير النظام.');
        const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{
          global:{headers:{Authorization:'Bearer '+token}},
          auth:{persistSession:false,autoRefreshToken:false}});
        const r=await userClient.rpc('set_user_access',{
          p_user_id:uid,p_org_id:org,p_active:true,p_display_name:name,
          p_memberships:[{role,orgId:org,complexId:role==='supervisor'?complex:null,circleId:null}]
        });
        if(r.error)throw r.error;
        if(phone){
          const w=await admin.from('profiles').update({phone}).eq('id',uid);
          if(w.error)throw w.error;
        }
      }
    }catch(e){
      const cleanup=await admin.auth.admin.deleteUser(uid);
      if(cleanup.error)console.error('Unified user rollback failed',uid);
      throw e;
    }
    return reply({ok:true,user_id:uid,role,display_name:name,email,phone,password});
  }

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
   // Respect the same per-complex switch on older teacher-onboarding clients.
   if(!ms?.some(m=>m.org_id===org&&m.role==='admin')){
     const flag=await admin.from('complex_staff_creation_policy')
       .select('allow_supervisor_teacher_creation').eq('org_id',org).eq('complex_id',complex).maybeSingle();
     if(flag.error)throw flag.error;
     if(flag.data?.allow_supervisor_teacher_creation===false)
       return reply({error:'مدير النظام عطّل إنشاء حسابات المعلمين لهذا المجمع.'},403);
   }

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
