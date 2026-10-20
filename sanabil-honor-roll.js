/* Honor roll: authenticated aggregate only; no public student records or auth-bearing share URLs. */
(()=>{'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cyclePeriod=data=>data.to?'النقاط المحتسبة: من '+data.from+' إلى '+data.to:'لم يبدأ احتساب نقاط هذه الدورة بعد';
const num=n=>new Intl.NumberFormat('ar-SA').format(n);
const rankRows=rows=>{let last=null,rank=0;return [...rows].sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'ar')).map(r=>{if(r.points!==last){last=r.points;rank++}return {...r,viewRank:rank}})};
const encouragement=score=>{
 const p=score?.period,rank=Number(p?.complexRank),circle=Number(p?.circleRank);
 if(score?.unavailable||!p)return {stars:0,title:'لكل خطوة في طريق القرآن أثر',message:'واصل الحفظ والمراجعة؛ سيظهر ترتيبك عند توفر النتائج المعتمدة.'};
 if(Number(p.total)>0&&rank>0&&rank<=3)return {stars:4-rank,title:'نجم من نجوم المجمع!',message:'ما شاء الله! ابنكم في المركز '+num(rank)+' على مستوى المجمع. احتفوا باجتهاده وشجعوه على مواصلة الإتقان.'};
 if(Number(p.total)>0&&circle>0&&circle<=3)return {stars:4-circle,title:'بطل من أبطال الحلقة!',message:'ما شاء الله! ابنكم في المركز '+num(circle)+' في حلقته. خطوة مميزة، ومع المراجعة المنتظمة يقترب من صدارة المجمع.'};
 return {stars:0,title:'كل يوم فرصة لخطوة أجمل',message:'شجعوا ابنكم على المواظبة والحفظ والمراجعة؛ أبواب المراكز الأولى مفتوحة للاجتهاد، وكل تقدم يستحق الاحتفاء.'};
};
const familyCard=score=>{const e=encouragement(score);return '<section class="section sh-family"><div class="sh-stars" aria-label="'+(e.stars?num(e.stars)+' نجوم':'تشجيع للاستمرار')+'">'+(e.stars?'★'.repeat(e.stars):'✦')+'</div><h2>'+esc(e.title)+'</h2><p>'+esc(e.message)+'</p></section>'};
if(typeof module!=='undefined'&&module.exports)module.exports={rankRows,encouragement,cyclePeriod};
if(typeof window==='undefined')return;
let activeDialog=null;
function button(label,fn){const b=document.createElement('button');b.type='button';b.className='button button-soft';b.textContent=label;b.onclick=fn;return b}
async function open(){
 if(activeDialog?.isConnected){activeDialog.focus();return}
 const client=window.supabaseClient;
 if(!client){location.href='/?app=1&honor=1';return}
 const dialog=document.createElement('dialog');activeDialog=dialog;dialog.className='sh-dialog';dialog.dir='rtl';dialog.setAttribute('aria-labelledby','sh-title');
 dialog.innerHTML='<div class="sh-bar"><div><small>سنابل الوحي · نحتفي بالاجتهاد</small><h2 id="sh-title">لوحة الشرف</h2></div><div class="sh-actions"></div></div><div class="sh-controls"><label>المجمع<select data-complex></select></label><label>دورة النقاط<select data-cycle></select></label><label>الترتيب<select data-scope><option value="all">أوائل المجمع</option><option value="mine">طلابي</option><option value="circles">أوائل كل حلقة</option></select></label><label>الحلقة<select data-circle><option value="">جميع الحلقات</option></select></label><button type="button" class="button button-primary" data-refresh>تحديث النتائج</button></div><div class="sh-cycle-settings" hidden></div><p class="sh-period"></p><p class="sh-cycle-meta"></p><p class="sh-status" role="status" aria-live="polite"></p><div class="sh-board"></div><div class="sh-pages"></div><p class="sh-rule">وفق رصيد الحضور والحصائل المعتمدة ولائحة المجمع. يتشارك المتساوون في النقاط المركز نفسه. لا يُتوَّج الطالب دون رصيد نقاط.</p>';
 document.body.append(dialog);dialog.showModal();
 let dayTimer=null;
 let data=null,view=[],page=0,requestId=0,timer=null,wake=null,presentation=false,closed=false;
 const $=s=>dialog.querySelector(s),status=$('.sh-status'),board=$('.sh-board'),scope=$('[data-scope]'),circle=$('[data-circle]'),complex=$('[data-complex]'),cycleSelect=$('[data-cycle]');
 const actions=$('.sh-actions');
 const shareBtn=button('مشاركة الترتيب',share),imageBtn=button('حفظ صورة للخلفية',()=>saveImage()),screenBtn=button('عرض كشاشة توقف',toggleScreen),closeBtn=button('إغلاق',()=>dialog.close());
 actions.append(shareBtn,imageBtn,screenBtn,closeBtn);
 const pageSize=()=>presentation?6:18;
 const selectedTitle=()=>scope.value==='mine'?'ترتيب طلابي':scope.value==='circles'?'أبطال الحلقات':circle.value?(data?.rows.find(r=>r.circleId===circle.value)?.circleName||'الحلقة'):'أوائل المجمع';
 function selectView(){
  let rows=data?.rows||[];
  if(circle.value)rows=rows.filter(r=>r.circleId===circle.value);
  if(scope.value==='mine')rows=rows.filter(r=>r.mine);
  if(scope.value==='circles')rows=rows.filter(r=>r.circleId&&r.circleRank===1&&r.points>0);
  return rankRows(rows);
 }
 function rankLabel(r){return r.points>0?num(r.viewRank):'—'}
 function card(r){return '<article class="sh-champion sh-place-'+r.viewRank+'"><span class="sh-medal" aria-hidden="true">'+({1:'♛',2:'★',3:'✦'}[r.viewRank]||'★')+'</span><span class="sh-place">المركز '+rankLabel(r)+'</span><h3>'+esc(r.name)+'</h3><p>'+esc(r.circleName)+'</p><strong>'+num(r.points)+' <small>نقطة</small></strong><div>في الحلقة: '+num(r.circleRank)+' · في المجمع: '+num(r.complexRank)+'</div></article>'}
 function render(){
  if(!data)return;view=selectView();
  const totalPages=Math.max(1,Math.ceil(view.length/pageSize()));page=Math.min(page,totalPages-1);
  const winners=view.slice(page*pageSize(),(page+1)*pageSize()).filter(r=>r.points>0&&r.viewRank<=3);
  const slice=view.slice(page*pageSize(),(page+1)*pageSize());
  $('.sh-period').textContent=data.complexName+' · '+selectedTitle()+' · '+cyclePeriod(data);
  $('.sh-cycle-meta').textContent=data.cycle.name+' · المدة: '+num(data.cycle.duration)+' يومًا · نهاية الدورة: '+data.cycle.end+(data.cycle.schedule?' · التصفير القادم: '+data.cycle.schedule.nextStart+' (منتصف الليل بتوقيت الرياض)':'');
  board.innerHTML=(winners.length?'<div class="sh-podium">'+winners.map(card).join('')+'</div>':view.some(r=>r.points>0)?'':'<div class="sh-empty">'+(view.length?'بانتظار رصيد نقاط للتتويج. كل بداية تستحق التشجيع.':'لا يوجد طلاب في هذا الاختيار.')+'</div>')+
   (view.length?'<h3 class="sh-list-title">ترتيب الطلاب <small>صفحة '+num(page+1)+' من '+num(totalPages)+'</small></h3><div class="sh-table-wrap"><table><thead><tr><th>المركز</th><th>الطالب</th><th>الحلقة</th><th>النقاط</th><th>في الحلقة</th><th>في المجمع</th></tr></thead><tbody>'+slice.map(r=>'<tr><td>'+rankLabel(r)+'</td><td>'+esc(r.name)+(r.mine?'<span class="sh-mine">من طلابي</span>':'')+'</td><td>'+esc(r.circleName)+'</td><td>'+num(r.points)+'</td><td>'+num(r.circleRank)+'</td><td>'+num(r.complexRank)+'</td></tr>').join('')+'</tbody></table></div>':'');
  const pages=$('.sh-pages');pages.replaceChildren();
  if(totalPages>1){const prev=button('السابق',()=>{page--;render()}),next=button('التالي',()=>{page++;render()});prev.disabled=page===0;next.disabled=page>=totalPages-1;pages.append(prev,document.createTextNode(' '+num(page+1)+' / '+num(totalPages)+' '),next)}
  shareBtn.disabled=imageBtn.disabled=!view.length;
  if(presentation){board.scrollTop=0;dialog.scrollTop=0;}
 }
 async function load(){
  const ticket=++requestId;status.textContent='جارٍ احتساب الترتيب…';shareBtn.disabled=imageBtn.disabled=true;
  try{
   const res=await client.rpc('snabil_honor_roll_cycle',{p_complex_id:complex.value||null,p_cycle_id:cycleSelect.value?Number(cycleSelect.value):null});
   if(res.error)throw Error(res.error.message);
   if(closed||ticket!==requestId)return;
   const first=!data;data=res.data;
   complex.replaceChildren(...data.complexes.map(c=>new Option(c.name,c.id)));complex.value=data.complexId;
   const selectedCycle=cycleSelect.value;cycleSelect.replaceChildren(new Option('الدورة الحالية',''),...(data.cycle.cycles.length?data.cycle.cycles.map(c=>new Option(c.name+' · '+c.from+' — '+c.end+' · '+({active:'جارية',closed:'مكتملة',scheduled:'مجدولة'}[c.status]),String(c.id))):[]));cycleSelect.value=selectedCycle;
   setupCycles();
   const circles=new Map(data.rows.filter(r=>r.circleId).map(r=>[r.circleId,r.circleName]));const old=circle.value;
   circle.replaceChildren(new Option('جميع الحلقات',''),...[...circles].map(([id,n])=>new Option(n,id)));circle.value=circles.has(old)?old:'';
   scope.querySelector('[value="mine"]').disabled=!data.rows.some(r=>r.mine);
   if(first&&data.teacherOnly)scope.value='mine';
   if(scope.value==='mine'&&!data.rows.some(r=>r.mine))scope.value='all';
   page=0;status.textContent='آخر تحديث: '+new Date(data.generatedAt).toLocaleString('ar-SA');render();
  }catch(e){if(closed||ticket!==requestId)return;data=null;view=[];board.replaceChildren();$('.sh-pages').replaceChildren();status.textContent=e.message||'تعذر تحميل الترتيب. أعد المحاولة.'}
 }
 scope.onchange=circle.onchange=()=>{page=0;render()};cycleSelect.onchange=()=>void load();complex.onchange=()=>{circle.value='';cycleSelect.value='';void load()};$('[data-refresh]').onclick=load;
 function setupCycles(){
  const host=$('.sh-cycle-settings');host.hidden=data.teacherOnly;
  if(data.teacherOnly){host.replaceChildren();return}
  const last=data.cycle.cycles[0],next=last?addDays(last.end,1):data.cycle.today;
  host.innerHTML='<details><summary>⚙ إدارة دورات النقاط</summary><p>حدد بداية الاحتساب ونهايته. يبدأ رصيد مستقل عند التصفير وتبقى الدورات السابقة قابلة للعرض. التواريخ بتوقيت الرياض، ونهاية الدورة تشمل اليوم كاملًا.</p><form data-cycle-form><div class="sh-cycle-fields"><label>اسم الدورة<input name="title" required maxlength="100" value="دورة جديدة"></label><label>بداية احتساب النقاط<input name="start" type="date" required></label><label>مدة الدورة بالأيام<input name="days" type="number" min="1" max="366" value="30" required></label><label>نهاية احتساب النقاط<input name="end" type="date" required></label><label>موعد التصفير وبدء الدورة التالية<input name="reset" type="date" required></label><label>مدة كل دورة تالية بالأيام<input name="duration" type="number" min="1" max="366" value="30" required></label></div><label class="sh-auto"><input name="repeat" type="checkbox" checked> بدء دورة جديدة تلقائيًا وتكرارها حسب المدة</label><p data-cycle-preview></p><button class="button button-primary" type="submit">حفظ الدورة</button><p role="status" data-cycle-status></p></form></details>';
  if(last){
   const settings=document.createElement('form');settings.className='sh-schedule-form';
   settings.innerHTML='<h3>تعديل التجديد التلقائي</h3><p>يؤثر على الدورات التالية فقط. آخر دورة محفوظة تنتهي في '+esc(last.end)+'.</p><div class="sh-cycle-fields"><label>موعد التصفير التالي<input name="reset" type="date" required></label><label>مدة كل دورة تالية بالأيام<input name="duration" type="number" min="1" max="366" required></label></div><label class="sh-auto"><input name="repeat" type="checkbox"> تفعيل التجديد التلقائي</label><button type="submit" class="button button-soft">حفظ إعداد التجديد</button><p role="status"></p>';
   const sf=settings.elements;sf.reset.value=data.cycle.schedule?.nextStart||addDays(last.end,1);sf.duration.value=data.cycle.schedule?.duration||30;sf.repeat.checked=!!data.cycle.schedule;
   sf.repeat.onchange=()=>{sf.reset.disabled=sf.duration.disabled=!sf.repeat.checked};sf.repeat.onchange();
   settings.onsubmit=async e=>{e.preventDefault();if(!settings.reportValidity())return;const feedback=settings.querySelector('[role="status"]'),save=settings.querySelector('button');save.disabled=true;
    try{const res=await client.rpc('snabil_set_score_cycle_schedule',{p_complex_id:data.complexId,p_reset:sf.repeat.checked?sf.reset.value:null,p_duration:sf.repeat.checked?Number(sf.duration.value):null});if(res.error)throw Error(res.error.message);await load();status.textContent='حُفظ إعداد التجديد؛ أرصدة الدورات السابقة محفوظة.';}catch(err){feedback.textContent=err.message;save.disabled=false}
   };host.querySelector('details').append(settings);
  }

  const form=host.querySelector('form'),fields=form.elements,feedback=host.querySelector('[data-cycle-status]'),preview=host.querySelector('[data-cycle-preview]');
  fields.start.value=next;fields.end.value=addDays(next,29);fields.reset.value=addDays(next,30);
  const describe=()=>{preview.textContent='تُحتسب النقاط من '+fields.start.value+' إلى '+fields.end.value+(fields.repeat.checked?'، ويبدأ الرصيد الجديد في '+fields.reset.value+' عند 00:00 بتوقيت الرياض.':'، دون تجديد تلقائي.');fields.reset.disabled=fields.duration.disabled=!fields.repeat.checked;};
  fields.start.onchange=fields.days.oninput=()=>{if(fields.start.value&&fields.days.valueAsNumber>=1&&fields.days.valueAsNumber<=366){fields.end.value=addDays(fields.start.value,fields.days.valueAsNumber-1);fields.reset.value=addDays(fields.end.value,1);fields.duration.value=fields.days.value;}describe()};
  fields.end.onchange=()=>{if(fields.start.value&&fields.end.value){fields.days.value=String(Math.round((Date.parse(fields.end.value)-Date.parse(fields.start.value))/86400000)+1);fields.reset.value=addDays(fields.end.value,1);fields.duration.value=fields.days.value;}describe()};
  fields.reset.onchange=fields.repeat.onchange=describe;describe();
  form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;
   if(fields.end.value<fields.start.value||(fields.repeat.checked&&fields.reset.value<=fields.end.value)){feedback.textContent='تحقق من التواريخ: النهاية لا تسبق البداية، والتصفير يأتي بعد نهاية الدورة.';return}
   const submit=form.querySelector('[type="submit"]');submit.disabled=true;feedback.textContent='جارٍ حفظ الدورة…';
   try{const res=await client.rpc('snabil_create_score_cycle',{p_complex_id:data.complexId,p_name:fields.title.value.trim(),p_start:fields.start.value,p_end:fields.end.value,p_reset:fields.repeat.checked?fields.reset.value:null,p_duration:fields.repeat.checked?Number(fields.duration.value):null});if(res.error)throw Error(res.error.message);cycleSelect.add(new Option('',String(res.data.id)));cycleSelect.value=String(res.data.id);await load();status.textContent='حُفظت الدورة. يمكنك التنقل بين الدورات من قائمة دورة النقاط.';}catch(err){feedback.textContent=err.message;submit.disabled=false}
  };
 }
 function addDays(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
 function shareText(){return ['لوحة شرف سنابل الوحي',data.complexName+' — '+selectedTitle(),data.cycle.name+' · '+cyclePeriod(data),...view.slice(page*pageSize(),(page+1)*pageSize()).map(r=>rankLabel(r)+'. '+r.name+' — '+r.circleName+' — '+num(r.points)+' نقطة'),'المراكز المتساوية تعني تساوي النقاط.'].join('\n')}
 async function imageBlob(){
  await document.fonts?.ready;
  const rows=view.slice(page*pageSize(),(page+1)*pageSize()),champions=rows.filter(r=>r.points>0&&r.viewRank<=3);
  const c=document.createElement('canvas');c.width=1920;c.height=Math.max(1080,430+Math.ceil(champions.length/3)*205+rows.length*66);
  const g=c.getContext('2d');g.fillStyle='#103d31';g.fillRect(0,0,c.width,c.height);g.direction='rtl';g.textAlign='center';
  const text=(t,x,y,size=30,color='#fff8e7')=>{g.fillStyle=color;g.font='700 '+size+'px Alyamama, Arial';g.fillText(t,x,y,1720)};
  text('سنابل الوحي  |  لوحة الشرف',960,85,54,'#e8cb88');text(data.complexName+' · '+selectedTitle(),960,144,38);text(data.cycle.name+' · '+cyclePeriod(data),960,195,28,'#bdd5c8');
  let y=240;champions.forEach((r,i)=>{const col=i%3,row=Math.floor(i/3),x=1780-col*600;g.fillStyle=r.viewRank===1?'#7b632d':'#1f5543';g.fillRect(x-540,y+row*205,520,180);text('★ المركز '+rankLabel(r),x-280,y+row*205+40,32,'#ffe0a0');g.font='700 29px Alyamama, Arial';g.fillStyle='#fff';g.fillText(r.name,x-280,y+row*205+95,490);text(num(r.points)+' نقطة',x-280,y+row*205+140,27);});
  y+=Math.ceil(champions.length/3)*205+50;g.textAlign='right';text('الترتيب · '+num(page+1)+' / '+num(Math.max(1,Math.ceil(view.length/pageSize()))),1780,y,30,'#e8cb88');
  rows.forEach(r=>{y+=66;g.fillStyle='#ffffff12';g.fillRect(120,y-42,1680,56);g.fillStyle='#fff8e7';g.font='700 29px Alyamama, Arial';g.fillText(rankLabel(r)+'. '+r.name,1760,y,1000);g.textAlign='left';g.fillStyle='#c9dfd2';g.font='700 25px Alyamama, Arial';g.fillText(num(r.points)+' نقطة · '+r.circleName,150,y,580);g.textAlign='right'});
  g.textAlign='center';text('النقاط المعتمدة • المتساوون يتشاركون المركز • واصلوا الإتقان',960,c.height-45,25,'#c9dfd2');
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('تعذر إنشاء الصورة')),'image/png'));
 }
 async function saveImage(){try{const blob=await imageBlob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sanabil-honor-'+data.to+'-'+(page+1)+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='حُفظت صورة الصفحة الحالية؛ يمكنك اختيارها خلفية أو صورة لشاشة التوقف.'}catch(e){status.textContent=e.message}}
 async function share(){try{const text=shareText();if(navigator.share){await navigator.share({title:'لوحة شرف سنابل الوحي',text});status.textContent='تمت مشاركة ترتيب الصفحة الحالية.'}else if(navigator.clipboard){await navigator.clipboard.writeText(text);status.textContent='نُسخ ترتيب الصفحة الحالية للمشاركة.'}else{const t=document.createElement('textarea');t.value=text;$('.sh-pages').append(t);t.select();status.textContent='انسخ النص الظاهر للمشاركة.'}}catch(e){if(e.name!=='AbortError')status.textContent='تعذرت المشاركة؛ استخدم حفظ صورة للخلفية.'}}
 async function toggleScreen(){
  if(presentation){await stopScreen();return}
  presentation=true;dialog.classList.add('sh-screen');screenBtn.textContent='إنهاء شاشة العرض';
  try{await dialog.requestFullscreen?.()}catch{}
  try{wake=await navigator.wakeLock?.request('screen')}catch{}
  timer=setInterval(()=>{if(!data||document.hidden)return;const pages=Math.max(1,Math.ceil(view.length/pageSize()));if(page+1<pages)page++;else{page=0;const options=[...circle.options].filter(o=>!o.value||scope.value!=='mine'||data.rows.some(r=>r.mine&&r.circleId===o.value));const ix=options.findIndex(o=>o.value===circle.value);circle.value=options[(ix+1)%options.length].value;}render()},15000);render();
 }
 async function stopScreen(){presentation=false;clearInterval(timer);timer=null;dialog.classList.remove('sh-screen');screenBtn.textContent='عرض كشاشة توقف';try{await wake?.release()}catch{}wake=null;if(document.fullscreenElement===dialog)try{await document.exitFullscreen()}catch{}}
 function fullscreenChange(){if(presentation&&!document.fullscreenElement)void stopScreen()}
 function sessionChanged(){dialog.close()}
 document.addEventListener('fullscreenchange',fullscreenChange);window.addEventListener('sanabil-session-changed',sessionChanged);
 dialog.addEventListener('close',()=>{closed=true;clearInterval(dayTimer);requestId++;void stopScreen();document.removeEventListener('fullscreenchange',fullscreenChange);window.removeEventListener('sanabil-session-changed',sessionChanged);dialog.remove();activeDialog=null},{once:true});
 dayTimer=setInterval(()=>{if(data&&!document.hidden&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())!==data.cycle.today)void load()},60000);
 await load();
}
function mountDashboard(root){
 if(!root||root.querySelector('[data-honor-entry]'))return;
 const b=button('🏆 لوحة الشرف',open);b.dataset.honorEntry='true';
 root.classList.add('sl-dashboard-organized');
 const grid=root.querySelector('.sl-quick-grid'),toolbar=root.querySelector('.sl-dashboard-actions');
 if(grid&&toolbar)grid.after(toolbar);
 if(grid&&!root._sanabilFastDashboard){
  b.className='sl-quick-action sh-home-card';
  b.innerHTML='<b>🏆 لوحة الشرف</b><span>الأوائل وترتيب الطلاب</span>';grid.append(b);
 }else{
  b.classList.add('sh-entry');
  const switcher=root.querySelector('.sl-fast-switcher');
  if(switcher)switcher.after(b);else root.append(b);
 }
 if(new URLSearchParams(location.search).get('honor')==='1'){const url=new URL(location.href);url.searchParams.delete('honor');history.replaceState(null,'',url);void open()}
}
window.SanabilHonor={open,mountDashboard,familyCard};
})();
