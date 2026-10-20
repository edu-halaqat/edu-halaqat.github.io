/* Per-complex teacher grading and points policy; only supervisor/manager/admin may save. */
(()=>{'use strict';if(window.SanabilScoreConfig)return;
 const el=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e};
 const scoreName={memorization:'الحفظ الجديد',recentReview:'جنب الدرس',major:'المراجعة الكبرى'};
 const scoreGrade=['ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع'];
 const attendanceName={present:'حاضر',late:'متأخر',excused:'مستأذن',absent:'غائب'};
 const input=(label,value,min=0,max=50)=>{
  const node=el('label','sl-score-label'),text=el('span','',label),field=el('input');
  field.type='number';field.min=String(min);field.max=String(max);field.step='1';field.value=String(value??0);
  node.append(text,field);return{node,field};
 };
 const dateField=(label,value)=>{
  const node=el('label','sl-score-label'),text=el('span','',label),field=el('input');field.type='date';field.value=value||'';
  node.append(text,field);return{node,field};
 };
 const allIntsValid=(x)=>Number.isInteger(Number(x))&&Number(x)>=0&&Number(x)<=50;
 const list=()=>window.supabaseClient.from('complexes').select('id,name').eq('active',true).order('name');
 const rpc=(fn,args)=>window.supabaseClient.rpc(fn,args);
 async function policyForDate(complexId,date){
  if(!complexId)return null;
  const r=await rpc('snabil_get_score_policy_for_date',{p_complex_id:complexId,p_date:date});
  if(r.error)throw Error(r.error.message);return r.data;
 }
 async function open(){
  const dialog=el('dialog','sl-score-dialog');
  dialog.dir='rtl';
  const heading=el('h2','', 'لائحة التقدير والنقاط في المجمع');
  const info=el('p','sl-score-explain','كل مجمع مستقل. تُطبق القواعد الجديدة من الغد، وتظل الحصائل والنقاط التاريخية وفق القواعد التي كانت سارية يومها.');
  const status=el('p','sl-score-status');status.setAttribute('role','status');
  const chooser=el('label','sl-score-label','المجمع');
  const select=el('select');chooser.append(select);
  const form=el('form','sl-score-form');form.noValidate=true;
  const close=el('button','button button-soft','إغلاق');close.type='button';
  close.onclick=()=>dialog.close();
  const footer=el('div','sl-score-footer'),save=el('button','button button-primary','اعتماد لائحة المجمع ابتداءً من الغد');
  save.type='submit';footer.append(save,close);
  form.append(footer);dialog.append(heading,info,chooser,status,form);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  let baseline=null,fields={};
  const show=async()=>{
   try{
    if(!select.value)return;
    status.textContent='جارٍ تحميل اللائحة…';save.disabled=true;
    const res=await rpc('snabil_get_score_policy',{p_complex_id:select.value});
    if(res.error)throw Error(res.error.message);
    baseline=JSON.parse(JSON.stringify(res.data.rules));
    fields={};form.replaceChildren();
    const block=(title,desc)=>{
     const fieldset=el('fieldset','sl-score-fieldset'),legend=el('legend','',title);fieldset.append(legend);
     if(desc)fieldset.append(el('p','sl-score-explain',desc));form.append(fieldset);return fieldset;
    };
    for(const key of ['memorization','recentReview']){
     const group=block(scoreName[key],'صفر أخطاء وصفر شكوك في اللائحة الافتراضية. حدود «جيد جدًا» اختيارية للمجمع.');
     for(const [name,label] of [['perfect_errors','أقصى أخطاء لممتاز'],['perfect_doubts','أقصى شكوك لممتاز'],
      ['very_good_errors','أقصى أخطاء لجيد جدًا'],['very_good_doubts','أقصى شكوك لجيد جدًا']]){
      const field=input(label,baseline[key][name],0,20);group.append(field.node);fields[key+'.'+name]=field.field;
     }
    }
    const major=block('المراجعة الكبرى','كل خطأ يعادل العدد الذي يحدده المشرف من الشكوك.');
    for(const [name,label] of [['error_weight','معادل الخطأ بالشكوك'],['perfect_max','مجموع الخصم الأقصى لممتاز'],
      ['very_good_max','مجموع الخصم الأقصى لجيد جدًا'],['good_max','مجموع الخصم الأقصى لجيد']]){
     const field=input(label,baseline.major[name],name==='error_weight'?1:0,40);
     major.append(field.node);fields['major.'+name]=field.field;
    }
    for(const track of ['memorization','recentReview','major']){
     const group=block('نقاط '+scoreName[track],'تُحسب من التقدير المعتمد دون تدخل المعلم.');
     for(const grade of scoreGrade){const key='points.'+track+'.'+grade,field=input(grade,baseline.points[track][grade],0,50);
      fields[key]=field.field;group.append(field.node)}
    }
    const attendance=block('نقاط الحضور','حاضر 5، متأخر ومستأذن 3، غائب 0 في اللائحة الافتراضية.');
    for(const [key,label] of Object.entries(attendanceName)){
     const f=input(label,baseline.attendance[key],0,25);attendance.append(f.node);fields['attendance.'+key]=f.field;
    }
    block('دورات الترتيب','تُدار بداية الدورة ونهايتها وموعد التصفير من لوحة الشرف ← إدارة دورات النقاط.');
    form.append(footer);status.textContent=res.data.effectiveFrom?
     'اللائحة الأحدث مسجلة من تاريخ '+res.data.effectiveFrom+'، ويمكن تعديل اللائحة التالية دون تغيير الأيام الماضية.':
     'اللائحة الافتراضية الحالية؛ أي تعديل سيبدأ من الغد.';
   }catch(error){status.textContent=error?.message||'تعذر تحميل اللائحة.'}
   finally{save.disabled=false}
  };
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(save.disabled||!baseline||!select.value)return;
   const updated=JSON.parse(JSON.stringify(baseline));
   for(const [path,node] of Object.entries(fields)){
    const parts=path.split('.');let target=updated;
    for(let i=0;i<parts.length-1;i++)target=target[parts[i]];
    target[parts[parts.length-1]]=parts[0]==='period'?(node.value||null):Number(node.value);
    if(parts[0]!=='period'&&!allIntsValid(node.value)){status.textContent='تحقق من الأعداد؛ كلها يجب أن تكون أعدادًا صحيحة غير سالبة.';return}
   }
   for(const key of ['memorization','recentReview']){
    const g=updated[key];
    if(g.perfect_errors>g.very_good_errors||g.perfect_doubts>g.very_good_doubts){
     status.textContent='حدود ممتاز يجب ألا تتجاوز حدود جيد جدًا في '+scoreName[key];return;
    }
   }
   const m=updated.major;
   if(m.perfect_max>m.very_good_max||m.very_good_max>m.good_max){
    status.textContent='ترتيب حدود المراجعة الكبرى غير صحيح.';return;
   }
   if(Boolean(updated.period.start)!==Boolean(updated.period.end)){
    status.textContent='حدد بداية الفترة ونهايتها معًا، أو اتركهما فارغين.';return;
   }
   if(!window.confirm('اعتماد اللائحة الجديدة لهذا المجمع من الغد؟ لن تُعدّل نتائج الأيام الماضية.'))return;
   save.disabled=true;status.textContent='جارٍ اعتماد لائحة المجمع…';
   try{
    const res=await rpc('snabil_set_score_policy',{p_complex_id:select.value,p_rules:updated});
    if(res.error)throw Error(res.error.message);
    status.textContent='تم حفظ اللائحة للمجمع. تسري من '+res.data.effectiveFrom+' وتبقى درجات الأيام السابقة دون تعديل.';
    baseline=updated;
   }catch(error){status.textContent=error?.message||'تعذر اعتماد اللائحة.'}
   finally{save.disabled=false}
  });
  try{
   const res=await list();if(res.error)throw Error(res.error.message);
   if(!res.data?.length)throw Error('لا يوجد مجمع ضمن صلاحية حسابك.');
   res.data.forEach(c=>{const option=el('option','',c.name);option.value=c.id;select.append(option)});
   select.addEventListener('change',show);await show();
  }catch(error){status.textContent=error?.message||'تعذر تحميل المجمعات';save.disabled=true}
 }
 window.SanabilScoreConfig={open,policyForDate};
})();