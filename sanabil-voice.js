/* Sanabil optional Arabic voice commands for outcome controls.
 * Speech transcription uses browser SpeechRecognition when supported;
 * never stores audio, transcripts, or student identifiers in telemetry.
 * Saving and WhatsApp remain deliberate user-confirmed actions.
 */
(()=>{'use strict';if(window.SanabilVoice)return;
const normalize=value=>String(value||'').normalize('NFKC')
 .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
 .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
 .replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
 .replace(/[۰-۹]/g,n=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)))
 .replace(/\s+/g,' ').trim();
const words={صفر:0,واحد:1,واحده:1,اثنان:2,اثنين:2,اثنتان:2,اثنتين:2,
 ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,
 سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};
const countOf=phrase=>{
 const m=normalize(phrase).match(/(?:^|\s)([0-9]{1,2}|صفر|واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره)(?=\s|$)/u);
 if(!m)return null;
 const n=/^\d+$/.test(m[1])?Number(m[1]):words[m[1]];
 return Number.isInteger(n)&&n>=0&&n<=20?n:null;
};
const gradeOf=cmd=>{
 const s=normalize(cmd);
 if(s.includes('جيد جدا'))return 'جيد جدًا';
 if(s.includes('ممتاز'))return 'ممتاز';
 if(s.includes('لم يحفظ'))return 'لم يحفظ';
 if(s.includes('لم يسمع'))return 'لم يسمع';
 if(s.includes('يحتاج اعاده'))return 'يحتاج إعادة';
 if(s.includes('جيد'))return 'جيد';
 return null;
};
const categoryOf=text=>{
 const s=normalize(text);
 if(/المراجعه الكبري|مراجعه كبري|الكبري/.test(s))return 'review';
 if(/المراجعه الصغري|مراجعه صغري|الصغري|الصوره|القريبه/.test(s))return 'recentReview';
 if(/الحفظ|الدرس الجديد|الجديد/.test(s))return 'memorization';
 return null;
};
const metricOf=text=>{
 const s=normalize(text);
 if(/شك|شكوك|تردد/.test(s))return 'doubts';
 if(/تجويد/.test(s))return 'tajweed';
 if(/خطا|اخطاء|غلط/.test(s))return 'errors';
 return null;
};
const intentOf=raw=>{
 const cmd=normalize(raw);
 if(/(?:انتقل|اذهب|افتح|اعرض|روح).*(?:الطالب|حصيله)/.test(cmd))
  return {type:'navigate',name:cmd.replace(/^.*?(?:الطالب|حصيله الطالب)\s*/,'').trim()};
 if(/(?:احفظ|حفظ).*(?:الحصيله|التقدير)/.test(cmd))return {type:'save',share:/واتساب|ارسل|شارك/.test(cmd)};
 if(/(?:ارسل|شارك).*(?:ولي الامر|واتساب|الحصيله)/.test(cmd))return {type:'share'};
 const kind=categoryOf(cmd),grade=gradeOf(cmd);
 if(kind&&grade&&/تقدير|ضع|سجل|قيم|اعط/.test(cmd))return {type:'grade',kind,grade};
 if(kind&&/(?:اضف|زد|زياده|سجل|ضع)/.test(cmd)){
  // Multiple counts must be associated with their own named metrics.
  // Never apply "3 errors and 4 doubts" as "3 doubts".
  const changes=[],quantity='[0-9]{1,2}|صفر|واحد|واحده|اثنان|اثنين|اثنتان|اثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان|ثمانيه|تسع|تسعه|عشر|عشره';
  const pattern=new RegExp('(?:^|\\s)و?('+quantity+')\\s+(اخطاء|خطا|اخطاءات|شكوك|شك|تردد|اخطاء التجويد|تجويد)(?=\\s|$)','gu');
  for(const match of cmd.matchAll(pattern)){
   const metric=metricOf(match[2]);
   const count=countOf(match[1]);
   if(count!==null&&metric)changes.push({metric,count});
  }
  if(changes.length>1){
   const countsOfMetrics=(cmd.match(/(?:شكوك|شك|تردد|اخطاء|خطا|تجويد)/g)||[]).length;
   if(countsOfMetrics!==changes.length)return {type:'unknown'};
   return {type:'metrics',kind,changes};
  }
  const metric=metricOf(cmd),count=changes[0]?.count??(/شكين|شكتين/.test(cmd)?2:countOf(cmd));
  if(metric&&count!==null)return {type:'metric',kind,metric,count};
 }
 return {type:'unknown'};
};
const labelOf=i=>i.type==='navigate'?'الانتقال إلى '+i.name
 :i.type==='grade'?'تسجيل '+i.grade+' في '+({memorization:'الحفظ',recentReview:'المراجعة الصغرى',review:'المراجعة الكبرى'}[i.kind])
 :i.type==='metrics'?'إضافة '+i.changes.map(c=>c.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[c.metric])).join(' و')
 :i.type==='metric'?'إضافة '+i.count+' '+({errors:'أخطاء',doubts:'شكوك',tajweed:'ملاحظات تجويد'}[i.metric])
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
 const manual=document.createElement('form');manual.className='sl-voice-manual';
 const manualInput=document.createElement('input');manualInput.type='text';manualInput.dir='rtl';
 manualInput.setAttribute('aria-label','اكتب أمرًا للمنصة');
 manualInput.placeholder='أو اكتب: انتقل إلى الطالب أحمد…';
 const manualGo=document.createElement('button');manualGo.type='submit';manualGo.className='button button-primary';
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
 close.onclick=()=>{if(recognition)recognition.stop();pending=null;detail.replaceChildren();panel.classList.remove('sl-voice-open')};
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
  const exact=names.map((n,i)=>({n:normalize(n),i})).filter(x=>x.n===token);
  if(exact.length===1)return exact[0].i;
  const matches=names.map((n,i)=>({n:normalize(n),i})).filter(x=>x.n.includes(token));
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
  if(interpretation.type==='unknown'){status.textContent='لم أتعرف على الأمر. جرّب «انتقل إلى الطالب…» أو «ضع تقدير ممتاز للحفظ الجديد».';return}
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
     const key=targetKey(card,i.kind);
     const button=[...card.querySelectorAll('[data-grade-key]')].find(b=>b.dataset.gradeKey===key&&normalize(b.dataset.gradeValue)===normalize(i.grade));
     if(!button||button.disabled)throw Error('خانة التقدير غير متاحة لهذا الطالب أو اليوم.');
     button.click();status.textContent='سُجل التقدير في المسودة. احفظ الحصيلة لتثبيته.';
    }else if(i.type==='metric'||i.type==='metrics'){
     const key=targetKey(card,i.kind),changes=i.type==='metrics'?i.changes:[{metric:i.metric,count:i.count}];
     const pendingInputs=changes.map(item=>{
      const input=[...card.querySelectorAll('[data-metric-count]')].find(b=>b.dataset.metricKey===key&&b.dataset.metricField===item.metric);
      if(!input||input.disabled)throw Error('خانة '+item.metric+' غير متاحة لهذا المقرر.');
      return {input,value:Math.min(100,Number(input.value||0)+item.count)};
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
  status.textContent='راجع الأمر ثم اضغط تأكيد التنفيذ. لا تستخدم الأوامر الصوتية وحدها للتحقق من صحة الدرجات.';
 };
 manual.addEventListener('submit',event=>{
  event.preventDefault();panel.classList.add('sl-voice-open');
  const text=manualInput.value.trim();
  if(!text){status.textContent='اكتب أمرًا قبل التنفيذ.';manualInput.focus();return}
  status.textContent='الأمر المكتوب: '+text;
  prepare(intentOf(text));
 });
 launcher.onclick=()=>{
  panel.classList.add('sl-voice-open');
  if(!Recognition){
   status.textContent='يمكنك إدخال الأمر كتابةً. الميكروفون لا يدعم التعرف الصوتي في هذا المتصفح.';
   manualInput.focus();return;
  }
  if(recognition){recognition.stop();return}
  recognition=new Recognition();recognition.lang='ar-SA';recognition.continuous=false;recognition.interimResults=false;
  launcher.textContent='إيقاف الاستماع';status.textContent='أستمع لأمر واحد الآن…';
  recognition.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||'';status.textContent='الأمر الذي سمعته: '+transcript;prepare(intentOf(transcript))};
  recognition.onerror=e=>{status.textContent=e.error==='not-allowed'?'يجب السماح للمتصفح باستخدام الميكروفون.':'تعذر التعرف على الصوت. حاول ثانية أو استخدم الأزرار.'};
  recognition.onend=()=>{recognition=null;launcher.textContent='🎙 الموجه الصوتي'};
  try{recognition.start()}catch(e){recognition=null;launcher.textContent='🎙 الموجه الصوتي';status.textContent='لم يتوفر الميكروفون: '+e.message}
 };
}
window.SanabilVoice={mount,showLauncher,intentOf,normalize,countOf};
})();