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
const matchingStudents=(studentNames,rawName)=>{
 const name=normalize(rawName);
 const removePatronymic=val=>normalize(val).split(' ').filter(w=>!['بن','ابن','بنت'].includes(w)).join(' ');
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
 const all=/جميع|الكل|الطلاب كلهم|كافه الطلاب|كل الطلاب|كل الطلبه|الجميع/.test(cmd);
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
const intentOf=(raw,studentNames=[])=>{
 const cmd=normalize(raw);
 if(!cmd)return {type:'unknown'};
 if(/(?:احفظ|حفظ)\s+(?:الحصيله|حصيله|التقدير)/.test(cmd))
  return {type:'save',share:/واتساب|ارسل|شارك/.test(cmd)};
 if(/(?:ارسل|شارك)\s+.*(?:ولي الامر|واتساب|الحصيله)/.test(cmd))
  return {type:'share'};
 const kind=categoryOf(cmd),grade=gradeOf(cmd);
 // Attendance names are only interpreted after excluding lesson-grade phrases.
 const attendance=attendanceOf(cmd);
 if(attendance&&!kind&&!grade){
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
  if(hits.length)return {type:'navigate',name};
 }
 return {type:'unknown'};
};
const labelOf=i=>i.type==='attendance_all'?'تحضير جميع الطلاب حاضرين (دون حفظ بعد)'
 :i.type==='attendance'?'تسجيل '+({present:'حاضر',absent:'غائب',late:'متأخر',excused:'مستأذن'}[i.status])+(i.reason?' '+(i.reason==='excused'?'بعذر':'دون عذر'):'')
 :i.type==='navigate'?'الانتقال إلى '+i.name
 :i.type==='grade'?'تسجيل '+i.grade+' في '+({memorization:'الحفظ',recentReview:'المراجعة الصغرى',review:'المراجعة الكبرى'}[i.kind])
 :i.type==='metrics'?(i.mode==='add'?'إضافة ':'تسجيل ')+i.changes.map(c=>c.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[c.metric])).join(' و')
 :i.type==='metric'?(i.mode==='add'?'إضافة ':'تسجيل ')+i.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[i.metric])
 :i.type==='save'?(i.share?'حفظ الحصيلة ثم مشاركة ولي الأمر':'حفظ الحصيلة')
 :i.type==='share'?'فتح مشاركة الحصيلة لولي الأمر':'لم أتعرف على أمر محدد';
// The microphone entry is visible on the authenticated home screen, even
// before a circle is opened. Detailed student commands need a loaded session.
let entryObserver=null;
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
  guidance.append(info,goto,close);entry.append(trigger,guidance);document.body.append(entry);
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
 if(!box?.isConnected||!cards?.length)return;
 const existing=box.querySelector('[data-sanabil-voice]');
 if(existing)return;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const panel=document.createElement('section');panel.className='sl-voice-panel';panel.dataset.sanabilVoice='true';
 const launcher=document.createElement('button');launcher.type='button';launcher.className='button button-soft';
 launcher.textContent='🎙 الموجه الصوتي';launcher.setAttribute('aria-label','تشغيل الموجه الصوتي');
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.textContent=Recognition?'اضغط الميكروفون ثم قل أمرًا واحدًا. لن يُحفظ أو يُرسل شيء دون تأكيد.':'التعرف الصوتي غير مدعوم في هذا المتصفح. استخدم أزرار الحصيلة المعتادة.';
 const detail=document.createElement('div');detail.className='sl-voice-command';
 const close=document.createElement('button');close.type='button';close.className='sl-voice-close';close.textContent='✕';
 close.setAttribute('aria-label','إغلاق نافذة الموجه الصوتي');
 // The outcome cards already live inside a submission form. Never nest a form:
 // browsers can redirect that submit to «حفظ حصيلة الحلقة» instead.
 const manual=document.createElement('div');manual.className='sl-voice-manual';
 const manualInput=document.createElement('input');manualInput.type='text';manualInput.dir='rtl';
 manualInput.setAttribute('aria-label','اكتب أمرًا للمنصة');
 manualInput.placeholder='مثال: أحمد دحمان، أو الحفظ ممتاز…';
 const manualGo=document.createElement('button');manualGo.type='button';manualGo.className='button button-primary';
 manualGo.textContent='تنفيذ الأمر المكتوب';
 manual.append(manualInput,manualGo);
 panel.append(launcher,close,status,manual,detail);
 const search=box.querySelector('.sl-outcome-student-search')||box;
 search.append(panel);
 const entry=document.getElementById('sanabil-voice-entry');if(entry)entry.hidden=true;
 if(!Recognition){
  launcher.title='التعرف الصوتي غير مدعوم في هذا المتصفح؛ يمكنك كتابة الأمر من النافذة نفسها.';
  status.textContent='التعرف على الصوت غير مدعوم هنا. اكتب الأمر أدناه، أو جرّب Chrome مع إذن الميكروفون.';
 }
 let active=-1,recognition=null,pending=null;
 const collapse=()=>{
  if(recognition){recognition.abort?.();recognition=null}
  pending=null;detail.replaceChildren();
  panel.classList.remove('sl-voice-open');
  panel.dataset.expanded='false';launcher.setAttribute('aria-expanded','false');
  status.textContent=Recognition?'اضغط زر الموجه لإدخال أمر جديد.':'اكتب الأمر عند فتح الموجه.';
 };
 close.onclick=collapse;
 launcher.setAttribute('aria-expanded','false');panel.dataset.expanded='false';
 const shownCards=()=>cards.filter(c=>c.isConnected&&!c.hidden);
 const selectCard=index=>{
  if(index<0||!cards[index]?.isConnected)return false;
  active=index;
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
  if(active>=0&&cards[active]?.isConnected)return {card:cards[active],index:active};
  const focused=document.activeElement?.closest?.('.sl-student-card');
  if(focused&&cards.includes(focused)){active=cards.indexOf(focused);return {card:focused,index:active}}
  const anchor=Math.max(90,Math.min((window.innerHeight||700)*.38,350));
  const selected=shownCards().find(c=>{const r=c.getBoundingClientRect();return r.top<=anchor&&r.bottom>=anchor});
  if(selected){active=cards.indexOf(selected);return {card:selected,index:active}}
  return null;
 };
 const matchStudent=name=>{
  const token=normalize(name).replace(/(?:من فضلك|لو سمحت|الان)$/,'').trim();
  if(token.length<2)return null;
  const matches=matchingStudents(names,token);
  return matches.length===1?matches[0].i:null;
 };
 const targetKey=(card,kind)=>{
  const buttons=[...card.querySelectorAll('[data-grade-key]')];
  const keys=[...new Set(buttons.map(b=>b.dataset.gradeKey).filter(Boolean))];
  if(kind==='review'){
   const review=keys.filter(k=>k.startsWith('review:'));
   if(review.length!==1)throw Error('لدى الطالب عدة مراجعات كبرى أو لا توجد مراجعة؛ اختر المراجعة المطلوبة يدويًا.');
   return review[0];
  }
  return kind;
 };
 const prepare=interpretation=>{
  pending=interpretation;detail.replaceChildren();
  if(interpretation.type==='unknown'){status.textContent=interpretation.reason||'لم أتعرف على الأمر. جرّب «أحمد دحمان» أو «الحفظ ممتاز» أو «جنب الدرس 5 شكوك».';pending=null;return}
  if(interpretation.type==='navigate'){
   const index=matchStudent(interpretation.name);
   if(index===null){status.textContent='الاسم غير محدد أو يطابق أكثر من طالب؛ انطق الاسم الكامل بوضوح.';return}
   selectCard(index);status.textContent='انتقلت إلى '+names[index]+' دون تعديل أي حصيلة.';pending=null;return;
  }
  const chosen=currentCard();
  if(!chosen){status.textContent='حدد بطاقة الطالب بالانتقال إليه أولًا، ثم انطق أمر التقدير.';return}
  const {card}=chosen;
  const summary=document.createElement('p');summary.textContent=names[chosen.index]+' — '+labelOf(interpretation);
  const confirm=document.createElement('button');confirm.type='button';confirm.className='button button-primary';
  confirm.textContent=interpretation.type==='save'?'تأكيد الحفظ':'تنفيذ الأمر';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='button button-soft';cancel.textContent='إلغاء';
  detail.append(summary,confirm,cancel);
  cancel.onclick=()=>{pending=null;detail.replaceChildren();status.textContent='ألغي الأمر.'};
  confirm.onclick=()=>{
   if(pending!==interpretation)return;
   try{
    const i=interpretation;pending=null;
    if(i.type==='grade'){
     const gradeButtons=[...card.querySelectorAll('[data-grade-key]')];
     const talqeenButtons=!gradeButtons.length&&i.kind==='memorization'
      ?[...card.querySelectorAll('[data-tl-grade-student]')]:[];
     const key=gradeButtons.length?targetKey(card,i.kind):null;
     const button=gradeButtons.length
      ?gradeButtons.find(b=>b.dataset.gradeKey===key&&normalize(b.dataset.gradeValue)===normalize(i.grade))
      :talqeenButtons.find(b=>normalize(b.dataset.tlGradeValue)===normalize(i.grade));
     if(!button||button.disabled)throw Error('خانة التقدير غير متاحة لهذا الطالب أو اليوم.');
     button.click();status.textContent='سُجل التقدير في المسودة. احفظ الحصيلة لتثبيته.';
    }else if(i.type==='metric'||i.type==='metrics'){
     const key=targetKey(card,i.kind),changes=i.type==='metrics'?i.changes:[{metric:i.metric,count:i.count}];
     const pendingInputs=changes.map(item=>{
      const input=[...card.querySelectorAll('[data-metric-count]')].find(b=>b.dataset.metricKey===key&&b.dataset.metricField===item.metric);
      if(!input||input.disabled)throw Error('خانة '+item.metric+' غير متاحة لهذا المقرر.');
      const current=Number(input.value||0);
      const value=i.mode==='add'?current+item.count:item.count;
      return {input,value:Math.min(100,Math.max(0,value))};
     });
     // Prevalidate all targets before editing any field.
     pendingInputs.forEach(item=>{item.input.value=String(item.value);item.input.dispatchEvent(new Event('change',{bubbles:true}))});
     status.textContent='تم تعديل العدّادات في مسودة الطالب. الحفظ لم يبدأ.';
    }else if(i.type==='save'){
     const btn=card.querySelector('[data-action^="save-student-"],[data-action^="tl-save-"]');
     if(!btn||btn.disabled)throw Error('الحفظ غير متاح؛ تحقق من الحضور والتقديرات.');
     btn.click();status.textContent='بدأ حفظ الحصيلة. انتظر رسالة تأكيد الخادم قبل المشاركة.';
     if(i.share){const share=document.createElement('button');share.type='button';share.className='button button-soft';share.textContent='مشاركة ولي الأمر بعد تأكيد الحفظ';
       share.onclick=()=>{if(!/تم الحفظ والتحقق|حصيلة محفوظة ومؤكدة|تم حفظ حصيلة/.test(card.querySelector('[data-save-status]')?.textContent||box.querySelector('.sl-message')?.textContent||'')){status.textContent='لم تظهر رسالة تأكيد الحفظ بعد؛ انتظر ولا ترسل حصيلة غير مؤكدة.';return}
       const wa=card.querySelector('[data-action^="wa-"],[data-action^="tl-card-"]');if(wa&&!wa.disabled)wa.click();else status.textContent='استخدم زر المشاركة من بطاقة الطالب.'};
       detail.replaceChildren(share);return;
     }
    }else if(i.type==='share'){
     const share=card.querySelector('[data-action^="wa-"],[data-action^="tl-card-"]');
     if(!share||share.disabled)throw Error('المشاركة غير متاحة؛ احفظ الحصيلة أولًا.');
     share.click();status.textContent='فُتحت المشاركة؛ راجع الرسالة وأرسلها من واتساب بنفسك.';
    }
    detail.replaceChildren();
   }catch(e){status.textContent=e.message||'تعذر تنفيذ الأمر. راجع الخانة المطلوبة.'}
  };
  status.textContent='تحقق من اسم الطالب والتقدير أو العدد قبل التأكيد. يمكنك الاكتفاء بالاسم أو عبارة مثل «الحفظ ممتاز».';
 };
 const submitWrittenCommand=event=>{
  event?.preventDefault?.();event?.stopPropagation?.();
  const text=manualInput.value.trim();
  if(!text){status.textContent='اكتب أمرًا قبل التنفيذ.';manualInput.focus();return}
  panel.classList.add('sl-voice-open');panel.dataset.expanded='true';
  status.textContent='الأمر المكتوب: '+text;
  prepare(intentOf(text,names));
 };
 manualGo.addEventListener('click',submitWrittenCommand);
 manualInput.addEventListener('keydown',event=>{
  if(event.key==='Enter')submitWrittenCommand(event);
 });
 launcher.onclick=()=>{
  if(panel.classList.contains('sl-voice-open')){collapse();return}
  panel.classList.add('sl-voice-open');panel.dataset.expanded='true';
  launcher.setAttribute('aria-expanded','true');
  if(!Recognition){
   status.textContent='يمكنك إدخال الأمر كتابةً. الميكروفون لا يدعم التعرف الصوتي في هذا المتصفح.';
   manualInput.focus();return;
  }
  if(recognition){recognition.stop();return}
  recognition=new Recognition();recognition.lang='ar-SA';recognition.continuous=false;recognition.interimResults=false;
  launcher.textContent='إيقاف الاستماع';status.textContent='أستمع لأمر واحد الآن…';
  recognition.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||'';status.textContent='الأمر الذي سمعته: '+transcript;prepare(intentOf(transcript,names))};
  recognition.onerror=e=>{status.textContent=e.error==='not-allowed'?'يجب السماح للمتصفح باستخدام الميكروفون.':'تعذر التعرف على الصوت. حاول ثانية أو استخدم الأزرار.'};
  recognition.onend=()=>{recognition=null;launcher.textContent='🎙 الموجه الصوتي'};
  try{recognition.start()}catch(e){recognition=null;launcher.textContent='🎙 الموجه الصوتي';status.textContent='لم يتوفر الميكروفون: '+e.message}
 };
}
window.SanabilVoice={mount,showLauncher,intentOf,normalize,countOf,attendanceOf};
})();