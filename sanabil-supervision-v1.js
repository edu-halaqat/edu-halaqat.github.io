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
const NON_EXEC_REASONS=[
 ['teacher','لم ينفذ المعلم'],
 ['not_required','غير مطلوبة'],
 ['not_suitable','غير مناسبة']
];
const nonExecReasonSelect=(id,value='')=>'<select name="reason_'+id+'" data-nonexec-reason="'+id+'"><option value="">— اختر سبب عدم التنفيذ —</option>'+NON_EXEC_REASONS.map(x=>'<option value="'+x[0]+'" '+(String(value)===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select>';
const isExemptReason=r=>r==='not_required'||r==='not_suitable';
const effectiveScore=(raw,reason)=>raw===''||raw===null||raw===undefined?null:(Number(raw)===0&&isExemptReason(reason)?5:Number(raw));
const reasonLabel=r=>r==='teacher'?'لم ينفذ المعلم':r==='not_required'?'غير مطلوبة':r==='not_suitable'?'غير مناسبة':'';
const modal=title=>{const d=document.createElement('dialog');d.className='sl-dialog sv-dialog';d.innerHTML='<header><h2>'+esc(title)+'</h2><button type="button" class="button button-soft" data-close>إغلاق</button></header><div class="sl-body"></div>';document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d.querySelector('.sl-body')};
const action=(root,sel,fn)=>{const b=typeof sel==='string'?root.querySelector(sel):sel;if(!b)return;b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await fn()}catch(e){alert(e?.message||'تعذر تنفيذ العملية')}finally{b.disabled=false}}};
const isoLocal=(date,time)=>new Date(date+'T'+time+':00+03:00').toISOString();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tomorrow=()=>{const d=new Date(Date.now()+86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const countCycleDays=(start,end,wds)=>{
 if(!start||!end||!wds?.length)return 0;
 const a=new Date(start+'T12:00:00Z'),b=new Date(end+'T12:00:00Z');if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime())||b<a)return 0;
 let n=0,d=new Date(a);
 while(d<=b){if(wds.includes(d.getUTCDay()))n++;d.setUTCDate(d.getUTCDate()+1)}
 return n;
};
const cycleCapacityInfo=form=>{
 const wds=[0,1,2,3,4,5,6].filter(n=>form.querySelector('[name="wd'+n+'"]')?.checked);
 const teachers=[...form.querySelectorAll('[name="teacher_ids"]:checked')].filter(x=>!x.closest('label')?.hidden).length;
 const perTeacher=Math.max(1,Number(form.elements.perteacher?.value)||1),perDay=Math.max(1,Number(form.elements.daily?.value)||1);
 const days=countCycleDays(form.elements.start?.value,form.elements.end?.value,wds),required=teachers*perTeacher,capacity=days*perDay,shortage=Math.max(0,required-capacity);
 const suggestedPerDay=days?Math.ceil(required/days):0;
 return{wds,teachers,perTeacher,perDay,days,required,capacity,shortage,suggestedPerDay};
};
const capacityMessage=x=>{
 if(!x.teachers)return 'اختر معلمًا واحدًا على الأقل لحساب السعة.';
 if(!x.days)return 'لا توجد أيام زيارة متاحة ضمن الفترة الحالية. أضف يومًا من أيام الأسبوع أو وسّع تاريخ الدورة.';
 if(x.shortage>0)return 'السعة المتاحة '+x.capacity+' موعدًا، بينما المطلوب '+x.required+' زيارة. ينقص '+x.shortage+' موعدًا. ارفع عدد الزيارات في اليوم إلى '+x.suggestedPerDay+' تقريبًا، أو أضف أيام زيارة، أو وسّع مدة الدورة.';
 return 'السعة المتاحة: '+x.capacity+' موعدًا مقابل '+x.required+' زيارة مطلوبة خلال '+x.days+' يوم زيارة.';
};
const refreshCapacity=form=>{
 const el=form.querySelector('[data-capacity-note]');if(!el)return cycleCapacityInfo(form);
 const x=cycleCapacityInfo(form);el.textContent=capacityMessage(x);el.className='sv-capacity-note '+(x.shortage>0||!x.days?'warn':'ok');return x;
};
const bindCapacity=form=>{
 const refresh=()=>refreshCapacity(form);
 ['start','end','daily','perteacher','mode','complex'].forEach(n=>{const el=form.elements[n];if(el)el.addEventListener('change',refresh)});
 form.querySelectorAll('[name^="wd"],[name="teacher_ids"]').forEach(el=>el.addEventListener('change',refresh));
 refresh();
 return refresh;
};
const serverCapacityMessage=r=>{
 const days=Number(r?.availableDays||0),required=Number(r?.required||0),capacity=Number(r?.capacity||0),shortage=Number(r?.unscheduled||0),suggested=Number(r?.suggestedVisitsPerDay||0);
 if(!days)return 'لا توجد أيام زيارة متبقية ضمن هذه الدورة. أضف أيامًا للزيارة أو مدّد تاريخ النهاية.';
 return 'تعذر تنفيذ الجدولة لأن السعة المتبقية لا تكفي. المتاح '+capacity+' موعدًا، والمطلوب '+required+' زيارة، وينقص '+shortage+' موعدًا.'+(suggested?' اجعل عدد الزيارات في اليوم '+suggested+' على الأقل، أو أضف أيام زيارة/مدّد الدورة.':'');
};
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

const ANALYSIS_FOCUS={
 t01:'ضبط الحركات والأحرف المدية وتصويب القراءة',
 t02:'تطبيق أحكام الميم والنون الساكنتين والتنوين',
 t03:'ضبط أزمنة المدود وتعريف أنواعها',
 t04:'التمييز بين همزتي الوصل والقطع عند الابتداء والوصل',
 t05:'اختيار مواضع الوقف والابتداء المناسبة أثناء القراءة',
 t06:'إدارة زمن التسميع بعدل واستيفاء جميع الدارسين',
 t07:'تنظيم وقت المراجعة بما يناسب مستويات الدارسين',
 t08:'تفعيل السجلات التعليمية والاستفادة منها في المتابعة',
 t09:'الموازنة بين القراءة الجماعية والفردية في التلقين',
 t10:'تصحيح الأخطاء بأسلوب إيجابي وإشراك الدارسين في التصويب',
 t11:'تنويع أساليب التعزيز بما يحفز الدارسين',
 t12:'تنظيم جلوس الطلاب وضبط الحلقة',
 t13:'تهيئة الدارس للحفظ بالاستماع المتكرر إلى المقرئ',
 t14:'المحافظة على سمت معلم القرآن والمظهر اللائق',
 t15:'حسن التعامل مع الإدارة والزملاء والدارسين',
 t16:'تقبّل التوجيهات وتحويل التوصيات إلى ممارسات عملية',
 t17:'تحمل المسؤولية والقيام بالواجبات المهنية',
 t18:'رعاية الموهوبين وترشيح المتميزين للمسابقات'
};
const analysisFocus=x=>ANALYSIS_FOCUS[x.id]||x.skill||x.indicator||'هذا الجانب';
const analysisLevel=s=>Number(s)===5?'مستوى متميز':Number(s)===4?'مستوى متحقق':Number(s)===3?'مستوى مقبول':Number(s)===2?'تحقق جزئي':Number(s)===1?'مستوى يحتاج إلى تحسين واضح':'لم يظهر تطبيق كافٍ';
const strengthSentence=x=>{
 const f=analysisFocus(x);
 return Number(x.score)===5
   ?'أظهر المعلم تميزًا واضحًا في «'+x.skill+'»، واتسم أداؤه بتمكن راسخ في '+f+'.'
   :'حقق المعلم مستوى متحققًا في «'+x.skill+'»، وظهر لديه ثبات جيد في '+f+'.';
};
const improvementSentence=x=>{
 const f=analysisFocus(x),s=Number(x.score);
 if(s===3)return 'جاء مستوى المعلم في «'+x.skill+'» مقبولًا، ويحتاج إلى مزيد من الثبات والاتساق في '+f+'.';
 if(s===2)return 'تحقق جانب «'+x.skill+'» بصورة جزئية، ويحتاج إلى تدريب منتظم يرفع جودة '+f+'.';
 if(s===1)return 'يحتاج جانب «'+x.skill+'» إلى تطوير واضح، مع تركيز مباشر على '+f+'.';
 return 'لم يظهر أثناء الزيارة تطبيق كافٍ في «'+x.skill+'»، ويُعد تفعيل '+f+' أولوية مباشرة في المرحلة القادمة.';
};
const recommendationSentence=(x,i)=>{
 const f=analysisFocus(x),s=Number(x.score),lead=(i+1)+'. ';
 if(s===3)return lead+'تثبيت ممارسة '+f+' بصورة منتظمة، ومتابعة اتساقها وأثرها في الزيارة القادمة.';
 if(s===2)return lead+'تخصيص تدريب عملي قصير على '+f+'، ثم تطبيقه بصورة يومية وقياس التحسن في الزيارة القادمة.';
 if(s===1)return lead+'وضع إجراء تطويري واضح لـ'+f+'، مع متابعة أسبوعية وتوثيق التطبيق حتى يصبح جزءًا ثابتًا من أداء الحلقة.';
 return lead+'البدء بخطة علاجية مباشرة لتفعيل '+f+'، مع متابعة قريبة من المشرف والتأكد من ظهور الممارسة في الزيارة التالية.';
};
const cleanGeneratedAnalysis=s=>String(s||'')
 .replace(/\s*\(\s*الدرجة\s*\d+\s*\/\s*5\s*\)/g,'')
 .replace(/(^|\n)\s*•\s*/g,'$1• ')
 .replace(/[ \t]+\n/g,'\n')
 .trim();

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
 w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 '+(portrait?'portrait':'landscape')+';margin:10mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#183c33;margin:0;padding:8mm;position:relative;min-height:277mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+bg+'.sv-print-head{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #00808a;padding-bottom:10px;margin-bottom:12px}.sv-print-head img{width:110px}.sv-print-head h1{color:#073c34;margin:0;font-size:23px}.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.sv-box{border:1px solid #d8e3de;border-radius:9px;padding:8px;background:#ffffffdf}.sv-box span{display:block;color:#667a72;font-size:10px}.sv-box b{font-size:14px}.sv-section{margin:14px 0;break-inside:avoid}.sv-section h2{font-size:16px;color:#00808a;border-right:5px solid #d8bd88;padding-right:8px}.sv-table{width:100%;border-collapse:collapse;font-size:9.5px}.sv-table th{background:#073c34;color:white}.sv-table th,.sv-table td{border:1px solid #d8e3de;padding:5px;text-align:right;vertical-align:top}.sv-note{border:1px solid #d8e3de;border-radius:10px;padding:10px;white-space:pre-wrap;min-height:36px;background:#ffffffdf}.sv-score{font-size:32px;color:#00808a;font-weight:bold}.sv-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:28px;text-align:center}.sv-signatures div{border-top:1px solid #777;padding-top:8px}footer{margin-top:16px;border-top:1px solid #d8e3de;padding-top:8px;color:#667a72;font-size:9px}@media print{button{display:none}}</style></head><body><header class="sv-print-head"><img src="/assets/logo-sanabil-v6.png"><div><h1>'+esc(title)+'</h1><div>منصة سنابل الوحي · جمعية الوحيين</div></div></header>'+body+'<footer>أُخرج من منصة سنابل الوحي — '+new Date().toLocaleString('ar-SA')+'</footer><script>window.onload=()=>setTimeout(()=>window.print(),400)<\\/script></body></html>');w.document.close()
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
 const rank=arr=>arr.sort((a,b)=>b.days-a.days||b.points-a.points||a.student.full_name.localeCompare(b.student.full_name,'ar'));
 const all=[...stats.values()],saudiAll=all.filter(x=>String(x.student.nationality||'').includes('سعود')),otherAll=all.filter(x=>!String(x.student.nationality||'').includes('سعود'));
 const saudis=rank(saudiAll.filter(x=>x.days>0)),others=rank(otherAll.filter(x=>x.days>0));
 const describe=x=>x?{id:x.student.id,name:x.student.full_name,points:x.points,days:x.days,latestLesson:x.latest?.new_lesson||'—',latestDate:x.latest?.date_key||null}:null;
 return{studentCount:students.length,saudiCount:saudiAll.length,nonSaudiCount:otherAll.length,saudiHigh:describe(saudis[0]),saudiLow:describe(saudis[saudis.length-1]),nonSaudiHigh:describe(others[0]),nonSaudiLow:describe(others[others.length-1]),students,stats:Object.fromEntries([...stats].map(([k,v])=>[k,{points:v.points,days:v.days,latest:v.latest}]))};
}
function analyticsCard(a){
 const person=x=>x?esc(x.name)+' <small>('+esc(x.latestLesson)+' · '+esc(x.days)+' حصيلة)</small>':'لا توجد بيانات كافية';
 return '<div class="sv-analytics"><article><span>طلاب الحلقة</span><b>'+a.studentCount+'</b></article><article><span>السعوديون</span><b>'+a.saudiCount+'</b></article><article><span>غير السعوديين</span><b>'+a.nonSaudiCount+'</b></article><article><span>أعلى حفظًا — سعوديون</span><b>'+person(a.saudiHigh)+'</b></article><article><span>أقل حفظًا — سعوديون</span><b>'+person(a.saudiLow)+'</b></article><article><span>أعلى حفظًا — غير سعوديين</span><b>'+person(a.nonSaudiHigh)+'</b></article><article><span>أقل حفظًا — غير سعوديين</span><b>'+person(a.nonSaudiLow)+'</b></article></div>';
}

async function createCycle(root,sc){
 const b=modal('إنشاء دورة إشرافية');
 const teacherCards=()=>'<fieldset><legend>المعلمون المشمولون بالدورة</legend><div class="sv-teacher-pick" data-teacher-pick>'+sc.teachers.map(t=>'<label data-complex="'+esc(t.complex_id||'')+'"><input type="checkbox" name="teacher_ids" value="'+esc(t.id)+'" checked> '+esc(t.full_name)+'</label>').join('')+'</div><p class="sl-help">يمكنك إلغاء أي معلم لا تريد إدخاله في هذه الدورة. عند اختيار مجمع ستظهر معلموه فقط.</p></fieldset>';
 b.innerHTML='<form class="sv-form"><div class="form-grid">'+
 '<label>اسم الدورة<input name="name" required placeholder="الدورة الإشرافية الأولى"></label>'+
 '<label>المجمع'+selectHtml('complex',sc.complexes,'','كل النطاق المتاح')+'</label>'+
 '<label>بداية الدورة<input name="start" type="date" value="'+today()+'" required></label>'+
 '<label>نهاية الدورة<input name="end" type="date" required></label>'+
 '<label>بداية الزيارات يوميًا<input name="time" type="time" value="16:30" required></label>'+
 '<label>مدة الزيارة بالدقائق<input name="duration" type="number" min="20" max="240" value="50" required></label>'+
 '<label>عدد الزيارات في اليوم<input name="daily" type="number" min="1" max="100" value="2" required></label>'+
 '<label>عدد الزيارات لكل معلم خلال الدورة<input name="perteacher" type="number" min="1" max="1000" value="1" required></label>'+
 '<label>طريقة الجدولة<select name="mode"><option value="manual">يدوية</option><option value="auto">تلقائية</option></select></label></div>'+
 '<fieldset><legend>أيام الزيارة</legend><div class="sv-days">'+[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']].map(x=>'<label><input type="checkbox" name="wd'+x[0]+'" '+(Number(x[0])<=4?'checked':'')+'> '+x[1]+'</label>').join('')+'</div></fieldset>'+
 '<div data-capacity-note class="sv-capacity-note"></div>'+
 teacherCards()+
 '<label>ملاحظات<textarea name="notes" rows="3"></textarea></label><button class="button button-primary" type="submit">حفظ الدورة</button></form>';
 const form=b.querySelector('form');
 const filterTeachers=()=>{const cid=form.elements.complex.value;form.querySelectorAll('[data-teacher-pick] label').forEach(l=>{const show=!cid||l.dataset.complex===cid;l.hidden=!show;if(!show)l.querySelector('input').checked=false;else if(!l.dataset.touched)l.querySelector('input').checked=true});refreshCapacity(form)};
 form.elements.complex.onchange=filterTeachers;filterTeachers();
 form.querySelectorAll('[name="teacher_ids"]').forEach(x=>x.onchange=()=>{x.closest('label').dataset.touched='1';refreshCapacity(form)});
 bindCapacity(form);
 form.onsubmit=async e=>{e.preventDefault();const cap=refreshCapacity(form),wds=cap.wds;if(!form.elements.start.value||!form.elements.end.value||form.elements.end.value<form.elements.start.value){alert('تحقق من تاريخ بداية الدورة ونهايتها.');return}const teacherIds=[...form.querySelectorAll('[name="teacher_ids"]:checked')].filter(x=>!x.closest('label').hidden).map(x=>x.value);if(!teacherIds.length){alert('اختر معلمًا واحدًا على الأقل للدورة.');return}if(form.elements.mode.value==='auto'&&cap.shortage>0){alert(capacityMessage(cap));return}const id=await rpc('create_supervision_cycle',{p_name:form.elements.name.value.trim(),p_complex_id:form.elements.complex.value||null,p_start_date:form.elements.start.value,p_end_date:form.elements.end.value,p_weekdays:wds,p_daily_start:form.elements.time.value,p_visit_duration_minutes:Number(form.elements.duration.value),p_visits_per_day:Number(form.elements.daily.value),p_visits_per_teacher:Number(form.elements.perteacher.value),p_mode:form.elements.mode.value,p_notes:form.elements.notes.value.trim()||null});await res(sb().from('supervision_visit_cycles').update({teacher_ids:teacherIds,updated_at:new Date().toISOString()}).eq('id',id).select('id').single());if(form.elements.mode.value==='auto'){const rr=await rpc('auto_schedule_supervision_cycle',{p_cycle_id:id});if(rr?.insufficient){alert(serverCapacityMessage(rr));return}alert('تم إنشاء الدورة وجدولة '+rr.scheduled+' زيارة موزعة على مدة الدورة.')}b.closest('dialog').close();await page(root)};
}
async function editCycle(root,sc,cycle){
 const b=modal('تعديل الدورة الإشرافية');
 const initial=new Set(Array.isArray(cycle.teacher_ids)&&cycle.teacher_ids.length?cycle.teacher_ids:sc.teachers.filter(t=>!cycle.complex_id||t.complex_id===cycle.complex_id).map(t=>t.id));
 b.innerHTML='<form class="sv-form"><div class="form-grid">'+
 '<label>اسم الدورة<input name="name" required value="'+esc(cycle.name||'')+'"></label>'+
 '<label>المجمع'+selectHtml('complex',sc.complexes,cycle.complex_id||'','كل النطاق المتاح')+'</label>'+
 '<label>بداية الدورة<input name="start" type="date" value="'+esc(cycle.start_date||'')+'" required></label>'+
 '<label>نهاية الدورة<input name="end" type="date" value="'+esc(cycle.end_date||'')+'" required></label>'+
 '<label>بداية الزيارات يوميًا<input name="time" type="time" value="'+esc(String(cycle.daily_start||'16:30').slice(0,5))+'" required></label>'+
 '<label>مدة الزيارة بالدقائق<input name="duration" type="number" min="20" max="240" value="'+esc(cycle.visit_duration_minutes||50)+'" required></label>'+
 '<label>عدد الزيارات في اليوم<input name="daily" type="number" min="1" max="100" value="'+esc(cycle.visits_per_day||2)+'" required></label>'+
 '<label>عدد الزيارات لكل معلم<input name="perteacher" type="number" min="1" max="1000" value="'+esc(cycle.visits_per_teacher||1)+'" required></label>'+
 '<label>طريقة الجدولة<select name="mode"><option value="manual" '+(cycle.mode==='manual'?'selected':'')+'>يدوية</option><option value="auto" '+(cycle.mode==='auto'?'selected':'')+'>تلقائية</option></select></label></div>'+
 '<fieldset><legend>أيام الزيارة</legend><div class="sv-days">'+[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']].map(x=>'<label><input type="checkbox" name="wd'+x[0]+'" '+((cycle.weekdays||[]).map(Number).includes(Number(x[0]))?'checked':'')+'> '+x[1]+'</label>').join('')+'</div></fieldset>'+
 '<div data-capacity-note class="sv-capacity-note"></div>'+
 '<fieldset><legend>المعلمون المشمولون بالدورة</legend><div class="sv-teacher-pick" data-teacher-pick>'+sc.teachers.map(t=>'<label data-complex="'+esc(t.complex_id||'')+'"><input type="checkbox" name="teacher_ids" value="'+esc(t.id)+'" '+(initial.has(t.id)?'checked':'')+'> '+esc(t.full_name)+'</label>').join('')+'</div><p class="sl-help">احذف علامة الصح لإخراج المعلم من الدورة، أو فعّلها لإضافته. إعادة الجدولة تحفظ الزيارات المكتملة وتعيد بناء المواعيد المتبقية.</p></fieldset>'+
 '<label>ملاحظات<textarea name="notes" rows="3">'+esc(cycle.notes||'')+'</textarea></label>'+
 '<div class="sl-toolbar"><button class="button button-soft" type="button" data-save-only>حفظ التعديل فقط</button><button class="button button-primary" type="button" data-save-reschedule>حفظ وإعادة الجدولة التلقائية</button></div></form>';
 const form=b.querySelector('form');
 const filter=()=>{const cid=form.elements.complex.value;form.querySelectorAll('[data-teacher-pick] label').forEach(l=>{l.hidden=!!cid&&l.dataset.complex!==cid});refreshCapacity(form)};form.elements.complex.onchange=filter;filter();bindCapacity(form);
 const collect=()=>{const cap=refreshCapacity(form),teacherIds=[...form.querySelectorAll('[name="teacher_ids"]:checked')].filter(x=>!x.closest('label').hidden).map(x=>x.value);if(!form.elements.start.value||!form.elements.end.value||form.elements.end.value<form.elements.start.value)throw Error('تحقق من تاريخ بداية الدورة ونهايتها.');if(!teacherIds.length)throw Error('اختر معلمًا واحدًا على الأقل.');return{...cap,teacherIds}};
 const save=async(reschedule)=>{const data=collect();if(reschedule&&data.shortage>0){alert(capacityMessage(data));return}await res(sb().from('supervision_visit_cycles').update({name:form.elements.name.value.trim(),complex_id:form.elements.complex.value||null,start_date:form.elements.start.value,end_date:form.elements.end.value,weekdays:data.wds,daily_start:form.elements.time.value,visit_duration_minutes:Number(form.elements.duration.value),visits_per_day:Number(form.elements.daily.value),visits_per_teacher:Number(form.elements.perteacher.value),mode:form.elements.mode.value,notes:form.elements.notes.value.trim()||null,teacher_ids:data.teacherIds,updated_at:new Date().toISOString()}).eq('id',cycle.id).select('id').single());if(reschedule){const rr=await rpc('auto_schedule_supervision_cycle',{p_cycle_id:cycle.id});if(rr?.insufficient){alert(serverCapacityMessage(rr));return}alert('تم تحديث الدورة وإعادة جدولة '+rr.scheduled+' زيارة موزعة على الفترة المتبقية.')}b.closest('dialog').close();await page(root)};
 b.querySelector('[data-save-only]').onclick=()=>save(false).catch(e=>alert(e.message));
 b.querySelector('[data-save-reschedule]').onclick=()=>save(true).catch(e=>alert(e.message));
}
async function editVisit(root,visit,sc){
 const b=modal('تعديل / إعادة جدولة الزيارة');
 const dt=new Date(visit.scheduled_at),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(dt),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(dt);
 const teacherLocked=visit.status==='draft';
 b.innerHTML='<form><div class="form-grid"><label>المعلم'+selectHtml('teacher',sc.teachers.map(x=>({id:x.id,name:x.full_name})),visit.teacher_id)+'</label><label>التاريخ<input name="date" type="date" value="'+esc(date)+'" required></label><label>الوقت<input name="time" type="time" value="'+esc(time)+'" required></label><label>نوع الزيارة<select name="type"><option '+(visit.visit_type==='استطلاعية'?'selected':'')+'>استطلاعية</option><option '+(visit.visit_type==='توجيهية'?'selected':'')+'>توجيهية</option><option '+(visit.visit_type==='تقويمية'?'selected':'')+'>تقويمية</option></select></label></div>'+(teacherLocked?'<p class="sl-help">هذه الزيارة تحتوي مسودة؛ يمكن تغيير الموعد والنوع، أما تغيير المعلم فيلزم حذف المسودة وإنشاء زيارة جديدة حتى لا تنتقل بيانات التقييم إلى معلم آخر.</p>':'')+'<button class="button button-primary" type="submit">حفظ التعديل</button></form>';
 const form=b.querySelector('form');if(teacherLocked)form.elements.teacher.disabled=true;
 form.onsubmit=async e=>{
   e.preventDefault();
   const teacherId=teacherLocked?visit.teacher_id:form.elements.teacher.value,teacher=sc.teachers.find(x=>x.id===teacherId);
   if(!teacher)throw Error('اختر معلمًا صحيحًا.');
   const circle=sc.circles.find(x=>x.id===teacher.circle_id);
   if(!circle)throw Error('لا توجد حلقة نشطة مسندة لهذا المعلم.');
   const patch={scheduled_at:isoLocal(form.elements.date.value,form.elements.time.value),visit_type:form.elements.type.value,updated_at:new Date().toISOString()};
   if(!teacherLocked&&teacherId!==visit.teacher_id){
     Object.assign(patch,{teacher_id:teacherId,circle_id:circle.id,complex_id:teacher.complex_id||circle.complex_id,status:'scheduled',actual_started_at:null,teacher_profile_snapshot:{},circle_snapshot:{},overview_snapshot:{},scores:[],student_checks:[],score:null,percentage:null,rating:null,strengths:null,improvements:null,recommendations:null,proposals:null,treatment_plan:[],other_notes:null});
   }
   await res(sb().from('supervision_visits').update(patch).eq('id',visit.id).select('id').single());
   b.closest('dialog').close();await page(root);
 };
}
async function deleteVisit(root,visit){
 if(visit.status==='completed')throw Error('لا يحذف سجل زيارة مكتملة من شاشة الجدولة حفاظًا على السجل الإشرافي.');
 if(!confirm('سيتم حذف هذه الزيارة نهائيًا. هل تريد المتابعة؟'))return;
 await res(sb().from('supervision_visits').delete().eq('id',visit.id).in('status',['scheduled','draft']).select('id'));
 await page(root);
}
async function deleteTeacherVisits(root,visit,teacherName,allCycles=false){
 const scope=allCycles?'جميع الدورات':'هذه الدورة';
 if(!confirm('سيتم حذف جميع الزيارات غير المكتملة للمعلم «'+teacherName+'» في '+scope+'. الزيارات المكتملة ستبقى محفوظة. هل تريد المتابعة؟'))return;
 let q=sb().from('supervision_visits').delete().eq('teacher_id',visit.teacher_id).in('status',['scheduled','draft']);
 if(!allCycles)q=q.eq('cycle_id',visit.cycle_id);
 await res(q.select('id'));await page(root);
}
async function deleteCycleVisits(root,cycle){
 if(!confirm('سيتم حذف جميع المواعيد والمسودات غير المكتملة في هذه الدورة، مع إبقاء الزيارات المكتملة. هل تريد المتابعة؟'))return;
 await res(sb().from('supervision_visits').delete().eq('cycle_id',cycle.id).in('status',['scheduled','draft']).select('id'));
 await page(root);
}
async function manageVisit(root,visit,sc,teacherName,circleName){
 const b=modal('إدارة الزيارة');
 b.innerHTML='<div class="sv-manage-card"><b>'+esc(teacherName)+'</b><span>'+esc(circleName||'—')+'</span><span>'+esc(arDate(visit.scheduled_at))+' · '+esc(visit.visit_type)+' · '+esc(visit.status)+'</span></div><div class="sv-manage-actions">'+btn('تعديل / إعادة جدولة','mv-edit','button-primary')+btn('حذف هذه الزيارة','mv-delete')+btn('حذف زيارات المعلم في هذه الدورة','mv-delete-cycle')+btn('حذف جميع زيارات المعلم غير المكتملة','mv-delete-all')+'</div><p class="sl-help">الحذف الجماعي لا يمس الزيارات المكتملة أو نتائجها.</p>';
 action(b,'[data-sv-action="mv-edit"]',()=>{b.closest('dialog').close();return editVisit(root,visit,sc)});
 action(b,'[data-sv-action="mv-delete"]',()=>{b.closest('dialog').close();return deleteVisit(root,visit)});
 action(b,'[data-sv-action="mv-delete-cycle"]',()=>{b.closest('dialog').close();return deleteTeacherVisits(root,visit,teacherName,false)});
 action(b,'[data-sv-action="mv-delete-all"]',()=>{b.closest('dialog').close();return deleteTeacherVisits(root,visit,teacherName,true)});
}
async function manageCycle(root,cycle,sc){
 const b=modal('إدارة الدورة الإشرافية');
 const selected=Array.isArray(cycle.teacher_ids)&&cycle.teacher_ids.length?cycle.teacher_ids.length:'جميع معلمي النطاق';
 b.innerHTML='<div class="sv-manage-card"><b>'+esc(cycle.name)+'</b><span>'+esc(cycle.start_date)+' — '+esc(cycle.end_date)+'</span><span>المعلمون: '+esc(selected)+'</span></div><div class="sv-manage-actions">'+btn('تعديل الدورة والمعلمين','mc-edit','button-primary')+btn('إعادة الجدولة التلقائية','mc-auto')+btn('إضافة زيارة يدوية','mc-add')+btn('حذف المواعيد غير المكتملة','mc-clear')+'</div><p class="sl-help">عند تعديل قائمة المعلمين يمكنك اختيار «حفظ وإعادة الجدولة التلقائية» لإعادة توزيع المواعيد، مع إبقاء الزيارات المكتملة محفوظة.</p>';
 action(b,'[data-sv-action="mc-edit"]',()=>{b.closest('dialog').close();return editCycle(root,sc,cycle)});
 action(b,'[data-sv-action="mc-auto"]',()=>{b.closest('dialog').close();return autoSchedule(root,cycle.id)});
 action(b,'[data-sv-action="mc-add"]',()=>{b.closest('dialog').close();return manualVisit(root,sc,cycle.id)});
 action(b,'[data-sv-action="mc-clear"]',()=>{b.closest('dialog').close();return deleteCycleVisits(root,cycle)});
}
async function manualVisit(root,sc,cycleId=''){
 const cycles=await res(sb().from('supervision_visit_cycles').select('*').in('status',['draft','active']).order('start_date',{ascending:false}));
 if(!cycles.length)throw Error('أنشئ دورة إشرافية أولًا.');
 const b=modal('جدولة زيارة إشرافية يدويًا');
 b.innerHTML='<form><div class="form-grid"><label>الدورة'+selectHtml('cycle',cycles.map(x=>({id:x.id,name:x.name+' · '+x.start_date+' — '+x.end_date})),cycleId)+'</label><label>المعلم'+selectHtml('teacher',sc.teachers.map(x=>({id:x.id,name:x.full_name})))+'</label><label>تاريخ الزيارة<input name="date" type="date" value="'+tomorrow()+'" required></label><label>الوقت<input name="time" type="time" value="16:30" required></label><label>نوع الزيارة<select name="type"><option>استطلاعية</option><option selected>توجيهية</option><option>تقويمية</option></select></label></div><button class="button button-primary" type="submit">حفظ الموعد</button></form>';
 const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();if(!form.elements.cycle.value||!form.elements.teacher.value)throw Error('اختر الدورة والمعلم.');await rpc('create_supervision_visit',{p_cycle_id:form.elements.cycle.value,p_teacher_id:form.elements.teacher.value,p_scheduled_at:isoLocal(form.elements.date.value,form.elements.time.value),p_visit_type:form.elements.type.value});b.closest('dialog').close();await page(root)};
}
async function autoSchedule(root,id){
 if(!confirm('سيعيد النظام توزيع المواعيد غير المكتملة على الفترة المتبقية من الدورة، مع إبقاء الزيارات المكتملة. هل تريد المتابعة؟'))return;
 const r=await rpc('auto_schedule_supervision_cycle',{p_cycle_id:id});
 if(r?.insufficient){alert(serverCapacityMessage(r));return}
 alert('تمت الجدولة بنجاح: '+r.scheduled+' زيارة موزعة على '+r.availableDays+' يوم زيارة. السعة المتاحة: '+r.capacity+'.');await page(root)
}

async function openVisit(root,visit,sc){
 const teacher=sc.teachers.find(x=>x.id===visit.teacher_id)||await res(sb().from('teachers').select('*').eq('id',visit.teacher_id).single());
 const circle=sc.circles.find(x=>x.id===visit.circle_id)||null;
 if(!circle)throw Error('لم تعد الحلقة المسندة للمعلم موجودة.');
 const analytics=await circleAnalytics(circle.id);
 const latest=analytics.stats||{};
 if(visit.status==='scheduled')await res(sb().from('supervision_visits').update({status:'draft',actual_started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',visit.id).select('id'));
 const b=modal('استمارة قياس أداء معلم القرآن');
 const previousScores=Object.fromEntries((visit.scores||[]).map(x=>[x.id,String(x.observedScore??x.score??'')]));
 const previousReasons=Object.fromEntries((visit.scores||[]).map(x=>[x.id,String(x.nonExecutionReason||'')]));
 const previousStudents=visit.student_checks||[];
 const studentOpts=analytics.students.map(s=>({id:s.id,name:s.full_name}));
 const first18=ITEMS.slice(0,18);
 b.innerHTML='<form class="sv-visit-form">'+
 '<section class="sv-form-hero"><div><span>الزيارة الإشرافية رقم '+esc(visit.visit_number)+'</span><h2>'+esc(teacher.full_name)+'</h2><p>'+esc(circle.name)+' · '+esc(dayDate(visit.scheduled_at))+'</p></div><div class="sv-live-score"><span>الدرجة</span><b data-live-score>0 / 100</b><small data-live-rating>—</small></div></section>'+
 '<h3>البيانات الأساسية للمعلم</h3><div class="form-grid"><label>الاسم<input value="'+esc(teacher.full_name)+'" disabled></label><label>الجوال<input name="phone" value="'+esc(teacher.phone||'')+'"></label><label>الجنسية<input name="nationality" value="'+esc(teacher.nationality||'')+'"></label><label>المؤهل<input name="qualification" value="'+esc(teacher.qualification||'')+'"></label><label>المسمى الوظيفي<input name="job_title" value="'+esc(teacher.job_title||'')+'"></label><label>رقم الرخصة<input name="license_number" value="'+esc(teacher.license_number||'')+'"></label><label>نوع الزيارة<select name="visit_type"><option '+(visit.visit_type==='استطلاعية'?'selected':'')+'>استطلاعية</option><option '+(visit.visit_type==='توجيهية'?'selected':'')+'>توجيهية</option><option '+(visit.visit_type==='تقويمية'?'selected':'')+'>تقويمية</option></select></label><label>نشاط المعلم<input name="activity" value="'+esc(visit.teacher_activity||'')+'"></label></div><label>ملاحظات تلاوة المعلم<textarea name="recitation" rows="3">'+esc(visit.teacher_recitation||'')+'</textarea></label>'+
 '<h3>بيانات الحلقة المستدعاة من المنصة</h3>'+analyticsCard(analytics)+'<p class="sl-help">تصنيف الأعلى والأقل حفظًا هنا مبني على الحصائل اليومية المسجلة للطالب داخل الحلقة، ويظهر «لا توجد بيانات كافية» إذا لم تبدأ الحصيلة الفعلية بعد.</p>'+
 '<h3>بنود تقويم المعلم</h3><div class="sv-rating-note"><b>سلم التقدير:</b> 5 متميز، 4 متحقق، 3 مقبول، 2 جزئي، 1 ضعيف، 0 لم ينفذ.</div>'+
 '<div class="table-wrap"><table class="sv-eval-table"><thead><tr><th>#</th><th>المجال</th><th>المهارة</th><th>المؤشر</th><th>الدرجة</th><th>سبب عدم التنفيذ</th></tr></thead><tbody>'+first18.map((x,i)=>'<tr><td>'+esc(i+1)+'</td><td>'+esc(x.section)+'</td><td>'+esc(x.skill)+'</td><td>'+esc(x.indicator)+'</td><td>'+ratingSelect(x.id,previousScores[x.id])+'</td><td>'+nonExecReasonSelect(x.id,previousReasons[x.id])+'</td></tr>').join('')+'</tbody></table></div>'+
 '<p class="sl-help">إذا اخترت «لم ينفذ» فحدّد سبب عدم التنفيذ.</p>'+
 '<h3>قياس مستوى طالبين من الحلقة</h3><p class="sl-help">اختر الطالب؛ سيظهر آخر موضع وصل إليه في الحصيلة اليومية قبل وضع درجة القياس.</p>'+
 '<div class="sv-student-checks">'+[0,1].map((slot)=>{
   const old=previousStudents[slot]||{};return '<article class="sv-student-check"><h4>النموذج '+(slot+1)+'</h4><label>الطالب'+selectHtml('student_'+slot,studentOpts,old.studentId)+'</label><div class="sv-student-progress" data-student-progress="'+slot+'">اختر الطالب لعرض آخر حصيلة.</div><label>درجة قياس الحفظ والتجويد'+ratingSelect(slot===0?'t19':'t20',previousScores[slot===0?'t19':'t20']||old.score)+'</label><label>ملاحظات المستوى<textarea name="student_note_'+slot+'" rows="3">'+esc(old.note||'')+'</textarea></label></article>'
 }).join('')+'</div>'+
 '<div class="sv-builder-head"><h3>التغذية الراجعة والخطة العلاجية</h3>'+btn('استخراج التحليل آليًا','auto-analysis','button-primary')+'</div><p class="sl-help">يقرأ النظام درجات بنود التقويم المسجلة ويقترح نقاط القوة وأولويات التحسين والتوصيات والمقترحات وخطة علاجية قابلة للتحرير قبل الاعتماد.</p><div class="form-grid"><label>نقاط القوة<textarea name="strengths" rows="4">'+esc(visit.strengths||'')+'</textarea></label><label>أولويات التحسين<textarea name="improvements" rows="4">'+esc(visit.improvements||'')+'</textarea></label></div><label>التوصيات<textarea name="recommendations" rows="4">'+esc(visit.recommendations||'')+'</textarea></label><label>المقترحات<textarea name="proposals" rows="4">'+esc(visit.proposals||'')+'</textarea></label>'+
 '<div class="sv-builder-head"><h4>خطة المتابعة والعلاج</h4>'+btn('إضافة إجراء','add-treatment')+'</div><div data-treatment-list></div>'+
 '<label>ملاحظات أخرى<textarea name="other_notes" rows="3">'+esc(visit.other_notes||'')+'</textarea></label>'+
 '<div class="sl-toolbar">'+btn('حفظ مسودة','save-draft')+btn('اعتماد الزيارة','save-final','button-primary')+'</div></form>';
 const form=b.querySelector('form'),treat=b.querySelector('[data-treatment-list]');
 const oldPlan=Array.isArray(visit.treatment_plan)&&visit.treatment_plan.length?visit.treatment_plan:[{action:'',owner:'المعلم',dueDate:'',priority:'متوسطة',status:'مفتوحة'}];
 const addTreatment=x=>{const i=treat.children.length,d=document.createElement('div');d.className='sv-treatment-row';d.dataset.idx=i;d.innerHTML='<input name="tr_action_'+i+'" placeholder="الإجراء العلاجي / المتابعة" value="'+esc(x?.action||'')+'"><input name="tr_owner_'+i+'" placeholder="المسؤول" value="'+esc(x?.owner||'المعلم')+'"><input name="tr_due_'+i+'" type="date" value="'+esc(x?.dueDate||'')+'"><select name="tr_priority_'+i+'"><option '+(x?.priority==='عالية'?'selected':'')+'>عالية</option><option '+(!x?.priority||x?.priority==='متوسطة'?'selected':'')+'>متوسطة</option><option '+(x?.priority==='منخفضة'?'selected':'')+'>منخفضة</option></select><select name="tr_status_'+i+'"><option '+(!x?.status||x?.status==='مفتوحة'?'selected':'')+'>مفتوحة</option><option '+(x?.status==='قيد التنفيذ'?'selected':'')+'>قيد التنفيذ</option><option '+(x?.status==='مغلقة'?'selected':'')+'>مغلقة</option></select><button type="button" class="button button-soft" data-remove-treatment>حذف</button>';treat.appendChild(d);d.querySelector('[data-remove-treatment]').onclick=()=>d.remove()};
 oldPlan.forEach(addTreatment);action(b,'[data-sv-action="add-treatment"]',()=>addTreatment({}));
 const refreshStudent=slot=>{const id=form.querySelector('[name="student_'+slot+'"]').value,el=b.querySelector('[data-student-progress="'+slot+'"]'),st=analytics.students.find(x=>x.id===id),x=id?latest[id]:null;if(!st){el.textContent='اختر الطالب لعرض آخر حصيلة.';return}el.innerHTML='<b>'+esc(st.full_name)+'</b><br>المستوى: '+esc(st.memorization_level||st.stage||'—')+'<br>آخر درس في الحصيلة: '+esc(x?.latest?.new_lesson||'لا توجد حصيلة مسجلة')+(x?.latest?.date_key?' · '+esc(x.latest.date_key):'')+'<br>عدد الحصائل المرصودة: '+esc(x?.days||0)};
 [0,1].forEach(i=>{form.querySelector('[name="student_'+i+'"]').onchange=()=>refreshStudent(i);refreshStudent(i)});
 const updateReasonState=id=>{
   const scoreEl=form.querySelector('[name="score_'+id+'"]'),reasonEl=form.querySelector('[name="reason_'+id+'"]');
   if(!scoreEl||!reasonEl)return;
   const active=scoreEl.value==='0';
   reasonEl.disabled=!active;
   reasonEl.closest('td')?.classList.toggle('sv-reason-active',active);
   if(!active)reasonEl.value='';
 };
 const calc=()=>{
   let total=0,n=0;
   b.querySelectorAll('[data-score-item]').forEach(s=>{
     if(s.value==='')return;
     const id=s.dataset.scoreItem,reason=form.querySelector('[name="reason_'+id+'"]')?.value||'';
     const eff=effectiveScore(s.value,reason);
     if(eff!==null){total+=eff;n++}
   });
   b.querySelector('[data-live-score]').textContent=total+' / 100';
   b.querySelector('[data-live-rating]').textContent=n===20?gradeRate(total):'مكتمل '+n+' من 20';
 };
 first18.forEach(x=>updateReasonState(x.id));
 b.querySelectorAll('[data-score-item]').forEach(s=>s.onchange=()=>{updateReasonState(s.dataset.scoreItem);calc()});
 b.querySelectorAll('[data-nonexec-reason]').forEach(s=>s.onchange=calc);
 calc();
 const autoAnalysis=()=>{
   const evaluated=ITEMS.slice(0,18).map(x=>{
     const raw=form.querySelector('[name="score_'+x.id+'"]').value,reason=form.querySelector('[name="reason_'+x.id+'"]')?.value||'';
     return {...x,observedScore:raw===''?null:Number(raw),nonExecutionReason:reason,score:effectiveScore(raw,reason),exempt:Number(raw)===0&&isExemptReason(reason)};
   }).filter(x=>x.score!==null&&!x.exempt);
   if(!evaluated.length)throw Error('قيّم بنود المعلم أولًا ثم استخدم الاستخراج الآلي.');
   const hasText=[form.elements.strengths.value,form.elements.improvements.value,form.elements.recommendations.value,form.elements.proposals.value].some(x=>x.trim())||[...treat.querySelectorAll('[name^="tr_action_"]')].some(x=>x.value.trim());
   if(hasText&&!confirm('سيستبدل الاستخراج الآلي النصوص والخطة العلاجية الحالية بمقترحات مشتقة من الدرجات. هل تريد المتابعة؟'))return;
   const high=[...evaluated].filter(x=>x.score>=4).sort((a,b)=>b.score-a.score).slice(0,5);
   const low=[...evaluated].filter(x=>x.score<4).sort((a,b)=>a.score-b.score).slice(0,5);
   const weakest=low.length?low:[...evaluated].sort((a,b)=>a.score-b.score).slice(0,3);
   form.elements.strengths.value=high.length
     ?high.map(x=>'• '+strengthSentence(x)).join('\n')
     :'لم تتضح بعد نقاط قوة بدرجة كافية من البنود المقيمة؛ يُستحسن استكمال الملاحظة المباشرة قبل اعتماد التحليل.';
   form.elements.improvements.value=weakest.length
     ?weakest.map(x=>'• '+improvementSentence(x)).join('\n')
     :'أظهر الأداء استقرارًا عامًا، ولا توجد أولوية تحسين بارزة تستدعي إجراءً عاجلًا في الوقت الحالي.';
   form.elements.recommendations.value=weakest.length
     ?weakest.map(recommendationSentence).join('\n')
     :'الاستمرار على الممارسات الحالية، مع المحافظة على المتابعة الدورية وتوثيق جوانب التميز.';
   const bySection={};weakest.forEach(x=>(bySection[x.section]||(bySection[x.section]=[])).push(analysisFocus(x)));
   form.elements.proposals.value=Object.entries(bySection).map(([section,focuses],i)=>(i+1)+'. تخصيص متابعة مركزة في مجال «'+section+'» لتعزيز '+[...new Set(focuses)].join('، ')+'، ثم مقارنة أثر التحسين في الزيارة التالية.').join('\n');
   treat.innerHTML='';
   const dueDate=(()=>{const d=new Date(Date.now()+14*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)})();
   weakest.slice(0,3).forEach(x=>addTreatment({
     action:(Number(x.score)<=1?'تطبيق خطة علاجية مباشرة لتطوير ':'تدريب عملي ومتابعة تحسين ')+analysisFocus(x),
     owner:'المعلم',dueDate,priority:x.score<=2?'عالية':'متوسطة',status:'مفتوحة'
   }));
 };
 action(b,'[data-sv-action="auto-analysis"]',autoAnalysis);
 const collect=async(final)=>{
   const missingReason=ITEMS.slice(0,18).find(x=>form.querySelector('[name="score_'+x.id+'"]').value==='0'&&!form.querySelector('[name="reason_'+x.id+'"]')?.value);
   if(missingReason)throw Error('حدّد سبب عدم التنفيذ في بند «'+missingReason.skill+'» قبل الحفظ.');
   const scores=ITEMS.map(x=>{
     const raw=form.querySelector('[name="score_'+x.id+'"]').value,reason=form.querySelector('[name="reason_'+x.id+'"]')?.value||'';
     const observed=raw===''?null:Number(raw);
     return {id:x.id,section:x.section,skill:x.skill,indicator:x.indicator,observedScore:observed,nonExecutionReason:reason||null,score:effectiveScore(raw,reason)};
   });
   const studentChecks=[0,1].map(i=>{const sid=form.querySelector('[name="student_'+i+'"]').value,st=analytics.students.find(x=>x.id===sid),score=form.querySelector('[name="score_'+(i===0?'t19':'t20')+'"]').value;return{slot:i+1,studentId:sid||null,studentName:st?.full_name||null,score:score===''?null:Number(score),note:form.querySelector('[name="student_note_'+i+'"]').value.trim()||null,latestOutcome:sid?latest[sid]?.latest||null:null}});
   if(final&&(studentChecks.some(x=>!x.studentId)))throw Error('اختر طالبين لقياس المستوى قبل اعتماد الزيارة.');
   const plan=[...treat.querySelectorAll('.sv-treatment-row')].map(d=>{const i=d.dataset.idx;return{action:form.querySelector('[name="tr_action_'+i+'"]')?.value.trim()||'',owner:form.querySelector('[name="tr_owner_'+i+'"]')?.value.trim()||'',dueDate:form.querySelector('[name="tr_due_'+i+'"]')?.value||'',priority:form.querySelector('[name="tr_priority_'+i+'"]')?.value||'متوسطة',status:form.querySelector('[name="tr_status_'+i+'"]')?.value||'مفتوحة'}}).filter(x=>x.action);
   await res(sb().from('teachers').update({phone:form.elements.phone.value.trim()||null,nationality:form.elements.nationality.value.trim()||null,qualification:form.elements.qualification.value.trim()||null,job_title:form.elements.job_title.value.trim()||null,license_number:form.elements.license_number.value.trim()||null,updated_at:new Date().toISOString()}).eq('id',teacher.id).select('id'));
   await res(sb().from('supervision_visits').update({teacher_profile_snapshot:{fullName:teacher.full_name,phone:form.elements.phone.value,nationality:form.elements.nationality.value,qualification:form.elements.qualification.value,jobTitle:form.elements.job_title.value,licenseNumber:form.elements.license_number.value},circle_snapshot:{id:circle.id,name:circle.name,type:circle.circle_type,period:circle.session_period},overview_snapshot:analytics,updated_at:new Date().toISOString()}).eq('id',visit.id).select('id'));
   const rr=await rpc('save_supervision_visit',{p_visit_id:visit.id,p_visit_type:form.elements.visit_type.value,p_teacher_activity:form.elements.activity.value.trim()||null,p_teacher_recitation:form.elements.recitation.value.trim()||null,p_scores:scores,p_student_checks:studentChecks,p_strengths:form.elements.strengths.value.trim()||null,p_improvements:form.elements.improvements.value.trim()||null,p_recommendations:form.elements.recommendations.value.trim()||null,p_treatment_plan:plan,p_other_notes:form.elements.other_notes.value.trim()||null,p_final:!!final,p_license_status:form.elements.license_number.value.trim()?'نعم':'لا',p_license_number:form.elements.license_number.value.trim()||null});
   await res(sb().from('supervision_visits').update({proposals:form.elements.proposals.value.trim()||null,updated_at:new Date().toISOString()}).eq('id',visit.id).select('id'));
   alert(final?'تم اعتماد الزيارة بدرجة '+rr.score+' / 100 — '+rr.rating:'تم حفظ مسودة الزيارة.');b.closest('dialog').close();await page(root)
 };
 action(b,'[data-sv-action="save-draft"]',()=>collect(false));action(b,'[data-sv-action="save-final"]',()=>collect(true));
}

async function showVisitResult(v,sc){
 const teacher=sc.teachers.find(x=>x.id===v.teacher_id),circle=sc.circles.find(x=>x.id===v.circle_id),b=modal('نتيجة الزيارة الإشرافية');
 const rows=(v.scores||[]).map(x=>{
   const reason=reasonLabel(x.nonExecutionReason);
   const note=x.observedScore===0&&reason?(reason+(isExemptReason(x.nonExecutionReason)?' — احتسبت كاملة':' — خُصمت')):'—';
   return [x.id,x.skill||'',x.indicator||'',x.score??'—',note];
 });
 const students=(v.student_checks||[]).map(x=>[x.studentName||'—',x.latestOutcome?.new_lesson||'—',x.score??'—',x.note||'—']);
 b.innerHTML='<div class="sv-result-hero"><div><h2>'+esc(teacher?.full_name||v.teacher_profile_snapshot?.fullName||'المعلم')+'</h2><p>'+esc(circle?.name||v.circle_snapshot?.name||'')+' · '+esc(arDate(v.scheduled_at))+'</p></div><div><b style="color:'+scoreColor(v.score)+'">'+esc(v.score??0)+'/100</b><span>'+esc(v.rating||'—')+'</span></div></div>'+
 '<div class="stats-grid"><article class="stat-card"><span>نوع الزيارة</span><b>'+esc(v.visit_type)+'</b></article><article class="stat-card"><span>رقم الزيارة</span><b>'+esc(v.visit_number)+'</b></article><article class="stat-card"><span>الحالة</span><b>'+esc(v.status)+'</b></article></div>'+
 '<h3>نقاط القوة</h3><div class="sv-readbox">'+esc(cleanGeneratedAnalysis(v.strengths)||'—')+'</div><h3>أولويات التحسين</h3><div class="sv-readbox">'+esc(cleanGeneratedAnalysis(v.improvements)||'—')+'</div><h3>التوصيات</h3><div class="sv-readbox">'+esc(cleanGeneratedAnalysis(v.recommendations)||'—')+'</div><h3>المقترحات</h3><div class="sv-readbox">'+esc(cleanGeneratedAnalysis(v.proposals)||'—')+'</div>'+
 '<h3>تقييم البنود</h3><div class="table-wrap"><table><thead><tr><th>الرمز</th><th>المهارة</th><th>المؤشر</th><th>الدرجة المحتسبة</th><th>بيان عدم التنفيذ</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<h3>الطالبان المختبران</h3><div class="table-wrap"><table><thead><tr><th>الطالب</th><th>آخر درس</th><th>الدرجة</th><th>الملاحظات</th></tr></thead><tbody>'+students.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
 '<h3>الخطة العلاجية</h3><div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>المسؤول</th><th>الموعد</th><th>الأولوية</th><th>الحالة</th></tr></thead><tbody>'+(v.treatment_plan||[]).map(x=>'<tr><td>'+esc(x.action)+'</td><td>'+esc(x.owner)+'</td><td>'+esc(x.dueDate)+'</td><td>'+esc(x.priority)+'</td><td>'+esc(x.status)+'</td></tr>').join('')+'</tbody></table></div>'+
 '<div class="sl-toolbar">'+btn('طباعة الاستمارة','print-result')+'</div>';
 action(b,'[data-sv-action="print-result"]',async()=>{
   const tpl=await getTemplate(v.org_id,v.complex_id,'supervision')||await getTemplate(v.org_id,v.complex_id,'report');
   const meta='<div class="sv-grid"><div class="sv-box"><span>المعلم</span><b>'+esc(teacher?.full_name||v.teacher_profile_snapshot?.fullName||'')+'</b></div><div class="sv-box"><span>الحلقة</span><b>'+esc(circle?.name||v.circle_snapshot?.name||'')+'</b></div><div class="sv-box"><span>موعد الزيارة</span><b>'+esc(arDate(v.scheduled_at))+'</b></div><div class="sv-box"><span>نوع الزيارة</span><b>'+esc(v.visit_type)+'</b></div><div class="sv-box"><span>النتيجة</span><b class="sv-score">'+esc(v.score)+'/100</b></div><div class="sv-box"><span>التقدير</span><b>'+esc(v.rating)+'</b></div></div>';
   const shtml='<section class="sv-section"><h2>نتيجة بنود التقييم</h2><table class="sv-table"><thead><tr><th>#</th><th>المهارة</th><th>المؤشر</th><th>الدرجة المحتسبة</th><th>بيان عدم التنفيذ</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></section>';
   const note='<section class="sv-section"><h2>نقاط القوة</h2><div class="sv-note">'+esc(cleanGeneratedAnalysis(v.strengths)||'—')+'</div><h2>أولويات التحسين</h2><div class="sv-note">'+esc(cleanGeneratedAnalysis(v.improvements)||'—')+'</div><h2>التوصيات</h2><div class="sv-note">'+esc(cleanGeneratedAnalysis(v.recommendations)||'—')+'</div><h2>المقترحات</h2><div class="sv-note">'+esc(cleanGeneratedAnalysis(v.proposals)||'—')+'</div></section><div class="sv-signatures"><div>المعلم/ـة</div><div>مدير الجهة</div><div>المشرف المقيِّم</div></div>';
   printShell('استمارة قياس أداء معلم القرآن',meta+shtml+note,tpl?.public_url||'',true)
 });
}

async function templatesPanel(root,sc,a){
 const b=modal('قوالب التقارير والشهادات');
 const allowedComplexes=sc.complexes.filter(x=>a.roles.includes('admin')||!a.complexIds?.length||a.complexIds.includes(x.id));
 const load=async()=>{
   const data=await res(sb().from('document_templates').select('*').eq('org_id',a.org_id).eq('active',true).order('created_at',{ascending:false}));
   b.innerHTML='<p class="sl-help">ارفع صورة PNG/JPG/WEBP للكليشة. سيستخدمها النظام خلفية للتقارير أو الزيارات أو الشهادات ضمن المجمع المحدد.</p><form><div class="form-grid"><label>المجمع'+selectHtml('complex',allowedComplexes,'','قالب عام للمؤسسة')+'</label><label>نوع القالب<select name="type"><option value="report">التقارير العامة</option><option value="supervision">الزيارات الإشرافية</option><option value="certificate">الشهادات</option></select></label><label>اسم القالب<input name="name" required placeholder="كليشة المجمع"></label><label>ملف القالب<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required></label></div><button class="button button-primary" type="submit">رفع واعتماد القالب</button></form><h3>القوالب النشطة</h3><div class="sv-template-grid">'+(data.length?data.map((x,i)=>'<article><img src="'+esc(x.public_url)+'"><b>'+esc(x.name)+'</b><span>'+esc(x.template_type)+' · '+esc(sc.complexes.find(c=>c.id===x.complex_id)?.name||'عام')+'</span>'+btn('إيقاف','disable-'+i)+'</article>').join(''):'<p>لا توجد قوالب مرفوعة بعد.</p>')+'</div><div class="sl-toolbar">'+btn('إصدار شهادة','certificate')+'</div>';
   const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const file=form.elements.file.files?.[0];if(!file)throw Error('اختر صورة القالب.');if(file.size>10*1024*1024)throw Error('حجم القالب يتجاوز 10MB.');const complex=form.elements.complex.value||null,type=form.elements.type.value,path=a.org_id+'/'+(complex||'org')+'/'+type+'/'+Date.now()+'-'+safeName(file.name);await res(sb().storage.from('sanabil-templates').upload(path,file,{upsert:false,contentType:file.type}));const pub=sb().storage.from('sanabil-templates').getPublicUrl(path).data.publicUrl;let q=sb().from('document_templates').update({active:false,updated_at:new Date().toISOString()}).eq('org_id',a.org_id).eq('template_type',type).eq('active',true);q=complex?q.eq('complex_id',complex):q.is('complex_id',null);await res(q.select('id'));await res(sb().from('document_templates').insert({org_id:a.org_id,complex_id:complex,template_type:type,name:form.elements.name.value.trim(),storage_path:path,public_url:pub,mime_type:file.type,active:true}).select('id'));alert('تم اعتماد القالب.');await load()};
   data.forEach((x,i)=>action(b,'[data-sv-action="disable-'+i+'"]',async()=>{await res(sb().from('document_templates').update({active:false,updated_at:new Date().toISOString()}).eq('id',x.id).select('id'));await load()}));
   action(b,'[data-sv-action="certificate"]',()=>certificateDialog(a,sc))
 };
 await load()
}
async function certificateDialog(a,sc){
 const b=modal('إصدار شهادة');
 b.innerHTML='<form><div class="form-grid"><label>المجمع'+selectHtml('complex',sc.complexes,a.complexIds?.[0]||'','قالب المؤسسة')+'</label><label>اسم المستفيد<input name="recipient" required></label><label>عنوان الشهادة<input name="title" value="شهادة شكر وتقدير" required></label><label>التاريخ<input name="date" type="date" value="'+today()+'" required></label></div><label>نص الشهادة<textarea name="body" rows="5" required>تقديرًا للجهود المباركة والعطاء المتميز، سائلين الله مزيدًا من التوفيق والسداد.</textarea></label><button class="button button-primary" type="submit">معاينة وطباعة</button></form>';
 const form=b.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const tpl=await getTemplate(a.org_id,form.elements.complex.value||null,'certificate');const body='<div style="height:235mm;display:grid;place-items:center;text-align:center;padding:20mm"><div><h1 style="font-size:34px;color:#073c34">'+esc(form.elements.title.value)+'</h1><h2 style="font-size:29px;color:#00808a">'+esc(form.elements.recipient.value)+'</h2><p style="font-size:19px;line-height:2.2;max-width:150mm">'+esc(form.elements.body.value)+'</p><p>'+esc(form.elements.date.value)+'</p></div></div>';printShell(form.elements.title.value,body,tpl?.public_url||'',true)}
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
 const a=await access(),roles=a.roles||[],isTeacher=roles.includes('teacher')&&!roles.some(x=>['admin','manager','supervisor'].includes(x)),canManage=roles.some(x=>['admin','manager','supervisor'].includes(x)),canTemplates=roles.some(x=>['admin','manager'].includes(x)),sc=await scopes();
 root.innerHTML='<div class="sv-page-head"><div><span class="sl-kicker">الحصيلة الإشرافية</span><h2>الزيارات الإشرافية</h2><p>تخطيط الدورات، جدولة الزيارات، استمارة التقييم، التغذية الراجعة، وخطط التحسين في مسار واحد.</p></div><div class="sl-toolbar">'+(canManage?btn('دورة إشرافية جديدة','new-cycle')+btn('زيارة يدوية','manual-visit'):'')+(canTemplates?btn('قوالب التقارير والشهادات','templates'):'')+'</div></div><div data-sv-main><p>جارٍ تحميل الزيارات…</p></div>';
 if(canManage){action(root,'[data-sv-action="new-cycle"]',()=>createCycle(root,sc));action(root,'[data-sv-action="manual-visit"]',()=>manualVisit(root,sc))}if(canTemplates)action(root,'[data-sv-action="templates"]',()=>templatesPanel(root,sc,a))
 const main=root.querySelector('[data-sv-main]');
 const [cycles,visits]=await Promise.all([
   canManage?res(sb().from('supervision_visit_cycles').select('*').order('start_date',{ascending:false}).limit(50)):Promise.resolve([]),
   res(sb().from('supervision_visits').select('*').order('scheduled_at',{ascending:false}).limit(500))
 ]);
 const tm=Object.fromEntries(sc.teachers.map(x=>[x.id,x.full_name])),cm=Object.fromEntries(sc.circles.map(x=>[x.id,x.name]));
 const upcoming=visits.filter(x=>['scheduled','draft'].includes(x.status)).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))),done=visits.filter(x=>x.status==='completed');
 const teacherSummary=isTeacher&&done.length?(()=>{const scores=done.map(x=>Number(x.score)).filter(Number.isFinite),avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:0,latest=done[0],first=done[done.length-1],delta=scores.length>1?Math.round((Number(latest.score||0)-Number(first.score||0))*10)/10:0;return '<section class="sv-panel"><h3>الحصيلة الإشرافية العامة</h3><div class="stats-grid"><article class="stat-card"><span>عدد الزيارات المكتملة</span><b>'+done.length+'</b></article><article class="stat-card"><span>متوسط التقييم</span><b>'+avg+'/100</b></article><article class="stat-card"><span>آخر تقييم</span><b>'+esc(latest.score??'—')+'</b></article><article class="stat-card"><span>التغير منذ أول زيارة</span><b>'+(delta>0?'+':'')+delta+'</b></article></div><div class="form-grid"><div class="sv-readbox"><b>أحدث نقاط القوة</b><br>'+esc(latest.strengths||'—')+'</div><div class="sv-readbox"><b>أحدث أولويات التحسين</b><br>'+esc(latest.improvements||'—')+'</div></div></section>'})():'';
 main.innerHTML=teacherSummary+(canManage?'<section class="sv-panel"><div class="sv-builder-head"><h3>الدورات الإشرافية</h3></div>'+(cycles.length?'<div class="table-wrap"><table><thead><tr><th>الدورة</th><th>الفترة</th><th>النمط</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>'+cycles.map((x,i)=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.start_date)+' — '+esc(x.end_date)+'</td><td>'+esc(x.mode==='auto'?'تلقائية':'يدوية')+'</td><td>'+esc(x.status)+'</td><td><div class="sv-actions">'+btn('إدارة الدورة','manage-cycle-'+i,'button-primary')+btn('إضافة زيارة','manual-'+i)+'</div></td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد دورة إشرافية بعد.</p>')+'</section>':'')+
 '<section class="sv-panel"><h3>الزيارات القادمة</h3>'+(upcoming.length?'<div class="table-wrap"><table><thead><tr><th>المعلم</th><th>الحلقة</th><th>الموعد</th><th>النوع</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>'+upcoming.map((v,i)=>'<tr><td>'+esc(tm[v.teacher_id]||v.teacher_id)+'</td><td>'+esc(cm[v.circle_id]||'—')+'</td><td>'+esc(arDate(v.scheduled_at))+'</td><td>'+esc(v.visit_type)+'</td><td>'+esc(v.status)+'</td><td><div class="sv-actions">'+(canManage?btn('فتح الاستمارة','open-'+i,'button-primary')+btn('إدارة','manage-'+i):'<span class="status">موعد قادم</span>')+'</div></td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد زيارات قادمة.</p>')+'</section>'+
 '<section class="sv-panel"><h3>الزيارات المكتملة</h3>'+(done.length?'<div class="table-wrap"><table><thead><tr><th>المعلم</th><th>التاريخ</th><th>الدرجة</th><th>التقدير</th><th>النتيجة</th></tr></thead><tbody>'+done.map((v,i)=>'<tr><td>'+esc(tm[v.teacher_id]||v.teacher_profile_snapshot?.fullName||'')+'</td><td>'+esc(arDate(v.scheduled_at))+'</td><td><b>'+esc(v.score??'—')+'</b></td><td>'+esc(v.rating||'—')+'</td><td>'+btn('عرض الاستمارة','result-'+i)+'</td></tr>').join('')+'</tbody></table></div>':'<p>لا توجد زيارات مكتملة بعد.</p>')+'</section>';
 if(canManage)cycles.forEach((x,i)=>{action(main,'[data-sv-action="manage-cycle-'+i+'"]',()=>manageCycle(root,x,sc));action(main,'[data-sv-action="manual-'+i+'"]',()=>manualVisit(root,sc,x.id))});
 if(canManage)upcoming.forEach((v,i)=>{action(main,'[data-sv-action="open-'+i+'"]',()=>openVisit(root,v,sc));action(main,'[data-sv-action="manage-'+i+'"]',()=>manageVisit(root,v,sc,tm[v.teacher_id]||v.teacher_id,cm[v.circle_id]||'—'))});
 done.forEach((v,i)=>action(main,'[data-sv-action="result-'+i+'"]',()=>showVisitResult(v,sc)));
}

const style=document.createElement('style');style.textContent='.sv-page-head,.sv-form-hero,.sv-result-hero,.sv-builder-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.sv-page-head{background:linear-gradient(135deg,#073c34,#08776d);color:white;border-radius:20px;padding:20px;margin-bottom:16px}.sv-page-head h2{margin:5px 0}.sv-panel{border:1px solid #dce6e1;border-radius:18px;padding:16px;margin:14px 0;background:#fbfdfc}.sv-form-hero{background:linear-gradient(135deg,#073c34,#00808a);color:white;border-radius:18px;padding:18px;margin-bottom:15px}.sv-live-score{text-align:center;background:#ffffff14;border:1px solid #d8bd88aa;border-radius:14px;padding:10px 18px;min-width:150px}.sv-live-score span{color:#fff;font-weight:700}.sv-live-score b{font-size:32px;display:block;color:#d8bd88!important;font-weight:800;direction:ltr;unicode-bidi:isolate;line-height:1.25;text-shadow:0 1px 0 #00000022}.sv-live-score small{display:block;color:#fff;font-weight:700}.sv-analytics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px}.sv-analytics article{border:1px solid #dfe8e3;background:#f7faf8;border-radius:12px;padding:10px}.sv-analytics span{font-size:11px;color:#667a72;display:block}.sv-analytics b{font-size:14px}.sv-rating-note{background:#fff8e7;border:1px solid #e6d19c;border-radius:11px;padding:10px;margin:10px 0}.sv-eval-table select{min-width:120px}.sv-eval-table [data-nonexec-reason]{min-width:220px;opacity:.55;background:#f5f7f6}.sv-eval-table [data-nonexec-reason]:enabled{opacity:1;background:#fff8e7;border-color:#d8bd88}.sv-eval-table .sv-reason-active{background:#fffaf0}.sv-student-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.sv-student-check{border:1px solid #dbe6e1;border-radius:15px;padding:14px;background:#f9fbfa}.sv-student-progress{background:#eef7f4;border-radius:10px;padding:10px;margin:10px 0;line-height:1.8}.sv-treatment-row{display:grid;grid-template-columns:2fr 1fr 1fr .8fr .9fr auto;gap:8px;align-items:center;margin:8px 0}.sv-readbox{white-space:pre-wrap;border:1px solid #dce6e1;border-radius:12px;padding:12px;background:#f9fbfa}.sv-result-hero{background:#f2f8f5;border:1px solid #d9e7e1;border-radius:16px;padding:15px}.sv-result-hero>div:last-child{text-align:center}.sv-result-hero>div:last-child b{display:block;font-size:30px}.sv-result-hero>div:last-child span{display:block}.sv-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.sv-template-grid article{border:1px solid #dce6e1;border-radius:14px;padding:10px;display:grid;gap:7px}.sv-template-grid img{width:100%;aspect-ratio:210/297;object-fit:cover;border-radius:8px;border:1px solid #eee}.sv-days{display:flex;flex-wrap:wrap;gap:10px}.sv-capacity-note{margin:10px 0;padding:11px 13px;border-radius:12px;font-weight:700;line-height:1.7}.sv-capacity-note.ok{background:#eaf7f1;border:1px solid #abd5c3;color:#07543f}.sv-capacity-note.warn{background:#fff6df;border:1px solid #e1c77d;color:#7b5a0b}.sv-teacher-pick{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;max-height:320px;overflow:auto;border:1px solid #dce6e1;border-radius:12px;padding:10px}.sv-teacher-pick label{display:flex;align-items:center;gap:8px;padding:7px;border-radius:9px;background:#f7faf8}.sv-upcoming-list{display:grid;gap:7px}.sv-upcoming-list article{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e9e5;padding:8px 0}.sv-upcoming-list span{color:#667a72}.sv-actions{display:flex;gap:6px;flex-wrap:wrap}.sv-manage-card{display:grid;gap:6px;border:1px solid #dce6e1;background:#f7faf8;border-radius:14px;padding:13px;margin-bottom:12px}.sv-manage-card b{font-size:18px}.sv-manage-card span{color:#667a72}.sv-manage-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sv-manage-actions .button{width:100%;min-height:48px}@media(max-width:760px){.sv-student-checks{grid-template-columns:1fr}.sv-treatment-row{grid-template-columns:1fr}.sv-upcoming-list article{display:grid}.sv-manage-actions{grid-template-columns:1fr}.sv-actions{display:grid;grid-template-columns:1fr}.sv-actions .button{width:100%}.sv-panel .table-wrap{overflow-x:auto}}';document.head.append(style);
window.SanabilSupervision={page,decorateDashboard,getTemplate,printShell,openTemplates:async root=>templatesPanel(root,await scopes(),await access()),openCertificate:async()=>certificateDialog(await access(),await scopes())};
})();