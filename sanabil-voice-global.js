/* Sanabil unified voice entry: explicit commands, no stored audio or telemetry. */
(()=>{'use strict';
 if(window.SanabilVoiceGlobal)return;
 const base=()=>window.SanabilVoice;
 const norm=x=>base()?.normalize?.(x)||String(x||'').trim();
 const navLabels={
  dashboard:['الرئيسيه'],
  attendance:['البصمه','الحضور والبصمه'],
  outcomes:['الحصيله','الحصيله اليوميه'],
  plans:['الخطط','الخطط التعليميه'],
  tests:['الاختبارات'],
  students:['الطلاب','الطلاب والمعلمون'],
  supervision:['الاشراف','الزيارات الاشرافيه'],
  inquiries:['الاستعلامات'],
  reports:['التقارير','التقارير والاحصاءات'],
  settings:['الاعدادات','اعدادات المنصه']
 };
 const sectionNames={dashboard:'الرئيسية',attendance:'البصمة',outcomes:'الحصيلة',plans:'الخطط',
  tests:'الاختبارات',students:'الطلاب',supervision:'الزيارات الإشرافية',inquiries:'الاستعلامات',
  reports:'التقارير',settings:'الإعدادات'};
 const parse=raw=>{
  const s=norm(raw).replace(/^(?:لو سمحت|من فضلك)\s+/u,'').replace(/\s+(?:لو سمحت|من فضلك)$/u,'');
  if(!s)return {type:'unknown',reason:'لم أسمع أمرًا. اذكر الإجراء المطلوب بوضوح.'};
  if(/^(?:(?:سجل|تسجيل|اثبت|بصمه|ابصم)\s+)(?:حضور|الحضور|حضوري|حضور المعلم)$/u.test(s))
   return {type:'punch',kind:'in'};
  if(/^(?:(?:سجل|تسجيل|اثبت|بصمه|ابصم)\s+)(?:انصراف|الانصراف|انصرافي|انصراف المعلم)$/u.test(s))
   return {type:'punch',kind:'out'};
  if(/^(?:افتح|ابدا|شغل)\s+(?:جلسه اليوم|الجلسه اليوميه|جلسه الحصيله|جلسه الحصيله اليوم)$/u.test(s)||
     /^(?:انتقل الي|افتح)\s+الحصيله\s+ثم\s+(?:افتح|ابدا)\s+جلسه اليوم$/u.test(s))
   return {type:'session'};
  const destination=s.replace(/^(?:(?:انتقل|اذهب|روح|افتح|اعرض|اذهب بي)\s+(?:الي\s+|على\s+)?)|^(?:صفحه\s+)/u,'').trim();
  for(const [key,labels] of Object.entries(navLabels))
   if(labels.includes(destination))return {type:'section',key};
  return {type:'unknown',reason:'الأمر غير واضح أو غير مدعوم. حدّد المطلوب، مثل: «تسجيل حضور»، «تسجيل انصراف»، «انتقل إلى الاختبارات»، أو «افتح جلسة اليوم».'};
 };
 const selectable=x=>!!x&&!x.disabled&&x.getAttribute?.('aria-disabled')!=='true'&&!x.hidden
  &&!x.closest?.('[hidden],[aria-hidden="true"],.sl-voice-panel,#sanabil-voice-entry');
 const nodes=()=>[...document.querySelectorAll('button,a,[role="tab"]')].filter(selectable);
 const matches=(node,labels)=>labels.some(label=>{
  const text=norm(node.textContent),aria=norm(node.getAttribute?.('aria-label')||''),title=norm(node.getAttribute?.('title')||'');
  return text===label||aria===label||title===label;
 });
 const navButton=key=>{
  const labels=navLabels[key]||[];
  const found=nodes().filter(node=>matches(node,labels));
  return found.find(n=>n.closest?.('.mobile-nav,.sidebar,.app-sidebar,[role="navigation"]'))||found[0]||null;
 };
 const selectedCircle=()=>{
  const input=document.querySelector('.sl-live select[name="circle"],.sl-live select[data-field="circle"]');
  return !input||!!input.value;
 };
 const clickControl=(action,phrase,report)=>{
  const button=[...document.querySelectorAll('.sl-live [data-action="'+action+'"]')].find(selectable);
  if(!button){report('لم أجد زر «'+phrase+'» في هذه الصفحة، أو ليست لديك الصلاحية المطلوبة.');return false}
  if(!selectedCircle()){report('حدّد الحلقة أولًا؛ لن أسجّل إجراءً على حلقة غير محددة.');return false}
  button.click();
  report('أُرسل طلب «'+phrase+'» إلى المنصة. انتظر رسالة النجاح من الخادم؛ لا أعتبره مكتملًا قبل التأكيد.');
  return true;
 };
 const goSection=(key,report)=>{
  const target=navButton(key);
  if(target){target.click();report('جارٍ فتح '+sectionNames[key]+'…');return true}
  const more=nodes().find(x=>matches(x,['المزيد']));
  if(!more){report('قسم «'+sectionNames[key]+'» غير متاح بحسابك أو في هذه الصفحة.');return false}
  more.click();
  report('أفتح قائمة المزيد للوصول إلى '+sectionNames[key]+'…');
  let tries=0;
  const seek=()=>{
   const n=navButton(key);
   if(n){n.click();report('جارٍ فتح '+sectionNames[key]+'…')}
   else if(++tries<6)setTimeout(seek,250);
   else report('لم أجد «'+sectionNames[key]+'» ضمن القائمة المتاحة لصلاحيتك.');
  };
  setTimeout(seek,120);
  return true;
 };
 const performAfterNavigation=(section,action,label,report)=>{
  if(!goSection(section,report))return false;
  let attempts=0;
  const ready=()=>{
   if(!document.querySelector('.app-content,.mobile-nav,.sl-live'))return;
   const heading=norm(document.querySelector('.sl-live > h1')?.textContent);
   if(!(navLabels[section]||[]).includes(heading)){
    if(++attempts<16)setTimeout(ready,250);
    else report('لم يتم الانتقال إلى «'+sectionNames[section]+'». افتح القسم أو راجع صلاحيتك.');
    return;
   }
   if([...document.querySelectorAll('.sl-live [data-action="'+action+'"]')].some(selectable)){
    clickControl(action,label,report);return;
   }
   if(++attempts<16)setTimeout(ready,250);
   else report('لم يظهر زر «'+label+'». افتح الصفحة وتحقق من الحلقة والصلاحيات ثم أعد الأمر.');
  };
  setTimeout(ready,180);
  return true;
 };
 const run=(raw,report=()=>{})=>{
  const intent=parse(raw);
  if(intent.type==='unknown'){report(intent.reason);return {ok:false,reason:intent.reason}}
  if(intent.type==='section')return {ok:goSection(intent.key,report)};
  if(intent.type==='session')return {ok:performAfterNavigation('outcomes','load','فتح جلسة اليوم',report)};
  if(intent.type==='punch')return {ok:performAfterNavigation('attendance',intent.kind,
   intent.kind==='in'?'تسجيل حضوري':'تسجيل انصرافي',report)};
  return {ok:false};
 };
 let current=null;
 function open(){
  if(!document.body||document.querySelector('.login-shell')||!document.querySelector('.app-content,.mobile-nav,.sl-live'))return;
  if(document.querySelector('[data-sanabil-voice="true"]'))return;
  if(current?.panel?.isConnected){current.start(true);return}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const element=(tag,klass,text)=>{
   const e=document.createElement(tag);if(klass)e.className=klass;if(text)e.textContent=text;return e;
  };
  const panel=element('section','sl-voice-panel sl-voice-open');panel.dataset.sanabilVoice='global';panel.dataset.expanded='true';panel.dir='rtl';
  const title=element('button','button button-soft','🎙 الموجّه الصوتي');title.type='button';
  const close=element('button','sl-voice-close','✕');close.type='button';close.setAttribute('aria-label','إغلاق الموجه');
  const status=element('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const manual=element('div','sl-voice-manual');
  const input=element('input');input.type='text';input.dir='rtl';input.placeholder='مثال: تسجيل حضور، أو انتقل إلى الاختبارات';
  input.setAttribute('aria-label','اكتب أمرًا للمنصة');
  const send=element('button','button button-primary','تنفيذ الأمر المكتوب');send.type='button';manual.append(input,send);
  const record=element('button','button button-primary sl-voice-record','🎙 بدء التسجيل');record.type='button';record.disabled=!Recognition;
  const detail=element('div','sl-voice-command');
  panel.append(title,close,status,manual,record,detail);document.body.append(panel);
  try{panel.setAttribute('popover','manual');panel.showPopover?.()}catch{panel.removeAttribute?.('popover')}
  let listening=false,stopping=false,rec=null,silence=null,finishTimer=null,carry='',live='',retries=0,closed=false,lastError='';
  const timerClear=()=>{clearTimeout(silence);clearTimeout(finishTimer);silence=finishTimer=null};
  const stopAll=()=>{listening=false;stopping=true;timerClear();const old=rec;rec=null;
   if(old){old.onresult=old.onend=old.onerror=null;try{old.abort()}catch{}}
   record.textContent='🎙 بدء التسجيل';record.setAttribute('aria-pressed','false')};
  const logoutObserver=new MutationObserver(()=>{if(document.querySelector('.login-shell')||!document.querySelector('.app-content,.mobile-nav,.sl-live'))dismiss()});
  logoutObserver.observe(document.body,{childList:true,subtree:true});
  const dismiss=()=>{if(closed)return;closed=true;logoutObserver.disconnect();stopAll();panel.remove();if(current?.panel===panel)current=null;
   const entry=document.getElementById('sanabil-voice-entry');if(entry)entry.hidden=false};
  close.onclick=dismiss;
  const reply=message=>{if(!closed)status.textContent=message};
  const finish=()=>{
   if(!listening||closed)return;
   const phrase=(base()?.joinSpeech?.(carry,live)||[carry,live].join(' ')).trim();
   stopAll();carry='';live='';
   if(!phrase){reply(lastError||'لم ألتقط كلامًا واضحًا؛ اضغط بدء التسجيل أو اكتب الأمر.');lastError='';return}
   const result=run(phrase,reply);
   if(!result.ok&&retries<1){
    retries++;reply((result.reason||'يرجى توضيح الأمر.')+' سأستمع مرة أخرى.');
    setTimeout(()=>{if(!closed&&!listening)start(true)},500);
   }
  };
  const stop=()=>{
   if(!listening||stopping)return;
   stopping=true;clearTimeout(silence);
   const active=rec;if(!active){finish();return}
   try{active.stop()}catch{finish();return}
   finishTimer=setTimeout(finish,1000);
  };
  const quiet=heard=>{clearTimeout(silence);silence=setTimeout(stop,heard?2000:7500)};
  const begin=()=>{
   if(!listening||stopping||closed)return;
   const r=new Recognition();rec=r;r.lang='ar-SA';r.continuous=true;r.interimResults=true;r.maxAlternatives=3;
   try{const Phrase=window.SpeechRecognitionPhrase;if(Phrase&&'phrases' in r)
    r.phrases=['تسجيل حضوري','تسجيل انصرافي','الحصيلة اليومية','فتح جلسة اليوم','الاختبارات','الخطط','البصمة']
     .map(t=>new Phrase(t,3))}catch{}
   r.onresult=event=>{
    if(rec!==r)return;
    let part='';
    for(let i=0;i<(event.results?.length||0);i++)part+=' '+(event.results[i]?.[0]?.transcript||'');
    const updated=part.trim(),changed=updated!==live;live=updated;
    const heard=base()?.joinSpeech?.(carry,live)||[carry,live].join(' ');
    reply('أستمع… '+heard);
    if(changed&&!stopping)quiet(!!heard.trim());
   };
   r.onerror=event=>{
    if(rec!==r)return;
    if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){
     lastError='اسمح للمتصفح باستخدام الميكروفون، ثم أعد المحاولة.';stop();
    }else if(!['no-speech','aborted'].includes(event.error))
     lastError='انقطع التعرف الصوتي. جرّب مرة أخرى أو استخدم الأمر المكتوب.';
   };
   r.onend=()=>{
    if(rec!==r)return;
    rec=null;
    if(stopping){finish();return}
    if(live){carry=base()?.joinSpeech?.(carry,live)||[carry,live].join(' ');live=''}
    if(listening&&!closed)setTimeout(()=>{if(listening&&!stopping&&!rec)begin()},220);
   };
   try{r.start()}catch(error){lastError='تعذر تشغيل الميكروفون: '+(error?.message||'خطأ');finish()}
  };
  const start=auto=>{
   if(!Recognition){reply('المتصفح لا يدعم التعرف الصوتي؛ استخدم الأمر المكتوب.');return}
   if(listening){stop();return}
   if(!auto)retries=0;
   lastError='';carry='';live='';stopping=false;listening=true;
   record.textContent='⏹ إنهاء التسجيل';record.setAttribute('aria-pressed','true');
   reply('أستمع الآن… سأوقف التسجيل بعد ثانيتين من الصمت.');
   quiet(false);begin();
  };
  record.onclick=()=>start(false);title.onclick=()=>start(false);
  send.onclick=event=>{event?.preventDefault?.();const phrase=input.value.trim();
   if(!phrase){reply('اكتب أمرًا محددًا أولًا.');return}run(phrase,reply)};
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();send.click()}});
  current={panel,close:dismiss,start};
  start(false);
 }
 if(document.addEventListener)document.addEventListener('click',event=>{
  const trigger=event.target?.closest?.('#sanabil-voice-entry > button');
  if(!trigger||document.querySelector('[data-sanabil-voice="true"]'))return;
  event.preventDefault?.();event.stopImmediatePropagation?.();open();
 },true);
 window.SanabilVoiceGlobal={parse,run,open,sectionNames};
})();