'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('sanabil-live-v12.js','utf8');
const from=src.indexOf('const teacherDirectory=teachers=>'),until=src.indexOf('function bindScope(form,data,initial={})',from);
assert(from>0&&until>from,'Assignment helper functions not found');
const helpers=vm.runInNewContext(src.slice(from,until)+';({teacherDirectory,teachersForCircle,teacherAssignmentInfo})');
const teachers=[
 {id:'a',user_id:'account-a',full_name:'معلم أ',circle_id:'c1'},
 {id:'b',user_id:'account-b',full_name:'معلم ب',circle_id:'c1'},
 {id:'b-old',user_id:'account-b',full_name:'معلم ب',circle_id:'c2'},
 {id:'c',user_id:'account-c',full_name:'معلم ج',circle_id:'c2'},
 {id:'d',user_id:null,full_name:'معلم د',circle_id:'c3'}
];
const circles=[{id:'c1'},{id:'c2'},{id:'c3'}];
const data={teachers,circles,circleTeachers:[
 {circle_id:'c1',teacher_id:'a',active:true,is_primary:true},
 {circle_id:'c2',teacher_id:'c',active:true,is_primary:true}
]};
assert.equal(helpers.teachersForCircle(data,'c1').length,1);
assert.equal(helpers.teachersForCircle(data,'c1')[0].id,'a','use explicit link rather than obsolete direct teacher link');
assert.equal(helpers.teacherAssignmentInfo(data,'c1').legacyConflict,true,'alert when legacy direct roster has multiple');
assert.equal(helpers.teachersForCircle(data,'c2')[0].id,'c','do not override explicit assignment with legacy alias');
assert.equal(helpers.teachersForCircle(data,'c3').length,0,'unregistered imported teacher cannot be used for new assignments');
assert.equal(helpers.teacherDirectory(teachers).filter(x=>x.user_id==='account-b').length,1,'same user must appear once');
assert(src.includes("assign_circle_teacher_guarded"),'explicit guarded assignment action is required');
assert(src.includes("تعارض")||src.includes("التعارض"),'conflict handling should be visible');
assert(src.includes("الطالب مرتبط بمعلم سابق")||src.includes("هذا الطالب مرتبط بمعلم سابق"),'legacy student link must be protected');
const css=fs.readFileSync('sanabil-free-live.css','utf8');
assert(css.includes('sl-peer-floating')&&css.includes('pointer-events:none'),'the video itself should float without intercepting touch scrolling');
assert(!css.includes('.sl-peer-panel.sl-peer-compact'),'entire call card must no longer collapse on mobile');
assert(css.includes('sl-peer-videos video:nth-child(2)'),'teacher picture in picture required');
assert(src.includes('freeLiveDemoEnabled'),'video must remain admin-only until student identity verification');
console.log('PASS: verified teachers only, safe legacy preservation, deduplication by account, assignment guard and mobile video layout');
