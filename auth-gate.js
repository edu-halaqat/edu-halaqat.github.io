(() => {
  'use strict';
  const SUPABASE_URL = 'https://fvzoogbdezueswyihxiz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_wqrt_5bjmxmE-mw4i6EQbw_I7E_AzaZ';
  const STORE = 'sanabil-auth-session-v1';
  const ROLE_KEY = 'sanabil-auth-role-v1';
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
  async function signIn(email,password,trusted){const t=await api(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',body:JSON.stringify({email,password})});const u=await api(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${t.access_token}`}});const rows=await api(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,org_id,complex_id,circle_id&id=eq.${encodeURIComponent(u.id)}&limit=1`,{headers:{Authorization:`Bearer ${t.access_token}`,Prefer:'return=representation'}});const p=rows?.[0];const role=String(p?.role||'').toLowerCase();if(!p||!['admin','supervisor','teacher'].includes(role))throw new Error('تم التحقق من الحساب، لكن لم يتم العثور على صلاحيات منصة صالحة لهذا الحساب.');save({access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+Number(t.expires_in||3600)*1000,user_id:u.id},trusted);put(ROLE_KEY,JSON.stringify(p),trusted);}
  async function refresh(s,t){const x=await api(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});save({access_token:x.access_token,refresh_token:x.refresh_token||s.refresh_token,expires_at:Date.now()+Number(x.expires_in||3600)*1000,user_id:s.user_id},t);}
  function enter(){const {button}=fields();if(button){button.dataset.authApproved='1';button.click();}}
  async function restore(){const s=sess();if(!s)return;if(s.expires_at&&Date.now()>s.expires_at-30000){try{await refresh(s,!!get(STORE))}catch{clear();return}}try{await api(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${sess().access_token}`}});enter()}catch{clear()}}
  document.addEventListener('click',async ev=>{const b=ev.target.closest('button');if(!b)return;const label=(b.textContent||'').replace(/\s+/g,' ').trim();if(/دخول/.test(label)&&document.getElementById('login-email')){if(b.dataset.authApproved==='1'){delete b.dataset.authApproved;return}ev.preventDefault();ev.stopImmediatePropagation();if(busy)return;const {email,password,trusted}=fields();if(!email?.value||!password?.value){toast('أدخل البريد الإلكتروني وكلمة المرور.',true);return}busy=true;const old=b.innerHTML;b.disabled=true;b.textContent='جارٍ التحقق...';try{await signIn(email.value.trim(),password.value,trusted?.checked!==false);toast('تم تسجيل الدخول والتحقق من الصلاحيات.');setTimeout(enter,120)}catch(e){toast(e.message||'بيانات الدخول غير صحيحة.',true)}finally{busy=false;b.disabled=false;b.innerHTML=old}}else if(/تسجيل الخروج|خروج/.test(label)&&!document.getElementById('login-email')){clear();location.reload()}},true);
  window.addEventListener('load',()=>setTimeout(restore,250));
})();
