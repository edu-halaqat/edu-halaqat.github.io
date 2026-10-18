'use strict';
/* Real UI contract of the teacher's shorthand Quran assessment commands.
 * No students, grades or server state are modified by this regression test.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('sanabil-voice.js','utf8');
class Element {
 constructor(tag,doc){
  this.tag=tag;this.doc=doc;this.children=[];this.events={};this.dataset={};
  this.attributes={};this.className='';this.disabled=false;this.hidden=false;
  this.isConnected=true;this.textContent='';this.value='';this.clicked=0;
  this.classList={
   add:name=>{if(!this.classList.contains(name))this.className+=' '+name},
   remove:name=>{this.className=this.className.split(/\s+/).filter(x=>x!==name).join(' ')},
   contains:name=>this.className.split(/\s+/).includes(name)
  };
 }
 append(...elements){for(const x of elements){this.children.push(x);x.parentNode=this}}
 replaceChildren(...elements){this.children=[];this.append(...elements)}
 setAttribute(key,val){this.attributes[key]=val}
 addEventListener(key,fn){this.events[key]=fn}
 dispatchEvent(event){this.changed=(this.changed||0)+1;this.events[event.type]?.(event)}
 scrollIntoView(){this.scrolled=(this.scrolled||0)+1}
 focus(){this.doc.activeElement=this}
 getBoundingClientRect(){return {top:110,bottom:650}}
 querySelector(selector){return this.lookup?.[selector]||null}
 querySelectorAll(selector){
  if(selector==='[data-grade-key]')return this.grades||[];
  if(selector==='[data-metric-count]')return this.metrics||[];
  if(selector==='[data-att-student],[data-tl-att]')return this.attendance||[];
  return [];
 }
 click(){this.clicked++;this.onclick?.();this.events.click?.({preventDefault(){},stopPropagation(){}})}
}
const doc={
 activeElement:null,
 createElement(tag){return new Element(tag,doc)},
 getElementById(){return null},
 querySelector(){return null}
};
doc.body=new Element('body',doc);
const Event=class {constructor(type){this.type=type}};
const window={innerHeight:760};
vm.runInNewContext(script,{window,document:doc,Event,console,Promise});
const api=window.SanabilVoice;
const names=['أحمد دحمان حسن','أحمد صالح','خالد العتيبي'];
const parserCases=[
 ['أحمد دحمان','navigate',i=>i.name==='احمد دحمان'],
 ['حاضر','attendance',i=>i.status==='present'&&i.target.scope==='current'],
 ['أحمد دحمان غائب بدون عذر','attendance',i=>i.status==='absent'&&i.reason==='unexcused'&&i.target.index===0],
 ['خالد العتيبي متأخر','attendance',i=>i.status==='late'&&i.target.index===2],
 ['مستأذن','attendance',i=>i.status==='excused'],
 ['تحضير الطلاب','attendance_all',i=>i.status==='present'],
 ['احفظ التحضير','attendance_save',()=>true],
 ['سجل الغائبين','unknown',()=>true],
 ['انتقل إلى الطالب أحمد دحمان','navigate',i=>i.name==='احمد دحمان'],
 ['الحفظ ممتاز','grade',i=>i.kind==='memorization'&&i.grade==='ممتاز'],
 ['الحفظ جيد جدا','grade',i=>i.kind==='memorization'&&i.grade==='جيد جدًا'],
 ['الدرس ممتاز','grade',i=>i.kind==='memorization'],
 ['جنب الدرس 5 شكوك','metric',i=>i.kind==='recentReview'&&i.metric==='doubts'&&i.count===5&&i.mode==='set'],
 ['التثبيت خمسة شكوك','metric',i=>i.kind==='recentReview'&&i.count===5],
 ['المراجعة القريبة ممتاز','grade',i=>i.kind==='recentReview'],
 ['المراجعة الصغرى جيد','grade',i=>i.kind==='recentReview'],
 ['المراجعة لم يحفظ','grade',i=>i.kind==='review'&&i.grade==='لم يحفظ'],
 ['المراجعة الكبرى ممتاز','grade',i=>i.kind==='review'],
 ['المراجعة 3 أخطاء و4 شكوك','metrics',i=>i.kind==='review'&&i.mode==='set'&&i.changes.length===2],
 ['أضف ثلاثة أخطاء وأربعة شكوك إلى المراجعة الكبرى','metrics',i=>i.kind==='review'&&i.mode==='add'&&i.changes[0].count===3&&i.changes[1].count===4],
 ['أضف شكين إلى المراجعة الصغرى','metric',i=>i.kind==='recentReview'&&i.mode==='add'&&i.count===2],
 ['جنب الدرس ٥ شكوك','metric',i=>i.count===5],
 ['أضف أخطاء وشكوك بدون تحديد أعداد','unknown',()=>true],
 ['الحفظ ممتاز و5 شكوك','unknown',()=>true],
 ['احفظ الحصيلة وأرسلها عبر واتساب','save',i=>i.share===true]
];
for(const [command,type,verify] of parserCases){
 const result=api.intentOf(command,names);
 assert.equal(result.type,type,'wrong intent for "'+command+'": '+JSON.stringify(result));
 assert(verify(result),'wrong target/value for "'+command+'"');
}
const box=new Element('section',doc),search=new Element('section',doc),cards=names.map(()=>new Element('article',doc));
box.lookup={'.sl-outcome-student-search':search,'[data-sanabil-voice]':null};
const allPresent=new Element('button',doc),saveAttendance=new Element('button',doc);
box.lookup['[data-action="all-present"],[data-action="tl-all-present"]']=allPresent;
box.lookup['[data-action="save-attendance"],[data-action="tl-save-attendance"]']=saveAttendance;
const data=(key,val,kind)=>{
 const element=new Element('button',doc);
 element.dataset.gradeKey=key;element.dataset.gradeValue=val;
 element.dataset.gradeStudent=kind;
 element.onclick=()=>{element.classList.add('active')};
 return element;
};
const gradeButtons=[
 data('memorization','ممتاز'),data('memorization','جيد جدًا'),
 data('recentReview','ممتاز'),data('recentReview','جيد'),
 data('review:plan-one','لم يحفظ'),data('review:plan-one','ممتاز')
];
cards[0].grades=gradeButtons;
function metric(key,field,value){
 const el=new Element('input',doc);
 el.dataset.metricKey=key;el.dataset.metricField=field;el.value=String(value);
 return el;
}
const smallDoubts=metric('recentReview','doubts',1);
const smallErrors=metric('recentReview','errors',0);
const largeErrors=metric('review:plan-one','errors',1);
const largeDoubts=metric('review:plan-one','doubts',1);
cards[0].metrics=[smallDoubts,smallErrors,largeErrors,largeDoubts];
const attendanceChoices=['present','late','excused','absent'].map(value=>{
 const button=new Element('button',doc);button.dataset.attValue=value;
 button.onclick=()=>{
  cards[0].attendance.forEach(b=>b.classList.remove('active'));
  button.classList.add('active');
 };
 return button;
});
cards[0].attendance=attendanceChoices;
const absence=new Element('select',doc);
cards[0].lookup={'[data-quran-absence-reason],[data-tl-absence-reason]':absence};

api.mount(box,{cards,names,ids:['s1','s2','s3']});
const panel=doc.body.children.find(x=>x.dataset.sanabilVoice==='true');
assert(panel?.parentNode===doc.body,'voice portal must be a direct body child above attendance');
assert(panel,'classroom command panel mounted');
const manual=panel.children.find(x=>x.className==='sl-voice-manual');
assert(manual&&manual.tag==='div','written commands cannot submit parent form');
const [field,execute]=manual.children;
assert.equal(execute.type,'button','written command must be independent button');
const detail=panel.children.find(x=>x.className==='sl-voice-command');
const status=panel.children.find(x=>x.attributes.role==='status');
function enter(command){
 field.value=command;execute.click();
 assert(status.textContent,'after command show feedback');
 return [...detail.children];
}
enter('أحمد دحمان');
assert(cards[0].scrolled>0,'bare student name navigates directly to that student');
const everyone=enter('تحضير الطلاب');
assert.equal(allPresent.clicked,1,'all-present command invokes platform all-present control');
const storeAttendance=enter('احفظ التحضير');
assert(saveAttendance.clicked>=2,'attendance is sent for saving automatically, and explicit save also works');
assert(status.textContent.includes('لا يعدّ مؤكدًا'),'saving request must not falsely claim stored data');
box.lookup['.sl-outcome-readonly']={textContent:'استعراض فقط: خارج وقت السماح'};
const denied=enter('الحفظ ممتاز');
assert(denied[0]?.textContent.includes('للعرض فقط'),'read-only grade command is blocked immediately');
assert(status.textContent.includes('لا يعدّ مؤكدًا'),'batch summary separates execution from server acknowledgement');
delete box.lookup['.sl-outcome-readonly'];
const present=enter('حاضر');
assert(attendanceChoices[0].classList.contains('active'),'present command must mark actual student attendance');
const late=enter('متأخر');
assert(attendanceChoices[1].classList.contains('active'),'late command must mark student late');
const permission=enter('مستأذن');
assert(attendanceChoices[2].classList.contains('active'),'excused command must mark student excused');
const explicitlyNamed=enter('أحمد دحمان غائب بعذر');
assert(explicitlyNamed[0].textContent.includes('أحمد دحمان'),'targeted absent command shows intended student');

assert.equal(absence.value,'excused','reason for named absence changes on student card');
const absent=enter('غائب بدون عذر');

assert(attendanceChoices[3].classList.contains('active'),'absence command must mark student absent');
assert.equal(absence.value,'unexcused','absence reason must be selected');
assert.equal(absence.changed,2,'both changes in absence reason must reach the draft handler');
// Restore present before assessing today's lesson, just as a teacher would.
enter('حاضر');
assert(attendanceChoices[0].classList.contains('active'));
const grade=enter('الحفظ ممتاز');
assert(grade.length>=1,'grade executes immediately without confirmation');
assert(grade[0].textContent.includes('أحمد دحمان'),'execution result shows target student name');

assert.equal(gradeButtons[0].clicked,1,'confirmed shorthand grade clicked proper memorization control');
const small=enter('جنب الدرس 5 شكوك');
assert(small[0].textContent.includes('5'),'teacher sees amount before applying');

assert.equal(smallDoubts.value,'5','bare counter means SET, not add five to current one');
assert.equal(smallDoubts.changed,1,'counter change dispatch persists student draft');
const incremental=enter('أضف شكين إلى المراجعة الصغرى');

assert.equal(smallDoubts.value,'7','explicit add increments existing value');
const major=enter('المراجعة لم يحفظ');

assert.equal(gradeButtons[4].clicked,1,'unqualified review edits major review only');
assert.equal(gradeButtons[2].clicked,0,'major review must NOT edit nearby review');
const compound=enter('المراجعة 3 أخطاء و4 شكوك');

assert.equal(largeErrors.value,'3');
assert.equal(largeDoubts.value,'4');
assert.equal(smallErrors.value,'0','major review must not modify nearby counter');
const ambiguous=enter('أحمد');
assert(/يطابق اكثر من طالب|يطابق أكثر من طالب|غير محدد/.test(ambiguous[0].textContent),'ambiguous name must not choose a student');

// One spoken turn can contain a student's name, attendance, Quran grades and counters.
const dictation=api.batchOf('أحمد دحمان، حاضر والحفظ ممتاز وجنب الدرس 5 شكوك، ثم المراجعة 3 أخطاء و4 شكوك',names);
assert.equal(dictation.length,5,'compound Arabic dictation must produce five commands');
assert.deepEqual(Array.from(dictation,x=>x.intent.type),['navigate','attendance','grade','metric','metrics']);
assert.equal(dictation[3].intent.kind,'recentReview');
assert.equal(dictation[4].intent.changes.length,2,'compound major-review counters stay atomic');
enter('أحمد دحمان، حاضر والحفظ ممتاز وجنب الدرس 5 شكوك');
assert(gradeButtons[0].clicked>=2,'batch executes grade automatically after student navigation');
assert.equal(smallDoubts.value,'5','batch applies recent-review count');
assert.equal(detail.children.some(x=>x.tag==='button'),false,'batch history must have no confirm or cancel button');
const gradeCountBeforeAmbiguous=gradeButtons[0].clicked;
const blocked=enter('أحمد، الحفظ ممتاز');
assert.equal(gradeButtons[0].clicked,gradeCountBeforeAmbiguous,'ambiguous student prevents carrying grade over from a prior student');
assert(blocked.some(x=>x.textContent.includes('تخطيت التعديل')),'blocked batch reports why grade was skipped');

console.log('PASS: natural Arabic commands, attendance and absence, bulk save trigger, read-only guard, Quran grading and verified counters');
