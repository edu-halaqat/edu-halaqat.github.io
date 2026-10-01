/* Excel import/export helpers for Sanabil Al-Wahy. Requires ExcelJS 4.4.0. */
(()=>{'use strict';
const C={teal:'FF00808A',gold:'FFD8BD88',ink:'FF183C33',light:'FFF4F8F6',white:'FFFFFFFF',red:'FFFFE3E6'};
const defs={
 'المجمعات':{
  headers:['رمز المجمع','اسم المجمع','نشط'],
  map:{'رمز المجمع':'id','اسم المجمع':'name','نشط':'active'},
  required:['name']
 },
 'المساجد':{
  headers:['رمز المسجد','اسم المسجد','المجمع','خط العرض','خط الطول','نطاق البصمة بالمتر','بداية الدوام','نهاية الدوام','سماح التأخير بالدقائق','الحضور المبكر بالدقائق','الانصراف المبكر بالدقائق','اعتبار الغياب بعد بالدقائق','مهلة الانصراف بالدقائق','أيام الدوام','نشط'],
  map:{'رمز المسجد':'id','اسم المسجد':'name','المجمع':'complex','خط العرض':'latitude','خط الطول':'longitude','نطاق البصمة بالمتر':'radiusMeters','بداية الدوام':'startPrayer','نهاية الدوام':'endPrayer','سماح التأخير بالدقائق':'lateAllowMinutes','الحضور المبكر بالدقائق':'earlyArrivalMinutes','الانصراف المبكر بالدقائق':'earlyLeaveMinutes','اعتبار الغياب بعد بالدقائق':'absenceAfterMinutes','مهلة الانصراف بالدقائق':'checkoutGraceMinutes','أيام الدوام':'weekdays','نشط':'active'},
  required:['name','complex','latitude','longitude']
 },
 'الحلقات':{
  headers:['رمز الحلقة','اسم الحلقة','المجمع','المسجد','نشط'],
  map:{'رمز الحلقة':'id','اسم الحلقة':'name','المجمع':'complex','المسجد':'mosque','نشط':'active'},
  required:['name','complex','mosque']
 },
 'المعلمون':{
  headers:['رمز المعلم','اسم المعلم','الجوال','المجمع','الحلقة','نشط'],
  map:{'رمز المعلم':'id','اسم المعلم':'fullName','الجوال':'phone','المجمع':'complex','الحلقة':'circle','نشط':'active'},
  required:['fullName','complex','circle']
 },
 'الطلاب':{
  headers:['رمز الطالب','الاسم الثلاثي','الجنسية','تاريخ الميلاد ميلادي','تاريخ الميلاد هجري','رقم الهوية أو الإقامة','تاريخ انتهاء الهوية','تاريخ التسجيل','المرحلة','جوال الطالب','جوال ولي الأمر','حالة التسجيل','الحالة الاجتماعية','التقييم','السورة الحالية','الآية الحالية','المجمع','الحلقة','المعلم','نشط'],
  map:{'رمز الطالب':'id','الاسم الثلاثي':'fullName','الجنسية':'nationality','تاريخ الميلاد ميلادي':'birthDate','تاريخ الميلاد هجري':'birthDateHijri','رقم الهوية أو الإقامة':'identityNumber','تاريخ انتهاء الهوية':'identityExpiry','تاريخ التسجيل':'enrollmentDate','المرحلة':'stage','جوال الطالب':'studentPhone','جوال ولي الأمر':'guardianPhone','حالة التسجيل':'registrationStatus','الحالة الاجتماعية':'socialStatus','التقييم':'evaluation','السورة الحالية':'currentSurah','الآية الحالية':'currentAyah','المجمع':'complex','الحلقة':'circle','المعلم':'teacher','نشط':'active'},
  required:['fullName','complex','circle']
 }
};
const keyBySheet={'المجمعات':'complexes','المساجد':'mosques','الحلقات':'circles','المعلمون':'teachers','الطلاب':'students'};
const prayer={الفجر:'Fajr',الظهر:'Dhuhr',العصر:'Asr',المغرب:'Maghrib',العشاء:'Isha',Fajr:'Fajr',Dhuhr:'Dhuhr',Asr:'Asr',Maghrib:'Maghrib',Isha:'Isha'};
const dayMap={الأحد:'0',الاحد:'0',الاثنين:'1',الثلاثاء:'2',الأربعاء:'3',الاربعاء:'3',الخميس:'4',الجمعة:'5',السبت:'6','0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6'};
const bool=v=>{const s=String(v??'').trim().toLowerCase();if(!s)return true;if(['نعم','نشط','true','1','yes','y'].includes(s))return true;if(['لا','غير نشط','false','0','no','n'].includes(s))return false;return true};
const clean=v=>v instanceof Date?`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`:String(v??'').trim();
const html=v=>String(v??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
const excel=()=>{if(!window.ExcelJS)throw Error('تعذر تحميل مكوّن Excel؛ حدّث الصفحة وحاول مرة أخرى.');return window.ExcelJS};
const save=(blob,name)=>{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)};
const styleSheet=ws=>{
 ws.views=[{state:'frozen',ySplit:1,rightToLeft:true}];
 const row=ws.getRow(1);row.height=30;
 row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.teal}};c.font={bold:true,color:{argb:C.white}};c.alignment={horizontal:'center',vertical:'middle'};c.border={bottom:{style:'thin',color:{argb:C.gold}}}});
 ws.eachRow((r,i)=>{if(i>1){r.alignment={vertical:'middle',horizontal:'right'};if(i%2===0)r.fill={type:'pattern',pattern:'solid',fgColor:{argb:C.light}}}});
};
const addSheet=(wb,name,headers,widths=[])=>{const ws=wb.addWorksheet(name,{views:[{rightToLeft:true}]});ws.addRow(headers);headers.forEach((_,i)=>ws.getColumn(i+1).width=widths[i]||18);styleSheet(ws);return ws};
const workbookBlob=async wb=>new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
async function template(){
 const ExcelJS=excel(),wb=new ExcelJS.Workbook();wb.creator='منصة سنابل الوحي';wb.created=new Date();
 const ins=wb.addWorksheet('تعليمات',{views:[{rightToLeft:true}]});
 ins.getColumn(1).width=110;
 [
  'قالب الاستيراد الجماعي لمنصة سنابل الوحي',
  '1) لا تغيّر أسماء الأوراق أو عناوين الأعمدة.',
  '2) الرمز اختياري عند السجل الجديد، لكنه مستحسن لتسهيل التحديثات اللاحقة.',
  '3) في حقول المجمع/المسجد/الحلقة/المعلم يمكنك كتابة الرمز أو الاسم كما هو مسجل.',
  '4) تاريخ الميلاد وتواريخ الهوية والتسجيل بصيغة YYYY-MM-DD.',
  '5) أيام الدوام تُكتب مثل: الأحد،الاثنين،الثلاثاء،الأربعاء،الخميس.',
  '6) بداية ونهاية الدوام: الفجر، الظهر، العصر، المغرب، العشاء.',
  '7) عمود نشط: نعم أو لا.',
  '8) استيراد المعلمين هنا ينشئ سجل المعلم التشغيلي فقط؛ حسابات الدخول تُدار من «إدارة المستخدمين».',
  '9) لا تحذف الصف الأول. احذف أي صف لا تريد استيراده.',
  '10) عند إعادة رفع ملف يحتوي طالبًا موجودًا في حلقة جديدة، ينقل النظام سجلاته التعليمية معه آليًا.'
 ].forEach((x,i)=>{const r=ins.addRow([x]);r.height=i===0?34:26;r.getCell(1).alignment={horizontal:'right',vertical:'middle',wrapText:true};if(i===0){r.getCell(1).font={bold:true,size:18,color:{argb:C.white}};r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:C.teal}}}});
 for(const [name,d] of Object.entries(defs)){const ws=addSheet(wb,name,d.headers,d.headers.map(h=>Math.max(14,Math.min(28,h.length+7))));const ai=d.headers.indexOf('نشط')+1;if(ai>0)for(let i=2;i<=2000;i++)ws.getCell(i,ai).dataValidation={type:'list',allowBlank:true,formulae:['"نعم,لا"']};}
 const blob=await workbookBlob(wb);save(blob,'قالب_استيراد_سنابل_الوحي.xlsx');
}
function rowsFromSheet(ws,def){
 const headers={};ws.getRow(1).eachCell((c,col)=>{const h=clean(c.value);if(h)headers[col]=h});
 const missing=def.headers.filter(h=>!Object.values(headers).includes(h));
 if(missing.length)throw Error(`ورقة ${ws.name}: أعمدة مفقودة: ${missing.join('، ')}`);
 const out=[];
 ws.eachRow((row,n)=>{if(n===1)return;const obj={};let any=false;for(const [col,h] of Object.entries(headers)){const k=def.map[h];if(!k)continue;const v=clean(row.getCell(Number(col)).value);if(v!=='')any=true;obj[k]=v}if(!any)return;
  if('active'in obj)obj.active=bool(obj.active);
  if(obj.startPrayer)obj.startPrayer=prayer[obj.startPrayer]||obj.startPrayer;
  if(obj.endPrayer)obj.endPrayer=prayer[obj.endPrayer]||obj.endPrayer;
  if(obj.weekdays)obj.weekdays=obj.weekdays.split(/[،,;]+/).map(x=>dayMap[x.trim()]).filter(x=>x!==undefined);
  for(const k of ['latitude','longitude','radiusMeters','lateAllowMinutes','earlyArrivalMinutes','earlyLeaveMinutes','absenceAfterMinutes','checkoutGraceMinutes','currentAyah'])if(obj[k]!==''&&obj[k]!==undefined)obj[k]=Number(obj[k]);
  obj.__row=n;out.push(obj)
 });return out
}
function validate(payload){
 const errors=[],warnings=[];
 const req=(arr,keys,label)=>arr.forEach(r=>keys.forEach(k=>{if(r[k]===undefined||r[k]===null||String(r[k]).trim()==='')errors.push(`${label} الصف ${r.__row}: حقل ${k} مطلوب`)}));
 for(const [name,d] of Object.entries(defs))req(payload[keyBySheet[name]]||[],d.required,name);
 for(const r of payload.students||[]){if(String(r.fullName||'').trim().split(/\s+/).length<3)errors.push(`الطلاب الصف ${r.__row}: الاسم يجب أن يكون ثلاثيًا على الأقل`);if(!r.id&&!r.identityNumber&&!r.birthDate)errors.push(`الطلاب الصف ${r.__row}: أدخل رمز الطالب أو الهوية أو تاريخ الميلاد للتمييز`)}
 for(const r of payload.mosques||[]){if(!Number.isFinite(r.latitude)||r.latitude<-90||r.latitude>90)errors.push(`المساجد الصف ${r.__row}: خط العرض غير صحيح`);if(!Number.isFinite(r.longitude)||r.longitude<-180||r.longitude>180)errors.push(`المساجد الصف ${r.__row}: خط الطول غير صحيح`);if(r.weekdays&&r.weekdays.length===0)warnings.push(`المساجد الصف ${r.__row}: أيام الدوام فارغة وسيستخدم الخادم الإعداد الافتراضي`)}
 return{errors,warnings,counts:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))}
}

const sourceDate=v=>{
 const s=clean(v);if(!s)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d+(?:\.0+)?$/.test(s)){const n=Number(s);if(n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+Math.round(n*86400000));return d.toISOString().slice(0,10)}}
 return s.replace(/\//g,'-');
};
const sourceCell=(row,col)=>clean(row.getCell(col).value);
async function parseEntityDatabase(file){
 const ExcelJS=excel(),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const studentsWs=wb.getWorksheet('بيانات طلاب الجهة'),circlesWs=wb.getWorksheet('بيانات الحلقات داخل الجهة'),entityWs=wb.getWorksheet('بيانات الجهة التعليمية');
 if(!studentsWs||!circlesWs)throw Error('الملف لا يطابق قاعدة بيانات الجهة: يلزم وجود ورقتي «بيانات طلاب الجهة» و«بيانات الحلقات داخل الجهة».');
 const entityName=entityWs?sourceCell(entityWs.getRow(2),2):'';
 const complex=(entityName||'').replace(/\s+بمسجد.*$/,'').trim()||'حلقات بر الوالدين';
 const circleRows=[];
 circlesWs.eachRow((row,n)=>{if(n<3)return;const name=sourceCell(row,2),teacher=sourceCell(row,6),count=sourceCell(row,5),period=sourceCell(row,4);if(!name||!teacher)return;circleRows.push({name,teacher,count,period})});
 const primaryByTeacher=new Map();
 for(const x of circleRows){
   const numeric=/^\d+(?:\.0+)?$/.test(String(x.count||''))?Number(x.count):NaN;
   if(Number.isFinite(numeric)&&numeric>0&&!primaryByTeacher.has(x.teacher))primaryByTeacher.set(x.teacher,x.name);
 }
 for(const x of circleRows)if(!primaryByTeacher.has(x.teacher))primaryByTeacher.set(x.teacher,x.name);
 const students=[];
 const errors=[];
 studentsWs.eachRow((row,n)=>{
   if(n<3)return;
   const fullName=sourceCell(row,2);if(!fullName)return;
   const teacher=sourceCell(row,13),circle=primaryByTeacher.get(teacher)||'';
   if(!teacher||!circle){errors.push('الطلاب الصف '+n+': تعذر تحديد الحلقة من اسم المعلم «'+(teacher||'غير موجود')+'».');return}
   students.push({
     fullName,
     nationality:sourceCell(row,5)||null,
     birthDate:sourceDate(row.getCell(6).value)||null,
     identityNumber:sourceCell(row,3)||null,
     stage:sourceCell(row,10)||null,
     guardianPhone:sourceCell(row,11)||null,
     studentPhone:sourceCell(row,12)||null,
     evaluation:sourceCell(row,14)||null,
     registrationStatus:'منتظم',
     complex,circle,teacher,active:true,
     __row:n
   });
 });
 const expected=studentsWs.actualRowCount?Math.max(0,studentsWs.actualRowCount-2):students.length;
 const warnings=[];
 if(expected!==students.length)warnings.push('تمت قراءة '+students.length+' طالبًا من أصل '+expected+' صفًا مستخدمًا؛ راجع الصفوف الفارغة أو غير المكتملة.');
 if(!students.length)errors.push('لم يتم العثور على أي طالب في ورقة بيانات الطلاب.');
 return{
   payload:{complexes:[],mosques:[],circles:[],teachers:[],students},
   validation:{errors,warnings,counts:{complexes:0,mosques:0,circles:0,teachers:0,students:students.length}},
   source:{entityName,complex,circleRows:circleRows.length}
 };
}

async function parse(file){
 const ExcelJS=excel(),wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const payload={complexes:[],mosques:[],circles:[],teachers:[],students:[]};
 for(const [name,d] of Object.entries(defs)){const ws=wb.getWorksheet(name);if(!ws)throw Error(`الملف لا يحتوي ورقة «${name}»`);payload[keyBySheet[name]]=rowsFromSheet(ws,d)}
 return{payload,validation:validate(payload)}
}
async function exportMaster(data){
 const ExcelJS=excel(),wb=new ExcelJS.Workbook();wb.creator='منصة سنابل الوحي';wb.created=new Date();
 const cx=new Map((data.complexes||[]).map(x=>[x.id,x.name])),mq=new Map((data.mosques||[]).map(x=>[x.id,x.name])),ci=new Map((data.circles||[]).map(x=>[x.id,x.name])),te=new Map((data.teachers||[]).map(x=>[x.id,x.full_name]));
 const add=(name,rows)=>{const d=defs[name],ws=addSheet(wb,name,d.headers,d.headers.map(h=>Math.max(14,Math.min(28,h.length+7))));rows.forEach(x=>ws.addRow(x));};
 add('المجمعات',(data.complexes||[]).map(x=>[x.id,x.name,x.active?'نعم':'لا']));
 add('المساجد',(data.mosques||[]).map(x=>{const w=Array.isArray(x.attendance_windows)?x.attendance_windows[0]||{}:{};const days=(w.weekdays||[]).map(v=>Object.entries(dayMap).find(([k,n])=>n===String(v)&&!/^\d$/.test(k))?.[0]||v).join('،');return[x.id,x.name,cx.get(x.complex_id)||x.complex_id,x.latitude,x.longitude,x.radius_meters,w.startPrayer||'Asr',w.endPrayer||'Maghrib',w.lateAllowMinutes??15,w.earlyArrivalMinutes??15,w.earlyLeaveMinutes??15,w.absenceAfterMinutes??60,w.checkoutGraceMinutes??120,days,x.active?'نعم':'لا']}));
 add('الحلقات',(data.circles||[]).map(x=>[x.id,x.name,cx.get(x.complex_id)||x.complex_id,mq.get(x.mosque_id)||x.mosque_id,x.active?'نعم':'لا']));
 add('المعلمون',(data.teachers||[]).map(x=>[x.id,x.full_name,x.phone||'',cx.get(x.complex_id)||x.complex_id,ci.get(x.circle_id)||x.circle_id,x.active?'نعم':'لا']));
 add('الطلاب',(data.students||[]).map(x=>[x.id,x.full_name,x.nationality||'',x.birth_date||'',x.birth_date_hijri||'',x.identity_number||'',x.identity_expiry||'',x.enrollment_date||'',x.stage||'',x.student_phone||'',x.guardian_phone||'',x.registration_status||'',x.social_status||'',x.evaluation||'',x.current_surah||'',x.current_ayah||'',cx.get(x.complex_id)||x.complex_id,ci.get(x.circle_id)||x.circle_id,te.get(x.teacher_id)||x.teacher_id||'',x.active?'نعم':'لا']));
 save(await workbookBlob(wb),'بيانات_سنابل_الوحي_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
const scoreGrade=s=>Number(s)>=90?'ممتاز':Number(s)>=80?'جيد جدًا':Number(s)>=70?'جيد':'يحتاج متابعة';
async function exportTests(tests,questions=[]){
 const ExcelJS=excel(),wb=new ExcelJS.Workbook();wb.creator='منصة سنابل الوحي';wb.created=new Date();
 const h=['التاريخ','الطالب','الحلقة','المعلم','نوع الاختبار','المقرر','الحفظ /80','التجويد /20','المجموع /100','التقدير','ملاحظات','رمز الاستعلام'];
 const ws=addSheet(wb,'ملخص النتائج',h,[16,28,22,25,18,32,14,14,14,16,30,22]);
 tests.forEach(t=>ws.addRow([t.performed_at?new Date(t.performed_at).toLocaleDateString('ar-SA'):'',t.student_name_snapshot||t.student_name||'',t.circle_name_snapshot||t.circle_name||'',t.teacher_name_snapshot||t.teacher_name||'',t.type||'',t.syllabus_snapshot?.label||t.syllabus_label||'',t.scores?.memorization??'',t.scores?.tajweed??'',t.scores?.total??'',scoreGrade(t.scores?.total),t.notes||'',t.public_code||'']));
 ws.autoFilter={from:'A1',to:'L1'};
 const qh=['الطالب','تاريخ الاختبار','السؤال','السورة','الآية','الأخطاء','الشكوك','أخطاء التجويد','ملاحظات'];
 const qws=addSheet(wb,'تفاصيل الأسئلة',qh,[28,16,10,18,10,12,12,16,30]);
 const byId=new Map(tests.map(t=>[t.id,t]));
 questions.forEach(q=>{const t=byId.get(q.test_id)||{};qws.addRow([t.student_name_snapshot||'',t.performed_at?new Date(t.performed_at).toLocaleDateString('ar-SA'):'',q.question_no,q.surah_no,q.ayah_no,q.errors,q.doubts,q.tajweed_errors,q.notes||''])});
 qws.autoFilter={from:'A1',to:'I1'};
 const scores=tests.map(t=>Number(t.scores?.total)).filter(Number.isFinite),avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:0;
 const sum=wb.addWorksheet('مؤشرات',{views:[{rightToLeft:true}]});sum.columns=[{width:34},{width:22}];[['المؤشر','القيمة'],['عدد الاختبارات',tests.length],['متوسط النتائج',avg],['90 فأعلى',scores.filter(x=>x>=90).length],['80–89',scores.filter(x=>x>=80&&x<90).length],['70–79',scores.filter(x=>x>=70&&x<80).length],['أقل من 70',scores.filter(x=>x<70).length]].forEach(r=>sum.addRow(r));styleSheet(sum);
 const groupSheet=(name,keyFn)=>{
  const groups=new Map();
  for(const t of tests){const k=keyFn(t)||'غير محدد',g=groups.get(k)||{count:0,sum:0,scores:[]};const s=Number(t.scores?.total);g.count++;if(Number.isFinite(s)){g.sum+=s;g.scores.push(s)}groups.set(k,g)}
  const gws=addSheet(wb,name,['البيان','عدد الاختبارات','متوسط النتيجة','90 فأعلى','80–89','70–79','أقل من 70'],[30,16,18,14,14,14,14]);
  [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).forEach(([k,g])=>gws.addRow([
    k,g.count,g.scores.length?Math.round(g.sum/g.scores.length*100)/100:0,
    g.scores.filter(v=>v>=90).length,g.scores.filter(v=>v>=80&&v<90).length,
    g.scores.filter(v=>v>=70&&v<80).length,g.scores.filter(v=>v<70).length
  ]));
  gws.autoFilter={from:'A1',to:'G1'};
 };
 groupSheet('حسب الحلقات',t=>t.circle_name_snapshot||t.circle_name||'');
 groupSheet('حسب المعلمين',t=>t.teacher_name_snapshot||t.teacher_name||'');
 const top=addSheet(wb,'ترتيب النتائج',['الترتيب','الطالب','الحلقة','المقرر','المجموع','التقدير','التاريخ'],[10,28,22,30,14,16,16]);
 [...tests].sort((a,b)=>Number(b.scores?.total||0)-Number(a.scores?.total||0)||String(a.student_name_snapshot||'').localeCompare(String(b.student_name_snapshot||''),'ar')).forEach((t,i)=>top.addRow([
   i+1,t.student_name_snapshot||t.student_name||'',t.circle_name_snapshot||t.circle_name||'',
   t.syllabus_snapshot?.label||t.syllabus_label||'',t.scores?.total??'',scoreGrade(t.scores?.total),
   t.performed_at?new Date(t.performed_at).toLocaleDateString('ar-SA'):''
 ]));
 top.autoFilter={from:'A1',to:'G1'};
 save(await workbookBlob(wb),'نتائج_اختبارات_سنابل_الوحي_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
async function activePrintTemplate(type='report'){
 try{
  if(!window.supabaseClient)return null;
  const a=await window.supabaseClient.rpc('my_access');if(a.error||!a.data)return null;
  const x=a.data,org=x.org_id,complex=(x.complexIds||[])[0]||null;
  let q=window.supabaseClient.from('document_templates').select('public_url').eq('org_id',org).eq('template_type',type).eq('active',true).order('created_at',{ascending:false});
  q=complex?q.eq('complex_id',complex):q.is('complex_id',null);
  let r=await q.limit(1);if(!r.error&&r.data?.[0])return r.data[0].public_url;
  if(complex){r=await window.supabaseClient.from('document_templates').select('public_url').eq('org_id',org).is('complex_id',null).eq('template_type',type).eq('active',true).order('created_at',{ascending:false}).limit(1);if(!r.error&&r.data?.[0])return r.data[0].public_url}
 }catch{}
 return null;
}
function printBackgroundCss(url){return url?'body:before{content:"";position:fixed;inset:0;background:url("'+html(url)+'") center/100% 100% no-repeat;z-index:-2}body:after{content:"";position:fixed;inset:0;background:#ffffffdc;z-index:-1}':''}
async function printTests(tests,title='تقرير نتائج الاختبارات'){
 const rows=tests.map(t=>`<tr><td>${html(t.performed_at?new Date(t.performed_at).toLocaleDateString('ar-SA'):'')}</td><td>${html(t.student_name_snapshot||t.student_name||'')}</td><td>${html(t.circle_name_snapshot||'')}</td><td>${html(t.syllabus_snapshot?.label||t.syllabus_label||'')}</td><td>${html(t.scores?.memorization??'—')}</td><td>${html(t.scores?.tajweed??'—')}</td><td><b>${html(t.scores?.total??'—')}</b></td><td>${scoreGrade(t.scores?.total)}</td></tr>`).join('');
 const scores=tests.map(t=>Number(t.scores?.total)).filter(Number.isFinite),avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:0;
 const w=window.open('','_blank');if(!w)throw Error('اسمح بالنوافذ المنبثقة لإخراج التقرير.');const bg=await activePrintTemplate('report');
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${html(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;color:#183c33;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}${printBackgroundCss(bg)}header{display:flex;align-items:center;gap:20px;border-bottom:4px solid #00808A;padding-bottom:12px}header img{width:120px}h1{margin:0;color:#00808A}.meta{display:flex;gap:12px;margin:16px 0}.box{border:1px solid #d8e3de;border-radius:12px;padding:10px 16px}.box b{color:#00808A;font-size:22px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#00808A;color:white}th,td{padding:8px;border:1px solid #dde6e1;text-align:right}tr:nth-child(even){background:#f6f9f7}footer{margin-top:16px;color:#65766f;font-size:11px}@media print{button{display:none}}</style></head><body><header><img src="/assets/logo-sanabil-v6.png"><div><h1>${html(title)}</h1><p>منصة سنابل الوحي</p></div></header><div class="meta"><div class="box">عدد الاختبارات<br><b>${tests.length}</b></div><div class="box">متوسط النتائج<br><b>${avg}</b></div><div class="box">90 فأعلى<br><b>${scores.filter(x=>x>=90).length}</b></div></div><table><thead><tr><th>التاريخ</th><th>الطالب</th><th>الحلقة</th><th>المقرر</th><th>الحفظ</th><th>التجويد</th><th>المجموع</th><th>التقدير</th></tr></thead><tbody>${rows}</tbody></table><footer>صدر من منصة سنابل الوحي — ${new Date().toLocaleString('ar-SA')}</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
}

async function exportTable(title,headers,rows,meta=[]){
 if(!window.ExcelJS){
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',bom='\ufeff',lines=[headers.map(q).join(','),...rows.map(r=>r.map(q).join(','))];
  save(new Blob([bom+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),String(title||'تقرير_سنابل_الوحي').replace(/[\\/:*?"<>|]/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv');
  return;
 }
 const ExcelJS=window.ExcelJS,wb=new ExcelJS.Workbook();wb.creator='منصة سنابل الوحي';wb.created=new Date();
 const ws=addSheet(wb,'التقرير',headers,headers.map(h=>Math.max(14,Math.min(34,String(h).length+8))));
 rows.forEach(r=>ws.addRow(r));
 if(headers.length)ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
 ws.pageSetup={orientation:headers.length>6?'landscape':'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2}};
 ws.headerFooter={oddHeader:'&C&B'+String(title||'تقرير سنابل الوحي'),oddFooter:'&Cمنصة سنابل الوحي &P / &N'};
 if(meta.length){const ms=wb.addWorksheet('بيانات التقرير',{views:[{rightToLeft:true}]});ms.columns=[{width:30},{width:55}];ms.addRow(['البيان','القيمة']);meta.forEach(r=>ms.addRow(r));styleSheet(ms)}
 save(await workbookBlob(wb),String(title||'تقرير_سنابل_الوحي').replace(/[\\/:*?"<>|]/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
async function printTable(title,headers,rows,meta=[]){
 const w=window.open('','_blank');if(!w)throw Error('اسمح بالنوافذ المنبثقة لإخراج التقرير.');const bg=await activePrintTemplate('report');
 const metaHtml=meta.length?'<div class="meta">'+meta.map(r=>'<div class="box"><span>'+html(r[0])+'</span><b>'+html(r[1])+'</b></div>').join('')+'</div>':'';
 const body=rows.map(r=>'<tr>'+r.map(v=>'<td>'+html(v??'')+'</td>').join('')+'</tr>').join('');
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${html(title)}</title><style>
 @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#183c33;margin:0;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}${printBackgroundCss(bg)}
 header{display:flex;align-items:center;gap:18px;border-bottom:4px solid #00808A;padding:0 0 12px;margin-bottom:12px}header img{width:110px;max-height:80px;object-fit:contain}h1{margin:0;color:#00808A;font-size:24px}
 .meta{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}.box{border:1px solid #d8e3de;border-radius:10px;padding:7px 12px;min-width:140px}.box span{display:block;color:#65766f;font-size:11px}.box b{display:block;color:#00808A;font-size:16px;margin-top:3px}
 table{width:100%;border-collapse:collapse;font-size:10px}th{background:#00808A;color:white;font-weight:700}th,td{padding:6px;border:1px solid #dfe8e3;text-align:right;vertical-align:top}tr:nth-child(even){background:#f5f9f7}
 footer{margin-top:12px;padding-top:8px;border-top:1px solid #d8e3de;color:#65766f;font-size:10px} @media print{button{display:none}}
 </style></head><body><header><img src="/assets/logo-sanabil-v6.png"><div><h1>${html(title)}</h1><div>منصة سنابل الوحي</div></div></header>${metaHtml}<table><thead><tr>${headers.map(h=>'<th>'+html(h)+'</th>').join('')}</tr></thead><tbody>${body}</tbody></table><footer>صدر من منصة سنابل الوحي — ${new Date().toLocaleString('ar-SA')}</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
 w.document.close();
}

window.SanabilExcel={template,parse,parseEntityDatabase,validate,exportMaster,exportTests,printTests,exportTable,printTable};
})();