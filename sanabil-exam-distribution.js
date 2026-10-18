/* Deterministic equal-coverage partitions for Quran examination questions.
 * A question must fit wholly inside its assigned syllabus; no manual filler questions.
 */
(function () {
 'use strict';
 const int=x=>Number(x);
 function verseIndex(catalog,surah,ayah){
   const s=int(surah),a=int(ayah);
   if(!Array.isArray(catalog)||!Number.isInteger(s)||!Number.isInteger(a)||s<1||s>114)return NaN;
   let start=1;
   for(const item of catalog){
     const n=int(item.surahNo),len=int(item.ayahCount);
     if(!Number.isInteger(len)||len<1)return NaN;
     if(n===s)return a>=1&&a<=len?start+a-1:NaN;
     start+=len;
   }
   return NaN;
 }
 function normalizedSyllabus(syllabus,catalog,boundaries){
   const d=syllabus||{},mode=d.mode||d.examType||'custom';
   const parts=['juz','phased','full'].includes(mode);
   let start,end,fromJuz,toJuz;
   if(parts){
     fromJuz=mode==='full'?1:int(d.fromJuz);
     toJuz=mode==='full'?30:int(d.toJuz);
     if(!Number.isInteger(fromJuz)||!Number.isInteger(toJuz)||fromJuz<1||toJuz>30||toJuz<fromJuz)
       throw Error('حدود أجزاء الاختبار غير صحيحة.');
     if(!Array.isArray(boundaries)||boundaries.length!==30)
       throw Error('يتعذر توزيع الأسئلة قبل تحميل حدود الأجزاء الثلاثين من المصحف.');
     const lookup=new Map(boundaries.map(p=>[int(p.juzNo),p]));
     const first=lookup.get(fromJuz),last=lookup.get(toJuz);
     if(!first||!last)throw Error('الجزء المطلوب غير موجود في مرجع القرآن.');
     start=int(first.fromAyahIndex);end=int(last.toAyahIndex);
   }else{
     const a=int(d.fromSurahNo),b=int(d.toSurahNo||d.fromSurahNo);
     start=verseIndex(catalog,a,int(d.fromAyahNo||1));
     const max=b&&catalog.find(s=>int(s.surahNo)===b);
     end=verseIndex(catalog,b,int(d.toAyahNo||max?.ayahCount));
   }
   if(!Number.isInteger(start)||!Number.isInteger(end)||end<start)
     throw Error('حدود آيات المقرر غير صحيحة.');
   return {start,end,mode,parts,fromJuz,toJuz,direction:d.direction==='from_nas'?'from_nas':'from_fatiha'};
 }
 function buildBins(bank,syllabus,count,catalog,boundaries){
   const n=int(count);
   if(!Number.isInteger(n)||n<2||n>15)throw Error('يجب أن يكون عدد الأسئلة من 2 إلى 15.');
   const range=normalizedSyllabus(syllabus,catalog,boundaries);
   const bins=Array.from({length:n},()=>[]);
   const boundaryMap=new Map((boundaries||[]).map(p=>[int(p.juzNo),p]));
   for(const q of bank||[]){
     const start=int(q.ayah_index),to=verseIndex(catalog,q.end_surah_no,q.end_ayah_no);
     if(q.verified!==true||!Number.isInteger(start)||!Number.isInteger(to)||
       to<start||start<range.start||to>range.end)continue;
     let progress;
     if(range.parts){
       const juz=int(q.juz_no),j=boundaryMap.get(juz);
       if(juz<range.fromJuz||juz>range.toJuz||!j)continue;
       const begin=int(j.fromAyahIndex),end=int(j.toAyahIndex);
       if(!Number.isInteger(begin)||!Number.isInteger(end)||end<begin)continue;
       progress=(juz-range.fromJuz+(start-begin)/(end-begin+1))/(range.toJuz-range.fromJuz+1);
     }else progress=(start-range.start)/(range.end-range.start+1);
     if(!Number.isFinite(progress)||progress<0||progress>=1)continue;
     const index=Math.min(n-1,Math.floor(progress*n));
     bins[index].push(q);
   }
   const blanks=bins.map((x,i)=>x.length?null:i+1).filter(Boolean);
   if(blanks.length)throw Error('لا توجد أسئلة معتمدة تغطي كامل المقرر بالتساوي. الشريحة '+blanks.join('، ')+' من '+n+' خالية؛ يلزم إضافة أسئلة لهذه المواضع قبل بدء الاختبار.');
   if(range.direction==='from_nas')bins.reverse();
   return bins;
 }
 function pickModel(bins,shuffle){
   if(!Array.isArray(bins)||!bins.length||bins.some(bin=>!bin.length))throw Error('لا يمكن إنشاء نموذج يترك شريحة من المقرر بلا سؤال.');
   const choose=shuffle||((items)=>items.slice());
   const used=new Set();
   return bins.map((bin)=>{
     const q=choose(bin).find(row=>!used.has(row.id));
     if(!q)throw Error('تعذر ضمان عدم تكرار الأسئلة داخل نموذج الاختبار.');
     used.add(q.id);return q;
   });
 }
 const api=Object.freeze({verseIndex,normalizedSyllabus,buildBins,pickModel});
 if(typeof window!=='undefined')window.SanabilExamDistribution=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();