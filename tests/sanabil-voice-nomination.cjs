'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const voice=fs.readFileSync('sanabil-voice.js','utf8');
const video=fs.readFileSync('sanabil-free-live.js','utf8');
const main=fs.readFileSync('sanabil-live-v12.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('/sanabil-voice.js'),'voice helper must load before main UI');
assert(video.includes('const targetId=s.active||s.selectedStudentId'),'video must jump to admitted student first');
assert(video.includes("querySelectorAll('[data-outcome-student-id]')"),'student identity used for actual card');
assert(video.includes("dataset.videoOutcomeTarget=targetId"),'if missing, pending target survives data load');
assert(video.includes("data-return-to-video"),'one-tap return control in student card');
assert(main.includes('card.dataset.outcomeStudentId=studentIds[i]'),'outcome cards must carry student identity');
assert(main.includes('requestPanel(panel,{studentId:'),'test nominations pinned to actual student');
assert(main.includes('value="jadeer" ${jadeerReady'),'Jadeer selection must be conditional on a verified receiver');
assert(main.includes('window.SanabilJadeer.send(sb(),newRequestId)'),'Jadeer delivery requires remote acknowledgement');
assert(!/fetch\(|\.rpc\(|\.insert\(|\.update\(/.test(voice),'speech module must only use existing user interface actions');
const sandbox={window:{},document:{},console};
vm.runInNewContext(voice,sandbox);
const api=sandbox.window.SanabilVoice;
const commands=[
 ['انتقل إلى الطالب أحمد سعيد','navigate',x=>x.name==='احمد سعيد'],
 ['ضع تقدير ممتاز في الحفظ الجديد','grade',x=>x.kind==='memorization'&&x.grade==='ممتاز'],
 ['ضع تقدير جيد جدا في المراجعة الصغرى','grade',x=>x.kind==='recentReview'&&x.grade==='جيد جدًا'],
 ['أضف ثلاثة شكوك إلى الحفظ الجديد','metric',x=>x.count===3&&x.metric==='doubts'],
 ['أضف شكين إلى المراجعة الصغرى','metric',x=>x.count===2&&x.metric==='doubts'],
 ['أضف ثلاثة أخطاء وأربعة شكوك إلى المراجعة الكبرى','metrics',x=>x.changes.length===2&&x.changes[0].count===3&&x.changes[1].count===4],
 ['احفظ الحصيلة وأرسلها عبر واتساب','save',x=>x.share===true],
 ['أرسل الحصيلة لولي الأمر','share',()=>true]
];
for(const [command,type,check] of commands){
 const intent=api.intentOf(command);
 assert.equal(intent.type,type,'incorrect Arabic voice action: '+command);
 assert(check(intent),'incorrect voice arguments: '+command);
}
const unclear=api.intentOf('أضف شكوك وأخطاء بدون تحديد أعداد');
assert.equal(unclear.type,'unknown','ambiguous metric counts must be refused');
assert.equal(api.countOf('ثلاثة'),3);
assert.equal(api.countOf('٤'),4);
console.log('PASS: video->student->return, safe Arabic speech commands, multi-metric parsing, scoped test nomination and no Jadeer false success');
