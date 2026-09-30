/* Sanabil live modules. All reads and writes use the signed-in SDK and database RLS. */
(()=>{'use strict';
const titles={dashboard:'الرئيسية',students:'الطلاب والمعلمون',outcomes:'الحصيلة اليومية',plans:'الخطط التعليمية',attendance:'الحضور والبصمة',tests:'الاختبارات',inquiries:'الاستعلامات',reports:'التقارير والإحصاءات',settings:'إعدادات المنصة'};
const roles={admin:'مدير النظام',manager:'مدير المؤسسة',supervisor:'مشرف مجمع',teacher:'معلم',examiner:'مختبر'};
const sb=()=>{if(!window.supabaseClient)throw Error('جارٍ تهيئة الاتصال، أعد المحاولة.');return window.supabaseClient};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const result=async q=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data};
const rpc=(name,args)=>result(sb().rpc(name,args));
const rows=async(table,select='*',filters={})=>{let all=[];for(let offset=0;;offset+=500){let q=sb().from(table).select(select).order('id').range(offset,offset+499);for(const [k,v] of Object.entries(filters))q=q.eq(k,v);const data=await result(q);all.push(...data);if(data.length<500)return all;}};
const access=async()=>{const a=await rpc('my_access',{});if(!a?.active)throw Error('الحساب غير نشط؛ راجع مدير النظام.');window.SanabilAccessSync?.(a);return a};
const msg=(root,text,bad=false)=>{let el=root.querySelector('.sl-message');if(!el){el=document.createElement('p');el.className='sl-message';el.setAttribute('role','status');root.prepend(el)}el.textContent=text;el.style.color=bad?'#982431':'#006b55';};
const action=(root,button,fn)=>{if(!button)return null;button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;try{await fn()}catch(e){msg(root,e?.message||'تعذر تنفيذ العملية',true)}finally{button.disabled=false}});return button};
const navigateView=key=>{const label=titles[key],short={dashboard:'الرئيسية',attendance:'البصمة',outcomes:'الحصيلة',plans:'الخطط',tests:'الاختبارات',students:'الطلاب',inquiries:'استعلام',reports:'التقارير',settings:'الإعدادات'}[key];const buttons=[...document.querySelectorAll('.tabs button,.mobile-nav button,.sheet-grid button')],b=buttons.find(x=>x.textContent.trim()===label)||buttons.find(x=>x.textContent.trim()===short);if(b){b.click();return}location.hash='#'+key;location.reload()};
const button=(label,id='')=>`<button type="button" class="button button-soft" ${id?`data-action="${id}"`:''}>${esc(label)}</button>`;
const field=(label,name,type='text',value='',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select=(label,name,items,value='',empty='اختر')=>`<label>${esc(label)}<select name="${name}"><option value="">${esc(empty)}</option>${items.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(value)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;
const table=(headers,data)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.length?data.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">لا توجد سجلات مطابقة.</td></tr>`}</tbody></table></div>`;
const val=(root,name)=>root.querySelector(`[name="${name}"]`).value;
const dateText=d=>d?new Date(d).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}):'—';
const attendanceAr={present:'حاضر',late:'متأخر',excused:'مستأذن',absent:'غائب'};
const weekDays=[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']];
const weekdayChecks=(prefix,selected=['0','1','2','3','4'])=>`<fieldset><legend>أيام الدوام</legend><div class="sl-checks">${weekDays.map(([id,n])=>`<label><input type="checkbox" name="${prefix}${id}" ${selected.map(String).includes(id)?'checked':''}> ${n}</label>`).join('')}</div></fieldset>`;
const selectedWeekdays=(form,prefix)=>weekDays.filter(([id])=>form.querySelector(`[name="${prefix}${id}"]`)?.checked).map(([id])=>id);

let surahsPromise=null;
const quranCatalog=async()=>{if(!surahsPromise)surahsPromise=rpc('quran_surah_catalog',{}).catch(e=>{surahsPromise=null;throw e});return surahsPromise};
async function quranPair(root,surahName='surah',ayahName='ayah',initial={}){
 const surah=root.querySelector(`[name="${surahName}"]`),ayah=root.querySelector(`[name="${ayahName}"]`);if(!surah||!ayah)return;
 const catalog=await quranCatalog();
 const initialSurah=Number(initial.surahNo||initial.surah||surah.value||catalog?.[0]?.surahNo||1),initialAyah=Number(initial.ayahNo||initial.ayah||ayah.value||1);
 surah.innerHTML=(catalog||[]).map(s=>`<option value="${esc(s.surahNo)}">${esc(s.surahNo)}. ${esc(s.name)}</option>`).join('');
 const fillAyahs=(wanted=1)=>{const row=(catalog||[]).find(s=>Number(s.surahNo)===Number(surah.value)),max=Number(row?.ayahCount||1);ayah.innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');ayah.value=String(Math.max(1,Math.min(max,Number(wanted)||1)))};
 surah.value=String((catalog||[]).some(s=>Number(s.surahNo)===initialSurah)?initialSurah:(catalog?.[0]?.surahNo||1));fillAyahs(initialAyah);surah.addEventListener('change',()=>fillAyahs(1));
}
const quranFields=(root,initial={})=>quranPair(root,'surah','ayah',initial);

const qref=r=>r?(`${r.surahName||r.surah||'سورة'}: ${r.ayahNo||r.ayah||''}${r.pageNo?' (ص '+r.pageNo+')':''}`):'—';
const unitAr={lines:'سطر',pages:'صفحة',ayahs:'آية',surahs:'سورة',juz:'جزء',hizb:'حزب',half_hizb:'نصف حزب',quarter_hizb:'ربع حزب'};
const directionAr={toward_nas:'نحو الناس',toward_fatiha:'نحو الفاتحة'};
const segmentsOnlyText=segments=>Array.isArray(segments)&&segments.length?segments.map(s=>{const f=s.from||{},t=s.to||{},name=s.surahName||f.surahName||f.surah||'السورة';return `سورة ${name}: ${f.ayahNo||f.ayah||''}–${t.ayahNo||t.ayah||''}`}).join('، ثم '):'';
const assignmentText=a=>{if(!a)return'لا يوجد مقرر';const fallback=segmentsOnlyText(a.segments)||(`${qref(a.from)} ← ${qref(a.to)}`),detail=a.displayLabel||fallback,meta=[];if(a.amount)meta.push(`${a.amount} ${unitAr[a.unit]||'وحدة'}`);if(a.direction&&a.planName!=='المراجعة الصغرى')meta.push(directionAr[a.direction]||a.direction);if(Number(a.cycleNo||1)>1)meta.push('الدورة '+a.cycleNo);if(Number(a.carryIn||0)>0)meta.push('كمية مرحّلة '+a.carryIn);return detail+(meta.length?' · '+meta.join(' · '):'')};
const inlineSelect=(name,items,value='',aria='')=>`<select name="${name}" aria-label="${esc(aria||name)}"><option value="">اختر</option>${items.map(x=>`<option value="${esc(x.id)}" ${String(x.id)===String(value)?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
const waPhone=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);if(d.startsWith('0')&&d.length===10)d='966'+d.slice(1);return d};
const openWhatsApp=(phone,text)=>{const p=waPhone(phone);if(!p||p.length<10)throw Error('لا يوجد رقم جوال صحيح للمستلم. راجع بيانات الجوال أولًا.');const w=window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');if(!w)throw Error('تعذر فتح واتساب؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');return w};
const openMushaf=a=>{const r=a?.from;if(!r?.surahNo)return;const u=new URL('https://jadeerquran.web.app/mushaf.html');u.searchParams.set('surah',r.surahNo);u.searchParams.set('ayah',r.ayahNo||1);if(r.pageNo)u.searchParams.set('page',r.pageNo);window.open(u.toString(),'_blank','noopener,noreferrer')};
const wrapCanvas=(ctx,text,x,y,maxWidth,lineHeight)=>{const words=String(text||'').split(/\s+/);let line='',yy=y;for(const w of words){const test=line?line+' '+w:w;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,yy);yy+=lineHeight;line=w}else line=test}if(line){ctx.fillText(line,x,yy);yy+=lineHeight}return yy};
async function shareOutcomeImage(student,date,lesson,recent,review,ratings,attendance,note){
  try{await document.fonts.ready;await Promise.allSettled([document.fonts.load('700 52px Doran'),document.fonts.load('400 30px Alyamama'),document.fonts.load('700 30px Alyamama')])}catch{}
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1900;const ctx=canvas.getContext('2d');
  ctx.direction='rtl';ctx.textAlign='right';

  const cream='#F8F5EE',ink='#183C33',deep='#073C34',teal='#00808A',gold='#D8BD88',lineColor='#DDE7E2',muted='#6B7D76';
  ctx.fillStyle=cream;ctx.fillRect(0,0,canvas.width,canvas.height);

  const hero=ctx.createLinearGradient(0,0,1080,320);hero.addColorStop(0,deep);hero.addColorStop(.72,'#0B5A4B');hero.addColorStop(1,'#7A632F');
  ctx.fillStyle=hero;ctx.fillRect(0,0,1080,330);
  ctx.fillStyle=gold;ctx.fillRect(0,318,1080,12);

  ctx.globalAlpha=.08;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(120,40,210,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(250,300,135,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;

  try{
    drawRound(ctx,760,38,250,112,24,'#ffffff');
    const logo=await canvasImage('/assets/logo-sanabil-v6.png');
    ctx.drawImage(logo,785,52,200,82);
  }catch{
    ctx.fillStyle='#ffffff';ctx.font='700 38px Doran, Alyamama, sans-serif';ctx.fillText('سنابل الوحي',990,95);
  }

  ctx.fillStyle=gold;ctx.font='700 28px Alyamama, sans-serif';ctx.fillText('بطاقة الحصيلة اليومية',700,78);
  ctx.fillStyle='#ffffff';ctx.font='700 52px Doran, Alyamama, sans-serif';ctx.fillText(student,700,145,620);
  ctx.fillStyle='#E9F3F0';ctx.font='400 25px Alyamama, sans-serif';ctx.fillText('متابعة الحفظ والمراجعة بتقدير مستقل',700,195);
  ctx.fillStyle='#ffffff';ctx.font='400 23px Alyamama, sans-serif';ctx.fillText('التاريخ: '+date,700,246);

  const att=attendanceAr[attendance]||attendance||'—';
  const attFill=attendance==='absent'?'#FFF0ED':attendance==='late'?'#FFF7DF':attendance==='excused'?'#F3EFE6':'#EAF5F2';
  const attText=attendance==='absent'?'#9A443D':attendance==='late'?'#8A6117':deep;
  drawRound(ctx,72,232,240,58,29,attFill);
  ctx.textAlign='center';ctx.fillStyle=attText;ctx.font='700 25px Alyamama, sans-serif';ctx.fillText('الحضور: '+att,192,270);ctx.textAlign='right';

  const absent=['absent','excused'].includes(attendance);
  const assignment=(text)=>absent?'لم يُحتسب مقرر اليوم، وسيعاد توزيعه تلقائيًا.':(text||'—');
  const gradeText=g=>absent?'—':(g||'—');
  const gradeStyle=g=>{
    if(absent)return['#F1F2EF','#777C78'];
    if(g==='ممتاز')return['#E4F2EC','#0D6A55'];
    if(g==='جيد جدًا')return['#EEF4E8','#52743A'];
    if(g==='جيد')return['#FFF4D8','#8A6117'];
    if(g==='لم يحفظ'||g==='لم يسمع')return['#FFF0ED','#9A443D'];
    return['#F1F4F2',muted];
  };
  const splitLines=(text,maxWidth)=>{
    const words=String(text||'—').split(/\s+/),out=[];let line='';
    for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxWidth&&line){out.push(line);line=w}else line=t}
    if(line)out.push(line);return out.length?out:['—'];
  };
  const tracks=[
    {title:'الحفظ الجديد',text:assignment(lesson),grade:gradeText(ratings?.memorization),mark:'ح'},
    {title:'المراجعة الصغرى',text:assignment(recent),grade:gradeText(ratings?.recentReview),mark:'ص'},
    {title:'المراجعة الكبرى',text:assignment(review),grade:gradeText(ratings?.review),mark:'ك'}
  ];

  let y=390;
  for(const t of tracks){
    ctx.font='400 28px Alyamama, sans-serif';
    const lines=splitLines(t.text,720),h=Math.max(190,122+lines.length*42);
    drawRound(ctx,65,y,950,h,28,'#FFFFFF',lineColor);
    ctx.fillStyle=teal;ctx.fillRect(991,y+22,8,h-44);
    drawRound(ctx,900,y+28,62,62,18,'#E9F4F1');
    ctx.textAlign='center';ctx.fillStyle=deep;ctx.font='700 28px Alyamama, sans-serif';ctx.fillText(t.mark,931,y+69);ctx.textAlign='right';
    ctx.fillStyle=deep;ctx.font='700 31px Doran, Alyamama, sans-serif';ctx.fillText(t.title,870,y+68);
    const [gf,gt]=gradeStyle(t.grade);ctx.font='700 22px Alyamama, sans-serif';const gw=Math.max(110,ctx.measureText(t.grade).width+44);
    drawRound(ctx,88,y+30,gw,52,26,gf);ctx.textAlign='center';ctx.fillStyle=gt;ctx.fillText(t.grade,88+gw/2,y+64);ctx.textAlign='right';
    ctx.fillStyle=ink;ctx.font='400 28px Alyamama, sans-serif';let ty=y+125;
    for(const ln of lines){ctx.fillText(ln,940,ty,780);ty+=42}
    y+=h+24;
  }

  const noteText=note||'لا توجد ملاحظة إضافية.';
  ctx.font='400 27px Alyamama, sans-serif';const noteLines=splitLines(noteText,790),noteH=Math.max(150,92+noteLines.length*40);
  drawRound(ctx,65,y,950,noteH,26,'#FFFDF8','#E9DDC3');
  ctx.fillStyle=gold;ctx.fillRect(991,y+20,8,noteH-40);
  ctx.fillStyle=deep;ctx.font='700 28px Doran, Alyamama, sans-serif';ctx.fillText('ملاحظة المعلم',940,y+58);
  ctx.fillStyle=muted;ctx.font='400 27px Alyamama, sans-serif';let ny=y+105;for(const ln of noteLines){ctx.fillText(ln,940,ny,790);ny+=40}
  y+=noteH+35;

  ctx.strokeStyle='#D8BD88';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(80,y);ctx.lineTo(1000,y);ctx.stroke();
  ctx.fillStyle=deep;ctx.font='700 25px Alyamama, sans-serif';ctx.fillText('سنابل الوحي',980,y+48);
  ctx.fillStyle=muted;ctx.font='400 21px Alyamama, sans-serif';ctx.fillText('متابعة تعليمية موثوقة بين الحلقة والأسرة',980,y+82);
  ctx.textAlign='left';ctx.fillStyle=teal;ctx.font='400 20px Alyamama, sans-serif';ctx.fillText('الحصيلة · '+date,80,y+82);ctx.textAlign='right';

  const blob=await new Promise(r=>canvas.toBlob(r,'image/png',0.97));if(!blob)throw Error('تعذر إنشاء بطاقة الحصيلة.');
  const file=new File([blob],`حصيلة-${student}-${date}.png`,{type:'image/png'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'بطاقة الحصيلة اليومية',text:`حصيلة ${student} - ${date}`});return}
  const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=file.name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(u),2500);
}
const ageFromBirth=d=>{if(!d)return'—';const b=new Date(d+'T00:00:00'),n=new Date;if(Number.isNaN(b.getTime()))return'—';let a=n.getFullYear()-b.getFullYear();const m=n.getMonth()-b.getMonth();if(m<0||(m===0&&n.getDate()<b.getDate()))a--;return a>=0?a:'—'};
const excelApi=()=>{if(!window.SanabilExcel)throw Error('مكوّن Excel لم يكتمل تحميله؛ حدّث الصفحة ثم أعد المحاولة.');return window.SanabilExcel};

const _xlsxU16=(v,o)=>v.getUint16(o,true),_xlsxU32=(v,o)=>v.getUint32(o,true),_xlsxDec=new TextDecoder('utf-8');
const _xlsxPath=(base,target)=>{
 if(String(target||'').startsWith('/'))return String(target).replace(/^\/+/,'');
 const a=base.split('/');a.pop();
 for(const p of String(target||'').split('/')){if(!p||p==='.')continue;if(p==='..')a.pop();else a.push(p)}
 return a.join('/');
};
async function _xlsxZip(buffer){
 const view=new DataView(buffer);let eocd=-1;
 for(let i=buffer.byteLength-22,stop=Math.max(0,buffer.byteLength-70000);i>=stop;i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
 if(eocd<0)throw Error('ملف Excel غير صالح أو تالف.');
 const total=_xlsxU16(view,eocd+10),cdOffset=_xlsxU32(view,eocd+16),entries=new Map;let off=cdOffset;
 for(let n=0;n<total;n++){
   if(_xlsxU32(view,off)!==0x02014b50)throw Error('تعذر قراءة فهرس ملف Excel.');
   const method=_xlsxU16(view,off+10),csize=_xlsxU32(view,off+20),usize=_xlsxU32(view,off+24),flen=_xlsxU16(view,off+28),xlen=_xlsxU16(view,off+30),clen=_xlsxU16(view,off+32),local=_xlsxU32(view,off+42);
   const name=_xlsxDec.decode(new Uint8Array(buffer,off+46,flen));
   if(_xlsxU32(view,local)!==0x04034b50)throw Error('تعذر قراءة محتوى ملف Excel.');
   const lfn=_xlsxU16(view,local+26),lex=_xlsxU16(view,local+28),start=local+30+lfn+lex;
   entries.set(name,{method,csize,usize,start});off+=46+flen+xlen+clen;
 }
 const bytes=async name=>{
   const e=entries.get(name);if(!e)throw Error('جزء مفقود من ملف Excel: '+name);
   const raw=new Uint8Array(buffer,e.start,e.csize);
   if(e.method===0)return new Uint8Array(raw);
   if(e.method===8){
     if(typeof DecompressionStream!=='function')throw Error('متصفحك لا يدعم فك ضغط Excel. استخدم Chrome أو Edge محدثًا.');
     const ds=new DecompressionStream('deflate-raw'),ab=await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
     return new Uint8Array(ab);
   }
   throw Error('طريقة ضغط غير مدعومة في ملف Excel.');
 };
 return{has:n=>entries.has(n),text:async n=>_xlsxDec.decode(await bytes(n))};
}
const _xlsxXml=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('تعذر تحليل ملف Excel.');return d};
const _xlsxNodes=(d,n)=>Array.from(d.getElementsByTagNameNS('*',n));
const _xlsxCol=ref=>{let n=0;for(const ch of String(ref||'').match(/^[A-Z]+/)?.[0]||''){n=n*26+(ch.charCodeAt(0)-64)}return n};
async function _xlsxWorkbook(file){
 const zip=await _xlsxZip(await file.arrayBuffer()),wdoc=_xlsxXml(await zip.text('xl/workbook.xml')),rdoc=_xlsxXml(await zip.text('xl/_rels/workbook.xml.rels')),rels=new Map;
 _xlsxNodes(rdoc,'Relationship').forEach(x=>rels.set(x.getAttribute('Id'),x.getAttribute('Target')));
 const sheets=new Map;
 _xlsxNodes(wdoc,'sheet').forEach(x=>{const rid=x.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||x.getAttribute('r:id');const t=rels.get(rid);if(t)sheets.set(x.getAttribute('name'),_xlsxPath('xl/workbook.xml',t))});
 let shared=[];
 if(zip.has('xl/sharedStrings.xml')){const sdoc=_xlsxXml(await zip.text('xl/sharedStrings.xml'));shared=_xlsxNodes(sdoc,'si').map(si=>_xlsxNodes(si,'t').map(t=>t.textContent||'').join(''))}
 const readSheet=async name=>{
   const path=sheets.get(name);if(!path)throw Error('الملف لا يحتوي ورقة «'+name+'».');
   const doc=_xlsxXml(await zip.text(path)),rows=new Map;
   for(const row of _xlsxNodes(doc,'row')){
     const rn=Number(row.getAttribute('r')||0),obj={};
     for(const cell of Array.from(row.childNodes).filter(x=>x.nodeType===1&&x.localName==='c')){
       const col=_xlsxCol(cell.getAttribute('r')),type=cell.getAttribute('t')||'',v=Array.from(cell.childNodes).find(x=>x.nodeType===1&&x.localName==='v'),is=Array.from(cell.childNodes).find(x=>x.nodeType===1&&x.localName==='is');let value='';
       if(type==='s'&&v)value=shared[Number(v.textContent)]??'';
       else if(type==='inlineStr'&&is)value=_xlsxNodes(is,'t').map(t=>t.textContent||'').join('');
       else if(v)value=v.textContent||'';
       obj[col]=String(value??'').trim();
     }
     rows.set(rn,obj);
   }
   return rows;
 };
 return{readSheet};
}
const _sourceDate=v=>{
 const s=String(v??'').trim();if(!s)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d+(?:\.0+)?$/.test(s)){const n=Number(s);if(n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+Math.round(n*86400000));return d.toISOString().slice(0,10)}}
 return s.replace(/\//g,'-');
};
async function parseEntityDatabaseNative(file){
 const book=await _xlsxWorkbook(file),studentsRows=await book.readSheet('بيانات طلاب الجهة'),circlesRows=await book.readSheet('بيانات الحلقات داخل الجهة'),entityRows=await book.readSheet('بيانات الجهة التعليمية');
 const entityName=entityRows.get(2)?.[2]||'',complex=(entityName||'').replace(/\s+بمسجد.*$/,'').trim()||'حلقات بر الوالدين',circleRows=[];
 for(const [n,row] of [...circlesRows.entries()].sort((a,b)=>a[0]-b[0])){if(n<3)continue;const name=row[2]||'',period=row[4]||'',count=row[5]||'',teacher=row[6]||'';if(name&&teacher)circleRows.push({name,period,count,teacher})}
 const primaryByTeacher=new Map;
 for(const x of circleRows){const numeric=/^\d+(?:\.0+)?$/.test(x.count)?Number(x.count):NaN;if(Number.isFinite(numeric)&&numeric>0&&!primaryByTeacher.has(x.teacher))primaryByTeacher.set(x.teacher,x.name)}
 for(const x of circleRows)if(!primaryByTeacher.has(x.teacher))primaryByTeacher.set(x.teacher,x.name);
 const students=[],errors=[];
 for(const [n,row] of [...studentsRows.entries()].sort((a,b)=>a[0]-b[0])){
   if(n<3)continue;const fullName=row[2]||'';if(!fullName)continue;
   const teacher=row[13]||'',circle=primaryByTeacher.get(teacher)||'';
   if(!teacher||!circle){errors.push('الطلاب الصف '+n+': تعذر تحديد الحلقة من اسم المعلم «'+(teacher||'غير موجود')+'».');continue}
   students.push({
     fullName,
     nationality:row[5]||null,
     birthDate:_sourceDate(row[6]),
     identityNumber:row[3]||null,
     stage:row[10]||null,
     guardianPhone:row[11]||null,
     studentPhone:row[12]||null,
     socialStatus:row[9]||null,
     evaluation:row[14]||null,
     registrationStatus:'منتظم',
     complex,circle,teacher,active:true,
     __row:n
   });
 }
 const expected=Math.max(0,[...studentsRows.keys()].filter(n=>n>=3&&studentsRows.get(n)?.[2]).length),warnings=[];
 if(expected!==students.length)warnings.push('تمت قراءة '+students.length+' طالبًا من أصل '+expected+' سجل طالب؛ راجع الصفوف غير المكتملة.');
 if(!students.length)errors.push('لم يتم العثور على أي طالب في ورقة بيانات الطلاب.');
 return{payload:{complexes:[],mosques:[],circles:[],teachers:[],students},validation:{errors,warnings,counts:{complexes:0,mosques:0,circles:0,teachers:0,students:students.length}},source:{entityName,complex,circleRows:circleRows.length}};
}

const guardianLink=async studentId=>{const r=await rpc('get_or_create_guardian_access',{p_student_id:studentId});return location.origin+'/guardian.html?code='+encodeURIComponent(r.code)+'&v=20260930-v12.2'};
async function showGuardianLink(root,studentId,name){
 const url=await guardianLink(studentId);
 if(navigator.share){try{await navigator.share({title:'بوابة ولي الأمر - '+name,text:'متابعة الطالب في منصة سنابل الوحي',url});return}catch(e){if(e?.name==='AbortError')return}}
 const b=modal('بوابة ولي الأمر - '+name);b.innerHTML=`<p>هذا الرابط مخصص لولي الأمر ويعرض الحصيلة والحضور والاختبارات والخطط دون بيانات الهوية.</p><input name="link" value="${esc(url)}" readonly style="width:100%;direction:ltr"><div class="sl-toolbar">${button('نسخ الرابط','copy')}${button('فتح البوابة','open')}</div>`;action(b,b.querySelector('[data-action="copy"]'),async()=>{await navigator.clipboard.writeText(url);msg(b,'تم نسخ الرابط.')});action(b,b.querySelector('[data-action="open"]'),()=>window.open(url,'_blank','noopener,noreferrer'))
}

function canvasImage(src){return new Promise((resolve,reject)=>{const i=new Image;i.onload=()=>resolve(i);i.onerror=reject;i.src=src})}
function drawRound(ctx,x,y,w,h,r,fill,stroke){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,rr):ctx.rect(x,y,w,h);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
async function qrGraphic(text,size=320){
 if(!window.QRCode)throw Error('تعذر تحميل مكوّن الباركود؛ حدّث الصفحة ثم أعد المحاولة.');
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-9999px;top:-9999px';document.body.append(host);
 try{
  new QRCode(host,{text,width:size,height:size,colorDark:'#004a3a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  await new Promise(r=>setTimeout(r,120));
  const el=host.querySelector('canvas,img');if(!el)throw Error('تعذر إنشاء الباركود.');
  if(el.tagName==='CANVAS')return el;
  if(!el.complete)await new Promise((r,j)=>{el.onload=r;el.onerror=j});
  return el;
 } finally {setTimeout(()=>host.remove(),300)}
}
async function studentCardBlob(student,lookups){
 const {data,error}=await sb().functions.invoke('sanabil-student-card',{body:{studentId:student.id}});if(error){let t=error.message;try{t=(await error.context.json()).error||t}catch{}throw Error(t)}if(data?.error)throw Error(data.error);
 try{await document.fonts.ready;await Promise.allSettled([document.fonts.load('700 48px Doran'),document.fonts.load('400 28px Alyamama')])}catch{}
 const portal=data.guardianUrl,canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1420;
 const ctx=canvas.getContext('2d');ctx.direction='rtl';ctx.textAlign='right';
 ctx.fillStyle='#fbf8f2';ctx.fillRect(0,0,1080,1420);
 ctx.fillStyle='#082c27';ctx.fillRect(0,0,1080,285);
 try{const icon=await canvasImage('/assets/logo-sanabil-icon-v6.png');drawRound(ctx,870,38,120,120,25,'#ffffff');ctx.drawImage(icon,885,53,90,90)}catch{}
 ctx.textAlign='right';ctx.fillStyle='#ffffff';ctx.font='700 40px Doran, Alyamama, sans-serif';ctx.fillText('سنابل الوحي',845,91);
 ctx.font='400 20px Alyamama, sans-serif';ctx.fillStyle='#d8bd88';ctx.fillText('نحو بيئة تعليمية رائدة',845,132);
 ctx.fillStyle='#d8bd88';ctx.fillRect(0,274,1080,11);
 ctx.fillStyle='#fff';ctx.font='700 48px Doran, Alyamama, sans-serif';ctx.fillText('بطاقة متابعة الطالب',610,112);
 ctx.font='400 28px Alyamama, sans-serif';ctx.fillStyle='#e8f3ef';ctx.fillText('بوابة الأسرة · سنابل الوحي',610,165);
 const circle=lookups.circles.find(x=>x.id===student.circle_id),teacher=lookups.teachers.find(x=>x.id===student.teacher_id),complex=lookups.complexes.find(x=>x.id===student.complex_id);
 ctx.fillStyle='#183c33';ctx.font='700 47px Alyamama, sans-serif';ctx.fillText(student.full_name||'—',980,365,900);
 const rows=[['المجمع',complex?.name||'—'],['الحلقة',circle?.name||student.circle_name||'—'],['المعلم',teacher?.full_name||student.teacher_name||'—'],['المرحلة',student.stage||'—']];
 let y=425;for(const [k,v] of rows){drawRound(ctx,80,y,920,92,20,'#ffffff','#e4dccf');ctx.fillStyle='#0e5848';ctx.font='700 25px Alyamama, sans-serif';ctx.fillText(k,950,y+35);ctx.fillStyle='#263c36';ctx.font='400 28px Alyamama, sans-serif';ctx.fillText(String(v),950,y+70,820);y+=110}
 drawRound(ctx,80,860,920,420,28,'#ffffff','#d8bd88');
 if(Array.isArray(data.qrRows)&&data.qrRows.length){
   const n=Number(data.qrSize||data.qrRows.length),box=330,quiet=4,total=n+quiet*2,cell=box/total,left=375,top=895;
   ctx.fillStyle='#ffffff';ctx.fillRect(left,top,box,box);ctx.fillStyle='#004a3a';
   for(let y=0;y<n;y++){const row=String(data.qrRows[y]||'');for(let x=0;x<n;x++)if(row[x]==='1')ctx.fillRect(left+(x+quiet)*cell,top+(y+quiet)*cell,Math.ceil(cell+.25),Math.ceil(cell+.25))}
 }else if(data.qrSvg){
   const qblob=new Blob([data.qrSvg],{type:'image/svg+xml'}),qu=URL.createObjectURL(qblob),qr=await canvasImage(qu);ctx.drawImage(qr,375,895,330,330);URL.revokeObjectURL(qu);
 }else throw Error('تعذر توليد رمز بطاقة الطالب.');
 ctx.textAlign='center';ctx.fillStyle='#004a3a';ctx.font='700 27px Alyamama, sans-serif';ctx.fillText('امسح الرمز لفتح بوابة ولي الأمر',540,1260);
 ctx.fillStyle='#66736f';ctx.font='400 22px Alyamama, sans-serif';ctx.fillText('متابعة الحصيلة والحضور والخطط والاختبارات يوميًا',540,1300);
 ctx.fillStyle='#004a3a';ctx.fillRect(0,1365,1080,55);ctx.fillStyle='#fff';ctx.font='400 20px Alyamama, sans-serif';ctx.fillText('سنابل الوحي · متابعة تعليمية موثوقة بين الحلقة والأسرة',540,1400);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/png',0.96));if(!blob)throw Error('تعذر إنشاء بطاقة الطالب.');
 return{blob,portal};
}
const safeFileName=x=>String(x||'طالب').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();
function downloadBlobFile(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download=name;a.rel='noopener';a.style.display='none';document.body.append(a);
 a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),8000);
}
async function showStudentCard(root,student,lookups){
 const {blob,portal}=await studentCardBlob(student,lookups),url=URL.createObjectURL(blob),b=modal('بطاقة الطالب - '+student.full_name);
 const fileName='بطاقة-'+safeFileName(student.full_name)+'.png';
 b.innerHTML=`<div class="sl-student-card-preview"><img src="${url}" alt="بطاقة ${esc(student.full_name)}"></div><p class="sl-help">الباركود يفتح بوابة ولي الأمر الخاصة بهذا الطالب مباشرةً. على الهاتف يمكنك المشاركة، أو حفظ الصورة، أو فتحها وحدها ثم حفظها من المتصفح.</p><div class="sl-toolbar">${button('مشاركة البطاقة','share-card')}${button('حفظ الصورة','save-card')}${button('فتح الصورة للحفظ','open-image')}${button('نسخ رابط البوابة','copy-link')}</div>`;
 action(b,b.querySelector('[data-action="share-card"]'),async()=>{
   const file=new File([blob],fileName,{type:'image/png'});
   try{
     if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'بطاقة متابعة '+student.full_name,text:'بوابة ولي الأمر في منصة سنابل الوحي'});return}
     if(navigator.share){await navigator.share({title:'بوابة ولي الأمر - '+student.full_name,text:'متابعة الطالب في منصة سنابل الوحي',url:portal});return}
     downloadBlobFile(blob,fileName);msg(b,'لا يدعم هذا المتصفح مشاركة الملفات؛ تم إرسال البطاقة إلى التنزيل.');
   }catch(e){if(e?.name!=='AbortError')throw e}
 });
 action(b,b.querySelector('[data-action="save-card"]'),()=>{downloadBlobFile(blob,fileName);msg(b,'تم إرسال صورة البطاقة إلى التنزيلات.')});
 action(b,b.querySelector('[data-action="open-image"]'),()=>{const w=window.open(url,'_blank');if(!w)throw Error('تعذر فتح الصورة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة.')});
 action(b,b.querySelector('[data-action="copy-link"]'),async()=>{await navigator.clipboard.writeText(portal);msg(b,'تم نسخ رابط بوابة ولي الأمر.')});
 b.closest('dialog')?.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),1000),{once:true});
}
const metricTracks=[['memorization','الحفظ الجديد'],['recentReview','المراجعة الصغرى'],['review','المراجعة الكبرى']];
const gradeOk=g=>['ممتاز','جيد جدًا','جيد'].includes(g);
const gradeFail=g=>['لم يحفظ','لم يسمع'].includes(g);
const outcomeRatings=o=>[o?.memorization_rating,o?.recent_review_rating,o?.review_rating].filter(Boolean);
const outcomeTrackRate=list=>{const r=list.flatMap(outcomeRatings);return r.length?Math.round(r.filter(gradeOk).length/r.length*100):0};
const outcomeFailCount=o=>outcomeRatings(o).filter(gradeFail).length;

const metricBlank=()=>({memorization:{errors:0,doubts:0,tajweed:0},recentReview:{errors:0,doubts:0,tajweed:0},review:{errors:0,doubts:0,tajweed:0}});
const normalizedMetrics=m=>{const o=metricBlank();for(const [k] of metricTracks)for(const f of ['errors','doubts','tajweed'])o[k][f]=Math.max(0,Math.min(100,Number(m?.[k]?.[f]||0)));return o};
const metricTotal=m=>{const n=normalizedMetrics(m);return metricTracks.reduce((z,[k])=>z+n[k].errors+n[k].doubts+n[k].tajweed,0)};
const metricSummary=m=>{const n=normalizedMetrics(m),e=metricTracks.reduce((z,[k])=>z+n[k].errors,0),d=metricTracks.reduce((z,[k])=>z+n[k].doubts,0),t=metricTracks.reduce((z,[k])=>z+n[k].tajweed,0);return e+d+t?`خطأ ${e} · شك ${d} · تجويد ${t}`:'لا تفاصيل'};
function editMetrics(title,initial,onSave){
 const b=modal('تفاصيل التسميع - '+title),m=normalizedMetrics(initial);
 b.innerHTML=`<form><p>هذه التفاصيل اختيارية وتفيد في اكتشاف مواضع التعثر. اتركها صفرًا إذا كنت تريد الاكتفاء بالتقدير.</p>${metricTracks.map(([k,n])=>`<fieldset><legend>${esc(n)}</legend><div class="form-grid three">${field('الأخطاء',k+'Errors','number',m[k].errors,'min="0" max="100"')}${field('الشكوك/التردد',k+'Doubts','number',m[k].doubts,'min="0" max="100"')}${field('أخطاء التجويد',k+'Tajweed','number',m[k].tajweed,'min="0" max="100"')}</div></fieldset>`).join('')}<button class="button button-primary" type="submit">حفظ التفاصيل</button></form>`;
 const form=b.querySelector('form');submit(form,async()=>{const x=metricBlank();for(const [k] of metricTracks){x[k].errors=Number(val(form,k+'Errors'));x[k].doubts=Number(val(form,k+'Doubts'));x[k].tajweed=Number(val(form,k+'Tajweed'));}onSave(normalizedMetrics(x));b.closest('dialog').close()})
}

async function showStudentProgress(root,s){
 const since=new Date(Date.now()-89*86400000).toISOString().slice(0,10);
 const [outcomes,attendance,tests,awards]=await Promise.all([
  result(sb().from('outcomes').select('date_key,memorization_rating,recent_review_rating,review_rating,new_lesson,recent_review,review,recitation_metrics').eq('student_id',s.id).gte('date_key',since).order('date_key',{ascending:false}).limit(300)),
  result(sb().from('student_attendance').select('date_key,status,note').eq('student_id',s.id).gte('date_key',since).order('date_key',{ascending:false}).limit(300)),
  result(sb().from('tests').select('performed_at,scores,syllabus_snapshot').eq('student_id',s.id).gte('performed_at',since+'T00:00:00+03:00').order('performed_at',{ascending:false}).limit(50)),
  result(sb().from('student_awards').select('title,category,awarded_on,note').eq('student_id',s.id).order('awarded_on',{ascending:false}).limit(30))
 ]);
 const outcomeRate=outcomeTrackRate(outcomes);
 const present=attendance.filter(x=>['present','late'].includes(x.status)).length,attRate=attendance.length?Math.round(present/attendance.length*100):0;
 const scores=tests.map(x=>Number(x.scores?.total)).filter(Number.isFinite),avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:0;
 const detailCount=outcomes.reduce((n,x)=>n+metricTotal(x.recitation_metrics),0);
 const monthly={};for(const x of outcomes){const k=String(x.date_key).slice(0,7);monthly[k]??={days:0,ok:0,total:0,issues:0};monthly[k].days++;const rs=outcomeRatings(x);monthly[k].ok+=rs.filter(gradeOk).length;monthly[k].total+=rs.length;monthly[k].issues+=metricTotal(x.recitation_metrics)}
 const b=modal('تقدم الطالب - '+s.full_name);
 b.innerHTML=`<div class="stats-grid"><article class="stat-card"><span>إنجاز 90 يومًا</span><b>${outcomeRate}%</b></article><article class="stat-card"><span>الحضور</span><b>${attRate}%</b></article><article class="stat-card"><span>متوسط الاختبارات</span><b>${avg}</b></article><article class="stat-card"><span>مؤشرات التسميع</span><b>${detailCount}</b></article></div><h3>التقدم الشهري</h3>${table(['الشهر','أيام التسميع','المنجز','نسبة الإنجاز','الأخطاء/الشك/التجويد'],Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,v])=>[esc(k),esc(v.days),esc(v.ok),esc(v.total?Math.round(v.ok/v.total*100)+'%':'0%'),esc(v.issues)]))}<h3>آخر الاختبارات</h3>${table(['التاريخ','المقرر','المجموع'],tests.slice(0,10).map(x=>[esc(dateText(x.performed_at)),esc(x.syllabus_snapshot?.label||'—'),esc(x.scores?.total??'—')]))}<h3>التكريم</h3>${table(['التاريخ','التكريم','التصنيف'],awards.map(x=>[esc(x.awarded_on),esc(x.title),esc(x.category||'—')]))}`;
}
function awardStudent(root,s,onDone){
 const b=modal('تكريم الطالب - '+s.full_name),cats=['إنجاز','انضباط','تميز','سلوك','مبادرة','مسابقة','أخرى'].map(x=>({id:x,name:x}));
 b.innerHTML=`<form><div class="form-grid two">${field('عنوان التكريم','title','text','','required')}${select('التصنيف','category',cats,'إنجاز')}${field('التاريخ','awarded_on','date',today(),'required')}${field('ملاحظة','note','text','')}</div><button class="button button-primary" type="submit">حفظ التكريم</button></form>`;
 const form=b.querySelector('form');submit(form,async()=>{await result(sb().from('student_awards').insert({org_id:s.org_id,complex_id:s.complex_id,circle_id:s.circle_id,student_id:s.id,title:val(form,'title').trim(),category:val(form,'category'),awarded_on:val(form,'awarded_on'),note:val(form,'note').trim()||null}).select('id').single());b.closest('dialog').close();await onDone?.();msg(root,'تم حفظ التكريم وسيظهر في بوابة ولي الأمر.')})
}


const csv=(name,head,data)=>{const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+[head,...data].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
function modal(title){const d=document.createElement('dialog');d.className='sl-dialog';d.innerHTML=`<header><h2>${esc(title)}</h2>${button('إغلاق','close')}</header><div class="sl-body"></div>`;document.body.append(d);d.querySelector('[data-action="close"]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d.querySelector('.sl-body')}
const submit=(form,fn)=>{form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('[type="submit"]');if(b.disabled)return;b.disabled=true;try{await fn()}catch(e){msg(form,e.message,true)}finally{b.disabled=false}})};
let lookupPromise=null,lookupAt=0;
async function lookups(){if(!lookupPromise||Date.now()-lookupAt>30000){lookupAt=Date.now();lookupPromise=Promise.all([
 rows('complexes','id,name,org_id',{active:true}),
 rows('circles','id,name,complex_id,org_id,mosque_id,circle_type,session_period,declared_student_count,assignment_note',{active:true}),
 rows('teachers','id,full_name,circle_id,complex_id,user_id,phone,job_title,source_ref',{active:true}),
 result(sb().from('circle_teachers').select('circle_id,teacher_id,is_primary,active').eq('active',true).order('circle_id'))
]).then(([complexes,circles,teachers,circleTeachers])=>({complexes,circles,teachers,circleTeachers})).catch(e=>{lookupPromise=null;throw e})}return lookupPromise}
const teachersForCircle=(data,circleId)=>{const ids=new Set((data.circleTeachers||[]).filter(x=>x.circle_id===circleId&&x.active!==false).map(x=>x.teacher_id));return data.teachers.filter(x=>x.circle_id===circleId||ids.has(x.id))}
function bindScope(form,data,initial={}){const cx=form.querySelector('[name="complex_id"]'),ci=form.querySelector('[name="circle_id"]'),te=form.querySelector('[name="teacher_id"]');const opts=(el,items,value)=>{if(!el)return;el.innerHTML='<option value="">اختر</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.full_name)}</option>`).join('');if(items.some(x=>x.id===value))el.value=value;else if(items.length===1)el.value=items[0].id;};const teachers=()=>opts(te,teachersForCircle(data,ci.value),initial.teacher_id);const circles=()=>{opts(ci,data.circles.filter(x=>x.complex_id===cx.value),initial.circle_id);teachers()};opts(cx,data.complexes,initial.complex_id);cx.onchange=circles;ci.onchange=teachers;circles()}
async function adminCall(action,payload={}){const {data,error}=await sb().functions.invoke('sanabil-user-admin',{body:{action,...payload}});if(error){let m;try{m=(await error.context.json()).error}catch{}throw Error(m||error.message)}return data}
async function usersPanel(root){const [r,l]=await Promise.all([adminCall('list'),lookups()]);root.innerHTML=button('إضافة مستخدم','new')+table(['الاسم','البريد','الدور','حالة الدخول','الإجراءات'],r.users.map((u,i)=>[esc(u.display_name),esc(u.email),esc((u.memberships?.map(m=>roles[m.role]).filter(Boolean).join('، '))||roles[u.role]||'غير مسند'),esc(!u.active?'معطل':!u.email_confirmed?'بانتظار تأكيد البريد':!u.memberships?.some(m=>m.active)?'يحتاج إسناد صلاحية':'جاهز للدخول'),button('تعديل وإسناد',String(i))+(u.active&&!u.email_confirmed?button('تأكيد البريد','confirm-'+i):'')]));const edit=u=>{const body=modal(u?'تعديل حساب وإسناد صلاحياته':'إنشاء حساب دخول');const m=u?.memberships?.[0]||{},multiple=(u?.memberships?.length||0)>1;body.innerHTML=`<form><div class="form-grid two">${field('الاسم الكامل','display_name','text',u?.display_name||'','required')}${u?'':field('البريد الإلكتروني','email','email','','required')}${u?'':field('كلمة المرور المؤقتة','password','password','','required minlength="10" autocomplete="new-password"')}${select('الدور','role',Object.entries(roles).map(([id,name])=>({id,name})),m.role||u?.role||'teacher')}${select('المجمع','complex_id',l.complexes,m.complex_id)}${select('الحلقة (للمعلم)','circle_id',l.circles,m.circle_id)}<label>نشط<input type="checkbox" name="active" ${u?.active===false?'':'checked'}></label></div><button type="submit" class="button button-primary">حفظ الحساب والصلاحيات</button><p>اختيار المجمع والحلقة يحدد البيانات التي يمكن للحساب الوصول إليها.</p></form>`;const f=body.querySelector('form');bindScope(f,l,m);const adapt=()=>{f.elements.role.disabled=multiple;f.elements.complex_id.disabled=multiple||['admin','manager'].includes(f.elements.role.value);f.elements.circle_id.disabled=multiple||!['teacher'].includes(f.elements.role.value)};f.elements.role.onchange=adapt;adapt();if(multiple)msg(body,'للحساب إسنادات متعددة؛ سيحافظ الحفظ عليها ويحدّث الاسم والحالة فقط.');submit(f,async()=>{await adminCall(u?'update':'create',{user_id:u?.id,preserve_memberships:multiple,display_name:val(f,'display_name'),email:u?undefined:val(f,'email'),password:u?undefined:val(f,'password'),role:val(f,'role'),complex_id:val(f,'complex_id'),circle_id:val(f,'circle_id'),active:f.elements.active.checked});lookupPromise=null;body.closest('dialog').close();await usersPanel(root);msg(root,'تم حفظ الحساب وصلاحياته.')})};action(root,root.querySelector('[data-action="new"]'),()=>edit(null));r.users.forEach((u,i)=>{action(root,root.querySelector(`[data-action="${i}"]`),()=>edit(u));const cb=root.querySelector(`[data-action="confirm-${i}"]`);if(cb)action(root,cb,async()=>{if(!confirm('تأكيد البريد لهذا الحساب المصرّح له؟'))return;await adminCall('confirm_email',{user_id:u.id});await usersPanel(root)})})}
async function studentsPage(root){
 const [l,a]=await Promise.all([lookups(),access()]);let page=0,term='',current=[],circleFilter='',teacherFilter='';const selected=new Set(),canMove=a.roles.some(r=>['admin','manager','supervisor'].includes(r)),canImport=a.roles.includes('admin');
 root.innerHTML=`<div class="sl-toolbar">${field('بحث بالاسم','search')}${select('الحلقة','circleFilter',[{id:'',name:'كل الحلقات'},...l.circles])}${select('المعلم','teacherFilter',[{id:'',name:'كل المعلمين'},...l.teachers.map(t=>({id:t.id,name:t.full_name}))])}${button('بحث','search')}${button('إضافة طالب','add')}${button('المعلمون','teachers')}${button('الحلقات والإسناد','circles')}${canImport?button('استيراد قاعدة الجهة','import-entity-db'):''}${canMove?button('تحديد المعروض','select-page')+button('إلغاء التحديد','clear-selection')+button('نقل المحددين','bulk-move'):''}${button('تصدير المعروض','export')}</div><div class="sl-import-warning" hidden></div><p class="sl-help sl-selection-status"></p><div class="sl-data"></div><div class="sl-toolbar">${button('السابق','prev')}<span class="sl-page"></span>${button('التالي','next')}</div>`;
 const status=()=>{const el=root.querySelector('.sl-selection-status');if(el)el.textContent=canMove?(selected.size?'تم تحديد '+selected.size+' طالبًا للنقل الجماعي.':'يمكن تحديد عدة طلاب ثم نقلهم دفعة واحدة إلى حلقة أخرى.'):'عرض بيانات الطلاب والإسناد حسب صلاحيتك.'};
 action(root,root.querySelector('[data-action="teachers"]'),()=>{const b=modal('المعلمون وإسناد الحلقات');b.innerHTML=table(['المعلم','المسمى','الجوال','الحلقات'],l.teachers.map(t=>{const ids=new Set([t.circle_id,...(l.circleTeachers||[]).filter(x=>x.teacher_id===t.id&&x.active!==false).map(x=>x.circle_id)].filter(Boolean));const names=[...ids].map(id=>l.circles.find(c=>c.id===id)?.name||id).join('، ');return[esc(t.full_name),esc(t.job_title||'—'),esc(t.phone||'—'),esc(names||'غير مسند')]}))});
 action(root,root.querySelector('[data-action="circles"]'),async()=>{const b=modal('الحلقات وإسناد الطلاب');const studentRows=await result(sb().from('students').select('circle_id').eq('active',true));const counts=studentRows.reduce((m,x)=>(m[x.circle_id]=(m[x.circle_id]||0)+1,m),{});b.innerHTML=table(['الحلقة','النوع','الفترة','المعلم','العدد الفعلي','بيان المصدر'],l.circles.map(ci=>{const ts=teachersForCircle(l,ci.id).map(t=>t.full_name).join('، ');const declared=ci.assignment_note||((ci.declared_student_count??'')!==''?'المثبت في المصدر: '+ci.declared_student_count:'—');return[esc(ci.name),esc(ci.circle_type||'—'),esc(ci.session_period||'—'),esc(ts||'غير مسند'),esc(counts[ci.id]||0),esc(declared)]}))});
 if(canImport)action(root,root.querySelector('[data-action="import-entity-db"]'),()=>{
   const b=modal('استيراد قاعدة بيانات الجهة');
   b.innerHTML=`<p>اختر ملف قاعدة بيانات الجهة الأصلي كما صدر من نموذج الجمعية. سيقرأ النظام ورقة الطلاب والحلقات، ويسند كل طالب تلقائيًا إلى الحلقة الأساسية لمعلمه.</p><label>ملف قاعدة البيانات<input type="file" name="entity_file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><div class="sl-import-preview"><p>لم يتم اختيار ملف بعد.</p></div><button type="button" class="button button-primary" data-action="run-import" disabled>استيراد الطلاب إلى المنصة</button>`;
   const input=b.querySelector('[name="entity_file"]'),preview=b.querySelector('.sl-import-preview'),go=b.querySelector('[data-action="run-import"]');let parsed=null;
   input.addEventListener('change',async()=>{go.disabled=true;parsed=null;try{
     const file=input.files?.[0];if(!file)throw Error('اختر ملف Excel.');
     parsed=await parseEntityDatabaseNative(file);
     const v=parsed.validation;
     preview.innerHTML=`<div class="stats-grid"><article class="stat-card"><span>الطلاب الجاهزون للاستيراد</span><b>${esc(v.counts.students)}</b></article><article class="stat-card"><span>الجهة</span><b>${esc(parsed.source.complex||'—')}</b></article></div>${v.errors.length?'<h3>أخطاء تمنع الاستيراد</h3><ul>'+v.errors.slice(0,30).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${v.warnings.length?'<h3>تنبيهات</h3><ul>'+v.warnings.slice(0,30).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${!v.errors.length?'<p>تمت قراءة الملف بنجاح. سيُحدّث الطالب الموجود إذا تطابقت هويته، ويُضاف الطالب الجديد إلى حلقته.</p>':''}`;
     go.disabled=!!v.errors.length||!v.counts.students;
   }catch(e){preview.innerHTML='<p role="alert">'+esc(e.message)+'</p>'}});
   action(b,go,async()=>{if(!parsed||parsed.validation.errors.length)throw Error('اختر ملفًا سليمًا أولًا.');if(!confirm('تأكيد استيراد '+parsed.validation.counts.students+' طالبًا إلى قاعدة سنابل الوحي؟'))return;
     const payload=JSON.parse(JSON.stringify(parsed.payload,(k,v)=>k==='__row'?undefined:v));
     const r=await rpc('bulk_import_master_data',{p_org_id:a.org_id,p_payload:payload});
     lookupPromise=null;selected.clear();page=0;await load();
     preview.innerHTML=`<h3>تم الاستيراد بنجاح</h3><p>الطلاب المعالجون: ${esc(r.students)} — المنقولون بين الحلقات: ${esc(r.movedStudents)}</p>`;
     go.disabled=true;msg(root,'تم استيراد قاعدة الطلاب وتحديث الإسناد.')
   });
 });

 const moveDialog=(ids)=>{
   if(!canMove)throw Error('النقل متاح للمشرف أو المدير.');
   const students=ids.map(id=>current.find(s=>s.id===id)).filter(Boolean),b=modal(ids.length>1?'نقل جماعي للطلاب':'نقل الطالب');
   b.innerHTML=`<form><p>سيُنقل السجل التعليمي كاملًا: الحصيلة والخطط والحضور والاختبارات، ولا تُفقد النتائج السابقة.</p><div class="form-grid two">${select('الحلقة الجديدة','circle_id',l.circles)}${select('المعلم','teacher_id',[])}</div><p class="sl-help">عدد الطلاب المحددين: ${ids.length}</p><button type="submit" class="button button-primary">تنفيذ النقل</button></form>`;
   const form=b.querySelector('form'),ci=form.elements.circle_id,te=form.elements.teacher_id;
   const fillTeachers=()=>{const list=teachersForCircle(l,ci.value);te.innerHTML='<option value="">المعلم الأساسي تلقائيًا</option>'+list.map(t=>`<option value="${esc(t.id)}">${esc(t.full_name)}</option>`).join('')};
   ci.onchange=fillTeachers;fillTeachers();
   submit(form,async()=>{if(!ci.value)throw Error('اختر الحلقة الجديدة.');if(!confirm('تأكيد نقل '+ids.length+' طالبًا إلى الحلقة المختارة؟'))return;const r=await rpc('move_students_bulk_with_history',{p_student_ids:ids,p_circle_id:ci.value,p_teacher_id:te.value||null});ids.forEach(id=>selected.delete(id));b.closest('dialog').close();await load();status();msg(root,'تم نقل '+r.moved+' طالبًا مع كامل سجلهم التعليمي.')});
 };
 const load=async()=>{
  let q=sb().from('students').select('*').eq('active',true).order('full_name').order('id').range(page*50,page*50+49);
  if(term)q=q.ilike('full_name','%'+term.replace(/[%_]/g,'')+'%');
  if(circleFilter)q=q.eq('circle_id',circleFilter);
  if(teacherFilter)q=q.eq('teacher_id',teacherFilter);
  current=await result(q);
  root.querySelector('.sl-data').innerHTML=table([canMove?'اختيار':'#','الاسم','العمر','المستوى','الحلقة','المعلم','ولي الأمر','الإجراءات'],current.map((s,i)=>[
   canMove?`<input type="checkbox" data-student-select="${esc(s.id)}" ${selected.has(s.id)?'checked':''} aria-label="اختيار ${esc(s.full_name)}">`:esc(i+1),
   esc(s.full_name),esc(ageFromBirth(s.birth_date)),esc(s.memorization_level||s.evaluation||s.stage||'—'),esc(l.circles.find(c=>c.id===s.circle_id)?.name||s.circle_name),
   esc(l.teachers.find(t=>t.id===s.teacher_id)?.full_name||s.teacher_name||'غير مسند'),esc(s.guardian_phone||'—'),
   button('تعديل','edit-'+i)+(canMove?button('نقل','move-'+i):'')+button('التقدم','progress-'+i)+button('تكريم','award-'+i)+button('بطاقة الطالب','card-'+i)+button('بوابة ولي الأمر','guardian-'+i)+button('إيقاف','off-'+i)
  ]));
  root.querySelectorAll('[data-student-select]').forEach(x=>x.onchange=()=>{x.checked?selected.add(x.dataset.studentSelect):selected.delete(x.dataset.studentSelect);status()});
  root.querySelector('.sl-page').textContent='صفحة '+(page+1);root.querySelector('[data-action="prev"]').disabled=page===0;root.querySelector('[data-action="next"]').disabled=current.length<50;
  current.forEach((s,i)=>{
   action(root,root.querySelector(`[data-action="edit-${i}"]`),()=>edit(s));
   if(canMove)action(root,root.querySelector(`[data-action="move-${i}"]`),()=>moveDialog([s.id]));
   action(root,root.querySelector(`[data-action="progress-${i}"]`),()=>showStudentProgress(root,s));
   action(root,root.querySelector(`[data-action="award-${i}"]`),()=>awardStudent(root,s,load));
   action(root,root.querySelector(`[data-action="card-${i}"]`),()=>showStudentCard(root,s,l));
   action(root,root.querySelector(`[data-action="guardian-${i}"]`),()=>showGuardianLink(root,s.id,s.full_name));
   action(root,root.querySelector(`[data-action="off-${i}"]`),async()=>{if(!confirm('إيقاف الطالب وإخفاؤه من القوائم اليومية مع حفظ سجلاته؟'))return;await result(sb().from('students').update({active:false}).eq('id',s.id).select('id').single());selected.delete(s.id);await load();status()})
  });
  status()
 };
 const edit=s=>{
  const b=modal(s?'تعديل بيانات الطالب':'إضافة طالب');
  b.innerHTML=`<form><div class="form-grid two">${field('الاسم الثلاثي','full_name','text',s?.full_name||'','required')}${field('الهوية أو الإقامة','identity_number','text',s?.identity_number||'')}${field('الجنسية','nationality','text',s?.nationality||'')}${field('الميلاد ميلادي','birth_date','date',s?.birth_date||'')}${field('الميلاد هجري','birth_date_hijri','text',s?.birth_date_hijri||'')}${field('انتهاء الهوية','identity_expiry','date',s?.identity_expiry||'')}${field('المرحلة الدراسية','stage','text',s?.stage||'')}${field('المستوى/المقدار السابق','memorization_level','text',s?.memorization_level||s?.evaluation||'')}${field('جوال الطالب','student_phone','tel',s?.student_phone||'')}${field('جوال ولي الأمر','guardian_phone','tel',s?.guardian_phone||'')}${select('المجمع','complex_id',l.complexes,s?.complex_id)}${select('الحلقة','circle_id',l.circles,s?.circle_id)}${select('المعلم','teacher_id',l.teachers.map(t=>({id:t.id,name:t.full_name})),s?.teacher_id)}</div><button type="submit" class="button button-primary">حفظ الطالب</button></form>`;
  const form=b.querySelector('form');bindScope(form,l,s||{});
  submit(form,async()=>{
   const row=Object.fromEntries(new FormData(form));if(row.full_name.trim().split(/\s+/).length<3)throw Error('أدخل الاسم الثلاثي');if(!row.circle_id||!row.complex_id)throw Error('اختر المجمع والحلقة');
   for(const k of ['student_phone','guardian_phone']){row[k]=row[k].replace(/[\s()-]/g,'');if(row[k]&&!/^(?:05\d{8}|(?:\+?966)5\d{8}|\d{9,15})$/.test(row[k]))throw Error('رقم الجوال غير صحيح')}
   for(const k of Object.keys(row))if(row[k]==='')row[k]=null;
   row.full_name=row.full_name.trim();row.full_name_normalized=row.full_name.replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ');
   const circle=l.circles.find(c=>c.id===row.circle_id);if(!circle)throw Error('الحلقة غير موجودة');row.org_id=circle.org_id;row.circle_name=circle.name;row.teacher_name=l.teachers.find(t=>t.id===row.teacher_id)?.full_name||null;
   let moved=false;
   if(s&&(s.circle_id!==row.circle_id||s.teacher_id!==row.teacher_id)){await rpc('move_student_with_history',{p_student_id:s.id,p_circle_id:row.circle_id,p_teacher_id:row.teacher_id});moved=s.circle_id!==row.circle_id}
   if(s)await result(sb().from('students').update(row).eq('id',s.id).select('id').single());else await result(sb().from('students').insert({...row,id:crypto.randomUUID(),active:true}).select('id').single());
   b.closest('dialog').close();lookupPromise=null;await load();msg(root,moved?'نُقل الطالب وحصيلته وخططه واختباراته إلى الحلقة الجديدة وحُفظت بياناته.':'حُفظت بيانات الطالب.')
  })
 };
 action(root,root.querySelector('[data-action="search"]'),async()=>{term=val(root,'search').trim();page=0;await load()});
 root.querySelector('[name="circleFilter"]').onchange=async e=>{circleFilter=e.target.value;page=0;await load()};
 root.querySelector('[name="teacherFilter"]').onchange=async e=>{teacherFilter=e.target.value;page=0;await load()};
 action(root,root.querySelector('[data-action="add"]'),()=>edit(null));
 if(canMove){
   action(root,root.querySelector('[data-action="select-page"]'),()=>{current.forEach(s=>selected.add(s.id));root.querySelectorAll('[data-student-select]').forEach(x=>x.checked=true);status()});
   action(root,root.querySelector('[data-action="clear-selection"]'),()=>{selected.clear();root.querySelectorAll('[data-student-select]').forEach(x=>x.checked=false);status()});
   action(root,root.querySelector('[data-action="bulk-move"]'),()=>{if(!selected.size)throw Error('حدد طالبًا واحدًا على الأقل.');moveDialog([...selected])});
 }
 action(root,root.querySelector('[data-action="prev"]'),async()=>{page--;await load()});
 action(root,root.querySelector('[data-action="next"]'),async()=>{page++;await load()});
 action(root,root.querySelector('[data-action="export"]'),()=>excelApi().exportTable('سجل الطلاب',['الاسم','العمر','المستوى','الحلقة','المعلم','جوال ولي الأمر'],current.map(s=>[s.full_name,ageFromBirth(s.birth_date),s.memorization_level||s.evaluation||s.stage,s.circle_name,s.teacher_name,s.guardian_phone]),[['عدد الطلاب',current.length]]));
 if(canImport){const cr=await sb().from('students').select('id',{count:'exact',head:true}).eq('active',true),n=cr.count||0,w=root.querySelector('.sl-import-warning');if(n<=1&&w){w.hidden=false;w.innerHTML='<b>تنبيه:</b> قاعدة الطلاب المرفقة لم تُستورد بعد. الموجود فعليًا الآن '+n+' طالب فقط. اضغط «استيراد قاعدة الجهة» واختر ملف قاعدة الجهة لإدخال الـ87 طالبًا.'}}
 await load()
}
async function outcomesPage(root){
 const l=await lookups();
 root.innerHTML=`<section class="sl-session-head"><div><span class="sl-kicker">جلسة الحلقة اليومية</span><h2>التحضير والحصيلة</h2><p>حضّر الطلاب جماعيًا، ثم قيّم كل مسار على حدة. إذا تعددت المراجعات الكبرى فلكل خطة تقدير مستقل وترحيل مستقل.</p></div></section><div class="sl-toolbar sl-session-filter">${select('الحلقة','circle',l.circles)}${field('التاريخ','date','date',today())}${button('فتح جلسة اليوم','load')}</div><div class="sl-data"></div>`;
 action(root,root.querySelector('[data-action="load"]'),async()=>{
  const circle=val(root,'circle'),date=val(root,'date');if(!circle||!date)throw Error('اختر الحلقة والتاريخ');
  let students=await rpc('get_daily_assignments',{p_circle_id:circle,p_date:date});
  const box=root.querySelector('.sl-data'),gradeItems=['ممتاز','جيد جدًا','جيد','لم يحفظ','لم يسمع'];
  const metrics=new Map(students.map(s=>[s.studentId,normalizedMetrics(s.recitationMetrics)]));
  const states=students.map(s=>({
    attendance:s.attendanceStatus||'',
    note:s.notes||s.attendanceNote||'',
    ratings:{memorization:s.memorizationRating||'',recentReview:s.recentReviewRating||''},
    reviewPlans:Object.fromEntries((s.reviews||[]).map(r=>[r.planId,r.rating||'']))
  }));
  const gradeValue=(st,key)=>key.startsWith('review:')?(st.reviewPlans[key.slice(7)]||''):(st.ratings[key]||'');
  const setGrade=(st,key,value)=>{if(key.startsWith('review:'))st.reviewPlans[key.slice(7)]=value;else st.ratings[key]=value};
  const attButtons=(i,current)=>Object.entries(attendanceAr).map(([id,name])=>`<button type="button" class="sl-choice sl-att-choice ${current===id?'active':''}" data-att-student="${i}" data-att-value="${id}">${esc(name)}</button>`).join('');
  const gradeButtons=(i,key,current)=>gradeItems.map(g=>`<button type="button" class="sl-choice sl-grade-choice ${current===g?'active':''}" data-grade-student="${i}" data-grade-key="${esc(key)}" data-grade-value="${esc(g)}">${esc(g)}</button>`).join('');
  const track=(a,i,key,title,actionId)=>{
    if(!a)return `<section class="sl-track is-empty"><div class="sl-track-head"><b>${esc(title)}</b><span>لا يوجد مقرر</span></div></section>`;
    return `<section class="sl-track"><div class="sl-track-head"><div><b>${esc(title)}</b><span>${esc(assignmentText(a))}</span></div>${button('فتح المصحف','mushaf-'+actionId)}</div><div class="sl-grade-grid">${gradeButtons(i,key,gradeValue(states[i],key))}</div></section>`
  };
  const renderSummary=()=>{const counts={present:0,late:0,excused:0,absent:0,unset:0};states.forEach(x=>Object.prototype.hasOwnProperty.call(counts,x.attendance)&&x.attendance!=='unset'?counts[x.attendance]++:counts.unset++);const el=box.querySelector('.sl-att-summary');if(el)el.innerHTML=`<span>حاضر <b>${counts.present}</b></span><span>متأخر <b>${counts.late}</b></span><span>مستأذن <b>${counts.excused}</b></span><span>غائب <b>${counts.absent}</b></span>${counts.unset?`<span class="warn">غير محضر <b>${counts.unset}</b></span>`:''}`};
  const syncCard=i=>{
    const st=states[i],card=box.querySelector(`[data-student-card="${i}"]`),blocked=['absent','excused'].includes(st.attendance);if(!card)return;
    card.dataset.attendance=st.attendance||'unset';
    card.querySelectorAll('[data-att-student]').forEach(b=>b.classList.toggle('active',b.dataset.attValue===st.attendance));
    card.querySelectorAll('[data-grade-student]').forEach(b=>{b.disabled=blocked;b.classList.toggle('active',b.dataset.gradeValue===gradeValue(st,b.dataset.gradeKey))});
    const note=card.querySelector('.sl-absence-note');if(note)note.textContent=blocked?'لن يُحتسب مقرر هذا اليوم، وسيعاد توزيع كل خطة متأثرة تلقائيًا.':'';
    if(blocked){st.ratings={memorization:'',recentReview:''};st.reviewPlans={};card.querySelectorAll('[data-grade-student]').forEach(b=>b.classList.remove('active'))}
    renderSummary();
  };
  const studentTracks=(s,i)=>{
    const reviews=(s.reviews||[]).map((a,j)=>track(a,i,'review:'+a.planId,a.planName||('المراجعة الكبرى '+(j+1)),`r-${i}-${j}`)).join('');
    return track(s.memorization,i,'memorization','الحفظ الجديد',`m-${i}`)+track(s.recentReview,i,'recentReview','المراجعة الصغرى',`s-${i}`)+(reviews||'<section class="sl-track is-empty"><div class="sl-track-head"><b>المراجعة الكبرى</b><span>لا توجد خطة مراجعة كبرى لهذا اليوم</span></div></section>');
  };
  box.innerHTML=`<div class="sl-bulkbar"><div><b>التحضير الجماعي</b><small>حدد الجميع حاضرين ثم عدّل حالات الاستثناء فقط.</small></div><div class="sl-bulk-actions">${button('الجميع حاضر','all-present')}${button('حفظ التحضير فقط','save-attendance')}</div></div><div class="sl-att-summary"></div><form><div class="sl-student-grid">${students.length?students.map((s,i)=>`<article class="sl-student-card" data-student-card="${i}"><header><div class="sl-student-no">${i+1}</div><div><h3>${esc(s.fullName)}</h3><small>${(s.reviews||[]).length>1?'لديه '+s.reviews.length+' مراجعات كبرى اليوم':'التحضير والحصيلة'}</small></div></header><div class="sl-att-grid">${attButtons(i,states[i].attendance)}</div><p class="sl-absence-note"></p><div class="sl-tracks">${studentTracks(s,i)}</div><label class="sl-note">ملاحظة<input name="note${i}" value="${esc(states[i].note)}" placeholder="ملاحظة اختيارية"></label><div class="sl-card-actions">${button('تفاصيل التسميع','metrics-'+i)}${button('واتساب','wa-'+i)}${button('بطاقة الحصيلة','img-'+i)}${button('بوابة ولي الأمر','portal-'+i)}</div></article>`).join(''):'<div class="sl-empty">لا يوجد طلاب نشطون في الحلقة.</div>'}</div><div class="sl-savebar"><div><b>حفظ الحصيلة</b><small>كل مراجعة كبرى تُحفظ وتُرحّل بصورة مستقلة.</small></div><button class="button button-primary" type="submit" ${students.length?'':'disabled'}>حفظ حصيلة الحلقة</button></div></form>`;
  const form=box.querySelector('form');
  const rowData=(s,i)=>{const st=states[i],reviews=(s.reviews||[]).map(a=>({planId:a.planId,name:a.planName||'المراجعة الكبرى',assignment:assignmentText(a),grade:st.reviewPlans[a.planId]||''}));return{att:st.attendance,note:val(form,'note'+i),ratings:{memorization:st.ratings.memorization||'',recentReview:st.ratings.recentReview||'',reviewPlans:{...st.reviewPlans}},lesson:assignmentText(s.memorization),recent:assignmentText(s.recentReview),reviews,metrics:metrics.get(s.studentId)||metricBlank()}};
  const validateAttendance=()=>{const miss=states.findIndex(x=>!x.attendance);if(miss>=0)throw Error('لم يتم تحضير الطالب: '+students[miss].fullName)};
  const validateRow=(s,x)=>{if(['absent','excused'].includes(x.att))return;if(s.memorization&&!x.ratings.memorization)throw Error('اختر تقدير الحفظ الجديد للطالب: '+s.fullName);if(s.recentReview&&!x.ratings.recentReview)throw Error('اختر تقدير المراجعة الصغرى للطالب: '+s.fullName);for(const r of x.reviews)if(!r.grade)throw Error('اختر تقدير «'+r.name+'» للطالب: '+s.fullName)};
  box.querySelectorAll('[data-att-student]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.attStudent);states[i].attendance=b.dataset.attValue;syncCard(i)});
  box.querySelectorAll('[data-grade-student]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.gradeStudent);setGrade(states[i],b.dataset.gradeKey,b.dataset.gradeValue);syncCard(i)});
  action(box,box.querySelector('[data-action="all-present"]'),()=>{states.forEach((x,i)=>{x.attendance='present';syncCard(i)});msg(box,'تم تحديد الجميع حاضرين؛ عدّل الغائب والمتأخر والمستأذن فقط.')});
  action(box,box.querySelector('[data-action="save-attendance"]'),async()=>{validateAttendance();const payload=students.map((s,i)=>({studentId:s.studentId,status:states[i].attendance,note:val(form,'note'+i)||null}));const r=await rpc('save_student_attendance_bulk',{p_circle_id:circle,p_date:date,p_rows:payload});msg(box,`تم حفظ تحضير ${r.saved} طالبًا.`)});
  students.forEach((s,i)=>{
    syncCard(i);
    const mushafAssignments=[['m-'+i,s.memorization],['s-'+i,s.recentReview],...(s.reviews||[]).map((a,j)=>['r-'+i+'-'+j,a])];
    for(const [id,a] of mushafAssignments){const btn=box.querySelector(`[data-action="mushaf-${id}"]`);if(btn)btn.onclick=()=>openMushaf(a)}
    const md=box.querySelector(`[data-action="metrics-${i}"]`);if(md)action(box,md,()=>{if(['absent','excused'].includes(states[i].attendance))throw Error('لا تسجل تفاصيل تسميع لطالب غائب أو مستأذن.');editMetrics(s.fullName,metrics.get(s.studentId),x=>{metrics.set(s.studentId,x);msg(box,'حُفظت التفاصيل مؤقتًا؛ احفظ حصيلة الحلقة لتثبيتها.')})});
    const bw=box.querySelector(`[data-action="wa-${i}"]`);if(bw)action(box,bw,async()=>{const x=rowData(s,i);if(!x.att)throw Error('حضّر الطالب أولًا.');if(!['absent','excused'].includes(x.att))validateRow(s,x);const portal=await guardianLink(s.studentId),blocked=['absent','excused'].includes(x.att),line=(name,text,grade)=>blocked?`${name}: لم يُحتسب بسبب ${x.att==='absent'?'الغياب':'الاستئذان'}`:`${name}: ${text}${grade?' — التقدير: '+grade:''}`,reviewLines=x.reviews.map(r=>line(r.name,r.assignment,r.grade)).join('\n'),alert=x.att==='late'?'\nتنبيه: حضر الطالب متأخرًا، ونأمل الحرص على الحضور في الوقت المحدد.':x.att==='absent'?'\nالطالب غائب اليوم؛ نأمل إفادتنا بسبب الغياب.':x.att==='excused'?'\nالطالب مستأذن اليوم.':'';const text=`الحصيلة اليومية - سنابل الوحي\nالطالب: ${s.fullName}\nالتاريخ: ${date}\nالحضور: ${attendanceAr[x.att]||x.att}\n${line('الحفظ الجديد',x.lesson,x.ratings.memorization)}\n${line('المراجعة الصغرى',x.recent,x.ratings.recentReview)}${reviewLines?'\n'+reviewLines:''}${x.note?'\nملاحظة: '+x.note:''}${alert}\n\nبوابة ولي الأمر: ${portal}`;openWhatsApp(s.guardianPhone,text)});
    const bi=box.querySelector(`[data-action="img-${i}"]`);if(bi)action(box,bi,async()=>{const x=rowData(s,i);if(!x.att)throw Error('حضّر الطالب أولًا.');if(!['absent','excused'].includes(x.att))validateRow(s,x);const reviewText=x.reviews.length?x.reviews.map(r=>r.name+': '+r.assignment+(r.grade?' · '+r.grade:'')).join('؛ '):'—';await shareOutcomeImage(s.fullName,date,x.lesson,x.recent,reviewText,{memorization:x.ratings.memorization,recentReview:x.ratings.recentReview,review:''},x.att,x.note)});
    const pg=box.querySelector(`[data-action="portal-${i}"]`);if(pg)action(box,pg,()=>showGuardianLink(box,s.studentId,s.fullName))
  });
  submit(form,async()=>{validateAttendance();const payload=students.map((s,i)=>{const x=rowData(s,i);validateRow(s,x);return{studentId:s.studentId,ratings:x.ratings,notes:x.note,attendanceStatus:x.att,attendanceNote:x.note,recitationMetrics:x.metrics}});const r=await rpc('save_daily_outcomes_v2',{p_date:date,p_rows:payload});msg(root,`تم حفظ جلسة الحلقة لـ ${r.saved} طالبًا؛ وكل مراجعة كبرى عولجت بصورة مستقلة.`)})
 })
}

async function plansPage(root){
 const students=await rows('students','id,full_name,teacher_id,circle_id',{active:true});
 const typeName={memorization:'الحفظ الجديد',recent_review:'المراجعة الصغرى',review:'المراجعة الكبرى'};
 const unitName={lines:'سطر',pages:'صفحة',ayahs:'آية',surahs:'سورة',juz:'جزء',hizb:'حزب',half_hizb:'نصف حزب',quarter_hizb:'ربع حزب'};
 const directionName={toward_nas:'نحو الناس',toward_fatiha:'نحو الفاتحة'};
 const week=[['0','الأحد'],['1','الاثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة'],['6','السبت']];
 const memUnits=[{id:'lines',name:'أسطر'},{id:'pages',name:'صفحات'},{id:'ayahs',name:'آيات'}];
 const recentUnits=[{id:'pages',name:'صفحات'},{id:'ayahs',name:'آيات'},{id:'surahs',name:'سور'}];
 const majorUnits=[{id:'quarter_hizb',name:'ربع حزب'},{id:'half_hizb',name:'نصف حزب'},{id:'hizb',name:'حزب'},{id:'juz',name:'جزء'},{id:'surahs',name:'سور'},{id:'pages',name:'صفحات'},{id:'ayahs',name:'آيات'}];
 const dirs=[{id:'toward_nas',name:'نحو الناس'},{id:'toward_fatiha',name:'نحو الفاتحة'}];
 const qpcUnits=new Set(['juz','hizb','half_hizb','quarter_hizb']);
 const commonDays=selected=>`<fieldset><legend>أيام الإجازة الأسبوعية</legend><div class="sl-checks">${week.map(([id,n])=>`<label><input type="checkbox" name="wd${id}" ${selected.includes(id)?'checked':''}> ${n}</label>`).join('')}</div></fieldset>`;
 const unitOptions=(el,items,value)=>{el.innerHTML=items.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');el.value=items.some(x=>x.id===value)?value:items[0].id};

 root.innerHTML=`<section class="sl-session-head"><div><span class="sl-kicker">الخطة التعليمية</span><h2>بناء خطة الطالب</h2><p>الحفظ الجديد يحدد موضع تقدم الطالب، والمراجعة الصغرى تظل لصيقة بآخر موضع في الدرس، أما المراجعة الكبرى فتقبل السور والصفحات والآيات والأجزاء والأحزاب وأنصاف الأحزاب وأرباع الأحزاب.</p></div></section>
 <div class="sl-rule-note"><b>المراجعة الصغرى:</b> لا تختار لها سورة بداية ولا اتجاهًا؛ تبدأ من موضع نهاية درس اليوم وتتجه دائمًا نحو الناس بالمقدار المحدد، وتتحرك مع الدرس يومًا بيوم.</div>
 <div class="sl-rule-note"><b>المراجعة الكبرى:</b> يمكن ضبطها بالجزء أو الحزب أو نصف الحزب أو ربع الحزب، كما يمكن ضبطها بالسور أو الصفحات أو الآيات. وإذا انتهت المراجعة الصغرى داخل حزب أو بين حدَّين تحزيبيين، يضيف النظام المقدار الواقع بينها وبين أقرب تقسيم تلقائيًا؛ فلا يبقى محفوظ بلا مراجعة ولا يتكرر المقرر.</div>
 <div class="sl-toolbar">${button('خطة طالب متكاملة','bundle')}${button('إضافة مسار منفرد','new')}</div><div class="sl-data"></div>`;

 const planCard=(p,i)=>{
   const recent=p.type==='recent_review',qpc=p.type==='review'&&qpcUnits.has(p.unit);
   const facts=recent
    ?`<span><b>المقدار</b>${esc(p.daily_amount+' '+(unitName[p.unit]||p.unit))}</span><span><b>المنهج</b>نافذة متحركة تبدأ من نهاية الدرس وتتجه نحو الناس</span><span><b>الارتباط</b>تتبع خطة الحفظ تلقائيًا</span><span><b>المدة</b>${esc(p.start_date+' — '+p.end_date)}</span>`
    :`<span><b>المقدار</b>${esc(p.daily_amount+' '+(unitName[p.unit]||p.unit))}</span><span><b>الاتجاه</b>${esc(directionName[p.direction]||p.direction)}</span><span><b>البداية</b>${esc(qref(p.start_ref))}</span><span><b>المدة</b>${esc(p.start_date+' — '+p.end_date)}</span>${qpc?`<span><b>وحدة المراجعة</b>${esc(unitName[p.unit]||p.unit)}</span>`:''}${p.type==='review'?'<span><b>التكرار</b>دوري تلقائي</span>':''}`;
   return `<article class="sl-plan-card"><header><div><span class="sl-plan-type">${esc(typeName[p.type]||p.type)}</span><h3>${esc(p.name||typeName[p.type]||p.type)}</h3><small>${esc(students.find(s=>s.id===p.student_id)?.full_name||p.student_id)}</small></div><span class="sl-plan-status">نشطة</span></header><div class="sl-plan-facts">${facts}</div><div class="sl-card-actions">${button('الأيام والمقررات','days-'+i)}${button('تعديل الخطة','edit-'+i)}${button('حذف / إنهاء','remove-'+i)}</div></article>`;
 };

 const load=async()=>{
   const plans=await rows('plans','*',{status:'active'});plans.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
   root.querySelector('.sl-data').innerHTML=plans.length?`<div class="sl-plan-grid">${plans.map(planCard).join('')}</div>`:'<div class="sl-empty">لا توجد خطط بعد. ابدأ بخطة طالب متكاملة.</div>';
   plans.forEach((p,i)=>{
     action(root,root.querySelector(`[data-action="remove-${i}"]`),async()=>{
       const label=p.name||typeName[p.type]||'الخطة';
       if(!confirm('هل تريد حذف/إنهاء «'+label+'»؟ إذا كانت الخطة قد بدأ تنفيذها فسيُحفظ تاريخها وتُحذف الأيام المستقبلية فقط.'))return;
       const r=await rpc('remove_plan',{p_plan_id:p.id});await load();
       msg(root,r.mode==='deleted'?'تم حذف الخطة بالكامل ويمكن إنشاء خطة جديدة للطالب الآن.':'تم إنهاء الخطة مع حفظ الأيام والحصائل السابقة، ويمكن إنشاء خطة جديدة للطالب.');
     });

     action(root,root.querySelector(`[data-action="days-${i}"]`),async()=>{
       const b=modal('أيام الخطة - '+(p.name||typeName[p.type]||p.type));
       const render=async()=>{
         const days=await rows('plan_days','*',{plan_id:p.id});days.sort((a,b)=>a.date_key.localeCompare(b.date_key));
         const intro=p.type==='recent_review'
           ?'<p class="sl-help">هذه الأيام مشتقة تلقائيًا من نهاية درس الطالب. لا تُستثنى المراجعة الصغرى منفردة؛ عند غياب الطالب أو استثناء يوم الدرس يعيد النظام اشتقاقها من خطة الحفظ.</p>'
           :qpcUnits.has(p.unit)?'<p class="sl-help">المقادير هنا وحدات تحزيب كاملة من المصحف المدني وليست تقديرًا بعدد الصفحات.</p>':'<p>المقرر يعرض مقاطع كل سورة صراحةً.</p>';
         b.innerHTML=intro+table(['التاريخ','المقرر بالتفصيل','المطلوب','الدورة','المنجز','الحالة','إجراء'],days.map((d,j)=>[
           esc(d.date_key),esc(segmentsOnlyText(d.segments)||(qref(d.target_from)+' ← '+qref(d.target_to))),
           esc(Number(d.target_amount||0))+' '+esc(unitName[p.unit]||p.unit),esc(d.cycle_no||1),esc(d.completed_amount),esc(d.status),
           p.type==='recent_review'?'يتبع الدرس':d.rating?'تم الرصد':button('استثناء اليوم','x'+j)
         ]));
         if(p.type!=='recent_review')days.forEach((d,j)=>{const x=b.querySelector(`[data-action="x${j}"]`);if(x)action(b,x,async()=>{if(!confirm('استثناء '+d.date_key+' وإعادة جدولة الأيام التالية؟'))return;const r=await rpc('exclude_plan_date',{p_plan_id:p.id,p_date:d.date_key});msg(b,`تم الاستثناء ونقل ${r.movedDays} يومًا.`);await render();await load()})});
       };await render()
     });

     action(root,root.querySelector(`[data-action="edit-${i}"]`),async()=>{
       const b=modal('تعديل '+(p.name||typeName[p.type]||p.type)),excluded=(p.excluded_weekdays||[]).map(Number),sr=p.start_ref||{};
       if(p.type==='recent_review'){
         b.innerHTML=`<form><p class="sl-help"><b>المراجعة الصغرى لا تملك بداية مستقلة.</b> عدّل مقدار النافذة فقط؛ ستظل نهايتها مساوية لنهاية درس الطالب في كل يوم.</p><div class="form-grid two">${select('الوحدة','unit',recentUnits,p.unit)}${field('المقدار','amount','number',p.daily_amount,'min="1" max="45" required')}${field('بداية الإعداد','start','date',p.start_date,'required')}${field('نهاية الإعداد','end','date',p.end_date,'required')}</div>${commonDays(excluded.map(String))}<button type="submit" class="button button-primary">حفظ المراجعة الصغرى</button></form>`;
         const form=b.querySelector('form');submit(form,async()=>{if(val(form,'end')<val(form,'start'))throw Error('تحقق من تاريخ البداية والنهاية.');const ex=week.filter(([id])=>form.querySelector(`[name="wd${id}"]`).checked).map(([id])=>Number(id));await rpc('save_recent_review_plan',{p_plan_id:p.id,p_student_id:p.student_id,p_teacher_id:p.teacher_id,p_unit:val(form,'unit'),p_daily_amount:Number(val(form,'amount')),p_start_date:val(form,'start'),p_end_date:val(form,'end'),p_excluded_weekdays:ex,p_status:'active'});await rpc('sync_student_review_plans',{p_student_id:p.student_id});b.closest('dialog').close();await load();msg(root,'تم تحديث المراجعة الصغرى وربطها بنهاية درس الطالب يومًا بيوم.')});
         return;
       }

       const units=p.type==='review'?majorUnits:memUnits;
       b.innerHTML=`<form>${p.type==='review'?field('اسم المراجعة','planName','text',p.name||''):''}<div class="form-grid two">${select('الوحدة','unit',units,p.unit)}${field('المقدار اليومي','amount','number',p.daily_amount,'min="1" max="45" required')}${select('الاتجاه','direction',dirs,p.direction)}${select('سورة البداية','surah',[])}${select('آية البداية','ayah',[])}${field('بداية الخطة','start','date',p.start_date,'required')}${field('نهاية الخطة','end','date',p.end_date,'required')}</div>${commonDays(excluded.map(String))}<p class="sl-help">إذا سبق تنفيذ الخطة فلن يسمح النظام بإعادة توليد تاريخها؛ أنهِها وأنشئ خطة جديدة عند الحاجة إلى تغيير جوهري.</p><button type="submit" class="button button-primary">حفظ وإعادة التوزيع</button></form>`;
       const form=b.querySelector('form');await quranPair(form,'surah','ayah',{surah:sr.surahNo||sr.surah_no,ayah:sr.ayahNo||sr.ayah});
       submit(form,async()=>{if(val(form,'end')<val(form,'start'))throw Error('تحقق من تاريخ البداية والنهاية.');const ex=week.filter(([id])=>form.querySelector(`[name="wd${id}"]`).checked).map(([id])=>Number(id));const r=await rpc('save_plan_with_days',{p_plan_id:p.id,p_student_id:p.student_id,p_teacher_id:p.teacher_id,p_program_id:p.program_id||null,p_type:p.type,p_unit:val(form,'unit'),p_daily_amount:Number(val(form,'amount')),p_direction:val(form,'direction'),p_start_surah:Number(val(form,'surah')),p_start_ayah:Number(val(form,'ayah')),p_start_date:val(form,'start'),p_end_date:val(form,'end'),p_excluded_weekdays:ex,p_status:'active',p_replace_existing:true});await rpc('sync_student_review_plans',{p_student_id:p.student_id});if(p.type==='review'&&val(form,'planName').trim())await result(sb().from('plans').update({name:val(form,'planName').trim()}).eq('id',p.id).select('id').single());b.closest('dialog').close();await load();msg(root,`تم تحديث الخطة وتوليد ${r.generatedDays} يومًا.`)});
     });
   });
 };

 const createSingle=async()=>{
   const b=modal('إضافة مسار تعليمي');
   b.innerHTML=`<form><div class="form-grid two">${select('الطالب','student',students.map(s=>({id:s.id,name:s.full_name})))}${select('المسار','type',[{id:'memorization',name:'الحفظ الجديد'},{id:'recent_review',name:'المراجعة الصغرى'},{id:'review',name:'المراجعة الكبرى'}],'memorization')}${field('اسم الخطة (للمراجعة الكبرى)','planName','text','')}${select('المقدار بوحدة','unit',memUnits,'lines')}${field('المقدار اليومي','amount','number','5','min="1" max="45" required')}<div data-independent>${select('الاتجاه','direction',dirs,'toward_nas')}</div><div data-independent>${select('سورة البداية','surah',[])}</div><div data-independent>${select('آية البداية','ayah',[])}</div>${field('البداية','start','date',today(),'required')}${field('النهاية','end','date','','required')}</div>${commonDays(['5','6'])}<p class="sl-help" data-track-help></p><button type="submit" class="button button-primary">إنشاء المسار</button></form>`;
   const form=b.querySelector('form'),typeEl=form.querySelector('[name="type"]'),unitEl=form.querySelector('[name="unit"]'),nameEl=form.querySelector('[name="planName"]'),help=form.querySelector('[data-track-help]');
   await quranFields(form);
   const refresh=()=>{const t=typeEl.value,recent=t==='recent_review';unitOptions(unitEl,t==='memorization'?memUnits:t==='review'?majorUnits:recentUnits,t==='memorization'?'lines':t==='review'?'hizb':'pages');form.querySelectorAll('[data-independent]').forEach(x=>x.style.display=recent?'none':'');nameEl.closest('label').style.display=t==='review'?'':'none';help.innerHTML=recent?'<b>نافذة لصيقة بالدرس:</b> لا تختار البداية أو الاتجاه؛ تبدأ المراجعة من نهاية درس ذلك اليوم وتتجه دائمًا نحو الناس.':t==='review'?'<b>المراجعة الكبرى:</b> اختر الوحدة المناسبة: جزء، حزب، نصف حزب، ربع حزب، أو غيرها من الوحدات المتاحة.':'حدد بداية الدرس واتجاه الانتقال بين السور.'};typeEl.onchange=refresh;refresh();
   submit(form,async()=>{const student=students.find(s=>s.id===val(form,'student'));if(!student?.teacher_id)throw Error('اختر طالبًا مسندًا إلى معلم.');if(val(form,'end')<val(form,'start'))throw Error('تحقق من تاريخ البداية والنهاية.');const excluded=week.filter(([id])=>form.querySelector(`[name="wd${id}"]`).checked).map(([id])=>Number(id)),t=val(form,'type'),track={id:crypto.randomUUID(),type:t,unit:val(form,'unit'),dailyAmount:Number(val(form,'amount'))};if(t!=='recent_review'){track.direction=val(form,'direction');track.startSurah=Number(val(form,'surah'));track.startAyah=Number(val(form,'ayah'));if(t==='review')track.name=val(form,'planName').trim()}await rpc('save_plan_bundle',{p_student_id:student.id,p_teacher_id:student.teacher_id,p_start_date:val(form,'start'),p_end_date:val(form,'end'),p_excluded_weekdays:excluded,p_tracks:[track]});await rpc('sync_student_review_plans',{p_student_id:student.id});b.closest('dialog').close();await load();msg(root,t==='recent_review'?'تم إنشاء المراجعة الصغرى كنافذة متحركة ملاصقة للدرس.':'تم إنشاء المسار وتوزيعه.')});
 };

 const createBundle=async()=>{
   const b=modal('خطة طالب متكاملة');
   const memBuilder=`<fieldset class="sl-plan-builder"><legend><label><input type="checkbox" name="usemem" checked> الحفظ الجديد</label></legend><div class="form-grid two">${select('الوحدة','memUnit',memUnits,'lines')}${field('المقدار اليومي','memAmount','number',5,'min="1" max="45" required')}${select('الاتجاه','memDirection',dirs,'toward_nas')}${select('سورة البداية','memSurah',[])}${select('آية البداية','memAyah',[])}</div></fieldset>`;
   const recentBuilder=`<fieldset class="sl-plan-builder"><legend><label><input type="checkbox" name="userecent" checked> المراجعة الصغرى</label></legend><div class="form-grid two">${select('المقدار بوحدة','recentUnit',recentUnits,'pages')}${field('المقدار','recentAmount','number',2,'min="1" max="45" required')}</div><p class="sl-help"><b>لا بداية ولا اتجاه للمراجعة الصغرى.</b> إذا انتهى درس اليوم في الصفحة 4 وكان المقدار صفحتين، فتبدأ المراجعة من موضع نهاية الدرس في الصفحة 4 وتمتد نحو الناس حتى نهاية الصفحة 5؛ وعندما يتحرك الدرس تتحرك النافذة معه.</p></fieldset>`;
   b.innerHTML=`<form><div class="form-grid two">${select('الطالب','student',students.map(s=>({id:s.id,name:s.full_name})))}${field('بداية الخطة','start','date',today(),'required')}${field('نهاية الخطة','end','date','','required')}</div>${commonDays(['5','6'])}<div class="sl-plan-builders">${memBuilder}${recentBuilder}<section><div class="sl-builder-head"><div><h3>المراجعات الكبرى</h3><p>يمكن إضافة عدة مراجعات؛ وتدعم الجزء والحزب ونصف الحزب وربع الحزب وفق تحزيب مصحف المدينة – مجمع الملك فهد.</p></div>${button('إضافة مراجعة كبرى','add-review')}</div><div class="sl-review-builders"></div></section></div><button type="submit" class="button button-primary button-wide">إنشاء المسارات المختارة</button></form>`;
   const form=b.querySelector('form'),container=form.querySelector('.sl-review-builders');let reviewIndex=0;
   const addReview=async(defaults={})=>{if(container.children.length>=8)throw Error('الحد الأعلى ثماني مراجعات كبرى متزامنة.');const i=reviewIndex++,box=document.createElement('fieldset');box.className='sl-plan-builder sl-review-builder';box.dataset.idx=String(i);box.innerHTML=`<legend>مراجعة كبرى ${container.children.length+1}</legend><div class="form-grid two">${field('اسم المراجعة','review'+i+'Name','text',defaults.name||'')}${select('الوحدة','review'+i+'Unit',majorUnits,defaults.unit||'hizb')}${field('المقدار اليومي','review'+i+'Amount','number',defaults.amount||1,'min="1" max="45" required')}${select('الاتجاه','review'+i+'Direction',dirs,defaults.direction||'toward_fatiha')}${select('سورة البداية','review'+i+'Surah',[])}${select('آية البداية','review'+i+'Ayah',[])}</div><small class="sl-cycle-note">تحزيب مصحف المدينة للوحدات: جزء / حزب / نصف حزب / ربع حزب</small><button type="button" class="button button-soft" data-remove-review>حذف هذه المراجعة</button>`;container.append(box);await quranPair(box,'review'+i+'Surah','review'+i+'Ayah',defaults);box.querySelector('[data-remove-review]').onclick=()=>box.remove()};
   await quranPair(form,'memSurah','memAyah');await addReview({name:'مراجعة كبرى 1',unit:'hizb',amount:1,direction:'toward_fatiha',surah:114,ayah:1});
   action(b,b.querySelector('[data-action="add-review"]'),()=>addReview({name:'مراجعة كبرى '+(container.children.length+1),unit:'hizb',amount:1,direction:'toward_nas',surah:1,ayah:1}));
   submit(form,async()=>{const student=students.find(s=>s.id===val(form,'student'));if(!student?.teacher_id)throw Error('اختر طالبًا مسندًا إلى معلم.');if(val(form,'end')<val(form,'start'))throw Error('تحقق من تاريخ البداية والنهاية.');const excluded=week.filter(([id])=>form.querySelector(`[name="wd${id}"]`).checked).map(([id])=>Number(id)),tracks=[];if(form.querySelector('[name="usemem"]').checked)tracks.push({id:crypto.randomUUID(),type:'memorization',unit:val(form,'memUnit'),dailyAmount:Number(val(form,'memAmount')),direction:val(form,'memDirection'),startSurah:Number(val(form,'memSurah')),startAyah:Number(val(form,'memAyah'))});if(form.querySelector('[name="userecent"]').checked)tracks.push({id:crypto.randomUUID(),type:'recent_review',unit:val(form,'recentUnit'),dailyAmount:Number(val(form,'recentAmount'))});for(const box of container.querySelectorAll('.sl-review-builder')){const i=box.dataset.idx;tracks.push({id:crypto.randomUUID(),type:'review',name:val(box,'review'+i+'Name').trim(),unit:val(box,'review'+i+'Unit'),dailyAmount:Number(val(box,'review'+i+'Amount')),direction:val(box,'review'+i+'Direction'),startSurah:Number(val(box,'review'+i+'Surah')),startAyah:Number(val(box,'review'+i+'Ayah'))})}if(!tracks.length)throw Error('اختر مسارًا واحدًا على الأقل.');const r=await rpc('save_plan_bundle',{p_student_id:student.id,p_teacher_id:student.teacher_id,p_start_date:val(form,'start'),p_end_date:val(form,'end'),p_excluded_weekdays:excluded,p_tracks:tracks});await rpc('sync_student_review_plans',{p_student_id:student.id});b.closest('dialog').close();await load();msg(root,r.pairedMajorReviews?'تم إنشاء الخطط وربط المراجعة الصغرى بالدرس، وتقسيم المراجعتين الكبريين المتعاكستين دون تداخل.':'تم إنشاء الخطط، والمراجعة الصغرى ستتحرك تلقائيًا مع الدرس.')});
 };
 action(root,root.querySelector('[data-action="new"]'),createSingle);
 action(root,root.querySelector('[data-action="bundle"]'),createBundle);
 await load()
}

async function attendancePage(root){
 const a=await access(),l=await lookups(),manager=a.roles.some(r=>['admin','manager','supervisor'].includes(r)),teacher=a.roles.includes('teacher');
 root.innerHTML=`<div class="sl-toolbar">${select('الحلقة','circle',l.circles)}${field('التاريخ','date','date',today())}${teacher?button('تسجيل حضوري','in')+button('تسجيل انصرافي','out'):''}${manager?button('إعدادات بصمة الحلقة','fingerprint-settings')+button('اعتماد الغائبين','mark-absent'):''}${button('تحديث','load')}</div><div class="sl-window"></div><div class="sl-data"></div>`;
 const selected=()=>l.circles.find(c=>c.id===val(root,'circle'));
 const getWindow=async c=>{if(!c?.mosque_id)return null;const {data,error}=await sb().functions.invoke('sanabil-attendance',{body:{action:'window',mosqueId:c.mosque_id,circleId:c.id}});if(error)throw Error(error.message);if(data?.error)throw Error(data.error);return data.window};
 const minuteNow=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date),get=t=>p.find(x=>x.type===t)?.value||'0';return Number(get('hour'))*60+Number(get('minute'))};
 const tmin=x=>{const [h,m]=String(x||'00:00').split(':').map(Number);return h*60+m};
 let lastWindow=null,lastAttendance=[];
 const load=async()=>{
  const c=selected(),date=val(root,'date');if(!c||!date){root.querySelector('.sl-data').innerHTML='<p>اختر الحلقة والتاريخ.</p>';return}
  const [att,win]=await Promise.all([rows('attendance','*',{circle_id:c.id,date_key:date}),getWindow(c)]);lastWindow=win;lastAttendance=att;
  root.querySelector('.sl-window').innerHTML=win?`<div class="sl-window-grid"><article><small>أوقات الصلاة المعتمدة</small><b>العصر ${esc(win.prayerStart||win.start)} · المغرب ${esc(win.prayerEnd||win.end)}</b><span>تُحسب يوميًا من إحداثيات المسجد المعتمدة.</span></article><article><small>تسجيل الحضور</small><b>${esc(win.checkInOpen||win.start)} – ${esc(win.checkInClose||win.end)}</b><span>الحضور المبكر ${esc(win.earlyArrivalMinutes)} د · نهاية سماح التأخير ${esc(win.lateUntil||'—')} · الغياب ${esc(win.absenceAt||'—')}</span></article><article><small>تسجيل الانصراف</small><b>${esc(win.checkOutOpen||'—')} – ${esc(win.checkOutClose||'—')}</b><span>يسمح بالانصراف قبل المغرب بـ ${esc(win.earlyLeaveMinutes)} د · مهلة الإغلاق ${esc(win.checkoutGraceMinutes)} د · النطاق ${esc(win.radiusMeters)}م</span></article></div>`:'';
  const teachers=l.teachers.filter(t=>t.circle_id===c.id),day=new Date(date+'T12:00:00+03:00').getDay(),working=win?.weekdays?.map(Number).includes(day);
  const autoAbsent=working&&(date<today()||(date===today()&&minuteNow()>tmin(win.absenceAt||win.checkInClose||win.start)));
  root.querySelector('.sl-data').innerHTML=table(['المعلم','الحضور','الانصراف','الحالة','ملاحظة','إجراء'],teachers.map((t,i)=>{
    const r=att.find(x=>x.teacher_id===t.id),bits=[];
    if(r?.status==='excused')bits.push('مستأذن');else if(r?.status==='absent')bits.push('غائب');
    else if(r?.check_in_at){bits.push('حاضر');if(Number(r.late_minutes)>0)bits.push('متأخر '+r.late_minutes+' د');if(Number(r.early_arrival_minutes)>0)bits.push('مبكر '+r.early_arrival_minutes+' د');if(Number(r.early_leave_minutes)>0)bits.push('انصرف مبكرًا '+r.early_leave_minutes+' د')}
    else bits.push(autoAbsent?'غائب - غير معتمد':'لم يسجل');
    const noteworthy=r?.status==='excused'||r?.status==='absent'||Number(r?.late_minutes)>0||autoAbsent;
    return[esc(t.full_name),esc(dateText(r?.check_in_at)),esc(dateText(r?.check_out_at)),esc(bits.join(' · ')),esc(r?.excuse_note||'—'),(manager&&!r?.check_in_at?button('مستأذن','exc-'+i)+button('غائب','abs-'+i):'')+(manager&&noteworthy&&t.phone?button('مراسلة','msg-'+i):'')];
  }));
  if(manager)teachers.forEach((t,i)=>{
   const r=att.find(x=>x.teacher_id===t.id);
   for(const [kind,status] of [['exc','excused'],['abs','absent']]){const btn=root.querySelector(`[data-action="${kind}-${i}"]`);if(btn)action(root,btn,async()=>{const note=prompt(status==='excused'?'سبب الاستئذان:':'سبب الغياب أو الملاحظة:','')||'';await rpc('set_teacher_attendance_override',{p_teacher_id:t.id,p_date:date,p_status:status,p_note:note});await load()})}
   const mb=root.querySelector(`[data-action="msg-${i}"]`);if(mb)action(root,mb,async()=>{const state=r?.status==='excused'?'الاستئذان':r?.status==='absent'?'الغياب':Number(r?.late_minutes)>0?'التأخر في الحضور':'عدم تسجيل الحضور';const txt=`السلام عليكم ورحمة الله وبركاته، نود الاستفسار عن ${state} بتاريخ ${date}. شاكرين تعاونكم. — سنابل الوحي`;openWhatsApp(t.phone,txt)})
  })
 };
 for(const kind of ['in','out']){const btn=root.querySelector(`[data-action="${kind}"]`);if(btn)action(root,btn,async()=>{const c=selected();if(!c?.mosque_id)throw Error('اختر حلقة مرتبطة بمسجد');if(val(root,'date')!==today())throw Error('البصمة الجغرافية متاحة لليوم الحالي فقط');const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,e=>reject(Error(e.code===1?'اسمح بالوصول للموقع لتسجيل البصمة.':'تعذر تحديد الموقع؛ أعد المحاولة.')),{enableHighAccuracy:true,timeout:20000,maximumAge:0}));const {data,error}=await sb().functions.invoke('sanabil-attendance',{body:{action:kind==='in'?'checkIn':'checkOut',mosqueId:c.mosque_id,circleId:c.id,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}});if(error){let t=error.message;try{const j=await error.context?.json?.();t=j?.error||j?.message||t}catch{}throw Error(t==='Edge Function returned a non-2xx status code'?'تعذر تنفيذ الطلب؛ تحقق من الوقت والموقع ثم أعد المحاولة.':t)}if(data?.error)throw Error(data.error);await load();const extra=kind==='in'&&data.lateMinutes>0?' (متأخر '+data.lateMinutes+' دقيقة)':kind==='in'&&data.earlyArrivalMinutes>0?' (حضور مبكر '+data.earlyArrivalMinutes+' دقيقة)':'';msg(root,(kind==='in'?'تم تسجيل الحضور':'تم تسجيل الانصراف')+extra)})}
 if(manager){
  action(root,root.querySelector('[data-action="mark-absent"]'),async()=>{const c=selected(),date=val(root,'date');if(!c)throw Error('اختر الحلقة');if(!lastWindow)await load();const day=new Date(date+'T12:00:00+03:00').getDay(),working=lastWindow?.weekdays?.map(Number).includes(day);if(!working)throw Error('هذا اليوم مستبعد من أيام الدوام.');const due=date<today()||(date===today()&&minuteNow()>tmin(lastWindow.start)+Number(lastWindow.absenceAfterMinutes||60));if(!due)throw Error('لم يحن وقت اعتماد الغياب بعد.');const teachers=l.teachers.filter(t=>t.circle_id===c.id),missing=teachers.filter(t=>!lastAttendance.some(r=>r.teacher_id===t.id));if(!missing.length)throw Error('لا يوجد معلمون بلا سجل حضور.');if(!confirm('اعتماد '+missing.length+' معلم/معلمين غائبين؟'))return;for(const t of missing)await rpc('set_teacher_attendance_override',{p_teacher_id:t.id,p_date:date,p_status:'absent',p_note:'غياب لعدم تسجيل الحضور بعد الوقت المحدد'});await load();msg(root,'تم اعتماد حالات الغياب.')});
  action(root,root.querySelector('[data-action="fingerprint-settings"]'),async()=>{const c=selected();if(!c?.mosque_id)throw Error('اختر حلقة مرتبطة بمسجد');const m=await result(sb().from('mosques').select('*').eq('id',c.mosque_id).single()),cfg=Array.isArray(m.attendance_windows)?m.attendance_windows[0]||{}:{},d=modal('إعدادات بصمة '+m.name),prayers=[{id:'Fajr',name:'الفجر'},{id:'Dhuhr',name:'الظهر'},{id:'Asr',name:'العصر'},{id:'Maghrib',name:'المغرب'},{id:'Isha',name:'العشاء'}];d.innerHTML=`<form><div class="form-grid two">${field('خط العرض','latitude','number',m.latitude,'step="any" required')}${field('خط الطول','longitude','number',m.longitude,'step="any" required')}${field('النطاق بالمتر','radius','number',m.radius_meters||100,'min="20" max="500"')}${select('البداية','startPrayer',prayers,cfg.startPrayer||'Asr')}${select('النهاية','endPrayer',prayers,cfg.endPrayer||'Maghrib')}${field('سماح التأخير','late','number',cfg.lateAllowMinutes??15,'min="0" max="180"')}${field('الحضور المبكر','early','number',cfg.earlyArrivalMinutes??15,'min="0" max="180"')}${field('الانصراف المبكر','leave','number',cfg.earlyLeaveMinutes??15,'min="0" max="180"')}${field('اعتبار الغياب بعد','absent','number',cfg.absenceAfterMinutes??60,'min="0" max="360"')}</div>${weekdayChecks('work',cfg.weekdays||['0','1','2','3','4'])}<button type="button" class="button button-soft" data-action="gps">استخدام موقعي</button><button type="submit" class="button button-primary">حفظ</button></form>`;const form=d.querySelector('form');action(d,d.querySelector('[data-action="gps"]'),async()=>{const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000}));form.elements.latitude.value=p.coords.latitude;form.elements.longitude.value=p.coords.longitude});submit(form,async()=>{const workdays=selectedWeekdays(form,'work');if(!workdays.length)throw Error('اختر يوم دوام واحدًا على الأقل');const config={...cfg,action:'both',weekdays:workdays,start:'00:00',end:'23:59',startPrayer:val(form,'startPrayer'),endPrayer:val(form,'endPrayer'),lateAllowMinutes:Number(val(form,'late')),earlyArrivalMinutes:Number(val(form,'early')),earlyLeaveMinutes:Number(val(form,'leave')),absenceAfterMinutes:Number(val(form,'absent')),checkoutGraceMinutes:Number(cfg.checkoutGraceMinutes??120)};await result(sb().from('mosques').update({latitude:Number(val(form,'latitude')),longitude:Number(val(form,'longitude')),radius_meters:Number(val(form,'radius')),attendance_windows:[config],updated_at:new Date().toISOString()}).eq('id',m.id).select('id').single());d.closest('dialog').close();await load();msg(root,'تم حفظ إعدادات البصمة لهذا المجمع.')})})
 }
 action(root,root.querySelector('[data-action="load"]'),load);await load()
}

async function requestPanel(root,options={}){
 const a=await access(),canSchedule=options.canSchedule??a.roles.some(r=>['admin','manager','supervisor'].includes(r));
 const students=await rows('students','id,full_name,org_id,complex_id,circle_id,teacher_id,teacher_name',{active:true});
 const examiners=options.examiners??(canSchedule?await rows('examiners','id,full_name,complex_id',{active:true}):[]);
 root.innerHTML=`<form><div class="form-grid two">${select('الطالب','student',students.map(x=>({id:x.id,name:x.full_name})))}${select('النوع','type',[{id:'custom',name:'مخصص'},{id:'full',name:'كامل القرآن'}],'custom')}${field('المقرر المطلوب','syllabus','text','','required')}${field('عدد الأسئلة','count','number',3,'min="2" max="15" required')}${field('أسطر السؤال','lines','number',10,'min="5" max="15" required')}</div><button type="submit" class="button button-primary">إرسال طلب الاختبار</button></form><div class="sl-requests"></div>`;
 const scheduleRequest=async req=>{
  const s=students.find(x=>x.id===req.student_id);if(!s)throw Error('بيانات الطالب غير متاحة.');
  const m=modal('جدولة طلب اختبار - '+s.full_name);
  m.innerHTML=`<form><p><b>المقرر:</b> ${esc(req.syllabus?.label||req.type)} · <b>الأسئلة:</b> ${esc(req.question_count)}</p><div class="form-grid two">${select('المختبر (اختياري إذا سيجريه المشرف)','examiner',examiners.map(x=>({id:x.id,name:x.full_name})))}${field('الموعد بتوقيت السعودية','when','datetime-local','','required')}</div><button type="submit" class="button button-primary">اعتماد الموعد</button></form>`;
  const form=m.querySelector('form');
  submit(form,async()=>{
   const ex=examiners.find(x=>x.id===val(form,'examiner'));if(ex&&ex.complex_id!==s.complex_id)throw Error('المختبر لا يتبع مجمع الطالب.');
   const scheduleId=crypto.randomUUID();
   await result(sb().from('exam_schedules').insert({
    id:scheduleId,request_id:req.id,student_id:s.id,student_name:s.full_name,
    teacher_id:s.teacher_id,teacher_name:s.teacher_name,org_id:s.org_id,complex_id:s.complex_id,circle_id:s.circle_id,
    assigned_examiner_id:ex?.id||null,type:req.type,syllabus_label:req.syllabus?.label||req.type,
    syllabus:{...(req.syllabus||{}),questionCount:req.question_count,linesPerQuestion:req.lines_per_question},
    scheduled_at:new Date(val(form,'when')+':00+03:00').toISOString(),status:'scheduled'
   }).select('id').single());
   await result(sb().from('exam_requests').update({status:'scheduled',updated_at:new Date().toISOString()}).eq('id',req.id).select('id').single());
   m.closest('dialog').close();await refresh();await options.onScheduled?.();msg(root,'تمت جدولة الطلب وربطه بالموعد.');
  })
 };
 const refresh=async()=>{
  const list=await rows('exam_requests');list.sort((x,y)=>String(y.requested_at).localeCompare(String(x.requested_at)));
  root.querySelector('.sl-requests').innerHTML=table(['الطالب','المقرر','الأسئلة','تاريخ الطلب','الحالة','إجراء'],list.map((r,i)=>[
   esc(students.find(s=>s.id===r.student_id)?.full_name||r.student_id),esc(r.syllabus?.label||r.type),esc(r.question_count),
   esc(dateText(r.requested_at)),esc({pending:'قيد المراجعة',approved:'مقبول',scheduled:'مجدول',rejected:'مرفوض',cancelled:'ملغي'}[r.status]||r.status),
   canSchedule&&['pending','approved'].includes(r.status)?button('جدولة','schedule-'+i):'—'
  ]));
  if(canSchedule)list.forEach((r,i)=>{const btn=root.querySelector(`[data-action="schedule-${i}"]`);if(btn)action(root,btn,()=>scheduleRequest(r))})
 };
 const form=root.querySelector('form');
 submit(form,async()=>{
  const s=students.find(s=>s.id===val(form,'student'));if(!s)throw Error('اختر الطالب');if(!s.teacher_id)throw Error('الطالب غير مسند إلى معلم.');
  await result(sb().from('exam_requests').insert({
   id:crypto.randomUUID(),org_id:s.org_id,complex_id:s.complex_id,circle_id:s.circle_id,teacher_id:s.teacher_id,student_id:s.id,
   type:val(form,'type'),syllabus:{label:val(form,'syllabus')},question_count:Number(val(form,'count')),lines_per_question:Number(val(form,'lines')),status:'pending'
  }).select('id').single());
  form.reset();await refresh();msg(root,'تم تسجيل طلب الاختبار وسيظهر للمشرف مباشرة.');
 });
 await refresh()
}
async function testsPage(root){
 const a=await access(),manage=a.roles.some(r=>['admin','manager','supervisor','examiner'].includes(r)),canSchedule=a.roles.some(r=>['admin','manager','supervisor'].includes(r)),l=await lookups();
 const [students,examiners]=await Promise.all([
  rows('students','id,full_name,teacher_id,teacher_name,circle_id,complex_id,org_id,guardian_phone',{active:true}),
  manage?rows('examiners','id,full_name,complex_id',{active:true}):Promise.resolve([])
 ]);
 root.innerHTML=`<div class="sl-toolbar">${button('طلبات الاختبار','requests')}${canSchedule?button('جدولة مباشرة','new'):''}${select('الحلقة','filterCircle',l.circles,'','جميع الحلقات')}${select('المعلم','filterTeacher',l.teachers.map(t=>({id:t.id,name:t.full_name})),'','جميع المعلمين')}${select('الطالب','filterStudent',students.map(s=>({id:s.id,name:s.full_name})),'','جميع الطلاب')}${field('من','from','date',today().slice(0,7)+'-01')}${field('إلى','to','date',today())}${button('تحديث','reload')}${button('Excel النتائج','excel-results')}${button('تقرير مطبوع / PDF','print-results')}</div><div class="sl-data"></div>`;
 action(root,root.querySelector('[data-action="requests"]'),async()=>{const m=modal('طلبات الاختبار');await requestPanel(m,{canSchedule,examiners,onScheduled:load})});
 const filteredTests=async()=>{
  const from=val(root,'from'),to=val(root,'to'),circle=val(root,'filterCircle');if(!from||!to||from>to)throw Error('تحقق من فترة التقرير');
  let q=sb().from('tests').select('*').gte('performed_at',from+'T00:00:00+03:00').lte('performed_at',to+'T23:59:59.999+03:00').order('performed_at',{ascending:false}).limit(5000);if(circle)q=q.eq('circle_id',circle);const teacher=val(root,'filterTeacher'),student=val(root,'filterStudent');if(teacher)q=q.eq('teacher_id',teacher);if(student)q=q.eq('student_id',student);return result(q)
 };
 const testQuestions=async tests=>{const ids=tests.map(x=>x.id);if(!ids.length)return[];let all=[];for(let i=0;i<ids.length;i+=150){const p=await result(sb().from('exam_questions').select('*').in('test_id',ids.slice(i,i+150)).order('test_id').order('question_no'));all.push(...p)}return all};
 const load=async()=>{
  const from=val(root,'from'),to=val(root,'to'),circle=val(root,'filterCircle'),teacher=val(root,'filterTeacher'),student=val(root,'filterStudent');let q=sb().from('exam_schedules').select('*').gte('scheduled_at',from+'T00:00:00+03:00').lte('scheduled_at',to+'T23:59:59.999+03:00').order('scheduled_at',{ascending:false}).limit(2000);if(circle)q=q.eq('circle_id',circle);if(teacher)q=q.eq('teacher_id',teacher);if(student)q=q.eq('student_id',student);const data=await result(q);
  root.querySelector('.sl-data').innerHTML=table(['الطالب','الموعد','المقرر','الحالة','النتيجة','إجراء'],data.map((d,i)=>[
   esc(d.student_name),esc(dateText(d.scheduled_at)),esc(d.syllabus_label),
   esc({scheduled:'مجدول',confirmed:'مؤكد',in_progress:'جارٍ',completed:'مكتمل',postponed:'مؤجل',no_show:'لم يحضر',cancelled:'ملغي'}[d.status]||d.status),
   esc(d.scores?.total??'—'),
   (manage&&['scheduled','confirmed','in_progress'].includes(d.status)?button('فتح الاختبار','t'+i):'')+(d.status==='completed'&&d.scores?button('مشاركة','share-'+i)+button('تقرير','report-'+i):'—')
  ]));
  data.forEach((d,i)=>{
   const open=root.querySelector(`[data-action="t${i}"]`);if(open)action(root,open,async()=>{await rpc('start_exam',{p_schedule_id:d.id});await exam(d);await load()});
   const share=root.querySelector(`[data-action="share-${i}"]`);if(share)action(root,share,async()=>{const s=students.find(x=>x.id===d.student_id),portal=s?await guardianLink(s.id):'';const txt=`نتيجة اختبار القرآن — سنابل الوحي\nالطالب: ${d.student_name}\nالمقرر: ${d.syllabus_label||''}\nالحفظ: ${d.scores?.memorization??'—'} / 80\nالتجويد: ${d.scores?.tajweed??'—'} / 20\nالمجموع: ${d.scores?.total??'—'} / 100${portal?'\n\nبوابة ولي الأمر: '+portal:''}`;openWhatsApp(s?.guardian_phone,txt)});
   const rp=root.querySelector(`[data-action="report-${i}"]`);if(rp)action(root,rp,async()=>{const t=await result(sb().from('tests').select('*').eq('schedule_id',d.id).single());excelApi().printTests([t],'نتيجة اختبار الطالب')})
  })
 };
 const exam=async d=>{
  const m=modal('رصد الاختبار: '+d.student_name),request=d.request_id?await result(sb().from('exam_requests').select('question_count').eq('id',d.request_id).single()):null,count=Number(request?.question_count||d.syllabus?.questionCount||3);
  m.innerHTML=`<form><p>خصم الخطأ: درجتان، الشك: درجة، التجويد: ربع درجة لكل سؤال. تُحسب النتيجة النهائية في الخادم.</p><div class="sl-questions"></div>${field('ملحوظات','notes')}<button type="submit" class="button button-primary">حفظ النتيجة النهائية</button></form>`;
  const form=m.querySelector('form'),boxes=[];for(let i=0;i<count;i++){const q=document.createElement('fieldset');q.innerHTML=`<legend>السؤال ${i+1}</legend><div class="form-grid three">${select('السورة','surah',[])}${select('الآية','ayah',[])}${field('الأخطاء','errors','number',0,'min="0" max="100" required')}${field('الشكوك','doubts','number',0,'min="0" max="100" required')}${field('أخطاء التجويد','tajweed','number',0,'min="0" max="100" required')}</div>`;form.querySelector('.sl-questions').append(q);boxes.push(q);await quranFields(q)}
  submit(form,async()=>{const r=await rpc('complete_exam',{p_schedule_id:d.id,p_answers:boxes.map(q=>({surahNo:Number(val(q,'surah')),ayahNo:Number(val(q,'ayah')),errors:Number(val(q,'errors')),doubts:Number(val(q,'doubts')),tajweed:Number(val(q,'tajweed'))})),p_notes:val(form,'notes')});m.innerHTML=`<h3>حُفظت النتيجة</h3><p>الحفظ: ${esc(r.scores.memorization)} / 80 — التجويد: ${esc(r.scores.tajweed)} / 20 — المجموع: ${esc(r.scores.total)} / 100</p><p>رمز الاستعلام: ${esc(r.publicCode||'—')}</p>`;await load()})
 };
 if(canSchedule)action(root,root.querySelector('[data-action="new"]'),()=>{const m=modal('جدولة اختبار مباشرة');m.innerHTML=`<form><div class="form-grid two">${select('الطالب','student',students.map(s=>({id:s.id,name:s.full_name})))}${select('المختبر (اختياري إذا سيجريه المشرف)','examiner',examiners.map(s=>({id:s.id,name:s.full_name})))}${field('الموعد بتوقيت السعودية','when','datetime-local','','required')}${select('نوع الاختبار','type',[{id:'custom',name:'مخصص'},{id:'full',name:'كامل القرآن'}],'custom')}${field('المقرر','syllabus','text','','required')}${field('عدد الأسئلة','count','number',3,'min="2" max="15" required')}</div><button type="submit" class="button button-primary">حفظ الموعد</button></form>`;const form=m.querySelector('form');submit(form,async()=>{const s=students.find(x=>x.id===val(form,'student')),ex=examiners.find(x=>x.id===val(form,'examiner'));if(!s)throw Error('اختر الطالب');if(ex&&ex.complex_id!==s.complex_id)throw Error('المختبر لا يتبع مجمع الطالب.');await result(sb().from('exam_schedules').insert({id:crypto.randomUUID(),student_id:s.id,student_name:s.full_name,teacher_id:s.teacher_id,teacher_name:s.teacher_name,org_id:s.org_id,complex_id:s.complex_id,circle_id:s.circle_id,assigned_examiner_id:ex?.id||null,type:val(form,'type'),syllabus_label:val(form,'syllabus'),syllabus:{questionCount:Number(val(form,'count'))},scheduled_at:new Date(val(form,'when')+':00+03:00').toISOString(),status:'scheduled'}).select('id').single());m.closest('dialog').close();await load();msg(root,'حُفظ موعد الاختبار، ويمكن للمشرف إجراء الاختبار مباشرة أو إسناده لمختبر.')})});
 action(root,root.querySelector('[data-action="reload"]'),load);
 action(root,root.querySelector('[data-action="excel-results"]'),async()=>{const tests=await filteredTests();if(!tests.length)throw Error('لا توجد نتائج في الفترة المحددة.');excelApi().exportTests(tests,await testQuestions(tests))});
 action(root,root.querySelector('[data-action="print-results"]'),async()=>{const tests=await filteredTests();if(!tests.length)throw Error('لا توجد نتائج في الفترة المحددة.');excelApi().printTests(tests,'تقرير نتائج الاختبارات')});
 await load()
}
const reportTables={outcomes:{name:'الحصيلة',date:'date_key',head:['التاريخ','الطالب','الحفظ','تقدير الحفظ','المراجعة الصغرى','تقدير القريبة','المراجعة الكبرى','تقدير الكبرى'],map:(r,n)=>[r.date_key,n[r.student_id]||r.student_id,r.new_lesson,r.memorization_rating||'',r.recent_review,r.recent_review_rating||'',r.review,r.review_rating||'']},tests:{name:'الاختبارات',date:'performed_at',head:['التاريخ','الطالب','الحفظ','التجويد','المجموع'],map:r=>[dateText(r.performed_at),r.student_name_snapshot,r.scores?.memorization,r.scores?.tajweed,r.scores?.total]},attendance:{name:'حضور المعلمين',date:'date_key',head:['التاريخ','المعلم','الحضور','الانصراف','التأخر','الحضور المبكر','الانصراف المبكر','الحالة'],map:(r,n,t)=>[r.date_key,t[r.teacher_id]||r.teacher_id,dateText(r.check_in_at),dateText(r.check_out_at),r.late_minutes||0,r.early_arrival_minutes||0,r.early_leave_minutes||0,r.status]},student_attendance:{name:'حضور الطلاب',date:'date_key',head:['التاريخ','الطالب','الحالة','الملاحظة'],map:(r,n)=>[r.date_key,n[r.student_id]||r.student_id,attendanceAr[r.status]||r.status,r.note||'']},plans:{name:'الخطط',date:'start_date',head:['الطالب','النوع','البداية','النهاية','المقدار','الحالة'],map:(r,n)=>[n[r.student_id]||r.student_id,r.type==='review'?'مراجعة':'حفظ',r.start_date,r.end_date,r.daily_amount,r.status]}};
async function reportPage(root){const l=await lookups();root.innerHTML=`<div class="sl-toolbar">${select('السجل','kind',Object.entries(reportTables).map(([id,x])=>({id,name:x.name})),'outcomes')}${select('الحلقة','circle',l.circles,'','جميع الحلقات')}${field('من','from','date',today().slice(0,7)+'-01')}${field('إلى','to','date',today())}${field('اسم الطالب','search')}${button('عرض النتائج','load')}${button('تصدير Excel','csv')}${button('تقرير منسق / PDF','print')}</div><div class="sl-data"></div>`;let exported=null;action(root,root.querySelector('[data-action="load"]'),async()=>{exported=null;const kind=val(root,'kind'),cfg=reportTables[kind],from=val(root,'from'),to=val(root,'to');if(!cfg||!from||!to||from>to)throw Error('تحقق من الفترة؛ تاريخ النهاية لا يسبق البداية.');let data=[];for(let offset=0;;offset+=500){let q=sb().from(kind).select('*').gte(cfg.date,kind==='tests'?from+'T00:00:00+03:00':from).lte(cfg.date,kind==='tests'?to+'T23:59:59.999+03:00':to).order(cfg.date).order('id').range(offset,offset+499);if(val(root,'circle'))q=q.eq('circle_id',val(root,'circle'));const part=await result(q);data.push(...part);if(part.length<500)break;}const ids=[...new Set(data.map(r=>r.student_id).filter(Boolean))];let students=[];for(let i=0;i<ids.length;i+=100)students.push(...await result(sb().from('students').select('id,full_name').in('id',ids.slice(i,i+100))));const names=Object.fromEntries(students.map(s=>[s.id,s.full_name])),teachers=Object.fromEntries(l.teachers.map(t=>[t.id,t.full_name]));const term=val(root,'search').trim();if(term)data=data.filter(r=>String(names[r.student_id]||r.student_name_snapshot||'').includes(term));const mapped=data.map(r=>cfg.map(r,names,teachers));exported={head:cfg.head,data:mapped,title:cfg.name};root.querySelector('.sl-data').innerHTML=`<p>عدد السجلات: ${mapped.length} — من ${esc(from)} إلى ${esc(to)}</p>`+table(cfg.head,mapped.map(r=>r.map(esc)))});action(root,root.querySelector('[data-action="csv"]'),()=>{if(!exported)throw Error('اعرض النتائج أولًا');excelApi().exportTable(exported.title,exported.head,exported.data,[['عدد السجلات',exported.data.length]])});action(root,root.querySelector('[data-action="print"]'),()=>{if(!exported)throw Error('اعرض النتائج أولًا');excelApi().printTable(exported.title,exported.head,exported.data,[['عدد السجلات',exported.data.length]])})}
async function statisticsPage(root){
 const l=await lookups();
 root.innerHTML=`<div class="sl-toolbar">${select('الحلقة','circle',l.circles,'','جميع الحلقات')}${field('من','from','date',today().slice(0,7)+'-01')}${field('إلى','to','date',today())}${button('تحديث المؤشرات','load')}${button('التقارير التفصيلية','detail')}${button('تصدير الملخص','csv')}</div><div class="sl-stats"></div>`;
 let exported=null;
 const rangeRows=async(table,dateCol,from,to,circle)=>{let all=[];for(let offset=0;;offset+=500){let q=sb().from(table).select('*').gte(dateCol,from).lte(dateCol,to).order(dateCol).range(offset,offset+499);if(circle)q=q.eq('circle_id',circle);const part=await result(q);all.push(...part);if(part.length<500)return all}};
 const load=async()=>{
  const from=val(root,'from'),to=val(root,'to'),circle=val(root,'circle');if(!from||!to||from>to)throw Error('تحقق من الفترة المحددة.');
  let sq=sb().from('students').select('*').eq('active',true),tq=sb().from('teachers').select('*').eq('active',true);if(circle){sq=sq.eq('circle_id',circle);tq=tq.eq('circle_id',circle)}
  const [students,teachers,sa,outcomes,ta,tests,days]=await Promise.all([
   result(sq),result(tq),rangeRows('student_attendance','date_key',from,to,circle),rangeRows('outcomes','date_key',from,to,circle),rangeRows('attendance','date_key',from,to,circle),rangeRows('tests','performed_at',from+'T00:00:00+03:00',to+'T23:59:59.999+03:00',circle),rangeRows('plan_days','date_key',from,to,circle)
  ]);
  const attended=sa.filter(x=>['present','late'].includes(x.status)).length,studentRate=sa.length?Math.round(attended/sa.length*100):0;
  const outcomeRate=outcomeTrackRate(outcomes);
  const testScores=tests.map(x=>Number(x.scores?.total)).filter(Number.isFinite),testAvg=testScores.length?Math.round(testScores.reduce((a,b)=>a+b,0)/testScores.length*10)/10:0;
  const due=days.filter(x=>x.date_key<=to),completed=due.filter(x=>x.status==='completed').length,planRate=due.length?Math.round(completed/due.length*100):0;
  const teacherLate=ta.filter(x=>Number(x.late_minutes)>0).length,teacherExcused=ta.filter(x=>x.status==='excused').length,teacherAbsent=ta.filter(x=>x.status==='absent').length;
  const cards=[['الطلاب النشطون',students.length],['المعلمون النشطون',teachers.length],['حضور الطلاب',studentRate+'%'],['إنجاز الحصيلة',outcomeRate+'%'],['إنجاز أيام الخطط',planRate+'%'],['متوسط الاختبارات',testAvg],['تأخر المعلمين',teacherLate],['استئذان/غياب المعلمين',teacherExcused+' / '+teacherAbsent]];
  const circles=(circle?l.circles.filter(x=>x.id===circle):l.circles).map(cx=>{
   const ss=students.filter(x=>x.circle_id===cx.id),aa=sa.filter(x=>x.circle_id===cx.id),oo=outcomes.filter(x=>x.circle_id===cx.id),dd=days.filter(x=>x.circle_id===cx.id&&x.date_key<=to),tt=tests.filter(x=>x.circle_id===cx.id);
   const ar=aa.length?Math.round(aa.filter(x=>['present','late'].includes(x.status)).length/aa.length*100):0,or=outcomeTrackRate(oo),pr=dd.length?Math.round(dd.filter(x=>x.status==='completed').length/dd.length*100):0,ts=tt.map(x=>Number(x.scores?.total)).filter(Number.isFinite),avg=ts.length?Math.round(ts.reduce((a,b)=>a+b,0)/ts.length*10)/10:0;
   return[cx.name,ss.length,ar+'%',or+'%',pr+'%',avg]
  });
  exported={head:['الحلقة','الطلاب','الحضور','إنجاز الحصيلة','إنجاز الخطط','متوسط الاختبارات'],data:circles,title:'إحصاءات سنابل الوحي'};
  root.querySelector('.sl-stats').innerHTML=`<div class="stats-grid">${cards.map(([k,v])=>`<article class="stat-card"><span>${esc(k)}</span><b>${esc(v)}</b></article>`).join('')}</div><h2>مقارنة الحلقات</h2>${table(exported.head,circles.map(r=>r.map(esc)))}<p>الفترة: ${esc(from)} إلى ${esc(to)}. المؤشرات مبنية على السجلات الفعلية ضمن صلاحيات الحساب.</p>`;
 };
 action(root,root.querySelector('[data-action="load"]'),load);
 action(root,root.querySelector('[data-action="detail"]'),async()=>{const b=modal('التقارير التفصيلية');await reportPage(b)});
 action(root,root.querySelector('[data-action="csv"]'),()=>{if(!exported)throw Error('حدّث المؤشرات أولًا');excelApi().exportTable(exported.title,exported.head,exported.data,[['عدد الحلقات',exported.data.length]])});
 await load()
}

const noorLessonUrl=l=>'/noor-bayan.html?page='+encodeURIComponent(l?.pageFrom||3)+(l?.pageTo&&l.pageTo!==l.pageFrom?'&to='+encodeURIComponent(l.pageTo):'')+'&title='+encodeURIComponent(l?.title||'درس نور البيان');
const openTalaqqinLesson=l=>{
 if(!l)return;
 if(l.pageFrom)window.open(noorLessonUrl(l),'_blank','noopener,noreferrer');
 else window.open('https://quran.ksu.edu.sa/','_blank','noopener,noreferrer');
};
const showTalaqqinCurriculum=async()=>{
 const lessons=await result(sb().from('talaqqin_lessons').select('*').eq('active',true).order('lesson_no'));
 const b=modal('منهج حلقات التلقين · نور البيان');
 b.innerHTML='<p>المسار الزمني المعتمد 50 أسبوعًا، والتقدم إتقاني: لا ينتقل الطالب إلى الدرس التالي حتى يجتاز تقييم الدرس الحالي.</p>'+
 table(['#','الوحدة','الأسابيع','الدرس','صفحات نور البيان'],lessons.map(x=>[
   esc(x.lesson_no),esc(x.unit_name),esc(x.unit_week_start===x.unit_week_end?x.unit_week_start:(x.unit_week_start+'–'+x.unit_week_end)),
   esc(x.lesson_title),esc(x.book_page_from?(x.book_page_from+(x.book_page_to!==x.book_page_from?'–'+x.book_page_to:'')):'القراءة من المصحف')
 ]));
};
const assessTalaqqinStudent=(root,row)=>{
 const l=row.lesson||{},b=modal('تقييم درس التلقين · '+row.fullName);
 b.innerHTML=\`<form><p><b>\${esc(l.title||'الدرس الحالي')}</b><br><span class="sl-help">\${esc(l.unitName||'')} · الخطة الزمنية: الأسبوع \${esc(l.weekStart===l.weekEnd?l.weekStart:(l.weekStart+'–'+l.weekEnd))}</span></p>
 <div class="sl-toolbar">\${l.pageFrom?button('فتح صفحة الدرس','open-lesson'):''}\${l.mediaUrl?button('استماع / مشاهدة الشرح','media'):''}</div>
 <label>تقدير الدرس<select name="rating" required><option value="">اختر التقدير</option><option>ممتاز</option><option>جيد جدًا</option><option>جيد</option><option>يحتاج إعادة</option><option>لم يسمع</option></select></label>
 <label>ملاحظة المعلم<textarea name="notes" rows="3" style="width:100%"></textarea></label>
 <p class="sl-help">ممتاز / جيد جدًا / جيد: ينتقل الطالب تلقائيًا إلى الدرس التالي. «يحتاج إعادة» أو «لم يسمع»: يبقى الدرس نفسه لليوم التالي.</p>
 <button type="submit" class="button button-primary">حفظ التقييم</button></form>\`;
 if(l.pageFrom)action(b,b.querySelector('[data-action="open-lesson"]'),()=>openTalaqqinLesson(l));
 if(l.mediaUrl)action(b,b.querySelector('[data-action="media"]'),()=>window.open(l.mediaUrl,'_blank','noopener,noreferrer'));
 submit(b.querySelector('form'),async()=>{
   const r=await rpc('save_talaqqin_assessment',{p_student_id:row.studentId,p_rating:val(b,'rating'),p_notes:b.querySelector('[name="notes"]').value.trim()||null});
   b.closest('dialog').close();
   msg(root,r.completed?'أتم الطالب منهج حلقات التلقين كاملًا.':(r.passed?'تم اجتياز الدرس والانتقال إلى الدرس التالي.':'حُفظ التقييم وسيُعاد الدرس نفسه.'));
   await dashboard(root);
 });
};

async function dashboard(root){
 const a=await access(),rolesNow=a.roles||[],isAdmin=rolesNow.includes('admin'),isOrgManager=rolesNow.includes('manager'),isSupervisor=rolesNow.some(r=>['manager','supervisor'].includes(r)),canAnnounce=isAdmin||isSupervisor;
 const count=async(table,filters={})=>{let q=sb().from(table).select('id',{count:'exact',head:true});for(const [k,v]of Object.entries(filters))q=q.eq(k,v);const r=await q;if(r.error)throw Error(r.error.message);return r.count||0};
 const [studentsN,teachersN,teacherAttendanceN,outcomesN,pendingExamN,activePlansN]=await Promise.all([count('students',{active:true}),count('teachers',{active:true}),count('attendance',{date_key:today()}),count('outcomes',{date_key:today()}),count('exam_requests',{status:'pending'}),count('plans',{status:'active'})]);
 const cards=[['الطلاب النشطون',studentsN],['المعلمون النشطون',teachersN],['بصمات المعلمين اليوم',teacherAttendanceN],['الحصائل المرصودة اليوم',outcomesN],['طلبات الاختبار المعلقة',pendingExamN],['الخطط النشطة',activePlansN]],alerts=[];
 if(isAdmin){const u=await adminCall('list'),unassigned=(u.users||[]).filter(x=>x.active&&!x.memberships?.some(m=>m.active)),unconfirmed=(u.users||[]).filter(x=>x.active&&!x.email_confirmed);const [cx,ci,mo]=await Promise.all([count('complexes',{active:true}),count('circles',{active:true}),count('mosques',{active:true})]);alerts.push(`الهيكل الحالي: ${cx} مجمع، ${mo} مسجد/موقع بصمة، ${ci} حلقة.`);if(unassigned.length)alerts.push(`يوجد ${unassigned.length} حساب نشط بلا إسناد صلاحية.`);if(unconfirmed.length)alerts.push(`يوجد ${unconfirmed.length} حساب يحتاج تأكيد البريد.`)}
 if(isSupervisor){const att=await rows('attendance','teacher_id,status,late_minutes,check_in_at',{date_key:today()}),late=att.filter(x=>Number(x.late_minutes)>0).length,abs=att.filter(x=>x.status==='absent').length,exc=att.filter(x=>x.status==='excused').length;if(late)alerts.push(`معلمون متأخرون اليوم: ${late}.`);if(abs)alerts.push(`غياب معلمين معتمد اليوم: ${abs}.`);if(exc)alerts.push(`استئذان معلمين اليوم: ${exc}.`);if(pendingExamN)alerts.push(`طلبات اختبار تنتظر الجدولة: ${pendingExamN}.`)}
 if(rolesNow.includes('teacher')){const st=await rows('students','id',{active:true}),oc=await rows('outcomes','student_id',{date_key:today()}),done=new Set(oc.map(x=>x.student_id)),remaining=st.filter(x=>!done.has(x.id)).length;if(remaining)alerts.push(`بقيت حصيلة ${remaining} طالب/طلاب لهذا اليوم.`);if(!remaining&&st.length)alerts.push('اكتملت حصيلة طلابك لليوم.')}
 const since=new Date(Date.now()-13*86400000).toISOString().slice(0,10),[recent,studentNames,announcements]=await Promise.all([
  result(sb().from('outcomes').select('student_id,memorization_rating,recent_review_rating,review_rating,recitation_metrics,date_key').gte('date_key',since).order('date_key',{ascending:false}).limit(5000)),
  rows('students','id,full_name',{active:true}),
  result(sb().from('announcements').select('*').eq('active',true).lte('starts_on',today()).or('ends_on.is.null,ends_on.gte.'+today()).order('starts_on',{ascending:false}).limit(30))
 ]),names=new Map(studentNames.map(x=>[x.id,x.full_name])),risk=new Map;
 for(const o of recent){const r=risk.get(o.student_id)||{fails:0,details:0};r.fails+=outcomeFailCount(o);r.details+=metricTotal(o.recitation_metrics);risk.set(o.student_id,r)}
 const risky=[...risk].filter(([,r])=>r.fails>=2||r.details>=5).map(([id,r])=>({name:names.get(id)||id,...r})).sort((x,y)=>(y.fails*10+y.details)-(x.fails*10+x.details)).slice(0,10);
 if(risky.length)alerts.push(`طلاب يحتاجون متابعة خلال آخر 14 يومًا: ${risky.length}.`);
 const quick=rolesNow.includes('teacher')?[['ابدأ جلسة الحلقة','outcomes','تحضير وحصيلة اليوم'],['خطط الطلاب','plans','المقررات والتوزيع'],['الاختبارات','tests','طلب اختبار ومتابعة النتيجة']]:isSupervisor?[['متابعة الحصيلة','outcomes','مراجعة جلسات الحلقات'],['حضور المعلمين','attendance','البصمة والتأخر والغياب'],['التقارير','reports','مؤشرات الأداء'],['الطلاب','students','المتابعة التعليمية']]:isAdmin?[['إدارة اليوم','dashboard','ملخص التشغيل'],['الطلاب والمعلمون','students','السجلات والإسناد'],['التقارير','reports','المؤشرات والتصدير'],['الإعدادات','settings','المجمعات والحسابات']]:[['الاختبارات','tests','إدارة الاختبارات']];
 root.innerHTML=`<section class="sl-session-head"><div><span class="sl-kicker">لوحة العمل</span><h2>أهلًا ${esc(a.profile?.display_name||'بك')}</h2><p>${esc(today())} — أهم ما تحتاجه الآن ضمن صلاحيات حسابك.</p></div></section>${a.requires_scope_assignment?'<p role="alert">الحساب يحتاج إسنادًا إلى مجمع أو حلقة قبل ظهور البيانات.</p>':''}<div class="sl-quick-grid">${quick.map(([label,key,sub])=>`<button type="button" class="sl-quick-action" data-go="${key}"><b>${esc(label)}</b><span>${esc(sub)}</span></button>`).join('')}</div><div class="stats-grid">${cards.map(([k,v])=>`<article class="stat-card"><span>${esc(k)}</span><b>${esc(v)}</b></article>`).join('')}</div>${announcements.length?'<section class="sl-tasks"><h3>الإعلانات والمناسبات</h3>'+announcements.map(x=>'<article class="sl-announcement"><b>'+esc(x.title)+'</b><p>'+esc(x.body)+'</p><small>'+esc(x.starts_on)+(x.ends_on?' — '+esc(x.ends_on):'')+'</small></article>').join('')+'</section>':''}<section class="sl-tasks"><h3>ما يحتاج الانتباه</h3>${alerts.length?'<ul>'+alerts.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>لا توجد تنبيهات تشغيلية ظاهرة الآن.</p>'}</section>${risky.length?'<section class="sl-tasks"><h3>متابعة تعليمية مقترحة</h3>'+table(['الطالب','عدم الإنجاز','أخطاء/شك/تجويد'],risky.map(x=>[esc(x.name),esc(x.fails),esc(x.details)]))+'<p>يظهر الطالب هنا عند تكرر «لم يحفظ/لم يسمع» مرتين أو وصول تفاصيل الأخطاء والتردد والتجويد إلى 5 فأكثر خلال آخر 14 يومًا.</p></section>':''}<div class="sl-toolbar">${canAnnounce?button('إضافة إعلان / مناسبة','announce'):''}${isAdmin?button('إدارة المستخدمين','users'):''}</div><p>آخر تحديث: ${esc(new Date().toLocaleTimeString('ar-SA',{timeZone:'Asia/Riyadh'}))}</p>`;

 let talaqqinRows=[];
 try{talaqqinRows=await rpc('get_talaqqin_dashboard',{})}catch(e){talaqqinRows=[]}
 if(Array.isArray(talaqqinRows)&&talaqqinRows.length){
   const sec=document.createElement('section');sec.className='sl-tasks sl-talaqqin-dashboard';
   sec.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><span class="sl-kicker">حلقات التلقين</span><h3 style="margin:5px 0">دروس اليوم · نور البيان</h3><p class="sl-help">يظهر لكل طالب درسه الحالي مباشرة، وبعد التقييم ينتقل تلقائيًا إلى الدرس التالي عند الاجتياز.</p></div>'+button('عرض منهج 50 أسبوعًا','talaqqin-curriculum')+'</div>'+
   '<div class="sl-quick-grid">'+talaqqinRows.map((r,i)=>{
      const l=r.lesson||{},pages=l.pageFrom?('صفحة '+l.pageFrom+(l.pageTo&&l.pageTo!==l.pageFrom?'–'+l.pageTo:'')):'القراءة من المصحف';
      return '<article class="sl-quick-action" style="text-align:right;cursor:default"><b>'+esc(r.fullName)+'</b><span>'+esc(r.circleName||'')+'</span><strong style="display:block;margin:8px 0;color:#073c34">'+esc(r.completed?'أتم المنهج':(l.title||'—'))+'</strong><span>'+esc(l.unitName||'')+(l.weekStart?' · الأسابيع '+esc(l.weekStart===l.weekEnd?l.weekStart:(l.weekStart+'–'+l.weekEnd)):'')+' · '+esc(pages)+'</span><span>المنجز: '+esc(r.completedLessons||0)+' / 34</span><div class="sl-toolbar" style="margin-top:8px">'+(!r.completed&&l.pageFrom?button('فتح الدرس','tl-open-'+i):'')+(!r.completed&&l.mediaUrl?button('استماع / مشاهدة','tl-media-'+i):'')+(!r.completed?button('تقييم الدرس','tl-rate-'+i):'')+'</div></article>'
   }).join('')+'</div>';
   const head=root.querySelector('.sl-session-head');if(head)head.insertAdjacentElement('afterend',sec);else root.prepend(sec);
   action(sec,sec.querySelector('[data-action="talaqqin-curriculum"]'),showTalaqqinCurriculum);
   talaqqinRows.forEach((r,i)=>{
     const l=r.lesson||{};
     const op=sec.querySelector('[data-action="tl-open-'+i+'"]');if(op)action(sec,op,()=>openTalaqqinLesson(l));
     const md=sec.querySelector('[data-action="tl-media-'+i+'"]');if(md)action(sec,md,()=>window.open(l.mediaUrl,'_blank','noopener,noreferrer'));
     const rt=sec.querySelector('[data-action="tl-rate-'+i+'"]');if(rt)action(sec,rt,()=>assessTalaqqinStudent(root,r));
   });
 }

 root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigateView(b.dataset.go)));
  if(isAdmin)action(root,root.querySelector('[data-action="users"]'),async()=>{const m=modal('الحسابات والصلاحيات');await usersPanel(m)});
 if(canAnnounce)action(root,root.querySelector('[data-action="announce"]'),async()=>{
  const l=await lookups(),m=modal('إضافة إعلان أو مناسبة');
  m.innerHTML=`<form><div class="form-grid two">${field('العنوان','title','text','','required')}${select('المجمع (فارغ = كل المؤسسة)','complex_id',l.complexes)}${select('الحلقة (اختياري)','circle_id',l.circles)}${field('يبدأ في','starts_on','date',today(),'required')}${field('ينتهي في','ends_on','date','')}</div><label>نص الإعلان<textarea name="body" rows="5" required style="width:100%"></textarea></label><button class="button button-primary" type="submit">نشر الإعلان</button></form>`;
  const form=m.querySelector('form'),cx=form.querySelector('[name="complex_id"]'),ci=form.querySelector('[name="circle_id"]');const fillCircles=()=>{ci.innerHTML='<option value="">كل حلقات المجمع</option>'+l.circles.filter(x=>!cx.value||x.complex_id===cx.value).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')};cx.onchange=fillCircles;fillCircles();
  submit(form,async()=>{const complex=val(form,'complex_id')||null,circle=val(form,'circle_id')||null;if(rolesNow.includes('supervisor')&&!isAdmin&&!isOrgManager&&!complex)throw Error('المشرف ينشر الإعلان داخل مجمعه؛ اختر المجمع.');if(circle&&!complex)throw Error('اختر المجمع قبل الحلقة.');const ends=val(form,'ends_on')||null;if(ends&&ends<val(form,'starts_on'))throw Error('تاريخ النهاية لا يسبق البداية.');await result(sb().from('announcements').insert({org_id:a.org_id,complex_id:complex,circle_id:circle,title:val(form,'title').trim(),body:form.elements.body.value.trim(),starts_on:val(form,'starts_on'),ends_on:ends,active:true}).select('id').single());m.closest('dialog').close();await dashboard(root)})
 })
}
async function settingsPage(root){
 const a=await access();if(!a.roles.includes('admin'))throw Error('هذه الصفحة لمدير النظام');
 root.innerHTML=`<div class="sl-toolbar">${button('إدارة المستخدمين','users')}${button('استيراد / تصدير Excel','bulk-excel')}${button('إضافة مجمع','add-complex')}${button('إضافة مسجد وموقع بصمة','add-mosque')}${button('إضافة حلقة','add-circle')}</div><div class="sl-settings"></div><div class="sl-structure"></div>`;
 action(root,root.querySelector('[data-action="users"]'),async()=>{const b=modal('الحسابات والصلاحيات');await usersPanel(b)});
 const bulkPanel=async()=>{
  const b=modal('الاستيراد والتصدير الجماعي عبر Excel');let parsed=null;
  b.innerHTML=`<p>قالب واحد متعدد الأوراق للمجمعات والمساجد والحلقات والمعلمين والطلاب. يتم التحقق أولًا ثم يحفظ الخادم الدفعة كاملة أو يلغيها كاملة عند وجود خطأ.</p><div class="sl-toolbar">${button('تحميل قالب فارغ','template')}${button('تصدير البيانات الحالية','export-master')}</div><label>اختر ملف Excel بعد تعبئته<input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><div class="sl-import-preview"><p>لم يتم اختيار ملف بعد.</p></div><button type="button" class="button button-primary" data-action="import" disabled>استيراد البيانات المعاينة</button><p>ملاحظة: ورقة المعلمين تنشئ سجلات المعلمين التشغيلية؛ حسابات الدخول وكلمات المرور تبقى من «إدارة المستخدمين» حفاظًا على أمان الحسابات.</p>`;
  action(b,b.querySelector('[data-action="template"]'),()=>excelApi().template());
  action(b,b.querySelector('[data-action="export-master"]'),async()=>{const [complexes,mosques,circles,teachers,students]=await Promise.all([rows('complexes'),rows('mosques'),rows('circles'),rows('teachers'),rows('students')]);await excelApi().exportMaster({complexes,mosques,circles,teachers,students})});
  const input=b.querySelector('[name="file"]'),preview=b.querySelector('.sl-import-preview'),go=b.querySelector('[data-action="import"]');
  input.addEventListener('change',async()=>{go.disabled=true;parsed=null;try{const file=input.files?.[0];if(!file)throw Error('اختر ملف Excel');parsed=await excelApi().parse(file);const v=parsed.validation,labels={complexes:'المجمعات',mosques:'المساجد',circles:'الحلقات',teachers:'المعلمون',students:'الطلاب'};preview.innerHTML=`<div class="stats-grid">${Object.entries(v.counts).map(([k,n])=>`<article class="stat-card"><span>${esc(labels[k]||k)}</span><b>${esc(n)}</b></article>`).join('')}</div>${v.errors.length?'<h3>أخطاء تمنع الاستيراد</h3><ul>'+v.errors.slice(0,50).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${v.warnings.length?'<h3>تنبيهات</h3><ul>'+v.warnings.slice(0,50).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':''}${!v.errors.length?'<p>المعاينة سليمة ويمكن تنفيذ الاستيراد.</p>':''}`;go.disabled=!!v.errors.length}catch(e){preview.innerHTML='<p role="alert">'+esc(e.message)+'</p>'}});
  action(b,go,async()=>{if(!parsed||parsed.validation.errors.length)throw Error('أصلح أخطاء الملف أولًا.');if(!confirm('تنفيذ الاستيراد الآن؟ سيتم تحديث السجلات المتطابقة ونقل الطالب مع تاريخه إذا تغيرت حلقته.'))return;const payload=JSON.parse(JSON.stringify(parsed.payload,(k,v)=>k==='__row'?undefined:v)),r=await rpc('bulk_import_master_data',{p_org_id:a.org_id,p_payload:payload});lookupPromise=null;preview.innerHTML=`<h3>تم الاستيراد بنجاح</h3><p>المجمعات: ${esc(r.complexes)} — المساجد: ${esc(r.mosques)} — الحلقات: ${esc(r.circles)} — المعلمون: ${esc(r.teachers)} — الطلاب: ${esc(r.students)} — الطلاب المنقولون: ${esc(r.movedStudents)}</p>`;go.disabled=true;await load()})
 };
 action(root,root.querySelector('[data-action="bulk-excel"]'),bulkPanel);
 const load=async()=>{
  const [items,complexes,mosques,circles]=await Promise.all([rows('settings','*',{org_id:a.org_id}),rows('complexes','*'),rows('mosques','*'),rows('circles','*')]);
  const s=items.find(x=>x.id===a.org_id+'_settings'),v=s?.values||{},box=root.querySelector('.sl-settings');
  box.innerHTML=`<h2>إعدادات عامة</h2><form><div class="form-grid two">${field('اسم المنصة','platformName','text',v.platformName||'سنابل الوحي')}${field('أيام السماح بتعديل الحصيلة','outcomesEditDays','number',v.outcomesEditDays??7,'min="0" max="365" required')}</div><button type="submit" class="button button-primary">حفظ الإعدادات العامة</button></form>`;
  submit(box.querySelector('form'),async()=>{const values={...v,platformName:val(box,'platformName'),outcomesEditDays:Number(val(box,'outcomesEditDays')),timezone:'Asia/Riyadh'};await result(sb().from('settings').upsert({id:s?.id||a.org_id+'_settings',org_id:a.org_id,values}).select('id').single());msg(box,'تم حفظ الإعدادات العامة.')});
  const area=root.querySelector('.sl-structure');
  area.innerHTML=`<h2>المجمعات</h2>${table(['المجمع','الحالة'],complexes.map(x=>[esc(x.name),esc(x.active?'نشط':'موقف')]))}<h2>المساجد ومواقع البصمة</h2>${table(['المسجد','المجمع','الإحداثيات','النطاق','إعدادات الحضور','إجراء'],mosques.map((m,i)=>{const cfg=Array.isArray(m.attendance_windows)?m.attendance_windows[0]||{}:{};return[esc(m.name),esc(complexes.find(x=>x.id===m.complex_id)?.name||m.complex_id),esc(m.latitude+', '+m.longitude),esc(m.radius_meters+'م'),esc((cfg.startPrayer||'Asr')+' → '+(cfg.endPrayer||'Maghrib')+' · تأخير '+(cfg.lateAllowMinutes??15)+'د'),button('تعديل','mosque-'+i)]}))}<h2>الحلقات</h2>${table(['الحلقة','المجمع','المسجد','الحالة','إجراء'],circles.map((x,i)=>[esc(x.name),esc(complexes.find(c=>c.id===x.complex_id)?.name||x.complex_id),esc(mosques.find(m=>m.id===x.mosque_id)?.name||x.mosque_id),esc(x.active?'نشطة':'موقفة'),button('تعديل','circle-'+i)]))}`;
  mosques.forEach((m,i)=>action(area,area.querySelector(`[data-action="mosque-${i}"]`),()=>editMosque(m,complexes)));
  circles.forEach((x,i)=>action(area,area.querySelector(`[data-action="circle-${i}"]`),()=>editCircle(x,complexes,mosques)));
 };
 const editMosque=(m,complexes)=>{const b=modal(m?'تعديل المسجد وإعدادات البصمة':'إضافة مسجد وموقع بصمة');const cfg=Array.isArray(m?.attendance_windows)?m.attendance_windows[0]||{}:{};const prayers=[{id:'Fajr',name:'الفجر'},{id:'Dhuhr',name:'الظهر'},{id:'Asr',name:'العصر'},{id:'Maghrib',name:'المغرب'},{id:'Isha',name:'العشاء'}];b.innerHTML=`<form><div class="form-grid two">${select('المجمع','complex_id',complexes,m?.complex_id)}${field('اسم المسجد','name','text',m?.name||'','required')}${field('خط العرض','latitude','number',m?.latitude||'','step="any" required')}${field('خط الطول','longitude','number',m?.longitude||'','step="any" required')}${field('نطاق البصمة بالمتر','radius','number',m?.radius_meters||100,'min="20" max="500" required')}${select('بداية الدوام','startPrayer',prayers,cfg.startPrayer||'Asr')}${select('نهاية الدوام','endPrayer',prayers,cfg.endPrayer||'Maghrib')}${field('سماح التأخير بالدقائق','late','number',cfg.lateAllowMinutes??15,'min="0" max="180"')}${field('حد الحضور المبكر بالدقائق','early','number',cfg.earlyArrivalMinutes??15,'min="0" max="180"')}${field('سماح الانصراف المبكر بالدقائق','leave','number',cfg.earlyLeaveMinutes??15,'min="0" max="180"')}${field('يعد غائبًا بعد بداية الدوام بـ','absent','number',cfg.absenceAfterMinutes??60,'min="0" max="360"')}${field('مهلة الانصراف بعد نهاية الدوام','grace','number',cfg.checkoutGraceMinutes??120,'min="0" max="360"')}</div>${weekdayChecks('work',cfg.weekdays||['0','1','2','3','4'])}<button type="button" class="button button-soft" data-action="gps">استخدام موقعي الحالي</button><button type="submit" class="button button-primary">حفظ المسجد وإعدادات البصمة</button></form>`;const form=b.querySelector('form');action(b,b.querySelector('[data-action="gps"]'),async()=>{const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000}));form.elements.latitude.value=p.coords.latitude;form.elements.longitude.value=p.coords.longitude});submit(form,async()=>{const workdays=selectedWeekdays(form,'work');if(!workdays.length)throw Error('اختر يوم دوام واحدًا على الأقل');const config={action:'both',weekdays:workdays,start:'00:00',end:'23:59',startPrayer:val(form,'startPrayer'),endPrayer:val(form,'endPrayer'),lateAllowMinutes:Number(val(form,'late')),earlyArrivalMinutes:Number(val(form,'early')),earlyLeaveMinutes:Number(val(form,'leave')),absenceAfterMinutes:Number(val(form,'absent')),checkoutGraceMinutes:Number(val(form,'grace'))};const row={org_id:a.org_id,complex_id:val(form,'complex_id'),name:val(form,'name'),latitude:Number(val(form,'latitude')),longitude:Number(val(form,'longitude')),radius_meters:Number(val(form,'radius')),attendance_windows:[config],timezone:'Asia/Riyadh',active:true,updated_at:new Date().toISOString()};if(m)await result(sb().from('mosques').update(row).eq('id',m.id).select('id').single());else await result(sb().from('mosques').insert({id:'mosque-'+crypto.randomUUID(),...row}).select('id').single());lookupPromise=null;b.closest('dialog').close();await load();msg(root,'تم حفظ موقع المسجد وإعدادات البصمة.')})};
 const editCircle=(x,complexes,mosques)=>{const b=modal(x?'تعديل الحلقة':'إضافة حلقة');b.innerHTML=`<form><div class="form-grid two">${select('المجمع','complex_id',complexes,x?.complex_id)}${select('المسجد','mosque_id',mosques.map(m=>({id:m.id,name:m.name})),x?.mosque_id)}${field('اسم الحلقة','name','text',x?.name||'','required')}<label>نشطة<input name="active" type="checkbox" ${x?.active===false?'':'checked'}></label></div><button type="submit" class="button button-primary">حفظ الحلقة</button></form>`;const form=b.querySelector('form');submit(form,async()=>{const mosque=mosques.find(m=>m.id===val(form,'mosque_id'));if(!mosque||mosque.complex_id!==val(form,'complex_id'))throw Error('اختر مسجدًا تابعًا للمجمع نفسه');const row={org_id:a.org_id,complex_id:val(form,'complex_id'),mosque_id:mosque.id,name:val(form,'name'),active:form.elements.active.checked,updated_at:new Date().toISOString()};if(x)await result(sb().from('circles').update(row).eq('id',x.id).select('id').single());else await result(sb().from('circles').insert({id:'circle-'+crypto.randomUUID(),...row}).select('id').single());lookupPromise=null;b.closest('dialog').close();await load();msg(root,'تم حفظ الحلقة.')})};
 action(root,root.querySelector('[data-action="add-complex"]'),async()=>{const b=modal('إضافة مجمع');b.innerHTML=`<form>${field('اسم المجمع','name','text','','required')}<button type="submit" class="button button-primary">إنشاء المجمع</button></form>`;const form=b.querySelector('form');submit(form,async()=>{await result(sb().from('complexes').insert({id:'complex-'+crypto.randomUUID(),org_id:a.org_id,name:val(form,'name'),active:true}).select('id').single());lookupPromise=null;b.closest('dialog').close();await load();msg(root,'تم إنشاء المجمع، ويمكن الآن إضافة مسجد وحلقات وحسابات له.')})});
 action(root,root.querySelector('[data-action="add-mosque"]'),async()=>{const complexes=await rows('complexes','*',{active:true});editMosque(null,complexes)});
 action(root,root.querySelector('[data-action="add-circle"]'),async()=>{const [complexes,mosques]=await Promise.all([rows('complexes','*',{active:true}),rows('mosques','*',{active:true})]);editCircle(null,complexes,mosques)});
 await load()
}
async function mount(root,view){root.classList.add('sl-live');root.dataset.build='20260930-v12';root.innerHTML=`<h1>${esc(titles[view]||'سنابل الوحي')}</h1><div class="sl-content"><p>جارٍ التحميل…</p></div>`;const b=root.querySelector('.sl-content');try{await access();b.innerHTML='';const render={dashboard,students:studentsPage,outcomes:outcomesPage,plans:plansPage,attendance:attendancePage,tests:testsPage,inquiries:reportPage,reports:statisticsPage,settings:settingsPage}[view];if(!render)throw Error('الصفحة غير متاحة');await render(b)}catch(e){msg(b,e.message,true)}}
window.SanabilLive={mount,usersPanel};window.dispatchEvent(new Event("sanabil-live-ready"));
window.addEventListener('sanabil-session-changed',()=>{lookupPromise=null;surahsPromise=null});
const style=document.createElement('style');style.textContent=`.sl-live{background:white;border:1px solid #dde5df;border-radius:20px;padding:24px;min-height:300px}.sl-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:15px 0}.sl-live label,.sl-dialog label{display:grid;gap:8px;font-weight:600}.sl-live input,.sl-live select,.sl-dialog input,.sl-dialog select{font:inherit;max-width:100%;min-width:0;padding:10px;border:1px solid #bdccc3;border-radius:8px;background:white}.sl-live table,.sl-dialog table{width:100%;border-collapse:collapse}.sl-live th,.sl-live td,.sl-dialog td,.sl-dialog th{padding:12px;text-align:right;border-bottom:1px solid #e2e9e5}.sl-dialog{direction:rtl;width:min(900px,94vw);max-height:90vh;border:0;border-radius:18px;padding:24px;color:#183c33}.sl-dialog::backdrop{background:#002c2580}.sl-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px}.sl-dialog fieldset{border:1px solid #ddd;border-radius:12px;margin:12px 0}.sl-live .button,.sl-dialog .button{margin:3px}.sl-message{padding:12px;background:#f3f7f4;border-radius:8px}.sl-tasks{margin:18px 0;padding:16px;border:1px solid #dde5df;border-radius:16px;background:#fbfdfc}.sl-announcement{padding:12px 0;border-bottom:1px solid #e2e9e5}.sl-announcement:last-child{border-bottom:0}.sl-announcement b{color:#00808A}.sl-announcement small{color:#63766e}.sl-import-preview{margin:14px 0}.sl-import-warning{margin:12px 0;padding:14px 16px;border:1px solid #e2c56f;background:#fff8df;color:#6b5313;border-radius:12px;font-weight:600}.sl-dialog .form-grid,.sl-live .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.sl-live .table-wrap{overflow:auto}.sl-data input{width:100%;box-sizing:border-box}.sl-live .stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:650px){.sl-dialog .form-grid,.sl-live .form-grid{grid-template-columns:1fr}.sl-live{padding:14px}.sl-live .stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{.topbar,.tabs,.mobile-nav,.sl-toolbar,button,.more-sheet{display:none!important}.app-content,.sl-live{margin:0!important;padding:0!important;border:0}.table-wrap{overflow:visible!important}thead{display:table-header-group}tr{break-inside:avoid}body{background:white!important}}`;document.head.append(style);
})();

