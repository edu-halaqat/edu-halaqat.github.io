/* Sanabil unified users management: scoped roles, per-complex switches and one-time WhatsApp invitation. */
(()=>{'use strict';
if(window.SanabilComplexStaff)return;
const ID='sanabil-users-unified-dialog',LABELS={teacher:'معلم',staff:'إداري مجمع',examiner:'مختبر',supervisor:'مشرف مجمع',manager:'مدير مؤسسة',admin:'مدير النظام'};
const SAFE_ROLES=['teacher','staff','examiner'],ALL_ROLES=[...SAFE_ROLES,'supervisor','manager','admin'];
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sdk=()=>{if(!window.supabaseClient)throw Error('لم يجهز الاتصال بالخادم.');return window.supabaseClient};
async function api(action,data={}){
 const {data:reply,error}=await sdk().functions.invoke('sanabil-user-admin',{body:{action,...data}});
 if(error){
  let note=reply?.error||error.message;
  try{const info=await error.context?.json?.();note=info?.error||info?.message||note}catch{}
  throw Error(note||'فشل الاتصال بالخادم.');
 }
 if(reply?.error)throw Error(reply.error);
 return reply;
}
let dialog=null,scopes=null,page=0,complexFilter='',busy=false,latestCredentials=null;
function css(){
 if(document.getElementById('sanabil-users-unified-style'))return;
 const st=document.createElement('style');st.id='sanabil-users-unified-style';
 st.textContent='#'+ID+'{direction:rtl;padding:0;border:0;width:min(980px,96vw);max-height:95dvh;overflow:hidden;border-radius:18px;background:#fff;color:#163a34;box-shadow:0 20px 80px #0007}#'+ID+'::backdrop{background:#091c19b9}#'+ID+' .sum-head{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 18px;background:#edf5f1;border-bottom:1px solid #d1e1d8}#'+ID+' h2{font-size:1.2rem;margin:0}#'+ID+' h3{font-size:1.04rem;margin:17px 0 9px}#'+ID+' .sum-body{padding:14px 18px;max-height:calc(95dvh - 65px);overflow:auto}#'+ID+' button{font:inherit;cursor:pointer;border:1px solid #bfd3cd;background:#eef7f3;color:#005f53;border-radius:9px;padding:9px 12px}#'+ID+' button.sum-primary{background:#00705b;border-color:#00705b;color:#fff;font-weight:700}#'+ID+' button:disabled{opacity:.6;cursor:wait}#'+ID+' label{display:block;font-weight:600}#'+ID+' input:not([type="checkbox"]),#'+ID+' select{width:100%;min-width:0;box-sizing:border-box;border:1px solid #bdd3cc;border-radius:8px;padding:10px;margin-top:5px;background:inherit;color:inherit}#'+ID+' .sum-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#'+ID+' .sum-note{background:#f0f7f4;border-radius:10px;padding:10px;margin:10px 0}#'+ID+' .sum-policy{display:grid;grid-template-columns:minmax(110px,1fr) repeat(3,minmax(80px,.5fr));align-items:center;gap:10px;padding:10px;border-bottom:1px solid #dbe8e1}#'+ID+' .sum-policy label{display:flex;align-items:center;gap:6px;font-size:.9rem}#'+ID+' .sum-policy input{width:20px;height:20px;accent-color:#00705b}#'+ID+' .sum-credential{border:2px solid #439e83;padding:13px;border-radius:14px;margin:14px 0}#'+ID+' .sum-credential pre{white-space:pre-wrap;word-break:break-word;direction:rtl;font:inherit;background:#eef7f3;padding:10px;border-radius:8px}#'+ID+' .sum-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}#'+ID+' .sum-list{display:grid;gap:8px;margin:12px 0}#'+ID+' .sum-item{border:1px solid #d6e5dd;border-radius:11px;padding:12px}#'+ID+' .sum-top{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}#'+ID+' .sum-item small{display:block;margin-top:5px;opacity:.83}#'+ID+' .sum-filter{display:flex;gap:10px;align-items:end;flex-wrap:wrap}#'+ID+' .sum-filter label{min-width:170px;flex:1}#'+ID+' .sum-status{min-height:20px}#'+ID+' .sum-edit{padding:10px 0;margin-top:9px}#'+ID+' .sum-muted{opacity:.78}@media(max-width:650px){#'+ID+' .sum-body{padding:11px}#'+ID+' .sum-fields{grid-template-columns:1fr}#'+ID+' .sum-policy{grid-template-columns:1fr 1fr}#'+ID+' .sum-policy strong{grid-column:span 2}}:root[data-sanabil-theme="dark"] #'+ID+'{background:#142d28;color:#eef8f2}:root[data-sanabil-theme="dark"] #'+ID+' .sum-head{background:#203c35}:root[data-sanabil-theme="dark"] #'+ID+' .sum-note,:root[data-sanabil-theme="dark"] #'+ID+' .sum-credential pre{background:#24453b;color:#f5f8f4}:root[data-sanabil-theme="dark"] #'+ID+' .sum-item,:root[data-sanabil-theme="dark"] #'+ID+' .sum-policy{border-color:#426257}';
 document.head.appendChild(st);
}
function status(msg,isError=false){
 const area=dialog?.querySelector('[data-status]');if(!area)return;
 area.textContent=msg;area.style.color=isError?'#c43c4c':'#00705b';
}
function selectedComplex(){return scopes?.complexes?.find(c=>c.id===dialog?.querySelector('[name="complex_id"]')?.value)}
function availableRoles(complex){
 if(scopes?.is_admin)return ALL_ROLES;
 if(!complex)return [];
 return SAFE_ROLES.filter(role=>complex.roles?.[role]===true);
}
function createForm(){
 const root=dialog.querySelector('[data-create]'),complexes=scopes.complexes||[];
 if(!complexes.length){root.textContent='لا يوجد مجمع نشط ضمن نطاق هذا الحساب.';return}
 const options=complexes.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
 root.innerHTML='<h3>إضافة مستخدم جديد</h3><form data-new-user>'+
  '<div class="sum-fields">'+
  '<label>المجمع<select name="complex_id" required>'+options+'</select></label>'+
  '<label>دور المستخدم<select name="role" required></select></label>'+
  '<label data-circle-label hidden>الحلقة (للمعلم)<select name="circle_id"></select></label>'+
  '<label data-title-label hidden>المسمى الوظيفي<input name="job_title" value="إداري مجمع" maxlength="100"></label>'+
  '<label>الاسم الكامل<input name="display_name" maxlength="150" autocomplete="off" required></label>'+
  '<label>البريد الإلكتروني<input name="email" type="email" autocomplete="off" required></label>'+
  '<label>الجوال المرتبط بواتساب (اختياري)<input name="phone" type="tel" maxlength="30" autocomplete="off" placeholder="05xxxxxxxx"></label>'+
  '</div><p class="sum-note">سيُنشئ النظام كلمة مرور أولية قوية تلقائيًا ويعرضها مرة واحدة بعد الحفظ. يمكنك مشاركة بيانات الدخول عبر واتساب.</p>'+
  '<button type="submit" class="sum-primary">إنشاء الحساب وحفظه</button></form>';
 const form=root.querySelector('form'),complexSelect=form.elements.complex_id,roleSelect=form.elements.role;
 const refreshRoles=()=>{
  const c=selectedComplex(),prev=roleSelect.value,allowed=availableRoles(c);
  roleSelect.innerHTML=allowed.map(role=>'<option value="'+role+'">'+LABELS[role]+'</option>').join('');
  if(allowed.includes(prev))roleSelect.value=prev;
  const canCreate=allowed.length>0;
  form.querySelector('button[type="submit"]').disabled=!canCreate;
  refreshDetails();
 };
 const refreshDetails=()=>{
  const role=roleSelect.value,complex=complexSelect.value;
  form.querySelector('[data-circle-label]').hidden=role!=='teacher';
  form.querySelector('[data-title-label]').hidden=role!=='staff';
  const circle= form.elements.circle_id,ls=(scopes.circles||[]).filter(x=>x.complex_id===complex);
  circle.innerHTML='<option value="">اختر الحلقة</option>'+ls.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name)+'</option>').join('');
  circle.required=role==='teacher';
  if(ls.length===1)circle.value=ls[0].id;
  complexSelect.disabled=['admin','manager'].includes(role); // Admin-only organization-level roles.
 };
 complexSelect.onchange=refreshRoles;roleSelect.onchange=()=>{
  // Reenable complex before changing roles to avoid a disabled input hiding the selected scope.
  complexSelect.disabled=false;refreshDetails();
 };
 refreshRoles();
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  if(!form.reportValidity())return;
  const c=selectedComplex(),role=roleSelect.value;
  if(!availableRoles(c).includes(role)){status('هذا الدور غير مفعّل للمجمع المختار.',true);return}
  if(role==='teacher'&&!form.elements.circle_id.value){status('اختر حلقة المعلم.',true);return}
  const args={display_name:form.elements.display_name.value.trim(),email:form.elements.email.value.trim(),
   phone:form.elements.phone.value.trim(),role,complex_id:c?.id||null,
   circle_id:form.elements.circle_id.value||null,job_title:form.elements.job_title.value.trim()};
  busy=true;const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  try{
   const created=await api('users_create',args);
   const share={...args,password:created.password};
   latestCredentials=share;
   showCredentials(share);
   status('تم إنشاء حساب '+share.display_name+' بنجاح. شارك بيانات الدخول مع صاحب الحساب.');
   form.elements.display_name.value='';form.elements.email.value='';form.elements.phone.value='';
   await refreshList(false);
  }catch(err){status(err.message,true)}
  finally{busy=false;btn.disabled=false}
 };
}
function accessText(c){
 return 'السلام عليكم ورحمة الله وبركاته\nتم إنشاء حساب دخولك في منصة سنابل الوحي.\n'+
 'الاسم: '+c.display_name+'\nالدور: '+(LABELS[c.role]||c.role)+'\n'+
 'رابط الدخول: https://snabilalwahy.com\nالبريد الإلكتروني: '+c.email+
 '\nكلمة المرور الأولية: '+c.password+
 '\nيرجى تغيير كلمة المرور فور أول دخول، وعدم مشاركة بيانات الحساب.';
}
function whatsappNumber(raw){
 let phone=String(raw||'').replace(/\D/g,'');
 if(phone.startsWith('00'))phone=phone.slice(2);
 if(phone.startsWith('05')&&phone.length===10)phone='966'+phone.slice(1);
 else if(phone.startsWith('5')&&phone.length===9)phone='966'+phone;
 return phone.length>=9&&phone.length<=15?phone:'';
}
function showCredentials(data){
 const target=dialog?.querySelector('[data-credentials]');if(!target)return;
 const text=accessText(data);
 target.innerHTML='<section class="sum-credential"><strong>تم إنشاء الحساب — بيانات الدخول الأولية</strong>'+
  '<p class="sum-muted">تظهر كلمة المرور الآن فقط. تحقق من رقم المستلم قبل الإرسال عبر واتساب.</p>'+
  '<pre></pre><div class="sum-actions"><button type="button" data-copy>نسخ بيانات الدخول</button>'+
  '<button class="sum-primary" type="button" data-whatsapp>مشاركة عبر واتساب</button>'+
  '<button type="button" data-hide>إخفاء بيانات الدخول</button></div></section>';
 target.querySelector('pre').textContent=text;
 target.querySelector('[data-copy]').onclick=async()=>{
  try{
   await navigator.clipboard.writeText(text);status('نُسخت بيانات الدخول.');
  }catch{status('تعذر النسخ التلقائي. حدّد النص وانسخه يدويًا.',true)}
 };
 target.querySelector('[data-whatsapp]').onclick=()=>{
  const phone=whatsappNumber(data.phone),url='https://wa.me/'+phone+'?text='+encodeURIComponent(text);
  window.open(url,'_blank','noopener,noreferrer');
 };
 target.querySelector('[data-hide]').onclick=()=>{target.replaceChildren();latestCredentials=null;status('أُخفيت كلمة المرور الأولية.');};
}
function policyPanel(){
 const root=dialog.querySelector('[data-policy]'),isAdmin=!!scopes.is_admin;
 if(!isAdmin){root.replaceChildren();return}
 root.innerHTML='<h3>صلاحيات إنشاء المستخدمين بحسب المجمع</h3>'+
  '<p class="sum-note">يمكن تحديد دور مختلف لكل مجمع. لا يستطيع المشرف إنشاء مشرفين أو مديرين. هذا التحكم لا يوقف الحسابات الموجودة.</p>'+
  '<div class="sum-policy sum-muted"><strong>المجمع</strong><b>إضافة معلم</b><b>إضافة إداري</b><b>إضافة مختبر</b></div>'+
  scopes.complexes.map(c=>'<div class="sum-policy"><strong>'+escapeHtml(c.name)+'</strong>'+
    SAFE_ROLES.map(role=>'<label><input type="checkbox" data-policy="'+role+'" data-complex="'+escapeHtml(c.id)+'"'+
    (c.roles?.[role]?' checked':'')+'> '+LABELS[role]+'</label>').join('')+'</div>').join('');
 root.querySelectorAll('[data-policy]').forEach(input=>input.onchange=async()=>{
  const role=input.dataset.policy,complexId=input.dataset.complex,enabled=input.checked;
  if(busy){input.checked=!enabled;return}
  busy=true;input.disabled=true;
  try{
   await api('users_policy_update',{complex_id:complexId,role,enabled});
   const c=scopes.complexes.find(c=>c.id===complexId);if(c)c.roles[role]=enabled;
   status('تم حفظ صلاحية '+LABELS[role]+' في المجمع.');
  }catch(e){input.checked=!enabled;status(e.message,true)}
  finally{busy=false;input.disabled=false}
 });
}
async function refreshList(showStatus=true){
 if(!dialog)return;
 const root=dialog.querySelector('[data-users]');if(showStatus)status('جارٍ تحميل حسابات المستخدمين…');
 try{
  const res=await api('users_list',{page,complex_id:complexFilter});
  if(!dialog)return;
  const users=res.users||[],total=res.total||0,lastPage=Math.max(0,Math.ceil(total/(res.page_size||60))-1);
  if(page>lastPage){page=lastPage;await refreshList(false);return}
  root.innerHTML='<h3>المستخدمون المسجلون</h3><div class="sum-filter">'+
   '<label>عرض مجمع<select data-list-complex><option value="">كل المجمعات المصرح بها</option>'+
    (scopes.complexes||[]).map(c=>'<option value="'+escapeHtml(c.id)+'"'+(complexFilter===c.id?' selected':'')+'>'+escapeHtml(c.name)+'</option>').join('')+
   '</select></label><button type="button" data-refresh>تحديث القائمة</button></div>'+
   '<div class="sum-list">'+(users.length?users.map((u,i)=>
    '<section class="sum-item"><div class="sum-top"><div><strong>'+escapeHtml(u.display_name)+'</strong>'+
    '<small>'+escapeHtml(u.email||'')+' · '+escapeHtml(LABELS[u.role]||u.role)+
    ' · '+escapeHtml(scopes.complexes.find(c=>c.id===u.complex_id)?.name||'مستوى المؤسسة')+
    ' · '+(u.active?'نشط':'غير نشط')+'</small></div>'+
    '<button type="button" data-edit="'+i+'">تعديل الحساب</button></div><div class="sum-edit" data-edit-box="'+i+'" hidden></div></section>'
   ).join(''):'<p>لا توجد حسابات في هذا النطاق.</p>')+'</div>'+
   '<div class="sum-actions"><button data-prev '+(page===0?'disabled':'')+'>السابق</button>'+
   '<span>الصفحة '+(page+1)+' من '+(lastPage+1)+' — إجمالي '+total+'</span>'+
   '<button data-next '+(page>=lastPage?'disabled':'')+'>التالي</button></div>';
  root.querySelector('[data-list-complex]').onchange=e=>{complexFilter=e.target.value;page=0;refreshList()};
  root.querySelector('[data-refresh]').onclick=()=>refreshList();
  root.querySelector('[data-prev]').onclick=()=>{page=Math.max(0,page-1);refreshList()};
  root.querySelector('[data-next]').onclick=()=>{page+=1;refreshList()};
  root.querySelectorAll('[data-edit]').forEach(button=>{
    button.onclick=()=>{
      const index=Number(button.dataset.edit),u=users[index],box=root.querySelector('[data-edit-box="'+index+'"]');
      if(!u||!box)return;
      if(!box.hidden){box.hidden=true;return}
      box.hidden=false;
      box.innerHTML='<form><div class="sum-fields"><label>الاسم<input name="display_name" maxlength="150" required value="'+escapeHtml(u.display_name)+'"></label>'+
       '<label>رقم الجوال<input name="phone" type="tel" maxlength="30" value="'+escapeHtml(u.phone||'')+'"></label></div>'+
       '<label><input name="active" type="checkbox" '+(u.active?'checked':'')+'> الحساب نشط</label>'+
       '<div class="sum-actions"><button class="sum-primary" type="submit">حفظ التعديل</button>'+
       '<button type="button" data-cancel>إلغاء</button></div></form>';
      const f=box.querySelector('form');box.querySelector('[data-cancel]').onclick=()=>box.hidden=true;
      f.onsubmit=async e=>{
       e.preventDefault();if(busy)return;
       busy=true;const save=f.querySelector('[type="submit"]');save.disabled=true;
       try{await api('users_update',{user_id:u.id,display_name:f.elements.display_name.value,
        phone:f.elements.phone.value,active:f.elements.active.checked});
        status('حُفظت بيانات المستخدم.');await refreshList(false);
       }catch(err){status(err.message,true)}finally{busy=false;save.disabled=false}
      };
    };
  });
  if(showStatus)status('عُرضت الحسابات ضمن صلاحياتك.');
 }catch(err){status(err.message,true);root.textContent='تعذر تحميل قائمة المستخدمين.'}
}
async function open(){
 if(dialog?.open){dialog.focus();return}
 css();const d=document.createElement('dialog');dialog=d;page=0;complexFilter='';latestCredentials=null;
 d.id=ID;
 d.innerHTML='<header class="sum-head"><h2>إدارة المستخدمين</h2><button type="button" data-close>إغلاق</button></header>'+
  '<div class="sum-body"><p role="status" aria-live="polite" class="sum-status" data-status>جارٍ تحميل الصلاحيات…</p>'+
  '<div data-credentials></div><section data-create></section><section data-policy></section><section data-users></section></div>';
 document.body.appendChild(d);d.querySelector('[data-close]').onclick=()=>d.close();
 d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;scopes=null;latestCredentials=null},{once:true});
 d.showModal();
 try{scopes=await api('users_scopes');if(dialog!==d)return;createForm();policyPanel();await refreshList(false);status('يمكنك إضافة مستخدم وإدارة حساباته من هذه النافذة.')}
 catch(err){status(err.message,true)}
}
async function decorateDashboard(root,access){
 if(!root||!access?.active)return;
 if(!(access.roles||[]).some(r=>r==='admin'||r==='supervisor'))return;
 const toolbar=root.querySelector('.sl-dashboard-actions');
 if(!toolbar||toolbar.querySelector('[data-scs-dashboard]'))return;
 const button=document.createElement('button');button.type='button';button.className='button button-soft';
 button.dataset.scsDashboard='1';button.textContent='👥 إدارة المستخدمين';
 button.onclick=open;toolbar.append(button);
}
function decorateSettings(root){
 const toolbar=root?.querySelector('.sl-toolbar');if(!toolbar||toolbar.querySelector('[data-scs-settings]'))return;
 // The settings page already has its original "إدارة المستخدمين" entry; do not add a second page/button.
}
window.SanabilComplexStaff={open,decorateDashboard,decorateSettings};
})();