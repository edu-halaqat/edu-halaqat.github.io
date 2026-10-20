/* Per-complex supervisor switch for daily Quran assignment edits; server is authoritative. */
(()=>{'use strict';
if(window.SanabilTeacherPlanPermissions)return;
const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const rpc=async(name,args)=>{const client=window.supabaseClient;if(!client)throw Error('جارٍ تهيئة الاتصال؛ حاول مجددًا.');const res=await client.rpc(name,args);if(res.error)throw Error(res.error.message);return res.data};
async function open(){
 const dialog=element('dialog',undefined,'sl-score-dialog sl-plan-access-dialog');dialog.dir='rtl';
 const heading=element('h2','صلاحية تعديل المقرر');
 const note=element('p','يُسمح لمعلم الحلقة بتعديل مقرر طلاب حلقته افتراضيًا. يمكنك تعطيل الإذن لهذا المجمع أو إعادة تفعيله في أي وقت، دون التأثير على المجمعات الأخرى أو الحصائل المعتمدة.','sl-score-explain');
 const choose=element('label',undefined,'sl-score-label'),select=element('select');select.setAttribute('aria-label','المجمع');choose.append(element('span','المجمع'),select);
 const line=element('label',undefined,'sl-score-label'),toggle=element('input');toggle.type='checkbox';toggle.style.cssText='width:22px;height:22px;accent-color:#125e4c;vertical-align:middle;margin-inline-end:8px';
 line.append(toggle,element('span','السماح للمعلمين بتعديل المقرر'));
 const hint=element('p','يُطبق القرار على الحفظ الجديد والمراجعتين الصغرى والكبرى. يتطلب التعديل إسناد المعلم إلى الحلقة، ولا يُغير النتائج المحفوظة.','sl-score-explain');
 const status=element('p','', 'sl-score-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const footer=element('div',undefined,'sl-score-footer'),save=element('button','حفظ الصلاحية','button button-primary'),close=element('button','إغلاق','button button-soft');save.type='button';close.type='button';footer.append(save,close);
 dialog.append(heading,note,choose,line,hint,status,footer);document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 close.addEventListener('click',()=>dialog.close());if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
 let last=null;const show=async()=>{
   toggle.disabled=true;save.disabled=true;status.textContent='جارٍ قراءة صلاحية المجمع…';
   try{
     const data=await rpc('get_complex_teacher_plan_permission',{p_complex_id:select.value});
     if(!data?.canManage)throw Error('تعديل هذه الصلاحية مخصص لمشرف المجمع والإدارة.');
     toggle.checked=data.allowTeacherEdit===true;last=toggle.checked;
     status.textContent=last?'الافتراضي الحالي: مسموح للمعلمين.':'سياسة المجمع الحالية: تعديل المقرر غير مسموح للمعلمين.';
     toggle.disabled=false;save.disabled=false;
   }catch(error){last=null;status.textContent=error?.message||'تعذر قراءة الصلاحية.'}
 };
 select.addEventListener('change',show);
 save.addEventListener('click',async()=>{
   if(save.disabled||last===null)return;
   const enabled=toggle.checked;
   if(!enabled&&last!==enabled&&!window.confirm('إيقاف تعديل المقرر لجميع معلمي هذا المجمع؟ تبقى الحصائل المحفوظة كما هي.'))return;
   save.disabled=true;toggle.disabled=true;select.disabled=true;status.textContent='جارٍ حفظ سياسة المجمع…';
   try{
     await rpc('set_complex_teacher_plan_permission',{p_complex_id:select.value,p_enabled:enabled});
     const check=await rpc('get_complex_teacher_plan_permission',{p_complex_id:select.value});
     if(check?.allowTeacherEdit!==enabled)throw Error('لم تتطابق السياسة المحفوظة مع الاختيار؛ تحقق من حالة المجمع.');
     toggle.checked=enabled;last=enabled;status.textContent=enabled?'تم السماح للمعلمين بتعديل مقررات طلاب حلقاتهم.':'تم إيقاف تعديل المقررات لمعلمي هذا المجمع.';
   }catch(error){toggle.checked=last;status.textContent=error?.message||'تعذر حفظ الصلاحية.'}
   finally{save.disabled=false;toggle.disabled=false;select.disabled=false}
 });
 try{
   const client=window.supabaseClient;if(!client)throw Error('الاتصال بالمنصة غير جاهز.');
   const res=await client.from('complexes').select('id,name').eq('active',true).order('name');
   if(res.error)throw Error(res.error.message);
   if(!res.data?.length)throw Error('لا توجد مجمعات ضمن صلاحيتك.');
   for(const c of res.data){const opt=element('option',c.name);opt.value=c.id;select.append(opt)}
   await show();
 }catch(error){status.textContent=error?.message||'تعذر تحميل المجمعات.';save.disabled=true;toggle.disabled=true}
}
window.SanabilTeacherPlanPermissions={open};
})();