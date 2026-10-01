/* Sanabil supervisory visits module */
(()=>{'use strict';
const ITEMS=[
{id:'t01',section:'تلاوة المعلم/ـة',skill:'إتمام الحركات',indicator:'يميّز النطق الصحيح للحركات والأحرف المدية، ويصوّب للدارسين عند القراءة.'},
{id:'t02',section:'تلاوة المعلم/ـة',skill:'أحكام الميم والنون الساكنتين والتنوين',indicator:'يتقن أحكام الميم والنون الساكنتين والتنوين.'},
{id:'t03',section:'تلاوة المعلم/ـة',skill:'أحكام المدود',indicator:'يتقن أزمنة المدود عند القراءة، ويعرّف أنواعها.'},
{id:'t04',section:'تلاوة المعلم/ـة',skill:'نطق همزة الوصل والقطع',indicator:'يفرّق عند النطق بين همزة الوصل والقطع، وينبّه الدارسين عليهما عند الابتداء والوصل.'},
{id:'t05',section:'تلاوة المعلم/ـة',skill:'الوقف والابتداء',indicator:'يميّز مواضع الوقف والابتداء، ومواضع عدم الوقف وعدم الابتداء عند القراءة.'},
{id:'t06',section:'إدارة الحلقة',skill:'التخطيط',indicator:'يلتزم بزمن التسميع، ويستوفي جميع الدارسين بالعدل.'},
{id:'t07',section:'إدارة الحلقة',skill:'مراجعة المكتسبات السابقة',indicator:'يقسّم وقت المراجعة بالتساوي بين الدارسين، وينتقي الأسلوب المناسب لمستوياتهم.'},
{id:'t08',section:'إدارة الحلقة',skill:'العرض',indicator:'يفعّل السجلات التعليمية.'},
{id:'t09',section:'إدارة الحلقة',skill:'العرض',indicator:'يفعّل القراءة الجماعية بالترديد مع الدارسين، ثم القراءة الفردية لطلاب التلقين.'},
{id:'t10',section:'إدارة الحلقة',skill:'العرض',indicator:'يصحح أخطاء الدارسين بطريقة إيجابية وفق آلية صحيحة، ويشركهم في تصحيح الخطأ.'},
{id:'t11',section:'إدارة الحلقة',skill:'العرض',indicator:'ينوّع أساليب التعزيز؛ كالثناء والدعاء ولوحات الشرف والهدايا العينية ونحوها.'},
{id:'t12',section:'إدارة الحلقة',skill:'العرض',indicator:'يرتّب جلوس الطلاب بصورة منظمة، ويحسن ضبط الحلقة.'},
{id:'t13',section:'إدارة الحلقة',skill:'الواجب',indicator:'يؤكد أهمية الاستماع إلى المقرئ ثلاث مرات على الأقل ـ أو بحسب حاجة الفئة ـ قبل الشروع في الحفظ.'},
{id:'t14',section:'إدارة الحلقة',skill:'السمات الشخصية',indicator:'يلتزم بسمت معلم القرآن، ويتقيّد بالمظهر اللائق.'},
{id:'t15',section:'إدارة الحلقة',skill:'السمات الشخصية',indicator:'يتعامل بخلق حسن مع الإدارة والزملاء والدارسين.'},
{id:'t16',section:'إدارة الحلقة',skill:'السمات الشخصية',indicator:'يتقبّل التوجيهات، وينفّذ التوصيات.'},
{id:'t17',section:'إدارة الحلقة',skill:'السمات الشخصية',indicator:'يقدّر المسؤولية ويؤدي واجباته المهنية.'},
{id:'t18',section:'إدارة الحلقة',skill:'جوانب التميز',indicator:'يعتني بالموهوبين، ويرشّح المتميزين للمشاركة في المسابقات الداخلية والخارجية.'},
{id:'t19',section:'إدارة الحلقة',skill:'نماذج مستوى الطلاب',indicator:'النموذج الأول: قياس مستوى حفظ طالب وتجويده بصورة منفردة.'},
{id:'t20',section:'إدارة الحلقة',skill:'نماذج مستوى الطلاب',indicator:'النموذج الثاني: قياس مستوى حفظ طالب وتجويده بصورة منفردة.'}
];
const SCALE=[['5','متميز — 5'],['4','متحقق — 4'],['3','مقبول — 3'],['2','جزئي — 2'],['1','ضعيف — 1'],['0','لم ينفذ — 0']];
const sb=()=>{if(!window.supabaseClient)throw Error('لم يكتمل الاتصال بقاعدة البيانات.');return window.supabaseClient};
const res=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data};
const rpc=(n,a)=>res(sb().rpc(n,a));
const access=()=>rpc('my_access',{});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arDate=x=>x?new Date(x).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}):'—';
const dayDate=x=>x?new Date(x).toLocaleDateString('ar-SA',{timeZone:'Asia/Riyadh',weekday:'long',year:'numeric',month:'long',day:'numeric'}):'—';
const btn=(t,a,cls='')=>'<button type="button" class="button button-soft '+cls+'" data-sv-action="'+esc(a)+'">'+esc(t)+'</button>';
const selectHtml=(name,rows,value='',empty='اختر')=>'<select name="'+esc(name)+'"><option value="">'+esc(empty)+'</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(String(x.id)===String(value)?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>';
const ratingSelect=(id,value='')=>'<select name="score_'+id+'" data-score-item="'+id+'"><option value="">—</option>'+SCALE.map(x=>'<option value="'+x[0]+'" '+(String(value)===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select>';
const modal=title=>{const d=document.createElement('dialog');d.className='sl-dialog sv-dialog';d.innerHTML='<header><h2>'+esc(title)+'</h2><button type="button" class="button button-soft" data-close>إغلاق</button></header><div class="sl-body"></div>';document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d.querySelector('.sl-body')};
const action=(root,sel,fn)=>{const b=typeof sel==='string'?root.querySelector(sel):sel;if(!b)return;b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await fn()}catch(e){alert(e?.message||'تعذر تنفيذ العملية')}finally{b.disabled=false}}};
const isoLocal=(date,time)=>new Date(date+'T'+time+':00+03:00').toISOString();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tomorrow=()=>{const d=new Date(Date.now()+86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const safeName=s=>String(s||'ملف').replace(/[^\p{L}\p{N}._-]+/gu,'_').slice(0,90);

async function scopes(){
 const [complexes,circles,teachers]=await Promise.all([
   res(sb().from('complexes').select('id,name,org_id').eq('active',true).order('name')),
   res(sb().from('circles').select('id,name,complex_id,circle_type,session_period').eq('active',true).order('name')),
   res(sb().from('teachers').select('id,full_name,complex_id,circle_id,user_id,phone,nationality,identity_number,identity_expiry,qualification,job_title,license_number,license_date_hijri').eq('active',true).order('full_name'))
 ]);
 return{complexes,circles,teachers};
}
function gradeRate(n){n=Number(n||0);return n>=90?'ممتاز':n>=80?'جيد جدًا':n>=70?'جيد':n>=60?'مقبول':'يحتاج تحسين'}
function scoreColor(n){n=Number(n||0);return n>=90?'#0b7b57':n>=80?'#00808a':n>=70?'#8b6b1f':n>=60?'#b7791f':'#a33d34'}

async function getTemplate(orgId,complexId,type){
 let q=sb().from('document_templates').select('*').eq('org_id',orgId).eq('template_type',type).eq('active',true).order('created_at',{ascending:false});
 if(complexId)q=q.eq('complex_id',complexId);else q=q.is('complex_id',null);
 let d=await res(q.limit(1));if(d.length)return d[0];
 if(complexId){d=await res(sb().from('document_templates').select('*').eq('org_id',orgId).is('complex_id',null).eq('template_type',type).eq('active',true).order('created_at',{ascending:false}).limit(1));if(d.length)return d[0]}
 return null;
}
function printShell(title,body,templateUrl='',portrait=true){
 const w=window.open('','_blank');if(!w)throw Error('اسمح بالنوافذ المنبثقة للطباعة.');
 const bg=templateUrl?'body:before{content:"";position:fixed;inset:0;background:url("'+esc(templateUrl)+'") center/100% 100% no-repeat;z-index:-2;opacity:1}':'';
 w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 '+(portrait?'portrait':'landscape')+';margin:10mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#183c33;margin:0;padding:8mm;position:relative;min-height:277mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+bg+'body:after{content:"";position:fixed;inset:0;background:#ffffffde;z-index:-1}.sv-print-head{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #00808a;padding-bottom:10px;margin-bottom:12px}.sv-print-head img{width:110px}.sv-print-head h1{color:#073c34;margin:0;font-size:23px}.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.sv-box{border:1px solid #d8e3de;border-radius:9px;padding:8px;background:#ffffffdf}.sv-box span{display:block;color:#667a72;font-size:10px}.sv-box b{font-size:14px}.sv-section{margin:14px 0;break-inside:avoid}.sv-section h2{font-size:16px;color:#00808a;border-right:5px solid #d8bd88;padding-right:8px}.sv-table{width:100%;border-collapse:collapse;font-size:9.5px}.sv-table th{background:#073c34;color:white}.sv-table th,.sv-table td{border:1px solid #d8e3de;padding:5px;text-align:right;vertical-align:top}.sv-note{border:1px solid #d8e3de;border-radius:10px;padding:10px;white-space:pre-wrap;min-height:36px;background:#ffffffdf}.sv-score{font-size:32px;color:#00808a;font-weight:bold}.sv-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:28px;text-align:center}.sv-signatures div{border-top:1px solid #777;padding-top:8px}footer{margin-top:16px;border-top:1px solid #d8e3de;padding-top:8px;color:#667a72;font-size:9px}@media print{button{display:none}}</style></head><body><header class="sv-print-head"><img src="/assets/logo-sanabil-v6.png"><div><h1>'+esc(title)+'</h1><div>منصة سنابل الوحي · جمعية الوحيين</div></div></header>'+body+'<footer>أُخرج من منصة سنابل الوحي — '+new Date().toLocaleString('ar-SA')+'</footer><script>window.onload=()=>setTimeout(()=>window.print(),400)<\\/script></body></html>');w.document.close()
}

async function circleAnalytics(circleId){
 const students=await res(sb().from('students').select('id,full_name,nationality,stage,memorization_level').eq('circle_id',circleId).eq('active',true).order('full_name'));
 const ids=students.map(x=>x.id),out=[];
 for(let i=0;i<ids.length;i+=100){
   if(!ids.slice(i,i+100).length)continue;
   out.push(...await res(sb().from('outcomes').select('student_id,date_key,new_lesson,memorization_rating,recent_review_rating,review_rating').in('student_id',ids.slice(i,i+100)).order('date_key',{ascending:false}).limit(5000)));
 }
 const stats=new Map;
 for(const s of students)stats.set(s.id,{student:s,points:0,days:0,latest:null});
 for(const o of out){const x=stats.get(o.student_id);if(!x)continue;if(!x.latest)x.latest=o;x.days++;x.points+=o.memorization_rating==='ممتاز'?4:o.memorization_rating==='جيد جدًا'?3:o.memorization_rating==='جيد'?2:o.memorization_rating?0:0}
 const rank=arr=>arr.sort((a,b)=>b.points-a.points||b.days-a.days||a.student.full_name.localeCompare(b.student.full_name,'ar'));
 const saudis=rank([...stats.values()].filter(x=>String(x.student.nationality||'').includes('سعود'))),others=rank([...stats.values()].filter(x=>!String(x.student.nationality||'').includes('سعود')));
 const describe=x=>x?{id:x.student.id,name:x.student.full_name,points:x.points,days:x.days,latestLesson:x.latest?.new_lesson||'—',latestDate:x.latest?.date_key||null}:null;
 return{studentCount:students.length,saudiCount:saudis.length,nonSaudiCount:others.length,saudiHigh:describe(saudis[0]),saudiLow:describe(saudis[saudis.length-1]),nonSaudiHigh:describe(others[0]),nonSaudiLow:describe(others[others.length-1]),students,stats:Object.fromEntries([...stats].map(([k,v])=>[k,{points:v.points,days:v.days,latest:v.latest}]))};
}
function analyticsCard(a){
 const person=x=>x?esc(x.name)+' <small>('+esc(x.latestLesson)+' · '+esc(x.days)+' حصيلة)</small>':'لا توجد بيانات كافية';
 return '<div class="sv-analytics"><article><span>طلاب الحلقة</span><b>'+a.studentCount+'</b></article><article><span>السعوديون</span><b>'+a.saudiCount+'</b></article><article><span>غير السعوديين</span><b>'+a.nonSaudiCount+'</b></article><article><span>أعلى حفظًا — سعوديون</span><b>'+person(a.saudiHigh)+'</b></article><article><span>أقل حفظًا — سعوديون</span><b>'+person(a.saudiLow)+'</b></article><article><span>أعلى حفظًا — غير سعوديين</span><b>'+person(a.nonSaudiHigh)+'</b></article><article><span>أقل حفظًا — غير سعوديين</span><b>'+person(a.nonSaudiLow)+'</b></article></div>';
}

async function createCycle(root,sc){
 const b=modal('إنشاء دورة إشرافية');
 b.innerHTML='<form class="sv-form"><div class="form-grid">'+
 '<label>اسم الدورة<input name="name" required placeholder="الدورة الإشرافية الأولى"></label>'+
 '<label>المجمع>'+selectHtml('complex',sc.complexes,'','كل النطاق المتاح')+'</label>'+
 '<label>بداية الدورة<input name="start" type="date" value="'+today()+'" required></label>'+
 '<label>نهاية الدورة<input name="end" type="date" required></label>'+
 '<label>بداية الزيارات يوميًا<input name="time" type="time" value="16:30" required></label>'+
 '<label>مدة الزيارة بالدقائق<input name="duration" type="number" min="20" max="240" value="50" required></label>'+
 '<label>عدد الزيارات في اليوم<input name="daily" type="number" min="1" max="10" value="2" required></label>'+
 '<label>عدد الزيارات لكل معلم خلال الدورة<input name="perteacher" type="number" min="1" max="20" value="1" required></label>'+
 '<label>طريقة الجدولة><select name="mode"><option value="manual">يدوية</option><option value="auto">تلقائية</option></select></label></div>'+
 '<fieldset><legend>أيام الزيارة</legend><div class="sv-days">'+[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']].map(x=>'<label><input type="checkbox" name="wd'+x[0]+'" '+(Number(x[0])<=4?'checked':'')+'> '+x[1]+'</label>').join('')+'</div></fieldset>'+
 '<label>ملاحظات<textarea name="notes" rows="3"></textarea></label><button class="button button-primary" type="submit">حفظ الدورة</button></form>';
 const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const wds=[0,1,2,3,4,5,6].filter(n=>form.querySelector('[name="wd'+n+'"]').checked);if(!form.start.value||!form.end.value||form.end.value<form.start.value)throw Error('تحقق من تاريخ بداية الدورة ونهايتها.');const id=await rpc('create_supervision_cycle',{p_name:form.name.value.trim(),p_complex_id:form.complex.value||null,p_start_date:form.start.value,p_end_date:form.end.value,p_weekdays:wds,p_daily_start:form.time.value,p_visit_duration_minutes:Number(form.duration.value),p_visits_per_day:Number(form.daily.value),p_visits_per_teacher:Number(form.perteacher.value),p_mode:form.mode.value,p_notes:form.notes.value.trim()||null});if(form.mode.value==='auto'){const rr=await rpc('auto_schedule_supervision_cycle',{p_cycle_id:id});alert('تم إنشاء الدورة وجدولة '+rr.scheduled+' زيارة. غير المجدول: '+rr.unscheduled)}b.closest('dialog').close();await page(root)};
}
async function manualVisit(root,sc,cycleId=''){
 const cycles=await res(sb().from('supervision_visit_cycles').select('*').in('status',['draft','active']).order('start_date',{ascending:false}));
 if(!cycles.length)throw Error('أنشئ دورة إشرافية أولًا.');
 const b=modal('جدولة زيارة إشرافية يدويًا');
 b.innerHTML='<form><div class="form-grid"><label>الدورة>'+selectHtml('cycle',cycles.map(x=>({id:x.id,name:x.name+' · '+x.start_date+' — '+x.end_date})),cycleId)+'</label><label>المعلم>'+selectHtml('teacher',sc.teachers.map(x=>({id:x.id,name:x.full_name})))+'</label><label>تاريخ الزيارة<input name="date" type="date" value="'+tomorrow()+'" required></label><label>الوقت<input name="time" type="time" value="16:30" required></label><label>نوع الزيارة><select name="type"><option>استطلاعية</option><option selected>توجيهية</option><option>تقويمية</option></select></label></div><button class="button button-primary" type="submit">حفظ الموعد</button></form>';
 const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();if(!form.cycle.value||!form.teacher.value)throw Error('اختر الدورة والمعلم.');await rpc('create_supervision_visit',{p_cycle_id:form.cycle.value,p_teacher_id:form.teacher.value,p_scheduled_at:isoLocal(form.date.value,form.time.value),p_visit_type:form.type.value});b.closest('dialog').close();await page(root)};
}
async function autoSchedule(root,id){
 if(!confirm('سيعيد النظام إنشاء المواعيد غير المكتملة لهذه الدورة تلقائيًا. هل تريد المتابعة؟'))return;
 const r=await rpc('auto_schedule_supervision_cycle',{p_cycle_id:id});alert('تمت الجدولة: '+r.scheduled+' زيارة. السعة: '+r.capacity+'. غير المجدول: '+r.unscheduled);await page(root)
}

async function openVisit(root,visit,sc){
 const teacher=sc.teachers.find(x=>x.id===visit.teacher_id)||await res(sb().from('teachers').select('*').eq('id',visit.teacher_id).single());
 const circle=sc.circles.find(x=>x.id===visit.circle_id)||null;
 if(!circle)throw Error('لم تعد الحلقة المسندة للمعلم موجودة.');
 const analytics=await circleAnalytics(circle.id);
 const latest=analytics.stats||{};
 if(visit.status==='scheduled')await res(sb().from('supervision_visits').update({status:'draft',actual_started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',visit.id).select('id'));
 const b=modal('استمارة قياس أداء معلم القرآن');
 const previousScores=Object.fromEntries((visit.scores||[]).map(x=>[x.id,String(x.score??'')]));
 const previousStudents=visit.student_checks||[];
 const studentOpts=analytics.students.map(s=>({id:s.id,name:s.full_name}));
 const first18=ITEMS.slice(0,18);
 b.innerHTML='<form class="sv-visit-form">'+
 '<section class="sv-form-hero"><div><span>الزيارة الإشرافية رقم '+esc(visit.visit_number)+'</span><h2>'+esc(teacher.full_name)+'</h2><p>'+esc(circle.name)+' · '+esc(dayDate(visit.scheduled_at))+'</p></div><div class="sv-live-score"><span>الدرجة</span><b data-live-score>0 / 100</b><small data-live-rating>—</small></div></section>'+
 '<h3>البيانات الأساسية للمعلم</h3><div class="form-grid"><label>الاسم<input value="'+esc(teacher.full_name)+'" disabled></label><label>الجوال<input name="phone" value="'+esc(teacher.phone||'')+'"></label><label>الجنسية<input name="nationality" value="'+esc(teacher.nationality||'')+'"></label><label>المؤهل<input name="qualification" value="'+esc(teacher.qualification||'')+'"></label><label>المسمى الوظيفي<input name="job_title" value="'+esc(teacher.job_title||'')+'"></label><label>رقم الرخصة<input name="license_number" value="'+esc(teacher.license_number||'')+'"></label><label>نوع الزيارة><select name="visit_type"><option '+(visit.visit_type==='استطلاعية'?'selected':'')+'>استطلاعية</option><option '+(visit.visit_type==='توجيهية'?'selected':'')+'>توجيهية</option><option '+(visit.visit_type==='تقويمية'?'selected':'')+'>تقويمية</option></select></label><label>نشاط المعلم<input name="activity" value="'+esc(visit.teacher_activity||'')+'"></label></div><label>ملاحظات تلاوة المعلم<textarea name="recitation" rows="3">'+esc(visit.teacher_recitation||'')+'</textarea></label>'+
 '<h3>بيانات الحلقة المستدعاة من المنصة</h3>'+analyticsCard(analytics)+
 '<h3>بنود تقويم المعلم</h3><div class="sv-rating-note"><b>سلم التقدير:</b> 5 متميز، 4 متحقق، 3 مقبول، 2 جزئي، 1 ضعيف، 0 لم ينفذ.</div>'+
 '<div class="table-wrap"><table class="sv-eval-table"><thead><tr><th>#</th><th>المجال</th><th>المهارة</th><th>المؤشر</th><th>الدرجة</th></tr></thead><tbody>'+first18.map((x,i)=>'<tr><td>'+esc(i+1)+'</td><td>'+esc(x.section)+'</td><td>'+esc(x.skill)+'</td><td>'+esc(x.indicator)+'</td><td>'+ratingSelect(x.id,previousScores[x.id])+'</td></tr>').join('')+'</tbody></table></div>'+
 '<h3>قياس مستوى طالبين من الحلقة</h3><p class="sl-help">اختر الطالب؛ سيظهر آخر موضع وصل إليه في الحصيلة اليومية قبل وضع درجة القياس.</p>'+
 '<div class="sv-student-checks">'+[0,1].map((slot)=>{
   const old=previousStudents[slot]||{};return '<article class="sv-student-check"><h4>النموذج '+(slot+1)+'</h4><label>الطالب>'+selectHtml('student_'+slot,studentOpts,old.studentId)+'</label><div class="sv-student-progress" data-student-progress="'+slot+'">اختر الطالب لعرض آخر حصيلة.</div><label>درجة قياس الحفظ والتجويد>'+ratingSelect(slot===0?'t19':'t20',previousScores[slot===0?'t19':'t20']||old.score)+'</label><label>ملاحظات المستوى<textarea name="student_note_'+slot+'" rows="3">'+esc(old.note||'')+'</textarea></label></article>'
 }).join('')+'</div>'+
 '<h3>التغذية الراجعة والخطة العلاجية</h3><div class="form-grid"><label>نقاط القوة<textarea name="strengths" rows="4">'+esc(visit.strengths||'')+'</textarea></label><label>أولويات التحسين<textarea name="improvements" rows="4">'+esc(visit.improvements||'')+'</textarea></label></div><label>التوصيات<textarea name="recommendations" rows="4">'+esc(visit.recommendations||'')+'</textarea></label>'+
 '<div class="sv-builder-head"><h4>خطة المتابعة والعلاج</h4>'+btn('إضافة إجراء','add-treatment')+'</div><div data-treatment-list></div>'+
 '<label>ملاحظات أخرى<textarea name="other_notes" rows="3">'+esc(visit.other_notes||'')+'</textarea></label>'+
 '<div class="sl-toolbar">'+btn('حفظ مسودة','save-draft')+btn('اعتماد الزيارة','save-final','button-primary')+'</div></form>';
 const form=b.querySelector('form'),treat=b.querySelector('[data-treatment-list]');
 const oldPlan=Array.isArray(visit.treatment_plan)&&visit.treatment_plan.length?visit.treatment_plan:[{action:'',owner:'المعلم',dueDate:'',priority:'متوسطة',status:'مفتوحة'}];
 const addTreatment=x=>{const i=treat.children.length,d=document.createElement('div');d.className='sv-treatment-row';d.dataset.idx=i;d.innerHTML='<input name="tr_action_'+i+'" placeholder="الإجراء العلاجي / المتابعة" value="'+esc(x?.action||'')+'"><input name="tr_owner_'+i+'" placeholder="المسؤول" value="'+esc(x?.owner||'المعلم')+'"><input name="tr_due_'+i+'" type="date" value="'+esc(x?.dueDate||'')+'"><select name="tr_priority_'+i+'"><option '+(x?.priority==='عالية'?'selected':'')+'>عالية</option><option '+(!x?.priority||x?.priority==='متوسطة'?'selected':'')+'>متوسطة</option><option '+(x?.priority==='منخفضة'?'selected':'')+'>منخفضة</option></select><select name="tr_status_'+i+'"><option '+(!x?.status||x?.status==='مفتوحة'?'selected':'')+'>مفتوحة</option><option '+(x?.status==='قيد التنفيذ'?'selected':'')+'>قيد التنفيذ</option><option '+(x?.status==='مغلقة'?'selected':'')+'>مغلقة</option></select><button type="button" class="button button-soft" data-remove-treatment>حذف</button>';treat.appendChild(d);d.querySelector('[data-remove-treatment]').onclick=()=>d.remove()};
 oldPlan.forEach(addTreatment);action(b,'[data-sv-action="add-treatment"]',()=>addTreatment({}));
 const refreshStudent=slot=>{const id=form.querySelector('[name="student_'+slot+'"]').value,el=b.querySelector('[data-student-progress="'+slot+'"]'),st=analytics.students.find(x=>x.id===id),x=id?latest[id]:null;if(!st){el.textContent='اختر الطالب لعرض آخر حصيلة.';return}el.innerHTML='<b>'+esc(st.full_name)+'</b><br>المستوى: '+esc(st.memorization_level||st.stage||'—')+'<br>آخر درس في الحصيلة: '+esc(x?.latest?.new_lesson||'لا توجد حصيلة مسجلة')+(x?.latest?.date_key?' · '+esc(x.latest.date_key):'')+'<br>عدد الحصائل المرصودة: '+esc(x?.days||0)};
 [0,1].forEach(i=>{form.querySelector('[name="student_'+i+'"]').onchange=()=>refreshStudent(i);refreshStudent(i)});
 const calc=()=>{let total=0,n=0;b.querySelectorAll('[data-score-item]').forEach(s=>{if(s.value!==''){total+=Number(s.value);n++}});b.querySelector('[data-live-score]').textContent=total+' / 100';b.querySelector('[data-live-score]').style.color=scoreColor(total);b.querySelector('[data-live-rating]').textContent=n===20?gradeRate(total):'مكتمل '+n+' من 20'};
 b.querySelectorAll('[data-score-item]').forEach(s=>s.onchange=calc);calc();
 const collect=async(final)=>{
   const scores=ITEMS.map(x=>({id:x.id,section:x.section,skill:x.skill,indicator:x.indicator,score:form.querySelector('[name="score_'+x.id+'"]').value===''?null:Number(form.querySelector('[name="score_'+x.id+'"]').value)}));
   const studentChecks=[0,1].map(i=>{const sid=form.querySelector('[name="student_'+i+'"]').value,st=analytics.students.find(x=>x.id===sid),score=form.querySelector('[name="score_'+(i===0?'t19':'t20')+'"]').value;return{slot:i+1,studentId:sid||null,studentName:st?.full_name||null,score:score===''?null:Number(score),note:form.querySelector('[name="student_note_'+i+'"]').value.trim()||null,latestOutcome:sid?latest[sid]?.latest||null:null}});
   if(final&&(studentChecks.some(x=>!x.studentId)))throw Error('اختر طالبين لقياس المستوى قبل اعتماد الزيارة.');
   const plan=[...treat.querySelectorAll('.sv-treatment-row')].map(d=>{const i=d.dataset.idx;return{action:form.querySelector('[name="tr_action_'+i+'"]')?.value.trim()||'',owner:form.querySelector('[name="tr_owner_'+i+'"]')?.value.trim()||'',dueDate:form.querySelector('[name="tr_due_'+i+'"]')?.value||'',priority:form.querySelector('[name="tr_priority_'+i+'"]')?.value||'متوسطة',status:form.querySelector('[name="tr_status_'+i+'"]')?.value||'مفتوحة'}}).filter(x=>x.action);
   await res(sb().from('teachers').update({phone:form.phone.value.trim()||null,nationality:form.nationality.value.trim()||null,qualification:form.qualification.value.trim()||null,job_title:form.job_title.value.trim()||null,license_number:form.license_number.value.trim()||null,updated_at:new Date().toISOString()}).eq('id',teacher.id).select('id'));
   await res(sb().from('supervision_visits').update({teacher_profile_snapshot:{fullName:teacher.full_name,phone:form.phone.value,nationality:form.nationality.value,qualification:form.qualification.value,jobTitle:form.job_title.value,licenseNumber:form.license_number.value},circle_snapshot:{id:circle.id,name:circle.name,type:circle.circle_type,period:circle.session_period},overview_snapshot:analytics,updated_at:new Date().toISOString()}).eq('id',visit.id).select('id'));
   const rr=await rpc('save_supervision_visit',{p_visit_id:visit.id,p_visit_type:form.visit_type.value,p_teacher_activity:form.activity.value.trim()||null,p_teacher_recitation:form.recitation.value.trim()||null,p_scores:scores,p_student_checks:studentChecks,p_strengths:form.strengths.value.trim()||null,p_improvements:form.improvements.value.trim()||null,p_recommendations:form.recommendations.value.trim()||null,p_treatment_plan:plan,p_other_notes:form.other_notes.value.trim()||null,p_final:!!final,p_license_status:form.license_number.value.trim()?'نعم':'لا',p_license_number:form.license_number.value.trim()||null});
   alert(final?'تم اعتماد الزيارة بدرجة '+rr.score+' / 100 — '+rr.rating:'تم حفظ مسودة الزيارة.');b.closest('dialog').close();await page(root)
 };
 action(b,'[data-sv-action="save-draft"]',()=>collect(false));action(b,'[data-sv-action="save-final"]',()=>collect(true));
}

async function showVisitResult(v,sc){
 const teacher=sc.teachers.find(x=>x.id===v.teacher_id),circle=sc.circles.find(x=>x.id===v.circle_id),b=modal('نتيجة الزيارة الإشرافية');
 const rows=(v.scores||[]).map(x=>[x.id,x.skill||'',x.indicator||'',x.score??'—']);
 const students=(v.student_checks||[]).map(x=>[x.studentName||'—',x.latestOutcome?.new_lesson||'—',x.score??'—',x.note||'—']);
 b.innerHTML='<div class="sv-result-hero"><div><h2>'+esc(teacher?.full_name||v.teacher_profile_snapshot?.fullName||'المعلم')+'</h2><p>'+esc(circle?.name||v.circle_snapshot?.name||'')+' · '+esc(arDate(v.scheduled_at))+'</p></div><div><b style="color:'+scoreColor(v.score)+'">'+esc(v.score??0)+'/100</b><span>'+esc(v.rating||'—')+'</span></div></div>'+
 '<div class="stats-grid"><article class="stat-card"><span>نوع الزيارة</span><b>'+esc(v.visit_type)+'</b></article><article class="stat-card"><span>رقم الزيارة</span><b>'+esc(v.visit_number)+'</b></article><article class="stat-card"><span>الحالة</span><b>'+esc(v.status)+'</b></article></div>'+
 '<h3>نقاط القوة</h3><div class="sv-readbox">'+esc(v.strengths||'—')+'</div><h3>أولويات التحسين</h3><div class="sv-readbox">'+esc(v.improvements||'—')+'</div><h3>التوصيات</h3><div class="sv-readbox">'+esc(v.recommendations||'—')+'</div>'+
 '<h3>تقييم البنود</h3><div class="table-wrap"><table><thead><tr><th>الرمز</th><th>المهارة</th><th>المؤشر</th><th>الدرجة</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<h3>الطالبان المختبران</h3><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>آخر درس</th><th>الدرجة</th><th>الملاحظات</th></tr></thead><tbody>'+students.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<h3>الخطة العلاجية</h3><div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>المسؤول</th><th>الموعد</th><th>الأولوية</th><th>الحالة</th></tr></thead><tbody>'+(v.treatment_plan||[]).map(x=>'<tr><td>'+esc(x.action)+'</td><td>'+esc(x.owner)+'</td><td>'+esc(x.dueDate)+'</td><td>'+esc(x.priority)+'</td><td>'+esc(x.status)+'</td></tr>').join('')+'</tbody></table></div>'+
 '<div class="sl-toolbar">'+btn('طباعة الاستمارة','print-result')+'</div>';
 action(b,'[data-sv-action="print-result"]',async()=>{
   const tpl=await getTemplate(v.org_id,v.complex_id,'supervision')||await getTemplate(v.org_id,v.complex_id,'report');
   const meta='<div class="sv-grid"><div class="sv-box"><span>المعلم</span><b>'+esc(teacher?.full_name||v.teacher_profile_snapshot?.fullName||'')+'</b></div><div class="sv-box"><span>الحلقة</span><b>'+esc(circle?.name||v.circle_snapshot?.name||'')+'</b></div><div class="sv-box"><span>موعد الزيارة</span><b>'+esc(arDate(v.scheduled_at))+'</b></div><div class="sv-box"><span>نوع الزيارة</span><b>'+esc(v.visit_type)+'</b></div><div class="sv-box"><span>النتيجة</span><b class="sv-score">'+esc(v.score)+'/100</b></div><div class="sv-box"><span>التقدير</span><b>'+esc(v.rating)+'</b></div></div>';
   const shtml='<section class="sv-section"><h2>نتيجة بنود التقييم</h2><table class="sv-table"><thead><tr><th>#</th><th>المهارة</th><th>المؤشر</th><th>الدرجة</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>';
   const note='<section class="sv-section"><h2>نقاط القوة</h2><div class="sv-note">'+esc(v.strengths||'—')+'</div><h2>أولويات التحسين</h2><div class="sv-note">'+esc(v.improvements||'—')+'</div><h2>التوصيات</h2><div class="sv-note">'+esc(v.recommendations||'—')+'</div></section><div class="sv-signatures"><div>المعلم/ـة</div><div>مدير الجهة</div><div>المشرف المقيِّم</div></div>';
   printShell('استمارة قياس أداء معلم القرآن',meta+shtml+note,tpl?.public_url||'',true)
 });
}

async function templatesPanel(root,sc,a){
 const b=modal('قوالب التقارير والشهادات');
 const allowedComplexes=sc.complexes.filter(x=>!a.complexIds?.length||a.complexIds.includes(x.id)||a.roles.includes('admin')||a.roles.includes('manager'));
 const load=async()=>{
   const data=await res(sb().from('document_templates').select('*').eq('org_id',a.org_id).eq('active',true).order('created_at',{ascending:false}));
   b.innerHTML='<p class="sl-help">ارفع صورة PNG/JPG/WEBP للكليشة. سيستخدمها النظام خلفية للتقارير أو الزيارات أو الشهادات ضمن المجمع المحدد.</p><form><div class="form-grid"><label>المجمع>'+selectHtml('complex',allowedComplexes,'','قالب عام للمؤسسة')+'</label><label>نوع القالب><select name="type"><option value="report">التقارير العامة</option><option value="supervision">الزيارات الإشرافية</option><option value="certificate">الشهادات</option></select></label><label>اسم القالب<input name="name" required placeholder="كليشة المجمع"></label><label>ملف القالب<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required></label></div><button class="button button-primary" type="submit">رفع واعتماد القالب</button></form><h3>القوالب النشطة</h3><div class="sv-template-grid">'+(data.length?data.map((x,i)=>'<article><img src="'+esc(x.public_url)+'"><b>'+esc(x.name)+'</b><span>'+esc(x.template_type)+' · '+esc(sc.complexes.find(c=>c.id===x.complex_id)?.name||'عام')+'</span>'+btn('إيقاف','disable-'+i)+'</article>').join(''):'<p>لا توجد قوالب مرفوعة بعد.</p>')+'</div><div class="sl-toolbar">'+btn('إصدار شهادة','certificate')+'</div>';
   const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const file=form.file.files?.[0];if(!file)throw Error('اختر صورة القالب.');if(file.size>10*1024*1024)throw Error('حجم القالب يتجاوز 10MB.');const complex=form.complex.value||null,type=form.type.value,path=a.org_id+'/'+(complex||'org')+'/'+type+'/'+Date.now()+'-'+safeName(file.name);await res(sb().storage.from('sanabil-templates').upload(path,file,{upsert:false,contentType:file.type}));const pub=sb().storage.from('sanabil-templates').getPublicUrl(path).data.publicUrl;let q=sb().from('document_templates').update({active:false,updated_at:new Date().toISOString()}).eq('org_id',a.org_id).eq('template_type',type).eq('active',true);q=complex?q.eq('complex_id',complex):q.is('complex_id',null);await res(q.select('id'));await res(sb().from('document_templates').insert({org_id:a.org_id,complex_id:complex,template_type:type,name:form.name.value.trim(),storage_path:path,public_url:pub,mime_type:file.type,active:true}).select('id'));alert('تم اعتماد القالب.');await load()};
   data.forEach((x,i)=>action(b,'[data-sv-action="disable-'+i+'"]',async()=>{await res(sb().from('document_templates').update({active:false,updated_at:new Date().toISOString()}).eq('id',x.id).select('id'));await load()}));
   action(b,'[data-sv-action="certificate"]',()=>certificateDialog(a,sc))
 };
 await load()
}
async function certificateDialog(a,sc){
 const b=modal('إصدار شهادة');
 b.innerHTML='<form><div class="form-grid"><label>المجمع>'+selectHtml('complex',sc.complexes,a.complexIds?.[0]||'','قالب المؤسسة')+'</label><label>اسم المستفيد<input name="recipient" required></label><label>عنوان الشهادة<input name="title" value="شهادة شكر وتقدير" required></label><label>التاريخ<input name="date" type="date" value="'+today()+'" required></label></div><label>نص الشهادة<textarea name="body" rows="5" required>تقديرًا للجهود المباركة والعطاء المتميز، سائلين الله مزيدًا من التوفيق والسداد.</textarea></label><button class="button button-primary" type="submit">معاينة وطباعة</button></form>';
 const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const tpl=await getTemplate(a.org_id,form.complex.value||null,'certificate');const body='<div style="height:235mm;display:grid;place-items:center;text-align:center;padding:20mm"><div><h1 style="font-size:34px;color:#073c34">'+esc(form.title.value)+'</h1><h2 style="font-size:29px;color:#00808a">'+esc(form.recipient.value)+'</h2><p style="font-size:19px;line-height:2.2;max-width:150mm">'+esc(form.body.value)+'</p><p>'+esc(form.date.value)+'</p></div></div>';printShell(form.title.value,body,tpl?.public_url||'',true)}
}

async function decorateDashboard(root,a){
 try{
   const now=new Date().toISOString(),until=new Date(Date.now()+14*86400000).toISOString();
   const visits=await res(sb().from('supervision_visits').select('id,teacher_id,circle_id,scheduled_at,visit_type,status,score,rating').gte('scheduled_at',now).lte('scheduled_at',until).neq('status','cancelled').order('scheduled_at').limit(10));
   if(!visits.length)return;
   const sc=await scopes(),tm=Object.fromEntries(sc.teachers.map(x=>[x.id,x.full_name])),cm=Object.fromEntries(sc.circles.map(x=>[x.id,x.name]));
   const sec=document.createElement('section');sec.className='sl-tasks sv-dashboard-alert';sec.innerHTML='<h3>الزيارات الإشرافية القادمة</h3><div class="sv-upcoming-list">'+visits.map(v=>'<article><b>'+esc(tm[v.teacher_id]||'زيارة إشرافية')+'</b><span>'+esc(cm[v.circle_id]||'')+' · '+esc(arDate(v.scheduled_at))+' · '+esc(v.visit_type)+'</span></article>').join('')+'</div>'+btn('فتح الزيارات الإشرافية','go-supervision');
   const hero=root.querySelector('.sl-session-head');if(hero)hero.insertAdjacentElement('afterend',sec);else root.prepend(sec);
   action(sec,'[data-sv-action="go-supervision"]',()=>{location.hash='#supervision';location.reload()})
 }catch{}
}

async function page(root){
 const a=await access(),roles=a.roles||[],isTeacher=roles.includes('teacher')&&!roles.some(x=>['admin','manager','supervisor'].includes(x)),canManage=roles.some(x=>['admin','manager','supervisor'].includes(x)),sc=await scopes();
 root.innerHTML='<div class="sv-page-head"><div><span class="sl-kicker">الحصيلة الإشرافية</span><h2>الزيارات الإشرافية</h2><p>تخطيط الدورات، جدولة الزيارات، استمارة التقييم، التغذية الراجعة، وخطط التحسين في مسار واحد.</p></div><div class="sl-toolbar">'+(canManage?btn('دورة إشرافية جديدة','new-cycle')+btn('زيارة يدوية','manual-visit')+btn('قوالب التقارير والشهادات','templates'):'')+'</div></div><div data-sv-main><p>جارٍ تحميل الزيارات…</p></div>';
 if(canManage){action(root,'[data-sv-action="new-cycle"]',()=>createCycle(root,sc));action(root,'[data-sv-action="manual-visit"]',()=>manualVisit(root,sc));action(root,'[data-sv-action="templates"]',()=>templatesPanel(root,sc,a))}
 const main=root.querySelector('[data-sv-main]');
 const [cycles,visits]=await Promise.all([
   canManage?res(sb().from('supervision_visit_cycles').select('*').order('start_date',{ascending:false}).limit(50)):Promise.resolve([]),
   res(sb().from('supervision_visits').select('*').order('scheduled_at',{ascending:false}).limit(300))
 ]);
 const tm=Object.fromEntries(sc.teachers.map(x=>[x.id,x.full_name])),cm=Object.fromEntries(sc.circles.map(x=>[x.id,x.name]));
 const upcoming=visits.filter(x=>['scheduled','draft'].includes(x.status)).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))),done=visits.filter(x=>x.status==='completed');
 main.innerHTML=(canManage?'<section class="sv-panel"><div class="sv-builder-head"><h3>الدورات الإشرافية</h3></div>'+(cycles.length?'<div class="table-wrap"><table><thead><tr><th>الدورة</th><th>الفترة</th><th>النمط</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>'+cycles.map((x,i)=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.start_date)+' — '+esc(x.end_date)+'</td><td>'+esc(x.mode==='auto'?'تلقائية':'يدوية')+'</td><td>'+esc(x.status)+'</td><td>'+btn('جدولة تلقائية','auto-'+i)+btn('إضافة زيارة','manual-'+i)+'</td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد دورة إشرافية بعد.</p>')+'</section>':'')+
 '<section class="sv-panel"><h3>الزيارات القادمة</h3>'+(upcoming.length?'<div class="table-wrap"><table><thead><tr><th>المعلم</th><th>الحلقة</th><th>الموعد</th><th>النوع</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>'+upcoming.map((v,i)=>'<tr><td>'+esc(tm[v.teacher_id]||v.teacher_id)+'</td><td>'+esc(cm[v.circle_id]||'—')+'</td><td>'+esc(arDate(v.scheduled_at))+'</td><td>'+esc(v.visit_type)+'</td><td>'+esc(v.status)+'</td><td>'+(canManage?btn('فتح الاستمارة','open-'+i):'<span class="status">موعد قادم</span>')+'</td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد زيارات قادمة.</p>')+'</section>'+
 '<section class="sv-panel"><h3>الزيارات المكتملة</h3>'+(done.length?'<div class="table-wrap"><table><thead><tr><th>المعلم</th><th>التاريخ</th><th>الدرجة</th><th>التقدير</th><th>النتيجة</th></tr></thead><tbody>'+done.map((v,i)=>'<tr><td>'+esc(tm[v.teacher_id]||v.teacher_profile_snapshot?.fullName||'')+'</td><td>'+esc(arDate(v.scheduled_at))+'</td><td><b>'+esc(v.score??'—')+'</b></td><td>'+esc(v.rating||'—')+'</td><td>'+btn('عرض الاستمارة','result-'+i)+'</td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد زيارات مكتملة بعد.</p>')+'</section>';
 if(canManage)cycles.forEach((x,i)=>{action(main,'[data-sv-action="auto-'+i+'"]',()=>autoSchedule(root,x.id));action(main,'[data-sv-action="manual-'+i+'"]',()=>manualVisit(root,sc,x.id))});
 if(canManage)upcoming.forEach((v,i)=>action(main,'[data-sv-action="open-'+i+'"]',()=>openVisit(root,v,sc)));
 done.forEach((v,i)=>action(main,'[data-sv-action="result-'+i+'"]',()=>showVisitResult(v,sc)));
}

const style=document.createElement('style');style.textContent='.sv-page-head,.sv-form-hero,.sv-result-hero,.sv-builder-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.sv-page-head{background:linear-gradient(135deg,#073c34,#08776d);color:white;border-radius:20px;padding:20px;margin-bottom:16px}.sv-page-head h2{margin:5px 0}.sv-panel{border:1px solid #dce6e1;border-radius:18px;padding:16px;margin:14px 0;background:#fbfdfc}.sv-form-hero{background:linear-gradient(135deg,#073c34,#00808a);color:white;border-radius:18px;padding:18px;margin-bottom:15px}.sv-live-score{text-align:center;background:#ffffff18;border:1px solid #ffffff40;border-radius:14px;padding:10px 18px}.sv-live-score b{font-size:27px;display:block}.sv-live-score small{display:block}.sv-analytics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px}.sv-analytics article{border:1px solid #dfe8e3;background:#f7faf8;border-radius:12px;padding:10px}.sv-analytics span{font-size:11px;color:#667a72;display:block}.sv-analytics b{font-size:14px}.sv-rating-note{background:#fff8e7;border:1px solid #e6d19c;border-radius:11px;padding:10px;margin:10px 0}.sv-eval-table select{min-width:120px}.sv-student-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.sv-student-check{border:1px solid #dbe6e1;border-radius:15px;padding:14px;background:#f9fbfa}.sv-student-progress{background:#eef7f4;border-radius:10px;padding:10px;margin:10px 0;line-height:1.8}.sv-treatment-row{display:grid;grid-template-columns:2fr 1fr 1fr .8fr .9fr auto;gap:8px;align-items:center;margin:8px 0}.sv-readbox{white-space:pre-wrap;border:1px solid #dce6e1;border-radius:12px;padding:12px;background:#f9fbfa}.sv-result-hero{background:#f2f8f5;border:1px solid #d9e7e1;border-radius:16px;padding:15px}.sv-result-hero>div:last-child{text-align:center}.sv-result-hero>div:last-child b{display:block;font-size:30px}.sv-result-hero>div:last-child span{display:block}.sv-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.sv-template-grid article{border:1px solid #dce6e1;border-radius:14px;padding:10px;display:grid;gap:7px}.sv-template-grid img{width:100%;aspect-ratio:210/297;object-fit:cover;border-radius:8px;border:1px solid #eee}.sv-days{display:flex;flex-wrap:wrap;gap:10px}.sv-upcoming-list{display:grid;gap:7px}.sv-upcoming-list article{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e9e5;padding:8px 0}.sv-upcoming-list span{color:#667a72}@media(max-width:760px){.sv-student-checks{grid-template-columns:1fr}.sv-treatment-row{grid-template-columns:1fr}.sv-upcoming-list article{display:grid}}';document.head.append(style);
window.SanabilSupervision={page,decorateDashboard,getTemplate,printShell};
})();