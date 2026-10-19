/* Sanabil registry management: scoped, non-destructive editing for supervisors. 2026-10-19 */
(()=>{'use strict';
const ID='sanabil-registry-editor',esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sdk=()=>{if(!window.supabaseClient)throw Error('لم تكتمل تهيئة الاتصال.');return window.supabaseClient};
const check=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data};
const opts=(list,current,empty='اختر')=>'<option value="">'+esc(empty)+'</option>'+list.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===current?' selected':'')+'>'+esc(x.name)+'</option>').join('');
const errorMessage=e=>e?.message||'تعذر تنفيذ العملية';
let accessCache=null,accessAt=0,loadingAccess=null,dialog=null,dirty=false,tab='teachers',data=null;
const roles=new Set(['admin','manager','supervisor']);
async function isManager(){
 if(accessCache&&Date.now()-accessAt<25000)return accessCache;
 if(loadingAccess)return loadingAccess;
 loadingAccess=(async()=>{try{const a=await check(sdk().rpc('my_access',{}));accessCache=Boolean(a?.active&&Array.isArray(a.roles)&&a.roles.some(r=>roles.has(String(r))));accessAt=Date.now();return accessCache}catch{return false}finally{loadingAccess=null}})();
 return loadingAccess;
}
function css(){
 if(document.getElementById('sr-manage-style'))return;
 const el=document.createElement('style');el.id='sr-manage-style';el.textContent='#'+ID+'{border:0;border-radius:18px;padding:0;width:min(1020px,96vw);max-height:92vh;overflow:hidden;color:#133d36;background:#fff;box-shadow:0 22px 80px #0006;direction:rtl}#'+ID+'::backdrop{background:#071b18b0}#'+ID+' .sr-header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:15px 20px;background:#e9f3ef;border-bottom:1px solid #bcd6cc}#'+ID+' .sr-content{overflow:auto;max-height:calc(92vh - 76px);padding:16px}#'+ID+' button{font:inherit;border:1px solid #c0d4cf;border-radius:9px;padding:7px 11px;color:#075c50;background:#eff7f4;cursor:pointer}#'+ID+' button:disabled{opacity:.5;cursor:wait}#'+ID+' button.sr-primary{color:#fff;background:#00808a;border-color:#00808a}#'+ID+' .sr-tabs{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}#'+ID+' .sr-selected{background:#006b55!important;color:#fff!important}#'+ID+' .sr-scroller{overflow:auto;max-width:100%}#'+ID+' table{width:100%;border-collapse:collapse;min-width:660px}#'+ID+' th,#'+ID+' td{padding:10px;border-bottom:1px solid #dce7e3;text-align:right;vertical-align:middle}#'+ID+' th{background:#f2f6f4}#'+ID+' small{display:block;opacity:.8}#'+ID+' .sr-warning{color:#915923}#'+ID+' .sr-error{color:#a32936}#'+ID+' .sr-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#'+ID+' label{display:block;font-weight:600}#'+ID+' input:not([type="checkbox"]),#'+ID+' select,#'+ID+' textarea{display:block;width:100%;box-sizing:border-box;padding:9px;margin-top:5px;border:1px solid #bfd0ca;border-radius:8px;background:inherit;color:inherit}#'+ID+' .sr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}#'+ID+' .sr-panel{border:1px solid #c5d5d0;border-radius:12px;padding:16px;margin-top:15px}#'+ID+' .sr-status{margin:8px 0;min-height:1.5em}@media(max-width:650px){#'+ID+' .sr-fields{grid-template-columns:1fr}#'+ID+' .sr-content{padding:10px}}:root[data-sanabil-theme="dark"] #'+ID+'{background:#142b2a;color:#eef9f4}:root[data-sanabil-theme="dark"] #'+ID+' .sr-header,:root[data-sanabil-theme="dark"] #'+ID+' th{background:#1d3937}:root[data-sanabil-theme="dark"] #'+ID+' td{border-color:#36524b}:root[data-sanabil-theme="dark"] #'+ID+' button{background:#244944;color:#e1f7f0;border-color:#42655d}';
 document.head.appendChild(el);
}
async function refresh(){
 const s=sdk();
 const [teachers,circles,links,students,mosques,rules]=await Promise.all([
  check(s.from('teachers').select('id,org_id,complex_id,circle_id,full_name,phone,job_title,user_id,source_ref,active').order('full_name')),
  check(s.from('circles').select('id,org_id,complex_id,mosque_id,name,circle_type,session_period,assignment_note,active').order('name')),
  check(s.from('circle_teachers').select('circle_id,teacher_id,is_primary,active').eq('active',true)),
  check(s.from('students').select('id,circle_id,teacher_id').eq('active',true)),
  check(s.from('mosques').select('id,complex_id,name').eq('active',true)),
  check(s.from('circle_session_rules').select('circle_id,weekdays'))
 ]);
 data={teachers,circles,links,students,mosques,rules};
}
const teacher=id=>data.teachers.find(t=>t.id===id),circle=id=>data.circles.find(c=>c.id===id);
const head=()=>'<div class="sr-tabs">'+[['teachers','المعلمون'],['circles','الحلقات'],['assign','الإسناد']].map(([id,label])=>'<button type="button" data-tab="'+id+'"'+(id===tab?' class="sr-selected"':'')+'>'+label+'</button>').join('')+'</div>';
const teacherStatus=t=>!t.active?'موقوف':!t.user_id?'مستورد أو مضاف دون حساب رسمي':'مرتبط بحساب مستخدم';
function show(){
 if(!dialog||!data)return;
 const body=dialog.querySelector('.sr-content');
 let html=head();
 if(tab==='teachers'){
 html+='<p>يمكن تحرير بيانات المعلم أو إيقاف سجله دون حذف طلابه أو حصائله. ربط حساب الدخول يتم من إدارة المستخدمين، ولا يحدث تلقائيًا.</p><div class="sr-scroller"><table><thead><tr><th>المعلم</th><th>حالة التسجيل</th><th>الحلقات الحالية</th><th>إجراء</th></tr></thead><tbody>'+
 data.teachers.map(t=>{const names=data.links.filter(a=>a.teacher_id===t.id).map(a=>circle(a.circle_id)?.name).filter(Boolean);
 return '<tr><td>'+esc(t.full_name)+'<small>'+esc(t.job_title||'')+'</small></td><td'+(!t.user_id?' class="sr-warning"':'')+'>'+esc(teacherStatus(t))+'</td><td>'+esc(names.join('، ')||'لا يوجد إسناد نشط')+'</td><td><button data-edit-teacher="'+esc(t.id)+'">تحرير</button></td></tr>'}).join('')+'</tbody></table></div>';
 }else if(tab==='circles'){
 html+='<p>تعديل اسم الحلقة ونوعها وفترتها ومسجدها، مع إبقاء الطلاب والنتائج والإسنادات محفوظة.</p><div class="sr-scroller"><table><thead><tr><th>الحلقة</th><th>النوع والفترة</th><th>الطلاب</th><th>المعلم المسند</th><th>إجراء</th></tr></thead><tbody>'+
 data.circles.map(c=>{const links=data.links.filter(a=>a.circle_id===c.id);
 return '<tr><td>'+esc(c.name)+'<small>'+(c.active?'نشطة':'متوقفة')+'</small></td><td>'+esc(c.circle_type||'—')+' / '+esc(c.session_period||'—')+'</td><td>'+data.students.filter(s=>s.circle_id===c.id).length+'</td><td>'+esc(links.map(a=>teacher(a.teacher_id)?.full_name||'سجل غير معروف').join('، ')||'غير مسند')+'</td><td><button data-edit-circle="'+esc(c.id)+'">تحرير</button></td></tr>'}).join('')+'</tbody></table></div>';
 }else{
 html+='<p>يمكن إعادة الإسناد أو إلغاؤه دون نقل الطلاب أو تعديل نتائجهم. لا تُنشأ إسنادات جديدة لمعلم بلا حساب رسمي نشط.</p><div class="sr-scroller"><table><thead><tr><th>الحلقة</th><th>الفترة</th><th>الإسناد المعتمد</th><th>إجراء</th></tr></thead><tbody>'+
 data.circles.filter(c=>c.active).map(c=>{const links=data.links.filter(a=>a.circle_id===c.id);
 return '<tr><td>'+esc(c.name)+'</td><td>'+esc(c.session_period||'—')+'</td><td>'+esc(links.map(a=>teacher(a.teacher_id)?.full_name||'معلم غير معروف').join('، ')||'غير مسند')+'</td><td><button data-set-assign="'+esc(c.id)+'">تعديل الإسناد</button> '+links.map(a=>'<button data-unassign="'+esc(c.id)+'" data-teacher="'+esc(a.teacher_id)+'">إلغاء</button>').join(' ')+'</td></tr>'}).join('')+'</tbody></table></div>';
 }
 body.innerHTML=html+'<div id="sr-edit-area"></div><p class="sr-status" role="status" aria-live="polite"></p>';
 body.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;show()});
 body.querySelectorAll('[data-edit-teacher]').forEach(b=>b.onclick=()=>editTeacher(b.dataset.editTeacher));
 body.querySelectorAll('[data-edit-circle]').forEach(b=>b.onclick=()=>editCircle(b.dataset.editCircle));
 body.querySelectorAll('[data-set-assign]').forEach(b=>b.onclick=()=>editAssignment(b.dataset.setAssign));
 body.querySelectorAll('[data-unassign]').forEach(b=>b.onclick=()=>unassign(b.dataset.unassign,b.dataset.teacher));
}
function message(text,bad=false){const e=dialog?.querySelector('.sr-status');if(e){e.textContent=text;e.className='sr-status'+(bad?' sr-error':'')}}
function editTeacher(id){
 const t=teacher(id);if(!t)return;const b=dialog.querySelector('#sr-edit-area');
 b.innerHTML='<section class="sr-panel"><h3>تحرير المعلم: '+esc(t.full_name)+'</h3><form id="sr-edit-form"><div class="sr-fields"><label>الاسم الكامل<input required maxlength="180" name="full_name" value="'+esc(t.full_name)+'"></label><label>رقم الجوال<input name="phone" maxlength="25" value="'+esc(t.phone||'')+'"></label><label>المسمى الوظيفي<input name="job_title" maxlength="100" value="'+esc(t.job_title||'')+'"></label><label>الحالة<select name="active"><option value="1"'+(t.active?' selected':'')+'>نشط</option><option value="0"'+(!t.active?' selected':'')+'>موقوف</option></select></label></div><p class="sr-warning">'+esc(t.user_id?'الحساب مرتبط بالفعل؛ تعديل بيانات الدخول وصلاحياته من إدارة المستخدمين.':'لا يوجد حساب دخول مرتبط. لا يمكن اعتماد السجل أو إسناده قبل إنشاء حساب رسمي وربطه.')+'</p><div class="sr-actions"><button type="submit" class="sr-primary">حفظ التعديل</button><button type="button" data-cancel>إلغاء</button></div></form></section>';
 b.querySelector('[data-cancel]').onclick=()=>b.replaceChildren();
 b.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,active=f.elements.active.value==='1',name=f.elements.full_name.value.trim();
 try{if(name.length<3)throw Error('الاسم غير مكتمل.');if(active&&!t.user_id)throw Error('لا يمكن تفعيل سجل معلم بلا حساب رسمي مرتبط.');if(t.active&&!active&&!confirm('إيقاف سجل المعلم دون حذف حصائل طلابه أو ارتباطاتهم التاريخية؟'))return;
 await save(f,sdk().from('teachers').update({full_name:name,phone:f.elements.phone.value.trim()||null,job_title:f.elements.job_title.value.trim()||null,active,updated_at:new Date().toISOString()}).eq('id',id).eq('complex_id',t.complex_id).select('id').single(),'تم تعديل بيانات المعلم.');}catch(x){message(errorMessage(x),true)}};
 b.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function editCircle(id){
 const c=circle(id);if(!c)return;const b=dialog.querySelector('#sr-edit-area'),mosques=data.mosques.filter(m=>m.complex_id===c.complex_id).map(m=>({id:m.id,name:m.name})),periods=['الفجر','الظهر','العصر','المغرب','العشاء','وقت مرن (عن بعد)'].map(name=>({id:name,name})),types=['حلقة حفظ','حلقات التلقين','حلقة تصحيح التلاوة فقط','حلقة إجازة'].map(name=>({id:name,name}));
 b.innerHTML='<section class="sr-panel"><h3>تحرير الحلقة: '+esc(c.name)+'</h3><form><div class="sr-fields"><label>اسم الحلقة<input name="name" required maxlength="180" value="'+esc(c.name)+'"></label><label>نوع الحلقة<select name="circle_type">'+opts(types,c.circle_type)+'</select></label><label>الفترة<select name="session_period">'+opts(periods,c.session_period)+'</select></label><label>المسجد<select name="mosque_id">'+opts(mosques,c.mosque_id)+'</select></label><label>ملاحظات الإسناد<input name="assignment_note" maxlength="300" value="'+esc(c.assignment_note||'')+'"></label><label>الحالة<select name="active"><option value="1"'+(c.active?' selected':'')+'>نشطة</option><option value="0"'+(!c.active?' selected':'')+'>موقوفة</option></select></label></div><p>تغيير الفترة يؤثر في ضوابط الدوام والبصمة؛ راجع جدول المعلم قبل الحفظ.</p><div class="sr-actions"><button type="submit" class="sr-primary">حفظ الحلقة</button><button type="button" data-cancel>إلغاء</button></div></form></section>';
 b.querySelector('[data-cancel]').onclick=()=>b.replaceChildren();
 b.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,name=f.elements.name.value.trim(),period=f.elements.session_period.value,mosque=f.elements.mosque_id.value,active=f.elements.active.value==='1';
 try{if(!name||!mosque||!data.mosques.some(m=>m.id===mosque&&m.complex_id===c.complex_id))throw Error('اسم الحلقة أو المسجد غير صحيح.');if(!active&&data.students.some(s=>s.circle_id===id))throw Error('لا يمكن إيقاف حلقة بها طلاب نشطون؛ انقلهم أولًا.');if((period!==c.session_period||f.elements.circle_type.value!==c.circle_type)&&data.students.some(s=>s.circle_id===id)&&!confirm('الحلقة لديها طلاب؛ هل تؤكد تعديل الفترة أو النوع مع إبقاء سجلاتهم دون تغيير؟'))return;
 await save(f,sdk().from('circles').update({name,circle_type:f.elements.circle_type.value,session_period:period,mosque_id:mosque,assignment_note:f.elements.assignment_note.value.trim()||null,active,updated_at:new Date().toISOString()}).eq('id',id).eq('complex_id',c.complex_id).select('id').single(),'تم تعديل الحلقة وحفظ سجلاتها.');}catch(x){message(errorMessage(x),true)}};
 b.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function editAssignment(id){
 const c=circle(id);if(!c)return;const b=dialog.querySelector('#sr-edit-area'),allowed=data.teachers.filter(t=>t.active&&t.user_id&&t.complex_id===c.complex_id).map(t=>({id:t.id,name:t.full_name}));
 b.innerHTML='<section class="sr-panel"><h3>إسناد معلم إلى: '+esc(c.name)+'</h3><form><label>المعلم المعتمد<select name="teacher_id" required>'+opts(allowed,'','اختر المعلم')+'</select></label><p>لن تتغير بيانات الطلاب السابقين أو الحصائل المحفوظة. يمنع إسناد حلقتين لنفس المعلم في الفترة وأيام الدوام المتداخلة.</p><div class="sr-actions"><button type="submit" class="sr-primary">اعتماد الإسناد</button><button type="button" data-cancel>إلغاء</button></div></form></section>';
 b.querySelector('[data-cancel]').onclick=()=>b.replaceChildren();
 b.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,t=teacher(f.elements.teacher_id.value);
 try{if(!t||!t.user_id||!t.active||t.complex_id!==c.complex_id)throw Error('اختر معلمًا رسميًا نشطًا داخل المجمع.');const conflict=data.links.filter(a=>a.teacher_id===t.id&&a.circle_id!==c.id).map(a=>circle(a.circle_id)).filter(x=>x&&x.active&&x.session_period===c.session_period&&overlapDays(x.id,c.id));if(conflict.length)throw Error('تعارض فترات الدوام مع: '+conflict.map(x=>x.name).join('، ')+'. عدّل أيام دوام الحلقات أولًا.');
 const existing=data.links.filter(a=>a.circle_id===c.id);if(existing.some(a=>a.teacher_id===t.id))return message('هذا الإسناد معتمد بالفعل.');
 if(existing.length&&!confirm('سيستبدل المعلم الأساسي الحالي دون تغيير سجلات الطلاب. متابعة؟'))return;
 await save(f,sdk().rpc('assign_circle_teacher_guarded',{p_circle_id:c.id,p_teacher_id:t.id,p_replace:existing.length>0}),'تم اعتماد إسناد الحلقة.');}catch(x){message(errorMessage(x),true)}};
 b.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function overlapDays(a,b){
 const days=id=>{const r=data.rules.find(x=>x.circle_id===id);return Array.isArray(r?.weekdays)?r.weekdays.map(Number):[0,1,2,3,4]};
 return days(a).some(d=>days(b).includes(d));
}
async function unassign(id,teacherId){
 const c=circle(id),t=teacher(teacherId);if(!c||!t)return;
 if(!confirm('إلغاء إسناد «'+t.full_name+'» من «'+c.name+'»؟ لن تُمس سجلات الطلاب أو نتائجهم، ولكن لن يظهر معلم جديد حتى إعادة الإسناد.'))return;
 try{const q=sdk().from('circle_teachers').update({active:false,updated_at:new Date().toISOString()}).eq('circle_id',id).eq('teacher_id',teacherId).eq('active',true).select('circle_id');const r=await check(q);if(!r?.length)throw Error('لم يتغير الإسناد؛ تحقق من صلاحياتك.');dirty=true;await refresh();show();message('أُلغي الإسناد الفعلي دون حذف سجلات الطلاب.');}catch(x){message(errorMessage(x),true)}
}
async function save(form,query,ok){
 const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{const r=await check(query);if(!r||r.ok===false)throw Error('لم تؤكد قاعدة البيانات العملية.');dirty=true;await refresh();show();message(ok)}finally{button.disabled=false}
}
async function open(selected){
 if(!(await isManager()))return;
 if(dialog?.open){tab=selected;show();return}
 css();tab=selected;dirty=false;dialog=document.createElement('dialog');dialog.id=ID;
 dialog.innerHTML='<header class="sr-header"><strong>إدارة المعلمين والحلقات والإسناد</strong><button type="button" data-close>إغلاق</button></header><div class="sr-content">جارٍ تحميل البيانات...</div>';
 document.body.appendChild(dialog);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();dialog=null;if(dirty&&confirm('تم حفظ التعديلات. هل تريد تحديث صفحات المنصة لإظهارها فورًا؟'))location.reload()},{once:true});
 dialog.showModal();
 try{await refresh();if(dialog?.open)show()}catch(e){if(dialog?.open)dialog.querySelector('.sr-content').textContent=errorMessage(e)}
}
async function scan(){
 if(!document.querySelector('.sl-live'))return;
 if(!(await isManager()))return;
 document.querySelectorAll('dialog.sl-dialog').forEach(d=>{
  if(d.hasAttribute('data-registry-tools'))return;
  const title=d.querySelector('header h2')?.textContent?.trim()||'';
  let target='';
  if(title.includes('المعلمون وإسناد الحلقات'))target='teachers';
  else if(title.includes('الحلقات وإسناد الطلاب'))target='circles';
  else if(title.includes('إسناد أكثر من حلقة للمعلم'))target='assign';
  if(!target)return;
  d.setAttribute('data-registry-tools','1');
  const btn=document.createElement('button');btn.type='button';btn.className='button button-primary';btn.textContent='تحرير '+({teachers:'المعلمين',circles:'الحلقات',assign:'الإسناد'}[target]);btn.onclick=()=>open(target);
  (d.querySelector('header')||d).appendChild(btn);
 });
}
window.addEventListener('load',()=>{setTimeout(scan,600);setInterval(scan,1600)});
})();