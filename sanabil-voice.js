/* Sanabil optional Arabic voice commands for outcome controls.
 * Speech transcription uses browser SpeechRecognition when supported;
 * never stores audio, transcripts, or student identifiers in telemetry.
 * Saving and WhatsApp remain deliberate user-confirmed actions.
 */
(()=>{'use strict';if(window.SanabilVoice)return;
// Natural Arabic commands: infer the action from a known student name,
// a track label and a grade/count, without requiring an imperative verb.
const normalize=value=>String(value||'').normalize('NFKC')
 .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
 .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
 .replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
 .replace(/[۰-۹]/g,n=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)))
 .replace(/[،؛:؟!….,()[\]{}"“”«»]/g,' ')
 .replace(/\s+/g,' ').trim();
const words={صفر:0,واحد:1,واحده:1,اثنان:2,اثنين:2,اثنتان:2,اثنتين:2,
 ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,
 سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};
const numericToken=token=>{
 let t=normalize(token);
 if(Object.prototype.hasOwnProperty.call(words,t))return words[t];
 if(/^\d{1,2}$/.test(t))return Number(t);
 if(t[0]==='و'&&(Object.prototype.hasOwnProperty.call(words,t.slice(1))||/^\d{1,2}$/.test(t.slice(1))))return numericToken(t.slice(1));
 return null;
};
const countOf=phrase=>{
 const number=normalize(phrase).split(' ').map(numericToken).find(n=>n!==null);
 return Number.isInteger(number)&&number>=0&&number<=20?number:null;
};
const gradeOf=cmd=>{
 const s=normalize(cmd);
 if(/(?:لم يحفظ|ما حفظ)/.test(s))return 'لم يحفظ';
 if(/(?:لم يسمع|ما سمع)/.test(s))return 'لم يسمع';
 if(/(?:جيد جدا|جيد جداا)/.test(s))return 'جيد جدًا';
 if(/يحتاج اعاده/.test(s))return 'يحتاج إعادة';
 if(/ممتاز/.test(s))return 'ممتاز';
 if(/(?:^|\s)جيد(?:\s|$)/.test(s))return 'جيد';
 return null;
};
const categoryOf=value=>{
 const s=normalize(value);
 // The four names in local Quran-teaching usage refer to the same field.
 // Specific review terminology MUST take precedence over bare "المراجعة".
 if(/جنب الدرس|جنبدرس|التثبيت|تثبيت|المراجعه الصغري|مراجعه صغري|الصغري|المراجعه القريبه|مراجعه قريبه|القريبه|المراجعه الصوره|مراجعه الصوره|الصوره|المراجعه الصغيره/.test(s))
  return 'recentReview';
 if(/المراجعه الكبري|مراجعه كبري|الكبري|المراجعه الكبيره|مراجعه كبيره/.test(s))
  return 'review';
 if(/الحفظ|(?:^|\s)حفظ(?=\s|$)|الدرس الجديد|الدرس|الجديد/.test(s))
  return 'memorization';
 // Unqualified review means MAJOR review, not the nearby review.
 if(/مراجعه|مراجعات|المراجعه|المراجعات/.test(s))return 'review';
 return null;
};
const metricOf=value=>{
 const s=normalize(value);
 if(/التجويد|تجويد/.test(s))return 'tajweed';
 if(/شك|شكوك|شكين|شكتين|تردد/.test(s))return 'doubts';
 if(/اخطاء|الاخطاء|خطا|خطاين|خطاين|غلط|اغلاط/.test(s))return 'errors';
 return null;
};
const NUMBER='(?:[0-9]{1,2}|صفر|واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره)';
const METRIC='(?:اخطاء\\s+التجويد|اخطاءات|الاخطاء|اخطاء|خطاين|خطا|اغلاط|غلط|شكوك|شكتين|شكين|الشكوك|شك|تردد|التجويد|تجويد)';
const metricParts=cmd=>{
 const normalized=normalize(cmd),hits=[],used=[];
 const pairs=[
  new RegExp('(?:^|\\s)(و?'+NUMBER+')\\s+('+METRIC+')(?=\\s|$)','gu'),
  new RegExp('(?:^|\\s)('+METRIC+')\\s+(و?'+NUMBER+')(?=\\s|$)','gu')
 ];
 for(let phase=0;phase<pairs.length;phase++){
  for(const m of normalized.matchAll(pairs[phase])){
   const token=phase===0?m[1]:m[2],text=phase===0?m[2]:m[1];
   const count=numericToken(token),metric=metricOf(text);
   if(count===null||count<0||count>20||!metric)return null;
   if(used.some(range=>m.index<range.end&&m.index+m[0].length>range.start))continue;
   used.push({start:m.index,end:m.index+m[0].length});
   hits.push({metric,count,offset:m.index});
  }
 }
 // The Arabic dual can imply two without an explicit numeral.
 const duals=[...normalized.matchAll(/(?:^|\s)(شكين|شكتين|خطاين)(?=\s|$)/gu)];
 for(const m of duals){
  if(!used.some(x=>m.index<x.end&&m.index+m[0].length>x.start)){
   hits.push({metric:metricOf(m[1]),count:2,offset:m.index});
   used.push({start:m.index,end:m.index+m[0].length});
  }
 }
 const all=[...normalized.matchAll(new RegExp('(?:^|\\s)('+METRIC+')(?=\\s|$)','gu'))];
 // Do not silently apply an incomplete compound instruction to the wrong field.
 if(all.length!==hits.length)return null;
 hits.sort((a,b)=>a.offset-b.offset);
 if(hits.some(x=>!x.metric))return null;
 // Two separate amounts for the same metric in one utterance are ambiguous.
 if(new Set(hits.map(h=>h.metric)).size!==hits.length)return null;
 return hits.map(({metric,count})=>({metric,count}));
};
// Treat «عبد الله» and «عبدالله» as the same name, without matching
// unrelated students by a merely similar first name.
const canonicalName=value=>normalize(value).replace(/عبد\s+الله/g,'عبدالله');
const matchingStudents=(studentNames,rawName)=>{
 let name=canonicalName(rawName);
 const removePatronymic=val=>canonicalName(val).split(' ').filter(w=>!['بن','ابن','بنت'].includes(w)).join(' ');
 // Some Android recognition sessions echo the first name at restart:
 // «إياد إياد عبد الله». Only collapse when the remaining name uniquely
 // identifies a registered student and the original does not match one.
 const repeat=name.match(/^(\S+)\s+\1(?:\s+|$)/u);
 if(repeat){
  const trimmed=name.slice(repeat[1].length+1);
  const fits=(studentNames||[]).filter(n=>{
   const c=removePatronymic(n),short=removePatronymic(trimmed);
   return c===short||c.startsWith(short+' ');
  });
  if(fits.length===1)name=trimmed;
 }
 const compact=removePatronymic(name),parts=compact.split(' ').filter(Boolean);
 if(!compact||!parts.length)return [];
 const indexed=(studentNames||[]).map((n,i)=>({name:normalize(n),compact:removePatronymic(n),i}));
 const exact=indexed.filter(row=>row.name===name||row.compact===compact);
 if(exact.length)return exact;
 const contiguous=indexed.filter(row=>row.name.includes(name)||row.compact.includes(compact));
 if(contiguous.length)return contiguous;
 // A known student can be recognized despite a spoken "بن"/"ابن" in the full name.
 return parts.length>=2?indexed.filter(row=>{
  const words=row.compact.split(' ');
  let pos=0;
  for(const part of parts){const next=words.findIndex((w,i)=>i>=pos&&w===part);if(next<0)return false;pos=next+1}
  return true;
 }):[];
};
// Attendance is independent from Quran grades. Explicit absence reason is needed
// before a saved absence; shorthand "حاضر" applies to the selected student.
const attendanceOf=raw=>{
 const text=normalize(raw);
 if(/(?:الغياب|غائب|غايب|غاب|غياب)/.test(text)){
  return {status:'absent',reason:/بدون عذر|بلا عذر|غير مبرر/.test(text)?'unexcused':/بعذر|ب عذر|معذور/.test(text)?'excused':null};
 }
 if(/مستاذن|استئذان|استاذن|مستأذن/.test(text))return {status:'excused',reason:null};
 if(/متاخر|متاخرين|تاخر|تأخر/.test(text))return {status:'late',reason:null};
 if(/حاضر|الحضور|حضر|حاضرين|تحضير|احضر/.test(text))return {status:'present',reason:null};
 return null;
};
const attendeeTarget=(text,names)=>{
 const cmd=normalize(text);
 const all=/جميع|الكل|الطلاب كلهم|كافه الطلاب|كل الطلاب|كل الطلبه|الجميع|تحضير الطلاب|حضور الطلاب|حضر الطلاب/.test(cmd);
 if(all)return {scope:'all'};
 const clean=cmd
  .replace(/(?:بلا عذر|بدون عذر|غير مبرر|بعذر|معذور)/g,' ')
  .replace(/(?:الطلاب|الطالب|الطالبه|الغياب|غائب|غايب|غاب|غياب|حاضر|الحضور|حضر|حاضرين|تحضير|احضر|مستاذن|استئذان|استاذن|متاخرين|متاخر|تاخر)/g,' ')
  .replace(/\b(?:سجل|ضع|اجعل|حدد|ادخل|اثبت|قيد|علم|الان|اليوم|بالنسبه|حاله|حالته|للطالب)\b/g,' ')
  .replace(/\s+/g,' ').trim();
 if(clean.length<2)return {scope:'current'};
 const matches=matchingStudents(names,clean);
 if(matches.length===1)return {scope:'student',name:matches[0].name,index:matches[0].i};
 if(matches.length>1)return {scope:'ambiguous',name:clean};
 return {scope:'unknown',name:clean};
};
const studentNameFrom=cmd=>{
 const name=normalize(cmd).replace(/^(?:(?:انتقل|اذهب|روح|افتح|اعرض|اختار|اختر|هات|جيب)(?:\s+لي)?(?:\s+الي|\s+عند|\s+ل)?\s*)/,'')
  .replace(/^(?:حصيله\s+)?(?:الطالب|الطالبه)\s+/,'')
  .replace(/\s+(?:من فضلك|لو سمحت|الان)$/,'').trim();
 return name;
};
// Do not treat a recognizable grade embedded in unrelated speech as an action.
 const sensibleTask=value=>{
  const extra=normalize(value)
   .replace(/(?:لم\s+يحفظ|ما\s+حفظ|لم\s+يسمع|ما\s+سمع|جيد\s+جدا|يحتاج\s+اعاده|ممتاز|جيد)/gu,' ')
   .replace(/(?:المراجعه\s+(?:الصغري|الصغيره|القريبه|الكبري|الكبيره)|مراجعه\s+(?:صغري|قريبه|كبري|كبيره)|جنب\s+الدرس|جنبدرس|المراجعه|المراجعات|مراجعه|التثبيت|تثبيت|الحفظ\s+الجديد|الدرس\s+الجديد|الحفظ|حفظ|الدرس|الجديد|الصغري|الكبري)/gu,' ')
   .replace(/(?:اخطاء\s+التجويد|اخطاءات|الاخطاء|اخطاء|خطاين|خطا|اغلاط|غلط|الشكوك|شكوك|شكتين|شكين|شك|تردد|التجويد|تجويد)/gu,' ')
   .replace(/(?:^|\s)و?(?:[0-9]{1,2}|صفر|واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره)(?=\s|$)/gu,' ')
   .replace(/(?:^|\s)(?:اضف|زد|زود|زياده|سجل|ضع|اجعل|حدد|قيم|قيد|اثبت|عدل|غير|ارصد|ادخل|التقدير|بتقدير|الي|على|في|الان|اليوم|و)(?=\s|$)/gu,' ')
   .replace(/(?:لو سمحت|من فضلك)/gu,' ').replace(/\s+/g,' ').trim();
  return !extra;
 };
 const intentOf=(raw,studentNames=[])=>{
 const cmd=normalize(raw);
 if(!cmd)return {type:'unknown'};
 if(/(?:احفظ|حفظ|ثبت|اعتمد)\s+(?:التحضير|الحضور)/.test(cmd))return {type:'attendance_save'};
 if(/(?:احفظ|حفظ)\s+(?:الحصيله|حصيله|التقدير)/.test(cmd))
  return {type:'save',share:/واتساب|ارسل|شارك/.test(cmd)};
 if(/(?:ارسل|شارك)\s+.*(?:ولي الامر|واتساب|الحصيله)/.test(cmd))
  return {type:'share'};
 const kind=categoryOf(cmd),grade=gradeOf(cmd);
 // Attendance names are only interpreted after excluding lesson-grade phrases.
 const global=window.SanabilVoiceGlobal?.parse?.(cmd);
  if(global&&global.type!=='unknown')return {type:'global',global,command:cmd};
  const attendance=attendanceOf(cmd);
 if(attendance&&!kind&&!grade){
  if(/الغائبين|المتاخرين|المستاذنين/.test(cmd)&&!matchingStudents(studentNames,cmd).length)return {type:'unknown',reason:'حدد أسماء الطلاب المعنيين بالحضور أو الغياب واحدًا واحدًا.'};
  const target=attendeeTarget(cmd,studentNames);
  if(target.scope==='all'){
   if(attendance.status==='present')return {type:'attendance_all',status:'present'};
   return {type:'unknown',reason:'تغيير حضور جميع الطلاب إلى غياب أو استئذان يحتاج تحديدًا فرديًا.'};
  }
  if(target.scope==='unknown'||target.scope==='ambiguous')
   return {type:'unknown',reason:'لم أحدد الطالب المقصود؛ انطق الاسم الكامل أو انتقل إلى بطاقته أولًا.'};
  return {type:'attendance',...attendance,target};
 }
 const metricMention=metricOf(cmd),amounts=kind&&metricMention?metricParts(cmd):null;
  if(kind&&(grade||metricMention)&&!sensibleTask(cmd))
   return {type:'unknown',reason:'الأمر يتضمن كلمات غير واضحة؛ حدد المقرر والتقدير أو العدد بصورة أدق.'};
 if(kind&&grade){
  if(metricMention)return {type:'unknown',reason:'اطلب التقدير والعدادات في أمرين منفصلين لتجنب الخلط.'};
  return {type:'grade',kind,grade};
 }
 if(kind&&metricMention){
  if(!amounts||!amounts.length)return {type:'unknown',reason:'اذكر العدد بوضوح بجوار الأخطاء أو الشكوك.'};
  const mode=/(?:^|\s)(?:اضف|زد|زود|زياده)(?=\s|$)/u.test(cmd)?'add':'set';
  return amounts.length===1?{type:'metric',kind,mode,...amounts[0]}:{type:'metrics',kind,mode,changes:amounts};
 }
 const forced=/^(?:انتقل|اذهب|روح|افتح|اعرض|اختار|اختر|هات|جيب|الطالب|الطالبه)(?:\s|$)/u.test(cmd);
 const name=studentNameFrom(cmd);
 if(forced&&name.length>=2)return {type:'navigate',name};
 if(Array.isArray(studentNames)&&name.length>=3){
  const token=normalize(name);
  const hits=matchingStudents(studentNames,token);
  if(hits.length===1)return {type:'navigate',name};
  if(hits.length>1)return {type:'unknown',reason:'الاسم يطابق أكثر من طالب؛ اذكر الاسم الكامل لتحديد المقصود.'};
 }
 return {type:'unknown'};
};
const labelOf=i=>i.type==='attendance_save'?'حفظ تحضير الحلقة والتحقق من استلام الخادم'
 :i.type==='attendance_all'?'تحضير جميع الطلاب حاضرين (دون حفظ بعد)'
 :i.type==='attendance'?'تسجيل '+({present:'حاضر',absent:'غائب',late:'متأخر',excused:'مستأذن'}[i.status])+(i.reason?' '+(i.reason==='excused'?'بعذر':'دون عذر'):'')
 :i.type==='navigate'?'الانتقال إلى '+i.name
 :i.type==='grade'?'تسجيل '+i.grade+' في '+({memorization:'الحفظ',recentReview:'المراجعة الصغرى',review:'المراجعة الكبرى'}[i.kind])
 :i.type==='metrics'?(i.mode==='add'?'إضافة ':'تسجيل ')+i.changes.map(c=>c.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[c.metric])).join(' و')
 :i.type==='metric'?(i.mode==='add'?'إضافة ':'تسجيل ')+i.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[i.metric])
 :i.type==='save'?(i.share?'حفظ الحصيلة ثم مشاركة ولي الأمر':'حفظ الحصيلة')
 :i.type==='share'?'فتح مشاركة الحصيلة لولي الأمر':'لم أتعرف على أمر محدد';
// Normalize Chrome's incremental transcript updates across recognition restarts.
// Final results from a new session may repeat a trailing phrase from the old.
const joinSpeech=(prior,next)=>{
 const a=normalize(prior).split(' ').filter(Boolean),b=normalize(next).split(' ').filter(Boolean);
 if(!a.length)return b.join(' ');
 if(!b.length)return a.join(' ');
 for(let n=Math.min(a.length,b.length);n>0;n--){
  if(a.slice(-n).join(' ')===b.slice(0,n).join(' '))
   return [...a,...b.slice(n)].join(' ');
 }
 return [...a,...b].join(' ');
};
// Correct a repeated first name in one Android Web Speech result, but only
// when it belongs to exactly one registered student.
const fixStudentEcho=(value,studentNames=[])=>{
 const normalized=normalize(value),echo=normalized.match(/^(\S+)(?:\s+\1){1,5}(?=\s|$)/u);
 if(!echo)return String(value||'');
 const remainder=(echo[1]+' '+normalized.slice(echo[0].length).trim()).trim();
 const words=remainder.split(' ');let unique=false;
 for(let n=2;n<=Math.min(7,words.length);n++){
  const matches=matchingStudents(studentNames,words.slice(0,n).join(' '));
  if(matches.length===1&&(n===words.length||/^(?:حاضر|متاخر|غائب|مستاذن|الحفظ|الدرس|جنب|المراجعه|مراجعه|التثبيت|احفظ|و)/.test(words[n]||'')))
   unique=true;
 }
 if(!unique)return String(value||'');
 return String(value||'').replace(/^(\S+)(?:\s+\1){1,5}(?=\s|$)/u,'$1');
};
// Parse an entire Arabic utterance as ordered *atomic* instructions, carrying
// its current Quran task across short metric clauses ("3 أخطاء، شكين").
// Do not infer a student when the spoken name is ambiguous.
const splitBatch=(spoken,studentNames=[])=>{
 const normalized=fixStudentEcho(spoken,studentNames).replace(/[،؛;.!؟\n]+/g,' | ')
  .replace(/\s+(?:ثم|بعدها|وبعدين|وبعدها|بعد\s+ذلك)\s+/gu,' | ');
 const commands=[];
 const NUM=NUMBER,UNIT=METRIC;
 const metricAtom=new RegExp('^(?:و)?(?:(?:'+NUM+')\\s+)?'+UNIT+'(?:\\s+(?:'+NUM+'))?(?=\\s|$)','u');
 const categoryStart=/^(?:المراجعه\s+(?:الصغري|الصغيره|القريبه|الكبري|الكبيره)|مراجعه\s+(?:صغري|قريبه|كبري|كبيره)|جنب\s+الدرس|جنبدرس|التثبيت|الحفظ(?:\s+الجديد)?|الحفظ\s+الجديد|الدرس(?:\s+الجديد)?|المراجعه|المراجعات|مراجعه|التثبيت)(?=\s|$)/u;
 const gradeStart=/^(?:لم\s+(?:يحفظ|يسمع)|ما\s+(?:حفظ|سمع)|يحتاج\s+اعاده|جيد\s+جدا|ممتاز|جيد)(?=\s|$)/u;
 const attendanceStart=/^(?:حاضر|غائب|غايب|متاخر|مستاذن)(?=\s|$)/u;
 const saveStart=/^(?:(?:احفظ|حفظ|ثبت|اعتمد)\s+(?:التحضير|الحضور|الحصيله|حصيله|التقدير)|(?:ارسل|شارك)\s+(?:الحصيله|حصيله|ولي\s+الامر))(?=\s|$)/u;
 const stripConnector=s=>s.replace(/^و(?=(?:الحفظ|الدرس|جنب|التثبيت|المراجعه|مراجعه|حاضر|غائب|غايب|متاخر|مستاذن|احفظ|ارسل|شارك|[0-9]|اخطاء|خطا|شكوك|شكين))/, '');
 const prefixStudent=s=>{
  const withoutVerb=s.replace(/^(?:(?:انتقل|اذهب|افتح|روح|اعرض|اختر|اختار)(?:\s+الي|\s+عند)?\s+)?(?:الطالب|الطالبه)\s+/u,'')
   .replace(/^(?:انتقل|اذهب|افتح|روح|اعرض|اختر|اختار)(?:\s+الي|\s+عند)?\s+/u,'');
  const words=withoutVerb.split(' '),candidates=[];
  for(let length=1;length<=Math.min(7,words.length);length++){
   const candidate=words.slice(0,length).join(' ');
   const hits=matchingStudents(studentNames,candidate);
   if(hits.length===1){
    const rest=words.slice(length).join(' ');
    if(!rest||/^(?:و?حاضر|و?متاخر|و?غائب|و?مستاذن|و?الحفظ|و?الدرس|و?جنب|و?المراجعه|و?مراجعه|و?التثبيت|و?احفظ)/.test(rest))
     candidates.push({index:hits[0].i,length,rest});
   }
  }
  return candidates.sort((a,b)=>b.length-a.length)[0]||null;
 };
 let kind=null;
 const putMetric=s=>{
  if(!kind)return false;
  let rest=s,parts=[];
  for(let iter=0;iter<5;iter++){
   const match=rest.match(metricAtom);
   if(!match)break;
   let unit=match[0].trim();
   let parsed=metricParts(unit);
   // A joined conjunction («وشكين») is different from «واحد خطأ»;
   // don't cut the initial waw off the number «واحد».
   if(!parsed?.length&&unit.startsWith('و')&&metricParts(unit.slice(1))?.length){
    unit=unit.slice(1);parsed=metricParts(unit);
   }
   if(parsed?.length)parts.push(unit);
   else if(/^(?:خطا|غلط|شك|شكوك|تجويد)$/.test(unit))parts.push('واحد '+unit);
   else break;
   rest=rest.slice(match[0].length).trim();
  }
  if(!parts.length)return false;
  commands.push(kind+' '+parts.join(' '));
  return rest;
 };
 const consume=(text)=>{
  let s=normalize(text),loops=0;
  // Keep complete explicit count-change and save phrases atomic.
  const full=intentOf(s,studentNames);
  if(full.type==='global'){commands.push(s);return}
  if(['metric','metrics','attendance_all','attendance_save','save','share'].includes(full.type)&&
     /^(?:اضف|زد|زود|تحضير الطلاب|حضور الطلاب|احفظ|حفظ|ثبت|اعتمد|ارسل|شارك)(?:\s|$)/u.test(s)){
   commands.push(s);return;
  }
  while(s&&loops++<35){
   s=stripConnector(s).trim();
   if(!s)break;
   const student=prefixStudent(s);
   if(student){
    commands.push(studentNames[student.index]);
    kind=null;s=student.rest;continue;
   }
   const cat=s.match(categoryStart);
   if(cat){
    kind=cat[0];s=s.slice(cat[0].length).trim();
    const grade=s.match(gradeStart);
    if(grade){commands.push(kind+' '+grade[0]);s=s.slice(grade[0].length).trim();continue}
    if(!s){commands.push(kind);break}
    continue;
   }
   const attendance=s.match(attendanceStart);
   if(attendance){
    let value=attendance[0];s=s.slice(value.length).trim();
    if(/^(?:بدون|بلا)\s+عذر|^بعذر|^معذور/.test(s)){
     const reason=s.match(/^(?:(?:بدون|بلا)\s+عذر|بعذر|معذور)/)[0];
     value+=' '+reason;s=s.slice(reason.length).trim();
    }
    commands.push(value);continue;
   }
   const save=s.match(saveStart);
   if(save){commands.push(save[0]);s=s.slice(save[0].length).trim();continue}
   const metric=putMetric(s);
   if(metric!==false){s=metric;continue}
   // A segment we don't understand is reported, never discarded. Recover at
   // the next recognizable boundary rather than stopping the whole dictation.
   const next=s.search(/\s+(?=(?:و?الحفظ|و?الدرس|و?جنب|و?المراجعه|و?مراجعه|و?حاضر|و?غائب|و?متاخر|و?مستاذن|و?احفظ)(?:\s|$))/u);
   if(next>=0){commands.push(s.slice(0,next));s=s.slice(next).trim()}
   else{commands.push(s);break}
  }
 };
 normalized.split('|').forEach(consume);
 return commands.filter(Boolean);
};
const batchOf=(raw,names=[])=>splitBatch(raw,names).map(command=>({command,intent:intentOf(command,names)}));
// The microphone entry is visible on the authenticated home screen, even
// before a circle is opened. Detailed student commands need a loaded session.
let entryObserver=null;
let mountedSession=null;
function disposeMountedSession(){
 const instance=mountedSession;
 if(!instance)return;
 mountedSession=null;
 instance.observer?.disconnect?.();
 instance.stop?.();
 instance.panel?.remove?.();
 const launcher=document.getElementById('sanabil-voice-entry');
 if(launcher)launcher.hidden=false;
}
// The body-level voice portal must also outrank browser stacking layers.
// A non-modal manual popover enters the native top layer when supported.
// Older browsers retain the fixed-position high-z-index fallback.
function promoteToTopLayer(node){
 if(typeof node?.showPopover!=='function')return false;
 try{
  node.setAttribute('popover','manual');
  node.showPopover();
  return true;
 }catch{
  node.removeAttribute?.('popover');
  return false;
 }
}
function showLauncher(){
 if(!document.body||!document.querySelector('.app-content,.mobile-nav,.sl-live'))return null;
 let entry=document.getElementById('sanabil-voice-entry');
 if(!entry){
  entry=document.createElement('aside');entry.id='sanabil-voice-entry';
  entry.dir='rtl';entry.className='sl-voice-entry';
  const trigger=document.createElement('button');trigger.type='button';
  trigger.className='button button-soft';trigger.textContent='🎙 الموجه الصوتي';
  trigger.setAttribute('aria-label','فتح الموجه الصوتي');
  const guidance=document.createElement('section');guidance.className='sl-voice-entry-help';guidance.hidden=true;
  guidance.setAttribute('role','region');guidance.setAttribute('aria-label','الموجه الصوتي');
  const info=document.createElement('p');info.textContent='الموجه الصوتي متاح أثناء جلسة الحصيلة لتحديد الطالب وإدخال التقديرات. افتح الحصيلة واختر الحلقة ثم افتح جلستها.';
  const goto=document.createElement('button');goto.type='button';
  goto.className='button button-primary';goto.textContent='انتقل إلى الحصيلة اليومية';
  goto.onclick=()=>{
   const candidates=[...document.querySelectorAll('button,[role="tab"],a')];
   const tab=candidates.find(node=>/^\s*الحصيلة اليومية\s*$/.test(node.textContent||''));
   if(tab){guidance.hidden=true;tab.click()}
   else info.textContent='افتح تبويب «الحصيلة اليومية» من الشريط العلوي، ثم اختر الحلقة واضغط فتح الجلسة.';
  };
  const close=document.createElement('button');close.type='button';
  close.className='button button-soft';close.textContent='إغلاق';
  close.onclick=()=>{guidance.hidden=true};
  guidance.append(info,goto,close);entry.append(trigger,guidance);document.body.append(entry);promoteToTopLayer(entry);
  trigger.onclick=()=>{
   const active=document.querySelector('[data-sanabil-voice] button[aria-label="تشغيل الموجه الصوتي"]');
   if(active){active.click();return}
   guidance.hidden=!guidance.hidden;
   if(!guidance.hidden)guidance.querySelector?.('button')?.focus?.({preventScroll:true});
  };
 }
 entry.hidden=!!document.querySelector('[data-sanabil-voice]');
 if(!entryObserver&&window.MutationObserver){
  let scheduled=false;
  entryObserver=new MutationObserver(()=>{
   if(scheduled)return;scheduled=true;
   // Defer to avoid reacting to intermediate DOM removal during a rerender.
   Promise.resolve().then(()=>{
    scheduled=false;
    const current=document.getElementById('sanabil-voice-entry');
    if(!current)return;
    // React replaces the .sl-live view while loading and switching tabs.
    // Only remove the launcher after the authenticated app shell itself exits.
    if(!document.querySelector('.app-content,.mobile-nav,.sl-live')){
     current.remove();entryObserver.disconnect();entryObserver=null;return;
    }
    current.hidden=!!document.querySelector('[data-sanabil-voice]');
   });
  });
  entryObserver.observe(document.body,{childList:true,subtree:true});
 }
 return entry;
}
function mount(box,{cards,names,ids=[]}={}){
 if(!box?.isConnected||!cards?.length||!document.body)return;
 // At most one assistant per classroom session. Rendering a new circle/date
 // disposes the former portal, even if the .sl-data wrapper is reused.
 if(mountedSession?.box===box&&mountedSession.panel?.isConnected
  &&mountedSession.cards?.[0]===cards[0]&&cards.every(card=>card.isConnected))return;
 disposeMountedSession();
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const panel=document.createElement('section');panel.className='sl-voice-panel';panel.dataset.sanabilVoice='true';
 const launcher=document.createElement('button');launcher.type='button';launcher.className='button button-soft';
 launcher.textContent='🎙 الموجه الصوتي';launcher.setAttribute('aria-label','تشغيل الموجه الصوتي');
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.textContent=Recognition?'أملِ اسم الطالب ثم عدة أوامر؛ سأمنحك وقتًا لإكمال الإملاء قبل التنفيذ.':'اكتب عدة أوامر مفصولة بفاصلة أو ثم.';
 const detail=document.createElement('div');detail.className='sl-voice-command';
 const close=document.createElement('button');close.type='button';close.className='sl-voice-close';close.textContent='✕';
 close.setAttribute('aria-label','إغلاق نافذة الموجه الصوتي');
 // The outcome cards already live inside a submission form. Never nest a form:
 // browsers can redirect that submit to «حفظ حصيلة الحلقة» instead.
 const manual=document.createElement('div');manual.className='sl-voice-manual';
 const manualInput=document.createElement('input');manualInput.type='text';manualInput.dir='rtl';
 manualInput.setAttribute('aria-label','اكتب أمرًا للمنصة');
 manualInput.placeholder='مثال: حاضر، الحفظ ممتاز، جنب الدرس 5 شكوك…';
 const manualGo=document.createElement('button');manualGo.type='button';manualGo.className='button button-primary';
 manualGo.textContent='تنفيذ الأمر المكتوب';
 manual.append(manualInput,manualGo);
 const recordButton=document.createElement('button');recordButton.type='button';
 recordButton.className='button button-primary sl-voice-record';
 recordButton.textContent='🎙 بدء التسجيل';
 recordButton.setAttribute('aria-label','بدء تسجيل مجموعة الأوامر الصوتية');
 if(!Recognition)recordButton.disabled=true;
 panel.append(launcher,close,status,manual,recordButton,detail);
 // Portal out of .sl-student-grid/.sl-content: their transform, contain,
 // opacity and local stacking contexts otherwise let the bulk-attendance bar
 // cover the assistant regardless of its z-index.
 document.body.append(panel);
  promoteToTopLayer(panel);
 const entry=document.getElementById('sanabil-voice-entry');if(entry)entry.hidden=true;
 if(!Recognition){
  launcher.title='التعرف الصوتي غير مدعوم في هذا المتصفح؛ يمكنك كتابة الأمر من النافذة نفسها.';
  status.textContent='التعرف على الصوت غير مدعوم هنا. اكتب الأمر أدناه، أو جرّب Chrome مع إذن الميكروفون.';
 }
 let active=-1,selectionPinned=false,executingBatch=false,recognition=null,pending=null;
 let listening=false,stopping=false,silenceTimer=null,finishTimer=null,fragments=[],liveSpeech='',captureError='',clarificationTries=0;
 const SILENCE_MS=2000;
 const START_MS=7500;
 const clearSpeechTimers=()=>{clearTimeout(silenceTimer);clearTimeout(finishTimer);silenceTimer=finishTimer=null};
 const abortCapture=()=>{
  listening=false;stopping=true;clearSpeechTimers();fragments=[];liveSpeech='';
  const old=recognition;recognition=null;
  if(old){old.onresult=old.onend=old.onerror=null;try{old.abort?.()}catch{}}
  recordButton.textContent='🎙 بدء التسجيل';recordButton.setAttribute('aria-pressed','false');
 };
 const collapse=()=>{
  abortCapture();pending=null;detail.replaceChildren();
  panel.classList.remove('sl-voice-open');
  panel.dataset.expanded='false';launcher.setAttribute('aria-expanded','false');
  status.textContent=Recognition?'اضغط زر الموجه لإدخال أمر جديد.':'اكتب الأمر عند فتح الموجه.';
 };
 close.onclick=collapse;
 launcher.setAttribute('aria-expanded','false');panel.dataset.expanded='false';
 const shownCards=()=>cards.filter(c=>c.isConnected&&!c.hidden);
 const selectCard=index=>{
  if(index<0||!cards[index]?.isConnected)return false;
  active=index;selectionPinned=true;
  const card=cards[index];
  if(card.hidden){
   const searchBox=box.querySelector('#sl-outcome-search-input');
   if(searchBox){searchBox.value='';searchBox.dispatchEvent(new Event('input',{bubbles:true}))}
  }
  card.scrollIntoView({behavior:'smooth',block:'start'});
  card.focus({preventScroll:true});
  return true;
 };
 const currentCard=()=>{
  if(selectionPinned&&active>=0&&cards[active]?.isConnected&&!cards[active].hidden){
   const rect=cards[active].getBoundingClientRect?.();
   const anchor=Math.max(100,Math.min((window.innerHeight||700)*.38,350));
   if(executingBatch||(rect&&rect.top<=anchor&&rect.bottom>=anchor))
    return {card:cards[active],index:active};
  }
  // The teacher scrolls a long outcomes page; a previously selected student
  // must not remain the editing target after moving to another card.
  const focused=document.activeElement?.closest?.('.sl-student-card');
  if(focused&&cards.includes(focused)&&!focused.hidden){
   active=cards.indexOf(focused);return {card:focused,index:active}
  }
  const anchor=Math.max(100,Math.min((window.innerHeight||700)*.38,350));
  const inViewport=c=>{
   if(!c?.isConnected||c.hidden)return false;
   const rect=c.getBoundingClientRect?.();
   return !!rect&&rect.top<=anchor&&rect.bottom>=anchor;
  };
  const candidate=shownCards().find(inViewport);
  if(candidate){active=cards.indexOf(candidate);return {card:candidate,index:active}}
  if(active>=0&&inViewport(cards[active]))return {card:cards[active],index:active};
  return null;
 };
 const matchStudent=name=>{
  const token=normalize(name).replace(/(?:من فضلك|لو سمحت|الان)$/,'').trim();
  if(token.length<2)return null;
  const matches=matchingStudents(names,token);
  return matches.length===1?matches[0].i:null;
 };
 const targetKey=(card,kind)=>{
  const gradeButtons=[...card.querySelectorAll('[data-grade-key]')];
  const metricButtons=[...card.querySelectorAll('[data-metric-count]')];
  const keys=[...new Set([...gradeButtons.map(b=>b.dataset.gradeKey),...metricButtons.map(b=>b.dataset.metricKey)].filter(Boolean))];
  if(kind==='review'){
   const review=keys.filter(k=>k.startsWith('review:'));
   if(review.length!==1)throw Error('لدى الطالب عدة مراجعات كبرى أو لا توجد مراجعة؛ اختر المراجعة المطلوبة يدويًا.');
   return review[0];
  }
  if(!keys.includes(kind))throw Error('لا يوجد مقرر '+(kind==='memorization'?'للحفظ الجديد':'للمراجعة الصغرى')+' لهذا الطالب في التاريخ المحدد.');
  return kind;
 };
 const attendanceButtons=card=>[...card.querySelectorAll('[data-att-student],[data-tl-att]')];
 const getAttendance=card=>attendanceButtons(card).find(b=>b.classList?.contains('active'))?.dataset?.attValue
  ||attendanceButtons(card).find(b=>b.classList?.contains('active'))?.dataset?.tlAttValue||null;
 const executionError=(card,element,label)=>{
  const readonly=box.querySelector?.('.sl-outcome-readonly')?.textContent?.trim();
  if(readonly)return 'هذه الجلسة للعرض فقط ولا تسمح بتعديل الحضور أو التقديرات الآن. '+readonly;
  if(element?.disabled){
   const state=card?getAttendance(card):null;
   if(['absent','excused'].includes(state))return 'الطالب مسجل '+(state==='absent'?'غائبًا':'مستأذنًا')+'؛ لا يمكن تقدير الدرس حتى تغيير الحضور.';
   return 'خانة '+label+' معطلة لهذا الطالب أو اليوم؛ راجع تصنيف اليوم ومقرر الطالب وصلاحية الجلسة.';
  }
  return 'تعذر العثور على خانة '+label+' للطالب المحدد؛ اختر الطالب ومقررًا موجودًا اليوم ثم أعد المحاولة.';
 };
 const prepare=interpretation=>{
  pending=interpretation;detail.replaceChildren();
  if(interpretation.type==='unknown'){
   status.textContent=interpretation.reason||'لم أتعرف على الأمر. جرّب «أحمد دحمان» أو «الحفظ ممتاز» أو «جنب الدرس 5 شكوك».';
   pending=null;return;
  }
  if(interpretation.type==='navigate'){
   const index=matchStudent(interpretation.name);
   if(index===null){status.textContent='الاسم غير محدد أو يطابق أكثر من طالب؛ انطق الاسم الكامل بوضوح.';pending=null;return}
   selectCard(index);status.textContent='انتقلت إلى '+names[index]+' دون تعديل أي حصيلة.';pending=null;
   return {ok:true,index,type:'navigate',reason:status.textContent};
  }
  let chosen=null;
  if(interpretation.type==='attendance'&&interpretation.target.scope==='student'){
   const index=interpretation.target.index;
   if(!cards[index]?.isConnected||cards[index].hidden){
    status.textContent='بطاقة الطالب المطلوبة غير ظاهرة؛ انتقل إليه أولًا.';pending=null;return;
   }
   chosen={card:cards[index],index};active=index;selectionPinned=true;
  }else if(interpretation.type!=='attendance_all'&&interpretation.type!=='attendance_save'){
   chosen=currentCard();
   if(!chosen){
    status.textContent='حدد الطالب أولًا بذكر اسمه، أو انتقل إلى بطاقته. لن أختار طالبًا آخر بالنيابة عنك.';
    pending=null;return;
   }
  }
  const readonlyReason=box.querySelector?.('.sl-outcome-readonly')?.textContent?.trim();
  if(readonlyReason&&interpretation.type!=='navigate'){
   status.textContent='لا يمكن تنفيذ هذا الأمر لأن جلسة الحلقة للعرض فقط. '+readonlyReason;
   pending=null;return;
  }
  const summary=document.createElement('p');
  summary.textContent=(chosen?names[chosen.index]+' — ':'الحلقة — ')+labelOf(interpretation);
  const confirm=document.createElement('button');confirm.type='button';confirm.className='button button-primary';
  confirm.textContent=/save|share/.test(interpretation.type)?'تأكيد الإجراء':'تنفيذ الأمر';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='button button-soft';cancel.textContent='إلغاء';
  detail.append(summary);
  let worked=false;
  cancel.onclick=()=>{pending=null;detail.replaceChildren();status.textContent='ألغي الأمر دون تعديل.'};
  const verifiedClick=(button,check,label)=>{
   if(!button||button.disabled)throw Error(executionError(chosen?.card,button,label));
   button.click();
   if(check&&!check())throw Error('لم يؤكد زر '+label+' تغيير الخانة. لم أعتبر الأمر منفذًا؛ راجع البطاقة.');
  };
  confirm.onclick=()=>{
   if(pending!==interpretation)return;
   confirm.disabled=true;
   try{
    const i=interpretation,card=chosen?.card;
    if(card&&!card.isConnected)throw Error('أعيد تحميل بطاقات الطلاب. حدّد الطالب مجددًا قبل التعديل.');
    if(i.type==='attendance'){
     const button=attendanceButtons(card).find(b=>(b.dataset.attValue||b.dataset.tlAttValue)===i.status);
     verifiedClick(button,()=>button.classList?.contains('active'),'حضور الطالب');
     if(i.status==='absent'){
      const reason=card.querySelector('[data-quran-absence-reason],[data-tl-absence-reason]');
      if(!reason)throw Error('لم أجد اختيار نوع الغياب في البطاقة؛ راجع حضور الطالب.');
      if(i.reason){
       reason.value=i.reason;
       reason.dispatchEvent(new Event('change',{bubbles:true}));
       if(reason.value!==i.reason)throw Error('لم يتأكد نوع الغياب؛ اختره يدويًا.');
      }
      status.textContent=i.reason?'تم تسجيل غياب الطالب ونوعه في المسودة. احفظ التحضير لتثبيته.':'تم تسجيل غياب الطالب في المسودة. اختر غيابًا بعذر أو بدون عذر ثم احفظ التحضير.';
     }else status.textContent='تم تحديد حضور الطالب «'+labelOf(i)+'» في المسودة. احفظ التحضير لتثبيته.';
    }else if(i.type==='attendance_all'){
     const button=box.querySelector('[data-action="all-present"],[data-action="tl-all-present"]');
     if(!button||button.disabled)throw Error('زر تحضير جميع الطلاب غير متاح لهذه الجلسة.');
     button.click();status.textContent='بدأ تحديد جميع الطلاب حاضرين. راجع حالات الاستثناء، ثم احفظ التحضير.';
    }else if(i.type==='attendance_save'){
     const button=box.querySelector('[data-action="save-attendance"],[data-action="tl-save-attendance"]');
     if(!button||button.disabled)throw Error('زر حفظ التحضير غير متاح لهذه الجلسة.');
     button.click();status.textContent='أُرسل طلب حفظ التحضير؛ انتظر تأكيد قاعدة البيانات أو إشعار المزامنة.';
    }else if(i.type==='grade'){
     const gradeButtons=[...card.querySelectorAll('[data-grade-key]')];
     const talaqqinButtons=!gradeButtons.length&&i.kind==='memorization'
      ?[...card.querySelectorAll('[data-tl-grade-student]')]:[];
     const key=gradeButtons.length?targetKey(card,i.kind):null;
     const button=gradeButtons.length
      ?gradeButtons.find(b=>b.dataset.gradeKey===key&&normalize(b.dataset.gradeValue)===normalize(i.grade))
      :talaqqinButtons.find(b=>normalize(b.dataset.tlGradeValue)===normalize(i.grade));
     verifiedClick(button,()=>button.classList?.contains('active'),'تقدير '+i.grade);
     status.textContent='تم تسجيل تقدير «'+i.grade+'» في مسودة الطالب «'+names[chosen.index]+'». احفظ الحصيلة لتثبيته.';
    }else if(i.type==='metric'||i.type==='metrics'){
     const key=targetKey(card,i.kind),changes=i.type==='metrics'?i.changes:[{metric:i.metric,count:i.count}];
     const inputs=changes.map(item=>{
      const input=[...card.querySelectorAll('[data-metric-count]')].find(b=>b.dataset.metricKey===key&&b.dataset.metricField===item.metric);
      if(!input||input.disabled)throw Error(executionError(card,input,'عداد '+item.metric));
      const current=Number(input.value||0);
      if(!Number.isFinite(current))throw Error('قيمة العداد الحالية غير صالحة.');
      const value=i.mode==='add'?current+item.count:item.count;
      if(value<0||value>100)throw Error('العدد الناتج خارج المدى المسموح (0–100).');
      return {input,value};
     });
     // Validate every field before touching any counter.
     inputs.forEach(({input,value})=>{
      input.value=String(value);
      input.dispatchEvent(new Event('change',{bubbles:true}));
     });
     if(inputs.some(({input,value})=>Number(input.value)!==value))
      throw Error('لم يتأكد تحديث أحد العدادات. راجع القيم قبل الحفظ.');
     status.textContent='تم تحديث '+inputs.length+' من العدادات في مسودة الطالب. احفظ الحصيلة لتثبيتها.';
    }else if(i.type==='save'){
     const button=card.querySelector('[data-action^="save-student-"],[data-action^="tl-save-"]');
     if(!button||button.disabled)throw Error(executionError(card,button,'حفظ الحصيلة'));
     button.click();
     status.textContent='بدأ حفظ الحصيلة. لا تعتبرها محفوظة حتى يظهر تأكيد الخادم في بطاقة الطالب.';
     if(i.share){
      // Do not require another click. Wait for the real save status before
      // launching the user's usual sharing UI; never send stale results.
      const attemptShare=(attempts=0)=>{
       const message=card.querySelector('[data-save-status]')?.textContent||box.querySelector('.sl-message')?.textContent||'';
       if(/حصيلة محفوظة ومؤكدة|تم حفظ حصيلة|تم تحديث حصيلة|تم الحفظ والتحقق/.test(message)){
        const wa=card.querySelector('[data-action^="wa-"],[data-action^="tl-card-"]');
        if(wa&&!wa.disabled){wa.click();status.textContent='فُتحت مشاركة ولي الأمر بعد التحقق من الحفظ.'}
        else status.textContent='تم الحفظ لكن مشاركة ولي الأمر غير متاحة.';
       }else if(attempts<15)setTimeout(()=>attemptShare(attempts+1),400);
       else status.textContent='لم يصل تأكيد حفظ من الخادم؛ لم أشارك بيانات قديمة.';
      };
      setTimeout(()=>attemptShare(),400);
      detail.replaceChildren();pending=null;worked=true;return;
     }
    }else if(i.type==='share'){
     const share=card.querySelector('[data-action^="wa-"],[data-action^="tl-card-"]');
     if(!share||share.disabled)throw Error('المشاركة غير متاحة؛ احفظ الحصيلة أولًا.');
     share.click();status.textContent='فُتحت المشاركة؛ راجع المحتوى وأرسله من واتساب بنفسك.';
    }
    pending=null;detail.replaceChildren();worked=true;
   }catch(error){
    status.textContent=error?.message||'تعذر تنفيذ الأمر؛ لم أعتبره ناجحًا.';
    confirm.disabled=false;
   }
  };
  confirm.onclick();
  return {ok:worked,index:chosen?.index,type:interpretation.type,reason:status.textContent};
 };
 const executeBatch=text=>{
  const jobs=batchOf(text,names),log=[],touched=new Set(),saved=new Set();
  if(jobs.some(job=>job.intent.type==='global')){
   if(jobs.length!==1){status.textContent='افصل أمر الانتقال عن تعديل الحصيلة حتى لا تفقد التعديلات.';return {success:0,attempted:1}}
   const result=window.SanabilVoiceGlobal?.run?.(jobs[0].command,message=>{status.textContent=message});
   return {success:result?.ok?1:0,attempted:1};
  }
  executingBatch=true;let targetUncertain=false;
  let attendanceTouched=false,attendanceSaved=false,incompleteAbsence=false;
  if(!jobs.length){executingBatch=false;status.textContent='لم أسمع أو أقرأ أوامر مفهومة.';return {success:0,attempted:0}}
  for(const job of jobs){
   // A misheard or ambiguous student name must not redirect the following
   // grades to whichever student's card was previously active.
   if(targetUncertain&&['attendance','grade','metric','metrics','save','share'].includes(job.intent.type)){
    log.push({ok:false,message:job.command+' — تخطيت التعديل حتى يتحدد الطالب المقصود.'});
    continue;
   }
   const done=prepare(job.intent);
   if(!done?.ok){
    log.push({ok:false,message:job.command+' — '+(done?.reason||status.textContent)});
    if(['navigate','unknown'].includes(job.intent.type))targetUncertain=true;
    continue;
   }
   log.push({ok:true,message:job.command+' — '+done.reason});
   if(done.type==='navigate'||(done.type==='attendance'&&job.intent.target?.scope==='student'))targetUncertain=false;
   if(['grade','metric','metrics'].includes(done.type)&&Number.isInteger(done.index))touched.add(done.index);
   if(done.type==='save'&&Number.isInteger(done.index))saved.add(done.index);
   if(['attendance','attendance_all'].includes(done.type)){
    attendanceTouched=true;
    if(done.type==='attendance'&&job.intent.status==='absent'&&!job.intent.reason)incompleteAbsence=true;
   }
   if(done.type==='attendance_save')attendanceSaved=true;
  }
  // Auto-save once per changed student at the end of a dictation.
  for(const index of touched){
   if(saved.has(index))continue;
   selectCard(index);
   const done=prepare({type:'save',share:false});
   log.push({ok:!!done?.ok,message:done?.ok
    ?'أُرسل طلب حفظ حصيلة '+names[index]+'؛ بانتظار تأكيد الخادم'
    :'تعذر حفظ حصيلة '+names[index]+': '+(done?.reason||status.textContent)});
  }
  if(attendanceTouched&&!attendanceSaved){
   if(incompleteAbsence)log.push({ok:false,message:'يلزم تحديد سبب الغياب قبل حفظ التحضير تلقائيًا.'});
   else{
    const done=prepare({type:'attendance_save'});
    log.push({ok:!!done?.ok,message:done?.ok?'أُرسل طلب حفظ التحضير؛ بانتظار تأكيد الخادم':
     'تعذر حفظ التحضير: '+(done?.reason||status.textContent)});
   }
  }
  // Show results instead of buttons that demand another click.
  detail.replaceChildren(...log.map(item=>{
   const line=document.createElement('p');
   line.className=item.ok?'sl-voice-result-ok':'sl-voice-result-failed';
   line.textContent=(item.ok?'✓ ':'⚠ ')+item.message;
   return line;
  }));
  executingBatch=false;
  const complete=log.filter(item=>item.ok).length;
  status.textContent=(complete===0?(log[0]?.message||'أعد توضيح الأمر.'):'تم تنفيذ '+complete+' خطوة من '+log.length)+'؛ الحفظ على الخادم لا يعدّ مؤكدًا حتى تظهر رسالة نجاح المزامنة.';
  return {success:complete,attempted:log.length};
 };
 const submitWrittenCommand=event=>{
  event?.preventDefault?.();event?.stopPropagation?.();
  const text=manualInput.value.trim();
  if(!text){status.textContent='اكتب أمرًا قبل التنفيذ.';manualInput.focus();return}
  panel.classList.add('sl-voice-open');panel.dataset.expanded='true';
  executeBatch(text);
 };
 manualGo.addEventListener('click',submitWrittenCommand);
 manualInput.addEventListener('keydown',event=>{
  if(event.key==='Enter')submitWrittenCommand(event);
 });
 const finishCapture=()=>{
  if(!listening)return;
  listening=false;stopping=false;clearSpeechTimers();
  recordButton.textContent='🎙 بدء التسجيل';recordButton.setAttribute('aria-pressed','false');
  const heard=fixStudentEcho(joinSpeech(fragments.join(' '),liveSpeech),names).trim();
  fragments=[];liveSpeech='';
  if(heard){
   const result=executeBatch(heard);
   if(result?.attempted&&result.success===0&&clarificationTries<1){
    clarificationTries++;
    const explanation=status.textContent;
    setTimeout(()=>{if(panel.isConnected&&!listening&&panel.classList.contains('sl-voice-open')){
     status.textContent=explanation+' سأستمع مرة ثانية لتوضيح طلبك.';
     startRecording(true);
    }},450);
   }
  }else status.textContent=captureError||'لم أسمع أمرًا واضحًا؛ اضغط بدء التسجيل وجرب مجددًا.';
  captureError='';
 };
 const finishRecording=()=>{
  if(!listening||stopping)return;
  stopping=true;clearTimeout(silenceTimer);
  const instance=recognition;
  if(!instance){finishCapture();return}
  try{instance.stop()}catch{finishCapture();return}
  finishTimer=setTimeout(finishCapture,1100);
 };
 const restartSilenceClock=(initial=false)=>{
  clearTimeout(silenceTimer);
  // A lone student name is NOT the end of a command bundle. Android Chrome
  // may pause after its first result, before transcribing attendance/grades.
  const heard=fixStudentEcho(joinSpeech(fragments.join(' '),liveSpeech),names);
  const hasAction=batchOf(heard,names).some(({intent})=>!['navigate','unknown'].includes(intent.type));
  const wait=initial?START_MS:SILENCE_MS;
  if(listening&&!stopping)silenceTimer=setTimeout(finishRecording,wait);
 };
 const beginRecognition=()=>{
  if(!listening||stopping)return;
  const instance=new Recognition();recognition=instance;
  instance.lang='ar-SA';instance.continuous=true;instance.interimResults=true;
  instance.maxAlternatives=3;
  // Contextual vocabulary hints are supported by some Chromium builds only.
  // They improve recognition of Quran terms and the actual session names
  // without obtaining, storing, or uploading a second microphone stream.
  try{
   const Phrase=window.SpeechRecognitionPhrase;
   if(typeof Phrase==='function'&&'phrases' in instance){
    const hints=[...new Set([...names.slice(0,70),'الحفظ الجديد','جنب الدرس','المراجعة الكبرى','المراجعة الصغرى','حاضر','متأخر','جيد جداً','أخطاء','شكوك'])];
    instance.phrases=hints.map(x=>new Phrase(x,3));
   }
  }catch{}

  instance.onresult=event=>{
   if(recognition!==instance)return;
   let words='';
   for(let index=0;index<(event.results?.length||0);index++)
    words+=' '+(event.results[index]?.[0]?.transcript||'');
   const next=words.trim(),changed=next!==liveSpeech;
   liveSpeech=next;
   const spoken=fixStudentEcho(joinSpeech(fragments.join(' '),liveSpeech),names);
   const commands=batchOf(spoken,names);
   const heardOnlyName=commands.length>0&&commands.every(({intent})=>['navigate','unknown'].includes(intent.type));
   status.textContent='أستمع… '+spoken+(heardOnlyName?' — أكمل الحضور والحفظ والمراجعة، ما زلت أستمع.':'');
   if(changed&&!stopping)restartSilenceClock();
  };
  instance.onerror=event=>{
   if(recognition!==instance)return;
   if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){
    captureError='تعذر الوصول إلى الميكروفون؛ اسمح بالوصول ثم حاول من جديد.';
    finishRecording();
   }else if(!['no-speech','aborted'].includes(event.error))
    captureError='انقطع التعرف الصوتي؛ يمكنك الإملاء مرة أخرى أو كتابة الأوامر.';
  };
  instance.onend=()=>{
   if(recognition!==instance)return;
   recognition=null;
   if(stopping){finishCapture();return}
   if(liveSpeech){fragments=[joinSpeech(fragments.join(' '),liveSpeech)];liveSpeech=''}
   if(listening&&!stopping)restartSilenceClock();
   // Android frequently closes a recognition session while the teacher is
   // still speaking. Resume after a short delay to avoid audio-service races.
   if(listening)setTimeout(()=>{if(listening&&!stopping&&!recognition)beginRecognition()},220);
  };
  try{instance.start()}
  catch(error){captureError='تعذر تشغيل الميكروفون: '+(error?.message||'خطأ غير معروف');finishCapture()}
 };
 const startRecording=(auto=false)=>{
  if(!auto)clarificationTries=0;
  if(!Recognition){status.textContent='التسجيل غير مدعوم هنا؛ استخدم الكتابة.';return}
  if(listening){finishRecording();return}
  captureError='';fragments=[];liveSpeech='';stopping=false;listening=true;
  panel.classList.add('sl-voice-open');panel.dataset.expanded='true';
  recordButton.textContent='⏹ إنهاء التسجيل';recordButton.setAttribute('aria-pressed','true');
  status.textContent='أستمع لعدة أوامر… اذكر الاسم ثم التقديرات، وسأنتظر اكتمال الإملاء.';
  restartSilenceClock(true);beginRecognition();
 };
 recordButton.addEventListener('click',()=>startRecording(false));
 launcher.onclick=()=>{
  if(panel.classList.contains('sl-voice-open')){collapse();return}
  panel.classList.add('sl-voice-open');panel.dataset.expanded='true';
  launcher.setAttribute('aria-expanded','true');
  status.textContent=Recognition?'اضغط «بدء التسجيل» أو اكتب أوامرك.':'اكتب أوامرك ثم اضغط التنفيذ.';
 };
 const instance={box,cards,panel,observer:null,stop:()=>{
  abortCapture();pending=null;
 }};
 mountedSession=instance;
 // A detached or replaced set of student cards means the teacher has left
 // this session. Remove the global portal and restore the compact home mic.
 if(window.MutationObserver){
  instance.observer=new window.MutationObserver(()=>{
   if(mountedSession!==instance)return;
   if(!box.isConnected||!cards.some(card=>card.isConnected))disposeMountedSession();
  });
  instance.observer.observe(box,{childList:true,subtree:true});
  const shell=box.closest?.('.sl-live')||document.body;
  if(shell!==box)instance.observer.observe(shell,{childList:true,subtree:true});
 }
}
window.SanabilVoice={mount,showLauncher,intentOf,splitBatch,batchOf,joinSpeech,fixStudentEcho,normalize,countOf,attendanceOf};
})();