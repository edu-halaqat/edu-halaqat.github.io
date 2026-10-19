/* Teacher-controlled shortcuts and per-session click-efficiency measurements.
   Never reorder learners or navigate automatically to another learner. */
(()=>{'use strict';if(window.SanabilTeacherProductivity)return;
 const ACTIONS=[
  ['search','بحث عن طالب'],['bulk_grade','تقييم مجموعة'],['bulk_day','تصنيف يوم مجموعة'],
  ['bulk_excellent','ممتاز للمحددين'],['attendance_save','حفظ التحضير'],['details','تفاصيل طالب محدد']
 ];
 const DEFAULT=['search','bulk_grade','bulk_day'];
 const CATEGORIES=['attendance','grade','details','bulk','navigation','other'];
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const button=(label,fn,cls='')=>{const b=el('button','sl-quick-btn '+cls,label);b.type='button';b.addEventListener('click',fn);return b};
 const num=n=>Math.max(0,Math.min(100000,Math.floor(Number(n)||0)));
 const normalize=s=>String(s||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim().toLowerCase();
 const validFavorites=value=>Array.isArray(value)&&value.length===3&&new Set(value).size===3&&value.every(x=>ACTIONS.some(([id])=>id===x));
 const classify=target=>{
  if(target.closest?.('.sl-quick-bulk-sheet,.sl-quick-multi,.sl-quick-multi-day,.sl-quick-bulk,.sl-quick-select'))return 'bulk';
  if(target.closest?.('.sl-quick-attendance,[data-att-student],[data-quran-absence-reason],[data-action="all-present"],[data-action="save-attendance"]'))return 'attendance';
  if(target.closest?.('.sl-quick-perfect,[data-grade-student],[data-metric-step],[data-metric-count]'))return 'grade';
  if(target.closest?.('.sl-quick-details,.sl-quick-sheet,[data-action^="metrics-"]'))return 'details';
  if(target.closest?.('.sl-quick-favorites,.sl-quick-search,[data-outcome-search-clear],.sl-outcome-student-search,[data-real-prev],[data-real-next]'))return 'navigation';
  return 'other';
 };
 const seconds=s=>s<60?s+' ث':Math.floor(s/60)+' د '+s%60+' ث';
 const format=n=>String(Math.round(n||0));
 function mount({box,circle,date,teacherId,readOnly=false}={}){
  if(!box||!circle||!date||!teacherId||box._sanabilProductivity)return null;
  const quick=box.querySelector('.sl-quick-outcomes');
  if(!quick)return null;
  const userKey='sanabil_favorite_actions_v1:'+teacherId;
  const sessionKey='sanabil_clicks_v1:'+teacherId+':'+circle+':'+date;
  const getStorage=(store,key)=>{try{return JSON.parse(store.getItem(key)||'null')}catch{return null}};
  const putStorage=(store,key,value)=>{try{store.setItem(key,JSON.stringify(value))}catch{}};
  let favorites=getStorage(localStorage,userKey);
  if(!validFavorites(favorites))favorites=[...DEFAULT];
  const previous=getStorage(sessionStorage,sessionKey);
  const newId=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():null;
  let counters=previous?.sessionId&&Number.isFinite(previous.clicks)&&previous.categories
   ?{...previous,categories:Object.fromEntries(CATEGORIES.map(x=>[x,num(previous.categories[x])]))}
   :{sessionId:newId(),clicks:0,activeSeconds:0,categories:Object.fromEntries(CATEGORIES.map(x=>[x,0]))};
  let lastInteraction=performance.now(),activeMs=0,flushTimer=null,inFlight=false,lastSynced=-1;
  let quickSearch=null;
  const cloud=window.supabaseClient;
  const persist=()=>putStorage(sessionStorage,sessionKey,counters);
  const confirmed=()=>box.querySelectorAll('[data-save-status][data-saved="saved"]').length;
  const summary=()=>({clicks:counters.clicks,activeSeconds:counters.activeSeconds,categories:{...counters.categories},confirmed:confirmed()});
  const report=()=>{
   const d=el('dialog','sl-teacher-efficiency-dialog');d.dir='rtl';
   d.append(el('h3','', 'تقرير كفاءة النقرات — '+date));
   const info=el('div','sl-teacher-efficiency-grid');
   for(const [label,value] of [
    ['نقرات هذه الجلسة',counters.clicks],['زمن التفاعل التقديري',seconds(counters.activeSeconds)],
    ['حصائل مؤكدة في الصفحة',confirmed()]
   ]){const tile=el('div','sl-teacher-efficiency-tile');tile.append(el('small','',label),el('strong','',String(value)));info.append(tile)}
   d.append(info,el('p','sl-quick-explain',
    'يشمل العداد اللمسات داخل الحصيلة السريعة والتفصيلية ونافذة التقييم. يستثني الانتظار الطويل بين الطلاب، ويعرض قياس هذه الجلسة لا جميع أعمال اليوم.'));
   const names={attendance:'الحضور',grade:'التقدير',details:'التفاصيل',bulk:'التسجيل الجماعي',navigation:'البحث والتنقل اليدوي',other:'إجراءات أخرى'};
   const list=el('div','sl-teacher-click-categories');
   for(const key of CATEGORIES){const row=el('div','sl-teacher-click-category');row.append(el('span','',names[key]),el('b','',String(counters.categories[key]||0)));list.append(row)}
   d.append(list);
   const close=button('إغلاق التقرير',()=>d.close(),'sl-quick-done');d.append(close);
   document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal?.();
  };
  const flush=()=>{
   if(flushTimer){clearTimeout(flushTimer);flushTimer=null}
   if(!counters.sessionId||!cloud?.rpc||!navigator.onLine||!box.isConnected||
      inFlight||lastSynced===counters.clicks||counters.clicks===0)return;
   inFlight=true;
   const captured=counters.clicks;
   cloud.rpc('record_circle_efficiency_guarded',{
    p_circle_id:circle,p_date:date,p_client_session:counters.sessionId,
    p_clicks:captured,p_active_seconds:counters.activeSeconds,p_categories:counters.categories
   }).then(({error})=>{if(error)throw error;lastSynced=captured})
    .catch(error=>{console.warn('تعذر إرسال إحصاء النقرات؛ سيعاد المحاولة دون فقد العداد:',error.message)})
    .finally(()=>{inFlight=false;if(counters.clicks>captured&&box.isConnected)scheduleFlush()});
  };
  const scheduleFlush=()=>{
   if(flushTimer)return;
   flushTimer=setTimeout(flush,30000);
  };
  const record=event=>{
   if(!event.isTrusted||!box.isConnected)return;
   const target=event.target;
   if(!(box.contains(target)||target?.closest?.('.sl-quick-sheet,.sl-teacher-efficiency-dialog,.sl-teacher-favorite-dialog')))return;
   const now=performance.now();
   if(counters.clicks>0)activeMs+=Math.max(0,Math.min(90000,now-lastInteraction));
   lastInteraction=now;
   counters.clicks=num(counters.clicks+1);
   counters.activeSeconds=Math.min(86400,Math.round(activeMs/1000)+num(previous?.activeSeconds||0));
   const category=classify(target);
   counters.categories[category]=num(counters.categories[category]+1);
   persist();
   if(counters.clicks-lastSynced>=15)flush();else scheduleFlush();
  };
  if(window.SanabilTeacherProductivity?._dispose)window.SanabilTeacherProductivity._dispose();
  const dispose=()=>{
   flush();
   document.removeEventListener('click',record,true);
   document.removeEventListener('visibilitychange',onHidden);
   window.removeEventListener('pagehide',flush);
   if(flushTimer)clearTimeout(flushTimer);
  };
  document.addEventListener('click',record,true);
  const onHidden=()=>{if(document.visibilityState==='hidden')flush()};
  document.addEventListener('visibilitychange',onHidden);
  window.addEventListener('pagehide',flush);
  const favoriteBar=el('section','sl-quick-favorites');
  favoriteBar.setAttribute('aria-label','اختصارات المعلم المفضلة');
  const header=el('div','sl-quick-favorites-heading');
  header.append(el('strong','', 'اختصاراتي المفضلة'),
   button('تخصيص ☆',configure,'sl-quick-fav-edit'));
  const actions=el('div','sl-quick-favorite-actions');
  favoriteBar.append(header,actions);
  quick.insertBefore(favoriteBar,quick.querySelector('.sl-quick-list'));
  const info=quick.querySelector('.sl-quick-notice');
  const message=t=>{if(info)info.textContent=t};
  const selectedIndices=()=>box._sanabilQuick?.selectedIndices?.()||[];
  const focusSearch=()=>{
   if(!quickSearch){
    quickSearch=el('div','sl-quick-search');
    const input=el('input');input.type='search';input.placeholder='اكتب اسم أي طالب، بغض النظر عن ترتيبه';input.setAttribute('aria-label','البحث الحر عن الطالب');
    const count=el('small','sl-quick-search-count');
    const original=box._sanabilQuick?.studentNames?.()||[];
    input.addEventListener('input',()=>{
     const term=normalize(input.value);let shown=0;
     quick.querySelectorAll('.sl-quick-row').forEach((row,i)=>{
      row.hidden=!!term&&!normalize(original[i]).includes(term);
      if(!row.hidden)shown++;
     });
     count.textContent=term?('نتائج البحث: '+shown+' من '+original.length):'جميع الطلاب ظاهرون';
    });
    const clear=button('إظهار الجميع',()=>{input.value='';input.dispatchEvent(new Event('input'));input.focus()});
    quickSearch.append(input,clear,count);
    favoriteBar.after(quickSearch);
   }
   quickSearch.querySelector('input')?.focus();
  };
  const runAction=id=>{
   if(!box.isConnected)return;
   switch(id){
    case 'search':focusSearch();return;
    case 'bulk_grade':box._sanabilQuick?.openBulkGrade?.();return;
    case 'bulk_day':box._sanabilQuick?.openBulkDay?.();return;
    case 'bulk_excellent':quick.querySelector('.sl-quick-bulk')?.click();return;
    case 'attendance_save':box.querySelector('[data-action="save-attendance"]')?.click();return;
    case 'details':{
     const chosen=selectedIndices();
     if(chosen.length!==1){message('حدد طالبًا واحدًا من مربعات الاختيار، ثم اضغط «تفاصيل طالب محدد».');return}
     box._sanabilQuick?.openDetails?.(chosen[0]);return;
    }
   }
  };
  const drawFavorites=()=>{
   actions.replaceChildren(...favorites.map(id=>{
    const item=ACTIONS.find(x=>x[0]===id);
    return button(item?.[1]||id,()=>runAction(id),'sl-quick-fav-action');
   }));
  };
  function configure(){
   const d=el('dialog','sl-teacher-favorite-dialog');d.dir='rtl';
   d.append(el('h3','', 'اختيار ثلاثة اختصارات للمعلم'),
    el('p','sl-quick-explain','تُحفظ المفضلة لهذا الحساب على الجهاز. يمكنك تغييرها متى شئت؛ لا تؤثر في ترتيب الطلاب أو نتائجهم.'));
   const selects=[];
   for(let i=0;i<3;i++){
    const label=el('label','sl-quick-fav-label','الاختصار '+(i+1));
    const control=el('select');
    for(const [id,name] of ACTIONS){const option=el('option','',name);option.value=id;control.append(option)}
    control.value=favorites[i];label.append(control);d.append(label);selects.push(control);
   }
   const err=el('small','sl-quick-fav-error');d.append(err);
   d.append(button('حفظ المفضلة',()=>{
    const values=selects.map(x=>x.value);
    if(!validFavorites(values)){err.textContent='اختر ثلاثة إجراءات مختلفة.';return}
    favorites=values;putStorage(localStorage,userKey,values);drawFavorites();d.close();
   },'sl-quick-done'),button('إلغاء',()=>d.close()));
   document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal?.();
  }
  drawFavorites();
  const reportButton=button('📊 نقراتي',report,'sl-quick-efficiency-open');
  header.append(reportButton);
  const entry={summary,flush,runAction,report,dispose};
  window.SanabilTeacherProductivity._dispose=dispose;
  box._sanabilProductivity=entry;
  return entry;
 }
 window.SanabilTeacherProductivity={mount,classify,validFavorites,normalize};
})();