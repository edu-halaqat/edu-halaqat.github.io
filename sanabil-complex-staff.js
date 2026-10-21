/* Sanabil scoped administrative staff accounts: staff onboarding and admin policy. 2026-10-21 */
(()=>{'use strict';
if(window.SanabilComplexStaff)return;
const ID='sanabil-complex-staff-dialog';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sb=()=>{if(!window.supabaseClient)throw Error('اتصال المنصة غير جاهز.');return window.supabaseClient};
const check=async(action,payload={})=>{
 const {data,error}=await sb().functions.invoke('sanabil-user-admin',{body:{action,...payload}});
 if(error){
   let explanation=data?.error||error.message;
   try{const details=await error.context?.json?.();explanation=details?.error||details?.message||explanation}catch{}
   throw Error(explanation||'تعذر الاتصال بخدمة الحسابات.');
 }
 if(data?.error)throw Error(data.error);
 return data;
};
let dlg=null,busy=false,cache=null;
function styles(){
 if(document.getElementById('sanabil-complex-staff-style'))return;
 const css=document.createElement('style');css.id='sanabil-complex-staff-style';
 css.textContent='#'+ID+'{border:0;border-radius:18px;padding:0;width:min(900px,96vw);max-height:94dvh;overflow:hidden;direction:rtl;background:#fff;color:#153b35;box-shadow:0 22px 70px #0007}#'+ID+'::backdrop{background:#051a18bb}#'+ID+' .scs-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px;background:#e9f3ef;border-bottom:1px solid #cbded6}#'+ID+' .scs-head h2{margin:0;font-size:1.2rem}#'+ID+' .scs-body{max-height:calc(94dvh - 78px);overflow-y:auto;padding:18px}#'+ID+' button{font:inherit;cursor:pointer;border:1px solid #b8d0ca;border-radius:10px;background:#eaf6f2;color:#005e50;padding:9px 12px}#'+ID+' button.scs-primary{background:#006b55;color:white;border-color:#006b55;font-weight:700}#'+ID+' button:disabled{cursor:wait;opacity:.6}#'+ID+' .scs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#'+ID+' .scs-grid label{font-weight:600;display:block}#'+ID+' input:not([type="checkbox"]),#'+ID+' select{box-sizing:border-box;width:100%;border-radius:9px;padding:10px;margin-top:5px;background:inherit;color:inherit;border:1px solid #b9d0c9}#'+ID+' .scs-policy{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #dae7e3}#'+ID+' .scs-policy label{display:flex;align-items:center;gap:8px;cursor:pointer}#'+ID+' .scs-policy input{width:21px;height:21px;accent-color:#006b55}#'+ID+' .scs-note{background:#f2f7f5;border-radius:10px;padding:10px}#'+ID+' .scs-list{display:grid;gap:7px}#'+ID+' .scs-item{padding:12px;border:1px solid #d5e4de;border-radius:12px}#'+ID+' .scs-status{min-height:1.3em;font-weight:600}#'+ID+' h3{font-size:1.03rem;margin:18px 0 10px}@media(max-width:620px){#'+ID+' .scs-grid{grid-template-columns:1fr}#'+ID+' .scs-body{padding:12px}}:root[data-sanabil-theme="dark"] #'+ID+'{background:#132b28;color:#eef7f2}:root[data-sanabil-theme="dark"] #'+ID+' .scs-head{background:#1a3833}:root[data-sanabil-theme="dark"] #'+ID+' .scs-note{background:#203c35}:root[data-sanabil-theme="dark"] #'+ID+' .scs-item,:root[data-sanabil-theme="dark"] #'+ID+' .scs-policy{border-color:#345950}:root[data-sanabil-theme="dark"] #'+ID+' button{background:#25483e;color:#f0faf4}';
 document.head.appendChild(css);
}
const getStatus=()=>dlg?.querySelector('.scs-status');
const message=(msg,error=false)=>{
 const el=getStatus();if(!el)return;el.textContent=msg;el.style.color=error?'#b83d48':'#00836b';
};
function buildShell(){
 styles();const d=document.createElement('dialog');d.id=ID;
 d.innerHTML='<header class="scs-head"><h2>إدارة الطاقم الإداري وصلاحية إضافته</h2><button type="button" data-close>إغلاق</button></header><div class="scs-body"><p class="scs-status" role="status" aria-live="polite">جارٍ تحميل الصلاحيات…</p><div class="scs-content"></div></div>';
 document.body.appendChild(d);dlg=d;
 d.querySelector('[data-close]').onclick=()=>d.close();
 d.addEventListener('close',()=>{d.remove();if(dlg===d)dlg=null},{once:true});
 d.showModal();return d;
}
function render(scopes,staff){
 if(!dlg)return;
 const content=dlg.querySelector('.scs-content'),admin=scopes.is_admin===true;
 const complexes=scopes.complexes||[],allowed=complexes.filter(c=>admin||c.allow_staff_creation);
 const policy=admin?
  '<h3>صلاحية مشرف المجمع في إنشاء الإداريين</h3><p class="scs-note">التحكم مستقل لكل مجمع، ولا يؤثر تعطيله في حسابات المعلمين أو الحسابات الإدارية الموجودة.</p>'+
  complexes.map(c=>'<div class="scs-policy"><strong>'+esc(c.name)+'</strong><label><input type="checkbox" data-policy="'+esc(c.id)+'" '+(c.allow_staff_creation?'checked':'')+'>السماح بإضافة الإداريين</label></div>').join(''):
  '<p class="scs-note">يسمح مدير النظام أو يمنع إنشاء حسابات الإداريين لكل مجمع. كل حساب جديد يبقى مرتبطًا بالمجمع المختار دون صلاحية مدير النظام أو مدير المؤسسة.</p>';
 const create=allowed.length?'<h3>إضافة إداري للمجمع</h3><form id="scs-create"><div class="scs-grid">'+
  '<label>المجمع<select name="complex_id" required>'+allowed.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'+
  '<label>المسمى الوظيفي<input name="job_title" placeholder="مثال: مسؤول شؤون الطلاب" maxlength="100" required value="إداري مجمع"></label>'+
  '<label>اسم الإداري الكامل<input name="display_name" maxlength="150" required autocomplete="name"></label>'+
  '<label>البريد الإلكتروني<input name="email" type="email" autocomplete="off" required></label>'+
  '<label>رقم الجوال (اختياري)<input name="phone" type="tel" maxlength="30"></label>'+
  '<label>كلمة مرور مؤقتة (10 أحرف فأكثر)<input name="password" type="password" minlength="10" autocomplete="new-password" required></label></div>'+
  '<p class="scs-note">ينشأ الحساب بدور «إداري مجمع» المقيد بمجمع واحد. لا تمنح هذه العملية صلاحيات مدير النظام أو تعديل بيانات المجمعات الأخرى.</p>'+
  '<button class="scs-primary" type="submit">إنشاء حساب الإداري</button></form>':
  '<p class="scs-note">إنشاء حسابات الإداريين غير مفعّل لأي مجمع ضمن صلاحياتك. يمكن لمدير النظام تمكينه من لوحة الإعدادات.</p>';
 const list='<h3>الإداريون المسجلون</h3><div class="scs-list">'+
  ((staff?.length)?staff.map(u=>'<div class="scs-item"><b>'+esc(u.display_name)+'</b> — '+esc(u.job_title)+
   '<div>'+esc(u.email)+' · '+esc(u.complex_name)+' · '+(u.active?'نشط':'غير نشط')+'</div></div>').join(''):'<p>لا توجد حسابات طاقم إداري مسجلة حتى الآن.</p>')+'</div>';
 content.innerHTML=policy+create+list;
 content.querySelectorAll('[data-policy]').forEach(box=>{
  box.onchange=async()=>{
   if(busy){box.checked=!box.checked;return}
   const id=box.dataset.policy,allow=box.checked,c=complexes.find(x=>x.id===id);
   if(!confirm((allow?'تمكين':'تعطيل')+' إضافة الإداريين لمجمع «'+c.name+'»؟')){box.checked=!allow;return}
   busy=true;box.disabled=true;
   try{await check('staff_policy_update',{complex_id:id,allow_staff_creation:allow});
    message('حُفظت صلاحية «'+c.name+'» بنجاح.');
    await reload(false);
   }catch(e){box.checked=!allow;message(e.message,true)}finally{busy=false;box.disabled=false}
  };
 });
 const f=content.querySelector('#scs-create');
 if(f)f.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  if(!f.reportValidity())return;
  const payload=Object.fromEntries(new FormData(f).entries());
  if(payload.password.length<10){message('كلمة المرور يجب ألا تقل عن 10 أحرف.',true);return}
  busy=true;const btn=f.querySelector('[type="submit"]');btn.disabled=true;
  try{
   await check('create_staff',{...payload,role:'staff'});
   f.reset();message('تم إنشاء حساب الإداري وربطه بالمجمع. سلّمه معلومات الدخول بطريقة آمنة.');
   await reload(false);
  }catch(err){message(err.message,true)}finally{busy=false;btn.disabled=false}
 };
}
async function reload(loading=true){
 if(!dlg)return;
 if(loading)message('جارٍ قراءة الصلاحيات والحسابات…');
 try{
  const [scopes,staff]=await Promise.all([check('staff_scopes'),check('staff_list')]);
  if(!dlg)return;cache=scopes;render(scopes,staff.staff||[]);
  if(loading)message('الصلاحيات محدثة من الخادم.');
 }catch(e){message(e.message,true)}
}
async function open(){
 if(dlg?.open){dlg.focus();return}
 buildShell();await reload();
}
async function decorateDashboard(root,access){
 if(!root||!access?.active)return;
 const roles=access.roles||[],admin=roles.includes('admin'),supervisor=roles.includes('supervisor');
 if(roles.includes('staff')&&!admin&&!supervisor){
  const m=access.memberships?.filter(x=>x.role==='staff')||[];
  const p=document.createElement('p');p.className='scs-note';p.textContent='حساب إداري مرتبط بالمجمع. الصلاحيات التشغيلية تحددها إدارة المنصة؛ لا يتضمن هذا الدور تعديل بيانات مجمعات أخرى.';
  root.querySelector('.sl-dashboard-actions')?.after(p);
 }
 if(!admin&&!supervisor)return;
 const toolbar=root.querySelector('.sl-dashboard-actions');
 if(!toolbar||toolbar.querySelector('[data-scs-dashboard]'))return;
 const btn=document.createElement('button');btn.type='button';btn.className='button button-soft';
 btn.dataset.scsDashboard='1';btn.textContent=admin?'🔐 صلاحيات إضافة إداريي المجمعات':'👥 إضافة وإدارة الطاقم الإداري';
 btn.onclick=()=>open();toolbar.append(btn);
}
function decorateSettings(root){
 if(!root||root.querySelector('[data-scs-settings]'))return;
 const toolbar=root.querySelector('.sl-toolbar');if(!toolbar)return;
 const btn=document.createElement('button');btn.className='button button-soft';btn.type='button';
 btn.dataset.scsSettings='1';btn.textContent='🔐 صلاحيات إنشاء حسابات الإداريين';
 btn.onclick=()=>open();toolbar.append(btn);
}
window.SanabilComplexStaff={open,decorateDashboard,decorateSettings};
})();
