/* Sanabil v13 enhancements: attendance periods, Google Maps picker, backups, guided exam syllabus. */
(()=>{'use strict';
const Q=s=>document.querySelector(s), QA=s=>[...document.querySelectorAll(s)], sb=()=>window.supabaseClient;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action)=>'<button type="button" class="button button-soft" data-v13-action="'+action+'">'+esc(label)+'</button>';
const opt=(value,label,selected)=>'<option value="'+esc(value)+'" '+(String(value)===String(selected)?'selected':'')+'>'+esc(label)+'</option>';
const result=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data};
const rpc=async(name,args)=>result(sb().rpc(name,args));
const invoke=async(body)=>{const r=await sb().functions.invoke('sanabil-attendance',{body});if(r.error){let t=r.error.message;try{const j=await r.error.context?.json?.();t=j?.error||j?.message||t}catch{}throw Error(t)}if(r.data?.error)throw Error(r.data.error);return r.data};
const message=(text,bad=false)=>{const root=Q('.sl-live');if(!root)return;let p=root.querySelector('.sl-v13-message');if(!p){p=document.createElement('p');p.className='sl-message sl-v13-message';root.prepend(p)}p.textContent=text;p.style.color=bad?'#982431':'#006b55'};
const modal=title=>{const d=document.createElement('dialog');d.className='sl-dialog';d.innerHTML='<header><h2>'+esc(title)+'</h2><button type="button" class="button button-soft" data-close>إغلاق</button></header><div class="sl-v13-body"></div>';document.body.appendChild(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d.querySelector('.sl-v13-body')};
// Coalesce concurrent access reads; do not reuse a completed result after permissions change.
let accessPending=null;
const access=()=>{
 // Reuse the existing session-aware, short-lived access guard from the core application.
 if(typeof window.SanabilLive?.readAccess==='function')return window.SanabilLive.readAccess();
 if(accessPending)return accessPending;
 const pending=rpc('my_access',{}).finally(()=>{if(accessPending===pending)accessPending=null});
 accessPending=pending;return pending;
};
const weekdays=(selected,prefix)=>{selected=(selected||[0,1,2,3,4]).map(Number);return '<fieldset><legend>أيام الدوام</legend><div class="sl-checks">'+[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']].map(x=>'<label><input type="checkbox" name="'+prefix+x[0]+'" '+(selected.includes(Number(x[0]))?'checked':'')+'> '+x[1]+'</label>').join('')+'</div></fieldset>'};
const checkedDays=(form,prefix)=>[0,1,2,3,4,5,6].filter(i=>form.elements[prefix+i]?.checked);
const prayerOptions=(selected)=>[['Fajr','الفجر'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']].map(x=>opt(x[0],x[1],selected)).join('');
const defaultsForPeriod=p=>p.includes('الفجر')?{start:'Fajr',end:'Dhuhr',duration:90}:p.includes('الظهر')?{start:'Dhuhr',end:'Asr',duration:0}:p.includes('العصر')?{start:'Asr',end:'Maghrib',duration:0}:p.includes('المغرب')?{start:'Maghrib',end:'Isha',duration:0}:p.includes('العشاء')?{start:'Isha',end:'Isha',duration:90}:{start:'Asr',end:'Maghrib',duration:120};

async function circleContext(){
 const root=Q('.sl-live'),id=root?.querySelector('[name="circle"]')?.value;if(!id)throw Error('اختر الحلقة أولًا.');
 const c=await result(sb().from('circles').select('*').eq('id',id).single());
 if(!c.mosque_id)throw Error('الحلقة غير مرتبطة بمسجد.');
 const m=await result(sb().from('mosques').select('*').eq('id',c.mosque_id).single());
 return {c,m};
}

/* Reusable scoped selection: no global checkbox may select outside this complex. */
const circleSelectorHtml=(circles,currentId,caption='الحلقات المستهدفة')=>
 '<fieldset class="sl-v13-circle-picker"><legend>'+esc(caption)+'</legend>'+
 '<p class="sl-help">حدّد حلقات المجمع التي سيُطبّق عليها الإعداد نفسه. لن تتأثر الحلقات غير المحددة.</p>'+
 '<div class="sl-toolbar"><button type="button" class="button button-soft" data-circle-all>تحديد جميع الحلقات</button>'+
 '<button type="button" class="button button-soft" data-circle-none>إلغاء التحديد</button>'+
 '<span role="status" data-circle-count></span></div>'+
 '<div class="sl-v13-circle-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;max-height:225px;overflow:auto;padding:8px">'+
 circles.map(c=>'<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" data-circle-choice="'+esc(c.id)+'"'+(c.id===currentId?' checked':'')+'> '+esc(c.name)+' <small>('+esc(c.session_period||'بدون فترة')+')</small></label>').join('')+
 '</div></fieldset>';
const bindCircleSelector=(root,allowed)=>{
 const allowedIds=new Set(allowed.map(c=>c.id)),boxes=[...root.querySelectorAll('[data-circle-choice]')];
 const refresh=()=>{const count=boxes.filter(x=>x.checked).length,el=root.querySelector('[data-circle-count]');if(el)el.textContent='المحدد: '+count+' من '+boxes.length};
 root.querySelector('[data-circle-all]')?.addEventListener('click',()=>{boxes.forEach(x=>x.checked=true);refresh()});
 root.querySelector('[data-circle-none]')?.addEventListener('click',()=>{boxes.forEach(x=>x.checked=false);refresh()});
 boxes.forEach(x=>x.addEventListener('change',refresh));refresh();
 return ()=>boxes.filter(x=>x.checked&&allowedIds.has(x.dataset.circleChoice)).map(x=>x.dataset.circleChoice);
};
const circlesInComplex=async c=>result(sb().from('circles')
 .select('id,name,org_id,complex_id,session_period,mosque_id,circle_type,assignment_note')
 .eq('org_id',c.org_id).eq('complex_id',c.complex_id).eq('active',true).order('name'));

async function openSessionRules(){
 try{
  const {c}=await circleContext();
  const [circles,stored]=await Promise.all([
   circlesInComplex(c),
   result(sb().from('circle_session_rules').select('*').eq('circle_id',c.id).maybeSingle())
  ]);
  const rule=stored||{weekdays:[0,1,2,3,4],allow_outside_hours:false,allow_previous_day_edit:false,previous_edit_days:1};
  const b=modal('ضوابط جلسة الحصيلة — إعداد جماعي');
  b.innerHTML='<form>'+circleSelectorHtml(circles,c.id)+
    '<div class="sl-v13-notice"><b>أوقات الجلسة موحدة</b><p>يحفظ التوقيت الموحد من 15:00 إلى 23:30 كما في إعدادات المنصة الحالية. يمكن اختيار الحلقات وتطبيق باقي الضوابط عليها دفعة واحدة.</p></div>'+
    '<div class="form-grid two"><label>عدد الأيام السابقة المسموح بتحريرها<input type="number" name="days" min="1" max="60" required value="'+esc(rule.previous_edit_days||1)+'"></label>'+
    '<label>السماح خارج الوقت الموحد<input type="checkbox" name="outside" '+(rule.allow_outside_hours?'checked':'')+'></label>'+
    '<label>السماح بتحرير يوم سابق<input type="checkbox" name="previous" '+(rule.allow_previous_day_edit?'checked':'')+'></label></div>'+
    weekdays(rule.weekdays,'sr')+
    '<p class="sl-help" data-bulk-preview role="status">سيتم تعديل الحلقات المحددة فقط.</p>'+
    '<button class="button button-primary" type="submit">تطبيق الضوابط على الحلقات المحددة</button></form>';
  const form=b.querySelector('form'),selected=bindCircleSelector(form,circles),save=form.querySelector('button[type="submit"]');
  form.onsubmit=async e=>{
   e.preventDefault();if(save.disabled)return;
   try{
    const ids=selected(),days=checkedDays(form,'sr'),num=Number(form.elements.days.value);
    if(!ids.length)throw Error('حدد حلقة واحدة على الأقل.');
    if(!days.length)throw Error('اختر يوم دوام واحدًا على الأقل.');
    if(!Number.isInteger(num)||num<1||num>60)throw Error('عدد الأيام السابقة من 1 إلى 60.');
    if(!confirm('تطبيق الضوابط نفسها على '+ids.length+' حلقة؟ ستُستبدل ضوابط الجلسات الحالية للحلقات المحددة فقط.'))return;
    save.disabled=true;
    form.querySelector('[data-bulk-preview]').textContent='جارٍ حفظ ضوابط '+ids.length+' حلقة…';
    const resultBulk=await rpc('apply_circle_settings_bulk',{
      p_circle_ids:ids,p_kind:'session_rules',
      p_values:{weekdays:days,allow_outside_hours:form.elements.outside.checked,
       allow_previous_day_edit:form.elements.previous.checked,previous_edit_days:num}
    });
    if(!resultBulk?.ok||resultBulk.updated!==ids.length)throw Error('لم يؤكد الخادم حفظ جميع الحلقات.');
    try{const cache=JSON.parse(localStorage.getItem('sanabil_session_rules_v1')||'{}');ids.forEach(id=>delete cache[id]);localStorage.setItem('sanabil_session_rules_v1',JSON.stringify(cache))}catch{}
    b.closest('dialog').close();
    message('تم حفظ ضوابط جلسة الحصيلة في '+ids.length+' حلقة، ولم تُعدل الحلقات الأخرى.');
   }catch(err){form.querySelector('[data-bulk-preview]').textContent=err.message;alert(err.message)}
   finally{save.disabled=false}
  };
 }catch(e){message(e.message,true)}
}
/* Bulk editing of fields that really belong to the circle, not its mosque. */
async function openCircleBulkDetails(){
 try{
  // Attendance provides a selected circle; the registry/roster page does not.
  // In that case, resolve a scoped active circle without a mosque dependency.
  const a=await access(),chosen=Q('.sl-live [name="circle"]')?.value||'';
  const permitted=await result(sb().from('circles').select('id,name,org_id,complex_id,mosque_id,session_period,circle_type,assignment_note')
    .eq('org_id',a.org_id).eq('active',true).order('name'));
  const c=permitted.find(x=>x.id===chosen)||permitted[0];
  if(!c)throw Error('لا توجد حلقات نشطة ضمن صلاحيتك.');
  let circles=permitted.filter(x=>x.complex_id===c.complex_id);
  const b=modal('تعديل إعدادات عدة حلقات');
  const kinds=['حلقة حفظ','حلقات التلقين','حلقة إجازة','حلقة تصحيح التلاوة فقط'];
  const periods=['الفجر','الظهر','العصر','المغرب','العشاء','وقت مرن (عن بعد)'];
  b.innerHTML='<form>'+((new Set(permitted.map(x=>x.complex_id))).size>1?
    '<label>المجمع<select name="bulkComplex">'+[...new Set(permitted.map(x=>x.complex_id))].map(id=>opt(id,id===c.complex_id?(a.roles?.includes('admin')?'المجمع الحالي':permitted.find(x=>x.complex_id===id)?.name||id):permitted.find(x=>x.complex_id===id)?.name||id,c.complex_id)).join('')+'</select></label>':'')+
    '<div data-bulk-targets>'+circleSelectorHtml(circles,c.id)+'</div>'+
    '<p class="sl-help">اختر الحقول التي تريد تغييرها. الحقول غير المحددة تبقى كما هي. لا يتم نقل الطلاب ولا تغيير معلميهم أو حصائلهم. عند تغيير الفترة، تحقق من ضبط بصمتها بصورة مستقلة.</p>'+
    '<div class="form-grid two"><label><input type="checkbox" name="editType"> تغيير نوع الحلقة</label>'+
    '<label>النوع الجديد<select name="circleType">'+kinds.map(k=>opt(k,k,c.circle_type)).join('')+'</select></label>'+
    '<label><input type="checkbox" name="editPeriod"> تغيير الفترة</label>'+
    '<label>الفترة الجديدة<select name="sessionPeriod">'+periods.map(p=>opt(p,p,c.session_period)).join('')+'</select></label>'+
    '<label><input type="checkbox" name="editNote"> تغيير ملاحظة الإسناد</label>'+
    '<label>ملاحظة الإسناد<input type="text" name="assignmentNote" maxlength="1200" value="'+esc(c.assignment_note||'')+'"></label></div>'+
    '<p role="status" data-bulk-preview></p>'+
    '<button type="submit" class="button button-primary">حفظ الإعدادات في الحلقات المحددة</button></form>';
  const form=b.querySelector('form'),save=form.querySelector('[type="submit"]');
  let selected=bindCircleSelector(form,circles);
  const choice=form.elements.bulkComplex;
  if(choice)choice.onchange=()=>{
   circles=permitted.filter(x=>x.complex_id===choice.value);
   const host=form.querySelector('[data-bulk-targets]');
   host.innerHTML=circleSelectorHtml(circles,'');
   selected=bindCircleSelector(host,circles);
  };
  form.onsubmit=async e=>{
   e.preventDefault();if(save.disabled)return;
   try{
    const ids=selected(),values={};
    if(!ids.length)throw Error('حدد حلقة واحدة على الأقل.');
    if(form.elements.editType.checked)values.circle_type=form.elements.circleType.value;
    if(form.elements.editPeriod.checked)values.session_period=form.elements.sessionPeriod.value;
    if(form.elements.editNote.checked)values.assignment_note=form.elements.assignmentNote.value;
    if(!Object.keys(values).length)throw Error('اختر نوعًا أو فترة أو ملاحظة لتطبيقها.');
    if(!confirm('تطبيق '+Object.keys(values).length+' إعداد/إعدادات على '+ids.length+' حلقة؟'))return;
    save.disabled=true;form.querySelector('[data-bulk-preview]').textContent='جارٍ الحفظ…';
    const res=await rpc('apply_circle_settings_bulk',{p_circle_ids:ids,p_kind:'circle_details',p_values:values});
    if(!res?.ok||res.updated!==ids.length)throw Error('لم يؤكد الخادم حفظ جميع الحلقات.');
    b.closest('dialog').close();window.dispatchEvent(new Event('sanabil-circles-bulk-updated'));message('تم تحديث إعدادات '+ids.length+' حلقة.');Q('.sl-live [data-action="load"]')?.click();
   }catch(err){form.querySelector('[data-bulk-preview]').textContent=err.message;alert(err.message)}
   finally{save.disabled=false}
  };
 }catch(e){message(e.message,true)}
}
window.SanabilCircleBulkSettings={open:openCircleBulkDetails};
async function openFingerprint(complexMode){
 try{
  const {c,m}=await circleContext(),period=String(c.session_period||'غير محدد'),windows=Array.isArray(m.attendance_windows)?m.attendance_windows:[],cfg=windows.find(x=>x?.kind==='config'&&String(x.period||'')===period)||{},def=defaultsForPeriod(period);
  const [complexCircles,complexMosques]=complexMode?await Promise.all([circlesInComplex(c),result(sb().from('mosques').select('id,name,org_id,complex_id').eq('org_id',c.org_id).eq('complex_id',c.complex_id).eq('active',true))]):[[],[]];
  const b=modal((complexMode?'إعداد بصمة المجمع':'إعداد بصمة الفترة')+' — '+m.name);
  b.innerHTML='<form><p class="sl-help">لكل فترة نافذة بصمة مستقلة، ويمكن للمشرف تعديل فترة الحلقة من هنا.</p><div class="form-grid two"><label>فترة الحلقة<select name="circlePeriod">'+([['الفجر','الفجر'],['الظهر','الظهر'],['العصر','العصر'],['المغرب','المغرب'],['العشاء','العشاء'],['وقت مرن (عن بعد)','وقت مرن (عن بعد)']].map(x=>opt(x[0],x[1],period)).join(''))+'</select></label><label>خط العرض<input name="latitude" type="number" step="any" required value="'+esc(m.latitude)+'"></label><label>خط الطول<input name="longitude" type="number" step="any" required value="'+esc(m.longitude)+'"></label><label>النطاق بالمتر<input name="radius" type="number" min="20" max="500" required value="'+esc(m.radius_meters||100)+'"></label><label>بداية الدوام<select name="startPrayer">'+prayerOptions(cfg.startPrayer||def.start)+'</select></label><label>نهاية الدوام<select name="endPrayer">'+prayerOptions(cfg.endPrayer||def.end)+'</select></label><label>مدة الحلقة بالدقائق <small>(0 = حتى الصلاة التالية)</small><input name="duration" type="number" min="0" max="360" value="'+esc(cfg.durationMinutes??def.duration)+'"></label><label>سماح التأخير<input name="late" type="number" min="0" max="180" value="'+esc(cfg.lateAllowMinutes??15)+'"></label><label>الحضور المبكر<input name="early" type="number" min="0" max="180" value="'+esc(cfg.earlyArrivalMinutes??15)+'"></label><label>الانصراف المبكر<input name="leave" type="number" min="0" max="180" value="'+esc(cfg.earlyLeaveMinutes??15)+'"></label><label>اعتبار الغياب بعد البداية بـ<input name="absent" type="number" min="0" max="360" value="'+esc(cfg.absenceAfterMinutes??60)+'"></label><label>مهلة الانصراف بعد النهاية<input name="grace" type="number" min="0" max="360" value="'+esc(cfg.checkoutGraceMinutes??120)+'"></label></div>'+weekdays(cfg.weekdays,'fp')+'<label>رابط الموقع من خرائط Google<input name="mapUrl" type="url" placeholder="ألصق رابط مشاركة الموقع"></label><div class="sl-toolbar">'+btn('فتح الموقع في خرائط Google','open-map')+btn('اعتماد رابط خرائط Google','map')+btn('استخدام موقعي الحالي','gps')+'</div><p class="sl-help" data-map-status>الموقع المحفوظ: '+esc(m.latitude)+'، '+esc(m.longitude)+'</p><button type="submit" class="button button-primary">'+(complexMode?'تطبيق على المجمع':'حفظ إعداد الفترة')+'</button></form>';
  // Fingerprint settings are shared by mosque + period. Selecting a group
  // means selecting every active circle of that period in the given mosque.
  let selectedFingerprintGroups=()=>[];
  if(complexMode){
   const groupRows=complexMosques.map(mm=>({
      mosque:mm,circles:complexCircles.filter(x=>x.mosque_id===mm.id&&String(x.session_period||'')===period)
   })).filter(x=>x.circles.length);
   const panel=document.createElement('fieldset');panel.className='sl-v13-fingerprint-groups';
   panel.innerHTML='<legend>اختيار حلقات تطبيق ضوابط البصمة</legend>'+
     '<p class="sl-help">البصمة إعداد مشترك لجميع حلقات المسجد في الفترة نفسها، ولذلك تُحدد مجموعات الحلقات كاملة. لا يشمل الاختيار الفترات الأخرى أو المساجد غير المحددة، ولن تُنسخ إحداثيات الموقع.</p>'+
     '<div class="sl-toolbar"><button type="button" class="button button-soft" data-fp-all>تحديد جميع المجموعات</button>'+
     '<button type="button" class="button button-soft" data-fp-none>إلغاء التحديد</button><span data-fp-count role="status"></span></div>'+
     '<div style="max-height:235px;overflow:auto;display:grid;gap:8px">'+groupRows.map(g=>
       '<label style="display:flex;align-items:center;gap:10px"><input type="checkbox" data-fp-mosque="'+esc(g.mosque.id)+'"'+(g.mosque.id===m.id?' checked':'')+'>'+
       '<span><b>'+esc(g.mosque.name)+'</b> — '+g.circles.length+' حلقة: '+esc(g.circles.map(x=>x.name).join('، '))+'</span></label>'
     ).join('')+'</div>';
   const submitButton=b.querySelector('button[type="submit"]');
   submitButton.parentElement.insertBefore(panel,submitButton);
   const boxes=[...panel.querySelectorAll('[data-fp-mosque]')];
   const refresh=()=>{const n=boxes.filter(x=>x.checked).length;panel.querySelector('[data-fp-count]').textContent='المحدد: '+n+' من '+boxes.length+' مجموعة'};
   panel.querySelector('[data-fp-all]').onclick=()=>{boxes.forEach(x=>x.checked=true);refresh()};
   panel.querySelector('[data-fp-none]').onclick=()=>{boxes.forEach(x=>x.checked=false);refresh()};
   boxes.forEach(x=>x.addEventListener('change',refresh));
   selectedFingerprintGroups=()=>boxes.filter(x=>x.checked).map(x=>x.dataset.fpMosque);refresh();
   // Coordinates and circle-period changes must be edited only on their
   // dedicated single-mosque/single-circle screens.
   const controls=b.querySelector('form');
   for(const name of ['circlePeriod','latitude','longitude','radius']){
      const input=controls.elements[name];input.disabled=true;
   }
   for(const name of ['circlePeriod','latitude','longitude','radius','mapUrl'])controls.elements[name]?.closest('label')?.setAttribute('hidden','');
   for(const action of ['open-map','map','gps'])b.querySelector('[data-v13-action="'+action+'"]')?.setAttribute('hidden','');
   b.querySelector('[data-map-status]')?.setAttribute('hidden','');
   const info=document.createElement('p');info.className='sl-help';
   info.textContent='الفترة المستهدفة: '+period+'. لتغيير موقع المسجد أو فترة حلقة معينة استخدم إعدادات بصمة الفترة.';
   panel.after(info);
  }
  const form=b.querySelector('form'),setMap=(lat,lng,label)=>{form.latitude.value=Number(lat).toFixed(7);form.longitude.value=Number(lng).toFixed(7);b.querySelector('[data-map-status]').textContent=label+' — '+form.latitude.value+'، '+form.longitude.value};
  form.circlePeriod.onchange=()=>{const np=form.circlePeriod.value,pcfg=windows.find(x=>x?.kind==='config'&&String(x.period||'')===np),pd=defaultsForPeriod(np);form.startPrayer.value=pcfg?.startPrayer||pd.start;form.endPrayer.value=pcfg?.endPrayer||pd.end;form.duration.value=pcfg?.durationMinutes??pd.duration;form.late.value=pcfg?.lateAllowMinutes??15;form.early.value=pcfg?.earlyArrivalMinutes??15;form.leave.value=pcfg?.earlyLeaveMinutes??15;form.absent.value=pcfg?.absenceAfterMinutes??60;form.grace.value=pcfg?.checkoutGraceMinutes??120};
  b.querySelector('[data-v13-action="open-map"]').onclick=()=>{const lat=Number(form.latitude.value),lng=Number(form.longitude.value);if(!Number.isFinite(lat)||!Number.isFinite(lng))return alert('حدد الإحداثيات أولًا.');window.open('https://www.google.com/maps/@'+lat+','+lng+',18z','_blank','noopener,noreferrer')};
  b.querySelector('[data-v13-action="gps"]').onclick=()=>navigator.geolocation.getCurrentPosition(p=>setMap(p.coords.latitude,p.coords.longitude,'تم اعتماد موقع الجهاز'),e=>alert(e.code===1?'اسمح بالوصول للموقع أولًا.':'تعذر تحديد الموقع.'),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  b.querySelector('[data-v13-action="map"]').onclick=async()=>{try{if(!form.mapUrl.value.trim())throw Error('ألصق رابط مشاركة من خرائط Google.');const x=await invoke({action:'resolveMapUrl',url:form.mapUrl.value.trim()});setMap(x.latitude,x.longitude,'تم استخراج الموقع من خرائط Google')}catch(e){alert(e.message)}};
  form.onsubmit=async e=>{e.preventDefault();try{
    const work=checkedDays(form,'fp').map(String);if(!work.length)throw Error('اختر يوم دوام واحدًا على الأقل.');
    const targetPeriod=form.circlePeriod.value||period;
    if(!complexMode&&targetPeriod!==period)await result(sb().from('circles').update({session_period:targetPeriod,updated_at:new Date().toISOString()}).eq('id',c.id).select('id').single());
    const base={kind:'config',period:targetPeriod,weekdays:work,startPrayer:form.startPrayer.value,endPrayer:form.endPrayer.value,durationMinutes:Number(form.duration.value||0),lateAllowMinutes:Number(form.late.value||0),earlyArrivalMinutes:Number(form.early.value||0),earlyLeaveMinutes:Number(form.leave.value||0),absenceAfterMinutes:Number(form.absent.value||0),checkoutGraceMinutes:Number(form.grace.value||0)};
    const saveMosque=async(mm,periods,location)=>{const arr=Array.isArray(mm.attendance_windows)?mm.attendance_windows.filter(x=>x&&typeof x==='object'):[],keepCfg=arr.filter(x=>x.kind==='config'&&!periods.includes(String(x.period||''))),runtime=arr.filter(x=>x.kind!=='config'&&x.dateKey),patch={attendance_windows:[...keepCfg,...runtime,...periods.map(p=>Object.assign({},base,{period:p}))].slice(-100),updated_at:new Date().toISOString()};if(location){patch.latitude=Number(form.latitude.value);patch.longitude=Number(form.longitude.value);patch.radius_meters=Number(form.radius.value)}await result(sb().from('mosques').update(patch).eq('id',mm.id).select('id').single())};
    if(complexMode){
      const ids=selectedFingerprintGroups();
      if(!ids.length)throw Error('حدد مجموعة بصمة واحدة على الأقل.');
      const activeNames=complexMosques.filter(mm=>ids.includes(mm.id)).map(mm=>mm.name);
      if(!confirm('تطبيق إعدادات بصمة الفترة «'+period+'» على '+ids.length+' مسجد/مجموعة حلقات: '+activeNames.join('، ')+'؟'))return;
      const res=await rpc('apply_fingerprint_period_bulk',{
        p_mosque_ids:ids,p_period:period,p_config:{weekdays:work,
          startPrayer:form.startPrayer.value,endPrayer:form.endPrayer.value,
          durationMinutes:Number(form.duration.value||0),
          lateAllowMinutes:Number(form.late.value||0),
          earlyArrivalMinutes:Number(form.early.value||0),
          earlyLeaveMinutes:Number(form.leave.value||0),
          absenceAfterMinutes:Number(form.absent.value||0),
          checkoutGraceMinutes:Number(form.grace.value||0)}
      });
      if(!res?.ok||res.updated!==ids.length)throw Error('لم يكتمل حفظ جميع مجموعات البصمة.');
      const affected=complexCircles.filter(cc=>ids.includes(cc.mosque_id)&&String(cc.session_period||'')===period);
      message('تم حفظ إعدادات البصمة في '+ids.length+' مسجد/مجموعة، وتشمل '+affected.length+' حلقة. لم تتغير إعدادات المساجد الأخرى.');
    }else{
      await saveMosque(m,[targetPeriod],true);
      message('تم حفظ فترة الحلقة وموقع المسجد وإعداد بصمة فترة «'+targetPeriod+'».');
    }
    b.closest('dialog').close();Q('.sl-live [data-action="load"]')?.click();
  }catch(err){alert(err.message)}};
 }catch(e){message(e.message,true)}
}
async function openBackups(){
 try{
  const a=await access(),org=a.org_id;if(!org)throw Error('تعذر تحديد الجهة.');
  const b=modal('النسخ الاحتياطي');
  const render=async()=>{const settings=await result(sb().from('backup_settings').select('*').eq('org_id',org).maybeSingle())||{enabled:false,frequency:'weekly',backup_type:'operational',retention_count:10},list=await result(sb().from('platform_backups').select('id,backup_type,trigger_type,created_at').eq('org_id',org).order('created_at',{ascending:false}).limit(15));
   b.innerHTML='<form data-backup-settings><div class="form-grid two"><label>النسخ التلقائي<input type="checkbox" name="enabled" '+(settings.enabled?'checked':'')+'></label><label>التكرار<select name="frequency">'+opt('daily','يومي',settings.frequency)+opt('weekly','أسبوعي',settings.frequency)+opt('monthly','شهري',settings.frequency)+'</select></label><label>نوع النسخة التلقائية<select name="type">'+opt('operational','تشغيلية',settings.backup_type)+opt('full','شاملة',settings.backup_type)+opt('settings','الإعدادات والبنية',settings.backup_type)+'</select></label><label>عدد النسخ المحتفظ بها<input type="number" name="retention" min="2" max="60" value="'+esc(settings.retention_count||10)+'"></label></div><button type="submit" class="button button-primary">حفظ إعدادات النسخ التلقائي</button></form><hr><div class="sl-toolbar"><select name="manualType">'+opt('operational','نسخة تشغيلية','operational')+opt('full','نسخة شاملة','')+opt('settings','الإعدادات والبنية','')+'</select>'+btn('إنشاء نسخة الآن','backup-now')+'</div><h3>آخر النسخ</h3><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المصدر</th><th>تنزيل</th></tr></thead><tbody>'+list.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString('ar-SA'))+'</td><td>'+esc(x.backup_type)+'</td><td>'+esc(x.trigger_type==='automatic'?'تلقائي':'يدوي')+'</td><td>'+btn('JSON','download-'+x.id)+'</td></tr>').join('')+'</tbody></table></div>';
   const form=b.querySelector('[data-backup-settings]');form.onsubmit=async e=>{e.preventDefault();try{await result(sb().from('backup_settings').upsert({org_id:org,enabled:form.enabled.checked,frequency:form.frequency.value,backup_type:form.type.value,retention_count:Number(form.retention.value),updated_at:new Date().toISOString()}).select('org_id').single());alert('تم حفظ إعدادات النسخ التلقائي.');await render()}catch(err){alert(err.message)}};
   b.querySelector('[data-v13-action="backup-now"]').onclick=async()=>{try{const type=b.querySelector('[name="manualType"]').value,r=await rpc('create_platform_backup',{p_type:type,p_trigger:'manual'});alert('تم إنشاء النسخة الاحتياطية.');await downloadBackup(r.id);await render()}catch(err){alert(err.message)}};
   for(const x of list){const bt=b.querySelector('[data-v13-action="download-'+x.id+'"]');if(bt)bt.onclick=()=>downloadBackup(x.id)}
  };
  const downloadBackup=async id=>{const row=await result(sb().from('platform_backups').select('payload,backup_type,created_at').eq('id',id).single()),blob=new Blob([JSON.stringify(row.payload,null,2)],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='sanabil-backup-'+row.backup_type+'-'+String(row.created_at).slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
  await render();
 }catch(e){message(e.message,true)}
}
let quranCache=null;
const quran=async()=>{if(!quranCache)quranCache=rpc('quran_surah_catalog',{}).catch(e=>{quranCache=null;throw e});return quranCache};
async function enhanceExamForm(form){
 if(form.dataset.v13Exam)return;
 const type=form.querySelector('[name="type"]'),syllabus=form.querySelector('[name="syllabus"]');
 if(!type||!syllabus)return;
 form.dataset.v13Exam='loading';
 const selectedMode=type.value;
 const kinds={activation:'اختبار تنشيطي',placement:'اختبار تحديد مستوى',juz:'اختبار الأجزاء',phased:'اختبار مرحلي'};
 type.innerHTML=Object.entries(kinds).map(([id,name])=>opt(id,name,kinds[selectedMode]?selectedMode:'activation')).join('');
 const host=document.createElement('div');host.className='sl-v13-syllabus';
 syllabus.closest('label').after(host);syllabus.closest('label').hidden=true;syllabus.required=false;syllabus.readOnly=true;
 let catalog;
 try{catalog=await quran();if(!Array.isArray(catalog)||catalog.length!==114)throw Error('فهرس سور القرآن غير مكتمل.')}catch(e){delete form.dataset.v13Exam;host.textContent='تعذر تحميل السور والآيات. أعد فتح الترشيح وحاول مرة أخرى: '+(e.message||e);throw e}
 const surahs=new Map(catalog.map(s=>[Number(s.surahNo),s]));
 const surOptions=(selected)=>catalog.map(s=>opt(s.surahNo,s.surahNo+'. '+s.name,selected)).join('');
 const juzNames=['ألم','سيقول السفهاء','تلك الرسل','لن تنالوا','والمحصنات','لا يحب الله','وإذا سمعوا','ولو أننا','قال الملأ','واعلموا','يعتذرون','وما من دابة','وما أبرئ نفسي','ربما','سبحان الذي','قال ألم أقل لك','اقترب للناس','قد أفلح','وقال الذين لا يرجون','أمن خلق','اتل ما أوحي','ومن يقنت','وما لي','فمن أظلم','إليه يرد','حم','قال فما خطبكم','قد سمع','تبارك الذي','النبأ (عم)'];
 const juzOptions=()=>juzNames.map((name,i)=>opt(i+1,'الجزء '+(i+1)+' — '+name,1)).join('');
 let juzMap=null,juzPending=null;
 const loadJuz=async()=>{
  if(juzMap)return juzMap;
  if(!juzPending)juzPending=rpc('quran_juz_boundaries',{}).then(rows=>{
   if(!Array.isArray(rows)||rows.length!==30)throw Error('فهرس الأجزاء غير مكتمل.');
   juzMap=new Map(rows.map(x=>[Number(x.juzNo),x]));return juzMap;
  }).catch(e=>{juzPending=null;throw e});
  return juzPending;
 };
 const setAyahs=(sName,aName)=>{
  const s=host.querySelector('[name="'+sName+'"]'),a=host.querySelector('[name="'+aName+'"]');
  const max=Number(surahs.get(Number(s.value))?.ayahCount||0);
  if(!max)throw Error('السورة المختارة غير موجودة.');
  a.innerHTML=Array.from({length:max},(_,i)=>opt(i+1,i+1,1)).join('');
 };
 const range=()=>{
  const fromSurahNo=Number(host.querySelector('[name="fromSurah"]')?.value);
  const fromAyahNo=Number(host.querySelector('[name="fromAyah"]')?.value);
  const toSurahNo=Number(host.querySelector('[name="toSurah"]')?.value);
  const toAyahNo=Number(host.querySelector('[name="toAyah"]')?.value);
  if(!surahs.has(fromSurahNo)||!surahs.has(toSurahNo)||
    fromAyahNo<1||toAyahNo<1||
    fromAyahNo>Number(surahs.get(fromSurahNo).ayahCount)||
    toAyahNo>Number(surahs.get(toSurahNo).ayahCount))
    throw Error('حدد سورة وآية صحيحتين للبداية والنهاية.');
  if(fromSurahNo>toSurahNo||(fromSurahNo===toSurahNo&&fromAyahNo>toAyahNo))
    throw Error('آية البداية يجب أن تسبق آية النهاية في ترتيب المصحف.');
  return{fromSurahNo,fromAyahNo,toSurahNo,toAyahNo};
 };
 const getSyllabus=()=>{
  const mode=type.value;
  if(!kinds[mode])throw Error('حدد نوع الاختبار.');
  const d={mode,examType:mode};
  if(mode==='activation'||mode==='placement'){
   Object.assign(d,range());
   d.label=kinds[mode]+': من سورة '+surahs.get(d.fromSurahNo).name+' آية '+d.fromAyahNo+
     ' إلى سورة '+surahs.get(d.toSurahNo).name+' آية '+d.toAyahNo;
  }else{
   if(!juzMap||juzMap.size!==30)throw Error('لم يكتمل تحميل حدود أجزاء القرآن.');
   const count=mode==='phased'?Number(host.querySelector('[name="branch"]')?.value):1;
   if(mode==='phased'&&![5,10,15,20,30].includes(count))throw Error('حدد الفرع المرحلي.');
   const direction=(mode==='phased'||mode==='juz')?host.querySelector('[name="examDirection"]:checked')?.value:'from_fatiha';
   if(!['from_fatiha','from_nas'].includes(direction))throw Error('حدد اتجاه الاختبار.');
   const part=mode==='juz'?Number(host.querySelector('[name="juz"]')?.value):null;
   if(mode==='juz'&&(!Number.isInteger(part)||part<1||part>30))throw Error('اختر الجزء المطلوب.');
   const fromJuz=mode==='juz'?part:(direction==='from_fatiha'?1:31-count);
   const toJuz=mode==='juz'?part:(direction==='from_fatiha'?count:30);
   const a=juzMap.get(fromJuz),b=juzMap.get(toJuz);
   if(!a||!b)throw Error('حدود الجزء غير موجودة.');
   Object.assign(d,{fromJuz,toJuz,fromSurahNo:Number(a.fromSurahNo),fromAyahNo:Number(a.fromAyahNo),
    toSurahNo:Number(b.toSurahNo),toAyahNo:Number(b.toAyahNo),direction});
   if(mode==='juz'){d.juzNo=part;d.label='اختبار الأجزاء — الجزء '+part+' ('+juzNames[part-1]+') — '+(direction==='from_nas'?'نحو الفاتحة':'نحو الناس');}
   else{
    d.partCount=count;d.branch=({5:5,10:4,15:3,20:2,30:1})[count];
    d.label='اختبار مرحلي — الفرع '+({5:'الخامس',10:'الرابع',15:'الثالث',20:'الثاني',30:'الأول'})[count]+
     ' — '+count+' جزءًا — '+(direction==='from_fatiha'?'من الفاتحة':'من الناس');
   }
  }
  return d;
 };
 form.__v13GetSyllabus=()=>{const d=getSyllabus();syllabus.value=d.label;return d};
 const preview=()=>{
  const el=host.querySelector('[data-exam-summary]');
  try{const d=getSyllabus();syllabus.value=d.label;
   if(el)el.textContent=d.label+' · '+surahs.get(d.fromSurahNo)?.name+' ('+d.fromAyahNo+') إلى '+surahs.get(d.toSurahNo)?.name+' ('+d.toAyahNo+')';
  }catch(e){syllabus.value='';if(el)el.textContent=e.message}
 };
 const render=async()=>{
  const mode=type.value;
  if(mode==='activation'||mode==='placement'){
   host.innerHTML='<div class="form-grid two">'+
    '<label>سورة البداية<select name="fromSurah">'+surOptions(1)+'</select></label>'+
    '<label>آية البداية<select name="fromAyah"></select></label>'+
    '<label>سورة النهاية<select name="toSurah">'+surOptions(1)+'</select></label>'+
    '<label>آية النهاية<select name="toAyah"></select></label>'+
    '</div><p class="sl-help" role="status" data-exam-summary></p>';
   setAyahs('fromSurah','fromAyah');setAyahs('toSurah','toAyah');
  }else if(mode==='juz'){
   host.innerHTML='<label>الجزء المراد الاختبار فيه<select name="juz">'+juzOptions()+
    '</select></label><fieldset><legend>اتجاه توزيع الأسئلة</legend>'+
    '<label><input type="radio" name="examDirection" value="from_fatiha" checked> من الفاتحة نحو الناس</label>'+
    '<label><input type="radio" name="examDirection" value="from_nas"> من الناس نحو الفاتحة</label>'+
    '</fieldset><p class="sl-help" role="status" data-exam-summary>جارٍ قراءة حدود الجزء…</p>';
  }else{
   host.innerHTML='<label>فرع الاختبار المرحلي<select name="branch">'+
    [[5,'الخامس — خمسة أجزاء'],[10,'الرابع — عشرة أجزاء'],[15,'الثالث — خمسة عشر جزءًا'],[20,'الثاني — عشرون جزءًا'],[30,'الأول — ثلاثون جزءًا']].map(x=>opt(x[0],x[1],5)).join('')+'</select></label>'+
    '<fieldset><legend>اتجاه الاختبار</legend>'+
    '<label><input type="radio" name="examDirection" value="from_fatiha" checked> من الفاتحة</label>'+
    '<label><input type="radio" name="examDirection" value="from_nas"> من الناس</label>'+
    '</fieldset><p class="sl-help" role="status" data-exam-summary>جارٍ قراءة حدود الأجزاء…</p>';
  }
  host.onchange=e=>{
   if(e.target.name==='fromSurah')setAyahs('fromSurah','fromAyah');
   if(e.target.name==='toSurah')setAyahs('toSurah','toAyah');
   preview();
  };
  if(mode==='juz'||mode==='phased'){
   try{await loadJuz()}catch(e){syllabus.value='';host.querySelector('[data-exam-summary]').textContent='فشل تحميل حدود الأجزاء: '+e.message;return}
  }
  preview();
 };
 type.addEventListener('change',()=>render().catch(e=>{syllabus.value='';console.warn(e)}));
 form.addEventListener('reset',()=>setTimeout(()=>render().catch(()=>{}),0));
 try{await render();form.dataset.v13Exam='1'}catch(e){delete form.dataset.v13Exam;host.textContent='تعذر تهيئة المقرر: '+(e.message||e);throw e}
}
window.SanabilExamEnhanceForm=enhanceExamForm;
function enhance(){
 const root=Q('.sl-live');if(!root)return;
 const fp=root.querySelector('[data-action="fingerprint-settings"]');
 if(fp&&!fp.dataset.v13){const clone=fp.cloneNode(true);clone.dataset.v13='1';clone.textContent='إعدادات بصمة الفترة';fp.replaceWith(clone);clone.onclick=()=>openFingerprint(false);const s=document.createElement('button');s.type='button';s.className='button button-soft';s.textContent='ضوابط جلسة الحصيلة';s.dataset.v13Session='1';s.onclick=openSessionRules;clone.after(s);const c=s.cloneNode(true);c.textContent='إعداد بصمة المجمع';c.onclick=()=>openFingerprint(true);s.after(c);const bulk=c.cloneNode(true);bulk.textContent='إعدادات حلقات متعددة';bulk.onclick=openCircleBulkDetails;c.after(bulk)}
 const users=root.querySelector('[data-action="users"]');if(users&&!root.querySelector('[data-v13-backup]')){const b=document.createElement('button');b.type='button';b.className='button button-soft';b.textContent='النسخ الاحتياطي';b.dataset.v13Backup='1';b.onclick=openBackups;users.parentElement.appendChild(b)}
 QA('.sl-live form').forEach(f=>{if(f.querySelector('[name="type"]')&&f.querySelector('[name="syllabus"]')&&f.closest('.sl-live')?.querySelector('.sl-requests'))enhanceExamForm(f).catch(()=>{})});
 const oq=(()=>{try{return JSON.parse(localStorage.getItem('sanabil_offline_outcomes_v1')||'[]')}catch{return[]}})();if(oq.length&&!root.querySelector('[data-v13-offline]')){const p=document.createElement('p');p.className='sl-message';p.dataset.v13Offline='1';p.textContent='يوجد '+oq.length+' حفظ محلي بانتظار المزامنة التلقائية عند عودة الاتصال.';root.prepend(p)}
}
const obs=new MutationObserver(()=>{clearTimeout(window.__sanabilV13t);window.__sanabilV13t=setTimeout(enhance,40)});obs.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('sanabil-live-ready',enhance);window.addEventListener('online',()=>setTimeout(enhance,500));setTimeout(enhance,300);
})();