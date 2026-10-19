/* Sanabil: supervisor-scoped grading policy and leaderboard date ranges. */
(()=>{'use strict';if(window.SanabilPointsAdmin)return;
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 const button=(title,fn)=>{const b=make('button','button button-soft',title);b.type='button';b.addEventListener('click',fn);return b};
 const base=()=>window.supabaseClient;
 const rpc=async(name,args)=>{const {data,error}=await base().rpc(name,args);if(error)throw Error(error.message);return data};
 const cleanNumber=value=>Math.max(0,Math.min(50,Math.floor(Number(value)||0)));
 async function mountDashboard(root,access){
  if(!root?.querySelector||!access?.roles?.some(role=>['admin','manager','supervisor'].includes(role)))return;
  const toolbar=root.querySelector('.sl-dashboard-actions');if(!toolbar||toolbar.querySelector('[data-scoring-open]'))return;
  const b=button('🏅 ضوابط التقييم والنقاط',()=>showDialog(access).catch(e=>alert(e.message)));
  b.dataset.scoringOpen='1';toolbar.append(b);
 }
 async function showDialog(access){
  const dialog=make('dialog','sl-scoring-dialog');dialog.dir='rtl';
  const title=make('h2','', 'ضوابط التقييم والنقاط في المجمع');
  const hint=make('p','sl-points-help','يبدأ تطبيق التعديلات على التقديرات من التاريخ المستقبلي المحدد، ولا يُعاد تعديل نتائج الأيام السابقة. تبقى قيمة نقاط التقديرات والحضور المعتمدة ثابتة.');
  const msg=make('p','sl-points-message');msg.setAttribute('role','status');
  const setMsg=(value,isError=false)=>{msg.textContent=value;msg.dataset.error=isError?'true':'false'};
  const close=button('إغلاق',()=>dialog.close());
  const group=make('label','sl-scoring-label','المجمع');const select=make('select');group.append(select);
  const dateLabel=make('label','sl-scoring-label','تاريخ بدء العمل بالضوابط الجديدة');
  const effective=make('input');effective.type='date';effective.min=new Date(Date.now()+86400000).toISOString().slice(0,10);effective.value=effective.min;dateLabel.append(effective);
  const tracks=make('section','sl-scoring-tracks');
  const scoreSave=button('حفظ ضوابط التقدير',savePolicy);
  const settings=make('section','sl-scoring-periods');
  const sectionHeading=make('h3','', 'فترات عرض النقاط في بوابة ولي الأمر');
  const periodTypes=[['term','الفصل الدراسي'],['custom','مدة يحددها مشرف المجمع']];
  const periodBoxes=[];
  for(const [id,label] of periodTypes){
   const row=make('div','sl-scoring-period');
   row.append(make('h4','',label));
   const name=make('input');name.placeholder='اسم الفترة';name.value=label;
   const from=make('input');from.type='date';
   const to=make('input');to.type='date';
   const save=button('حفظ الفترة',async()=>{
    if(!select.value){setMsg('اختر المجمع أولًا',true);return}
    save.disabled=true;try{await rpc('set_student_scoring_period',{
     p_complex_id:select.value,p_period_type:id,p_label:name.value,
     p_start_date:from.value,p_end_date:to.value});
     setMsg('حُفظت فترة '+label+'، وستظهر في بوابة ولي الأمر.')
    }catch(e){setMsg(e.message,true)}finally{save.disabled=false}
   });
   for(const [labelText,input] of [['اسم الفترة',name],['من تاريخ',from],['إلى تاريخ',to]]){
    const item=make('label','',labelText);item.append(input);row.append(item)
   }
   row.append(save);settings.append(row);periodBoxes.push({id,name,from,to});
  }
  settings.prepend(sectionHeading);
  dialog.append(title,hint,group,dateLabel,tracks,scoreSave,settings,msg,close);
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal?.();
  let policy=null;
  const spec=[
   ['memorization','الحفظ الجديد'],['recentReview','جنب الدرس (المراجعة الصغرى)'],['review','المراجعة الكبرى']
  ];
  const fields=[
   ['error_weight','وزن الخطأ'],['doubt_weight','وزن الشك'],['excellent_max','أقصى مقدار لممتاز'],
   ['very_good_max','أقصى مقدار لجيد جدًا'],['good_max','أقصى مقدار لجيد']
  ];
  const values={};
  function draw(){
   tracks.replaceChildren();const panel=make('div','sl-scoring-grid');
   for(const [type,label] of spec){
    const row=make('fieldset','sl-scoring-track');row.append(make('legend','',label));
    values[type]={};
    for(const [key,text] of fields){
     const control=make('input');control.type='number';control.min=key.includes('weight')?'1':'0';
     control.max=key.includes('weight')?'10':'50';control.step='1';
     control.value=String(policy?.tracks?.[type]?.[key]??0);
     values[type][key]=control;
     const item=make('label','',text);item.append(control);row.append(item);
    }
    panel.append(row);
   }tracks.append(panel);
  }
  async function load(){
   if(!select.value)return;
   setMsg('جارٍ تحميل الضوابط...');
   try{
    const [loaded,periods]=await Promise.all([
     rpc('get_student_scoring_policy',{p_complex_id:select.value}),
     base().from('student_scoring_periods').select('period_type,label,start_date,end_date').eq('complex_id',select.value)
    ]);
    if(periods.error)throw periods.error;
    policy=loaded.rules;draw();
    for(const p of periodBoxes){
     const row=(periods.data||[]).find(x=>x.period_type===p.id);
     p.name.value=row?.label||periodTypes.find(([id])=>id===p.id)?.[1]||'';
     p.from.value=row?.start_date||'';p.to.value=row?.end_date||'';
    }
    setMsg('الضوابط الحالية معروضة. يُسمح بتعديلها اعتبارًا من الغد.');
   }catch(e){setMsg(e.message,true)}
  }
  async function savePolicy(){
   if(!select.value||!policy)return;
   const out={tracks:{}};
   for(const [type] of spec){
    const cfg={};for(const [key] of fields)cfg[key]=cleanNumber(values[type][key].value);
    if(cfg.error_weight<1||cfg.doubt_weight<1||
      cfg.excellent_max>cfg.very_good_max||cfg.very_good_max>cfg.good_max){
      setMsg('تحقق من الأوزان، ومن تدرج ممتاز ثم جيد جدًا ثم جيد.',true);return
    }
    out.tracks[type]=cfg;
   }
   scoreSave.disabled=true;
   try{
    await rpc('set_student_scoring_policy',{p_complex_id:select.value,
      p_rules:out,p_effective_from:effective.value});
    setMsg('حُفظت القواعد الجديدة لتبدأ يوم '+effective.value+'. لن تتغير نتائج الأيام السابقة.');
   }catch(e){setMsg(e.message,true)}finally{scoreSave.disabled=false}
  }
  const ids=[...new Set((access.complexIds||[]).filter(Boolean))];
  let list=[];
  const query=base().from('complexes').select('id,name,org_id').eq('active',true);
  const {data,error}=await (access.roles.includes('admin')
    ?query.eq('org_id',access.org_id):ids.length?query.in('id',ids):Promise.resolve({data:[],error:null}));
  if(error)throw error;
  list=data||[];
  if(!list.length){setMsg('لا توجد مجمعات مسندة لحسابك.',true);scoreSave.disabled=true;return}
  for(const item of list){const option=make('option','',item.name);option.value=item.id;select.append(option)}
  select.addEventListener('change',load);await load();
 }
 window.SanabilPointsAdmin={mountDashboard,showDialog};
})();