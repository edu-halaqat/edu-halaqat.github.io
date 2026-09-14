(() => {
  'use strict';
  const SUPABASE_URL = 'https://fvzoogbdezueswyihxiz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ';
  const STORE = 'sanabil-auth-session-v2';
  const ROLE_KEY = 'sanabil-auth-access-v2';
  let busy = false;
  const get=(k,s=false)=>{try{return(s?sessionStorage:localStorage).getItem(k)}catch{return null}};
  const put=(k,v,s=false)=>{try{(s?sessionStorage:localStorage).setItem(k,v)}catch{}};
  const del=(k,s=false)=>{try{(s?sessionStorage:localStorage).removeItem(k)}catch{}};
  const api=async(url,o={})=>{const r=await fetch(url,{...o,headers:{apikey:SUPABASE_KEY,...(o.headers||{}),'Content-Type':'application/json'}});let b=null;try{b=await r.json()}catch{}if(!r.ok)throw new Error(b?.msg||b?.message||b?.error_description||b?.error||'تعذر الاتصال بخدمة الدخول');return b};
  const sess=()=>{const x=get(STORE)||get(STORE,true);try{return x?JSON.parse(x):null}catch{return null}};
  const save=(s,t)=>{del(STORE);del(STORE,true);put(STORE,JSON.stringify(s),!t);};
  const clear=()=>{del(STORE);del(STORE,true);del(ROLE_KEY);};
  const toast=(m,e=false)=>{let n=document.getElementById('sanabil-auth-toast');if(!n){n=document.createElement('div');n.id='sanabil-auth-toast';Object.assign(n.style,{position:'fixed',left:'18px',right:'18px',bottom:'18px',zIndex:100000,maxWidth:'560px',margin:'auto',padding:'13px 17px',borderRadius:'14px',background:e?'#8b1e2d':'#006b55',color:'#fff',fontWeight:'700',textAlign:'center',direction:'rtl',boxShadow:'0 10px 35px #0003'});document.body.appendChild(n)}n.textContent=m;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>n.hidden=true,4200)};
  const fields=()=>({email:document.getElementById('login-email'),password:document.getElementById('login-password'),trusted:document.querySelector('.trusted-device input'),button:[...document.querySelectorAll('button')].find(x=>/دخول/.test(x.textContent||''))});
  async function access(token){const a=await api(`${SUPABASE_URL}/rest/v1/rpc/my_access`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:'{}'});return a||{};}
  function validAccess(a){const roles=Array.isArray(a?.roles)?a.roles.map(x=>String(x).toLowerCase()):[];return a?.active===true&&roles.some(r=>['admin','supervisor','teacher'].includes(r));}

  const NAV_BY_ROLE={
    teacher:new Set(['الرئيسية','البصمة','الحصيلة اليومية','الاختبارات']),
    supervisor:new Set(['الرئيسية','الخطط التعليمية','الاختبارات','الطلاب والمعلمون','الاستعلامات','التقارير والإحصاءات']),
    admin:new Set(['الرئيسية','الخطط التعليمية','الاختبارات','الطلاب والمعلمون','الاستعلامات','التقارير والإحصاءات','إعدادات المنصة'])
  };
  const canonical=(label)=>String(label||'').replace(/\s+/g,' ').trim().replace(/^(إدارة|صفحة)\s+/,'');
  function currentRole(){try{const a=JSON.parse(get(ROLE_KEY)||get(ROLE_KEY,true)||'{}');const rs=Array.isArray(a.roles)?a.roles.map(x=>String(x).toLowerCase()):[];return rs.includes('admin')?'admin':rs.includes('supervisor')?'supervisor':rs.includes('teacher')?'teacher':null}catch{return null}}
  function roleAllows(label,role){return !role||NAV_BY_ROLE[role].has(canonical(label));}
  function enforceRoleUi(){
    const role=currentRole();
    if(!role||document.getElementById('login-email'))return;
    document.querySelectorAll('.tabs button').forEach(b=>{
      const allowed=roleAllows(b.textContent,role);
      b.hidden=!allowed;b.setAttribute('aria-hidden',String(!allowed));b.style.display=allowed?'':'none';
    });
    document.querySelectorAll('button,[role="button"],a').forEach(el=>{
      const label=canonical(el.textContent);if(!label)return;
      if(role==='teacher' && /الطلاب والمعلمون|التقارير|الإحصاءات|الإعدادات|الخطط|الاستعلامات/.test(label) && !el.closest('.tabs')){el.hidden=true;el.style.display='none';}
      if((role==='supervisor'||role==='admin') && /الحضور والبصمة|البصمة|الحصيلة اليومية|الحصيلة/.test(label) && !el.closest('.tabs')){el.hidden=true;el.style.display='none';}
    });
  }
  let roleUiTimer=null;
  function scheduleRoleUi(){clearTimeout(roleUiTimer);roleUiTimer=setTimeout(enforceRoleUi,40);}
  function installRoleObserver(){if(window.__sanabilRoleObserver)return;window.__sanabilRoleObserver=new MutationObserver(scheduleRoleUi);window.__sanabilRoleObserver.observe(document.body,{childList:true,subtree:true});scheduleRoleUi();}

  async function signIn(email,password,trusted){const t=await api(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',body:JSON.stringify({email,password})});const u=await api(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${t.access_token}`}});const a=await access(t.access_token);if(!validAccess(a))throw new Error('تم التحقق من الحساب، لكن لا توجد صلاحية فعالة في منصة سنابل الوحي.');save({access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+Number(t.expires_in||3600)*1000,user_id:u.id},trusted);put(ROLE_KEY,JSON.stringify(a),trusted);}
  async function refresh(s,t){const x=await api(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});save({access_token:x.access_token,refresh_token:x.refresh_token||s.refresh_token,expires_at:Date.now()+Number(x.expires_in||3600)*1000,user_id:s.user_id},t);}
  function enter(){const {button}=fields();if(button){button.dataset.authApproved='1';button.click();}}
  async function restore(){const s=sess();if(!s)return;const trusted=!!get(STORE);try{if(s.expires_at&&Date.now()>s.expires_at-30000){await refresh(s,trusted)}const current=sess();const a=await access(current.access_token);if(!validAccess(a)){clear();return}put(ROLE_KEY,JSON.stringify(a),trusted);await api(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${current.access_token}`}});enter()}catch{clear()}}
  document.addEventListener('click',async ev=>{
    const b=ev.target.closest('button,a,[role="button"]');if(!b)return;
    const label=(b.textContent||'').replace(/\s+/g,' ').trim();const role=currentRole();
    if(role && !document.getElementById('login-email')){
      const forbiddenTeacher=role==='teacher' && /الطلاب والمعلمون|التقارير|الإحصاءات|الإعدادات|الخطط|الاستعلامات/.test(label);
      const forbiddenManager=(role==='supervisor'||role==='admin') && /إدخال الحضور|تسجيل الحضور|إدخال الحصيلة|الحصيلة اليومية للمعلم|الحصيلة/.test(label);
      if(forbiddenTeacher||forbiddenManager){ev.preventDefault();ev.stopImmediatePropagation();toast('هذه الوظيفة غير متاحة لهذا الدور.',true);return;}
    }
    if(/دخول/.test(label)&&document.getElementById('login-email')){
      if(b.dataset.authApproved==='1'){delete b.dataset.authApproved;setTimeout(installRoleObserver,80);return}
      ev.preventDefault();ev.stopImmediatePropagation();if(busy)return;const {email,password,trusted}=fields();if(!email?.value||!password?.value){toast('أدخل البريد الإلكتروني وكلمة المرور.',true);return}busy=true;b.disabled=true;b.textContent='جارٍ التحقق...';try{await signIn(email.value.trim(),password.value,trusted?.checked!==false);toast('تم تسجيل الدخول والتحقق من الصلاحيات.');setTimeout(enter,120)}catch(e){toast(e.message||'بيانات الدخول غير صحيحة.',true)}finally{busy=false;b.disabled=false;b.innerHTML='دخول';}}
    else if(/تسجيل الخروج|خروج/.test(label)&&!document.getElementById('login-email')){clear();location.reload()}
  },true);
  window.addEventListener('load',()=>{setTimeout(restore,250);setTimeout(installRoleObserver,700)});
})();
