/* Sanabil 1448: optional, guarded quick outcome editor. Existing RPCs and save verification remain authoritative. */
(()=>{'use strict';if(window.SanabilQuickOutcomes)return;
 const int=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
 const defaultRubric={
  memorization:{perfect_errors:0,perfect_doubts:0,very_good_errors:0,very_good_doubts:0},
  recentReview:{perfect_errors:0,perfect_doubts:0,very_good_errors:0,very_good_doubts:0},
  major:{error_weight:2,perfect_max:1,very_good_max:2,good_max:5}
 };
 const gradeFor=(kind,errors=0,doubts=0,policy=defaultRubric)=>{
  const e=int(errors),d=int(doubts),rules=policy||defaultRubric;
  if(kind==='memorization'||kind==='recentReview'){
   const p=rules[kind]||defaultRubric[kind];
   return e<=int(p.perfect_errors)&&d<=int(p.perfect_doubts)?'ممتاز':
    e<=int(p.very_good_errors)&&d<=int(p.very_good_doubts)?'جيد جدًا':'لم يحفظ';
  }
  const p=rules.major||defaultRubric.major;
  const weight=int(p.error_weight||2)*e+d;
  return weight<=int(p.perfect_max)?'ممتاز':weight<=int(p.very_good_max)?'جيد جدًا':
   weight<=int(p.good_max)?'جيد':'لم يحفظ';
 };
 const eligible=(student,kind)=>kind==='study'&&!!(student.memorization||student.recentReview||(student.reviews||[]).length);
 const el=(tag,klass,text)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(text!==undefined)n.textContent=text;return n};
 const button=(label,fn,klass='')=>{const n=el('button','sl-quick-btn '+klass,label);n.type='button';n.addEventListener('click',fn);return n};
 const trackList=(student)=>[
  ...(student.memorization?[{key:'memorization',name:'الحفظ الجديد'}]:[]),
  ...(student.recentReview?[{key:'recentReview',name:'جنب الدرس'}]:[]),
  ...(student.reviews||[]).map((r,i)=>({key:'review:'+r.planId,name:r.planName||'المراجعة الكبرى '+(i+1)}))
 ];
 function mount(ctx){
  const {box,form,students,states,readOnly,activeKind,needsDayAttendance,gradeValue,setGrade,
   metricFor,setMetric,persistDraft,syncCard,complexId,sessionDate}=ctx;
  let rubric=defaultRubric;
  if(!box?.isConnected||!form||!students?.length)return null;
  const old=box.querySelector('.sl-quick-outcomes');if(old)old.remove();
  const wrap=el('section','sl-quick-outcomes');
  wrap.dir='rtl';wrap.setAttribute('aria-label','الحصيلة السريعة');
  const heading=el('div','sl-quick-heading');
  const headingText=el('div','', 'الحصيلة السريعة');headingText.classList.add('sl-quick-heading-title');
  heading.append(headingText,el('small','', 'اختصار التقييم دون تغيير نظام الحفظ المعتمد'));
  const toolbar=el('div','sl-quick-toolbar');
  const toggle=button('عرض الحصيلة التفصيلية',()=>{
   const isQuick=box.classList.toggle('sl-quick-mode');
   toggle.textContent=isQuick?'عرض الحصيلة التفصيلية':'عرض الحصيلة السريعة';
   toggle.setAttribute('aria-expanded',String(isQuick));
  },'sl-quick-mode-toggle');
  toggle.setAttribute('aria-expanded','true');
  const bulk=button('✓ ممتاز لمن اكتمل تسميعهم',()=>{
   if(readOnly){inform('هذه الجلسة للعرض فقط.');return}
   const ids=students.map((s,i)=>i).filter(i=>checked.has(i));
   if(!ids.length){inform('حدد الطلاب الذين سمّعوا بالفعل قبل تطبيق تقدير ممتاز.');return}
   const allowed=ids.filter(i=>canEdit(i));
   if(allowed.length!==ids.length){inform('بعض الطلاب غير مؤهلين للتقييم؛ راجع الحضور ومقرر اليوم.');return}
   if(!window.confirm('أؤكد أنني سمّعت واجبات '+allowed.length+' طالبًا المحددين، وأنهم أتموها جميعًا بإتقان. هل أعتمد لهم ممتازًا في المسودة؟'))return;
   for(const i of allowed)applyExcellent(i,true);
   checked.clear();refreshAll();inform('تم تعبئة الممتاز للمسمّعين فقط. التغييرات مسودات حتى تؤكد المنصة حفظها.');
  },'sl-quick-bulk');
  const info=el('p','sl-quick-explain','التحديد لا يساوي الحضور: لا تُعتمد درجة ممتاز إلا بعد التسميع. الدرجة والعدادات قابلة للتعديل، والحفظ النهائي من زر حصيلة الحلقة.');
  const notice=el('p','sl-quick-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const list=el('div','sl-quick-list'),checked=new Set(),provisional=new Set(),rows=[];
  const inform=t=>{notice.textContent=t};
  const defaults=button('تهيئة ممتاز للحاضرين',()=>seedPresent(true),'sl-quick-defaults');
  toolbar.append(defaults,bulk);
  wrap.append(heading,toolbar,info,notice,list);form.parentNode.insertBefore(toggle,form);form.parentNode.insertBefore(wrap,form);
  box.classList.add('sl-quick-mode');
  const allowAtt=st=>['present','late'].includes(st.attendance);
  const canEdit=i=>!readOnly&&needsDayAttendance(activeKind(students[i].studentId))&&eligible(students[i],activeKind(students[i].studentId))&&allowAtt(states[i]);
  const hasPrior=(i)=>!!box.querySelector('[data-save-status="'+i+'"]')?.dataset.saved?.match(/saved/);
  const seedPresent=(message=false)=>{
   if(readOnly){if(message)inform('الجلسة للعرض فقط.');return 0}
   let count=0;
   for(let i=0;i<students.length;i++){
    if(!canEdit(i)||hasPrior(i))continue;
    const entries=trackList(students[i]);
    // No grading overwrite: draft/saved grades and detailed error counters always win.
    if(entries.some(t=>gradeValue(states[i],t.key)||(()=>{
     const m=metricFor(i,t.key);return int(m.errors)+int(m.doubts)+int(m.tajweed)>0
    })()))continue;
    for(const t of entries)setGrade(states[i],t.key,'ممتاز');
    provisional.add(i);store(i);count++;
   }
   if(message)inform(count?'تمت تعبئة '+count+' طالبًا بممتاز مبدئي. صحح الاستثناءات وأكد التسميع قبل الاعتماد.':'لا توجد حصائل جديدة مؤهلة للتعبئة؛ لم أستبدل نتائج محفوظة أو معدلة.');
   return count;
  };
  const store=i=>{syncCard(i,false);persistDraft(i);refresh(i)};
  const applyExcellent=(i,bulkMode=false)=>{
   if(!canEdit(i)){inform('يلزم حضور الطالب وتوفر مقرره اليوم قبل تقييمه.');return false}
   const entries=trackList(students[i]);
   const priorErrors=entries.some(t=>{const m=metricFor(i,t.key);return Number(m.errors||0)+Number(m.doubts||0)+Number(m.tajweed||0)>0});
   if(!bulkMode&&(hasPrior(i)||priorErrors)&&!window.confirm('سيستبدل «ممتاز» التقديرات والأعداد الحالية للواجبات المستحقة. هل تؤكد أنك سمّعت الطالب دون أخطاء أو شكوك؟'))return false;
   for(const t of entries){
    setMetric(i,t.key,'errors',0);setMetric(i,t.key,'doubts',0);setMetric(i,t.key,'tajweed',0);
    setGrade(states[i],t.key,'ممتاز');
   }
   provisional.delete(i);store(i);return true;
  };
  function refresh(i){
   const view=rows[i];if(!view)return;
   const s=students[i],st=states[i];
   const entries=trackList(s),kind=activeKind(s.studentId),allowed=canEdit(i);
   view.tick.disabled=!allowed;
   view.details.disabled=readOnly||!needsDayAttendance(kind);
   view.check.disabled=!allowed;
   if(!allowed){checked.delete(i);provisional.delete(i);view.check.checked=false}
   const chips=[];
   for(const t of entries){
    const m=metricFor(i,t.key),rating=gradeValue(st,t.key);
    const abbreviated=t.key==='memorization'?'الحفظ':t.key==='recentReview'?'جنب الدرس':t.name;
    chips.push(abbreviated+': '+(rating||'لم يقيّم')+(provisional.has(i)?' (مبدئي)':'')+((m.errors||m.doubts)?' · '+m.errors+'خ '+m.doubts+'ش':''));
   }
   view.tags.replaceChildren(...chips.map(c=>el('span','sl-quick-chip',c)));
   view.state.textContent=!needsDayAttendance(kind)?'لا يتطلب تسميعًا اليوم':!allowAtt(st)?(st.attendance==='absent'?'غائب':st.attendance==='excused'?'مستأذن':'بانتظار التحضير'):
    (box.querySelector('[data-save-status="'+i+'"]')?.textContent||'لم تُعتمد الحصيلة');
  }
  const refreshAll=()=>students.forEach((_,i)=>refresh(i));
  let dialog=null;
  function openDetails(i){
   if(readOnly){inform('هذه الجلسة للعرض فقط.');return}
   if(!canEdit(i)){inform('لا يمكن تقييم طالب غير حاضر أو بلا مقرر دراسي.');return}
   dialog?.close?.();dialog?.remove?.();
   const s=students[i],entries=trackList(s);if(!entries.length)return;
   dialog=el('dialog','sl-quick-sheet');dialog.dir='rtl';
   const header=el('div','sl-quick-sheet-header');
   header.append(el('div','sl-quick-sheet-title','تفاصيل التسميع — '+s.fullName),button('✕',()=>dialog.close(),'sl-quick-close'));
   const intro=el('p','sl-quick-explain','الخطأ = شكّان في المراجعة الكبرى. في الحفظ وجنب الدرس: الخطأ «لم يحفظ»، والشك أو الخطأ «لم يحفظ».');
   const tabs=el('div','sl-quick-sheet-tabs'),content=el('div','sl-quick-sheet-content');
   const footer=el('div','sl-quick-sheet-footer'),done=button('تم — العودة إلى الطلاب',()=>dialog.close(),'sl-quick-done');
   footer.append(done);dialog.append(header,intro,tabs,content,footer);document.body.append(dialog);
   let selected=entries[0].key,override=false;
   const render=()=>{
    tabs.replaceChildren(...entries.map(t=>button(t.name,()=>{
     selected=t.key;override=false;render()
    },t.key===selected?'is-active':'')));
    const t=entries.find(x=>x.key===selected);
    const m=metricFor(i,selected),rating=gradeValue(states[i],selected);
    content.replaceChildren();
    const score=selected.startsWith('review:')?2*int(m.errors)+int(m.doubts):null;
    content.append(el('h3','',t.name),el('p','sl-quick-metric-summary',score!==null?'وحدات الخصم: '+score:'يشترط صفر أخطاء وصفر شكوك للإتقان؛ أي خطأ أو شك = لم يحفظ'));
    for(const [field,label] of [['errors','الأخطاء'],['doubts','الشكوك'],['tajweed','ملاحظات التجويد']]){
     const holder=el('div','sl-quick-counter');
     const legend=el('strong','',label);
     const controls=el('div','sl-quick-counter-controls');
     const change=(value)=>{
      setMetric(i,selected,field,int(value));
      if(field!=='tajweed'){
       const a=metricFor(i,selected);
       setGrade(states[i],selected,gradeFor(selected,int(a.errors),int(a.doubts),rubric));
       override=false;
      }
      store(i);render();
     };
     const minus=button('−',()=>change(int(metricFor(i,selected)[field])-1));
     const input=el('input');input.type='number';input.min='0';input.max='100';input.value=String(int(m[field]));
     input.setAttribute('aria-label','عدد '+label+' في '+t.name);
     input.addEventListener('change',()=>change(input.value));
     const plus=button('+',()=>change(int(metricFor(i,selected)[field])+1));
     controls.append(minus,input,plus);holder.append(legend,controls);
     if(field!=='tajweed'){
      const presets=el('div','sl-quick-presets');
      for(const n of [0,1,2,3])presets.append(button(String(n),()=>change(n),int(m[field])===n?'is-active':''));
      holder.append(presets);
     }
     content.append(holder);
    }
    content.append(el('p','sl-quick-grade-title','التقدير المحسوب / قابل للتعديل يدويًا'));
    const grades=el('div','sl-quick-grades');
    const options=selected.startsWith('review:')?['ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع']:['ممتاز','جيد جدًا','لم يحفظ','لم يسمع'];
    for(const g of options)grades.append(button(g,()=>{
     setGrade(states[i],selected,g);override=true;store(i);render()
    },rating===g?'is-active':''));
    content.append(grades);
    if(override)content.append(el('small','sl-quick-explain','التقدير المحدد يدويًا؛ تعديل الأخطاء أو الشكوك سيعيد حسابه تلقائيًا.'));
    content.append(el('small','sl-quick-explain','التغيير محفوظ كمسودة محلية. يعتمد بعد نجاح حفظ الحصيلة والتحقق من الخادم.'));
   };
   render();dialog.addEventListener('close',()=>{dialog.remove();dialog=null;refresh(i)},{once:true});
   if(typeof dialog.showModal==='function')dialog.showModal();
   else dialog.setAttribute('open','');
  }
  for(let i=0;i<students.length;i++){
   const s=students[i];const row=el('article','sl-quick-row');
   const top=el('div','sl-quick-row-top'),name=el('strong','',s.fullName),state=el('small','sl-quick-row-state');
   top.append(name,state);
   const tags=el('div','sl-quick-tags');
   const actions=el('div','sl-quick-row-actions');
   const check=el('input');check.type='checkbox';check.className='sl-quick-select';check.setAttribute('aria-label','تحديد '+s.fullName+' للتسجيل الجماعي');
   check.addEventListener('change',()=>{if(check.checked)checked.add(i);else checked.delete(i)});
   const tick=button('✓ الكل ممتاز',()=>{if(applyExcellent(i))inform('سُجّل الممتاز في مسودة '+s.fullName+'، بعد تحقق المعلم من تسميعه.')},'sl-quick-perfect');
   const details=button('التفاصيل',()=>openDetails(i),'sl-quick-details');
   actions.append(check,tick,details);row.append(top,tags,actions);list.append(row);
   rows[i]={row,state,tags,check,tick,details};
   const saveLabel=box.querySelector('[data-save-status="'+i+'"]');
   if(saveLabel&&typeof MutationObserver==='function')new MutationObserver(()=>{if(row.isConnected)refresh(i)}).observe(saveLabel,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-saved']});
  }
  // The fast screen's provisional defaults require an explicit teacher
  // acknowledgement when the established form or individual-save action runs.
  const teacherConfirm=()=>{
   if(!provisional.size)return true;
   const n=provisional.size;
   if(!window.confirm('توجد '+n+' حصيلة ممتاز مبدئية للحاضرين. أؤكد أنني سمعت واجبات هؤلاء الطلاب بالفعل، وصححت جميع الحالات الاستثنائية قبل الحفظ.'))return false;
   provisional.clear();refreshAll();return true;
  };
  form.addEventListener('submit',event=>{
   if(!teacherConfirm()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  form.addEventListener('click',event=>{
   const action=event.target?.closest?.('button[data-action^="save-student-"]');
   if(!action)return;
   const index=Number(String(action.dataset.action||'').replace('save-student-',''));
   if(!provisional.has(index))return;
   if(!window.confirm('أؤكد أنني سمّعت هذا الطالب وأن تقديراته المبدئية صحيحة.')){
    event.preventDefault();event.stopImmediatePropagation();return;
   }
   provisional.delete(index);refresh(index);
  },true);
  refreshAll();
  if(complexId&&sessionDate&&window.SanabilScoreConfig?.policyForDate){
   window.SanabilScoreConfig.policyForDate(complexId,sessionDate).then(settings=>{
    if(settings&&box.isConnected){rubric=settings;inform('تسري على هذه الجلسة لائحة التقدير الخاصة بالمجمع.');}
   }).catch(err=>{inform('تعذر تحميل لائحة المجمع؛ لن أغير التقديرات القائمة. '+(err?.message||''));});
  }
  const entry={refresh,refreshAll,seed:seedPresent,gradeFor};
  box._sanabilQuick=entry;
  return entry;
 }
 window.SanabilQuickOutcomes={mount,gradeFor};
})();